import { describe, it, expect, afterEach } from "bun:test";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";
import {
  accessTokenSecret,
  refreshTokenSecret,
  assertSecretsConfigured,
} from "../config/secrets.js";

/**
 * A fallback secret in production is a signing key anyone can read in the
 * repository: they could mint access and refresh tokens for any user id.
 * These tests pin the contract: production refuses, development/test keep
 * working without a .env.
 */

const ORIGINAL = {
  NODE_ENV: process.env.NODE_ENV,
  ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET,
  REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET,
};

const restore = (key, value) => {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
};

afterEach(() => {
  restore("NODE_ENV", ORIGINAL.NODE_ENV);
  restore("ACCESS_TOKEN_SECRET", ORIGINAL.ACCESS_TOKEN_SECRET);
  restore("REFRESH_TOKEN_SECRET", ORIGINAL.REFRESH_TOKEN_SECRET);
});

const user = () =>
  new User({
    email: "secrets@factory.com",
    username: "secrets",
    password: "Password123!",
  });

describe("JWT secret configuration", () => {
  it("keeps dev/test convenience: the fallback works without a .env", () => {
    process.env.NODE_ENV = "test";
    delete process.env.ACCESS_TOKEN_SECRET;
    delete process.env.REFRESH_TOKEN_SECRET;

    expect(accessTokenSecret()).toBe("default-secret-key");
    expect(refreshTokenSecret()).toBe("default-refresh-secret");
    expect(() => assertSecretsConfigured()).not.toThrow();
  });

  it("refuses to sign with the fallback in production", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ACCESS_TOKEN_SECRET;

    expect(() => accessTokenSecret()).toThrow(/ACCESS_TOKEN_SECRET/);
    expect(() => user().generateAccessToken()).toThrow(/ACCESS_TOKEN_SECRET/);
    expect(() => assertSecretsConfigured()).toThrow(/ACCESS_TOKEN_SECRET/);
  });

  it("refuses a missing refresh secret in production, even when the access secret is set", () => {
    process.env.NODE_ENV = "production";
    process.env.ACCESS_TOKEN_SECRET = "a".repeat(48);
    delete process.env.REFRESH_TOKEN_SECRET;

    expect(() => user().generateRefreshToken()).toThrow(/REFRESH_TOKEN_SECRET/);
    expect(() => assertSecretsConfigured()).toThrow(/REFRESH_TOKEN_SECRET/);
  });

  it("signs with the configured production secrets", () => {
    process.env.NODE_ENV = "production";
    process.env.ACCESS_TOKEN_SECRET = "production-access-secret-value";
    process.env.REFRESH_TOKEN_SECRET = "production-refresh-secret-value";

    expect(() => assertSecretsConfigured()).not.toThrow();

    const doc = user();
    const access = doc.generateAccessToken();
    const refresh = doc.generateRefreshToken();
    const decodedRefresh = jwt.verify(refresh, "production-refresh-secret-value");

    expect(jwt.verify(access, "production-access-secret-value")._id.toString()).toBe(
      doc._id.toString(),
    );
    // A refresh token is unique per issue (jti), not just per second.
    expect(decodedRefresh.jti).toBeDefined();
    expect(doc.generateRefreshToken()).not.toBe(refresh);
  });
});
