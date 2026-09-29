import crypto from "node:crypto";
import { ApiError } from "../utils/api-error.js";

/**
 * Google Identity Services — backend ID-token verification.
 *
 * Verifies a Google-issued ID token following the official OpenID Connect
 * validation algorithm from Google's docs ("Validate an ID token"):
 *
 *   1. Signature — RS256 JWS verified against Google's public JWKS keys
 *   2. iss       — https://accounts.google.com (or accounts.google.com)
 *   3. aud       — GOOGLE_CLIENT_ID (audience binding)
 *   4. exp       — expiry, with small clock-skew leeway
 *   5. azp       — when present, must equal aud (single-audience tokens)
 *   6. email_verified — required before linking/creating by email claim
 *
 * No Google access/refresh tokens are requested or stored — this flow needs
 * only the ID token, so no GOOGLE_CLIENT_SECRET is required anywhere.
 *
 * Verification is implemented with node:crypto (RS256 = RSA-SHA256) against
 * Google's JWKS so no new auth dependency is added to server/package.json.
 * Discovery + JWKS results are cached per key id (`kid`) to avoid a network
 * round-trip on every login.
 */

const DISCOVERY_URL =
  "https://accounts.google.com/.well-known/openid-configuration";

// Clock-skew leeway when checking `exp`/`iat` (30s). Tokens expired by more
// than this are rejected; tokens are never accepted before `iat` - leeway.
const CLOCK_SKEW_LEEWAY_MS = 30_000;
// Google rotates signing keys; cached keys are re-fetched after this long.
const JWKS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const HTTP_TIMEOUT_MS = 10_000;

const jwksCache = {
  keysById: null,
  fetchedAt: 0,
};

const asString = (v) => (typeof v === "string" ? v : "");

/**
 * Resolve Google's JWKS URI from the OIDC discovery document, with a
 * conservative allow-list fallback to the well-known googleapis endpoint.
 */
async function resolveJwksUri() {
  // Tests override the discovery endpoint to point at a local JWKS stub.
  // The override is authoritative: a failed fetch is surfaced (no silent
  // fallback to the real Google endpoint) so network failures are testable.
  const overrideUrl = globalThis.__sentinelGoogleDiscoveryUrl;
  if (overrideUrl) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    const res = await fetch(overrideUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`Discovery fetch failed with status ${res.status}`);
    }
    const discovery = await res.json();
    const uri = asString(discovery?.jwks_uri);
    if (!uri) throw new Error("Discovery document contained no jwks_uri");
    return uri;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    const res = await fetch(DISCOVERY_URL, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const discovery = await res.json();
      const uri = asString(discovery?.jwks_uri);
      // Only follow https discovery results, or loopback http (used by the
      // local JWKS stub in tests). Never a redirect to plain http in prod.
      if (
        uri.startsWith("https://") ||
        uri.startsWith("http://127.0.0.1:") ||
        uri.startsWith("http://localhost:")
      ) {
        return uri;
      }
    }
  } catch {
    // Discovery unreachable — fall back to the well-known JWKS URL below.
  }
  return "https://www.googleapis.com/oauth2/v3/certs";
}

/** Convert a JWK set into a Map keyed by `kid`. */
function jwksToMap(jwks) {
  const map = new Map();
  for (const key of jwks?.keys ?? []) {
    if (key?.kid) map.set(key.kid, key);
  }
  return map;
}

async function fetchGoogleJwks() {
  if (
    jwksCache.keysById &&
    Date.now() - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS
  ) {
    return jwksCache.keysById;
  }

  const jwksUri = await resolveJwksUri();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  const res = await fetch(jwksUri, { signal: controller.signal });
  clearTimeout(timer);
  if (!res.ok) {
    throw new Error(`JWKS fetch failed with status ${res.status}`);
  }
  const jwks = await res.json();
  const map = jwksToMap(jwks);
  if (map.size === 0) throw new Error("JWKS contained no usable keys");

  jwksCache.keysById = map;
  jwksCache.fetchedAt = Date.now();
  return map;
}

/**
 * RS256 JWS verification for one JWK: builds the Node KeyObject from the JWK
 * params and compares the SHA-256 signature over the signing input.
 */
function verifyRs256Signature(jwk, signingInput, signatureB64Url) {
  const keyObject = crypto.createPublicKey({ key: jwk, format: "jwk" });
  return crypto.verify(
    "sha256",
    Buffer.from(signingInput),
    keyObject,
    signatureBufferFor(signatureB64Url),
  );
}

function signatureBufferFor(b64Url) {
  return Buffer.from(b64Url, "base64url");
}

