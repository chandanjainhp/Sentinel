import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import mongoose from "mongoose";
import app from "../app.js";
import { connectDatabases, disconnectDatabases } from "../db/index.js";
import { User } from "../models/user.model.js";

/**
 * Auth request validation.
 *
 * Before this suite existed, /auth/* had no schema: an invalid email or a
 * 1-character password created an account, missing fields fell through to
 * Mongoose/bcrypt as 500s, and an invalid reset token returned 489.
 *
 * Port 8107 (Bun), per the agreed test-port ranges.
 */

const PORT = 8107;
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

const register = async (suffix, overrides = {}) =>
  api("POST", "/auth/register", {
    body: {
      email: `val-${suffix}@factory.com`,
      username: `val_${suffix}`,
      password: "Password123!",
      ageConfirmed: true,
      ...overrides,
    },
  });

const cookies = (res) => res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  await connectDatabases();
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) await c.deleteMany({});
  server = app.listen(PORT);
});

afterAll(async () => {
  if (server) server.close();
  await disconnectDatabases();
});

describe("POST /auth/register — schema enforcement", () => {
  it("rejects a malformed email instead of creating the account", async () => {
    const res = await register("bad_email", { email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(await User.findOne({ username: "val_bad_email" })).toBeNull();
  });

  it("rejects a one-character password", async () => {
    const res = await register("short_pw", { password: "x" });
    expect(res.status).toBe(400);
    expect(await User.findOne({ username: "val_short_pw" })).toBeNull();
  });

  it("rejects a missing username with 400, not a 500", async () => {
    const before = await User.countDocuments();
    const res = await register("no_user", { username: undefined });
    expect(res.status).toBe(400);
    expect(await User.countDocuments()).toBe(before);
  });

  it("rejects a non-string email with 400, not a cast to '12345'", async () => {
    const res = await register("num_email", { email: 12345 });
    expect(res.status).toBe(400);
    expect(await User.findOne({ email: "12345" })).toBeNull();
  });

  it("returns the standard validation error shape", async () => {
    const res = await register("shape", { email: "nope" });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.message).toBe("Validation failed");
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors.some((e) => e.path.startsWith("body.email"))).toBe(true);
  });

  it("keeps the age gate's own statuses (403 for an explicit under-13 attestation)", async () => {
    const res = await register("under13", { ageConfirmed: false });
    expect(res.status).toBe(403);
  });

  it("ignores unexpected fields instead of mass-assigning privilege flags", async () => {
    const res = await register("extra", {
      role: "admin",
      isActive: false,
      tokenVersion: 99,
    });
    expect(res.status).toBe(201);
    const doc = await User.findOne({ username: "val_extra" });
    expect(doc.role).toBeUndefined();
    expect(doc.isActive).toBe(true);
    expect(doc.tokenVersion).toBe(0);
  });

  it("still registers and logs in a valid account", async () => {
    const reg = await register("ok");
    expect(reg.status).toBe(201);
    const login = await api("POST", "/auth/login", {
      body: { email: "val-ok@factory.com", password: "Password123!" },
    });
    expect(login.status).toBe(200);
    expect(cookies(login)).toContain("accessToken=");
  });
});

describe("POST /auth/login — schema enforcement", () => {
  it("returns 400 (not a bcrypt 500) when the password is missing", async () => {
    const res = await api("POST", "/auth/login", {
      body: { email: "val-ok@factory.com" },
    });
    expect(res.status).toBe(400);
  });
});

describe("OTP and password-reset routes", () => {
  it("verify-email rejects a non-string OTP with 400", async () => {
    const res = await api("POST", "/auth/verify-email", { body: { otp: 123 } });
    expect(res.status).toBe(400);
  });

  it("forgot-password rejects a missing email with 400 instead of selecting a user", async () => {
    const res = await api("POST", "/auth/forgot-password", { body: {} });
    expect(res.status).toBe(400);
  });

  it("reset-password rejects missing fields with 400", async () => {
    const res = await api("POST", "/auth/reset-password", { body: {} });
    expect(res.status).toBe(400);
  });

  it("reset-password returns 400 (not 489) for an unknown token", async () => {
    const res = await api("POST", "/auth/reset-password", {
      body: { otp: "000000", newPassword: "Password456!" },
    });
    expect(res.status).toBe(400);
  });

  it("change-password rejects a new password below the client's 8-character minimum", async () => {
    const reg = await register("chgpw");
    expect(reg.status).toBe(201);
    const res = await api("POST", "/auth/change-password", {
      cookie: cookies(reg),
      body: { oldPassword: "Password123!", newPassword: "short" },
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /auth/refresh-token — body shape", () => {
  it("rejects a non-string refresh token with 400", async () => {
    const res = await api("POST", "/auth/refresh-token", { body: { refreshToken: 123 } });
    expect(res.status).toBe(400);
  });

  it("keeps an empty body valid (the cookie is the normal path) and rejects it as unauthenticated", async () => {
    const res = await api("POST", "/auth/refresh-token", { body: {} });
    expect(res.status).toBe(401);
  });

  it("rejects a garbage token with 401, not 500", async () => {
    const res = await api("POST", "/auth/refresh-token", {
      body: { refreshToken: "not.a.jwt" },
    });
    expect(res.status).toBe(401);
  });
});

describe("auth boundary and invalid route ids", () => {
  it("change-password without a session is 401, not 400", async () => {
    const res = await api("POST", "/auth/change-password", {
      body: { oldPassword: "Password123!", newPassword: "Password456!" },
    });
    expect(res.status).toBe(401);
  });

  it("investigations/start without a session is 401", async () => {
    const res = await api("POST", "/investigations/start", {
      body: { nightDate: "2026-10-20" },
    });
    expect(res.status).toBe(401);
  });

  it("a garbage incident id is a 404 for the owning user, never a 500", async () => {
    const reg = await register("badid");
    expect(reg.status).toBe(201);
    const res = await api("GET", "/incidents/not-a-real-id", { cookie: cookies(reg) });
    expect(res.status).toBe(404);
  });
});
