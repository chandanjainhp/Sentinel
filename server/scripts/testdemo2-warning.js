#!/usr/bin/env bun
/**
 * testdemo2-warning — make system "testdemo-2" show a WARNING, then print it.
 *
 *   bun server/scripts/testdemo2-warning.js
 *   DEMO_API=http://localhost:8000/api/v1 bun server/scripts/testdemo2-warning.js
 *   TD2_FORCE_FALLBACK=1 bun server/scripts/testdemo2-warning.js
 *       # skip ingestion entirely and exercise the deterministic classifier
 *       # (sensors must have reported within the last 10 minutes — beyond
 *       #  the 10×interval grace, health resolves OFFLINE instead).
 *
 * Prerequisites:
 *   1. API running on :8000 (cd server && bun src/index.js)
 *   2. The demo account exists (bun server/scripts/demo-reset.js) — it is
 *      reused as the owner so the warning is visible in the normal UI.
 *   3. an API key for ingestion (POST /events is key-only): pass
 *      TD2_KEY=sk_… (or DEMO_KEY) — e.g. the secret demo-reset printed.
 *      Without it, the script creates a temporary key and revokes it at the
 *      end — but that only works for accounts that don't already have one
 *      (the DB still carries a legacy one-key-per-user unique index).
 *   4. ML service on :9000 for the live-scoring path. If it is down or never
 *      lands a score in the warning band, the script falls back to the
 *      server's OWN health classifier (evaluateMachineHealth) with a scored
 *      warning-band prediction — the same code the pipeline runs — and says
 *      so loudly in the output.
 *
 * What it does:
 *   1. logs in as the demo user
 *   2. ensures site + machine testdemo-2 (+ its 5 sensors) exist
 *   3. resolves an API key (TD2_KEY/DEMO_KEY, or a temporary one)
 *   4. if testdemo-2 is already WARNING → prints the warning and exits
 *   5. streams healthy readings until the coverage gate opens and the model
 *      scores the machine HEALTHY (proven demo-run pacing)
 *   6. ramps a vibration fault, steering amplitude against the live
 *      anomalyScore until health flips to WARNING (backs off if it
 *      overshoots CRITICAL — the classifier bands are 0.75 / 0.90)
 *   7. prints the warning: status, scores, incident, where to look in the UI
 *   8. revokes the temporary API key it created (only if it created one)
 *
 * Exit codes: 0 = testdemo-2 is WARNING and was printed; 1 = failure.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ── server/.env loader (same pattern as demo-reset / demo-run) ──── */
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

const SITE_NAME = "Northwind Fabrication"; // existing demo site — keeps the UI tidy
const MACHINE_NAME = "testdemo-2";
const ASSET_ID = "TESTDEMO-2";
const MACHINE_TYPE = "Centrifugal Compressor"; // proven demo shape: 5 channels incl. pressure

/* Pacing — identical to the proven demo-run values. */
const READING_GAP_MS = Number(process.env.TD2_READING_GAP_MS || 3500);
const FAULT_GAP_MS = Number(process.env.TD2_FAULT_GAP_MS || 4500);
const HEALTHY_CYCLES = Number(process.env.TD2_HEALTHY_CYCLES || 34);
const MAX_STEER_CYCLES = Number(process.env.TD2_MAX_STEER_CYCLES || 26);

/* Health bands (ml-contract.service.js): warning ≥ 0.75, critical ≥ 0.90. */
const WARN_SCORE = 0.75;
const CRIT_SCORE = 0.9;

const CHANNELS = ["temperature", "vibration", "current", "rpm", "pressure"];
const SENSOR_SPECS = [
  { type: "temperature", name: "Temperature", unit: "°C", expectedIntervalSec: 60 },
  { type: "vibration", name: "Vibration", unit: "mm/s", expectedIntervalSec: 60 },
  { type: "current", name: "Current", unit: "A", expectedIntervalSec: 60 },
  { type: "rpm", name: "RPM", unit: "rpm", expectedIntervalSec: 60 },
  { type: "pressure", name: "Discharge Pressure", unit: "bar", expectedIntervalSec: 60 },
];

const TAG = "[testdemo2-warning]";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (line) => console.log(`\n${line}`);
const die = (msg) => {
  console.error(`\n${TAG} ${msg}`);
  process.exit(1);
};

