import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import crypto from "node:crypto";
import http from "node:http";
import mongoose from "mongoose";
import app from "../app.js";
import { connectDatabases, disconnectDatabases } from "../db/index.js";
import { User } from "../models/user.model.js";
import {
  __setGoogleDiscoveryOverride,
  __resetGoogleDiscoveryOverride,
  __resetGoogleJwksCache,
} from "../services/google-auth.service.js";

/**
 * Age gate (13+) — integration tests over real HTTP.
 *
 * Every account-creation path (POST /auth/register, POST /auth/google
 * new-account provisioning) must enforce the 13+ requirement SERVER-SIDE
 * before any write. A rejected attempt must persist nothing: no user record,
 * no tokens, no profile fields. Existing accounts are grandfathered so
 * sign-in and linking keep working.
 *
 * Google tokens are minted locally and verified against a loopback JWKS stub
 * (same approach as google-auth.test.js) so the REAL verification code path
 * runs before the gate.
 */

const PORT = 8103;
const BASE_URL = `http://localhost:${PORT}/api/v1`;
const GOOGLE_CLIENT_ID = "test-google-client-id.apps.googleusercontent.com";

let server;
let jwksServer;
let jwksServerPort;
let signingKey;

const api = (method, path, { cookie, body } = {}) =>
  fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

const b64url = (obj) =>
  Buffer.from(JSON.stringify(obj)).toString("base64url");

/** Mint an RS256 Google ID token signed with the test key. */
const makeIdToken = ({
  sub,
  email,
  email_verified = true,
  name = "Google User",
} = {}) => {
  const header = { alg: "RS256", kid: "test-key-1" };
  const issuedAtSec = Math.floor(Date.now() / 1000) - 5;
  const payload = {
    sub,
    email,
    email_verified,
    name,
    picture: "https://lh3.googleusercontent.com/a/g.jpg",
    aud: GOOGLE_CLIENT_ID,
    iss: "https://accounts.google.com",
    iat: issuedAtSec,
    exp: issuedAtSec + 600,
  };
  const signingInput = `${b64url(header)}.${b64url(payload)}`;
  const key = crypto.createPrivateKey(signingKey.privateKeyPem);
  const signature = crypto.sign("sha256", Buffer.from(signingInput), key);
  return `${signingInput}.${signature.toString("base64url")}`;
};

/** UTC calendar date exactly `years` years before now, as YYYY-MM-DD. */
const yearsAgoUtc = (years) => {
  const now = new Date();
  return `${now.getUTCFullYear() - years}-${String(
    now.getUTCMonth() + 1,
  ).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
};

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID;

  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" });
  const publicJwk = publicKey.export({ format: "jwk" });
  signingKey = {
    privateKeyPem,
    jwk: { ...publicJwk, kid: "test-key-1", alg: "RS256", use: "sig" },
  };

  jwksServer = http.createServer((req, res) => {
    if (req.url.startsWith("/.well-known/openid-configuration")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          issuer: "https://accounts.google.com",
          jwks_uri: `http://127.0.0.1:${jwksServerPort}/.well-known/jwks.json`,
        }),
      );
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ keys: [signingKey.jwk] }));
  });
  await new Promise((resolve) => {
    jwksServer.listen(0, "127.0.0.1", () => {
      jwksServerPort = jwksServer.address().port;
      resolve();
    });
  });
  __setGoogleDiscoveryOverride(
    `http://127.0.0.1:${jwksServerPort}/.well-known/openid-configuration`,
  );

  await connectDatabases();
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) await c.deleteMany({});
  server = app.listen(PORT);
});

afterAll(async () => {
  if (server) server.close();
  __resetGoogleDiscoveryOverride();
  __resetGoogleJwksCache();
  delete process.env.GOOGLE_CLIENT_ID;
  await disconnectDatabases();
  if (jwksServer) jwksServer.close();
});

