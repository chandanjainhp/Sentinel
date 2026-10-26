import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import app from "../app.js";
import { connectDatabases, disconnectDatabases } from "../db/index.js";
import { User } from "../models/user.model.js";
import { Site } from "../models/site.model.js";
import { Machine } from "../models/machine.model.js";
import { Sensor } from "../models/sensor.model.js";
import ApiKey, { hashApiKeySecret } from "../models/apiKey.model.js";
import { accessTokenSecret } from "../config/secrets.js";

/**
 * Named API keys: create/list/rotate/revoke, ownership, secret hygiene and
 * gateway authentication (including revoked-key rejection).
 * Isolated database + Redis DB so it can run next to the other suites.
 */

const PORT = 8094;
const BASE = `http://localhost:${PORT}/api/v1`;
let server;

const swapPath = (url, path) => {
  const parsed = new URL(url);
  parsed.pathname = path;
  return parsed.toString();
};

const seeded = {};
const tokenFor = (user) =>
  jwt.sign(
    { _id: user._id, tokenVersion: user.tokenVersion ?? 0 },
    accessTokenSecret(),
    { expiresIn: "1h" }
  );

const request = (token, path, options = {}) =>
  fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

const ingest = (secret, body) =>
  fetch(`${BASE}/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  process.env.MONGODB_URL = swapPath(
    process.env.MONGODB_URL,
    "/sentinel_ci_api_keys"
  );
  process.env.REDIS_URL = swapPath(process.env.REDIS_URL, "/10");
  await connectDatabases();
  await mongoose.connection.dropDatabase();

  seeded.owner = await User.create({
    email: "keys-owner@factory.com",
    username: "keys_owner",
    password: "Password123!",
  });
  seeded.other = await User.create({
    email: "keys-other@factory.com",
    username: "keys_other",
    password: "Password123!",
  });
  seeded.site = await Site.create({
    userId: seeded.owner._id,
    name: "Keys Plant",
    timezone: "UTC",
  });
  seeded.machine = await Machine.create({
    userId: seeded.owner._id,
    siteId: seeded.site._id,
    assetId: "KEY-1",
    name: "Keys Motor",
    machineType: "Motor",
  });
  seeded.sensor = await Sensor.create({
    userId: seeded.owner._id,
    siteId: seeded.site._id,
    machineId: seeded.machine._id,
    name: "Keys Vibration",
    type: "vibration",
  });

  seeded.ownerToken = tokenFor(seeded.owner);
  seeded.otherToken = tokenFor(seeded.other);

  server = app.listen(PORT);
});

afterAll(async () => {
  if (server) server.close();
  await disconnectDatabases();
});

const reading = (overrides = {}) => ({
  siteId: seeded.site.siteId,
  machineId: seeded.machine.machineId,
  sensorId: seeded.sensor.sensorId,
  type: "sensor_reading",
  timestamp: new Date().toISOString(),
  values: { vibration: 1.4 },
  ...overrides,
});

describe("named API key management", () => {
  it("requires authentication", async () => {
    const res = await fetch(`${BASE}/settings/api-keys`);
    expect(res.status).toBe(401);
  });

  it("creates a key, returns the secret once and never leaks the hash", async () => {
    const res = await request(seeded.ownerToken, "/settings/api-keys", {
      method: "POST",
      body: JSON.stringify({ name: "North gate gateway" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.name).toBe("North gate gateway");
    expect(body.data.secret.startsWith("sk_")).toBe(true);
    expect(body.data.keyPrefix.length).toBeGreaterThan(3);
    expect(body.data.active).toBe(true);

    seeded.firstSecret = body.data.secret;
    seeded.firstKeyId = body.data.keyId;

    const stored = await ApiKey.findOne({ keyId: body.data.keyId }).lean();
    expect(stored).toBeTruthy();
    expect(stored.hashedSecret).toBe(hashApiKeySecret(body.data.secret));
    expect(stored.hashedSecret).not.toBe(body.data.secret);

    const list = await request(seeded.ownerToken, "/settings/api-keys");
    const listBody = await list.json();
    const listed = listBody.data.find((key) => key.keyId === seeded.firstKeyId);
    expect(listed).toBeTruthy();
    expect(listed.secret).toBeUndefined();
    expect(listed.hashedSecret).toBeUndefined();
    expect(JSON.stringify(listBody)).not.toContain(seeded.firstSecret);
  });

  it("lists only the authenticated user's keys", async () => {
    const other = await request(seeded.otherToken, "/settings/api-keys");
    const body = await other.json();
    expect(body.data).toEqual([]);
  });

  it("rejects a key scoped to another user's site", async () => {
    const res = await request(seeded.otherToken, "/settings/api-keys", {
      method: "POST",
      body: JSON.stringify({
        name: "Stolen site key",
        siteId: seeded.site.siteId,
      }),
    });
    expect(res.status).toBe(404);
  });

  it("authenticates ingestion and records lastUsedAt", async () => {
    const res = await ingest(seeded.firstSecret, reading());
    expect(res.status).toBe(201);

    const stored = await ApiKey.findOne({ keyId: seeded.firstKeyId }).lean();
    expect(stored.lastUsedAt).toBeTruthy();
  });

  it("rotates a key, immediately invalidating the old secret", async () => {
    const res = await request(
      seeded.ownerToken,
      `/settings/api-keys/${seeded.firstKeyId}/rotate`,
      { method: "POST" }
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.secret).toBeTruthy();
    expect(body.data.secret).not.toBe(seeded.firstSecret);

    seeded.rotatedSecret = body.data.secret;
    seeded.rotatedKeyId = body.data.keyId;

    const old = await ingest(seeded.firstSecret, reading());
    expect(old.status).toBe(401);

    const fresh = await ingest(seeded.rotatedSecret, reading());
    expect(fresh.status).toBe(201);

    const previous = await ApiKey.findOne({ keyId: seeded.firstKeyId }).lean();
    expect(previous.revokedAt).toBeTruthy();
  });

  it("revokes a key and rejects it on the next ingestion", async () => {
    const res = await request(
      seeded.ownerToken,
      `/settings/api-keys/${seeded.rotatedKeyId}`,
      { method: "DELETE" }
    );
    expect(res.status).toBe(200);

    const rejected = await ingest(seeded.rotatedSecret, reading());
    expect(rejected.status).toBe(401);

    const list = await request(seeded.ownerToken, "/settings/api-keys");
    const body = await list.json();
    const revoked = body.data.find((key) => key.keyId === seeded.rotatedKeyId);
    expect(revoked.active).toBe(false);
    expect(revoked.revokedAt).toBeTruthy();
  });

  it("refuses to rotate an already revoked key", async () => {
    const res = await request(
      seeded.ownerToken,
      `/settings/api-keys/${seeded.rotatedKeyId}/rotate`,
      { method: "POST" }
    );
    expect(res.status).toBe(400);
  });

  it("prevents cross-user rotation and revocation", async () => {
    const rotate = await request(
      seeded.otherToken,
      `/settings/api-keys/${seeded.firstKeyId}/rotate`,
      { method: "POST" }
    );
    expect(rotate.status).toBe(404);

    const revoke = await request(
      seeded.otherToken,
      `/settings/api-keys/${seeded.firstKeyId}`,
      { method: "DELETE" }
    );
    expect(revoke.status).toBe(404);
  });

  it("enforces the active-key limit and frees slots for revoked keys", async () => {
    for (let index = 0; index < 10; index += 1) {
      const res = await request(seeded.ownerToken, "/settings/api-keys", {
        method: "POST",
        body: JSON.stringify({ name: `Gateway ${index}` }),
      });
      expect(res.status).toBe(201);
    }

    const over = await request(seeded.ownerToken, "/settings/api-keys", {
      method: "POST",
      body: JSON.stringify({ name: "Gateway overflow" }),
    });
    expect(over.status).toBe(400);
    expect((await over.json()).message).toMatch(/limit/i);
  });

  it("keeps the legacy single-key endpoints working", async () => {
    const created = await request(seeded.ownerToken, "/settings/api-key", {
      method: "POST",
    });
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body.data.secret.startsWith("sk_")).toBe(true);
    expect(await ApiKey.countDocuments({ userId: seeded.owner._id })).toBe(1);

    const meta = await request(seeded.ownerToken, "/settings/api-key");
    expect(meta.status).toBe(200);
    const metaBody = await meta.json();
    expect(metaBody.data.keyPrefix).toBeTruthy();
    expect(metaBody.data.secret).toBeUndefined();

    const removed = await request(seeded.ownerToken, "/settings/api-key", {
      method: "DELETE",
    });
    expect(removed.status).toBe(200);
    expect(await ApiKey.countDocuments({ userId: seeded.owner._id })).toBe(0);
  });
});
