import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import app from "../app.js";
import { connectDatabases, disconnectDatabases } from "../db/index.js";
import { startWorker, stopWorker } from "../queues/worker.js";
import { User } from "../models/user.model.js";

/**
 * Refresh-token rotation regressions.
 *
 *  - Two tokens minted in the same second must differ (a JWT's iat has
 *    second granularity, so a payload of only `_id` produced identical
 *    strings; rotation then "replaced" the token with itself and the old one
 *    stayed replayable forever).
 *  - A token that was already rotated must be rejected, including when the
 *    replay arrives after a later rotation.
 *  - Two concurrent refreshes with the same token: exactly one succeeds.
 *
 * Port 8109 (Bun), per the agreed test-port ranges.
 */

const PORT = 8109;
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

const cookieFor = (res, name) => {
  const pair = res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
  return pair ? pair.split(";")[0].slice(name.length + 1) : "";
};

const register = async (suffix) => {
  const res = await api("POST", "/auth/register", {
    body: {
      email: `refresh-${suffix}@factory.com`,
      username: `refresh_${suffix}`,
      password: "Password123!",
      ageConfirmed: true,
    },
  });
  expect(res.status).toBe(201);
  return {
    access: cookieFor(res, "accessToken"),
    refresh: cookieFor(res, "refreshToken"),
  };
};

const refresh = (refreshToken) =>
  api("POST", "/auth/refresh-token", { cookie: `refreshToken=${refreshToken}` });

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  await connectDatabases();
  for (const c of await (await import("mongoose")).default.connection.db.collections()) {
    await c.deleteMany({});
  }
  await startWorker();
  server = app.listen(PORT);
});

afterAll(async () => {
  if (server) server.close();
  await stopWorker();
  await disconnectDatabases();
});

describe("refresh-token rotation", () => {
  it("issues a different token even when both are minted in the same second", async () => {
    const user = await register("same-second");

    // No delay: iat is identical, so this is the collision case.
    const rotated = await refresh(user.refresh);
    expect(rotated.status).toBe(200);

    const newRefresh = cookieFor(rotated, "refreshToken");
    expect(newRefresh).not.toBe(user.refresh);
    expect(newRefresh).not.toBe("");

    // The presented token is now dead.
    expect((await refresh(user.refresh)).status).toBe(401);

    // The new one works.
    expect((await refresh(newRefresh)).status).toBe(200);
  });

  it("rejects a token after a later rotation has already happened", async () => {
    const user = await register("late-replay");

    const first = await refresh(user.refresh);
    expect(first.status).toBe(200);
    const second = await refresh(cookieFor(first, "refreshToken"));
    expect(second.status).toBe(200);

    // Original token replayed only after two successful rotations.
    expect((await refresh(user.refresh)).status).toBe(401);
    // And the middle token is dead too.
    expect((await refresh(cookieFor(first, "refreshToken"))).status).toBe(401);
  });

  it("lets exactly one of two concurrent refreshes succeed", async () => {
    const user = await register("concurrent");

    const results = await Promise.all([refresh(user.refresh), refresh(user.refresh)]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 401]);

    const winner = results.find((r) => r.status === 200);
    const winningToken = cookieFor(winner, "refreshToken");
    const stored = await User.findOne({ email: "refresh-concurrent@factory.com" });

    // The database holds the winner's token, and only that token keeps working.
    expect(stored.refreshToken).toBe(winningToken);
    expect((await refresh(winningToken)).status).toBe(200);
    expect((await refresh(user.refresh)).status).toBe(401);
  });
});
