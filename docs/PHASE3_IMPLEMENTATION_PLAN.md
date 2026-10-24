# Sentinel Phase 3: Security Hardening & Multi-Instance Reliability

**Version:** 1.0  
**Date:** 2026-10-22  
**Branch:** fix/briefings-hardening  
**Status:** Implementation in progress

---

## Executive Summary

Phase 3 focuses on **security hardening** and **multi-instance reliability** to prepare Sentinel for production deployment. This document outlines the implementation plan based on the audit of existing code from Phase 1 and Phase 2.

---

## Current State Analysis

### Security Hardening Status

✅ **Already Implemented:**
- Secrets validation at startup (`assertSecretsConfigured`) - fails fast if missing
- CSRF protection middleware for cookie-based auth
- Rate limiting with Redis backing (global and per-endpoint)
- Helmet for default security headers
- CORS with configurable origins
- Secure cookie configuration (HttpOnly, Secure in production, SameSite=Lax)
- JWT token rotation with versioning
- Input validation via express-validator and Zod
- MongoDB sanitization
- Logging with pino (no sensitive data in default serializers)

⚠️ **Needs Enhancement:**
- HTTP security headers customization (CSP, HSTS, frame options)
- Session lifetime and refresh token expiration
- Cookie attributes consistency across all endpoints
- Webhook and internal-service endpoint authentication
- Sensitive data filtering in logs
- Authentication failure handling

❌ **Not Yet Implemented:**
- Multi-instance coordination for race-prone operations
- MongoDB unique constraints for cross-process deduplication
- Redis-based distributed locking

### Multi-Instance Reliability Status

✅ **Already Working:**
- Redis-backed rate limiting works across instances
- BullMQ queues provide distributed job processing
- MongoDB connection pooling supports multiple instances

⚠️ **Needs Fixing:**
- `machineChains` Map in `incident.service.js` is process-local only
- No unique index to prevent duplicate incidents across replicas
- Investigation queue name consistency fixed but needs verification

❌ **Not Yet Implemented:**
- Distributed locking for concurrent operations
- MongoDB transactions for atomic operations
- Cross-process idempotency guarantees

---

## Implementation Plan

### Task 1: Security Headers Hardening

**Files to Modify:**
- `server/src/middlewares/security.middleware.js` (NEW)
- `server/src/app.js`

**Changes:**
1. Create custom security middleware with:
   - Content Security Policy (CSP) - configurable via env vars
   - HTTP Strict Transport Security (HSTS) - disabled by default, opt-in via env
   - X-Content-Type-Options: nosniff
   - X-Frame-Options: DENY
   - X-XSS-Protection: 1; mode=block
   - Referrer-Policy: strict-origin-when-cross-origin
   - Permissions-Policy: restrict camera, microphone, geolocation
   - Cross-Origin-Opener-Policy: same-origin
   - Cross-Origin-Resource-Policy: same-origin

2. Update app.js to use custom security middleware instead of plain helmet()

**Environment Variables:**
```bash
# Security Headers
SECURITY_CSP_ENABLED=true
SECURITY_CSP_DIRECTIVES="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://api.sentinel.com wss://api.sentinel.com; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self';"
SECURITY_HSTS_ENABLED=false  # Disable by default, enable in production with proper certs
SECURITY_HSTS_MAX_AGE=31536000
SECURITY_HSTS_INCLUDE_SUBDOMAINS=false
SECURITY_HSTS_PRELOAD=false
```

**Deployment Prerequisites:**
- HSTS should only be enabled after confirming:
  - All subdomains support HTTPS
  - TLS certificates are valid and automatically renewed
  - No mixed content issues exist
  - Backup/rollback plan for HSTS preload submission
- CSP should be tested in report-only mode first

### Task 2: Session and Cookie Hardening

**Files to Review/Modify:**
- `server/src/controllers/auth.controller.js`
- `server/src/config/cookies.js` (NEW)

**Changes:**
1. Create centralized cookie configuration with environment overrides:
   ```javascript
   // Cookie configuration constants
   export const COOKIE_OPTIONS = {
     httpOnly: true,
     secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',
     sameSite: process.env.COOKIE_SAME_SITE || 'lax',
     maxAge: Number(process.env.ACCESS_TOKEN_COOKIE_MAX_AGE_MS || 900000), // 15 minutes
     path: '/',
     domain: process.env.COOKIE_DOMAIN || undefined,
   };
   
   export const REFRESH_COOKIE_OPTIONS = {
     httpOnly: true,
     secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',
     sameSite: process.env.COOKIE_SAME_SITE || 'lax',
     maxAge: Number(process.env.REFRESH_TOKEN_COOKIE_MAX_AGE_MS || 604800000), // 7 days
     path: '/',
     domain: process.env.COOKIE_DOMAIN || undefined,
   };
   ```

