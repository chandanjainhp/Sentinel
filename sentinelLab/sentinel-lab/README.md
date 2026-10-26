# Sentinel Lab

A standalone Rust + HTML test harness for exercising the Sentinel predictive-maintenance system. It is intentionally separate from the Sentinel repository and does not need to import or modify Sentinel code.

## What it does

- Generates synthetic motor/sensor readings continuously.
- Offers normal, vibration-ramp, overheating, overload, startup, sensor-dropout and combined-fault scenarios.
- Shows telemetry cards, recent trend charts, local counters and timestamped logs in a plain HTML interface.
- Runs in **dry-run mode by default**.
- Can optionally POST readings to the configured Sentinel `POST /api/v1/events` endpoint using a Bearer API key and an `Idempotency-Key` per event.
- Never deletes or resets Sentinel database records. Reset only clears this tool's local session history and counters.
- Keeps configuration and API key in process memory only. The API key is never returned from the status endpoint and is not written to a file.

## Requirements

- Rust toolchain (stable; Rust 1.78 or newer is a reasonable baseline for the dependency set).
- Sentinel running separately when testing live forwarding.
- A registered test site, machine, and sensors in Sentinel if forwarding is enabled.

## Run locally

From the `sentinel-lab` directory:

```bash
cargo run
```

Open <http://127.0.0.1:8787>.

The default mode is **dry run**. You can inspect synthetic live data and use the fault scenarios without sending any requests to Sentinel.

## Connect to Sentinel

1. Start the Sentinel API and ML service as usual.
2. In Sentinel, create/register a test site, machine and the required sensors.
3. In Sentinel Lab, leave the API base URL as `http://localhost:8000/api/v1` if the API is on the same host as Sentinel Lab. If not, enter the API URL reachable **from the machine running Sentinel Lab**.
4. Enter the actual public Site ID, Machine ID, and sensor IDs from Sentinel.
5. Save the config with `Forward generated events to Sentinel` unchecked first.
6. Confirm the simulator behaves as expected in dry-run mode.
7. Enable forwarding and start the simulator when you are ready to write synthetic test events into your Sentinel test environment.

Do not use production IDs or production API keys for fault-injection tests. The simulator deliberately creates abnormal data.

### Event format

Default: `One event per sensor`. This sends a separate event per channel, using the corresponding sensor ID and a single-channel `values` map. This is intended to exercise Sentinel's per-sensor coverage gate.

Alternative: `One multi-channel event`. This follows the overall shape of the example in the Sentinel README (one `sensorId` plus multiple values). The implementation's actual Zod/event validation schema is authoritative. If the schema expects a different structure, adjust the test harness before enabling live forwarding.

Sentinel's example event uses these top-level fields:

```json
{
  "siteId": "site_...",
  "machineId": "machine_...",
  "sensorId": "sensor_...",
  "timestamp": "2026-09-30T06:30:00Z",
  "type": "sensor_reading",
  "values": { "temperature": 82.4 },
  "source": "gateway"
}
```

The harness sends to `<API base URL>/events`, which defaults to `http://localhost:8000/api/v1/events`.

## Scenarios

- **Normal operation:** small, correlated variation.
- **Vibration ramp / bearing fault:** vibration increases progressively; temperature rises more slowly.
- **Overheating:** temperature rises over time.
- **Motor overload:** current rises and RPM drops.
- **Sensor dropout:** the selected channel is omitted from outgoing events. The actual Sentinel coverage gate may need to wait for its configured freshness window before it marks that sensor stale.
- **Motor startup:** RPM ramps from zero while starting current is elevated.
- **Combined fault:** several channels shift together.

These are synthetic software-test patterns, not validated physics or safety limits. The simulator is designed to exercise data flow and failure handling, not to certify a machine-health model.

## Test the full pipeline

1. Run dry-run mode and inspect readings.
2. Configure a real test site, machine and sensor IDs.
3. Enable forwarding and verify successful HTTP response logs.
4. Check that readings appear in the Sentinel event history.
5. Wait for sensor coverage to become fully covered and for the 60-row window to fill.
6. Run a fault scenario. Verify prediction creation, deterministic health-state transitions, incident creation/escalation and Argus explanation.
7. Try sensor dropout. Remember Sentinel's coverage recency default is 15 minutes; the backend may not mark the sensor stale immediately.
8. Stop the ML service or Redis only in a disposable test environment. Confirm degraded states and retry/recovery behavior.

## Run on another device / private LAN

By default, the server binds to `127.0.0.1:8787` and is only accessible on the same machine. To access the control panel from another device on a trusted private network:

```bash
SENTINEL_LAB_BIND=0.0.0.0:8787 cargo run
```

Then open `http://<lab-device-private-ip>:8787` from the other device. The control panel has no login. Do not expose it to the public internet. Restrict LAN access with your firewall and only enter a test API key.

The target API URL must be reachable from the Rust Lab process, not merely from the browser. For example, `localhost` refers to the machine where Sentinel Lab runs.

## Important behavior / limitations

- The Rust test server is not a replacement for Sentinel's production server.
- Event data is synthetic and is intentionally capable of causing test incidents.
- This initial harness does not configure the Sentinel database, create sites/machines/sensors, or bypass Sentinel authentication.
- HTTP `2xx` means the ingestion API accepted the request; it does not guarantee the asynchronous prediction and incident pipeline has finished.
- The API key and settings are kept in process memory, so they are lost when the test server exits.
- Live forwarding is off by default.
- The lab control API has no user authentication. Keep the listener local unless you have secured access to the device.

## Project layout

```text
sentinel-lab/
├── Cargo.toml
├── README.md
├── .gitignore
├── src/
│   └── main.rs
└── web/
    └── index.html
```
