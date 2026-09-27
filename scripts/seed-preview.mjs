#!/usr/bin/env bun
/**
 * Preview seeding — drives the REAL HTTP API so the pipeline behaves exactly
 * as it would in production: register → login → site → machines → sensors →
 * backfilled readings → the embedded worker scores them into predictions
 * and incidents.
 *
 * Idempotent: if the demo site already exists, the script just TOPS UP fresh
 * readings (keeping sensors online and the ML window current) instead of
 * re-creating everything.
 *
 * Usage:
 *   bun scripts/seed-preview.mjs [--base http://localhost:8000]
 *
 * Credentials: ops_demo / ops.demo@sentinel.local / Sentinel#Demo2026
 */

const BASE = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "http://localhost:8000";
const API = `${BASE}/api/v1`;

const DEMO = {
  username: "ops_demo",
  email: "ops.demo@sentinel.local",
  password: "Sentinel#Demo2026",
};

const ROWS_TO_SEND = 90; // > ML_RECOMMENDED_WINDOW (60)
const INTERVAL_SEC = 30; // 90 rows = 45 min of history
const CHANNEL_STAGGER_MS = 1000; // each channel's event lands in its own bucket

const call = async (path, { method = "GET", body, token, apiKey, idem } = {}) => {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Cookie = `accessToken=${token}`;
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (idem) headers["Idempotency-Key"] = idem;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json.data ?? json;
};

const cookieToken = (setCookie = []) => {
  const row = (Array.isArray(setCookie) ? setCookie : [setCookie]).find((c) =>
    String(c).startsWith("accessToken=")
  );
  return row ? String(row).split(";")[0].split("=")[1] : null;
};

/* ── deterministic signal generators ─────────────────────────────── */

const sine = (i, amplitude, base, period) =>
  base + amplitude * Math.sin((2 * Math.PI * i) / period);

// healthy motor: stable baselines
const healthyRow = (i) => ({
  temperature: +sine(i, 1.2, 62, 24).toFixed(2),
  vibration: +sine(i, 0.3, 2.1, 30).toFixed(2),
  current: +sine(i, 0.4, 11.5, 18).toFixed(2),
  rpm: Math.round(sine(i, 25, 1780, 36)),
});

// degrading motor: vibration + temperature ramp, current follows
const degradingRow = (i, n) => {
  const t = i / n; // 0 → 1 across the backfill
  const ramp = t * t; // accelerating damage
  return {
    temperature: +sine(i, 1.5, 63 + 14 * ramp, 24).toFixed(2),
    vibration: +sine(i, 0.5, 2.2 + 6.5 * ramp, 30).toFixed(2),
    current: +sine(i, 0.5, 11.6 + 2.2 * ramp, 18).toFixed(2),
    rpm: Math.round(sine(i, 40, 1780 - 180 * ramp, 36)),
  };
};

const machineDefs = [
  {
    assetId: "MTR-101",
    name: "Intake Motor A",
    machineType: "motor",
    manufacturer: "Siemens",
    model: "1LE1503",
    zone: "Bay 1",
    signal: (i, n) => healthyRow(i),
  },
  {
    assetId: "MTR-102",
    name: "Intake Motor B",
    machineType: "motor",
    manufacturer: "Siemens",
    model: "1LE1503",
    zone: "Bay 1",
    signal: degradingRow, // this one should produce warning/critical
  },
  {
    assetId: "PMP-201",
    name: "Raw Water Pump",
    machineType: "pump",
    manufacturer: "Kirloskar",
    model: "KS-8103",
    zone: "Bay 2",
    signal: (i, n) => {
      const row = degradingRow(i, n);
      return { ...row, pressure: +sine(i, 0.6, 3.4 + 0.9 * (i / n), 26).toFixed(2) };
    },
  },
];

const channelsFor = (machineType) => [
  { type: "temperature", name: "Winding RTD", unit: "°C" },
  { type: "vibration", name: "Vibration Probe", unit: "mm/s" },
  { type: "current", name: "Stator Current", unit: "A" },
  { type: "rpm", name: "Tachometer", unit: "rpm" },
  ...(machineType === "pump"
    ? [{ type: "pressure", name: "Discharge Pressure", unit: "bar" }]
    : []),
];

/* ── backfill (shared by create + top-up paths) ──────────────────── */

let ingested = 0;

