import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import mongoose from "mongoose";
import app from "../app.js";
import { connectDatabases, disconnectDatabases } from "../db/index.js";
import { startWorker, stopWorker } from "../queues/worker.js";
import { Sensor } from "../models/sensor.model.js";
import { getMachineCoverage, COVERAGE_GATE_STATE } from "../services/coverage.service.js";
import { COVERAGE_RECENCY_WINDOW_SEC } from "../services/sensor-requirements.config.js";

/**
 * Adversarial Scope B.3 — coverage gating boundaries.
 *
 * Recency boundary (CHANNEL_MAX_AGE_SEC equivalent: COVERAGE_RECENCY_WINDOW_SEC,
 * default 900s), flickering coverage, MAX_SENSORS boundary, and deleting a
 * coverage-providing sensor mid-stream. Service-level (real Mongo docs) — the
 * HTTP-level gate behavior is already covered by coverage-gating.test.js.
 *
 * No server port needed (pure service layer).
 */

const env = {};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  await connectDatabases();
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) await c.deleteMany({});

  const { User } = await import("../models/user.models.js");
  const { Site } = await import("../models/site.model.js");
  const { Machine } = await import("../models/machine.model.js");

  env.user = await User.create({
    email: "advcover@factory.com",
    username: "advcover",
    password: "Password123!",
    isVerified: true,
  });
  env.site = await Site.create({ userId: env.user._id, name: "Coverage Plant", timezone: "UTC" });
  env.machine = await Machine.create({
    userId: env.user._id,
    siteId: env.site._id,
    assetId: "COV-1",
    name: "Coverage Motor",
    machineType: "motor", // required: temperature, vibration, current, rpm
    status: "unknown",
  });
});

afterAll(async () => {
  await disconnectDatabases();
});

const makeSensor = (type, name) =>
  Sensor.create({
    userId: env.user._id,
    siteId: env.site._id,
    machineId: env.machine._id,
    name,
    type,
    lastReadingAt: new Date(),
  });

describe("adversarial coverage — recency boundary", () => {
  it("a sensor exactly AT the recency window boundary still counts as working", async () => {
    const s = await makeSensor("temperature", "temp boundary");
    const now = new Date();
    // ageSec == recencyWindowSec → working (ageSec <= window).
    await Sensor.updateOne(
      { _id: s._id },
      { $set: { lastReadingAt: new Date(now.getTime() - COVERAGE_RECENCY_WINDOW_SEC * 1000) } }
    );
    const coverage = await getMachineCoverage(env.machine._id, { userFilter: { userId: env.user._id }, now });
    expect(coverage.sensorStatus.find((x) => x.id === String(s._id)).working).toBe(true);
  });

  it("a sensor one second PAST the window stops counting (channel becomes missing)", async () => {
    const s = await makeSensor("vibration", "vib boundary");
    const now = new Date();
    await Sensor.updateOne(
      { _id: s._id },
      { $set: { lastReadingAt: new Date(now.getTime() - (COVERAGE_RECENCY_WINDOW_SEC + 1) * 1000) } }
    );
    const coverage = await getMachineCoverage(env.machine._id, { userFilter: { userId: env.user._id }, now });
    expect(coverage.sensorStatus.find((x) => x.id === String(s._id)).working).toBe(false);
    expect(coverage.missing).toContain("vibration");
    expect(coverage.isReady).toBe(false);
  });

  it("a channel flickering covered/uncovered flips the gate each time (no sticky state)", async () => {
    // Dedicated machine with all four required sensors attached, so the only
    // variable is the freshness of `current` (a never-attached channel would
    // dominate the state as GATE_CLOSED and mask the flicker).
    const { Machine } = await import("../models/machine.model.js");
    const flickerMachine = await Machine.create({
      userId: env.user._id,
      siteId: env.site._id,
      assetId: "COV-FLICKER",
      name: "Flicker Motor",
      machineType: "motor",
      status: "unknown",
    });
    const sensors = {};
    for (const type of ["temperature", "vibration", "current", "rpm"]) {
      sensors[type] = await Sensor.create({
        userId: env.user._id,
        siteId: env.site._id,
        machineId: flickerMachine._id,
        name: `flicker ${type}`,
        type,
        lastReadingAt: new Date(),
      });
    }
    const filter = { userId: env.user._id };
    const fresh = new Date();
    const stale = new Date(Date.now() - (COVERAGE_RECENCY_WINDOW_SEC + 60) * 1000);

    expect((await getMachineCoverage(flickerMachine._id, { userFilter: filter })).gateState).toBe(
      COVERAGE_GATE_STATE.FULLY_COVERED
    );

    await Sensor.updateOne({ _id: sensors.current._id }, { $set: { lastReadingAt: stale } });
    const staleState = await getMachineCoverage(flickerMachine._id, { userFilter: filter });
    expect(staleState.gateState).toBe(COVERAGE_GATE_STATE.PARTIAL_REPORTING);
    expect(staleState.missing).toContain("current");

    await Sensor.updateOne({ _id: sensors.current._id }, { $set: { lastReadingAt: fresh } });
    const freshState = await getMachineCoverage(flickerMachine._id, { userFilter: filter });
    expect(freshState.gateState).toBe(COVERAGE_GATE_STATE.FULLY_COVERED);
    expect(freshState.missing).not.toContain("current");
  });
});

describe("adversarial coverage — MAX_SENSORS boundary", () => {
  it("creating sensors up to the limit succeeds; one over the limit → 409", async () => {
    const { createSensor } = await import("../services/sensor.service.js");
    const MAX = Number(process.env.MAX_SENSORS || 20);

    // Count existing sensors for this user, then fill to exactly MAX.
    const existing = await Sensor.countDocuments({ userId: env.user._id });
    const toAdd = MAX - existing;
    const created = [];
    try {
      for (let i = 0; i < toAdd; i += 1) {
        created.push(await createSensor(env.machine._id, { name: `filler ${i}`, type: "vibration" }, env.user._id));
      }
      // Exactly at the limit: one more must fail with 409...
      await expect(
        createSensor(env.machine._id, { name: "over the line", type: "vibration" }, env.user._id)
      ).rejects.toMatchObject({ statusCode: 409 });
      // ...and the failed create must not have been persisted.
      expect(await Sensor.countDocuments({ userId: env.user._id })).toBe(MAX);
    } finally {
      // Keep the suite small: remove the fillers again.
      await Sensor.deleteMany({ _id: { $in: created.map((s) => s._id) } });
    }
  });
});

describe("adversarial coverage — deletion mid-stream", () => {
  it("deleting the only sensor for a required channel closes the gate for NEW events", async () => {
    const { deleteSensor } = await import("../services/sensor.service.js");
    const s = await makeSensor("rpm", "rpm doomed");
    const filter = { userId: env.user._id };

    const before = await getMachineCoverage(env.machine._id, { userFilter: filter });
    expect(before.missing).not.toContain("rpm");

    await deleteSensor(s.sensorId, filter);

    const after = await getMachineCoverage(env.machine._id, { userFilter: filter });
    expect(after.missing).toContain("rpm");
    expect(after.gateState).toBe(COVERAGE_GATE_STATE.GATE_CLOSED); // no rpm sensor attached at all
    expect(after.isReady).toBe(false);
    void wait;
  });
});
