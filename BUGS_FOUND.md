# BUGS_FOUND — adversarial test pass (pre-deployment)

Findings from the adversarial suite: Scope A (ml-service pytest, 45 new tests),
Scope B (server Bun, 47 new across 7 files), Scope C (contract conformance,
15 new), Scope D (`scripts/concurrency-check.js`, 8 correctness checks).
Every case is a named test — passing, or pinned as `it.todo` with the bug
tracked here. Nothing was silently skipped.

**Open deployment blockers: none. Open findings: none.** 9 bugs were found
and fixed during the pass (6 during the scopes, then D1/F1/F2 on the owner's
decision). The contract gaps and minors below remain pinned as known gaps by
owner instruction — not fixed in this pass.

## Fixed during this pass

| # | Severity | Bug | Evidence | Fix |
|---|----------|-----|----------|-----|
| 1 | should fix soon | **422 handler crashed on NaN/Infinity input** — FastAPI's own error response tried to JSON-serialize the non-finite value, so a schema-violating request returned 500 + traceback instead of a clean 422 | `test_adversarial_api.py` raw-token cases | `ml-service/app/main.py`: JSON-safe error serialization (handles non-finite floats *and* raw bytes) — commit `60f9b60` |
| 2 | minor | `generate_healthy(0)` IndexError — pre-existing Python test crashed in its own setup, never exercising the empty-window behavior it was written for | pre-flight baseline failure | `ml-service/train/synthetic.py`: n=0 returns an empty array — commit `60f9b60` |
| 3 | **blocks deploy (was)** | **Concurrent predictions created 2 open incidents for one machine** — check-then-create race in `createIncidentIfEligible`, breaking its own "one live incident per machine" contract | `adversarial-incidents.test.js` two-prediction race test | `server/src/services/incident.service.js`: per-machine in-process serialization — commit `359fd09`. Multi-replica deploys would need a Mongo partial unique index instead |
| 4 | should fix soon | **Bodyless refresh request → 500** — `req.body.refreshToken` threw when `req.body` was undefined; malformed requests got a server error instead of 401 | captured 500 in test logs; standalone repro | `server/src/controllers/auth.controller.js`: `req.body?.refreshToken` — commit `359fd09` |
| 5 | **blocks deploy (was)** | **`lastReadingAt` lost update** — plain `$set` is last-writer-wins; under concurrent ingestion an older event landing last dragged it backwards → sensors wrongly STALE, coverage gate spuriously closed | `concurrency-check.js` D3: `lastReadingAt=…536` vs newest posted `…567` | `server/src/services/event.service.js`: monotonic max-wins conditional update (unset-or-older guard; Mongo range ops never match null, so the first reading needed its own arm) — commit `aaa2142` |
| 6 | should fix soon | **Duplicate stored predictions under concurrency** — `MAX_CONCURRENT_PREDICTIONS_PER_MACHINE = 2` let two same-machine jobs both pass the duplicate-window check before either stored (TOCTOU) | `concurrency-check.js` D4 intermittently found 2 predictions | `server/src/services/prediction.service.js`: limit is 1; flood-guard semantics already accept skipping overlapping runs — commit `aaa2142` |

## Fixed after the owner's decisions (this section's items were "open")

**D1 (fixed — decision b). Idempotency key reuse with a different payload now
returns 409, sequential AND concurrent.** Events store a `payloadHash`
(SHA-256 of machine/sensor/type/timestamp/values) bound to the idempotency
key; a replay must resend a byte-identical payload or get 409 from the
payload-hash check (sequential) or the unique index (concurrent) — the two
paths are now consistent. Legacy/direct documents (`payloadHash: null`) fail
closed: any replay attempt 409s, never a false 200. The D1 `it.todo` is now
two real tests in `adversarial-events.test.js` — commit `11186c4`.

**F1 (fixed). Argus LLM call is bounded; a hung provider falls back.** The
driver call is wrapped in `withTimeout` using the ML client's `ML_TIMEOUT_MS`
(same pattern as the ML fetch); expiry is just another LLM failure — retry,
then deterministic fallback. The concurrency-1 worker lane can no longer be
wedged by one hung call. Test drives a never-settling driver end to end
(bounded at 2 × timeout) and asserts the incident lands in fallback —
commit `37352da`.

**F2 (fixed). A Redis outage can no longer hang `POST /events`.** The
prediction enqueue is wrapped in `withTimeout` (again the ML client's
timeout): on expiry the event stays stored — the historian's primary job —
and is tagged `PREDICTION_QUEUING_DEGRADED` so the skip is observable and
queryable. Test proves the bound against a truly dead endpoint (TEST-NET,
offline queue holding the add) and the store-and-tag path through real
ingestion — commit `93ad702`.

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

## Suite totals after the pass (incl. D1/F1/F2 fixes)

- Python (ml-service): **87/87 pass** (42 pre-existing + 45 new)
- Bun (server): **132 pass, 0 fail, 0 todo** (66 pre-existing + 66 new;
  the former F1/F2/D1 todos are real assertions now)
- Scope D script: **PASS** — 50 concurrent POSTs, 0 fetch errors, 50/50
  stored, exact max-wins convergence, 129 jobs → 2 stored predictions,
  health green; ~420ms total, p50 ≈ 390ms
