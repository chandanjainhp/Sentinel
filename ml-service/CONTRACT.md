# Sentinel ML service: API contract

Audience: the Node.js developer integrating Sentinel's worker with this service.
The service is **stateless and single-tenant**: no users, no auth, no database, no per-machine memory.
Every `/predict` call must carry the data it needs.

Base URL (local): `http://localhost:9000`  (port from `ML_PORT`, default `9000`)

> **Read this first: which model is behind the API?**
> Until a model trained on *your* healthy machine data is deployed, the service runs a **demo model trained on synthetic data**.
> `GET /health` and `GET /models` report `dataSource: "synthetic"` in that case. Do not present its output to an operator as a real diagnosis.

---

## Endpoints

| Method | Path       | Purpose |
|--------|------------|---------|
| POST   | `/predict` | Score one machine from its most recent events |
| GET    | `/health`  | Liveness + which models are loaded |
| GET    | `/models`  | Details of each loaded model |

## POST /predict

### Request

```json
{
  "machineId": "pump-7",
  "machineType": "generic_motor",
  "window": [
    { "timestamp": "2026-09-24T10:00:00Z",
      "values": { "temperature": 82.4, "vibration": 7.3, "current": 14.8, "rpm": 1480 } }
  ]
}
```

- `machineType`: currently only `generic_motor`. Its required channels are `temperature`, `vibration`, `current`, `rpm` (the exact list and order are in `GET /models` -> `features`).
- `window`: **the last 60 events, oldest first.** (Recommended: 60. The minimum that can be scored is `seq_len`, currently 30. At most 500 accepted.)
  - **Every** event must contain **every** required channel. Extra channels (e.g. `pressure`) are ignored.
  - Values must be finite numbers. `NaN`/`Infinity` are rejected.
  - Array order is what counts; the service uses `timestamp` only for validation (it must be ISO-8601) and does not sort. Send oldest first.
  - Events are assumed to be evenly spaced at roughly the sampling interval the model was trained on. Wildly irregular spacing degrades results.
- The service **keeps no state** between calls. Send the whole window every time.

### Response: scored (HTTP 200, `status: "ok"`)

```json
{
  "machineId": "pump-7",
  "status": "ok",
  "model": "lstm_autoencoder",
  "modelVersion": "0.1.0+synthetic.20260924",
  "anomalyScore": 0.94,
  "faultProbability": 0.7,
  "faultType": "vibration_anomaly",
  "suspectChannel": "vibration",
  "rulValue": null,
  "rulUnit": null,
  "confidence": 1.0,
  "methods": {
    "anomalyScore": "lstm_autoencoder_reconstruction_error",
    "faultProbability": "recent_exceedance_ratio",
    "faultType": "top_error_channel",
    "rul": "not_available"
  }
}
```

### Response: not enough events (HTTP 200, `status: "insufficient_data"`)

```json
{ "machineId": "pump-7", "status": "insufficient_data", "have": 12, "need": 30 }
```

This is **not an error**. The machine simply has not produced enough events yet. Do not retry immediately and do not alert on it; send the next request once `need` events exist.
(`machineId` is echoed as an addition to the minimal shape.)

### Field meanings

| Field | Meaning | `methods` value |
|-------|---------|-----------------|
| `anomalyScore` | 0.0-1.0. How far the **latest** 30-event window is from what the model learned as healthy. `score = clip(error / (2 x threshold), 0, 1)` where `error` is the window's mean squared reconstruction error on standardised channels. The calibrated threshold maps to **0.5**. | `lstm_autoencoder_reconstruction_error` |
| `faultProbability` | 0.0-1.0. Share of the **10 most recent windows** (fewer if fewer exist) whose error exceeds the threshold. A **persistence statistic, not a probability from a trained fault classifier.** High = the anomaly has been sustained, not a one-off blip. Because the threshold is the 95th percentile of healthy training errors, a healthy machine shows a small non-zero floor (about 0.05 on average). | `recent_exceedance_ratio` |
| `faultType` | `"<channel>_anomaly"` (e.g. `vibration_anomaly`) when the latest window is above threshold, else `"none"`. It names the **channel that deviates most**, not a diagnosed mechanism. There are no fault names like "bearing_degradation" because the model was never trained on labelled faults. | `top_error_channel` |
| `suspectChannel` | The channel with the largest reconstruction error in the latest window, or `null` when `faultType` is `"none"`. | `top_error_channel` |
| `rulValue`, `rulUnit` | **Always `null` in this version. `null` means "not available", never zero.** Do not render, sum, chart or alert on it as a number. Test with `=== null`, and do **not** use `?? 0` / `|| 0`. | `rul: "not_available"` |
| `confidence` | 0.0-1.0. **Data sufficiency only**: `min(1, windowsAvailable / 10)`. 60 events give 31 windows -> 1.0. It is not a measure of model accuracy. | (none) |
| `model` | Always `lstm_autoencoder`. If a heuristic ever replaces it, this field will not claim otherwise. | |
| `modelVersion` | Read from the model's `.meta.json`. The suffix shows the data source (`+synthetic...` or `+csv...`). | |

