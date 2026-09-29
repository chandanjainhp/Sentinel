import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import crypto from "node:crypto";
import http from "node:http";
import mongoose from "mongoose";
import app from "../app.js";
import { connectDatabases, disconnectDatabases } from "../db/index.js";
import { User } from "../models/user.models.js";
import {
  __setGoogleDiscoveryOverride,
  __resetGoogleDiscoveryOverride,
  __resetGoogleJwksCache,
} from "../services/google-auth.service.js";

/**
 * Google Identity Services auth — integration tests over real HTTP.
 *
 * The GIS ID-token flow is exercised end-to-end by pointing the service's
 * discovery override at a local JWKS stub: tokens are signed with a test RSA
 * key whose public half is served as a JWK. That way signature verification,
 * aud/iss/exp validation, account linking and session issuance are all tested
 * against the real code path (port 8096, per the agreed test-port ranges).
 */

const PORT = 8096;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

const GOOGLE_CLIENT_ID = "test-google-client-id.apps.googleusercontent.com";

let server;
let jwksServer;
let jwksServerPort;
let signingKey; // { privateKeyPem, jwk }

const api = (method, path, { cookie, body, headers = {} } = {}) =>
  fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

const b64url = (obj) =>
  Buffer.from(JSON.stringify(obj)).toString("base64url");

/** Mint an RS256 ID token signed with the test key. */
const makeIdToken = ({
  sub = "1234567890-google-sub",
  email = "g.user@example.com",
  email_verified = true,
  name = "Google User",
  picture = "https://lh3.googleusercontent.com/a/g.jpg",
  aud = GOOGLE_CLIENT_ID,
  iss = "https://accounts.google.com",
  expiresInSec = 600,
  issuedAtSec = Math.floor(Date.now() / 1000) - 5,
  alg = "RS256",
  kid = "test-key-1",
  signWithKey = null,
} = {}) => {
  const header = { alg, kid };
  const payload = {
    sub,
    email,
    email_verified,
    name,
    picture,
    aud,
    iss,
    iat: issuedAtSec,
    exp: issuedAtSec + expiresInSec,
  };
  const signingInput = `${b64url(header)}.${b64url(payload)}`;
  const key = crypto.createPrivateKey(signWithKey || signingKey.privateKeyPem);
  const signature = crypto.sign("sha256", Buffer.from(signingInput), key);
  return `${signingInput}.${signature.toString("base64url")}`;
};

const postGoogle = (credential, extra = {}) =>
  api("POST", "/auth/google", { body: { credential, ...extra } });

const firstCookie = (res) => res.headers.getSetCookie().map((c) => c.split(";")[0]);

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  // Provide the client id the controller checks before verification.
  process.env.GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID;

  // 1) Test signing key pair.
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" });
  const publicJwk = publicKey.export({ format: "jwk" });
  signingKey = { privateKeyPem, jwk: { ...publicJwk, kid: "test-key-1", alg: "RS256", use: "sig" } };

  // 2) Local JWKS + discovery stub over plain HTTP on loopback.
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
  __setGoogleDiscoveryOverride(`http://127.0.0.1:${jwksServerPort}/.well-known/openid-configuration`);

  // 3) App + DB.
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

