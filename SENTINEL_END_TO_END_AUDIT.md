# Sentinel End-to-End Sensor Data, Coordinator, and ML Model Audit

**Audit date:** 2026-10-24  
**Scope:** Sentinel repository at `/home/chandanjainhp/coding/javascript/Project/Sentinel`.  
**Sentinel Lab status:** No separate Rust repository was present in the available workspace. No
`Cargo.toml` or simulator source was found under `/home/chandanjainhp/coding`; the Lab side is
therefore **UNVERIFIED**, not inferred.

## 1. Executive summary

The Sentinel source contains a complete intended path from an authenticated event POST through
MongoDB, BullMQ, a prediction worker, the ML HTTP service, prediction persistence, deterministic
machine health, incidents, and Argus explanations. The code is internally consistent at the
contract/unit-test level.

The complete runtime path was **not proven in this environment**. MongoDB was reachable, but
the configured Redis endpoint rejected the test credentials with `NOAUTH Authentication required`.
Consequently no isolated event was submitted and no database or queue assertions were made.
The ML service tests passed (87 tests), and dependency-free Sentinel contract tests passed. Five
DB-backed Sentinel tests were blocked by Redis authentication.

**Verdict:** The JSON event is accepted and persisted by source design when IDs, ownership, and
MongoDB are valid. The coordinator/worker, prediction persistence, health transition, and
incident lifecycle are source-proven but runtime-unverified here. The ML service is locally
validated by tests and is a synthetic-data generic-motor model, not evidence of production
accuracy or RUL prediction.

## 2. Architecture and actual data flow

| Stage | Actual implementation | Input/output and failure behavior | Evidence |
|---|---|---|---|
| Lab generation | Not available in this workspace | Rust payload construction and HTTP behavior cannot be checked | No `Cargo.toml`/Rust simulator found |
| HTTP ingestion | `POST /api/v1/events` | `verifyApiKey` → rate limit → Zod validation → controller; failures become 4xx | `server/src/routes/event.routes.js:13-25`, `server/src/middlewares/apiKey.middleware.js:5-34` |
| Authorization and relationships | `event.service.ingestEvent` | Loads site, machine, sensor; checks same user and exact site→machine→sensor hierarchy | `server/src/services/event.service.js:31-64` |
| Event persistence | `Event.create` | Persists event before enqueue; Mongo failure rejects request | `server/src/services/event.service.js:104-116` |
| Queue | `predictionQueue.add("predict", ...)` | Three attempts, exponential backoff; enqueue has a bounded timeout; event is tagged if enqueue degrades | `event.service.js:146-183`, `prediction.queue.js:19-48` |
| Worker | `startPredictionWorker` | BullMQ worker consumes `predict`; concurrency 2 globally, with per-machine in-process slot 1 | `prediction.worker.js:6-33`, `prediction.service.js:102-130` |
| Window | `buildMachineWindow` | Fetches newest 60 events, sorts buckets oldest-first, age-limited forward-fills, requires four baseline channels | `ml-contract.service.js:112-224`, `prediction.service.js:134-160` |
| ML | `POST /predict` | Sends `machineId`, mapped `generic_motor`, and full window; validates response before storage | `prediction.service.js:156-225`, `ml-service/app/routes/predict.py:14-54` |
| Prediction | `Prediction.create` | Stores scores/model metadata/evidence only after valid ML response | `prediction.service.js:259-286` |
| Health | `evaluateMachineHealth` | Applies warning/critical thresholds; overrides to offline when all sensors are offline; unknown is used for unavailable/invalid ML | `machine-health.service.js:74-123` |
| Incident | `createIncidentIfEligible` | One open/reviewed incident per machine, updates occurrences, escalates warning→critical, dispatches Argus | `incident.service.js:82-238` |
| UI | Machine and incident pages/hooks | Reads machine status, latest prediction, incidents, event/prediction evidence, and Argus explanation | `client/src/app/machines/[machineId]/page.jsx:269-733`, `client/src/app/incidents/[incidentId]/page.jsx:252-665` |

There is no separate coordinator service in the source. The effective coordinator is the
BullMQ prediction worker plus `prediction.service.js`.

## 3. JSON request and response contract

### 3.1 Sentinel event request

The active route uses `server/src/industrial/event.schema.js:26-62` (the older duplicate schema
under `server/src/validations/event.validation.js` has the same shape).

```json
{
  "siteId": "SITE_ID",
  "machineId": "MACHINE_ID",
  "sensorId": "SENSOR_ID",
  "type": "sensor_reading",
  "timestamp": "2026-10-24T04:00:00Z",
  "values": {
    "vibration": 42
  },
  "source": "gateway"
}
```

