import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import mongoose from "mongoose";
import app from "../app.js";
import { connectDatabases, disconnectDatabases } from "../db/index.js";
import { startWorker, stopWorker } from "../queues/worker.js";
import { Sensor } from "../models/sensor.model.js";
import { Event } from "../models/event.model.js";

/**
 * Adversarial Scope B.2 — event ingestion abuse cases.
 *
 * The flagged duplicate-idempotency-key-with-different-payload case is
 * PINNED AS SKIPPED (it.todo) pending the owner's decision: current behavior
 * is "first write wins silently; the replay gets 200 + the ORIGINAL event".
 * Do not enable the assertion until the intended behavior is confirmed.
 *
 * Port 8098 (Bun).
 */

const PORT = 8098;
const BASE_URL = `http://localhost:${PORT}/api/v1`;
let server;

const env = {};

const api = (method, path, { cookie, key, body, headers = {} } = {}) =>
  fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

const register = async (suffix) => {
  const res = await api("POST", "/auth/register", {
    body: {
      email: `advev-${suffix}@factory.com`,
      username: `advev_${suffix}`,
      password: "Password123!",
    },
  });
  expect(res.status).toBe(201);
  return res.headers.get("set-cookie")?.split(";")[0];
};

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  await connectDatabases();
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) await c.deleteMany({});
  await startWorker();
  server = app.listen(PORT);

  env.cookie = await register("main");
  env.site = (await (
    await api("POST", "/sites", { cookie: env.cookie, body: { name: "Events Plant", timezone: "UTC" } })
  ).json()).data;
  env.machine = (await (
    await api("POST", `/machines/sites/${env.site.siteId}/machines`, {
      cookie: env.cookie,
      body: { assetId: "EV-1", name: "Events Motor", machineType: "motor" },
    })
  ).json()).data;
  env.sensors = {};
  for (const type of ["temperature", "vibration", "current", "rpm"]) {
    env.sensors[type] = (await (
      await api("POST", `/sensors/machines/${env.machine.machineId}/sensors`, {
        cookie: env.cookie,
        body: { name: `${type} ev`, type },
      })
    ).json()).data;
  }
  env.key = (await (await api("POST", "/settings/api-key", { cookie: env.cookie })).json()).data.secret;
});

afterAll(async () => {
  if (server) server.close();
  await stopWorker();
  await disconnectDatabases();
});

const postEvent = (overrides = {}, headers = {}) =>
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
    headers,
  });