const backfill = async ({ apiKey, siteId, machine, sensors, signal }) => {
  const now = Date.now();
  // Gateway-style ingestion: one event per channel, staggered ~1s within a
  // cycle so each event forms its own window bucket (the window builder
  // buckets by exact timestamp and forward-fills gaps ≤ 300s). Keeps every
  // sensor's lastReadingAt fresh for the coverage gate.
  for (let i = 0; i < ROWS_TO_SEND; i += 1) {
    const row = signal(i, ROWS_TO_SEND);
    const channels = Object.entries(row);
    for (let chIdx = 0; chIdx < channels.length; chIdx += 1) {
      const [channel, value] = channels[chIdx];
      const timestamp = new Date(
        now - (ROWS_TO_SEND - 1 - i) * INTERVAL_SEC * 1000 + chIdx * CHANNEL_STAGGER_MS
      ).toISOString();
      await call("/events", {
        method: "POST",
        apiKey,
        idem: `${machine.assetId}-${channel}-${now}-${i}`,
        body: {
          siteId,
          machineId: machine._id,
          sensorId: sensors[channel]._id ?? sensors[channel].sensorId ?? sensors[channel].id,
          type: "sensor_reading",
          timestamp,
          values: { [channel]: value },
          source: "api",
        },
      });
      ingested += 1;
    }
  }
};

/* ── main ────────────────────────────────────────────────────────── */

const log = (msg) => console.log(`[seed] ${msg}`);

// 1. Register (409 → already exists → login instead)
log(`registering ${DEMO.email}`);
const registerRes = await fetch(`${API}/auth/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(DEMO),
});
let token = cookieToken(registerRes.headers.getSetCookie?.());
if (!registerRes.ok) {
  log("account exists — logging in");
  const loginRes = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: DEMO.email, password: DEMO.password }),
  });
  if (!loginRes.ok) throw new Error(`login failed: ${loginRes.status}`);
  token = cookieToken(loginRes.headers.getSetCookie?.());
}
if (!token) throw new Error("no accessToken cookie from auth");
log("authenticated ✓");

// 2. API key (rotating is fine — one key per user by design)
const keyResp = await fetch(`${API}/settings/api-key`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: `accessToken=${token}` },
});
const keyJson = await keyResp.json();
const apiKey = keyJson?.data?.secret;
if (!apiKey) throw new Error(`api key creation failed: ${keyResp.status} ${JSON.stringify(keyJson).slice(0, 200)}`);
log("ingest API key ready ✓");

// 3. Fresh install vs top-up
const existingSites = await call("/sites", { token });
let site = existingSites?.[0] ?? null;

if (site) {
  log(`existing site found ("${site.name}") — topping up readings`);
} else {
  site = await call("/sites", {
    method: "POST",
    token,
    body: {
      name: "Riverside Compressor Station",
      description: "Demo site: two motors and a pump on the river line",
      industry: "Water Utilities",
      timezone: "Asia/Kolkata",
    },
  });
  log(`site created: ${site._id} (siteId: ${site.siteId ?? site._id})`);
}

const siteId = site._id ?? site.siteId;

// 4. Ensure all demo machines exist
let machines = await call(`/machines/sites/${siteId}/machines`, { token });
const machineList = [...machines];
for (const def of machineDefs) {
  if (machineList.some((m) => m.assetId === def.assetId)) continue;
  const created = await call(`/machines/sites/${siteId}/machines`, {
    method: "POST",
    token,
    body: {
      assetId: def.assetId,
      name: def.name,
      machineType: def.machineType,
      manufacturer: def.manufacturer,
      model: def.model,
      zone: def.zone,
    },
  });
  machineList.push(created);
  log(`machine created: ${def.name}`);
}

// 5. Ensure sensors, then backfill fresh readings
for (const machine of machineList) {
  const def = machineDefs.find((d) => d.assetId === machine.assetId);
  if (!def) {
    log(`skipping "${machine.name}" (not part of the demo set)`);
    continue;
  }

  const existingSensors = await call(`/sensors/machines/${machine._id}/sensors`, { token });
  const sensors = {};
  for (const existing of existingSensors) sensors[existing.type] = existing;

  for (const ch of channelsFor(def.machineType)) {
    if (!sensors[ch.type]) {
      sensors[ch.type] = await call(`/sensors/machines/${machine._id}/sensors`, {
        method: "POST",
        token,
        body: { name: ch.name, type: ch.type, unit: ch.unit, expectedIntervalSec: INTERVAL_SEC },
      });
    }
  }
  log(`${machine.name}: sensors ready (${Object.keys(sensors).join(", ")})`);

  await backfill({ apiKey, siteId, machine, sensors, signal: def.signal });
  log(`${machine.name}: backfilled ${ROWS_TO_SEND} rows ✓`);
}

log(`done — ${ingested} events ingested across ${machineList.length} machines`);
log(`login: ${DEMO.email} / ${DEMO.password}`);