Required: `siteId`, `machineId`, `sensorId`, `timestamp`, and non-empty `values`.  
Optional: `type` (default `sensor_reading`), `source` (default `api`), and `rawData`.

`values` accepts one or more arbitrary string keys with finite numeric values. It can contain
one or multiple channels. The request schema does **not** require `sensorId` to match a key in
`values`; it is a physical sensor reference, and the service verifies its resource hierarchy,
not channel-key identity.

Accepted `type`: `sensor_reading`, `equipment_anomaly`, `machine_state_change`.  
Accepted `source`: `api`, `edge`, `gateway`, `opcua`, `mqtt`, `manual`.  
Timestamps are coerced by Zod to JavaScript `Date`; valid UTC ISO-8601 strings are accepted.
There is no future-skew or stale-age rejection in the ingestion schema. Values have no
domain/unit/range validation beyond finite numbers.

The event service computes a deterministic idempotency key when `Idempotency-Key` is absent.
When supplied, the key is unique per user. A replay with the same payload returns 200; reuse with
a different payload returns 409. The event model has a unique `{userId,idempotencyKey}` index.

### 3.2 Supported event formats

There are not separate payload structures per sensor type. All supported formats are the same
schema with these valid variants:

| Format | Valid `type` | Valid `source` | Example `values` |
|---|---|---|---|
| Reading from gateway | `sensor_reading` | `gateway` | `{"vibration":42}` |
| Reading from edge | `sensor_reading` | `edge` | `{"temperature":71.2,"rpm":1485}` |
| Manual/state/anomaly event | `equipment_anomaly` or `machine_state_change` | `manual` or `api` | `{"temperature":95,"current":22}` |

For a scoreable generic motor window, the effective combined history must contain
`temperature`, `vibration`, `current`, and `rpm`. Pump and compressor coverage additionally
requires `pressure`, but the current generic motor ML model ignores that extra channel.

### 3.3 API response

The controller returns `ApiResponse(statusCode, event, message)` with HTTP 201 for a new event
and HTTP 200 for an idempotent duplicate (`server/src/controllers/event.controller.js:5-35`).
This response means stored/duplicate ingestion only; it does not mean prediction completion.

## 4. API ingestion validation

API keys use `Authorization: Bearer <key>`. The middleware hashes the key, looks up the stored
hash, updates `lastUsedAt`, and attaches the owning user (`apiKey.middleware.js:5-34`).
Invalid/missing keys return 401.

The service loads each resource independently and returns 404 for a missing site, machine, or
sensor. It returns 403 if any resource belongs to another user and 400 for hierarchy mismatch.
This is a real ownership/hierarchy check, not only an ID-format check.

Confirmed limitations:

* **CONFIRMED, medium:** timestamps accept future and arbitrarily stale values.
  Evidence: `event.schema.js:40` only uses `z.coerce.date()`; `event.service.js:104-110`
  stores the value and `:128-138` uses it for connectivity. Impact: future readings can keep a
  sensor appearing current and stale backfills can affect history/coverage. A policy-compatible
  limit needs an agreed device clock/backfill policy before changing the contract.
* **CONFIRMED, low:** there is no domain-range or unit validation for finite values.
  This is permissive by design at the API boundary, but bad engineering units can reach ML.
* **CONFIRMED, medium:** no event-level sensor/channel mapping is enforced. `sensorId` is
  authorized as a resource, while arbitrary keys in `values` are accepted. Multi-channel
  gateway payloads are therefore accepted under one physical sensor ID.

No safe source fix was made: timestamp rejection and channel mapping would change compatibility
for existing gateways without a documented policy and migration.

## 5. MongoDB persistence and relationships

`Event` stores `userId`, ObjectId references to site/machine/sensor, event type, timestamp,
`Map<String, Number>` values, raw data, source, processing tags, idempotency key, and payload hash
(`server/src/models/event.model.js:8-151`). The Mongoose model enforces enum/type constraints,
but resource relationship checks occur in the service.

The event is created before any queue operation. `lastReadingAt` is updated monotonically with
an atomic max-style predicate; an update failure is logged and does not fail ingestion.

Predictions store model/version, timestamp, scores, fault type/confidence, optional RUL fields,
and evidence (`prediction.model.js`). Incidents reference the latest prediction and preserve
score/model/timestamp evidence.

## 6. Coordinator, Redis, and BullMQ processing

