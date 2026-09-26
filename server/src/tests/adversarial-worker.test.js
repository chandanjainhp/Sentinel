import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import http from "http";
import mongoose from "mongoose";
import { Queue, Worker } from "bullmq";
import app from "../app.js";
import { connectDatabases, disconnectDatabases } from "../db/index.js";
import { startWorker, stopWorker } from "../queues/worker.js";
import { getRedis } from "../db/redis.js";
import { Event } from "../models/event.model.js";
import { Sensor } from "../models/sensor.model.js";
import { Prediction } from "../models/prediction.model.js";
import { Machine } from "../models/machine.model.js";

/**
 * Adversarial Scope B.7 — worker resilience.
 *
 * The production prediction worker is exercised over HTTP via a mock ML
 * service that can fail; poison-job and Redis-outage behavior is asserted
 * with a dedicated throwaway queue/worker pair on the SAME Redis so the
 * shared worker is untouched.
 *
 * Ports: Bun 8100, ML fake 9126/9127.
 */

const PORT = 8100;
const ML_PORT = 9126;
const BASE_URL = `http://localhost:${PORT}/api/v1`;
let server;
let mlServer;
let mlMode = "ok";

const env = {};

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

const waitUntil = async (fn, timeoutMs = 20000, intervalMs = 250) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
};

// Coverage gating requires fresh lastReadingAt per required channel; sensors
// created via the API start with null, which keeps the gate closed and would
// silently skip the ML path these tests exist to exercise.
const openCoverageGate = async (apiMachineId) => {
  const machine = await Machine.findOne({ machineId: apiMachineId });
  await Sensor.updateMany(
    { machineId: machine._id },
    { $set: { lastReadingAt: new Date() } }
  );
};

const register = async (suffix) => {
  const res = await api("POST", "/auth/register", {
    body: { email: `advwk-${suffix}@factory.com`, username: `advwk_${suffix}`, password: "Password123!" },
  });
  expect(res.status).toBe(201);
  return {
    cookie: res.headers.get("set-cookie")?.split(";")[0],
    email: `advwk-${suffix}@factory.com`,
  };
};

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.ML_SERVICE_URL = `http://localhost:${ML_PORT}`;

  mlServer = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.url === "/predict" && req.method === "POST") {
        if (mlMode === "down") {
          res.destroy();
          return;
        }
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
  await new Promise((r) => mlServer.listen(ML_PORT, r));

  await connectDatabases();
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) await c.deleteMany({});
  await startWorker();
  server = app.listen(PORT);

  env.user = await register("main");
  env.cookie = env.user.cookie;
  env.site = (await (await api("POST", "/sites", { cookie: env.cookie, body: { name: "Worker Plant", timezone: "UTC" } })).json()).data;
  env.machine = (await (
    await api("POST", `/machines/sites/${env.site.siteId}/machines`, {
      cookie: env.cookie,
      body: { assetId: "WK-1", name: "Worker Motor", machineType: "motor" },
    })
  ).json()).data;
  env.sensors = {};
  for (const type of ["temperature", "vibration", "current", "rpm"]) {
    env.sensors[type] = (await (
      await api("POST", `/sensors/machines/${env.machine.machineId}/sensors`, {
        cookie: env.cookie,
        body: { name: `${type} wk`, type },
      })
    ).json()).data;
  }
  await openCoverageGate(env.machine.machineId);
  env.key = (await (await api("POST", "/settings/api-key", { cookie: env.cookie })).json()).data.secret;
});

afterAll(async () => {
  if (server) server.close();
  await stopWorker();
  await disconnectDatabases();
  if (mlServer) mlServer.close();
});

const postEvent = (overrides = {}) =>
  api("POST", "/events", {
    key: env.key,
    body: {
      siteId: env.site.siteId,
      machineId: env.machine.machineId,
      sensorId: env.sensors.temperature.sensorId,
      type: "sensor_reading",
      timestamp: new Date().toISOString(),
      values: { temperature: 60 },
      ...overrides,
    },
  });