2. Add session lifetime configuration:
   - ACCESS_TOKEN_EXPIRY: 15m (configurable)
   - REFRESH_TOKEN_EXPIRY: 7d (configurable)
   - Session inactivity timeout
   - Absolute session maximum lifetime

3. Ensure all cookie settings are consistent across all auth endpoints

**Environment Variables:**
```bash
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d
ACCESS_TOKEN_COOKIE_MAX_AGE_MS=900000
REFRESH_TOKEN_COOKIE_MAX_AGE_MS=604800000
COOKIE_SECURE=true
COOKIE_SAME_SITE=lax
COOKIE_DOMAIN=
```

### Task 3: Sensitive Data Protection

**Files to Review/Modify:**
- `server/src/utils/logger.js`
- `server/src/middlewares/error.middleware.js`
- All controller files

**Changes:**
1. Add log filtering middleware to prevent sensitive data in logs:
   - Mask JWT tokens
   - Mask passwords
   - Mask API keys
   - Mask credit card numbers
   - Mask SSN and other PII

2. Update error middleware to filter sensitive data from error responses

3. Add response filtering to prevent secrets in client responses

**Environment Variables:**
```bash
LOG_FILTER_SENSITIVE_DATA=true
ERROR_RESPONSE_FILTER_SENSITIVE=true
```

### Task 4: Webhook and Internal Service Hardening

**Files to Review:**
- `server/src/queues/webhook.queue.js`
- `server/src/models/webhookDelivery.model.js`
- All internal service endpoints

**Changes:**
1. Audit all webhook endpoints for:
   - Authentication requirements
   - Authorization checks
   - Replay protection (nonce/timestamp)
   - Request validation

2. Add internal service authentication:
   - API key validation for service-to-service calls
   - Mutual TLS if configured
   - IP allowlist for internal endpoints

### Task 5: Multi-Instance Concurrency Controls

**Files to Modify:**
- `server/src/services/incident.service.js`
- `server/src/models/incident.model.js`
- `server/src/db/redis.js` (add locking utilities)
- `server/src/utils/locking.js` (NEW)

**Changes:**

1. **Add MongoDB unique index for incident deduplication:**
   ```javascript
   // In incident.model.js
   incidentSchema.index({
     machineId: 1,
     status: 1,
   }, {
     unique: true,
     partialFilterExpression: {
       status: { $in: ["open", "reviewed"] },
     },
   });
   ```
   
   **Migration Required:** Before adding this index, check for existing duplicates:
   ```javascript
   // Run this in a maintenance window
   const duplicates = await Incident.aggregate([
     { $match: { status: { $in: ["open", "reviewed"] } } },
     { $group: { _id: "$machineId", n: { $sum: 1 }, ids: { $push: "$_id" } } },
     { $match: { n: { $gt: 1 } } },
   ]);
   
   // Close extras or merge them before building index
   ```

2. **Replace process-local machineChains with Redis-based locking:**
   ```javascript
   // NEW: server/src/utils/locking.js
   import { getRedis } from "../db/redis.js";
   
   const LOCK_PREFIX = "sentinel:lock:";
   const LOCK_TTL_SECONDS = 30; // Auto-release after 30 seconds
   
   export const acquireLock = async (key, ttlMs = 30000) => {
     const redis = getRedis();
     if (!redis) return null;
     
     const lockKey = `${LOCK_PREFIX}${key}`;
     const lockValue = crypto.randomUUID();
     const ttlSeconds = Math.ceil(ttlMs / 1000);
     
     // Set with NX (only if not exists) and EX (expiry)
     const acquired = await redis.set(lockKey, lockValue, 'NX', 'EX', ttlSeconds);
     
     if (acquired === 'OK') {
       return lockValue;
     }
     return null;
   };
   
   export const releaseLock = async (key, lockValue) => {
     const redis = getRedis();
     if (!redis) return false;
     
     const lockKey = `${LOCK_PREFIX}${key}`;
     
     // Use Lua script for atomic check-and-delete
     const script = `
       if redis.call("GET", KEYS[1]) == ARGV[1] then
         return redis.call("DEL", KEYS[1])
       else
         return 0
       end
     `;
     
     const result = await redis.eval(script, 1, lockKey, lockValue);
     return result === 1;
   };
   
   export const withLock = async (key, fn, ttlMs = 30000) => {
     const lockValue = await acquireLock(key, ttlMs);
     if (!lockValue) {
       throw new Error(`Could not acquire lock for ${key}`);
     }
     
     try {
       return await fn();
     } finally {
       await releaseLock(key, lockValue).catch(() => {});
     }
   };
   ```