describe("age gate — POST /auth/register", () => {
  it("rejects a missing age confirmation with 400 and persists nothing", async () => {
    const res = await api("POST", "/auth/register", {
      body: {
        email: "gate.missing@example.com",
        username: "gate_missing",
        password: "Password123!",
      },
    });
    expect(res.status).toBe(400);
    expect(await User.findOne({ email: "gate.missing@example.com" })).toBeNull();
    expect(await User.findOne({ username: "gate_missing" })).toBeNull();
  });

  it("rejects an explicit under-13 attestation (ageConfirmed: false) with 403 and persists nothing", async () => {
    const res = await api("POST", "/auth/register", {
      body: {
        email: "gate.false@example.com",
        username: "gate_false",
        password: "Password123!",
        ageConfirmed: false,
      },
    });
    expect(res.status).toBe(403);
    expect(await User.findOne({ email: "gate.false@example.com" })).toBeNull();
  });

  it("rejects a date of birth proving the user is under 13 with 403 and persists nothing", async () => {
    const res = await api("POST", "/auth/register", {
      body: {
        email: "gate.child@example.com",
        username: "gate_child",
        password: "Password123!",
        dateOfBirth: yearsAgoUtc(10),
      },
    });
    expect(res.status).toBe(403);
    expect(await User.findOne({ email: "gate.child@example.com" })).toBeNull();
    expect(await User.findOne({ username: "gate_child" })).toBeNull();
  });

  it("rejects an impossible date of birth with 400 and persists nothing", async () => {
    const res = await api("POST", "/auth/register", {
      body: {
        email: "gate.invalid.dob@example.com",
        username: "gate_invalid_dob",
        password: "Password123!",
        dateOfBirth: "2015-02-30",
      },
    });
    expect(res.status).toBe(400);
    expect(
      await User.findOne({ email: "gate.invalid.dob@example.com" }),
    ).toBeNull();
  });

  it("accepts ageConfirmed: true and creates the account", async () => {
    const res = await api("POST", "/auth/register", {
      body: {
        email: "gate.ok@example.com",
        username: "gate_ok",
        password: "Password123!",
        ageConfirmed: true,
      },
    });
    expect(res.status).toBe(201);
    const dbUser = await User.findOne({ email: "gate.ok@example.com" });
    expect(dbUser).not.toBeNull();
    expect(dbUser.username).toBe("gate_ok");
  });

  it("accepts a date of birth on the 13th birthday", async () => {
    const res = await api("POST", "/auth/register", {
      body: {
        email: "gate.exactly13@example.com",
        username: "gate_exactly13",
        password: "Password123!",
        dateOfBirth: yearsAgoUtc(13),
      },
    });
    expect(res.status).toBe(201);
    expect(
      await User.findOne({ email: "gate.exactly13@example.com" }),
    ).not.toBeNull();
  });

  it("accepts a date of birth proving 13+ even without the checkbox", async () => {
    const res = await api("POST", "/auth/register", {
      body: {
        email: "gate.dob.adult@example.com",
        username: "gate_dob_adult",
        password: "Password123!",
        dateOfBirth: yearsAgoUtc(30),
      },
    });
    expect(res.status).toBe(201);
    expect(
      await User.findOne({ email: "gate.dob.adult@example.com" }),
    ).not.toBeNull();
  });
});

describe("age gate — POST /auth/google (new account provisioning)", () => {
  it("rejects sign-up without age evidence with 400 and persists nothing", async () => {
    const credential = makeIdToken({
      sub: "age-gate-sub-1",
      email: "g.kid@example.com",
    });
    const res = await api("POST", "/auth/google", {
      body: { credential },
    });
    expect(res.status).toBe(400);
    expect(await User.findOne({ googleId: "age-gate-sub-1" })).toBeNull();
    expect(await User.findOne({ email: "g.kid@example.com" })).toBeNull();
  });

  it("rejects an under-13 date of birth with 403 and persists nothing", async () => {
    const credential = makeIdToken({
      sub: "age-gate-sub-2",
      email: "g.kid2@example.com",
    });
    const res = await api("POST", "/auth/google", {
      body: { credential, dateOfBirth: yearsAgoUtc(9) },
    });
    expect(res.status).toBe(403);
    expect(await User.findOne({ googleId: "age-gate-sub-2" })).toBeNull();
    expect(await User.findOne({ email: "g.kid2@example.com" })).toBeNull();
  });

  it("provisions the account when ageConfirmed: true", async () => {
    const credential = makeIdToken({
      sub: "age-gate-sub-3",
      email: "g.adult@example.com",
    });
    const res = await api("POST", "/auth/google", {
      body: { credential, ageConfirmed: true },
    });
    expect(res.status).toBe(200);
    const dbUser = await User.findOne({ googleId: "age-gate-sub-3" });
    expect(dbUser).not.toBeNull();
    expect(dbUser.email).toBe("g.adult@example.com");
  });

  it("grandfathers existing Google users — sign-in works without re-confirmation", async () => {
    const credential = makeIdToken({
      sub: "age-gate-sub-3",
      email: "g.adult@example.com",
    });
    const res = await api("POST", "/auth/google", {
      body: { credential },
    });
    expect(res.status).toBe(200);
    const count = await User.countDocuments({ googleId: "age-gate-sub-3" });
    expect(count).toBe(1);
  });

  it("grandfathers existing local accounts — first Google link-in needs no re-confirmation", async () => {
    // Registered (and therefore age-gated) earlier via /auth/register.
    const credential = makeIdToken({
      sub: "age-gate-sub-link",
      email: "gate.ok@example.com",
    });
    const res = await api("POST", "/auth/google", {
      body: { credential },
    });
    expect(res.status).toBe(200);
    const dbUser = await User.findOne({ email: "gate.ok@example.com" });
    expect(dbUser.googleId).toBe("age-gate-sub-link");
  });
});
