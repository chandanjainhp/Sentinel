#!/usr/bin/env bun
/**
 * Demo run — a paced, narratable walkthrough of the Sentinel pipeline.
 *
 *   bun server/scripts/demo-run.js            # pauses wait for Enter
 *   DEMO_AUTO_DELAY_MS=8000 bun ...           # no pauses; auto-continue
 *   DEMO_API=http://localhost:8000/api/v1 bun ...
 *
 * Prerequisites:
 *   1. Stack running: API :8000, ML :9000, Mongo, Redis, frontend :3000
 *   2. `bun server/scripts/demo-reset.js` has been run (fresh, empty estate)
 *   3. You are logged in to the frontend as the demo user, watching the
 *      Sensors page (then Overview, then the incident/Argus view).
 *
 * The sequence mirrors scripts/e2e-smoke.js — the proven end-to-end path —
 * but paces every step for a camera: readings arrive a few seconds apart so
 * sensors visibly flip ONLINE one at a time, the machine health visibly
 * transitions HEALTHY → WARNING → CRITICAL, and the script pauses at each
 * narrative beat.
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ── server/.env loader (env wins; demo needs DEMO_API / DEMO_KEY) ── */
{
  const envPath = path.resolve(__dirname, "../.env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  }
}

const API = process.env.DEMO_API || "http://localhost:8000/api/v1";
const DEMO_EMAIL = "demo@northwind.example";
const DEMO_PASSWORD = "NorthwindDemo123!";

/* Pacing knobs */
const READING_GAP_MS = Number(process.env.DEMO_READING_GAP_MS || 3500);
const FAULT_GAP_MS = Number(process.env.DEMO_FAULT_GAP_MS || 4500);
const FAULT_CYCLES = Number(process.env.DEMO_FAULT_CYCLES || 26);
/* Only complete 5-channel cycles (all required channels for the compressor,
 * including pressure) become ML window rows, and the model needs >= 30 rows
 * (seq_len) to score — the proven smoke run posts 40. */
const HEALTHY_CYCLES = Number(process.env.DEMO_HEALTHY_CYCLES || 34);
const AUTO_DELAY_MS = process.env.DEMO_AUTO_DELAY_MS
  ? Number(process.env.DEMO_AUTO_DELAY_MS)
  : null; // null = interactive pauses on Enter

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const pause = async (msg) => {
  console.log(`\n▶▶▶  PAUSE HERE — ${msg}\n`);
  if (AUTO_DELAY_MS !== null) {
    console.log(`    (auto-continue in ${AUTO_DELAY_MS / 1000}s)`);
    await wait(AUTO_DELAY_MS);
    return;
  }
  await new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("    press Enter to continue… ", () => { rl.close(); resolve(); });
  });
};

const say = (line) => console.log(`\n${line}`);