/**
 * Verify a Google ID token and return its verified claims.
 *
 * @param {string} idToken Raw Google ID token (JWT) from GIS
 * @param {string} expectedAudience GOOGLE_CLIENT_ID the token must be bound to
 * @returns {Promise<{sub:string,email:string,emailVerified:boolean,name:string,picture:string,issuer:string}>}
 */
export async function verifyGoogleIdToken(idToken, expectedAudience) {
  if (typeof idToken !== "string" || idToken.split(".").length !== 3) {
    throw new ApiError(401, "Invalid Google token");
  }

  const [headerB64, payloadB64, signatureB64] = idToken.split(".");

  let header;
  try {
    header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
  } catch {
    throw new ApiError(401, "Invalid Google token");
  }

  // alg must be RS256 — Google signs with RS256; anything else is rejected
  // without attempting verification (prevents alg-confusion attacks).
  if (header?.alg !== "RS256") {
    throw new ApiError(401, "Unsupported Google token algorithm");
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    throw new ApiError(401, "Invalid Google token");
  }

  const kid = asString(header.kid);
  if (!kid) throw new ApiError(401, "Google token is missing a key id");

  const keysById = await fetchGoogleJwks();
  const jwk = keysById.get(kid);
  if (!jwk) {
    // Unknown kid: Google may have just rotated keys. One forced refresh is
    // allowed before rejecting (standard JWKS rotation behavior).
    jwksCache.keysById = null;
    jwksCache.fetchedAt = 0;
    const refreshed = await fetchGoogleJwks();
    const retryJwk = refreshed.get(kid);
    if (!retryJwk) {
      throw new ApiError(401, "Google token signed with an unknown key");
    }
    jwkCacheSwap(refreshed);
    if (!verifyRs256Signature(retryJwk, `${headerB64}.${payloadB64}`, signatureB64)) {
      throw new ApiError(401, "Invalid Google token signature");
    }
  } else if (
    !verifyRs256Signature(jwk, `${headerB64}.${payloadB64}`, signatureB64)
  ) {
    throw new ApiError(401, "Invalid Google token signature");
  }

  const now = Date.now();
  const expMs = Number(payload.exp) * 1000;
  const iatMs = Number(payload.iat) * 1000;

  if (!Number.isFinite(expMs) || expMs + CLOCK_SKEW_LEEWAY_MS < now) {
    throw new ApiError(401, "Google token has expired");
  }
  if (
    Number.isFinite(iatMs) &&
    iatMs - CLOCK_SKEW_LEEWAY_MS > now
  ) {
    throw new ApiError(401, "Google token issued in the future");
  }

  const aud = payload.aud;
  const audOk = Array.isArray(aud)
    ? aud.length === 1 && aud[0] === expectedAudience
    : aud === expectedAudience;
  if (!expectedAudience || !audOk) {
    // Wrong audience = token minted for a different OAuth client. Reject.
    throw new ApiError(401, "Google token audience mismatch");
  }

  const issuer = asString(payload.iss);
  const allowedIssuers = new Set([
    "https://accounts.google.com",
    "accounts.google.com",
  ]);
  if (!allowedIssuers.has(issuer)) {
    throw new ApiError(401, "Google token issuer mismatch");
  }

  const azp = payload.azp ? asString(payload.azp) : null;
  if (azp && azp !== expectedAudience) {
    // azp is the party the token was issued to; for single-audience tokens it
    // must match aud (per the OIDC spec Google follows).
    throw new ApiError(401, "Google token audience mismatch");
  }

  const sub = asString(payload.sub);
  const email = asString(payload.email).toLowerCase();
  const emailVerified = payload.email_verified === true;
  const name = asString(payload.name);
  const picture = asString(payload.picture);

  if (!sub) throw new ApiError(401, "Google token is missing the sub claim");

  return { sub, email, emailVerified, name, picture, issuer };
}

/** Small internal helper so unknown-kid refresh swaps the cache atomically. */
function jwkCacheSwap(map) {
  jwksCache.keysById = map;
  jwksCache.fetchedAt = Date.now();
}

/**
 * Test hook — tests point verification at a local JWKS server by overriding
 * the discovery/JWKS fetch. Overrides are cleared after each test file.
 */
export function __setGoogleDiscoveryOverride(url) {
  globalThis.__sentinelGoogleDiscoveryUrl = url;
}

export function __resetGoogleDiscoveryOverride() {
  delete globalThis.__sentinelGoogleDiscoveryUrl;
}

/** Test hook — drop all cached JWKS state between tests. */
export function __resetGoogleJwksCache() {
  jwksCache.keysById = null;
  jwksCache.fetchedAt = 0;
}