3. **Update incident.service.js to use distributed locking:**
   ```javascript
   // Replace machineChains Map with Redis-based locking
   import { withLock } from "../utils/locking.js";
   
   export const createIncidentIfEligible = async (params) => {
     const lockKey = `incident:machine:${String(params.machine?._id ?? params.machine?.machineId)}`;
     return withLock(lockKey, () => createIncidentIfEligibleUnsafe(params), 5000);
   };
   ```

4. **Add retry logic for duplicate key errors:**
   ```javascript
   // In createIncidentIfEligibleUnsafe
   try {
     const incident = await Incident.create({...});
     return incident;
   } catch (error) {
     if (error.code === 11000) {
       // Duplicate key - another instance created the incident
       // Retry as update on existing incident
       const existing = await Incident.findOne({
         userId: machine.userId,
         machineId: machine._id,
         status: { $in: ["open", "reviewed"] },
       }).sort({ createdAt: -1 });
       
       if (existing) {
         // Update existing incident
         return updateExistingIncident(existing, params);
       }
       throw error;
     }
     throw error;
   }
   ```

### Task 6: Idempotency Enhancement

**Files to Review:**
- `server/src/services/event.service.js`
- `server/src/routes/event.routes.js`
- All endpoints that need idempotency

**Changes:**
1. Verify event idempotency implementation works across instances
2. Add idempotency key validation middleware for POST requests
3. Create centralized idempotency key storage (Redis)

### Task 7: Adversarial Regression Tests

**Files to Create:**
- `server/src/tests/adversarial-phase3.test.js` (NEW)
- `server/src/tests/multi-instance-concurrency.test.js` (NEW)
- `server/src/tests/security-headers.test.js` (NEW)
- `server/src/tests/cross-user-isolation.test.js` (NEW)

**Tests to Add:**

1. **Multi-Instance Concurrency Tests:**
   ```javascript
   describe("Multi-instance concurrency", () => {
     it("should create only one incident for concurrent requests from multiple processes", async () => {
       // Simulate multiple processes hitting the same endpoint
       const promises = [];
       for (let i = 0; i < 5; i++) {
         promises.push(
           fetch(`${BASE_URL}/events`, {
             method: "POST",
             headers: { Cookie: userACookie },
             body: JSON.stringify(eventData),
           })
         );
       }
       
       const responses = await Promise.all(promises);
       // Only one event should be created (idempotency)
       const events = await Event.countDocuments({ idempotencyKey });
       expect(events).toBe(1);
     });
   });
   ```

2. **Refresh Token Reuse Tests:**
   ```javascript
   describe("Refresh token security", () => {
     it("should reject reused refresh tokens", async () => {
       const token = user.refreshToken;
       
       // First refresh succeeds
       const res1 = await fetch(`${BASE_URL}/auth/refresh-token`, {
         method: "POST",
         headers: { Cookie: `refreshToken=${token}` },
       });
       expect(res1.status).toBe(200);
       
       // Second refresh with same token should fail
       const res2 = await fetch(`${BASE_URL}/auth/refresh-token`, {
         method: "POST",
         headers: { Cookie: `refreshToken=${token}` },
       });
       expect(res2.status).toBe(401);
     });
   });
   ```

3. **Cross-User Access Tests:**
   ```javascript
   describe("Cross-user access prevention", () => {
     it("should prevent User A from accessing User B's resources", async () => {
       const res = await fetch(`${BASE_URL}/incidents`, {
         method: "GET",
         headers: { Cookie: userACookie },
       });
       
       const incidents = await res.json();
       // Should only return User A's incidents
       incidents.data.every(i => String(i.userId) === String(userA._id));
     });
   });
   ```

4. **CSRF Protection Tests:**
   ```javascript
   describe("CSRF protection", () => {
     it("should reject POST without Origin header when using cookies", async () => {
       const res = await fetch(`${BASE_URL}/sites`, {
         method: "POST",
         headers: { Cookie: userACookie },
         // No Origin header
       });
       expect(res.status).toBe(403);
     });
   });
   ```

5. **Rate Limit Tests:**
   ```javascript
   describe("Rate limiting", () => {
     it("should enforce auth endpoint rate limits", async () => {
       const promises = [];
       for (let i = 0; i < 10; i++) {
         promises.push(
           fetch(`${BASE_URL}/auth/login`, {
             method: "POST",
             body: JSON.stringify({ email: "test@test.com", password: "wrong" }),
           })
         );
       }
       
       const responses = await Promise.all(promises);
       // After 5 attempts, should get 429
       const tooMany = responses.filter(r => r.status === 429);
       expect(tooMany.length).toBeGreaterThan(0);
     });
   });
   ```

