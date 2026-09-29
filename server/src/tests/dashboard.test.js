import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import mongoose from "mongoose";
import app from "../app.js";
import { connectDatabases, disconnectDatabases } from "../db/index.js";
import { startWorker, stopWorker } from "../queues/worker.js";
import { Machine } from "../models/machine.model.js";
import { Prediction } from "../models/prediction.model.js";
import { Incident } from "../models/incident.model.js";
import { Site } from "../models/site.model.js";
import { Sensor } from "../models/sensor.model.js";

/**
 * Dashboard aggregation — GET /api/v1/dashboard (port 8094).
 *
 * Pins the contract the /overview stats band renders: six-tile totals from
 * real Machine.status / open Incidents / latest scored Prediction, plus
 * per-site fleet rollups. Deterministic numbers only — nothing mocked.
 */

const PORT = 8094;
const BASE_URL = `http://localhost:${PORT}/api/v1`;
let server;

const api = (method, path, { cookie, body } = {}) =>
  fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

const register = async (suffix) => {
  const res = await api("POST", "/auth/register", {
    body: {
      email: `dash-${suffix}@factory.com`,
      username: `dash_${suffix}`,
      password: "Password123!",
    },
  });
  expect(res.status).toBe(201);
  return res.headers.getSetCookie().map((c) => c.split(";")[0]);
};

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  await connectDatabases();
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) await c.deleteMany({});
  await startWorker();
  server = app.listen(PORT);
});

afterAll(async () => {
  if (server) server.close();
  await stopWorker();
  await disconnectDatabases();
});