const api = async (method, p, { cookie, key, body, headers } = {}) => {
  const res = await fetch(`${API}${p}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...(headers || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json, setCookie: res.headers.get("set-cookie") };
};

/** Poll until fn() is ok; returns value, or null on timeout (non-fatal). */
const tryUntil = async (describe, fn, timeoutMs, intervalMs = 1500) => {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v && v.ok) return v.value;
    if (Date.now() - start > timeoutMs) {
      console.warn(`${TAG} timed out waiting for ${describe} — moving on.`);
      return null;
    }
    await wait(intervalMs);
  }
};

/* ── Synthetic telemetry (copied from demo-run: the model's training
 * distribution — correlated channels, not independent wiggles). ────── */
const gauss = () =>
  Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random());

const makeTelemetry = () => {
  const DAY = 1440;
  let ar = 0;
  let ema = null;
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
      pressure: +(6.8 + 0.15 * load + gauss() * 0.05).toFixed(3),
    };
  };
};
const telemetry = makeTelemetry();

/* ── 1. Login ──────────────────────────────────────────────────────── */
console.log(`${TAG} logging in as ${DEMO_EMAIL}…`);
const login = await api("POST", "/auth/login", {
  body: { email: DEMO_EMAIL, emailOrUsername: DEMO_EMAIL, password: DEMO_PASSWORD },
});
if (login.status === 429) {
  die("rate-limited (auth allows 5 logins / 15 min). Wait for the window or restart the API server, then re-run.");
}
if (login.status !== 200) {
  die(`login failed (${login.status}) — run: bun server/scripts/demo-reset.js  (first: ${JSON.stringify(login.json).slice(0, 160)})`);
}
const cookie = login.setCookie;
if (!cookie) die("login did not set a session cookie");

/* ── 2. Estate: site → machine testdemo-2 → sensors (idempotent) ───── */
const sites = (await api("GET", "/sites", { cookie })).json?.data || [];
const site = sites.find((s) => s.name === SITE_NAME) || sites[0];
if (!site) die("no site found — run bun server/scripts/demo-reset.js first");

let machines = (await api("GET", `/machines/sites/${site.siteId}/machines`, { cookie })).json?.data || [];
let machine = machines.find((m) => m.name === MACHINE_NAME || m.assetId === ASSET_ID);
if (!machine) {
  const created = await api("POST", `/machines/sites/${site.siteId}/machines`, {
    cookie,
    body: {
      assetId: ASSET_ID,
      name: MACHINE_NAME,
      machineType: MACHINE_TYPE,
      manufacturer: "Test Rig",
      model: "TD-2",
      location: "Test bench",
    },
  });
  if (created.status !== 201 && created.status !== 200) {
    die(`machine create failed (${created.status}): ${JSON.stringify(created.json).slice(0, 240)}`);
  }
  machine = created.json.data;
  console.log(`${TAG} created machine ${machine.name} [${machine.assetId}] (${machine.machineId})`);
} else {
  console.log(`${TAG} machine already exists: ${machine.name} (${machine.machineId}) status=${machine.status}`);
}

const sensors = (await api("GET", `/sensors/machines/${machine.machineId}/sensors`, { cookie })).json?.data || [];
const byChannel = Object.fromEntries(sensors.map((s) => [s.type, s]));
for (const spec of SENSOR_SPECS) {
  if (byChannel[spec.type]) continue;
  const s = await api("POST", `/sensors/machines/${machine.machineId}/sensors`, { cookie, body: spec });
  if (s.status >= 400) die(`sensor create failed for ${spec.type} (${s.status}): ${JSON.stringify(s.json).slice(0, 200)}`);
  byChannel[spec.type] = s.json.data;
  console.log(`${TAG} created sensor ${spec.name} (${s.json.data.sensorId})`);
}

const refreshMachine = async () =>
  (await api("GET", `/machines/${machine.machineId}`, { cookie })).json?.data;
const latestPrediction = async () =>
  (await api("GET", `/predictions/machines/${machine.machineId}/latest`, { cookie })).json?.data;
const showIncidents = async () =>
  (await api("GET", `/incidents?machineId=${machine.machineId}`, { cookie })).json?.data || [];

/* ── Deterministic fallback: the server's OWN health classifier ──────
 * Same code the pipeline runs (evaluateMachineHealth → classifyScores →
 * incident creation), fed a scored prediction inside the warning band.
 * Requires fresh sensor readings: past 10×expectedIntervalSec every sensor
 * computes OFFLINE and health overrides to OFFLINE instead of WARNING. */
async function runFallback() {
  say("── FALLBACK · classifying with the server's real health code ────");
  console.log(`${TAG} classifying with the server's own evaluateMachineHealth()`);
  console.log(`${TAG} (scored prediction at anomalyScore=0.78 → warning band 0.75–0.899).`);
  const { default: mongoose } = await import("mongoose");
  await mongoose.connect(process.env.MONGODB_URL, { serverSelectionTimeoutMS: 10000 });
  try {
    const { Machine } = await import("../src/models/machine.model.js");
    const { evaluateMachineHealth } = await import("../src/services/machine-health.service.js");
    const doc = await Machine.findOne({ machineId: machine.machineId });
    if (!doc) die("machine disappeared from the database mid-run");
    const prediction = {
      _id: new mongoose.Types.ObjectId(),
      predictionId: `pred_testdemo2_${Date.now()}`,
      machineId: doc._id,
      model: "lstm_autoencoder",
      faultType: null,
      rulValue: null,
      timestamp: new Date(),
      anomalyScore: 0.78,
      faultProbability: 0.3,
    };
    const res = await evaluateMachineHealth(prediction);
    console.log(`${TAG} evaluateMachineHealth → status=${res?.status}`);
  } finally {
    await mongoose.disconnect();
  }
}

/* ── 3. Already WARNING? → just show it. ───────────────────────────── */
let current = await refreshMachine();
if (current?.status === "warning") {
  console.log(`${TAG} ${MACHINE_NAME} is already WARNING — printing it.`);
} else if (process.env.TD2_FORCE_FALLBACK) {
  /* Test hook: exercise the deterministic classifier without ingestion. */
  console.log(`${TAG} TD2_FORCE_FALLBACK set — skipping ingestion, classifying directly.`);
  await runFallback();
  current = await refreshMachine();
} else {
  /* ── 4. API key for event ingestion (key-only endpoint) ──────────── */
  let key = process.env.TD2_KEY || process.env.DEMO_KEY || null;
  let tempKeyName = null;
  if (!key) {
    const keyName = `testdemo2-warning tmp ${Date.now()}`;
    const keyRes = await api("POST", "/settings/api-keys", { cookie, body: { name: keyName } });
    if (keyRes.status === 409) {
      die(
        "this account already has an API key and the database still carries the legacy\n" +
        "  one-key-per-user unique index, so a temporary one cannot be created. Re-run with:\n" +
        "    TD2_KEY=sk_… bun server/scripts/testdemo2-warning.js\n" +
        "  (the secret was printed by demo-reset.js — see /tmp/demo-reset.log — or run\n" +
        "   bun server/scripts/drop-apikey-userid-unique-index.mjs to lift the legacy index)."
      );
    }
    if (keyRes.status >= 400 || !keyRes.json?.data?.secret) {
      die(`API key creation failed (${keyRes.status}): ${JSON.stringify(keyRes.json).slice(0, 200)}`);
    }
    key = keyRes.json.data.secret;
    tempKeyName = keyName;
    console.log(`${TAG} temporary API key created (revoked at the end of the run).`);
  } else {
    console.log(`${TAG} using the API key supplied via ${process.env.DEMO_KEY && !process.env.TD2_KEY ? "DEMO_KEY" : "TD2_KEY"}.`);
  }
  const keyList = tempKeyName
    ? (await api("GET", "/settings/api-keys", { cookie })).json?.data || []
    : [];
  const tempKeyRow = keyList.find((k) => k.name === tempKeyName);

  const runId = Date.now().toString(36);
  let cycle = 0;
  const postCycle = async (values, tsOverride) => {
    const base = tsOverride ? Date.parse(tsOverride) : Date.now();
    let idx = 0;
    for (const ch of CHANNELS) {
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
        headers: { "Idempotency-Key": `td2-${runId}-${cycle}-${ch}` },
      });
      if (res.status !== 201 && res.status !== 200) {
        die(`POST /events ${ch} failed (${res.status}): ${JSON.stringify(res.json).slice(0, 200)}`);
      }
      idx += 1;
    }
    cycle += 1;
  };

  /* ── 5a. Healthy phase — coverage gate opens, first ML score ────── */
  say("── PHASE 1 · Healthy readings (coverage gate → first ML score) ──");
  for (let i = 0; i < HEALTHY_CYCLES; i += 1) {
    await postCycle(telemetry());
    if ((i + 1) % 6 === 0 || i === HEALTHY_CYCLES - 1) {
      console.log(`${TAG}   healthy cycle ${i + 1}/${HEALTHY_CYCLES}`);
    }
    await wait(READING_GAP_MS);
  }

  const firstScore = await tryUntil(
    "first ML prediction",
    async () => {
      const p = await latestPrediction();
      return p && p.anomalyScore != null ? { ok: true, value: p } : { ok: false, value: p };
    },
    90000,
  );
  if (firstScore) {
    await tryUntil(
      "machine HEALTHY",
      async () => {
        const m = await refreshMachine();
        return m?.status === "healthy" ? { ok: true, value: m } : { ok: false, value: m };
      },
      60000,
    );
    console.log(`${TAG} first score: anomalyScore=${firstScore.anomalyScore}`);
  } else {
    console.warn(`${TAG} ML did not score in time (service down?). Readings are ingested;`);
    console.warn(`${TAG} continuing — the deterministic fallback will classify the machine.`);
  }

  /* ── 5b. Adaptive fault phase — steer into the WARNING band ─────── */
  say("── PHASE 2 · Steering a vibration fault into the WARNING band ──");
  let amp = 3.6; // healthy vibration sits ~2.0–3.0 mm/s
  let status = (await refreshMachine())?.status;
  for (let i = 0; i < MAX_STEER_CYCLES && status !== "warning"; i += 1) {
    const p = await latestPrediction();
    const score = typeof p?.anomalyScore === "number" ? p.anomalyScore : null;

    if (status === "critical" || (score != null && score >= CRIT_SCORE)) {
      amp = Math.max(3.0, amp - 1.4);
      console.log(`${TAG}   score=${score ?? "?"} status=${status} → overshoot, backing vibration off to ${amp.toFixed(1)} mm/s`);
    } else if (score == null || score < WARN_SCORE) {
      amp = Math.min(10.5, amp + 0.7);
      console.log(`${TAG}   score=${score ?? "?"} status=${status} → pushing vibration to ${amp.toFixed(1)} mm/s`);
    } else {
      console.log(`${TAG}   score=${score} is inside the warning band but health has not flipped yet — re-scoring`);
    }

    const values = { ...telemetry(), vibration: +amp.toFixed(3) };
    await postCycle(values);
    await wait(FAULT_GAP_MS);
    status = (await refreshMachine())?.status;
    console.log(`${TAG}   cycle ${i + 1}/${MAX_STEER_CYCLES} posted → status=${status}`);
  }

  /* ── 5c. Fallback — the server's own classifier, deterministic ───── */
  current = await refreshMachine();
  if (current?.status !== "warning") {
    await runFallback();
    current = await refreshMachine();
  }

  /* ── Revoke the temporary key (only one we created) ──────────────── */
  if (tempKeyName) {
    if (tempKeyRow?.keyId) {
      const rev = await api("DELETE", `/settings/api-keys/${tempKeyRow.keyId}`, { cookie });
      console.log(`${TAG} temporary API key revoked (status ${rev.status}).`);
    } else {
      console.warn(`${TAG} could not find the temp key id to revoke it — revoke it in Settings → API keys.`);
    }
  }
}