Ingestion enqueues only after `Event.create` succeeds. Job data includes event, machine, site,
and user IDs. The producer uses three attempts with exponential backoff, but does not set
`removeOnFail`; prediction worker failure is observable in logs, though there is no dedicated
prediction queue failure endpoint/metric in the inspected code.

The producer timeout is bounded by `ML_TIMEOUT_MS` (default 5 seconds). On enqueue failure the
event remains durable and receives `PREDICTION_QUEUING_DEGRADED`. Worker Redis uses
`maxRetriesPerRequest: null`, offline queue enabled, and stops retrying after ten connection
attempts. The application health endpoint checks Mongo/Redis availability and returns 503 when
degraded (`healthcheck.controller.js:16-40`).

The worker is restart-safe in the BullMQ sense: jobs remain in Redis unless removed/failed, and
the worker is started after database connection in `server/src/index.js:30-56`. Same-machine
concurrency is constrained in-process, but the protection is not distributed across multiple
Node replicas. Incident creation has a Redis lock with a process-local fallback; prediction
deduplication itself is not cross-replica atomic.

Out-of-order events are sorted by timestamp for the window. A future timestamp is nevertheless
accepted and can distort recency, as noted above.

## 7. ML preprocessing and input compatibility

`buildMachineWindow` merges events from all sensors by exact millisecond timestamp, keeps only
complete rows, forward-fills each required channel only when the timestamp age is at most
`CHANNEL_MAX_AGE_SEC` (default 300 seconds), and sends up to 60 rows oldest-first.
Insufficient/missing coverage marks the machine UNKNOWN and does not call ML.

The ML service requires every event in its request window to contain every model feature.
The generic motor metadata explicitly orders channels as:

```json
["temperature", "vibration", "current", "rpm"]
```

The Predictor validates checkpoint input size and sequence length against metadata, scales with
stored training mean/std, creates sliding windows, and runs the LSTM autoencoder.

The backend maps all recognized and unrecognized machine types to `generic_motor`. Coverage
requirements recognize motor, pump, compressor, fan, conveyor, and gearbox; pump/compressor
pressure is a coverage gate requirement but is not a model feature. Thus one checkpoint is
being used for all those asset types. The source provides no per-type evaluation proving that
this is meaningful.

## 8. Model inference and output validation

FastAPI `/predict` returns:

* 200 `status: ok` with anomaly score, persistence-style fault probability, fault type,
  confidence, model/version, and `rulValue: null`, `rulUnit: null`;
* 200 `status: insufficient_data` when fewer than checkpoint `seq_len` rows exist;
* 400 unknown machine type, 422 malformed/missing channels/non-finite values, 503 model not
  loaded.

The backend validates the returned body with Zod before `Prediction.create`.
Connection/timeout/500 errors mark the machine UNKNOWN and throw so BullMQ retries; 400/422 and
503 become explicit UNKNOWN states without false healthy predictions.

The deployed metadata is `lstm_autoencoder`, version `0.1.0+synthetic.20260925`, sequence
length 30, four features, and `dataSource: synthetic`. The training script supports healthy CSV
data, but the checked-in artifact is synthetic. `faultProbability` is a recent exceedance ratio,
not a trained fault probability. Confidence is data sufficiency, not accuracy. RUL is explicitly
not implemented and must not be presented as remaining useful life.

## 9. Machine-health classification

The implementation matches the requested deterministic rules:

* CRITICAL: `anomalyScore >= 0.90` **and** `faultProbability >= 0.50`;
* WARNING: `anomalyScore >= 0.75` otherwise;
* HEALTHY: below warning;
* OFFLINE: all attached sensors compute offline;
* UNKNOWN: missing/insufficient channels or unavailable/invalid ML.

Evidence: `server/src/services/machine-health.service.js:61-123`.
Unknown and offline states do not create incidents. A scored healthy result clears an old unknown
reason. Offline overrides a scored state when sensors exist and all are offline.

## 10. Incident lifecycle and explanations

Warning and critical predictions call `createIncidentIfEligible`. An existing open/reviewed
incident is updated, occurrence count incremented, evidence and prediction reference refreshed,
and severity escalated but never downgraded. A closed incident permits a new incident.

Mongo partial uniqueness on `machineId` for open/reviewed incidents plus Redis/process locking
prevents normal duplicate active incidents. Duplicate-key recovery updates the winner.
Argus is dispatched after new incident creation and on escalation; the deterministic health
decision does not depend on the explanation. Explanation failure is handled by the Argus worker's
fallback path and is not the health decision.

Runtime incident creation and escalation remain unverified because Redis/Mongo-backed pipeline
tests could not initialize with the available credentials.

## 11. Security and authorization

