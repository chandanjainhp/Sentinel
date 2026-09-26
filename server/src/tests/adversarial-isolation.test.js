import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import mongoose from "mongoose";
import app from "../app.js";
import { connectDatabases, disconnectDatabases } from "../db/index.js";
import { startWorker, stopWorker } from "../queues/worker.js";

/**
 * Adversarial Scope B.6 — cross-user isolation, exhaustively, per resource
 * type. User B must NEVER see user A's resources. The codebase returns 404
 * for foreign resources (userFilter scoping) and 403 only where ownership is
 * explicitly cross-checked (event ingestion hierarchy). Each case asserts the
 * code's actual behavior so any drift is caught.
 *
 * Port 8099 (Bun).
 */

const PORT = 8099;
const BASE_URL = `http://localhost:${PORT}/api/v1`;
let server;

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

const register = async (suffix) => {
  const res = await api("POST", "/auth/register", {
    body: {
      email: `adviso-${suffix}@factory.com`,
      username: `adviso_${suffix}`,
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

  // ── User A: full stack with one event ──
  env.aCookie = await register("a");
  env.aSite = (await (await api("POST", "/sites", { cookie: env.aCookie, body: { name: "Iso Plant A", timezone: "UTC" } })).json()).data;
  env.aMachine = (await (
    await api("POST", `/machines/sites/${env.aSite.siteId}/machines`, {
      cookie: env.aCookie,
      body: { assetId: "ISO-A-1", name: "Iso Motor A", machineType: "motor" },
    })
  ).json()).data;
  env.aSensor = (await (
    await api("POST", `/sensors/machines/${env.aMachine.machineId}/sensors`, {
      cookie: env.aCookie,
      body: { name: "temp A", type: "temperature" },
    })
  ).json()).data;
  env.aKey = (await (await api("POST", "/settings/api-key", { cookie: env.aCookie })).json()).data.secret;
  const evRes = await api("POST", "/events", {
    key: env.aKey,
    body: {
      siteId: env.aSite.siteId,
      machineId: env.aMachine.machineId,
      sensorId: env.aSensor.sensorId,
      type: "sensor_reading",
      timestamp: new Date().toISOString(),
      values: { temperature: 61 },
    },
  });
  expect(evRes.status).toBe(201);
  env.aEvent = (await evRes.json()).data;

  // ── User B: own stack, nothing shared ──
  env.bCookie = await register("b");
  env.bSite = (await (await api("POST", "/sites", { cookie: env.bCookie, body: { name: "Iso Plant B", timezone: "UTC" } })).json()).data;
  env.bMachine = (await (
    await api("POST", `/machines/sites/${env.bSite.siteId}/machines`, {
      cookie: env.bCookie,
      body: { assetId: "ISO-B-1", name: "Iso Motor B", machineType: "motor" },
    })
  ).json()).data;
  env.bSensor = (await (
    await api("POST", `/sensors/machines/${env.bMachine.machineId}/sensors`, {
      cookie: env.bCookie,
      body: { name: "temp B", type: "temperature" },
    })
  ).json()).data;
  env.bKey = (await (await api("POST", "/settings/api-key", { cookie: env.bCookie })).json()).data.secret;
});

afterAll(async () => {
  if (server) server.close();
  await stopWorker();
  await disconnectDatabases();
});

/** Foreign GETs must be 404 (invisible), never 200 and never a 500. */
describe("adversarial isolation — user B reads user A's resources by id", () => {
  it("site", async () => {
    expect((await api("GET", `/sites/${env.aSite.siteId}`, { cookie: env.bCookie })).status).toBe(404);
  });
  it("machine", async () => {
    expect((await api("GET", `/machines/${env.aMachine.machineId}`, { cookie: env.bCookie })).status).toBe(404);
  });
  it("sensor", async () => {
    expect((await api("GET", `/sensors/${env.aSensor.sensorId}`, { cookie: env.bCookie })).status).toBe(404);
  });
  it("event", async () => {
    expect((await api("GET", `/events/${env.aEvent.eventId}`, { cookie: env.bCookie })).status).toBe(404);
  });
  it("machine predictions list leaks nothing", async () => {
    const res = await api("GET", `/predictions/machines/${env.aMachine.machineId}`, { cookie: env.bCookie });
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) expect((await res.json()).data ?? []).toEqual([]);
  });
  it("machine incidents list leaks nothing", async () => {
    const res = await api("GET", `/incidents?machineId=${env.aMachine.machineId}`, { cookie: env.bCookie });
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) expect((await res.json()).data ?? []).toEqual([]);
  });
  it("settings/api-key metadata is per-user (B sees only their own)", async () => {
    const res = await api("GET", "/settings/api-key", { cookie: env.bCookie });
    expect(res.status).toBe(200);
    const meta = (await res.json()).data;
    if (meta) {
      expect(meta.secret).toBeUndefined();
      expect(meta.hashedSecret).toBeUndefined();
      expect(meta.keyPrefix).toBeString();
    }
  });
  it("A's incident detail and explain endpoint are invisible to B", async () => {
    const { Incident } = await import("../models/incident.model.js");
    const { User } = await import("../models/user.models.js");
    const aUser = await User.findOne({ email: "adviso-a@factory.com" });
    const inc = await Incident.create({
      userId: aUser._id,
      siteId: env.aSite._id ?? env.aSite.siteId,
      machineId: env.aMachine._id ?? env.aMachine.machineId,
      type: "anomaly",
      severity: "warning",
      title: "WARNING: Iso Motor A - test",
      reason: "isolation fixture",
      evidence: {},
      status: "open",
    });
    const readRes = await api("GET", `/incidents/${inc.incidentId}`, { cookie: env.bCookie });
    expect(readRes.status).toBe(404);
    const explainRes = await api("POST", `/incidents/${inc.incidentId}/explain`, { cookie: env.bCookie });
    expect(explainRes.status).toBe(404);
    const statusRes = await api("PATCH", `/incidents/${inc.incidentId}/status`, {
      cookie: env.bCookie,
      body: { status: "closed" },
    });
    expect([403, 404]).toContain(statusRes.status);
    // A still sees it, untouched.
    const asA = await api("GET", `/incidents/${inc.incidentId}`, { cookie: env.aCookie });
    expect(asA.status).toBe(200);
    expect((await asA.json()).data.status).toBe("open");
  });
  it("list endpoints never mix users", async () => {
    const aSites = (await (await api("GET", "/sites", { cookie: env.aCookie })).json()).data;
    const bSites = (await (await api("GET", "/sites", { cookie: env.bCookie })).json()).data;
    expect(aSites.map((s) => s.siteId)).toContain(env.aSite.siteId);
    expect(aSites.map((s) => s.siteId)).not.toContain(env.bSite.siteId);
    expect(bSites.map((s) => s.siteId)).not.toContain(env.aSite.siteId);
  });
  it("B cannot mutate A's site (PATCH)", async () => {
    const res = await api("PATCH", `/sites/${env.aSite.siteId}`, {
      cookie: env.bCookie,
      body: { name: "Hijacked" },
    });
    expect([403, 404]).toContain(res.status);
    const still = (await (await api("GET", `/sites/${env.aSite.siteId}`, { cookie: env.aCookie })).json()).data;
    expect(still.name).toBe("Iso Plant A");
  });
  it("B cannot delete A's sensor (DELETE)", async () => {
    const res = await api("DELETE", `/sensors/${env.aSensor.sensorId}`, { cookie: env.bCookie });
    expect([403, 404]).toContain(res.status);
    expect((await api("GET", `/sensors/${env.aSensor.sensorId}`, { cookie: env.aCookie })).status).toBe(200);
  });
});