/* ── 6. SHOW the warning ───────────────────────────────────────────── */
say("── WARNING ────────────────────────────────────────────────────────");
current = await refreshMachine();
const pred = await latestPrediction();
const incidents = await showIncidents();
const incident = incidents[0];

if (current?.status !== "warning") {
  console.error(`FAILED — ${MACHINE_NAME} is "${current?.status}", not "warning".`);
  console.error("Check the API log (/tmp/sentinel-server.log) and that events/predictions are flowing.");
  process.exit(1);
}

const scoreLine =
  pred?.anomalyScore != null
    ? `anomalyScore=${pred.anomalyScore} faultProbability=${pred.faultProbability ?? "?"} (warning band ≥ ${WARN_SCORE}, critical ≥ ${CRIT_SCORE})`
    : "no scored prediction on record";
const incidentLine = incident
  ? `${incident.title} [severity=${incident.severity} status=${incident.status}]`
  : "(no incident row — health status is the warning)";
/* Incidents only ever escalate (incident.service.js) — if the fault peaked
 * harder mid-ramp, the incident keeps that higher severity even after the
 * machine settles back to WARNING. Say so instead of looking like a bug. */
const severityNote =
  incident && incident.severity === "critical" && current.status === "warning"
    ? `\n    note           the incident peaked at CRITICAL while the fault was\n                   ramping; incidents never downgrade, but the machine\n                   health — the WARNING above — is the live state.`
    : "";

console.log(`
  ⚠  WARNING  —  system "${MACHINE_NAME}" (${ASSET_ID})
  ─────────────────────────────────────────────────────────────
    machine id     ${machine.machineId}
    site           ${site.name}
    status         ${current.status.toUpperCase()}
    scores         ${scoreLine}
    incident       ${incidentLine}${severityNote}
  ─────────────────────────────────────────────────────────────
    See it in the UI (logged in as ${DEMO_EMAIL}):
      • Overview  → machine card shows the amber WARNING state
      • Incidents → the warning incident for ${MACHINE_NAME}
      • Machines  → ${MACHINE_NAME} row, status WARNING
============================================================
`);
process.exit(0);
