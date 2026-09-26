import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import http from "http";
import mongoose from "mongoose";
import { z } from "zod";
import app from "../app.js";
import { connectDatabases, disconnectDatabases } from "../db/index.js";
import { startWorker, stopWorker } from "../queues/worker.js";
import { Sensor } from "../models/sensor.model.js";
import {
  parseMlResponse,
  SUPPORTED_ML_MACHINE_TYPES,
  REQUIRED_CHANNELS,
} from "../services/ml-contract.service.js";

/**
 * Adversarial Scope C — cross-service contract conformance.
 *
 * C.1 validates the server's ACTUAL outbound POST /predict request against
 * CONTRACT.md's request schema programmatically (drift detection: any future
 * change to buildMachineWindow or predictForMachine that breaks the wire
 * shape fails here, not in production).
 *
 * C.2 feeds every documented example response from CONTRACT.md through the
 * server's real parser (parseMlResponse) plus documented drift cases.
 *
 * Ports: Bun 8101, ML fake 9122.
 */

const PORT = 8101;
const ML_PORT = 9122;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

const env = {};
let server;
let mlServer;
let capturedRequests = [];

const api = (method, path, { cookie, key, body } = {}) =>
  fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.ML_SERVICE_URL = `http://localhost:${ML_PORT}`;

  mlServer = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      capturedRequests.push({
        url: req.url,
        method: req.method,
        contentType: req.headers["content-type"] ?? null,
        body: raw ? JSON.parse(raw) : null,
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          machineId: "contract-machine",
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
          methods: {
            anomalyScore: "lstm_autoencoder_reconstruction_error",
            faultProbability: "recent_exceedance_ratio",
            faultType: "top_error_channel",
            rul: "not_available",
          },
        })
      );
    });
  });
  await new Promise((r) => mlServer.listen(ML_PORT, r));

  await connectDatabases();
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) await c.deleteMany({});
  await startWorker();
  server = app.listen(PORT);

  const reg = await api("POST", "/auth/register", {
    body: { email: "advcon@factory.com", username: "advcon", password: "Password123!" },
  });
  env.cookie = reg.headers.getSetCookie().map((c) => c.split(";")[0])[0];
  env.site = (await (await api("POST", "/sites", { cookie: env.cookie, body: { name: "Contract Plant", timezone: "UTC" } })).json()).data;
  env.machine = (await (
    await api("POST", `/machines/sites/${env.site.siteId}/machines`, {
      cookie: env.cookie,
      body: { assetId: "CON-1", name: "Contract Motor", machineType: "motor" },
    })
  ).json()).data;
  env.sensors = {};
  for (const type of REQUIRED_CHANNELS) {
    env.sensors[type] = (await (
      await api("POST", `/sensors/machines/${env.machine.machineId}/sensors`, {
        cookie: env.cookie,
        body: { name: `${type} con`, type },
      })
    ).json()).data;
  }
  env.key = (await (await api("POST", "/settings/api-key", { cookie: env.cookie })).json()).data.secret;
  // NOTE: sensors deliberately keep lastReadingAt = null here — C.1 opens the
  // coverage gate only after posting its full burst, so exactly ONE scoring
  // run happens (with the complete window) and the captured request is
  // deterministic instead of an early warm-up partial window.
});

afterAll(async () => {
  if (server) server.close();
  await stopWorker();
  await disconnectDatabases();
  if (mlServer) mlServer.close();
});

/* ── C.1: outbound request conformance (programmatic, against CONTRACT.md) ── */

// CONTRACT.md request schema, encoded as Zod — this is the drift tripwire.
// Row-count bounds (seq_len 30 / max 500) are checked separately in C.1b:
// warm-up runs legitimately call with partial windows (the ML service answers
// insufficient_data for <30 rows), so per-request shape must not pin counts.
const contractRequestShapeSchema = z.object({
  machineId: z.string().min(1),
  machineType: z.literal("generic_motor"),
  window: z
    .array(
      z.object({
        timestamp: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "not ISO-8601"),
        values: z.object(
          Object.fromEntries(REQUIRED_CHANNELS.map((c) => [c, z.number().finite()])),
          { requiredError: `all required channels (${REQUIRED_CHANNELS.join(", ")}) must be present` }
        ),
      })
    )
    .min(1)
    .max(500),
});

