import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import mongoose from "mongoose";
import { connectDatabases, disconnectDatabases } from "../db/index.js";
import { getRedis } from "../db/redis.js";
import { User } from "../models/user.model.js";
import { Site } from "../models/site.model.js";
import { Machine } from "../models/machine.model.js";
import { Incident } from "../models/incident.model.js";
import Investigation from "../models/investigation.model.js";
import { Event } from "../models/event.model.js";
import { startInvestigation, buildInvestigationTrace, getInvestigationById } from "../services/investigation.service.js";
import { getInvestigationQueue, closeInvestigationQueue } from "../queues/investigation.queue.js";
import { startInvestigationWorker, stopInvestigationWorker } from "../queues/investigation.worker.js";

const nightDate = "2026-01-02";
const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const seeded = {};
let queue;

const makeIncident = (createdAt = "2026-01-02T12:00:00.000Z") =>
  Incident.create({
    userId: seeded.user._id,
    siteId: seeded.site._id,
    machineId: seeded.machine._id,
    type: "anomaly",
    severity: "warning",
    title: `Investigation test ${suffix}`,
    reason: "test signal",
    createdAt: new Date(createdAt),
  });

const waitFor = async (fn, timeout = 10000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await fn()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("timed out waiting for investigation state");
};

beforeAll(async () => {
  process.env.INVESTIGATION_QUEUE_NAME = `investigations_test_${suffix}`;
  await connectDatabases();
  seeded.user = await User.create({
    email: `investigation-${suffix}@factory.com`,
    username: `investigation_${suffix}`,
    password: "Password123!",
  });
  seeded.site = await Site.create({ userId: seeded.user._id, name: `Investigation ${suffix}`, timezone: "UTC" });
  seeded.machine = await Machine.create({
    userId: seeded.user._id,
    siteId: seeded.site._id,
    assetId: `INV-${suffix}`,
    name: "Investigation machine",
    machineType: "motor",
  });
  queue = getInvestigationQueue();
  await queue.pause();
});

afterAll(async () => {
  await stopInvestigationWorker();
  if (queue) {
    await queue.resume().catch(() => {});
    await queue.obliterate({ force: true }).catch(() => {});
  }
  await closeInvestigationQueue();
  await Promise.all([
    Event.deleteMany({ userId: seeded.user?._id }),
    Investigation.deleteMany({ incidentId: { $in: await Incident.find({ userId: seeded.user?._id }).distinct("_id") } }),
    Incident.deleteMany({ userId: seeded.user?._id }),
    Machine.deleteMany({ userId: seeded.user?._id }),
    Site.deleteMany({ userId: seeded.user?._id }),
    User.deleteOne({ _id: seeded.user?._id }),
  ]);
  await disconnectDatabases();
});

describe("investigation start durability", () => {
  it("concurrent starts create one document and one deterministic dispatch per incident", async () => {
    const incident = await makeIncident();
    await queue.obliterate({ force: true });
    const results = await Promise.all([
      startInvestigation({ userId: seeded.user._id, nightDate }),
      startInvestigation({ userId: seeded.user._id, nightDate }),
    ]);

    expect(await Investigation.countDocuments({ incidentId: incident._id, nightDate })).toBe(1);
    expect(new Set(results.flatMap((result) => result.jobIds)).size).toBe(1);
    expect(await queue.getJob(results[0].jobIds[0])).toBeTruthy();
    expect(["waiting", "prioritized", "paused"]).toContain(
      await (await queue.getJob(results[0].jobIds[0])).getState(),
    );
  });

  it("retries queued documents after a partial dispatch failure without creating more documents", async () => {
    const retryNight = "2026-01-03";
    const incident = await makeIncident("2026-01-03T13:00:00.000Z");
    const second = await Incident.create({
      userId: seeded.user._id,
      siteId: seeded.site._id,
      machineId: seeded.machine._id,
      type: "anomaly",
      severity: "minor",
      title: `Investigation test 2 ${suffix}`,
      reason: "test signal",
      createdAt: new Date("2026-01-03T14:00:00.000Z"),
    });
    let attempts = 0;
    const flakyDispatch = async () => {
      attempts += 1;
      if (attempts === 2) throw new Error("Redis unavailable");
    };
    await expect(startInvestigation({ userId: seeded.user._id, nightDate: retryNight, dispatch: flakyDispatch })).rejects.toThrow("Redis unavailable");
    expect(await Investigation.countDocuments({ incidentId: { $in: [incident._id, second._id] }, nightDate: retryNight })).toBe(2);
    expect(await Investigation.countDocuments({ incidentId: { $in: [incident._id, second._id] }, nightDate: retryNight, status: "queued" })).toBe(2);

    const recovered = await startInvestigation({
      userId: seeded.user._id,
      nightDate: retryNight,
      dispatch: async () => {},
    });
    expect(recovered.jobIds).toHaveLength(2);
    expect(await Investigation.countDocuments({ incidentId: { $in: [incident._id, second._id] }, nightDate: retryNight })).toBe(2);
  });
});

describe("investigation worker evidence", () => {
  it("does not expose an investigation to another user's read scope", async () => {
    const incident = await makeIncident("2026-01-02T09:00:00.000Z");
    const doc = await Investigation.create({ incidentId: incident._id, nightDate, status: "queued" });
    const otherUser = await User.create({ email: `reader-${suffix}@factory.com`, username: `reader_${suffix}`, password: "Password123!" });
    await expect(getInvestigationById(String(doc._id), { userId: otherUser._id })).rejects.toThrow("Investigation not found");
    await User.deleteOne({ _id: otherUser._id });
  });

  it("keeps another user's event out of aggregation and completes queued work", async () => {
    const otherUser = await User.create({ email: `other-${suffix}@factory.com`, username: `other_${suffix}`, password: "Password123!" });
    const incident = await makeIncident("2026-01-02T15:00:00.000Z");
    await Event.create({ userId: seeded.user._id, siteId: seeded.site._id, machineId: seeded.machine._id, sensorId: new mongoose.Types.ObjectId(), type: "sensor_reading", timestamp: new Date("2026-01-02T10:00:00Z"), values: { temperature: 10 }, idempotencyKey: `a-${suffix}` });
    await Event.create({ userId: otherUser._id, siteId: seeded.site._id, machineId: seeded.machine._id, sensorId: new mongoose.Types.ObjectId(), type: "sensor_reading", timestamp: new Date("2026-01-02T11:00:00Z"), values: { temperature: 999 }, idempotencyKey: `b-${suffix}` });
    const trace = await buildInvestigationTrace({ incidentId: incident._id, nightDate });
    expect(trace.events).toBe(1);
    expect(trace.stats[0]).toMatchObject({ min: 10, max: 10, samples: 1 });

    const doc = await Investigation.create({ incidentId: incident._id, nightDate, status: "queued" });
    await startInvestigationWorker(getRedis());
    await queue.resume();
    await queue.add("investigate", { investigationId: String(doc._id), incidentId: String(incident._id), nightDate, dispatchedAt: new Date().toISOString() }, { jobId: String(doc._id), attempts: 1 });
    await waitFor(async () => (await Investigation.findById(doc._id)).status === "complete");
    expect((await Investigation.findById(doc._id)).status).toBe("complete");
    await User.deleteOne({ _id: otherUser._id });
  });
});