6. **Dependency Failure Tests:**
   ```javascript
   describe("Dependency failure handling", () => {
     it("should handle MongoDB outage gracefully", async () => {
       // Temporarily disconnect MongoDB
       await disconnectDatabases();
       
       const res = await fetch(`${BASE_URL}/health`);
       expect(res.status).toBe(503);
       
       await connectDatabases();
     });
   });
   ```

### Task 8: Verification and Reporting

**Files to Create:**
- `docs/PHASE3_FINAL_REPORT.md`

**Verification Steps:**
1. Run all Phase 3 tests
2. Run existing regression tests
3. Check git diff for unintended changes
4. Verify no sensitive data in changes
5. Document deployment requirements
6. Document remaining risks

---

## File Changes Summary

### New Files
- `server/src/middlewares/security.middleware.js` - Custom security headers
- `server/src/config/cookies.js` - Centralized cookie configuration
- `server/src/utils/locking.js` - Distributed locking utilities
- `server/src/tests/adversarial-phase3.test.js` - Phase 3 adversarial tests
- `server/src/tests/multi-instance-concurrency.test.js` - Multi-instance tests
- `server/src/tests/security-headers.test.js` - Security header tests
- `server/src/tests/cross-user-isolation.test.js` - Cross-user isolation tests
- `docs/PHASE3_FINAL_REPORT.md` - Final report

### Modified Files
- `server/src/app.js` - Use custom security middleware
- `server/src/controllers/auth.controller.js` - Use centralized cookie config
- `server/src/services/incident.service.js` - Replace process-local locks with Redis locks
- `server/src/models/incident.model.js` - Add unique index for multi-instance deduplication
- `server/src/models/user.model.js` - Verify token generation uniqueness
- `server/src/db/redis.js` - Add locking utilities
- `server/src/utils/logger.js` - Add sensitive data filtering
- `server/src/middlewares/error.middleware.js` - Filter sensitive data from errors
- `docker-compose.yml` - Add documentation for security headers

---

## Environment Variables Reference

```bash
# Security Headers
SECURITY_CSP_ENABLED=true
SECURITY_CSP_DIRECTIVES="..."
SECURITY_HSTS_ENABLED=false
SECURITY_HSTS_MAX_AGE=31536000
SECURITY_HSTS_INCLUDE_SUBDOMAINS=false
SECURITY_HSTS_PRELOAD=false

# Cookie Settings
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d
ACCESS_TOKEN_COOKIE_MAX_AGE_MS=900000
REFRESH_TOKEN_COOKIE_MAX_AGE_MS=604800000
COOKIE_SECURE=true
COOKIE_SAME_SITE=lax
COOKIE_DOMAIN=

# Logging
LOG_FILTER_SENSITIVE_DATA=true
ERROR_RESPONSE_FILTER_SENSITIVE=true

# Locking
LOCK_TTL_SECONDS=30
```

---

## Deployment Prerequisites

### For HSTS
1. All subdomains must support HTTPS
2. TLS certificates must be valid and automatically renewed
3. No mixed content issues
4. Backup/rollback plan for HSTS preload submission

### For Multi-Instance Deployment
1. MongoDB replica set configured (recommended for production)
2. Redis cluster or sentinel configured for high availability
3. All instances share the same:
   - MongoDB connection string
   - Redis connection string
   - Secrets (via environment or secret manager)
   - Queue names
   - Locking keys

### For Index Migration
1. Run duplicate check before creating unique index on incidents
2. Create index in maintenance window
3. Verify application behavior after index creation

---

## Known Limitations

1. **HSTS cannot be tested in development** - Requires HTTPS and valid certificates
2. **Multi-instance tests are simulated** - Tests simulate multiple instances but run in single process
3. **MongoDB unique index requires migration** - Must be done in production maintenance window
4. **Redis locking has TTL** - Locks auto-release after TTL to prevent deadlocks

---

## Rollback Procedures

### Security Headers
1. Revert changes to `server/src/middlewares/security.middleware.js`
2. Revert changes to `server/src/app.js`
3. Restart application

### Distributed Locking
1. Revert changes to `server/src/services/incident.service.js`
2. Revert changes to `server/src/utils/locking.js`
3. Restart application (will use process-local locks again)

### MongoDB Index
1. Drop the unique index from incidents collection
2. Restart application

**Risk:** Downgrading from distributed locks to process-local locks will lose multi-instance safety guarantees.

---

*Document created: 2026-10-22*
*Last updated: 2026-10-22*
*Status: Implementation in progress*
