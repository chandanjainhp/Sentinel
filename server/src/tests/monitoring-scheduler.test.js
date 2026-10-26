import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import mongoose from "mongoose";
import { connectDatabases, disconnectDatabases } from "../db/index.js";
import { User } from "../models/user.model.js";
import { Site } from "../models/site.model.js";
import { Machine } from "../models/machine.model.js";
import { Sensor } from "../models/sensor.model.js";
import { Event } from "../models/event.model.js";
import { Prediction } from "../models/prediction.model.js";
import { Incident } from "../models/incident.model.js";
import Investigation from "../models/investigation.model.js";
import { IncidentConfiguration } from "../models/incidentConfiguration.model.js";
import OvernightHealthRun from "../models/overnight-health-run.model.js";
import { processOvernightHealthChecks } from "../services/overnight-health.service.js";
import { closeInvestigationQueue } from "../queues/investigation.queue.js";

/**
 * Overnight Health Checker driven by persisted IncidentConfiguration.
 * Uses an isolated database + Redis DB; no BullMQ workers are started.
 */

const swapPath = (url, path) => {
  const parsed = new URL(url);
  parsed.pathname = path;
  return parsed.toString();
};

const makeUser = (name) =>
  User.create({
    email: `${name}@scheduler.test`,
    username: name,
    password: "Password123!",
  });

const makeSite = async (user, name, timezone, startTime, endTime, enabled = true) => {
  const site = await Site.create({
    userId: user._id,
    name,
    timezone,
    monitoringEnabled: enabled,
    monitoringStartTime: startTime,
    monitoringEndTime: endTime,
  });
  await IncidentConfiguration.create({
    userId: user._id,
    siteId: site._id,
    enabled,
    timezone,
    startTime,
    endTime,
    scheduleType: "daily",
  });
  return site;
};

const runsFor = (site) => OvernightHealthRun.find({ siteId: site._id }).lean();

beforeAll(async () => {
  process.env.MONGODB_URL = swapPath(
    process.env.MONGODB_URL,
    "/sentinel_ci_scheduler"
  );
  process.env.REDIS_URL = swapPath(process.env.REDIS_URL, "/9");
  await connectDatabases();
  await mongoose.connection.dropDatabase();
});

afterAll(async () => {
  await closeInvestigationQueue().catch(() => {});
  await disconnectDatabases();
});

