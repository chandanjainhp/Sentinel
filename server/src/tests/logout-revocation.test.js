import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import mongoose from "mongoose";
import app from "../app.js";
import { connectDatabases, disconnectDatabases } from "../db/index.js";
import { startWorker, stopWorker } from "../queues/worker.js";
import { User } from "../models/user.model.js";

/**
 * Logout must revoke, not just forget. Clearing the stored refresh token stops
 * new sessions, but the already-issued access token stays a valid bearer
 * credential until it expires (15m) unless the user's tokenVersion is bumped.
 * These tests pin immediate revocation, isolation between accounts, and the
 * login/refresh paths that must keep working afterwards.
 *
 * Port 8106 (Bun), per the agreed test-port ranges.
 */

const PORT = 8106;
const BASE_URL = `http://localhost:${PORT}/api/v1`;
let server;

const api = (method, route, { cookie, body } = {}) =>
  fetch(`${BASE_URL}${route}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

const cookiePairs = (res) => res.headers.getSetCookie().map((c) => c.split(";")[0]);

const register = async (suffix) => {
  const res = await api("POST", "/auth/register", {
    body: {
      email: `logout-${suffix}@factory.com`,
      username: `logout_${suffix}`,
      password: "Password123!",
      ageConfirmed: true,
    },
  });
  expect(res.status).toBe(201);
  const pairs = cookiePairs(res);
  return { access: pairs[0], refresh: pairs[1] };
};

const login = async (email) => {
  const res = await api("POST", "/auth/login", {
    body: { email, password: "Password123!" },
  });
  expect(res.status).toBe(200);
  const pairs = cookiePairs(res);
  return { access: pairs[0], refresh: pairs[1] };
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

describe("logout revokes access tokens immediately", () => {
  it("the access token used to log out stops working right away", async () => {
    const user = await register("immediate");
    expect((await api("GET", "/auth/current-user", { cookie: user.access })).status).toBe(200);

    const out = await api("POST", "/auth/logout", { cookie: user.access });
    expect(out.status).toBe(200);
    const cleared = out.headers.getSetCookie().join(";");
    expect(cleared).toContain("accessToken=;");
    expect(cleared).toContain("refreshToken=;");

    const stale = await api("GET", "/auth/current-user", { cookie: user.access });
    expect(stale.status).toBe(401);
    expect((await api("GET", "/sites", { cookie: user.access })).status).toBe(401);
  });

  it("the refresh token cannot revive the session or the old access token", async () => {
    const user = await register("revive");
    expect((await api("POST", "/auth/logout", { cookie: user.access })).status).toBe(200);

    expect((await api("POST", "/auth/refresh-token", { cookie: user.refresh })).status).toBe(401);
    expect((await api("GET", "/auth/current-user", { cookie: user.access })).status).toBe(401);
  });

  it("concurrent requests with the revoked token all fail, none leak through", async () => {
    const user = await register("concurrent");
    const logout = await api("POST", "/auth/logout", { cookie: user.access });
    expect(logout.status).toBe(200);

    const results = await Promise.all(
      Array.from({ length: 5 }, () => api("GET", "/sites", { cookie: user.access })),
    );
    expect(results.map((r) => r.status)).toEqual([401, 401, 401, 401, 401]);

    // A second logout with the same (now revoked) token is rejected, not 500.
    expect((await api("POST", "/auth/logout", { cookie: user.access })).status).toBe(401);
  });

  it("only the logging-out account is revoked", async () => {
    const a = await register("isolate-a");
    const b = await register("isolate-b");

    expect((await api("POST", "/auth/logout", { cookie: a.access })).status).toBe(200);

    expect((await api("GET", "/auth/current-user", { cookie: a.access })).status).toBe(401);
    const bStill = await api("GET", "/auth/current-user", { cookie: b.access });
    expect(bStill.status).toBe(200);
    expect((await bStill.json()).data.email).toBe("logout-isolate-b@factory.com");
  });

  it("logging back in after logout issues a working token and keeps the old one dead", async () => {
    const first = await register("relogin");
    const oldAccess = first.access;
    expect((await api("POST", "/auth/logout", { cookie: oldAccess })).status).toBe(200);

    const second = await login("logout-relogin@factory.com");
    expect((await api("GET", "/auth/current-user", { cookie: second.access })).status).toBe(200);
    expect((await api("GET", "/sites", { cookie: second.access })).status).toBe(200);

    // The pre-logout token was minted with the old tokenVersion.
    expect((await api("GET", "/auth/current-user", { cookie: oldAccess })).status).toBe(401);
  });

  it("tokens minted after logout carry the bumped version", async () => {
    const user = await register("version");
    const before = await User.findOne({ email: "logout-version@factory.com" });
    const versionBefore = before.tokenVersion;

    expect((await api("POST", "/auth/logout", { cookie: user.access })).status).toBe(200);

    const after = await User.findOne({ email: "logout-version@factory.com" });
    expect(after.tokenVersion).toBe(versionBefore + 1);

    const fresh = await login("logout-version@factory.com");
    expect((await api("GET", "/auth/current-user", { cookie: fresh.access })).status).toBe(200);
  });

  it("logout without a valid token is rejected (no unauthenticated revocation)", async () => {
    expect((await api("POST", "/auth/logout")).status).toBe(401);
    expect((await api("POST", "/auth/logout", { cookie: "accessToken=not.a.jwt" })).status).toBe(401);
  });
});
