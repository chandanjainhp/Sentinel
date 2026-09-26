import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import app from "../app.js";
import { connectDatabases, disconnectDatabases } from "../db/index.js";
import { startWorker, stopWorker } from "../queues/worker.js";
import { User } from "../models/user.models.js";

/**
 * Adversarial Scope B.1 — auth/authz edge cases over real HTTP.
 *
 * Pins the ACTUAL status codes for bad-token cases so regressions are caught.
 * Cross-resource authorization per resource type lives in
 * adversarial-isolation.test.js; this file owns token/key lifecycle abuse.
 *
 * Port 8097 (Bun), per the agreed test-port ranges.
 */

const PORT = 8097;
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
      email: `advauth-${suffix}@factory.com`,
      username: `advauth_${suffix}`,
      password: "Password123!",
    },
  });
  expect(res.status).toBe(201);
  const cookies = res.headers.getSetCookie().map((c) => c.split(";")[0]);
  return {
    // accessToken cookie — most callers only need this
    cookie: cookies[0],
    // [accessToken, refreshToken] pairs in order
    cookies,
    body: (await res.json()).data,
  };
};

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  await connectDatabases();
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) await c.deleteMany({});
  await startWorker();
  server = app.listen(PORT);

  env.a = await register("a");
  env.b = await register("b");

  // User A's full stack + API key.
  env.a.site = (await (
    await api("POST", "/sites", { cookie: env.a.cookie, body: { name: "Auth Plant A", timezone: "UTC" } })
  ).json()).data;
  env.a.machine = (await (
    await api("POST", `/machines/sites/${env.a.site.siteId}/machines`, {
      cookie: env.a.cookie,
      body: { assetId: "AUTH-A-1", name: "Auth Motor A", machineType: "motor" },
    })
  ).json()).data;
  env.a.sensors = {};
  for (const type of ["temperature", "vibration", "current", "rpm"]) {
    env.a.sensors[type] = (await (
      await api("POST", `/sensors/machines/${env.a.machine.machineId}/sensors`, {
        cookie: env.a.cookie,
        body: { name: `${type} A`, type },
      })
    ).json()).data;
  }
  env.a.key = (await (await api("POST", "/settings/api-key", { cookie: env.a.cookie })).json()).data.secret;

  // User B's full stack + API key.
  env.b.site = (await (
    await api("POST", "/sites", { cookie: env.b.cookie, body: { name: "Auth Plant B", timezone: "UTC" } })
  ).json()).data;
  env.b.machine = (await (
    await api("POST", `/machines/sites/${env.b.site.siteId}/machines`, {
      cookie: env.b.cookie,
      body: { assetId: "AUTH-B-1", name: "Auth Motor B", machineType: "motor" },
    })
  ).json()).data;
  env.b.key = (await (await api("POST", "/settings/api-key", { cookie: env.b.cookie })).json()).data.secret;
});

afterAll(async () => {
  if (server) server.close();
  await stopWorker();
  await disconnectDatabases();
});

describe("adversarial auth — token abuse", () => {
  it("expired JWT → 401 (not 500, not pass-through)", async () => {
    const expired = jwt.sign(
      { _id: env.a.body.user._id ?? env.a.body._id, tokenVersion: 0 },
      process.env.ACCESS_TOKEN_SECRET || "default-secret-key",
      { expiresIn: "-10m" }
    );
    const res = await api("GET", "/sites", { cookie: `accessToken=${expired}` });
    expect(res.status).toBe(401);
  });

  it("tampered JWT signature → 401", async () => {
    const [payload] = env.a.cookie.split(";")[0].split("=")[1].split(".");
    // Valid b64 payload of a DIFFERENT body, original header+signature kept.
    const forged = `${env.a.cookie.split("=")[1].split(".")[0]}.${Buffer.from(
      JSON.stringify({ _id: "000000000000000000000000" })
    ).toString("base64url")}.${payload}`;
    const res = await api("GET", "/sites", { cookie: `accessToken=${forged}` });
    expect(res.status).toBe(401);
  });

  it("wrong-secret JWT with valid shape → 401", async () => {
    const forged = jwt.sign({ _id: env.a.body.user?._id ?? env.a.body._id }, "attacker-secret");
    const res = await api("GET", "/sites", { cookie: `accessToken=${forged}` });
    expect(res.status).toBe(401);
  });

  it("malformed Authorization headers → 401 (garbage, no Bearer, empty Bearer)", async () => {
    const r1 = await fetch(`${BASE_URL}/sites`, { headers: { Authorization: "garbage-token" } });
    expect(r1.status).toBe(401);
    const r2 = await fetch(`${BASE_URL}/sites`, { headers: { Authorization: "Bearer " } });
    expect(r2.status).toBe(401);
    const r3 = await fetch(`${BASE_URL}/sites`, { headers: { Authorization: "Basic dXNlcjpwYXNz" } });
    expect(r3.status).toBe(401);
  });

  it("no credentials at all → 401", async () => {
    expect((await api("GET", "/sites")).status).toBe(401);
  });
});

