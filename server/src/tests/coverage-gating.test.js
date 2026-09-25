import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import http from "http";
import mongoose from "mongoose";
import app from "../app.js";
import { connectDatabases, disconnectDatabases } from "../db/index.js";
import { startWorker, stopWorker } from "../queues/worker.js";
import { Machine } from "../models/machine.model.js";
import { Sensor } from "../models/sensor.model.js";
import { Event } from "../models/event.model.js";
import { Prediction } from "../models/prediction.model.js";
import { getMachineCoverage, COVERAGE_GATE_STATE } from "../services/coverage.service.js";
import { getRequiredChannels } from "../services/sensor-requirements.config.js";

/**
 * Minimum sensor-coverage gating.
 *
 * Unit-level coverage math + HTTP-level gate behaviour against a mock ML
 * service. bun test runs files in one process, so this suite follows the
 * existing isolation convention (own DB name via env rewrite; shared worker
 * + queue with the other suites).
 */
// Test files run in one bun process sharing the worker and DB connection.
// Do NOT rewrite MONGODB_URL/REDIS_URL here — the BullMQ worker is a
// process-wide singleton, and a dev worker on the same Redis will steal
// prediction jobs; run the suite against a test Redis instead.

const ML_PORT = 9113;
const PORT = 8095;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

let server;
let mlServer;
let mlCalls = [];

/** Contract-accurate mock of the ML service that counts /predict calls. */
function startMockMl() {
  mlServer = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.url === "/predict" && req.method === "POST") {
        mlCalls.push(body);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            machineId: "mock-machine",
            status: "ok",
            model: "lstm_autoencoder",
            modelVersion: "0.1.0+synthetic.test",
            anomalyScore: 0.12,
            faultProbability: 0.05,
            faultType: "none",
            suspectChannel: null,
            rulValue: null,
            rulUnit: null,
            confidence: 1.0,
            methods: { rul: "not_available" },
          })
        );
        return;
      }
      res.writeHead(404);
      res.end();
    });
  });
  return new Promise((resolve) => mlServer.listen(ML_PORT, resolve));
}

const waitUntil = async (fn, timeoutMs = 15000, intervalMs = 250) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
};

/** Fresh user + site + machine per test; no sensors attached yet. */
const registerAndSetup = async (suffix, machineType = "Centrifugal Pump") => {
  const regRes = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `cov-${suffix}@factory.com`,
      username: `cov_${suffix}`,
      password: "Password123!",
    }),
  });
  const authHeaders = {
    Cookie: regRes.headers.get("set-cookie"),
    "Content-Type": "application/json",
  };

  const site = (await (
    await fetch(`${BASE_URL}/sites`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: `Coverage Plant ${suffix}`, timezone: "UTC" }),
    })
  ).json()).data;

  const machine = (await (
    await fetch(`${BASE_URL}/machines/sites/${site.siteId}/machines`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        assetId: `COV-${suffix}`,
        name: `Coverage Machine ${suffix}`,
        machineType,
      }),
    })
  ).json()).data;

  const secret = (await (
    await fetch(`${BASE_URL}/settings/api-key`, { method: "POST", headers: authHeaders })
  ).json()).data.secret;

  return { authHeaders, site, machine, secret };
};

const addSensor = async ({ authHeaders, machine }, type, name = null) =>
  (await (
    await fetch(`${BASE_URL}/sensors/machines/${machine.machineId}/sensors`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: name || `${type} sensor`, type }),
    })
  ).json()).data;

