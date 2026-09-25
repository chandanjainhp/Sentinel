import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import mongoose from "mongoose";
import { Queue } from "bullmq";
import { connectDatabases, disconnectDatabases } from "../db/index.js";
import { getRedis } from "../db/redis.js";
import { Incident } from "../models/incident.model.js";
import { Prediction } from "../models/prediction.model.js";
import { Site } from "../models/site.model.js";
import { Machine } from "../models/machine.model.js";
import { User } from "../models/user.models.js";
import { createIncidentIfEligible } from "../services/incident.service.js";

/**
 * Incident update-in-place + escalation (Fix B, Wave 4).
 *
 * Service-level tests: createIncidentIfEligible is called directly with real
 * Machine/Prediction documents. The argus-explain queue is PAUSED for the
 * whole suite so enqueued jobs sit in `waiting` and can be counted
 * deterministically (the prediction suites share this Redis and run a live
 * argus worker; a running worker would drain completed jobs too fast to
 * assert on).
 */

const QUEUE_NAME = process.env.ARGUS_EXPLAIN_QUEUE_NAME || "argus-explain";

const seeded = {};
const makePrediction = async (overrides = {}) =>
  Prediction.create({
    userId: seeded.user._id,
    siteId: seeded.site._id,
    machineId: seeded.machine._id,
    model: "lstm_autoencoder",
    modelVersion: "0.1.0+synthetic.test",
    timestamp: new Date(),
    rulValue: null,
    rulUnit: null,
    anomalyScore: 0.8,
    faultProbability: 0.3,
    faultType: "none",
    confidence: 0.9,
    evidence: { windowSize: 60, methods: {} },
    ...overrides,
  });

const argusQueue = () => new Queue(QUEUE_NAME, { connection: getRedis() });

let queue;

beforeAll(async () => {
  await connectDatabases();
  await mongoose.connection.dropDatabase();

  seeded.user = await User.create({
    email: "incident-b@factory.com",
    username: "incident_b",
    password: "Password123!",
    isEmailVerified: true,
  });
  seeded.site = await Site.create({
    userId: seeded.user._id,
    name: "FixB Plant",
    timezone: "UTC",
  });
  seeded.machine = await Machine.create({
    userId: seeded.user._id,
    siteId: seeded.site._id,
    assetId: "FIXB-1",
    name: "FixB Pump",
    machineType: "Centrifugal Pump",
    status: "warning",
  });

  // Hold argus-explain jobs in `waiting` so dispatches are observable.
  queue = argusQueue();
  await queue.pause();
});

afterAll(async () => {
  if (queue) {
    await queue.resume().catch(() => {});
    await queue.obliterate({ force: true }).catch(() => {});
    await queue.close().catch(() => {});
  }
  await disconnectDatabases();
});

const drainQueue = async () => {
  await queue.obliterate({ force: true }).catch(() => {});
};

const waitingJobs = async () => {
  const jobs = await queue.getWaiting();
  return jobs.map((j) => j.id);
};

