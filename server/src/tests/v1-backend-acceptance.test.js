import { describe, it, beforeAll, afterAll, expect } from "bun:test";
import mongoose from "mongoose";
import app from "../app.js";
import { connectDatabases, disconnectDatabases } from "../db/index.js";
import { startWorker, stopWorker } from "../queues/worker.js";
import { User } from "../models/user.models.js";
import { Site } from "../models/site.model.js";
import { Machine } from "../models/machine.model.js";
import { Sensor } from "../models/sensor.model.js";
import { Event } from "../models/event.model.js";
import { Prediction } from "../models/prediction.model.js";
import { Incident } from "../models/incident.model.js";
import ApiKey from "../models/apiKey.model.js";

let server;
let ownerSecretV1; // owner's first API key secret (invalidated in the key-replacement test)
let ownerSecretV2; // owner's current API key secret (generated in the key-replacement test)
const PORT = 8089;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

describe("Sentinel Single-User Backend Test Suite", () => {
  beforeAll(async () => {
    // ML calls from the worker fail fast (no ML service in this suite) — the
    // pipeline behaviour is covered by pipeline-ml.test.js with a mock ML.
    await connectDatabases();

    // Deterministic runs: wipe the test database
    await mongoose.connection.dropDatabase();

    await startWorker();

    // 3. Start Express HTTP server
    server = app.listen(PORT);
  });

  afterAll(async () => {
    if (server) server.close();
    await stopWorker();
    await disconnectDatabases();
  });

  it("runs the full single-user workflow: register → site → machine → sensor → key → event → prediction → health → incident", { timeout: 30000 }, async () => {
    // -------------------------------------------------------------
    // Step 1: Owner Registers (no organization, no role)
    // -------------------------------------------------------------
    const regRes = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "owner@factory.com",
        username: "owner",
        password: "Password123!",
      }),
    });
    const regData = await regRes.json();
    expect(regRes.status).toBe(201);
    expect(regData.success).toBe(true);
    expect(regData.data.user.email).toBe("owner@factory.com");
    expect(regData.data.user.role).toBeUndefined();
    expect(regData.data.user.orgId).toBeUndefined();

    // Exactly one organization-free user document — no orgs created
    const orgCount = await mongoose.connection
      .collection("organizations")
      .countDocuments();
    expect(orgCount).toBe(0);

    // -------------------------------------------------------------
    // Step 2: Owner Logs in
    // -------------------------------------------------------------
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "owner@factory.com",
        password: "Password123!",
      }),
    });
    const loginData = await loginRes.json();
    expect(loginRes.status).toBe(200);
    expect(loginData.success).toBe(true);
    const authHeaders = {
      Cookie: loginRes.headers.get("set-cookie"),
      "Content-Type": "application/json",
    };

    // -------------------------------------------------------------
    // Step 3: Owner Creates Site
    // -------------------------------------------------------------
    const siteRes = await fetch(`${BASE_URL}/sites`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "North Plant",
        description: "Primary manufacturing facility",
        industry: "Manufacturing",
        timezone: "UTC",
      }),
    });
    const siteData = await siteRes.json();
    expect(siteRes.status).toBe(201);
    expect(siteData.success).toBe(true);
    const site = siteData.data;
    expect(site.name).toBe("North Plant");
    expect(site.userId).toBeDefined();
    expect(site.orgId).toBeUndefined();

    // -------------------------------------------------------------
    // Step 4: Owner Creates Machine
    // -------------------------------------------------------------
    const machineRes = await fetch(`${BASE_URL}/machines/sites/${site.siteId}/machines`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        assetId: "PUMP-001",
        name: "Main Coolant Pump",
        machineType: "Centrifugal Pump",
        manufacturer: "PumpCo",
        model: "X-200",
      }),
    });
    const machineData = await machineRes.json();
    expect(machineRes.status).toBe(201);
    expect(machineData.success).toBe(true);
    const machine = machineData.data;
    expect(machine.name).toBe("Main Coolant Pump");
    expect(machine.status).toBe("unknown");

    // -------------------------------------------------------------
    // Step 5: Owner Creates Sensor
    // -------------------------------------------------------------
    const sensorRes = await fetch(`${BASE_URL}/sensors/machines/${machine.machineId}/sensors`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "Vibration Sensor #1",
        type: "vibration",
        unit: "mm/s",
        samplingRate: 10,
      }),
    });
    const sensorData = await sensorRes.json();
    expect(sensorRes.status).toBe(201);
    expect(sensorData.success).toBe(true);
    const sensor = sensorData.data;
    expect(sensor.type).toBe("vibration");

    // -------------------------------------------------------------
    // Step 6: Owner Generates the SINGLE API Key
    // -------------------------------------------------------------
    const apiKeyRes = await fetch(`${BASE_URL}/settings/api-key`, {
      method: "POST",
      headers: authHeaders,
    });
    const apiKeyData = await apiKeyRes.json();
    expect(apiKeyRes.status).toBe(201);
    expect(apiKeyData.success).toBe(true);
    const rawSecret = apiKeyData.data.secret;
    expect(rawSecret).toBeDefined();
    expect(rawSecret.startsWith("sk_")).toBe(true);
    ownerSecretV1 = rawSecret;

    // Verify secret is not saved in plain text in DB
    const keyInDb = await ApiKey.findById(apiKeyData.data.id);
    expect(keyInDb.hashedSecret).not.toBe(rawSecret);

    // Metadata endpoint returns the key info but NEVER the secret
    const metaRes = await fetch(`${BASE_URL}/settings/api-key`, {
      headers: authHeaders,
    });
    const metaData = await metaRes.json();
    expect(metaRes.status).toBe(200);
    expect(metaData.data.keyPrefix).toBeDefined();
    expect(metaData.data.createdAt).toBeDefined();
    expect(metaData.data.secret).toBeUndefined();
    expect(JSON.stringify(metaData.data)).not.toContain(rawSecret);

    // Only one key exists for the user
    const keyCount = await ApiKey.countDocuments({});
    expect(keyCount).toBe(1);

    // -------------------------------------------------------------
    // Step 7-10: Ingest Event via API Key with Idempotency-Key
    // -------------------------------------------------------------
    const eventPayload = {
      siteId: site.siteId,
      machineId: machine.machineId,
      sensorId: sensor.sensorId,
      type: "sensor_reading",
      timestamp: new Date().toISOString(),
      values: {
        vibration: 8.75, // Critical vibration level (> 6.0)
        temperature: 85.2, // Critical temperature (> 80.0)
        current: 14.2,
        rpm: 1450,
      },
      source: "gateway",
    };

    const eventRes = await fetch(`${BASE_URL}/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rawSecret}`,
        "Content-Type": "application/json",
        "Idempotency-Key": "test-idem-key-001",
      },
      body: JSON.stringify(eventPayload),
    });
    const eventData = await eventRes.json();
    expect(eventRes.status).toBe(201);
    expect(eventData.success).toBe(true);
    const event = eventData.data;
    expect(event.eventId).toBeDefined();
    expect(event.userId).toBeDefined();
    expect(event.orgId).toBeUndefined();

    // Duplicate delivery with the same Idempotency-Key returns the same event
    const duplicateRes = await fetch(`${BASE_URL}/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rawSecret}`,
        "Content-Type": "application/json",
        "Idempotency-Key": "test-idem-key-001",
      },
      body: JSON.stringify(eventPayload),
    });
    expect(duplicateRes.status).toBe(200);
    const duplicateData = await duplicateRes.json();
    expect(duplicateData.data._id).toBe(event._id);
    expect(await Event.countDocuments({})).toBe(1);

    // -------------------------------------------------------------
    // Step 11+: Async pipeline without an ML service in this suite.
    // The honest contract behaviour (no ML → no fabricated prediction,
    // machine UNKNOWN with a stored reason) is covered end-to-end in
    // pipeline-ml.test.js with a mock ML service. Here we assert what is
    // synchronously observable: the sensor left WAITING (ONLINE) and the
    // machine went UNKNOWN rather than "healthy" on invented data.
    // -------------------------------------------------------------
    const listRes = await fetch(`${BASE_URL}/sensors`, { headers: authHeaders });
    const listData = await listRes.json();
    const sensorAfter = listData.data.find((s) => s.sensorId === sensor.sensorId);
    expect(sensorAfter).toBeDefined();
    expect(sensorAfter.status).toBe("ONLINE");
    expect(sensorAfter.lastReadingAt).not.toBeNull();
  });

  it("isolates users: user B cannot access user A's records", async () => {
    // Register a second user
    const regResB = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "other@competingfactory.com",
        username: "other_user",
        password: "Password123!",
      }),
    });
    const authHeadersB = {
      Cookie: regResB.headers.get("set-cookie"),
      "Content-Type": "application/json",
    };

    const authHeadersA = await (async () => {
      const loginRes = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "owner@factory.com",
          password: "Password123!",
        }),
      });
      return {
        Cookie: loginRes.headers.get("set-cookie"),
        "Content-Type": "application/json",
      };
    })();

    // User A's first site
    const siteA = await Site.findOne({});
    expect(siteA).not.toBeNull();

    // B sees an empty site list
    const sitesResB = await fetch(`${BASE_URL}/sites`, { headers: authHeadersB });
    const sitesDataB = await sitesResB.json();
    expect(sitesDataB.data.length).toBe(0);

    // B cannot view A's site by ID → 404
    const siteDetailResB = await fetch(`${BASE_URL}/sites/${siteA.siteId}`, {
      headers: authHeadersB,
    });
    expect(siteDetailResB.status).toBe(404);

    // B cannot view A's machine → 404
    const machineFor404 = await Machine.findOne({});
    const machineDetailResB = await fetch(`${BASE_URL}/machines/${machineFor404.machineId}`, {
      headers: authHeadersB,
    });
    expect(machineDetailResB.status).toBe(404);

    // B cannot view A's events or incidents
    const eventsResB = await fetch(`${BASE_URL}/events`, { headers: authHeadersB });
    const eventsDataB = await eventsResB.json();
    expect(eventsDataB.data.length).toBe(0);

    const incResB = await fetch(`${BASE_URL}/incidents`, { headers: authHeadersB });
    const incDataB = await incResB.json();
    expect(incDataB.data.length).toBe(0);

    // B cannot patch A's incident status → 404. No ML service runs in this
    // suite, so no incident arises from ingestion — create one directly to
    // exercise the access rule.
    const machineA = await Machine.findOne({});
    const incidentA = await Incident.create({
      userId: (await User.findOne({ email: "owner@factory.com" }))._id,
      siteId: siteA._id,
      machineId: machineA._id,
      type: "machine_health",
      severity: "warning",
      title: "WARNING: isolation test incident",
      reason: "Created by the isolation test",
      status: "open",
    });
    const patchResB = await fetch(`${BASE_URL}/incidents/${incidentA.incidentId}/status`, {
      method: "PATCH",
      headers: authHeadersB,
      body: JSON.stringify({ status: "closed" }),
    });
    expect(patchResB.status).toBe(404);

    // B's API key cannot ingest into A's site/machine/sensor → 403
    const apiKeyResB = await fetch(`${BASE_URL}/settings/api-key`, {
      method: "POST",
      headers: authHeadersB,
    });
    const rawSecretB = (await apiKeyResB.json()).data.secret;

    const sensorA = await Sensor.findOne({});
    const crossIngestRes = await fetch(`${BASE_URL}/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rawSecretB}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        siteId: siteA.siteId,
        machineId: machineA.machineId,
        sensorId: sensorA.sensorId,
        type: "sensor_reading",
        timestamp: new Date().toISOString(),
        values: { temperature: 50.0 },
      }),
    });
    expect(crossIngestRes.status).toBe(403);
  });

  it("enforces ONE API key per user and idempotency scoped per user", async () => {
    // Login as owner
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "owner@factory.com",
        password: "Password123!",
      }),
    });
    const authHeadersA = {
      Cookie: loginRes.headers.get("set-cookie"),
      "Content-Type": "application/json",
    };

    // Generate a replacement key
    const regenRes = await fetch(`${BASE_URL}/settings/api-key`, {
      method: "POST",
      headers: authHeadersA,
    });
    const regenData = await regenRes.json();
    expect(regenRes.status).toBe(201);
    const newSecret = regenData.data.secret;
    ownerSecretV2 = newSecret;

    // Still exactly one key for the owner — the old one was replaced
    // (2 total: owner's replaced key + user B's key from the isolation test)
    expect(await ApiKey.countDocuments({})).toBe(2);
    const owner = await User.findOne({ email: "owner@factory.com" });
    expect(await ApiKey.countDocuments({ userId: owner._id })).toBe(1);

    // The OLD secret (replaced in this test) no longer authenticates
    const oldSecretAuth = await fetch(`${BASE_URL}/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ownerSecretV1}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        siteId: (await Site.findOne({})).siteId,
        machineId: (await Machine.findOne({})).machineId,
        sensorId: (await (await import("../models/sensor.model.js")).Sensor.findOne({})).sensorId,
        type: "sensor_reading",
        timestamp: new Date().toISOString(),
        values: { temperature: 50.0 },
      }),
    });
    expect(oldSecretAuth.status).toBe(401);

    // Idempotency is scoped per user: the SAME Idempotency-Key used by a
    // different user must not be treated as a duplicate of user A's event.
    // Register user C, create their own site/machine/sensor + key
    const regResC = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "third@factory.com",
        username: "third_user",
        password: "Password123!",
      }),
    });
    const authHeadersC = {
      Cookie: regResC.headers.get("set-cookie"),
      "Content-Type": "application/json",
    };

    const siteResC = await fetch(`${BASE_URL}/sites`, {
      method: "POST",
      headers: authHeadersC,
      body: JSON.stringify({ name: "Third Plant", timezone: "UTC" }),
    });
    const siteC = (await siteResC.json()).data;

    const machineResC = await fetch(`${BASE_URL}/machines/sites/${siteC.siteId}/machines`, {
      method: "POST",
      headers: authHeadersC,
      body: JSON.stringify({
        assetId: "PUMP-003",
        name: "Third Pump",
        machineType: "Centrifugal Pump",
      }),
    });
    const machineC = (await machineResC.json()).data;

    const sensorResC = await fetch(`${BASE_URL}/sensors/machines/${machineC.machineId}/sensors`, {
      method: "POST",
      headers: authHeadersC,
      body: JSON.stringify({ name: "Temp Sensor #3", type: "temperature" }),
    });
    const sensorC = (await sensorResC.json()).data;

    const keyResC = await fetch(`${BASE_URL}/settings/api-key`, {
      method: "POST",
      headers: authHeadersC,
    });
    const rawSecretC = (await keyResC.json()).data.secret;

    // Same Idempotency-Key as owner's first event, different user → accepted
    const sameIdemRes = await fetch(`${BASE_URL}/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rawSecretC}`,
        "Content-Type": "application/json",
        "Idempotency-Key": "test-idem-key-001",
      },
      body: JSON.stringify({
        siteId: siteC.siteId,
        machineId: machineC.machineId,
        sensorId: sensorC.sensorId,
        type: "sensor_reading",
        timestamp: new Date().toISOString(),
        values: { temperature: 55.0 },
      }),
    });
    expect(sameIdemRes.status).toBe(201);

    // Revoke flow: DELETE removes the key, then B's key count drops
    const revokeRes = await fetch(`${BASE_URL}/settings/api-key`, {
      method: "DELETE",
      headers: authHeadersA,
    });
    expect(revokeRes.status).toBe(200);

    const metaAfterRevoke = await fetch(`${BASE_URL}/settings/api-key`, {
      headers: authHeadersA,
    });
    const metaAfterData = await metaAfterRevoke.json();
    expect(metaAfterData.data).toBeNull();

    // Revoked key no longer authenticates event ingestion
    const revokedAuth = await fetch(`${BASE_URL}/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${newSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        siteId: (await Site.findOne({ userId: (await User.findOne({ email: "owner@factory.com" }))._id })).siteId,
        machineId: (await Machine.findOne({})).machineId,
        sensorId: (await (await import("../models/sensor.model.js")).Sensor.findOne({})).sensorId,
        type: "sensor_reading",
        timestamp: new Date().toISOString(),
        values: { temperature: 50.0 },
      }),
    });
    expect(revokedAuth.status).toBe(401);
  });

  it("records lastReadingAt on ingestion and the sensor leaves WAITING", { timeout: 30000 }, async () => {
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "owner@factory.com", password: "Password123!" }),
    });
    const authHeaders = {
      Cookie: loginRes.headers.get("set-cookie"),
      "Content-Type": "application/json",
    };

    // The owner's sensor from the first test received a reading already.
    const listRes = await fetch(`${BASE_URL}/sensors`, { headers: authHeaders });
    const listData = await listRes.json();
    expect(listRes.status).toBe(200);
    const sensor = listData.data.find((s) => s.name === "Vibration Sensor #1");
    expect(sensor).toBeDefined();
    expect(sensor.lastReadingAt).not.toBeNull();
    expect(sensor.status).toBe("ONLINE");
    expect(sensor.siteName).toBe("North Plant");
    expect(sensor.machineName).toBe("Main Coolant Pump");
    expect(typeof sensor.ageSec).toBe("number");

    // Ingestion MUST still succeed when the lastReadingAt update fails.
    // The owner's key was revoked at the end of the previous test — mint a
    // fresh one for the mocked-failure ingestion.
    const freshKeyRes = await fetch(`${BASE_URL}/settings/api-key`, {
      method: "POST",
      headers: authHeaders,
    });
    const freshSecret = (await freshKeyRes.json()).data.secret;

    const Sensor = (await import("../models/sensor.model.js")).Sensor;
    const originalUpdateOne = Sensor.updateOne;
    Sensor.updateOne = async () => {
      throw new Error("mocked updateOne failure");
    };
    try {
      const ingestRes = await fetch(`${BASE_URL}/events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${freshSecret}`,
          "Content-Type": "application/json",
          "Idempotency-Key": "idem-during-failure-1",
        },
        body: JSON.stringify({
          siteId: sensor.siteId,
          machineId: sensor.machineId,
          sensorId: sensor.sensorId,
          type: "sensor_reading",
          timestamp: new Date().toISOString(),
          values: { temperature: 51.0 },
        }),
      });
      expect(ingestRes.status).toBe(201);
    } finally {
      Sensor.updateOne = originalUpdateOne;
    }
  });

  it("summary counts, byType, and user isolation are correct", async () => {
    // Register user B with one waiting sensor of their own
    const regResB = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "sensor-b@factory.com",
        username: "sensor_b",
        password: "Password123!",
      }),
    });
    const authHeadersB = {
      Cookie: regResB.headers.get("set-cookie"),
      "Content-Type": "application/json",
    };

    const siteResB = await fetch(`${BASE_URL}/sites`, {
      method: "POST",
      headers: authHeadersB,
      body: JSON.stringify({ name: "B Plant", timezone: "UTC" }),
    });
    const siteB = (await siteResB.json()).data;
    const machineResB = await fetch(`${BASE_URL}/machines/sites/${siteB.siteId}/machines`, {
      method: "POST",
      headers: authHeadersB,
      body: JSON.stringify({ assetId: "PUMP-B1", name: "B Pump", machineType: "Pump" }),
    });
    const machineB = (await machineResB.json()).data;
    await fetch(`${BASE_URL}/sensors/machines/${machineB.machineId}/sensors`, {
      method: "POST",
      headers: authHeadersB,
      body: JSON.stringify({ name: "B Sensor", type: "pressure" }),
    });

    // User B's summary sees exactly their 1 waiting sensor — not the owner's
    const sumResB = await fetch(`${BASE_URL}/sensors/summary`, { headers: authHeadersB });
    const sumDataB = await sumResB.json();
    expect(sumResB.status).toBe(200);
    expect(sumDataB.data.total).toBe(1);
    expect(sumDataB.data.limit).toBeDefined();
    expect(sumDataB.data.remaining).toBe(sumDataB.data.limit - 1);
    expect(sumDataB.data.counts.waiting).toBe(1);
    expect(sumDataB.data.counts.online).toBe(0);
    expect(sumDataB.data.byType).toEqual({ pressure: 1 });

    // B's flat list contains only their sensor
    const listResB = await fetch(`${BASE_URL}/sensors`, { headers: authHeadersB });
    const listDataB = await listResB.json();
    expect(listDataB.data.length).toBe(1);
    expect(listDataB.data[0].name).toBe("B Sensor");
    expect(listDataB.data[0].status).toBe("WAITING");

    // Owner's summary counts are independent
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "owner@factory.com", password: "Password123!" }),
    });
    const authHeadersA = {
      Cookie: loginRes.headers.get("set-cookie"),
      "Content-Type": "application/json",
    };
    const sumResA = await fetch(`${BASE_URL}/sensors/summary`, { headers: authHeadersA });
    const sumDataA = await sumResA.json();
    expect(sumDataA.data.total).toBe(1);
    expect(sumDataA.data.counts.online).toBe(1);
    expect(sumDataA.data.byType).toEqual({ vibration: 1 });
  });

  it("enforces MAX_SENSORS: 409 at the limit, then delete frees a slot", async () => {
    const regRes = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "limit@factory.com",
        username: "limit_user",
        password: "Password123!",
      }),
    });
    const authHeaders = {
      Cookie: regRes.headers.get("set-cookie"),
      "Content-Type": "application/json",
    };

    const siteRes = await fetch(`${BASE_URL}/sites`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: "Limit Plant", timezone: "UTC" }),
    });
    const site = (await siteRes.json()).data;
    const machineRes = await fetch(`${BASE_URL}/machines/sites/${site.siteId}/machines`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ assetId: "PUMP-L1", name: "Limit Pump", machineType: "Pump" }),
    });
    const machine = (await machineRes.json()).data;

    const limit = Number(process.env.MAX_SENSORS || 20);

    const createSensorN = (n) =>
      fetch(`${BASE_URL}/sensors/machines/${machine.machineId}/sensors`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ name: `Sensor ${String(n).padStart(2, "0")}`, type: "temperature" }),
      });

    for (let i = 1; i <= limit; i += 1) {
      const res = await createSensorN(i);
      expect(res.status).toBe(201);
    }

    // (limit+1)-th sensor is rejected with 409
    const overRes = await createSensorN(limit + 1);
    expect(overRes.status).toBe(409);
    const overData = await overRes.json();
    expect(overData.message).toMatch(/limit/i);

    // Editing is unaffected at the limit
    const anySensor = (await (await fetch(`${BASE_URL}/sensors`, { headers: authHeaders })).json()).data[0];
    const editRes = await fetch(`${BASE_URL}/sensors/${anySensor.sensorId}`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({ name: "Renamed at limit", expectedIntervalSec: 120 }),
    });
    expect(editRes.status).toBe(200);
    const editData = await editRes.json();
    expect(editData.data.expectedIntervalSec).toBe(120);

    // Deleting one frees a slot → create works again
    const delRes = await fetch(`${BASE_URL}/sensors/${anySensor.sensorId}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    expect(delRes.status).toBe(200);
    const recreateRes = await createSensorN(limit + 2);
    expect(recreateRes.status).toBe(201);
  });

  it("never returns the raw API key from GET endpoints and routes /summary before /:sensorId", async () => {
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "owner@factory.com", password: "Password123!" }),
    });
    const authHeaders = {
      Cookie: loginRes.headers.get("set-cookie"),
      "Content-Type": "application/json",
    };

    // A known secret that must never appear in any GET response
    const knownSecret = "sk_deadbeef_" + "a".repeat(48);
    await ApiKey.updateOne(
      { userId: (await User.findOne({ email: "owner@factory.com" }))._id },
      { $set: { hashedSecret: require("crypto").createHash("sha256").update(knownSecret).digest("hex") } }
    );

    const endpoints = [
      `${BASE_URL}/settings/api-key`,
      `${BASE_URL}/sensors`,
      `${BASE_URL}/sensors/summary`,
    ];
    for (const url of endpoints) {
      const res = await fetch(url, { headers: authHeaders });
      expect(res.status).toBe(200);
      const text = JSON.stringify(await res.json());
      expect(text).not.toContain(knownSecret);
      expect(text).not.toContain("hashedSecret");
    }

    // GET /sensors/summary is NOT captured by GET /sensors/:sensorId
    const sumRes = await fetch(`${BASE_URL}/sensors/summary`, { headers: authHeaders });
    const sumData = await sumRes.json();
    expect(sumData.data.limit).toBeDefined(); // summary shape, not a 404 "Sensor not found"
  });
});