describe("adversarial worker — ML failures surface honestly", () => {
  it("ML down mid-stream: event stored, no prediction fabricated, machine UNKNOWN, server survives", async () => {
    mlMode = "down";
    const res = await postEvent();
    expect(res.status).toBe(201);

    const ok = await waitUntil(async () => {
      const m = (await (await api("GET", `/machines/${env.machine.machineId}`, { cookie: env.cookie })).json()).data;
      return m?.healthUnknownReason;
    }, 25000);
    expect(ok).toBe(true); // honest UNKNOWN reason, no crash

    const preds = (await (await api("GET", `/predictions/machines/${env.machine.machineId}`, { cookie: env.cookie })).json()).data ?? [];
    expect(preds.length).toBe(0);

    expect((await api("GET", "/health")).status).toBe(200);
    mlMode = "ok";
  }, 40000);

  it("duplicate prediction jobs for a 40-event burst collapse to exactly ONE prediction", async () => {
    // Fresh machine: isolates this count from any retry of the previous
    // test's failed job landing after mlMode flips back to ok.
    env.machine2 = (await (
      await api("POST", `/machines/sites/${env.site.siteId}/machines`, {
        cookie: env.cookie,
        body: { assetId: "WK-2", name: "Worker Motor 2", machineType: "motor" },
      })
    ).json()).data;
    env.sensors2 = {};
    for (const type of ["temperature", "vibration", "current", "rpm"]) {
      env.sensors2[type] = (await (
        await api("POST", `/sensors/machines/${env.machine2.machineId}/sensors`, {
          cookie: env.cookie,
          body: { name: `${type} wk2`, type },
        })
      ).json()).data;
    }
    await openCoverageGate(env.machine2.machineId);

    // A scoreable burst: 10 cycles x 4 channels = 40 rows (>= seq_len 30),
    // every row enqueueing its own prediction job. The duplicate-window
    // collapse must store exactly ONE prediction for the whole burst.
    const channelValues = { temperature: 60, vibration: 2, current: 5, rpm: 1480 };
    const base = Date.now() - 60000;
    for (let cycle = 0; cycle < 10; cycle += 1) {
      for (const [chIdx, type] of ["temperature", "vibration", "current", "rpm"].entries()) {
        const res = await api("POST", "/events", {
          key: env.key,
          body: {
            siteId: env.site.siteId,
            machineId: env.machine2.machineId,
            sensorId: env.sensors2[type].sensorId,
            type: "sensor_reading",
            timestamp: new Date(base + (cycle * 4 + chIdx) * 1000).toISOString(),
            values: { [type]: channelValues[type] },
          },
        });
        expect(res.status).toBe(201);
      }
    }

    const ok = await waitUntil(async () => {
      const preds = (await (await api("GET", `/predictions/machines/${env.machine2.machineId}`, { cookie: env.cookie })).json()).data ?? [];
      return preds.length >= 1;
    }, 30000);
    expect(ok).toBe(true);
    await new Promise((r) => setTimeout(r, 5000)); // let any duplicate land

    const preds = (await (await api("GET", `/predictions/machines/${env.machine2.machineId}`, { cookie: env.cookie })).json()).data ?? [];
    expect(preds.length).toBe(1); // 40 jobs → exactly one stored prediction
  }, 60000);
});

describe("adversarial worker — poison jobs on a throwaway queue", () => {
  it("a job that always throws is retried per config then abandoned; queue stays drainable", async () => {
    const connection = getRedis();
    const queueName = `adversarial-poison-${Date.now()}`;
    const queue = new Queue(queueName, { connection });
    let attempts = 0;
    const worker = new Worker(
      queueName,
      async () => {
        attempts += 1;
        throw new Error("poison");
      },
      { connection, concurrency: 1 }
    );

    await queue.add("poison", { n: 1 }, { attempts: 3, backoff: { type: "fixed", delay: 100 } });
    const settled = await waitUntil(async () => (await queue.getFailedCount()) >= 1, 15000, 200);
    expect(settled).toBe(true);
    await new Promise((r) => setTimeout(r, 1500)); // allow the 3rd attempt to land
    expect(attempts).toBe(3); // attempts:3 → exactly three tries, then abandoned

    await worker.close();
    await queue.obliterate({ force: true }).catch(() => {});
    await queue.close();
  }, 30000);

  it.todo(
    "FOUND BUG — queue.add against a dead Redis endpoint waits indefinitely (BullMQ default with enableOfflineQueue), and event ingestion awaits predictionQueue.add inside the request path: a Redis outage would hang POST /events responses instead of failing bounded. Tracked in BUGS_FOUND.md; the fix (short offline-queue timeout or fire-and-forget add) is a design decision."
  );
});