describe("google auth — token verification", () => {
  it("rejects a missing credential with 400", async () => {
    const res = await api("POST", "/auth/google", { body: {} });
    expect(res.status).toBe(400);
  });

  it("rejects a malformed token with 401", async () => {
    const res = await postGoogle("not-a-jwt");
    expect(res.status).toBe(401);
  });

  it("rejects a token signed with an unknown key (bad signature) with 401", async () => {
    const other = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const forged = makeIdToken({
      signWithKey: other.privateKey.export({ type: "pkcs8", format: "pem" }),
    });
    const res = await postGoogle(forged);
    expect(res.status).toBe(401);
  });

  it("rejects an expired token with 401", async () => {
    const expired = makeIdToken({
      issuedAtSec: Math.floor(Date.now() / 1000) - 3600,
      expiresInSec: 600,
    });
    const res = await postGoogle(expired);
    expect(res.status).toBe(401);
  });

  it("rejects a wrong-audience token with 401", async () => {
    const wrongAud = makeIdToken({
      aud: "someone-elses-client-id.apps.googleusercontent.com",
    });
    const res = await postGoogle(wrongAud);
    expect(res.status).toBe(401);
  });

  it("rejects a non-Google issuer with 401", async () => {
    const evilIss = makeIdToken({ iss: "https://evil.example.com" });
    const res = await postGoogle(evilIss);
    expect(res.status).toBe(401);
  });

  it("rejects an unverified-email claim with 401 and creates no user", async () => {
    const before = await User.countDocuments();
    const res = await postGoogle(
      makeIdToken({ email_verified: false, sub: "unverified-sub-1" }),
    );
    expect(res.status).toBe(401);
    expect(await User.countDocuments()).toBe(before);
  });

  it("rejects unsupported JWT alg (alg-confusion) with 401", async () => {
    // Craft a token that claims alg=none / HS-style but carries an RS256 sig.
    const token = makeIdToken({ alg: "HS256" });
    const res = await postGoogle(token);
    expect(res.status).toBe(401);
  });
});