describe("dashboard aggregation", () => {
  it("requires auth", async () => {
    const res = await api("GET", "/dashboard");
    expect(res.status).toBe(401);
  });

  it("computes six-tile totals, fleet rollups and open incidents from real records", async () => {
    const [access] = await register("a");
    const cookie = access;

    // Site
    const site = (await (
      await api("POST", "/sites", { cookie, body: { name: "Dash Plant", timezone: "UTC" } })
    ).json()).data;

    // Machines with fixed statuses
    const mk = (assetId, name, status) =>
      Machine.create({
        userId: new mongoose.Types.ObjectId(), // replaced below via API-created machine? no — use direct with site owner
        siteId: site._id,
        assetId,
        name,
        machineType: "motor",
        status,
      });

    // Use the API-created machine path for ownership correctness: create via API then patch status directly.
    const created = (await (
      await api("POST", `/machines/sites/${site.siteId}/machines`, {
        cookie,
        body: { assetId: "DASH-1", name: "Dash Motor", machineType: "motor" },
      })
    ).json()).data;
    const ownerId = (await (await api("GET", "/auth/current-user", { cookie })).json()).data._id;

    // Fix ownership of the direct-inserted machines
    const m2 = await Machine.create({
      userId: ownerId,
      siteId: site._id,
      assetId: "DASH-2",
      name: "Dash Motor 2",
      machineType: "motor",
      status: "warning",
    });
    const m3 = await Machine.create({
      userId: ownerId,
      siteId: site._id,
      assetId: "DASH-3",
      name: "Dash Motor 3",
      machineType: "motor",
      status: "critical",
    });
    const m4 = await Machine.create({
      userId: ownerId,
      siteId: site._id,
      assetId: "DASH-4",
      name: "Dash Motor 4",
      machineType: "motor",
      status: "offline",
    });

    await Machine.findByIdAndUpdate(created._id, { status: "healthy" });

    // Open incident on m3 (schema requires type + reason)
    await Incident.create({
      userId: ownerId,
      siteId: site._id,
      machineId: m3._id,
      severity: "critical",
      status: "open",
      type: "anomaly",
      title: "CRITICAL: Dash Motor 3 (DASH-3) - Bearing degradation",
      reason: "Machine Dash Motor 3 reached critical state. Anomaly Score: 0.94.",
      description: "test",
    });

    // Scored predictions — worst on m2
    const predict = (machine, anomalyScore, faultProbability) =>
      Prediction.create({
        userId: ownerId,
        siteId: site._id,
        machineId: machine._id,
        model: "generic_motor",
        modelVersion: "test",
        timestamp: new Date(),
        anomalyScore,
        faultProbability,
        faultType: "bearing_wear",
      });
    await predict(m2, 0.82, 0.6);
    await predict(m3, 0.94, 0.9);

    const res = await api("GET", "/dashboard", { cookie });
    expect(res.status).toBe(200);
    const body = await res.json();
    const d = body.data;

    // Six tiles
    expect(d.totals.machines).toBe(4);
    expect(d.totals.healthy).toBe(1);
    expect(d.totals.warning).toBe(1);
    expect(d.totals.critical).toBe(1);
    expect(d.totals.offline).toBe(1);
    expect(d.totals.activeIncidents).toBe(1);

    // Predicted risk = worst latest anomaly, classified by the ML contract threshold
    expect(d.predictedRisk).not.toBeNull();
    expect(d.predictedRisk.anomalyScore).toBe(0.94);
    expect(d.predictedRisk.level).toBe("warning");
    expect(d.predictedRisk.machineId).toBe(String(m3._id));

    // Fleet rollup for the one site
    expect(d.fleet.length).toBe(1);
    const roll = d.fleet[0];
    expect(roll.machines).toBe(4);
    expect(roll.healthy).toBe(1);
    expect(roll.warning).toBe(1);
    expect(roll.critical).toBe(1);
    expect(roll.offline).toBe(1);
    expect(roll.status).toBe("critical"); // worst status present

    // Open incidents list: severity + machine + age present
    expect(d.incidents.length).toBe(1);
    expect(d.incidents[0].severity).toBe("critical");
    expect(d.incidents[0].machine.name).toBe("Dash Motor 3");
    expect(typeof d.incidents[0].age).toBe("string");
  });

  it("excludes closed incidents and unscored predictions from the stats", async () => {
    const [access] = await register("b");
    const cookie = access;

    const site = (await (
      await api("POST", "/sites", { cookie, body: { name: "Quiet Plant", timezone: "UTC" } })
    ).json()).data;
    const ownerId = (await (await api("GET", "/auth/current-user", { cookie })).json()).data._id;
    const machine = await Machine.create({
      userId: ownerId,
      siteId: site._id,
      assetId: "QUIET-1",
      name: "Quiet Motor",
      machineType: "motor",
      status: "healthy",
    });

    // Closed incident — must not count as active
    await Incident.create({
      userId: ownerId,
      siteId: site._id,
      machineId: machine._id,
      severity: "critical",
      status: "closed",
      type: "anomaly",
      title: "CRITICAL: resolved",
      reason: "closed out after maintenance",
      description: "closed out",
    });
    // Unscored prediction (no numeric anomalyScore) — must not drive risk
    await Prediction.create({
      userId: ownerId,
      siteId: site._id,
      machineId: machine._id,
      model: "generic_motor",
      modelVersion: "test",
      timestamp: new Date(),
      anomalyScore: null,
      faultProbability: null,
    });

    const d = (await (await api("GET", "/dashboard", { cookie })).json()).data;
    expect(d.totals.activeIncidents).toBe(0);
    expect(d.predictedRisk).toBeNull();
    expect(d.incidents.length).toBe(0);
  });

  it("isolates users: another user's machines never leak into the totals", async () => {
    // Register a third user who owns nothing — their dashboard must be empty
    // even though other users have machines and sites.
    const [accessC] = await register("iso-c");

    const dC = (await (await api("GET", "/dashboard", { cookie: accessC })).json()).data;
    expect(dC.totals.machines).toBe(0);
    expect(dC.fleet.length).toBe(0);
    expect(dC.incidents.length).toBe(0);

    // And an existing owner still sees their own data.
    const [accessB] = await register("iso-b2");
    const site = (await (
      await api("POST", "/sites", { cookie: accessB, body: { name: "Iso Plant", timezone: "UTC" } })
    ).json()).data;
    await api("POST", `/machines/sites/${site.siteId}/machines`, {
      cookie: accessB,
      body: { assetId: "ISO-1", name: "Iso Motor", machineType: "motor" },
    });
    const dB = (await (await api("GET", "/dashboard", { cookie: accessB })).json()).data;
    expect(dB.totals.machines).toBe(1);
    expect(dB.fleet.map((s) => s.name)).toContain("Iso Plant");
  });
});

void Sensor;
void Site;