describe("adversarial events — idempotency", () => {
  it("same key + same payload replays as 200 with the same event id", async () => {
    // The idempotency contract binds the key to the FULL payload (including
    // timestamp): a replay must resend a byte-identical body.
    const headers = { "Idempotency-Key": "idem-same-payload" };
    const fixedTs = new Date("2026-01-15T10:00:00Z").toISOString();
    const first = await postEvent({ values: { temperature: 61 }, timestamp: fixedTs }, headers);
    expect(first.status).toBe(201);
    const second = await postEvent({ values: { temperature: 61 }, timestamp: fixedTs }, headers);
    expect(second.status).toBe(200);
    expect((await second.json()).data.eventId).toBe((await first.json()).data.eventId);
  });

  it("same key + DIFFERENT payload → 409, sequential (owner decision: reject mismatch, never silent first-wins)", async () => {
    const headers = { "Idempotency-Key": `idem-mismatch-${Date.now()}` };
    const fixedTs = new Date("2026-01-15T10:05:00Z").toISOString();
    const first = await postEvent({ values: { temperature: 62 }, timestamp: fixedTs }, headers);
    expect(first.status).toBe(201);

    // Same key, different values: must be REJECTED, not replayed as 200 with
    // the original event (the old silent first-wins silently discarded the
    // new payload — silent data loss for a buggy/malicious gateway).
    const mismatch = await postEvent({ values: { temperature: 999 }, timestamp: fixedTs }, headers);
    expect(mismatch.status).toBe(409);
    // And the mismatching payload must NOT have been stored under the key:
    // the original payload still replays as 200 with the original event id.
    const replay = await postEvent({ values: { temperature: 62 }, timestamp: fixedTs }, headers);
    expect(replay.status).toBe(200);
    expect((await replay.json()).data.eventId).toBe((await first.json()).data.eventId);
  });

  it("same key + DIFFERENT payload → 409, concurrent (consistent with the sequential case)", async () => {
    const headers = { "Idempotency-Key": `idem-race-${Date.now()}` };
    // Two DIFFERENT payloads under one key, fired in parallel: both cannot
    // win. Whether the unique index (E11000→409) or the payload-hash check
    // answers, the outcome must be 409 for the loser(s) — consistent with
    // the sequential mismatch behavior.
    const [a, b] = await Promise.all([
      postEvent({ values: { temperature: 70 } }, headers),
      postEvent({ values: { temperature: 71 } }, headers),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses[0]).toBe(201); // exactly one creator
    expect(statuses[1]).toBe(409); // loser rejected — same as sequential
  });
});

describe("adversarial events — validation and ownership", () => {
  it("missing required fields → 400 (validation), never 500", async () => {
    for (const drop of ["siteId", "machineId", "sensorId", "values", "timestamp"]) {
      const body = {
        siteId: env.site.siteId,
        machineId: env.machine.machineId,
        sensorId: env.sensors.temperature.sensorId,
        type: "sensor_reading",
        timestamp: new Date().toISOString(),
        values: { temperature: 60 },
      };
      delete body[drop];
      const res = await api("POST", "/events", { key: env.key, body });
      expect(res.status).toBe(400);
    }
  });

  it("sensor from ANOTHER machine of the same user → 400 hierarchy mismatch", async () => {
    const other = (await (
      await api("POST", `/machines/sites/${env.site.siteId}/machines`, {
        cookie: env.cookie,
        body: { assetId: "EV-2", name: "Events Motor 2", machineType: "motor" },
      })
    ).json()).data;
    const foreignSensor = (await (
      await api("POST", `/sensors/machines/${other.machineId}/sensors`, {
        cookie: env.cookie,
        body: { name: "other sensor", type: "temperature" },
      })
    ).json()).data;

    const res = await postEvent({ sensorId: foreignSensor.sensorId });
    expect(res.status).toBe(400);
  });

  it("malformed timestamp → 400; far-future timestamp is accepted by design (pinned)", async () => {
    const bad = await postEvent({ timestamp: "not-a-date" });
    expect(bad.status).toBe(400);

    // z.coerce.date() accepts any parseable date; Sentinel is a backfill-capable
    // historian so future timestamps are not rejected. Pinned on purpose — if
    // you want them rejected, that is a schema change to make deliberately.
    const future = await postEvent({ timestamp: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString() });
    expect(future.status).toBe(201);
    const past = await postEvent({ timestamp: new Date(Date.now() - 10 * 365 * 24 * 3600 * 1000).toISOString() });
    expect(past.status).toBe(201);
  });

  it("oversized values payload (~1MB) → rejected by the 10mb body limit? No: accepted or 4xx, never a crash", async () => {
    const big = {};
    for (let i = 0; i < 20000; i += 1) big[`chan_${i}`] = i + 0.5;
    const res = await postEvent({ values: big });
    expect([201, 200, 400, 413]).toContain(res.status);
    // Server must still be alive.
    expect((await api("GET", "/health")).status).toBe(200);
  });

  it("empty values object → 400 (at least one value required)", async () => {
    expect((await postEvent({ values: {} })).status).toBe(400);
  });

  it("non-numeric value → 400", async () => {
    expect((await postEvent({ values: { temperature: "hot" } })).status).toBe(400);
  });

  it("events arriving out of order are all stored; newest-read ordering is by timestamp", async () => {
    const now = Date.now();
    for (const offset of [5000, 1000, 3000, 2000]) {
      const res = await postEvent({ timestamp: new Date(now - offset * 1000).toISOString() });
      expect(res.status).toBe(201);
    }
    const list = (await (
      await api("GET", `/events?machineId=${env.machine.machineId}&limit=10`, { cookie: env.cookie })
    ).json()).data;
    const times = list.map((e) => new Date(e.timestamp).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times); // descending
  });
});

describe("adversarial events — rapid-fire same-sensor race", () => {
  it("30 concurrent posts to ONE sensor: all stored, lastReadingAt max-wins (no lost updates)", async () => {
    const before = (await (
      await api("GET", `/sensors/machines/${env.machine.machineId}/sensors`, { cookie: env.cookie })
    ).json()).data.find((s) => s.type === "temperature");

    // Clean slate for THIS sensor: an earlier test pins a far-future timestamp
    // on the shared fixture sensor, and the monotonic max-wins update
    // (deliberately) refuses to regress lastReadingAt from the future.
    const raceStart = Date.now();
    await Sensor.updateOne(
      { _id: before._id },
      { $set: { lastReadingAt: new Date(raceStart - 1000) } }
    );

    // Distinct ordered timestamps: the newest post is unambiguous.
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        postEvent(
          { values: { temperature: 60 + i }, timestamp: new Date(raceStart + i).toISOString() },
          { "Idempotency-Key": `race-${raceStart}-${i}` }
        )
      )
    );
    const created = results.filter((r) => r.status === 201);
    expect(created.length).toBe(30); // unique keys → every request must store

    const count = await Event.countDocuments({ sensorId: before._id });
    expect(count).toBeGreaterThanOrEqual(30);

    // Max-wins convergence: 30 concurrent writes land in arbitrary completion
    // order, and the final value must be exactly the NEWEST posted timestamp.
    // Under the previous plain $set this race demonstrably lost updates (an
    // older value landed last and dragged lastReadingAt backwards — caught by
    // scripts/concurrency-check.js); the monotonic guard makes the outcome
    // deterministic.
    const after = await Sensor.findById(before._id).lean();
    expect(new Date(after.lastReadingAt).getTime()).toBe(raceStart + 29);
  }, 30000);
});