const postEvent = async (
  { secret, site, machine },
  sensor,
  values,
  timestamp = new Date().toISOString()
) =>
  fetch(`${BASE_URL}/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `cov-${Math.random().toString(36).slice(2)}`,
    },
    body: JSON.stringify({
      siteId: site.siteId,
      machineId: machine.machineId,
      sensorId: sensor.sensorId,
      type: "sensor_reading",
      timestamp,
      values,
    }),
  });

/** Push one event per value set through the API (keys are sensor types). */
const pushReadings = async (env, perTypeValues) => {
  const results = [];
  for (const [type, values] of Object.entries(perTypeValues)) {
    const sensor = env.sensors[type];
    results.push(await postEvent(env, sensor, values));
  }
  return results;
};

const getCoverage = (env) =>
  fetch(`${BASE_URL}/machines/${env.machine.machineId}/coverage`, {
    headers: { Cookie: env.authHeaders.Cookie },
  }).then((r) => r.json());

describe("sensor coverage config", () => {
  it("defines requirements for all six machine types", () => {
    for (const type of ["motor", "pump", "compressor", "fan", "conveyor", "gearbox"]) {
      const required = getRequiredChannels(type);
      expect(required.length).toBeGreaterThan(0);
    }
  });

  it("normalizes free-text machine types onto canonical requirements", () => {
    // "Centrifugal Pump" → pump requirements
    expect(getRequiredChannels("Centrifugal Pump")).toEqual(
      getRequiredChannels("pump")
    );
    // Unknown free text falls back to the strictest default (motor)
    expect(getRequiredChannels("Hydraulic Press")).toEqual(
      getRequiredChannels("motor")
    );
    // Motor has the documented four channels
    expect(getRequiredChannels("Motor")).toEqual([
      "temperature",
      "vibration",
      "current",
      "rpm",
    ]);
  });
});

describe("coverage gating", () => {
  beforeAll(async () => {
    process.env.ML_SERVICE_URL = `http://localhost:${ML_PORT}`;
    await startMockMl();
    await connectDatabases();
    await mongoose.connection.dropDatabase();
    await startWorker();
    server = app.listen(PORT);
  });

  afterAll(async () => {
    if (server) server.close();
    await stopWorker();
    await disconnectDatabases();
    if (mlServer) mlServer.close();
  });

  it("zero coverage: no sensors → GATE_CLOSED, not ready, missing = all required", async () => {
    const env = await registerAndSetup("zero");
    const res = await getCoverage(env);
    expect(res.success).toBe(true);
    const coverage = res.data;

    expect(coverage.gateState).toBe(COVERAGE_GATE_STATE.GATE_CLOSED);
    expect(coverage.isReady).toBe(false);
    expect(coverage.sensorsTotal).toBe(0);
    expect(coverage.sensorsWorking).toBe(0);
    expect(coverage.covered).toEqual([]);
    expect(coverage.missing).toEqual(coverage.required);
    expect(coverage.unattached).toEqual(coverage.required);
  });

  it("partial coverage: some required sensors reporting → PARTIAL_REPORTING, not ready", async () => {
    const env = await registerAndSetup("partial");
    // Pump requires temperature, vibration, pressure, current.
    // Attach only temperature + vibration and report on them.
    env.sensors = {
      temperature: await addSensor(env, "temperature"),
      vibration: await addSensor(env, "vibration"),
    };
    await pushReadings(env, {
      temperature: { temperature: 61.5 },
      vibration: { vibration: 2.2 },
    });

    const coverage = (await getCoverage(env)).data;
    expect(coverage.required).toEqual(
      expect.arrayContaining(["temperature", "vibration", "pressure", "current"])
    );
    expect(coverage.covered).toEqual(
      expect.arrayContaining(["temperature", "vibration"])
    );
    expect(coverage.missing).toEqual(
      expect.arrayContaining(["pressure", "current"])
    );
    expect(coverage.unattached).toEqual(
      expect.arrayContaining(["pressure", "current"])
    );
    expect(coverage.sensorsTotal).toBe(2);
    expect(coverage.sensorsWorking).toBe(2);
    expect(coverage.isReady).toBe(false);
    expect(coverage.gateState).toBe(COVERAGE_GATE_STATE.GATE_CLOSED); // pressure+current not even attached
    expect(coverage.sensorStatus.every((s) => s.working)).toBe(true);
  });

  it("sensor stale past the recency window stops counting as working", async () => {
    const env = await registerAndSetup("stale");
    // Attach every required pump channel; only two report.
    env.sensors = {
      temperature: await addSensor(env, "temperature"),
      vibration: await addSensor(env, "vibration"),
      pressure: await addSensor(env, "pressure"),
      current: await addSensor(env, "current"),
      rpm: await addSensor(env, "rpm"),
    };
    await pushReadings(env, {
      temperature: { temperature: 60 },
      vibration: { vibration: 2 },
      // pressure + current: attached, never report
    });

    // Attached but never reporting → PARTIAL_REPORTING (everything attached).
    let coverage = (await getCoverage(env)).data;
    expect(coverage.gateState).toBe(COVERAGE_GATE_STATE.PARTIAL_REPORTING);
    expect(coverage.unattached).toEqual([]);
    expect(coverage.sensorsWorking).toBe(2);
    expect(coverage.isReady).toBe(false);

    // Now make one of the reporting sensors go stale by backdating its last
    // reading beyond the 15-minute recency window.
    const tempSensor = await Sensor.findById(env.sensors.temperature._id);
    tempSensor.lastReadingAt = new Date(Date.now() - 16 * 60 * 1000);
    await tempSensor.save();

    coverage = (await getCoverage(env)).data;
    expect(coverage.sensorsWorking).toBe(1);
    expect(coverage.covered).not.toContain("temperature");
    expect(coverage.missing).toContain("temperature");
    expect(coverage.isReady).toBe(false);

    // And the per-sensor status reflects the staleness.
    const tempStatus = coverage.sensorStatus.find(
      (s) => s.id === String(env.sensors.temperature._id)
    );
    expect(tempStatus.working).toBe(false);
    expect(tempStatus.ageSec).toBeGreaterThan(900);
  });

  it("full coverage: all required channels reporting → FULLY_COVERED and ready", async () => {
    const env = await registerAndSetup("full");
    env.sensors = {
      temperature: await addSensor(env, "temperature"),
      vibration: await addSensor(env, "vibration"),
      pressure: await addSensor(env, "pressure"),
      current: await addSensor(env, "current"),
      rpm: await addSensor(env, "rpm"),
    };
    await pushReadings(env, {
      temperature: { temperature: 60 },
      vibration: { vibration: 2 },
      pressure: { pressure: 3.4 },
      current: { current: 12 },
      rpm: { rpm: 1480 },
    });

    const coverage = (await getCoverage(env)).data;
    expect(coverage.isReady).toBe(true);
    expect(coverage.gateState).toBe(COVERAGE_GATE_STATE.FULLY_COVERED);
    expect(coverage.missing).toEqual([]);
    expect(coverage.unattached).toEqual([]);
    expect(coverage.sensorsWorking).toBe(coverage.sensorsTotal);
    expect(coverage.covered.sort()).toEqual([...coverage.required].sort());
  });

  it("worker skips ML when not ready: event tagged, no ML call, no prediction", { timeout: 30000 }, async () => {
    const env = await registerAndSetup("gate");
    env.sensors = { vibration: await addSensor(env, "vibration") };

    const eventsBefore = await Event.countDocuments({});
    const mlCallsBefore = mlCalls.length;

    // Machine is not ready (pump missing temperature/pressure/current/rpm) —
    // the event must be stored but NOT scored.
    await pushReadings(env, { vibration: { vibration: 2.4 } });
    await waitUntil(async () => (await Event.countDocuments({})) > eventsBefore);

    // Wait for the worker to stamp the coverage-skip tag on the event.
    const tagged = await waitUntil(async () => {
      const ev = await Event.findOne({
        machineId: new mongoose.Types.ObjectId(env.machine._id),
      })
        .sort({ createdAt: -1 })
        .lean();
      return Boolean(ev && (ev.tags ?? []).includes("SKIPPED_INSUFFICIENT_COVERAGE"));
    });
    expect(tagged).toBe(true);

    const event = await Event.findOne({ machineId: new mongoose.Types.ObjectId(env.machine._id) })
      .sort({ createdAt: -1 })
      .lean();
    expect(event).toBeTruthy();
    expect(event.tags).toContain("SKIPPED_INSUFFICIENT_COVERAGE");

    // No ML calls may have been made by this machine.
    for (const call of mlCalls.slice(mlCallsBefore)) {
      const parsed = JSON.parse(call);
      expect(parsed.machineId).not.toBe(env.machine.machineId);
    }

    // No prediction rows for this machine.
    const predictions = await Prediction.countDocuments({
      machineId: new mongoose.Types.ObjectId(env.machine._id),
    });
    expect(predictions).toBe(0);
  });

  it("worker proceeds when ready: ML called, prediction stored, event untagged", { timeout: 30000 }, async () => {
    const env = await registerAndSetup("ready");
    env.sensors = {
      temperature: await addSensor(env, "temperature"),
      vibration: await addSensor(env, "vibration"),
      pressure: await addSensor(env, "pressure"),
      current: await addSensor(env, "current"),
      rpm: await addSensor(env, "rpm"),
    };

    // A reading per sensor, each carrying its own channel (the window builder
    // merges them; coverage must be ready first).
    await pushReadings(env, {
      temperature: { temperature: 60 },
      vibration: { vibration: 2 },
      pressure: { pressure: 3.4 },
      current: { current: 12 },
      rpm: { rpm: 1480 },
    });

    // Wait for a prediction to appear for this machine.
    const gotPrediction = await waitUntil(async () => {
      const count = await Prediction.countDocuments({
        machineId: new mongoose.Types.ObjectId(env.machine._id),
      });
      return count > 0;
    });
    expect(gotPrediction).toBe(true);

    // The ML call was made (at least once for this machine).
    const machineCalls = mlCalls.map((c) => JSON.parse(c)).filter(
      (p) => p.machineId === env.machine.machineId
    );
    expect(machineCalls.length).toBeGreaterThan(0);
    expect(machineCalls[0].machineType).toBe("generic_motor");
    expect(machineCalls[0].window.length).toBeGreaterThan(0);

    // The newest event — the one whose job ran with full coverage — must NOT
    // carry the coverage-skip tag. (Earlier events may legitimately carry it:
    // their jobs ran before every sensor had reported.)
    const event = await Event.findOne({
      machineId: new mongoose.Types.ObjectId(env.machine._id),
    })
      .sort({ createdAt: -1 })
      .lean();
    expect(event).toBeTruthy();
    expect(event.tags ?? []).not.toContain("SKIPPED_INSUFFICIENT_COVERAGE");
  });

  it("coverage rides along on the machine detail response", async () => {
    const env = await registerAndSetup("detail");
    env.sensors = { vibration: await addSensor(env, "vibration") };
    await pushReadings(env, { vibration: { vibration: 2.4 } });

    const res = await fetch(`${BASE_URL}/machines/${env.machine.machineId}`, {
      headers: { Cookie: env.authHeaders.Cookie },
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.coverage).toBeTruthy();
    expect(body.data.coverage.isReady).toBe(false);
    expect(body.data.coverage.required).toEqual(
      expect.arrayContaining(["temperature", "vibration", "pressure", "current"])
    );
    expect(body.data.coverage.sensorStatus.length).toBe(1);
  });

  it("aggregate coverage endpoint lists every machine", async () => {
    const res = await fetch(`${BASE_URL}/machines/coverage`, {
      headers: { Cookie: (await registerAndSetup("agg")).authHeaders.Cookie },
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    for (const entry of body.data) {
      expect(entry.coverage).toBeTruthy();
      expect(typeof entry.coverage.isReady).toBe("boolean");
    }
  });
});