describe("google auth — account lifecycle", () => {
  it("creates a new Google-only user (no password, verified email) and returns session cookies", async () => {
    const res = await postGoogle(
      makeIdToken({ sub: "new-user-sub-1", email: "fresh.g@example.com" }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.user.email).toBe("fresh.g@example.com");
    expect(body.data.user.authProvider).toBe("google");
    expect(body.data.user.isEmailVerified).toBe(true);
    expect(body.data.user.password).toBeUndefined();

    const cookies = firstCookie(res);
    expect(cookies.length).toBe(2); // accessToken + refreshToken

    const dbUser = await User.findOne({ email: "fresh.g@example.com" });
    expect(dbUser.googleId).toBe("new-user-sub-1");
    expect(dbUser.authProvider).toBe("google");
    expect(dbUser.isEmailVerified).toBe(true);
    // No fake plaintext/hash password stored for Google-only accounts.
    expect(dbUser.password ?? "").toBe("");
  });

  it("logs an existing Google user back in without duplicating the account", async () => {
    const token = makeIdToken({ sub: "new-user-sub-1", email: "fresh.g@example.com" });
    const res = await postGoogle(token);
    expect(res.status).toBe(200);
    expect((await res.json()).data.user.email).toBe("fresh.g@example.com");
    expect(await User.countDocuments({ email: "fresh.g@example.com" })).toBe(1);
  });

  it("links an existing local account by verified Google email without touching its password", async () => {
    // Local user with a real password.
    const reg = await api("POST", "/auth/register", {
      body: {
        email: "local.link@example.com",
        username: "local_link",
        password: "Password123!",
      },
    });
    expect(reg.status).toBe(201);
    const localPasswordHashBefore = (await User.findOne({ email: "local.link@example.com" })).password;

    const res = await postGoogle(
      makeIdToken({
        sub: "link-sub-1",
        email: "local.link@example.com",
        name: "Local Link",
      }),
    );
    expect(res.status).toBe(200);

    const dbUser = await User.findOne({ email: "local.link@example.com" });
    expect(dbUser.googleId).toBe("link-sub-1");
    expect(dbUser.authProvider).toBe("local"); // provider unchanged
    expect(dbUser.password).toBe(localPasswordHashBefore); // hash untouched
    // The old password still works.
    expect(await dbUser.isPasswordCorrect("Password123!")).toBe(true);

    // Local login still works after linking.
    const loginRes = await api("POST", "/auth/login", {
      body: { email: "local.link@example.com", password: "Password123!" },
    });
    expect(loginRes.status).toBe(200);
  });

  it("rejects a Google sub claiming an email already linked to a different Google account (409)", async () => {
    // fresh.g@example.com is already linked to sub new-user-sub-1.
    const res = await postGoogle(
      makeIdToken({ sub: "attacker-sub-9", email: "fresh.g@example.com" }),
    );
    expect(res.status).toBe(409);
  });

  it("rejects sign-in for a disabled account with 403", async () => {
    await User.create({
      email: "disabled.g@example.com",
      username: "disabled_g",
      password: "Password123!",
      isActive: false,
    });
    const res = await postGoogle(
      makeIdToken({ sub: "disabled-sub-1", email: "disabled.g@example.com" }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 503 when GOOGLE_CLIENT_ID is not configured", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    try {
      const res = await postGoogle(makeIdToken({ sub: "never-persisted" }));
      expect(res.status).toBe(503);
    } finally {
      process.env.GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID;
    }
  });

  it("surfaces JWKS fetch failures as 502 without leaking internals", async () => {
    // Point discovery at a dead port, then restore.
    __setGoogleDiscoveryOverride("http://127.0.0.1:1/.well-known/openid-configuration");
    __resetGoogleJwksCache();
    try {
      const res = await postGoogle(makeIdToken({ sub: "jwks-fail-sub" }));
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.message).toBe("Could not verify Google token. Please try again.");
    } finally {
      __setGoogleDiscoveryOverride(`http://127.0.0.1:${jwksServerPort}/.well-known/openid-configuration`);
      __resetGoogleJwksCache();
    }
  });
});

describe("google auth — session integration", () => {
  it("issues a JWT session identical to normal login: refresh rotation + protected route + logout", async () => {
    const res = await postGoogle(
      makeIdToken({ sub: "session-sub-1", email: "session.g@example.com" }),
    );
    expect(res.status).toBe(200);
    const cookies = firstCookie(res);
    const [accessCookie, refreshCookie] = cookies;

    // Protected route works with the Google-issued access token.
    // (current-user returns the user object directly as ApiResponse.data.)
    const current = await api("GET", "/auth/current-user", { cookie: accessCookie });
    expect(current.status).toBe(200);
    expect((await current.json()).data.email).toBe("session.g@example.com");

    // Refresh rotation works exactly like the local flow. Sleep past one
    // second first: refresh tokens carry second-granularity iat, so rotating
    // in the same second yields a byte-identical (silent no-op) token.
    await new Promise((r) => setTimeout(r, 1100));
    const refresh = await api("POST", "/auth/refresh-token", { cookie: refreshCookie });
    expect(refresh.status).toBe(200);
    const rotated = firstCookie(refresh);
    expect(rotated[1]).not.toBe(refreshCookie);

    // Old refresh token is dead after rotation.
    const replay = await api("POST", "/auth/refresh-token", { cookie: refreshCookie });
    expect(replay.status).toBe(401);

    // Logout: same behavior as the local flow — the stored refresh token is
    // cleared (no further refresh possible). The stateless access token stays
    // valid until expiry, exactly like normal email/password sessions.
    const logout = await api("POST", "/auth/logout", { cookie: rotated[0] });
    expect(logout.status).toBe(200);
    const logoutUser = await User.findOne({ email: "session.g@example.com" });
    expect(logoutUser.refreshToken).toBe("");
    const postLogoutRefresh = await api("POST", "/auth/refresh-token", {
      cookie: rotated[1],
    });
    expect(postLogoutRefresh.status).toBe(401);
  });

  it("enforces tokenVersion invalidation for a Google session", async () => {
    const res = await postGoogle(
      makeIdToken({ sub: "tokenver-sub-1", email: "tokenver.g@example.com" }),
    );
    const accessCookie = firstCookie(res)[0];

    // Bump tokenVersion — all previously issued access tokens die.
    const dbUser = await User.findOne({ email: "tokenver.g@example.com" });
    dbUser.tokenVersion += 1;
    await dbUser.save({ validateBeforeSave: false });

    const stale = await api("GET", "/auth/current-user", { cookie: accessCookie });
    expect(stale.status).toBe(401);
  });
});