Verified by source:

* API key authentication precedes event validation.
* Site, machine, and sensor ownership is checked against the key's user.
* Cross-resource hierarchy is checked.
* Human read routes use JWT/user scoping.
* ML service supports `X-ML-API-Key`; `/health` and `/models` are intentionally unauthenticated.
* Report generation did not include secret values.

The event route's idempotency header is accepted server-side. Browser CORS configuration does not
list `Idempotency-Key`, but Sentinel Lab is an HTTP client rather than a browser; this is not a
Lab blocker.

## 12. Error handling and recovery

Durable event storage is separated from downstream processing. Redis outage can return a successful
event ingestion with a degradation tag rather than hanging indefinitely. ML outage produces UNKNOWN,
logs/metrics failure, and retries transient failures.

Observed source risk: prediction worker logs failures but no inspected API exposes prediction
failed-job details or age/lag. Health checks report dependency availability, not queue backlog or
per-event completion. Operators must distinguish:

1. HTTP 201/200: event stored or deduplicated;
2. prediction record: ML scored and persisted;
3. incident record: deterministic threshold was crossed.

## 13. Test cases and observed results

### Executed

* `ml-service/.venv/bin/pytest -q` — **87 passed, 1 deprecation warning**.
* `cd server && bun --env-file=.env.test test src/tests/ml-contract.test.js src/tests/validation-schemas.test.js` — **43 passed**.
* Dependency-free ML contract tests cover missing channels, ordering, age-limited forward-fill,
  60-row cap, response validation, and thresholds.

### Blocked

* DB-backed Sentinel tests (`pipeline-ml`, `coverage-gating`, `age-gate`,
  `adversarial-events`, `adversarial-worker`) — Mongo connected, then Redis failed with
  `NOAUTH Authentication required`; **5 test files failed during setup**.
* Initial test invocation without `--env-file` also failed because `MONGODB_URL` was unset.
* No valid API key/test fixture was used and no event was submitted.
* No Sentinel Lab build/run test was possible because the Rust repository is absent.
* No frontend browser test was run; UI source retrieval/display was inspected only.

### Required isolated scenarios not executed

Valid event, full sensor coverage, healthy operation, fault simulation, malformed/unknown IDs,
duplicate/out-of-order delivery, ML outage, Redis/Mongo interruption, and authorization
end-to-end tests all require a correctly credentialed isolated test stack.

## 14. Confirmed defects and root causes

| Classification | Severity | Evidence | Impact | Recommended fix |
|---|---|---|---|---|
| CONFIRMED | MEDIUM | `event.schema.js:40`; `event.service.js:104-138` | Future/stale timestamps are accepted and influence recency/window behavior | Define an explicit clock-skew/backfill policy; then add bounded timestamp validation and regression tests |
| CONFIRMED | MEDIUM | `event.schema.js:3-10`; no channel/type relation in `event.service.js:47-64` | Arbitrary finite values can be associated with any authorized sensor ID; units/ranges are not checked | Add a versioned per-sensor channel/unit contract after confirming existing gateway payloads |
| CONFIRMED | MEDIUM | `sensor-requirements.config.js` plus `mapMachineType` | Pump/compressor pressure gates scoring but generic motor checkpoint ignores it; all six asset classes share one synthetic model | Train/evaluate per-asset checkpoints or explicitly limit supported types in product behavior |
| CONFIRMED | LOW | `prediction.worker.js:25-31`, health endpoint | Failed jobs are logged but queue lag/failure details are not exposed through a prediction-specific observability surface | Add queue metrics/failed-job diagnostics and alerting |

No speculative source changes were made. Each proposed change affects compatibility or operational
policy and should follow a fixture-backed contract decision.

## 15. Fixes implemented

No corrected source files were committed. The checked-in implementation already contains
regressions for idempotency, coverage gating, age-limited forward-fill, ML response validation,
health thresholds, and incident deduplication. The safe fixes above require unavailable Lab/client
fixtures or an agreed timestamp/channel contract; changing them during this audit would risk
breaking existing devices.

## 16. Files changed and why

* `SENTINEL_END_TO_END_AUDIT.md` — this evidence-based audit report.

No application, simulator, dependency, or test source was changed.

## 17. Remaining risks and limitations

* Sentinel Lab source, payload serialization, URL configuration, and retry behavior are unavailable.
* MongoDB→Redis→worker→ML→incident runtime completion is unverified in this environment.
* The checked-in model is synthetic healthy-data training only; no real-world accuracy evidence is
  present.
