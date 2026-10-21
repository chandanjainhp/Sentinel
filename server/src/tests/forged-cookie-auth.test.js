import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import app from "../app.js";
import { connectDatabases, disconnectDatabases } from "../db/index.js";
import { startWorker, stopWorker } from "../queues/worker.js";
import { Site } from "../models/site.model.js";

/**
 * Regression: `ridgeway_auth=1` is set by JavaScript on login, so any visitor
 * can forge it. It must never be a credential — only the httpOnly JWT cookies
 * issued by the API prove identity. The Next middleware that gated routes on
 * this flag was deleted; these tests keep it gone.
 *
 * Port 8105 (Bun), per the agreed test-port ranges.
 */

const PORT = 8105;
const BASE_URL = `http://localhost:${PORT}/api/v1`;
let server;

// Exactly what an attacker can set from the console.
const FORGED_FLAG = "ridgeway_auth=1";

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
      email: `forged-${suffix}@factory.com`,
      username: `forged_${suffix}`,
      password: "Password123!",
      ageConfirmed: true,
    },
  });
  expect(res.status).toBe(201);
  const pairs = cookiePairs(res);
  return { access: pairs[0], refresh: pairs[1], setCookie: res.headers.getSetCookie() };
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

describe("forged client-side auth flag — not a credential", () => {
  it("a forged ridgeway_auth=1 cookie alone gets 401 from every protected API route", async () => {
    const attempts = [
      ["GET", "/sites"],
      ["GET", "/dashboard"],
      ["GET", "/auth/current-user"],
      ["POST", "/sites", { name: "Forged Plant", timezone: "UTC" }],
    ];

    for (const [method, route, body] of attempts) {
      const res = await api(method, route, { cookie: FORGED_FLAG, body });
      if (res.status !== 401) throw new Error(`${method} ${route} returned ${res.status}, expected 401`);
    }

    // The forged mutation must not have written anything.
    expect(await Site.countDocuments()).toBe(0);
  });

  it("a forged flag next to a garbage accessToken is still rejected", async () => {
    const res = await api("GET", "/sites", {
      cookie: `${FORGED_FLAG}; accessToken=not.a.jwt`,
    });
    expect(res.status).toBe(401);
  });

  it("no Next.js server module decides access from the forgeable flag", () => {
    const srcRoot = path.resolve(import.meta.dir, "../../../client/src");
    const offenders = [];

    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(js|jsx|ts|tsx|mjs)$/.test(entry.name)) {
          const source = fs.readFileSync(full, "utf8");
          // A server-side module (middleware, server component, route
          // handler) reading the flag would turn it back into a boundary.
          if (source.includes("ridgeway_auth") && /next\/(server|headers)/.test(source)) {
            offenders.push(path.relative(srcRoot, full));
          }
        }
      }
    };

    walk(srcRoot);
    expect(offenders).toEqual([]);
  });
});

describe("legitimate sessions are unaffected", () => {
  it("login issues httpOnly cookies the API accepts, with or without the flag cookie", async () => {
    const user = await register("session");
    const [accessSetCookie, refreshSetCookie] = user.setCookie;

    expect(accessSetCookie).toContain("accessToken=");
    expect(accessSetCookie).toContain("HttpOnly");
    expect(accessSetCookie).toContain("SameSite=Lax");
    expect(refreshSetCookie).toContain("refreshToken=");
    expect(refreshSetCookie).toContain("HttpOnly");

    const plain = await api("GET", "/auth/current-user", { cookie: user.access });
    expect(plain.status).toBe(200);
    expect((await plain.json()).data.email).toBe("forged-session@factory.com");

    // The flag cookie is inert: it neither grants nor breaks a real session.
    const withFlag = await api("GET", "/auth/current-user", {
      cookie: `${FORGED_FLAG}; ${user.access}`,
    });
    expect(withFlag.status).toBe(200);
  });

  it("refresh rotation still retires the old refresh token and keeps the session alive", async () => {
    const user = await register("rotate");
    // Refresh tokens have second-granularity iat: rotating within the same
    // second as register returns the identical token, hiding a broken rotation.
    await new Promise((r) => setTimeout(r, 1100));

    const rotated = await api("POST", "/auth/refresh-token", { cookie: user.refresh });
    expect(rotated.status).toBe(200);
    const [rotatedAccess, rotatedRefresh] = cookiePairs(rotated);

    expect((await api("GET", "/sites", { cookie: rotatedAccess })).status).toBe(200);
    expect((await api("POST", "/auth/refresh-token", { cookie: user.refresh })).status).toBe(401);
    expect((await api("POST", "/auth/refresh-token", { cookie: rotatedRefresh })).status).toBe(200);
  });

  it("logout clears the server-side refresh token", async () => {
    const user = await register("logout");

    const out = await api("POST", "/auth/logout", { cookie: user.access });
    expect(out.status).toBe(200);
    expect(out.headers.getSetCookie().join(";")).toContain("accessToken=;");

    // Refresh token stored on the user is cleared, so it can no longer mint sessions.
    expect((await api("POST", "/auth/refresh-token", { cookie: user.refresh })).status).toBe(401);
    // The forged flag does not resurrect the ended session either.
    expect((await api("GET", "/sites", { cookie: FORGED_FLAG })).status).toBe(401);
  });
});
