# BUGS_FOUND — adversarial test pass (pre-deployment)

Findings from the adversarial suite: Scope A (ml-service pytest, 45 new tests),
Scope B (server Bun, 47 new across 7 files), Scope C (contract conformance,
15 new), Scope D (`scripts/concurrency-check.js`, 8 correctness checks).
Every case is a named test — passing, or pinned as `it.todo` with the bug
tracked here. Nothing was silently skipped.

**Open deployment blockers: none.** 6 bugs were found and fixed during the
pass; 2 "should fix soon" and 1 design decision remain open, none blocking.

## Fixed during this pass

| # | Severity | Bug | Evidence | Fix |
|---|----------|-----|----------|-----|
| 1 | should fix soon | **422 handler crashed on NaN/Infinity input** — FastAPI's own error response tried to JSON-serialize the non-finite value, so a schema-violating request returned 500 + traceback instead of a clean 422 | `test_adversarial_api.py` raw-token cases | `ml-service/app/main.py`: JSON-safe error serialization (handles non-finite floats *and* raw bytes) — commit `60f9b60` |
| 2 | minor | `generate_healthy(0)` IndexError — pre-existing Python test crashed in its own setup, never exercising the empty-window behavior it was written for | pre-flight baseline failure | `ml-service/train/synthetic.py`: n=0 returns an empty array — commit `60f9b60` |
| 3 | **blocks deploy (was)** | **Concurrent predictions created 2 open incidents for one machine** — check-then-create race in `createIncidentIfEligible`, breaking its own "one live incident per machine" contract | `adversarial-incidents.test.js` two-prediction race test | `server/src/services/incident.service.js`: per-machine in-process serialization — commit `359fd09`. Multi-replica deploys would need a Mongo partial unique index instead |
| 4 | should fix soon | **Bodyless refresh request → 500** — `req.body.refreshToken` threw when `req.body` was undefined; malformed requests got a server error instead of 401 | captured 500 in test logs; standalone repro | `server/src/controllers/auth.controller.js`: `req.body?.refreshToken` — commit `359fd09` |
| 5 | **blocks deploy (was)** | **`lastReadingAt` lost update** — plain `$set` is last-writer-wins; under concurrent ingestion an older event landing last dragged it backwards → sensors wrongly STALE, coverage gate spuriously closed | `concurrency-check.js` D3: `lastReadingAt=…536` vs newest posted `…567` | `server/src/services/event.service.js`: monotonic max-wins conditional update (unset-or-older guard; Mongo range ops never match null, so the first reading needed its own arm) — commit `aaa2142` |
| 6 | should fix soon | **Duplicate stored predictions under concurrency** — `MAX_CONCURRENT_PREDICTIONS_PER_MACHINE = 2` let two same-machine jobs both pass the duplicate-window check before either stored (TOCTOU) | `concurrency-check.js` D4 intermittently found 2 predictions | `server/src/services/prediction.service.js`: limit is 1; flood-guard semantics already accept skipping overlapping runs — commit `aaa2142` |

## Open — should fix soon (not blocking, should land before real traffic)

**F1. Argus explain has no timeout guard around the LLM driver.**
A provider that accepts the connection and never responds hangs
`explainIncident` forever, and the argus worker runs `concurrency: 1`, so one
hung call stalls ALL future explanations. Pinned as `it.todo` in
`adversarial-argus.test.js`. Fix is small (wrap the driver call in a timeout →
deterministic fallback), but the timeout value is a design choice — not taken
unilaterally.

**F2. A Redis outage hangs `POST /events` indefinitely.**
BullMQ producers wait forever for a dead Redis (`enableOfflineQueue` default)
and event ingestion awaits `predictionQueue.add()` inside the request path, so
the HTTP response never completes instead of failing bounded. Pinned as
`it.todo` in `adversarial-worker.test.js`. Fix: short offline-queue timeout or
fire-and-forget enqueue — a resilience-design decision.

## Open — needs owner decision

**D1. Duplicate idempotency key + different payload: silent first-wins.**
Current behavior (verified, not assumed — the Redis `idempotencyMiddleware` is
dead code, never mounted; dedup lives in `event.service.js` + unique index):

- sequential duplicate → **200 "Event already processed"** echoing the FIRST
  event; the different payload is discarded with no comparison or signal;
- concurrent duplicate → **409** from the `E11000` mapping — the same logical
  conflict returns 200 or 409 depending on timing;
- cross-user collisions are impossible (user-scoped keys) — safe.

A buggy/malicious gateway reusing keys gets silent data loss today. Pinned as
`it.todo` in `adversarial-events.test.js` pending a call: **(a)** keep silent
first-wins as intended, **(b)** 409 on payload-hash mismatch, **(c)** keep
behavior, document in CONTRACT.md.

## Contract gaps & minors (pinned, intentionally not fixed)

- **Negative rpm accepted** — CONTRACT.md does not forbid physically
  impossible values; this is a CONTRACT.md schema decision, deliberately
  flagged here and NOT fixed in this pass, per owner instruction.
- **Pydantic lax coercion** — `"1480"` → 1480.0 and `true` → 1.0 are accepted
  as sensor readings (pinned in `test_adversarial_api.py`); decide whether
  strict numbers are required.
- **Refresh-token same-second rotation is a no-op** — `iat` has second
  granularity, so refreshing within the same second as register yields a
  byte-identical JWT and "rotation" cannot be distinguished from replay. The
  rotation test sleeps 1.1s to exercise real rotation. A `jti`/nonce on
  refresh tokens would close it.
- **Far-future timestamps accepted** — pinned by design (backfill-capable
  historian); interacting tests must reset fixture sensors because the
  monotonic `lastReadingAt` (fix #5) correctly refuses to regress from the
  future.

## Suite totals after the pass

- Python (ml-service): **87/87 pass** (42 pre-existing + 45 new)
- Bun (server): **128 pass, 0 fail, 3 todo** (66 pre-existing + 62 new;
  the 3 todos are F1, F2, D1 above)
- Scope D script: **PASS** — 50 concurrent POSTs, 0 fetch errors, 50/50
  stored, exact max-wins convergence, 129 jobs → 2 stored predictions,
  health green; ~420ms total, p50 ≈ 390ms
