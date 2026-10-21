import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import mongoose from "mongoose";
import app from "../app.js";
import { connectDatabases, disconnectDatabases } from "../db/index.js";
import { Site } from "../models/site.model.js";
import { Machine } from "../models/machine.model.js";
import { Event } from "../models/event.model.js";
import { Incident } from "../models/incident.model.js";

/**
 * List pagination — GET /api/v1/events|incidents?limit=…
 *
 * Before this test existed, GET /events had no query validation: a huge limit
 * pulled the whole collection into memory, and a non-numeric limit became
 * NaN, which Mongoose treats as "no limit" — so ?limit=abc returned MORE rows
 * than ?limit=100. Pins the same contract the incident endpoint already had:
 * 1..500 accepted, default 100, anything else is a 400.
 */

const PORT = 8104;
const BASE_URL = `http://localhost:${PORT}/api/v1`;
let server;
let cookie;
let ownerId;
let site;
let machine;

const api = (method, path, { cookie, body } = {}) =>
  fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

const seed = (count) => {
  const now = Date.now();
  const events = Array.from({ length: count }, (_, i) => ({
    userId: ownerId,
    siteId: site._id,
    machineId: machine._id,
    sensorId: new mongoose.Types.ObjectId(),
    timestamp: new Date(now - i * 1000),
    values: { temperature: 70 },
    idempotencyKey: `limit-test-${i}`,
  }));
  const incidents = Array.from({ length: count }, (_, i) => ({
    userId: ownerId,
    siteId: site._id,
    machineId: machine._id,
    type: "anomaly",
    severity: "warning",
    title: `Limit incident ${i}`,
    reason: `Seeded for the pagination test (${i}).`,
  }));
  return Promise.all([Event.insertMany(events), Incident.insertMany(incidents)]);
};

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  await connectDatabases();
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) await c.deleteMany({});
  server = app.listen(PORT);

  const res = await api("POST", "/auth/register", {
    body: {
      email: "limit@factory.com",
      username: "limit_user",
      password: "Password123!",
      ageConfirmed: true,
    },
  });
  expect(res.status).toBe(201);
  cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  ownerId = (await res.json()).data.user._id;

  site = await Site.create({ userId: ownerId, name: "Limit Plant", timezone: "UTC" });
  machine = await Machine.create({
    userId: ownerId,
    siteId: site._id,
    assetId: "LIM-1",
    name: "Limit Motor",
    machineType: "motor",
  });
  await seed(600);
});

afterAll(async () => {
  if (server) server.close();
  await disconnectDatabases();
});

describe("list pagination", () => {
  it("rejects a huge limit instead of returning the whole collection", async () => {
    const res = await api("GET", "/events?limit=10000000", { cookie });
    expect(res.status).toBe(400);
  });

  it("rejects a non-numeric limit instead of silently dropping the cap", async () => {
    const res = await api("GET", "/events?limit=abc", { cookie });
    expect(res.status).toBe(400);
  });

  it("rejects a limit below the minimum", async () => {
    const res = await api("GET", "/events?limit=0", { cookie });
    expect(res.status).toBe(400);
  });

  it("accepts the maximum page size", async () => {
    const res = await api("GET", "/events?limit=500", { cookie });
    expect(res.status).toBe(200);
    expect((await res.json()).data.length).toBe(500);
  });

  it("rejects one past the maximum", async () => {
    const res = await api("GET", "/events?limit=501", { cookie });
    expect(res.status).toBe(400);
  });

  it("honours a small limit unchanged", async () => {
    const res = await api("GET", "/events?limit=7", { cookie });
    expect(res.status).toBe(200);
    expect((await res.json()).data.length).toBe(7);
  });

  it("defaults to 100 rows when no limit is given", async () => {
    const res = await api("GET", "/events", { cookie });
    expect(res.status).toBe(200);
    expect((await res.json()).data.length).toBe(100);
  });

  it("keeps the incident endpoint on the same contract", async () => {
    expect((await api("GET", "/incidents?limit=10000000", { cookie })).status).toBe(400);
    expect((await api("GET", "/incidents?limit=abc", { cookie })).status).toBe(400);
    const max = await api("GET", "/incidents?limit=500", { cookie });
    expect(max.status).toBe(200);
    expect((await max.json()).data.length).toBe(500);
  });

  it("ignores unknown query params instead of rejecting them", async () => {
    // The client helper getEventsForNight sends ?nightDate=…; unknown keys must
    // stay harmless (stripped), not become a 400.
    const res = await api("GET", "/events?nightDate=2026-10-19&limit=10", { cookie });
    expect(res.status).toBe(200);
    expect((await res.json()).data.length).toBe(10);
  });

  it("still filters by machine when a limit is given", async () => {
    const res = await api("GET", `/events?machineId=${machine.machineId}&limit=10`, { cookie });
    expect(res.status).toBe(200);
    expect((await res.json()).data.length).toBe(10);
  });
});
