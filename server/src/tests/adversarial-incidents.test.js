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
 * Adversarial Scope B.4 — incident lifecycle races and ordering.
 *
 * The argus-explain queue is paused so dispatches are countable (same trick
 * as incident-update.test.js — the shared Redis runs a live argus worker).
 */

const QUEUE_NAME = process.env.ARGUS_EXPLAIN_QUEUE_NAME || "argus-explain";
const env = {};
let queue;

const makePrediction = async (overrides = {}) =>
  Prediction.create({
    userId: env.user._id,
    siteId: env.site._id,
    machineId: env.machine._id,
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

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  await connectDatabases();
  await mongoose.connection.dropDatabase();

  env.user = await User.create({
    email: "advinc@factory.com",
    username: "advinc",
    password: "Password123!",
    isVerified: true,
  });
  env.site = await Site.create({ userId: env.user._id, name: "Incident Plant", timezone: "UTC" });
  env.machine = await Machine.create({
    userId: env.user._id,
    siteId: env.site._id,
    assetId: "INC-1",
    name: "Incident Motor",
    machineType: "motor",
    status: "warning",
  });
  // Machines on other sites, for the close-vs-new and ordering tests.
  env.machine2 = await Machine.create({
    userId: env.user._id,
    siteId: env.site._id,
    assetId: "INC-2",
    name: "Incident Motor 2",
    machineType: "motor",
    status: "warning",
  });

  queue = new Queue(QUEUE_NAME, { connection: getRedis() });
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

describe("adversarial incidents — concurrency race (create vs update)", () => {
  it("two concurrent warning predictions for the SAME machine produce exactly ONE open incident", async () => {
    const [p1, p2] = await Promise.all([
      makePrediction({ anomalyScore: 0.8 }),
      makePrediction({ anomalyScore: 0.82 }),
    ]);

    const results = await Promise.all([
      createIncidentIfEligible({ machine: env.machine, prediction: p1, severity: "warning", anomalyScore: 0.8, faultProbability: 0.3 }),
      createIncidentIfEligible({ machine: env.machine, prediction: p2, severity: "warning", anomalyScore: 0.82, faultProbability: 0.31 }),
    ]);

    const open = await Incident.countDocuments({ machineId: env.machine._id, status: "open" });
    expect(open).toBe(1);

    // Both calls returned an incident; they must be the SAME document
    // (one created it, the other updated it — not two creations).
    expect(String(results[0]._id)).toBe(String(results[1]._id));
    expect(results[0].occurrenceCount).toBeGreaterThanOrEqual(1);
  }, 20000);
});

describe("adversarial incidents — close vs new fault", () => {
  it("a fault prediction arriving right after the user closes the incident creates a NEW incident", async () => {
    // Machine2 currently has no incidents.
    const p1 = await makePrediction({ anomalyScore: 0.8 });
    const first = await createIncidentIfEligible({ machine: env.machine2, prediction: p1, severity: "warning", anomalyScore: 0.8, faultProbability: 0.3 });
    expect(first.status).toBe("open");

    // Operator closes it...
    const closed = await Incident.findById(first._id);
    closed.status = "closed";
    closed.closedAt = new Date();
    await closed.save();

    // ...and a new fault lands immediately: must create a fresh incident,
    // not resurrect or update the closed one.
    const p2 = await makePrediction({ anomalyScore: 0.85 });
    const second = await createIncidentIfEligible({ machine: env.machine2, prediction: p2, severity: "warning", anomalyScore: 0.85, faultProbability: 0.4 });
    expect(String(second._id)).not.toBe(String(first._id));
    expect(second.status).toBe("open");

    const openCount = await Incident.countDocuments({ machineId: env.machine2._id, status: "open" });
    expect(openCount).toBe(1);
    const totalCount = await Incident.countDocuments({ machineId: env.machine2._id });
    expect(totalCount).toBe(2); // closed one is kept as history
  });
});

describe("adversarial incidents — severity ordering (out-of-order arrivals)", () => {
  it("critical then warning: no downgrade; warning then critical: escalates once", async () => {
    // --- Machine (main): critical first, then a warning prediction ---
    const crit = await makePrediction({ anomalyScore: 0.95, faultProbability: 0.9 });
    const inc = await createIncidentIfEligible({ machine: env.machine, prediction: crit, severity: "critical", anomalyScore: 0.95, faultProbability: 0.9 });
    expect(inc.severity).toBe("critical");

    const warn = await makePrediction({ anomalyScore: 0.78, faultProbability: 0.4 });
    const afterWarn = await createIncidentIfEligible({ machine: env.machine, prediction: warn, severity: "warning", anomalyScore: 0.78, faultProbability: 0.4 });
    expect(afterWarn.severity).toBe("critical"); // never downgraded
    expect(String(afterWarn._id)).toBe(String(inc._id)); // same live incident

    // --- Machine2 (closed earlier, so a fresh open one exists): warning→critical ---
    const live = await Incident.findOne({ machineId: env.machine2._id, status: "open" });
    const warn2 = await makePrediction({ anomalyScore: 0.78 });
    const asWarning = await createIncidentIfEligible({ machine: env.machine2, prediction: warn2, severity: "warning", anomalyScore: 0.78, faultProbability: 0.4 });
    expect(String(asWarning._id)).toBe(String(live._id));
    expect(asWarning.severity).toBe("warning");

    const crit2 = await makePrediction({ anomalyScore: 0.96, faultProbability: 0.92 });
    const asCritical = await createIncidentIfEligible({ machine: env.machine2, prediction: crit2, severity: "critical", anomalyScore: 0.96, faultProbability: 0.92 });
    expect(asCritical.severity).toBe("critical");
    expect(String(asCritical._id)).toBe(String(live._id));
  });
});

describe("adversarial incidents — reopening after close", () => {
  it("closed incidents are never reopened by the service; a new incident is created instead", async () => {
    const closedDoc = await Incident.findOne({ machineId: env.machine2._id, status: "closed" });
    expect(closedDoc).toBeTruthy();

    const p = await makePrediction({ anomalyScore: 0.9, faultProbability: 0.9 });
    const result = await createIncidentIfEligible({ machine: env.machine2, prediction: p, severity: "critical", anomalyScore: 0.9, faultProbability: 0.9 });

    expect(String(result._id)).not.toBe(String(closedDoc._id));
    expect(result.status).toBe("open");
    const stillClosed = await Incident.findById(closedDoc._id);
    expect(stillClosed.status).toBe("closed");
  });
});