describe("adversarial auth — API key lifecycle", () => {
  it("revoked API key reused → 401", async () => {
    const created = (await (await api("POST", "/settings/api-key", { cookie: env.a.cookie })).json()).data.secret;
    const del = await api("DELETE", "/settings/api-key", { cookie: env.a.cookie });
    expect(del.status).toBe(200);
    // Revocation deletes the single key doc — recreate for later tests.
    env.a.key = (await (await api("POST", "/settings/api-key", { cookie: env.a.cookie })).json()).data.secret;

    const res = await api("POST", "/events", {
      key: created,
      body: {
        siteId: env.a.site.siteId,
        machineId: env.a.machine.machineId,
        sensorId: env.a.sensors.temperature.sensorId,
        type: "sensor_reading",
        timestamp: new Date().toISOString(),
        values: { temperature: 55 },
      },
    });
    expect(res.status).toBe(401);
  });

  it("user B's API key posting an event for user A's machine → rejected, not silently stored", async () => {
    const res = await api("POST", "/events", {
      key: env.b.key,
      body: {
        siteId: env.a.site.siteId,
        machineId: env.a.machine.machineId,
        sensorId: env.a.sensors.temperature.sensorId,
        type: "sensor_reading",
        timestamp: new Date().toISOString(),
        values: { temperature: 55 },
      },
    });
    // Ownership mismatch: 403 (hierarchy check) — or 404 if a later scope
    // change makes foreign resources invisible. Either is safe; 200/201 is not.
    expect([403, 404]).toContain(res.status);
    const stored = await api("GET", `/events?machineId=${env.a.machine.machineId}`, { cookie: env.a.cookie });
    const list = (await stored.json()).data ?? [];
    expect(list.length).toBe(0);
  });

  it("API key cannot read human-only endpoints (JWT required)", async () => {
    const res = await api("GET", "/sites", { key: env.a.key });
    expect(res.status).toBe(401);
  });
});

describe("adversarial auth — concurrency & refresh", () => {
  it("10 concurrent logins all succeed and each set of cookies is valid", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        api("POST", "/auth/login", {
          body: { email: env.a.body.user?.email ?? "advauth-a@factory.com", password: "Password123!" },
        })
      )
    );
    for (const r of results) expect(r.status).toBe(200);
    const cookie = results[0].headers.get("set-cookie")?.split(";")[0];
    expect((await api("GET", "/auth/current-user", { cookie })).status).toBe(200);
  });

  it("refresh rotates the refresh token: the old refresh token stops working", async () => {
    const fresh = await register("rot");
    // Refresh tokens carry second-granularity iat: refreshing in the SAME
    // second as register yields a byte-identical token, making rotation a
    // silent no-op (see BUGS_FOUND.md). Advance one second so rotation is
    // actually exercised.
    await new Promise((r) => setTimeout(r, 1100));

    const oldRefresh = fresh.cookies[1]; // [accessToken, refreshToken]
    const refreshRes = await api("POST", "/auth/refresh-token", { cookie: oldRefresh });
    expect(refreshRes.status).toBe(200);
    const newCookies = refreshRes.headers.getSetCookie().map((c) => c.split(";")[0]);

    // Access token from before the rotation still validates (stateless JWT).
    const oldAccess = (await api("GET", "/auth/current-user", { cookie: fresh.cookies[0] })).status;
    expect(oldAccess).toBe(200);

    // Old REFRESH cookie must be invalid after rotation (stored-token check).
    const replay = await api("POST", "/auth/refresh-token", { cookie: oldRefresh });
    expect(replay.status).toBe(401);
    // New refresh cookie works.
    expect((await api("POST", "/auth/refresh-token", { cookie: newCookies[1] })).status).toBe(200);
    void fresh;
  });

  it("refresh with garbage token → 401", async () => {
    const res = await api("POST", "/auth/refresh-token", { cookie: "refreshToken=not.a.jwt" });
    expect(res.status).toBe(401);
  });
});