* One generic motor checkpoint is used for motors, pumps, compressors, fans, conveyors, and
  gearboxes; supported-type equivalence is unproven.
* Timestamp freshness/future-skew and physical sensor-channel semantics are permissive.
* Queue completion/failure observability is weaker than event persistence observability.

## 18. Exact commands

```bash
# ML service
cd ml-service
python -m app                         # default service port 9000
# or:
uvicorn app.main:app --port 9000

# Sentinel backend (dotenv development mode)
cd server
bun --env-file=.env start:dotenv

# Full local dependencies/application stack
docker compose up -d mongodb redis ml-service server

# ML tests
cd ml-service
.venv/bin/pytest -q

# Server contract tests
cd server
bun --env-file=.env.test test src/tests/ml-contract.test.js src/tests/validation-schemas.test.js

# DB-backed pipeline tests, only with isolated valid Mongo/Redis test credentials
bun --env-file=.env.test test src/tests/pipeline-ml.test.js src/tests/coverage-gating.test.js \
  src/tests/age-gate.test.js src/tests/adversarial-events.test.js \
  src/tests/adversarial-worker.test.js
```

The exact Rust simulator command cannot be supplied because the separate repository is not
available in this workspace. When obtained, inspect its README/Cargo manifest and run its
documented command against a non-production Sentinel URL and isolated API key.

## 19. Reproducing one successful end-to-end event

1. Obtain the separate Sentinel Lab repository and inspect its configured API URL, JSON serializer,
   retry policy, and API-key header; do not invent IDs.
2. Start isolated MongoDB, Redis, ML, and Sentinel services with matching credentials.
3. Verify `/api/v1/health` is 200 and ML `/health` reports the model loaded.
4. Create a test user, site, motor/pump machine, four baseline sensors, and pressure for pump or
   compressor using the application's registration APIs.
5. Create an API key for only that test user.
6. Send events with `Authorization: Bearer ...`, one valid sensor ID per registered sensor, and
   UTC timestamps. For a scoreable generic motor, provide at least 30 complete time rows within
   the configured freshness windows; the application recommends 60.
7. Assert HTTP 201, then query MongoDB by the returned event ID.
8. Wait for BullMQ processing and query predictions for the machine. A prediction document proves
   ML completion; an event document alone does not.
9. Query the machine. Confirm `healthy`, `warning`, `critical`, `offline`, or `unknown` from the
   stored status and reason.
10. If warning/critical thresholds are actually met, query incidents and verify `predictionId`,
    evidence scores, occurrence count, and Argus explanation status.
11. Repeat the same request with the same idempotency key and assert HTTP 200/no new event.
12. Run the invalid-ID, ownership, malformed-value, stale/future timestamp, duplicate, ML outage,
    and Redis outage cases only against the isolated stack.

## 20. Evidence matrix

| Stage | Status | Evidence |
|---|---|---|
| Lab generates event | UNVERIFIED | Separate Rust repository absent |
| Sentinel receives/authenticates request | SOURCE-PROVEN; runtime unverified | Route, API-key middleware, schema |
| Schema accepts/rejects contract | SOURCE-PROVEN; unit-tested | 43 relevant server contract tests |
| Resource ownership/hierarchy | SOURCE-PROVEN; runtime unverified | `event.service.js:31-64` |
| Mongo event storage | SOURCE-PROVEN; runtime unverified | `Event.create`; Mongo reachable |
| Queue enqueue | SOURCE-PROVEN; runtime blocked | `predictionQueue.add`; Redis `NOAUTH` |
| Worker retrieval/retry | SOURCE-PROVEN; runtime blocked | BullMQ worker; no valid Redis credentials |
| Window/channel preparation | TEST-PROVEN | ML contract tests passed |
| ML endpoint/preprocessing | TEST-PROVEN | 87 ML tests passed |
| Prediction persistence | SOURCE-PROVEN; runtime blocked | `Prediction.create`; DB-backed test setup failed |
| Health calculation | SOURCE-PROVEN; runtime blocked | deterministic service and threshold tests |
| Incident create/update/escalate/close | SOURCE-PROVEN; runtime blocked | service/model/index; no complete runtime |
| Argus explanation | SOURCE-PROVEN; runtime blocked | Argus queue/worker path inspected |
| Frontend display | SOURCE-INSPECTED; browser unverified | machine/incident pages and hooks |

**Final verdict:** The source implements the full pipeline, but this audit cannot honestly claim
that a real Sentinel Lab event completed it. The ML component is test-validated; the
MongoDB/BullMQ/worker/prediction/incident runtime remains unverified until Redis credentials and
the separate Lab repository are supplied.