describe("C.1 — server's outbound /predict request matches CONTRACT.md", () => {
  it("full healthy stream: captured request validates against the contract schema", async () => {
    capturedRequests = [];
    const channelValues = { temperature: 60, vibration: 2, current: 5, rpm: 1480 };
    const base = Date.now() - 180000;
    // Post the whole burst while the coverage gate is closed (no ML calls yet).
    for (let cycle = 0; cycle < 40; cycle += 1) {
      for (const [chIdx, type] of REQUIRED_CHANNELS.entries()) {
        const res = await api("POST", "/events", {
          key: env.key,
          body: {
            siteId: env.site.siteId,
            machineId: env.machine.machineId,
            sensorId: env.sensors[type].sensorId,
            type: "sensor_reading",
            timestamp: new Date(base + (cycle * REQUIRED_CHANNELS.length + chIdx) * 1000).toISOString(),
            values: { [type]: channelValues[type] },
          },
        });
        expect(res.status).toBe(201);
      }
    }

    // Open the gate, then trigger exactly one scoring run with the full window.
    const machineDoc = await mongoose.model("Machine").findOne({ machineId: env.machine.machineId });
    await Sensor.updateMany(
      { machineId: machineDoc._id },
      { $set: { lastReadingAt: new Date() } }
    );
    capturedRequests = [];
    const res = await api("POST", "/events", {
      key: env.key,
      body: {
        siteId: env.site.siteId,
        machineId: env.machine.machineId,
        sensorId: env.sensors.temperature.sensorId,
        type: "sensor_reading",
        timestamp: new Date().toISOString(),
        values: { temperature: 61 },
      },
    });
    expect(res.status).toBe(201);

    const deadline = Date.now() + 30000;
    while (capturedRequests.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(capturedRequests.length).toBeGreaterThanOrEqual(1);

    for (const req of capturedRequests) {
      expect(req.method).toBe("POST");
      expect(req.url).toBe("/predict");
      expect(req.contentType).toContain("application/json");
      const result = contractRequestShapeSchema.safeParse(req.body);
      if (!result.success) {
        throw new Error(`Outbound request violates CONTRACT.md: ${result.error.message}\nPayload: ${JSON.stringify(req.body).slice(0, 400)}`);
      }
      expect(result.success).toBe(true);
    }
  }, 45000);

  it("C.1b: the full-window run carries at least seq_len (30) rows — the scoreable minimum", () => {
    const req = capturedRequests[capturedRequests.length - 1];
    expect(req.body.window.length).toBeGreaterThanOrEqual(30);
    expect(req.body.window.length).toBeLessThanOrEqual(500);
  });

  it("window rows are oldest-first (contract: 'Array order is what counts')", () => {
    const req = capturedRequests[capturedRequests.length - 1];
    const times = req.body.window.map((r) => Date.parse(r.timestamp));
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
    }
  });

  it("machineType is the mapped ML name, not the app-level 'motor'", () => {
    expect(SUPPORTED_ML_MACHINE_TYPES).toContain("generic_motor");
    const req = capturedRequests[capturedRequests.length - 1];
    expect(req.body.machineType).toBe("generic_motor");
  });
});

/* ── C.2: every documented example response through the real parser ── */