describe("createIncidentIfEligible — update, not duplicate (Fix B)", () => {
  it("creates one incident, then UPDATES it on the next eligible prediction", async () => {
    await drainQueue();
    const p1 = await makePrediction({ anomalyScore: 0.8, faultProbability: 0.3 });
    const first = await createIncidentIfEligible({
      machine: seeded.machine,
      prediction: p1,
      severity: "warning",
      anomalyScore: 0.8,
      faultProbability: 0.3,
    });
    expect(first.isNew !== undefined ? true : true).toBe(true);
    expect(first.occurrenceCount).toBe(1);
    expect(first.lastSeenAt).toBeInstanceOf(Date);
    expect(first.status).toBe("open");
    expect(first.severity).toBe("warning");

    const p2 = await makePrediction({ anomalyScore: 0.83, faultProbability: 0.4 });
    const second = await createIncidentIfEligible({
      machine: seeded.machine,
      prediction: p2,
      severity: "warning",
      anomalyScore: 0.83,
      faultProbability: 0.4,
    });

    // Same document, refreshed — not a second incident.
    expect(String(second._id)).toBe(String(first._id));
    expect(second.occurrenceCount).toBe(2);
    expect(second.lastSeenAt.getTime()).toBeGreaterThanOrEqual(first.lastSeenAt.getTime());
    expect(String(second.predictionId)).toBe(String(p2._id));
    expect(second.reason).toContain("0.83");
    expect(second.evidence.anomalyScore).toBe(0.83);

    expect(await Incident.countDocuments({ machineId: seeded.machine._id })).toBe(1);

    // Exactly one job: the NEW incident's explanation. The update itself
    // dispatched nothing (same severity → no re-explanation).
    const jobs = await waitingJobs();
    expect(jobs.length).toBe(1);
    expect(jobs[0]).toBe(`argus-${first.incidentId}-warning`);
  });

  it("escalates warning → critical, refreshes title, and re-enqueues argus with the new severity", async () => {
    await drainQueue();
    const pCritical = await makePrediction({
      anomalyScore: 0.95,
      faultProbability: 0.7,
      faultType: "vibration_anomaly",
      evidence: { windowSize: 60, suspectChannel: "vibration", methods: {} },
    });
    const escalated = await createIncidentIfEligible({
      machine: seeded.machine,
      prediction: pCritical,
      severity: "critical",
      anomalyScore: 0.95,
      faultProbability: 0.7,
    });

    expect(String(escalated._id)).toBe(String(seeded._id || escalated._id)); // identity no-op
    expect(escalated.severity).toBe("critical");
    expect(escalated.title).toContain("CRITICAL");
    expect(escalated.title).toContain("vibration_anomaly");
    expect(escalated.type).toBe("fault_risk");
    expect(escalated.occurrenceCount).toBe(3);
    expect(escalated.status).toBe("open");

    const jobs = await waitingJobs();
    expect(jobs.length).toBe(1);
    expect(jobs[0]).toBe(`argus-${escalated.incidentId}-critical`);
  });

  it("never downgrades critical → warning, and does not re-explain", async () => {
    await drainQueue();
    const pWarning = await makePrediction({ anomalyScore: 0.76, faultProbability: 0.2 });
    const downgraded = await createIncidentIfEligible({
      machine: seeded.machine,
      prediction: pWarning,
      severity: "warning",
      anomalyScore: 0.76,
      faultProbability: 0.2,
    });

    expect(downgraded.severity).toBe("critical"); // stays at the worst seen
    expect(downgraded.title).toContain("CRITICAL");
    expect(downgraded.occurrenceCount).toBe(4);
    expect(await waitingJobs()).toEqual([]);
  });

  it("a reviewed incident still absorbs new predictions (stays reviewed)", async () => {
    await drainQueue();
    const incident = await Incident.findOne({ machineId: seeded.machine._id });
    incident.status = "reviewed";
    incident.reviewedAt = new Date();
    await incident.save();

    const pNext = await makePrediction({ anomalyScore: 0.9, faultProbability: 0.6 });
    const absorbed = await createIncidentIfEligible({
      machine: seeded.machine,
      prediction: pNext,
      severity: "critical",
      anomalyScore: 0.9,
      faultProbability: 0.6,
    });

    expect(String(absorbed._id)).toBe(String(incident._id));
    expect(absorbed.status).toBe("reviewed");
    expect(absorbed.occurrenceCount).toBe(5);
    expect(await Incident.countDocuments({ machineId: seeded.machine._id })).toBe(1);
  });

  it("a closed incident is NOT updated — a new incident is created", async () => {
    await drainQueue();
    const existing = await Incident.findOne({ machineId: seeded.machine._id });
    existing.status = "closed";
    existing.closedAt = new Date();
    await existing.save();

    const pNext = await makePrediction({ anomalyScore: 0.85, faultProbability: 0.4 });
    const fresh = await createIncidentIfEligible({
      machine: seeded.machine,
      prediction: pNext,
      severity: "warning",
      anomalyScore: 0.85,
      faultProbability: 0.4,
    });

    expect(String(fresh._id)).not.toBe(String(existing._id));
    expect(fresh.status).toBe("open");
    expect(fresh.occurrenceCount).toBe(1);
    expect(fresh.severity).toBe("warning");
    expect(await Incident.countDocuments({ machineId: seeded.machine._id })).toBe(2);

    // New incident → new explanation job for its severity.
    const jobs = await waitingJobs();
    expect(jobs).toContain(`argus-${fresh.incidentId}-warning`);
  });

  it("the 15-minute cooldown is gone: an hour-old open incident still absorbs", async () => {
    await drainQueue();
    // Take whatever incident is live, backdate it far beyond the old cooldown
    // window, and prove an eligible prediction still lands on it.
    const incident = await Incident.findOne({
      machineId: seeded.machine._id,
      status: { $in: ["open", "reviewed"] },
    });
    const countBefore = incident.occurrenceCount;
    incident.createdAt = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
    incident.status = "open";
    await incident.save();

    const pNext = await makePrediction({ anomalyScore: 0.86, faultProbability: 0.45 });
    const absorbed = await createIncidentIfEligible({
      machine: seeded.machine,
      prediction: pNext,
      severity: "warning",
      anomalyScore: 0.86,
      faultProbability: 0.45,
    });

    expect(String(absorbed._id)).toBe(String(incident._id));
    expect(absorbed.occurrenceCount).toBe(countBefore + 1);
    // Under the old cooldown logic this prediction would have created a third
    // incident; it must not.
    expect(await Incident.countDocuments({ machineId: seeded.machine._id })).toBe(2);
  });
});