describe("overnight health scheduler driven by configuration", () => {
  it("skips sites whose configuration is disabled", async () => {
    const user = await makeUser("sched_disabled");
    const site = await makeSite(user, "Disabled Plant", "UTC", "00:00", "09:00", false);

    await processOvernightHealthChecks(new Date("2026-10-20T04:00:00Z"));

    expect(await OvernightHealthRun.countDocuments({ siteId: site._id })).toBe(0);
  });

  it("uses the configured time zone and window, and never duplicates a reporting date", async () => {
    const user = await makeUser("sched_ny");
    const site = await makeSite(
      user,
      "New York Plant",
      "America/New_York",
      "22:00",
      "06:00"
    );
    await Machine.create({
      userId: user._id,
      siteId: site._id,
      assetId: "NY-1",
      name: "NY Motor",
      machineType: "Motor",
    });

    const inside = new Date("2026-10-21T05:00:00Z");
    await Promise.all([
      processOvernightHealthChecks(inside),
      processOvernightHealthChecks(inside),
    ]);
    await processOvernightHealthChecks(inside);

    const runs = await runsFor(site);
    expect(runs.length).toBe(1);
    expect(runs[0].reportingDate).toBe("2026-10-20");
    expect(runs[0].timezone).toBe("America/New_York");
    expect(runs[0].windowStartAt.toISOString()).toBe("2026-10-21T02:00:00.000Z");
    expect(runs[0].windowEndAt.toISOString()).toBe("2026-10-21T10:00:00.000Z");
    expect(runs[0].status).toBe("running");

    // Restart recovery: the window is now closed and no current window
    // exists. The unfinished run is still finalised.
    await processOvernightHealthChecks(new Date("2026-10-21T11:00:00Z"));

    const completed = await OvernightHealthRun.findOne({ siteId: site._id }).lean();
    expect(completed.status).toBe("completed_with_warnings");
    expect(completed.completedAt).toBeTruthy();
    expect(completed.reportGeneratedAt).toBeTruthy();
    expect(completed.incidents).toEqual([]);
    expect(completed.investigationsQueued).toBe(true);
    expect(completed.summary.machinesEvaluated).toBe(1);
    expect(await OvernightHealthRun.countDocuments({ siteId: site._id })).toBe(1);
  });

  it("recovers a failed run within the lookback window and stops at the retry cap", async () => {
    const retryUser = await makeUser("sched_retry");
    const retrySite = await makeSite(
      retryUser,
      "Retry Plant",
      "UTC",
      "00:00",
      "01:00"
    );
    const failed = await OvernightHealthRun.create({
      userId: retryUser._id,
      siteId: retrySite._id,
      reportingDate: "2026-10-20",
      timezone: "UTC",
      windowStartAt: new Date("2026-10-20T00:00:00Z"),
      windowEndAt: new Date("2026-10-20T01:00:00Z"),
      status: "failed",
      retryCount: 1,
      errorDetails: ["transient ML failure"],
    });

    await processOvernightHealthChecks(new Date("2026-10-21T10:00:00Z"));

    const recovered = await OvernightHealthRun.findById(failed._id).lean();
    expect(recovered.status).toBe("completed");
    expect(recovered.retryCount).toBe(1);
    expect(recovered.incidents).toEqual([]);

    const cappedUser = await makeUser("sched_capped");
    const cappedSite = await makeSite(
      cappedUser,
      "Capped Plant",
      "UTC",
      "00:00",
      "01:00"
    );
    const capped = await OvernightHealthRun.create({
      userId: cappedUser._id,
      siteId: cappedSite._id,
      reportingDate: "2026-10-20",
      timezone: "UTC",
      windowStartAt: new Date("2026-10-20T00:00:00Z"),
      windowEndAt: new Date("2026-10-20T01:00:00Z"),
      status: "failed",
      retryCount: 3,
      errorDetails: ["permanent failure"],
    });

    await processOvernightHealthChecks(new Date("2026-10-21T10:00:00Z"));

    const stillFailed = await OvernightHealthRun.findById(capped._id).lean();
    expect(stillFailed.status).toBe("failed");
    expect(stillFailed.retryCount).toBe(3);
  });

  it("persists a report with incident evidence, Argus explanation and investigation links", async () => {
    const user = await makeUser("sched_report");
    const site = await makeSite(user, "Report Plant", "UTC", "00:00", "09:00");
    const machine = await Machine.create({
      userId: user._id,
      siteId: site._id,
      assetId: "RPT-1",
      name: "Report Motor",
      machineType: "Motor",
    });
    const sensor = await Sensor.create({
      userId: user._id,
      siteId: site._id,
      machineId: machine._id,
      name: "Report Vibration",
      type: "vibration",
      lastReadingAt: new Date("2026-10-22T04:00:00Z"),
    });
    const readingAt = new Date("2026-10-22T03:30:00Z");
    await Event.create({
      userId: user._id,
      siteId: site._id,
      machineId: machine._id,
      sensorId: sensor._id,
      type: "sensor_reading",
      timestamp: readingAt,
      values: { vibration: 8.2 },
      source: "gateway",
      idempotencyKey: "sched-report-event-1",
      payloadHash: "sched-report-payload-1",
    });
    const prediction = await Prediction.create({
      userId: user._id,
      siteId: site._id,
      machineId: machine._id,
      model: "lstm_autoencoder",
      modelVersion: "0.1.0+test",
      timestamp: readingAt,
      rulValue: null,
      rulUnit: null,
      anomalyScore: 0.93,
      faultProbability: 0.71,
      faultType: "bearing_wear",
      confidence: 0.92,
      evidence: { windowSize: 60, methods: {} },
    });
    const incident = await Incident.create({
      userId: user._id,
      siteId: site._id,
      machineId: machine._id,
      predictionId: prediction._id,
      type: "fault_risk",
      severity: "critical",
      title: "CRITICAL: Report Motor - bearing wear",
      reason: "Anomaly score 0.93 with fault type bearing_wear",
      status: "open",
      createdAt: readingAt,
      evidence: {
        anomalyScore: 0.93,
        faultProbability: 0.71,
        faultType: "bearing_wear",
        predictionId: prediction.predictionId,
      },
      explanation: {
        summary: "Bearing wear detected from sustained vibration.",
        likelyCause: "Outer-race bearing degradation",
        recommendedAction: "Inspect the drive-end bearing before the next shift.",
        source: "fallback",
        status: "ready",
        urgency: "now",
      },
    });
    // timestamps: true routes createdAt updates to $setOnInsert, so the
    // historic createdAt must be passed at creation, not via $set.

    const inside = new Date("2026-10-22T04:00:00Z");
    await processOvernightHealthChecks(inside);

    const running = await OvernightHealthRun.findOne({ siteId: site._id }).lean();
    expect(running).not.toBeNull();
    expect(running.status).toBe("running");
    expect(running.incidents.length).toBe(1);
    expect(running.incidents[0].incidentId).toBe(incident.incidentId);
    expect(running.incidents[0].evidence.anomalyScore).toBeCloseTo(0.93);
    expect(running.incidents[0].explanation.likelyCause).toMatch(/bearing/i);

    await processOvernightHealthChecks(new Date("2026-10-22T10:00:00Z"));

    const completed = await OvernightHealthRun.findOne({ siteId: site._id }).lean();
    expect(completed.status.startsWith("completed")).toBe(true);
    expect(completed.reportGeneratedAt).toBeTruthy();
    expect(completed.incidents[0].explanation.recommendedAction).toMatch(/bearing/i);
    expect(completed.investigationsQueued).toBe(true);
    expect(completed.investigationIds.length).toBe(1);

    const investigation = await Investigation.findById(
      completed.investigationIds[0]
    ).lean();
    expect(investigation).not.toBeNull();
    expect(String(investigation.incidentId)).toBe(String(incident._id));
    expect(investigation.nightDate).toBe("2026-10-22");
  });

  it("records a clear failure reason when evaluation throws and retries on the next tick", async () => {
    const user = await makeUser("sched_failure");
    const site = await makeSite(user, "Failure Plant", "UTC", "00:00", "09:00");
    await Machine.create({
      userId: user._id,
      siteId: site._id,
      assetId: "FAIL-1",
      name: "Failure Motor",
      machineType: "Motor",
    });

    const inside = new Date("2026-10-23T04:00:00Z");
    const originalFind = Machine.find;
    Machine.find = () => {
      throw new Error("simulated database outage");
    };
    try {
      await processOvernightHealthChecks(inside);
    } finally {
      Machine.find = originalFind;
    }

    const failed = await OvernightHealthRun.findOne({ siteId: site._id }).lean();
    expect(failed.status).toBe("failed");
    expect(failed.retryCount).toBe(1);
    expect(failed.errorDetails.join(" ")).toMatch(/simulated database outage/);

    await processOvernightHealthChecks(inside);

    const retried = await OvernightHealthRun.findOne({ siteId: site._id }).lean();
    expect(retried.status).toBe("running");
    expect(retried.retryCount).toBe(1);
  });
});