describe("C.2 — CONTRACT.md example responses parse correctly", () => {
  it("documented 'scored' example → kind 'scored', all fields intact", () => {
    const example = {
      machineId: "pump-7",
      status: "ok",
      model: "lstm_autoencoder",
      modelVersion: "0.1.0+synthetic.20260924",
      anomalyScore: 0.94,
      faultProbability: 0.7,
      faultType: "vibration_anomaly",
      suspectChannel: "vibration",
      rulValue: null,
      rulUnit: null,
      confidence: 1.0,
      methods: {
        anomalyScore: "lstm_autoencoder_reconstruction_error",
        faultProbability: "recent_exceedance_ratio",
        faultType: "top_error_channel",
        rul: "not_available",
      },
    };
    const parsed = parseMlResponse(example);
    expect(parsed.kind).toBe("scored");
    expect(parsed.data.anomalyScore).toBe(0.94);
    expect(parsed.data.faultProbability).toBe(0.7);
    expect(parsed.data.faultType).toBe("vibration_anomaly");
    expect(parsed.data.suspectChannel).toBe("vibration");
    expect(parsed.data.rulValue).toBeNull(); // null is NOT zero
    expect(parsed.data.rulUnit).toBeNull();
    expect(parsed.data.confidence).toBe(1.0);
    expect(parsed.data.methods.rul).toBe("not_available");
  });

  it("documented 'insufficient_data' example → have/need extracted", () => {
    const parsed = parseMlResponse({ machineId: "pump-7", status: "insufficient_data", have: 12, need: 30 });
    expect(parsed).toEqual({ kind: "insufficient_data", have: 12, need: 30 });
  });

  it("suspectChannel absent (contract allows omission when faultType is none) → scored", () => {
    const parsed = parseMlResponse({
      machineId: "pump-7",
      status: "ok",
      model: "lstm_autoencoder",
      modelVersion: "0.1.0+synthetic.20260924",
      anomalyScore: 0.1,
      faultProbability: 0.05,
      faultType: "none",
      rulValue: null,
      rulUnit: null,
      confidence: 1.0,
    });
    expect(parsed.kind).toBe("scored");
  });
});

describe("C.2 — documented drift cases are rejected by the parser", () => {
  const validScored = () => ({
    machineId: "pump-7",
    status: "ok",
    model: "lstm_autoencoder",
    modelVersion: "0.1.0+synthetic.20260924",
    anomalyScore: 0.5,
    faultProbability: 0.5,
    faultType: "none",
    rulValue: null,
    rulUnit: null,
    confidence: 1.0,
  });

  it("missing modelVersion → invalid", () => {
    const { modelVersion, ...body } = validScored();
    void modelVersion;
    expect(parseMlResponse(body).kind).toBe("invalid");
  });

  it("anomalyScore out of documented 0..1 range → invalid", () => {
    expect(parseMlResponse({ ...validScored(), anomalyScore: 1.5 }).kind).toBe("invalid");
    expect(parseMlResponse({ ...validScored(), anomalyScore: -0.1 }).kind).toBe("invalid");
  });

  it("faultProbability out of range → invalid", () => {
    expect(parseMlResponse({ ...validScored(), faultProbability: 2 }).kind).toBe("invalid");
  });

  it("missing confidence → invalid (contract documents it as always present)", () => {
    const { confidence, ...body } = validScored();
    void confidence;
    expect(parseMlResponse(body).kind).toBe("invalid");
  });

  it("unknown status string → invalid (parser is not a pass-through)", () => {
    expect(parseMlResponse({ ...validScored(), status: "banana" }).kind).toBe("invalid");
  });

  it("machineId of wrong type → invalid", () => {
    expect(parseMlResponse({ ...validScored(), machineId: 7 }).kind).toBe("invalid");
  });

  it("insufficient_data with negative have or zero need → invalid", () => {
    expect(parseMlResponse({ machineId: "m", status: "insufficient_data", have: -1, need: 30 }).kind).toBe("invalid");
    expect(parseMlResponse({ machineId: "m", status: "insufficient_data", have: 12, need: 0 }).kind).toBe("invalid");
  });

  it("non-object bodies (string, null, number) → invalid, never a crash", () => {
    expect(parseMlResponse("ok").kind).toBe("invalid");
    expect(parseMlResponse(null).kind).toBe("invalid");
    expect(parseMlResponse(42).kind).toBe("invalid");
    expect(parseMlResponse(undefined).kind).toBe("invalid");
  });
});