const api = async (method, p, { cookie, key, body } = {}) => {
  const res = await fetch(`${API}${p}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json, setCookie: res.headers.get("set-cookie") };
};

const waitUntil = async (describe, fn, timeoutMs, intervalMs = 1500) => {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v && v.ok) return v.value;
    if (Date.now() - start > timeoutMs) {
      console.error(`\n[demo-run] timed out waiting for ${describe}`);
      console.error(`[demo-run] last state: ${v ? JSON.stringify(v).slice(0, 300) : "(none)"}`);
      process.exit(1);
    }
    await wait(intervalMs);
  }
};

/* ── Sensor synthetic values ───────────────────────────────────────
 * Healthy telemetry mirrors the model's training generator
 * (ml-service/train/synthetic.py): a shared, slowly varying "load" factor
 * (daily sine + AR(1) wander) drives every channel with different gains,
 * plus per-channel sensor noise. That cross-channel correlation is what the
 * autoencoder actually learned — independent per-channel wiggles read as
 * anomalous even though each channel looks plausible on its own.
 *
 * During the fault only vibration is overridden (ramp 2.4 → ~11.8 mm/s),
 * exactly like e2e-smoke's proven vibration_anomaly scenario. */
const gauss = () =>
  Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random());

const makeTelemetry = () => {
  const DAY = 1440; // readings per day at a 60s cadence
  let ar = 0; // AR(1) load wander
  let ema = null; // thermal lag on temperature (EMA alpha 0.05)
  let i = 0;
  return () => {
    const t = i;
    i += 1;
    ar = 0.98 * ar + gauss() * 0.03;
    const load = 0.5 * Math.sin((2 * Math.PI * t) / DAY) + ar;
    ema = ema === null ? load : 0.05 * load + 0.95 * ema;
    const drift = 0.8 * Math.sin((2 * Math.PI * t) / (7 * DAY));
    return {
      temperature: +(72.0 + 6.0 * ema + drift + gauss() * 0.4).toFixed(3),
      vibration: +(2.4 + 0.5 * load + gauss() * 0.12).toFixed(3),
      current: +(14.0 + 3.0 * load + gauss() * 0.25).toFixed(3),
      rpm: Math.round(1485.0 - 15.0 * load + gauss() * 2.0),
      // Coverage-gate channel for compressors; not an ML model feature, but
      // a plausible, load-correlated bar reading keeps the UI honest.
      pressure: +(6.8 + 0.15 * load + gauss() * 0.05).toFixed(3),
    };
  };
};
const telemetry = makeTelemetry();
const healthyValues = () => telemetry();
const faultValues = (i, n) => ({
  ...telemetry(),
  vibration: +(2.4 + (i / (n - 1)) * 9.4).toFixed(3),
});

/* ── Run ─────────────────────────────────────────────────────────── */
console.log("[demo-run] logging in as the demo user…");
const login = await api("POST", "/auth/login", {
  body: { email: DEMO_EMAIL, emailOrUsername: DEMO_EMAIL, username: DEMO_EMAIL, password: DEMO_PASSWORD },
});
if (login.status !== 200) {
  console.error(`[demo-run] login failed (${login.status}) — run bun server/scripts/demo-reset.js first.`);
  process.exit(1);
}
const cookie = login.setCookie;

const sites = (await api("GET", "/sites", { cookie })).json.data;
const site = sites[0];
const machines = (await api("GET", `/machines/sites/${site.siteId}/machines`, { cookie })).json.data;
const machine = machines[0];
const sensors = (await api("GET", `/sensors/machines/${machine.machineId}/sensors`, { cookie })).json.data;
const byChannel = Object.fromEntries(sensors.map((s) => [s.type, s]));

const missing = ["temperature", "vibration", "current", "rpm", "pressure"].filter((c) => !byChannel[c]);
if (missing.length) {
  console.error(`[demo-run] demo estate incomplete — missing sensors: ${missing.join(", ")}`);
  console.error("[demo-run] run bun server/scripts/demo-reset.js to rebuild it.");
  process.exit(1);
}

const keyRow = (await api("GET", "/settings/api-keys", { cookie })).json.data?.[0];
if (!keyRow) {
  console.error("[demo-run] the demo API key was revoked — run bun server/scripts/demo-reset.js to reissue.");
  process.exit(1);
}
console.error(
  `[demo-run] NOTE: the key's secret is only shown by demo-reset. Paste it into:\n` +
  `  DEMO_KEY=sk_… bun server/scripts/demo-run.js`
);
if (!process.env.DEMO_KEY) {
  console.error("[demo-run] DEMO_KEY env var is required (the secret from demo-reset).");
  process.exit(1);
}
const key = process.env.DEMO_KEY;

console.log(`[demo-run] estate: ${site.name} → ${machine.name} [${machine.assetId}] (${sensors.length} sensors)`);

let cycle = 0;
const postCycle = async (values, channels, tsOverride) => {
  // One event per channel, 400 ms forward stagger inside the cycle (exactly
  // e2e-smoke's proven shape): each channel lands in its own window bucket
  // and age-fill merges them into complete multi-channel rows. The server
  // fetches the newest 60 EVENTS as the window source, so the stagger (not
  // identical timestamps) is what makes 60 events span enough buckets for
  // the model's seq_len of 30. Values stay cycle-coherent: the fill is
  // sub-2-second stale, invisible to the model.
  const base = tsOverride ? Date.parse(tsOverride) : Date.now();
  let idx = 0;
  for (const ch of channels) {
    const res = await api("POST", "/events", {
      key,
      body: {
        siteId: site.siteId,
        machineId: machine.machineId,
        sensorId: byChannel[ch].sensorId,
        type: "sensor_reading",
        timestamp: new Date(base + idx * 400).toISOString(),
        values: { [ch]: values[ch] },
      },
      headers: { "Idempotency-Key": `demo-${cycle}-${ch}` },
    });
    if (res.status !== 201 && res.status !== 200) {
      console.error(`[demo-run] POST /events ${ch} failed (${res.status}): ${JSON.stringify(res.json).slice(0, 200)}`);
      process.exit(1);
    }
    idx += 1;
  }
  cycle += 1;
};

/* ── PHASE 1 — sensors come online, one at a time ────────────────── */
say("── PHASE 1 · Sensors reporting ───────────────────────────────");
const CHANNEL_LABEL = {
  temperature: "Temperature",
  vibration: "Vibration",
  current: "Current",
  rpm: "RPM",
  pressure: "Discharge Pressure",
};
const firstReadings = healthyValues(); // one snapshot; all sensors "sampled" together
const firstTs = new Date().toISOString(); // shared timestamp → one clean window row
for (const ch of ["temperature", "vibration", "current", "rpm", "pressure"]) {
  await postCycle(firstReadings, [ch], firstTs);
  console.log(`  ✓ ${CHANNEL_LABEL[ch]} reading accepted — it should flip ONLINE on the Sensors page within ~10s.`);
  await wait(READING_GAP_MS);
}

/* ── PHASE 2 — coverage gate opens, first prediction, HEALTHY ────── */
say("── PHASE 2 · Coverage gate opens → first prediction ─────────");
console.log("  streaming healthy readings (every few seconds, all channels)…");
const healthyStart = cycle;
while (cycle - healthyStart < HEALTHY_CYCLES) {
  await postCycle(healthyValues(), ["temperature", "vibration", "current", "rpm", "pressure"]);
  const secs = ((cycle - healthyStart) * READING_GAP_MS) / 1000;
  console.log(`  ✓ healthy cycle ${cycle - healthyStart}/${HEALTHY_CYCLES} posted (${secs.toFixed(0)}s elapsed)`);
  await wait(READING_GAP_MS);
}

await waitUntil(
  "first prediction",
  async () => {
    const r = await api("GET", `/predictions/machines/${machine.machineId}/latest`, { cookie });
    const p = r.json?.data;
    return p && p.anomalyScore != null ? { ok: true, value: p } : { ok: false, value: p };
  },
  90000
);
console.log("  ✓ ML scored the first healthy window — prediction stored.");

const healthyMachine = await waitUntil(
  "machine HEALTHY",
  async () => {
    const m = (await api("GET", `/machines/${machine.machineId}`, { cookie })).json?.data;
    return m?.status === "healthy" ? { ok: true, value: m } : { ok: false, value: m };
  },
  60000
);
console.log(`  ✓ machine health: ${String(healthyMachine.status).toUpperCase()}`);

await pause(
  "show the Sensors page (all ONLINE) and the Overview — machine reads HEALTHY. " +
    "Narrate: 'Every reading is scored by an LSTM autoencoder; a healthy compressor stays quiet.'"
);

let lastLoggedStatus = "healthy"; // already announced at the end of Phase 2
const logHealthIfChanged = async () => {
  const m = (await api("GET", `/machines/${machine.machineId}`, { cookie })).json?.data;
  const status = m?.status || null;
  if (status && status !== lastLoggedStatus) {
    console.log(`  ● machine health now: ${String(status).toUpperCase()}`);
    lastLoggedStatus = status;
  }
};

/* ── PHASE 3 — vibration fault ramps in real time ────────────────── */
say("── PHASE 3 · Injecting a vibration fault ────────────────────");
console.log("  vibration ramping 2.3 → ~11.8 mm/s across the next cycles…");
const faultStart = cycle;
for (let i = 0; i < FAULT_CYCLES; i += 1) {
  await postCycle(faultValues(i, FAULT_CYCLES), ["temperature", "vibration", "current", "rpm", "pressure"]);
  console.log(
    `  ✓ fault cycle ${i + 1}/${FAULT_CYCLES} — vibration ${faultValues(i, FAULT_CYCLES).vibration} mm/s`
  );
  await wait(FAULT_GAP_MS);
  await logHealthIfChanged();
}

const degraded = await waitUntil(
  "machine WARNING or CRITICAL",
  async () => {
    const m = (await api("GET", `/machines/${machine.machineId}`, { cookie })).json?.data;
    return m && (m.status === "warning" || m.status === "critical") ? { ok: true, value: m } : { ok: false, value: m };
  },
  120000
);
console.log(`  ✓ machine health: ${String(degraded.status).toUpperCase()}`);

/* ── PHASE 4 — incident + Argus explanation ──────────────────────── */
say("── PHASE 4 · Incident fires — Argus investigates ────────────");
const incident = await waitUntil(
  "open incident",
  async () => {
    const list = (await api("GET", `/incidents?machineId=${machine.machineId}&status=open`, { cookie })).json?.data || [];
    return list.length >= 1 ? { ok: true, value: list[0] } : { ok: false, value: list.length };
  },
  60000
);
console.log(`  ✓ incident: ${incident.title} (severity=${incident.severity})`);

const explained = await waitUntil(
  "Argus explanation",
  async () => {
    const list = (await api("GET", `/incidents?machineId=${machine.machineId}&status=open`, { cookie })).json?.data || [];
    const e = list[0]?.explanation;
    return e && e.status === "ready" ? { ok: true, value: e } : { ok: false, value: e?.status || "pending" };
  },
  90000
);
console.log(`  ✓ Argus explanation ready (source=${explained.source}, urgency=${explained.urgency})`);
say(`    summary: ${String(explained.summary).slice(0, 140)}`);

await pause(
  "show the incident and the Argus explanation (Incidents → the open incident). " +
    "Narrate: 'Sentinel caught the bearing fault before it became a failure — and Argus explains why.'"
);

/* ── Wrap-up ─────────────────────────────────────────────────────── */
const finalMachine = (await api("GET", `/machines/${machine.machineId}`, { cookie })).json?.data;
console.log(`
============================================================
 DEMO SEQUENCE COMPLETE — final state on screen:
   machine      ${finalMachine?.status?.toUpperCase?.() || "?"}
   incident     ${incident.title}
   explanation  ${explained.source} · urgency=${explained.urgency}
============================================================
 Re-run any time:  bun server/scripts/demo-reset.js
============================================================
`);