### Recommended severity mapping (applied by *your* app, not by this service)

| `anomalyScore` | Suggested level | Meaning in error terms |
|----------------|-----------------|------------------------|
| `< 0.75`       | OK / normal     | error < 1.5 x threshold |
| `>= 0.75`      | **WARNING**     | error >= 1.5 x threshold |
| `>= 0.90`      | **CRITICAL**    | error >= 1.8 x threshold |

`0.5` is the calibrated threshold itself, so `faultType != "none"` corresponds to `anomalyScore > 0.5`. Consider requiring `faultProbability` to be high as well before paging someone.

## Status codes

| Code | When | What to do |
|------|------|-----------|
| **200** `status: "ok"` | Scored | Use the result |
| **200** `status: "insufficient_data"` | Fewer than `seq_len` events | Wait for more events; not an error |
| **400** | Unknown `machineType` | Caller bug. Do not retry. Body lists supported types |
| **422** | Malformed body; missing/non-numeric/non-finite value; **a required channel missing from any event** (message names the event index and channel) | Caller bug. Do not retry unchanged |
| **503** | Known `machineType` but its model is not loaded (missing/corrupt files) | Service problem. Retry with backoff; check `/health` |
| **500** | Unexpected server error | Retry once with backoff, then alert a human |

Error bodies are JSON with a `detail` field: a string for 400/503 and for the missing-channel 422; a list of objects for schema-validation 422s.
Precedence: 400 (type) -> 503 (model) -> 422 (channels) -> insufficient_data.

## GET /health

```json
{ "status": "ok",
  "models": [ { "machineType": "generic_motor", "model": "lstm_autoencoder",
                "modelVersion": "0.1.0+synthetic.20260924", "dataSource": "synthetic" } ],
  "notLoaded": {} }
```

`status` is `"ok"` when every supported model loaded, otherwise `"degraded"` and `notLoaded` gives the reason. HTTP status is 200 either way (it is a liveness probe); inspect `status` for readiness.

## GET /models

```json
[ { "machineType": "generic_motor", "model": "lstm_autoencoder",
    "modelVersion": "0.1.0+synthetic.20260924",
    "features": ["temperature", "vibration", "current", "rpm"],
    "seq_len": 30, "threshold": 0.0873,
    "trainedAt": "2026-09-24T07:30:00Z", "dataSource": "synthetic" } ]
```

`features` is the required channel list. `threshold` is in standardised-error units (you do not need it to interpret `anomalyScore`).

## Running it

Local:

```bash
cd ml-service
pip install -r requirements.txt
python train/train_autoencoder.py --synthetic --out models/generic_motor   # once, if models/ is empty
ML_PORT=9000 python -m app                # or: uvicorn app.main:app --port 9000
curl -s localhost:9000/health
```

Docker:

```bash
docker build -t sentinel-ml ml-service
docker run --rm -p 9000:9000 sentinel-ml
# or mount your own models:  -v "$PWD/ml-service/models:/app/models:ro"
# custom port:               -e ML_PORT=9100 -p 9100:9100
```

## Node.js example (Node 18+, built-in `fetch`)

```js
const ML_URL = process.env.ML_URL ?? "http://localhost:9000";
const WINDOW = 60;         // recommended window size
const TIMEOUT_MS = 5000;   // never wait forever on the ML service

export function severity(score) {
  if (score >= 0.90) return "CRITICAL";
  if (score >= 0.75) return "WARNING";
  return "OK";
}

/** events: [{ timestamp, values: {temperature, vibration, current, rpm} }], oldest first */
export async function scoreMachine(machineId, events) {
  let res;
  try {
    res = await fetch(`${ML_URL}/predict`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ machineId, machineType: "generic_motor", window: events.slice(-WINDOW) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    // timeout or connection refused: treat as "ML unavailable", never as "machine is fine"
    return { kind: "unavailable", reason: err.name === "TimeoutError" ? "timeout" : String(err) };
  }

  if (res.status === 503) return { kind: "unavailable", reason: "model not loaded" };
  if (!res.ok) {
    // 400 / 422 mean our request is wrong; 500 is a server fault. Surface it, do not swallow it.
    throw new Error(`ml-service ${res.status}: ${await res.text()}`);
  }

  const body = await res.json();
  if (body.status === "insufficient_data") {
    return { kind: "waiting", have: body.have, need: body.need };   // not an error, not an alert
  }
  return {
    kind: "scored",
    severity: severity(body.anomalyScore),
    anomalyScore: body.anomalyScore,
    faultProbability: body.faultProbability,
    faultType: body.faultType,
    suspectChannel: body.suspectChannel,
    rul: body.rulValue === null ? "not available" : body.rulValue,  // null is NOT zero
    modelVersion: body.modelVersion,
  };
}
```
