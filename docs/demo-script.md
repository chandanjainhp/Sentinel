# Sentinel demo recording — run of show

Everything you need to record the walkthrough in one take. Total runtime with
default pacing: **~8–10 minutes** (5 sensors coming online, 34 healthy cycles,
26 fault cycles — all real-time, no backdating).

---

## 1. Start the stack (before recording)

Five processes. Mongo and Redis are usually already up as system services.

```bash
# 1. ML inference service (:9000)
cd ml-service && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 9000

# 2. API server (:8000) — workers (prediction/Argus/incidents) run in-process
cd server && bun src/index.js

# 3. Frontend (:3000)
cd client && bun run dev
```

Health check: `curl localhost:9000/health`, `curl localhost:8000/api/v1/health`
(or any API route — a 404 JSON response means it's up), `curl -s -o /dev/null -w '%{http_code}' localhost:3000`.

## 2. Reset the demo estate

```bash
bun server/scripts/demo-reset.js
```

Wipes **only** the demo user's data (plus the legacy `demo@factory.com`
throwaway) — your own account and other test data are never touched — then
recreates:

| What | Value |
|---|---|
| Site | Northwind Fabrication |
| Machine | Compressor Line 2 [COMP-02] · Centrifugal Compressor (Atlas Copco GA 90 VSD) |
| Sensors | Temperature · Vibration · Current · RPM · Discharge Pressure |
| Login | `demo@northwind.example` |
| Password | `NorthwindDemo123!` |
| API key | printed once in the script output (`sk_…`) — **copy it now** |

The pressure sensor is required: compressor-type machines gate predictions on
a pressure channel, so it must be attached and reporting.

## 3. Browser tabs (in this order)

1. `localhost:3000/login` — logged **out** (fresh sign-in on camera, or sign in
   before hitting record and start on the empty Overview).
2. After login: **Overview** (machine card reads UNKNOWN → HEALTHY during the run).
3. **Sensors** page — watch sensors flip ONLINE one by one in Phase 1.
4. **Incidents** — empty during the healthy phase; the open incident lands in Phase 4.

Tip: log in once beforehand, note where the nav links are, then reset again so
the data is empty when recording starts.

## 4. Run the paced sequence

```bash
DEMO_KEY=sk_paste_the_key_here bun server/scripts/demo-run.js
```

It pauses twice: once after the first healthy prediction (**PAUSE HERE — show
the Sensors page and the Overview**) and once after the incident + Argus
explanation are ready (**PAUSE HERE — show the incident and the Argus
explanation**). Press Enter at each pause when you're done narrating.

Useful knobs (all optional):

```bash
DEMO_AUTO_DELAY_MS=12000   # pauses auto-continue instead of waiting for Enter
DEMO_READING_GAP_MS=3500   # healthy-cycle spacing (default 3500)
DEMO_FAULT_GAP_MS=4500     # fault-cycle spacing (default 4500)
DEMO_HEALTHY_CYCLES=34     # healthy cycles before the first pause (default 34)
DEMO_FAULT_CYCLES=26       # fault ramp length (default 26)
```

## 5. Narration outline

| Beat | On screen | Say something like |
|---|---|---|
| Intro | Overview, empty state | "This is Sentinel — it watches industrial machines and explains what's wrong before it becomes downtime. This is Compressor Line 2 at a fabrication plant; no telemetry yet." |
| Sensors online | Sensors page | "Five sensors — temperature, vibration, current, RPM, discharge pressure — start reporting. Watch each one flip ONLINE as its first reading lands." |
| Coverage gate | Overview / machine card | "Sentinel won't guess until it has enough fresh coverage from every required sensor. Once all five are live, the ML pipeline arms itself." |
| Healthy | Overview, HEALTHY badge | "Healthy telemetry streams in and every window is scored by an LSTM autoencoder. A healthy compressor stays quiet — the health badge reads HEALTHY." |
| Fault injected | Sensors page, vibration climbing | "Now a bearing fault develops: vibration ramps from 2.4 up past 11 mm/s." |
| Health degrades | Overview, WARNING → CRITICAL | "Sentinel notices within a couple of windows — WARNING, and then CRITICAL as the anomaly score saturates." |
| Incident | Incidents page | "An incident fires automatically — severity, timeline, the evidence behind it." |
| Argus explains | Incident detail | "And Argus explains it in plain language: what broke, how confident the model is, what to do next. From raw sensor noise to a decision-ready diagnosis — no human in the loop." |
| Wrap-up | Incident detail / Overview | "That's Sentinel: sensors in, prediction out, explanation included." |

Phase 1 flips each sensor ONLINE as its reading is accepted; Phase 2 opens the
coverage gate and lands the first prediction (~34 cycles × 3.5 s); Phase 3
ramps vibration (2.4 → ~11.8 mm/s) so the badge visibly walks WARNING →
CRITICAL; Phase 4 waits for the open incident and its Argus explanation before
the final pause.

## 6. Expected technical beats (for confidence while recording)

- First prediction lands once ≥30 complete window rows exist — at default
  pacing that's roughly 2 minutes into Phase 2.
- Machine health: UNKNOWN → HEALTHY (Phase 2) → WARNING → CRITICAL (Phase 3).
- The incident title reads `CRITICAL: Compressor Line 2 (COMP-02) - vibration_anomaly`.
- Argus explanations in this dev environment come from the deterministic
  fallback writer (`source=fallback`), so wording is stable and clean on
  camera; with an LLM provider configured you'd see `source=llm`.

## 7. Post-take checklist

- [ ] No red console errors in any tab (DevTools → Console).
- [ ] No broken images or fallback icons anywhere.
- [ ] No placeholder text (e.g. "monikaak's site", "test machine", "hydrogin pump").
- [ ] Only Northwind data visible (the demo user's account is fully scoped).
- [ ] Sensor statuses ONLINE, machine HEALTHY at the first pause.
- [ ] Incident severity CRITICAL and explanation "ready" at the second pause.
