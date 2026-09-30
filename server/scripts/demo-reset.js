#!/usr/bin/env bun
/**
 * Demo reset — builds a persistent, clean demo account for screen recordings.
 *
 *   bun server/scripts/demo-reset.js
 *
 * Scoped cleanup: deletes ONLY the data owned by the demo user (and the old
 * throwaway "demo@factory.com" account from earlier manual testing). Other
 * users' data — including your own account — is never touched. Then it
 * creates the demo estate:
 *
 *   site     Northwind Fabrication
 *   machine  COMP-02 · Compressor Line 2   (Centrifugal Compressor)
 *   sensors  Temperature · Vibration · Current · RPM · Discharge Pressure
 *            (pressure is required by the coverage gate for compressors)
 *   API key  "Recording gateway key" (secret printed once, below)
 *
 * The account PERSISTS between takes — run this before each recording to get
 * an empty slate (no readings, no predictions, no incidents). Requires the
 * dev API server to be running on :8000 (it registers/logs in via HTTP so
 * bcrypt hashing and validation match the real flow).
 *
 * Connection settings come from server/.env (MONGODB_URL), with overrides:
 *   DEMO_API=http://localhost:8000/api/v1
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ── server/.env loader (must run from anywhere) ─────────────────── */
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
const DEMO_USERNAME = "northwind_demo";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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

const die = (msg) => {
  console.error(`\n[demo-reset] ${msg}`);
  console.error("[demo-reset] Is the dev API server running?  cd server && bun src/index.js");
  process.exit(1);
};

console.log("[demo-reset] connecting to mongo…");

/* ── Mongo (mongoose from server/node_modules) ───────────────────── */
process.env.NODE_ENV = process.env.NODE_ENV || "development";
const mongoose = (await import("mongoose")).default;
await mongoose.connect(process.env.MONGODB_URL, { serverSelectionTimeoutMS: 10000 });

const db = mongoose.connection.db;

/* Legacy throwaway account from earlier manual testing — safe to remove. */
const LEGACY_EMAILS = ["demo@factory.com"];
const LEGACY_USERNAMES = ["demo"];

/* ── 1. Remove previous demo data (scoped) ───────────────────────── */
const doomed = await db
  .collection("users")
  .find({
    $or: [
      { email: { $in: [DEMO_EMAIL, ...LEGACY_EMAILS].map((e) => e.toLowerCase()) } },
      { username: { $in: LEGACY_USERNAMES.map((u) => u.toLowerCase()) } },
    ],
  })
  .project({ _id: 1, email: 1 })
  .toArray();

if (doomed.length) {
  for (const u of doomed) {
    const id = u._id;
    const r = {};
    for (const c of [
      "events", "predictions", "incidents", "sensors", "machines",
      "sites", "apikeys", "auditlogs", "briefings", "investigations",
      "outboxevents", "webhookdeliveries",
    ]) {
      r[c] = (await db.collection(c).deleteMany({ userId: id })).deletedCount;
    }
    await db.collection("users").deleteOne({ _id: id });
    console.log(
      `[demo-reset] removed old demo user ${u.email}: ` +
        Object.entries(r).filter(([, n]) => n > 0).map(([c, n]) => `${c}=${n}`).join(", ") || "no data"
    );
  }
} else {
  console.log("[demo-reset] no previous demo data found (first run)");
}

/* ── 2. Create the fresh demo account ────────────────────────────── */
const reg = await api("POST", "/auth/register", {
  body: {
    email: DEMO_EMAIL,
    username: DEMO_USERNAME,
    password: DEMO_PASSWORD,
    fullName: "Dana Reyes",
  },
});
if (reg.status !== 201) {
  die(`register failed (${reg.status}): ${JSON.stringify(reg.json).slice(0, 300)}`);
}
const cookie = reg.setCookie;
if (!cookie) die("register did not set a session cookie");

const me = (await api("GET", "/auth/current-user", { cookie })).json?.data;
const userId = me?._id || me?.id;
console.log(`[demo-reset] created account ${DEMO_EMAIL} (userId=${userId})`);

/* Safety net: if fullName was ignored at registration, patch it directly so
 * the profile screen never shows an empty name on camera. */
if (userId) {
  await db.collection("users").updateOne(
    { _id: new (mongoose.Types.ObjectId)(userId) },
    { $set: { fullName: "Dana Reyes" } }
  );
}

/* ── 3. Estate: site → machine → 4 sensors → API key ─────────────── */
const site = (await api("POST", "/sites", {
  cookie,
  body: {
    name: "Northwind Fabrication",
    description: "Demo plant — compressed-air line serving the CNC hall",
    industry: "Light manufacturing",
    timezone: "UTC",
  },
})).json.data;
console.log(`[demo-reset] site: ${site.name} (${site.siteId})`);

const machine = (await api("POST", `/machines/sites/${site.siteId}/machines`, {
  cookie,
  body: {
    assetId: "COMP-02",
    name: "Compressor Line 2",
    machineType: "Centrifugal Compressor",
    manufacturer: "Atlas Copco",
    model: "GA 90 VSD",
    location: "Compressor room, bay 2",
  },
})).json.data;
console.log(`[demo-reset] machine: ${machine.name} [${machine.assetId}] (${machine.machineId})`);

// NOTE: compressor-type machines require a pressure channel on top of the
// ML baseline four, or the coverage gate never opens (sensor-requirements
// config: TYPE_SPECIFIC_CHANNELS.COMPRESSOR = ["pressure"]).
const SENSOR_SPECS = [
  { type: "temperature", name: "Temperature", unit: "°C", expectedIntervalSec: 60 },
  { type: "vibration", name: "Vibration", unit: "mm/s", expectedIntervalSec: 60 },
  { type: "current", name: "Current", unit: "A", expectedIntervalSec: 60 },
  { type: "rpm", name: "RPM", unit: "rpm", expectedIntervalSec: 60 },
  { type: "pressure", name: "Discharge Pressure", unit: "bar", expectedIntervalSec: 60 },
];
const sensors = {};
for (const s of SENSOR_SPECS) {
  sensors[s.type] = (await api("POST", `/sensors/machines/${machine.machineId}/sensors`, {
    cookie,
    body: { name: s.name, type: s.type, unit: s.unit, expectedIntervalSec: s.expectedIntervalSec },
  })).json.data;
  console.log(`[demo-reset] sensor: ${s.name} (${sensors[s.type].sensorId})`);
}

const keyRes = await api("POST", "/settings/api-keys", {
  cookie,
  body: { name: "Recording gateway key" },
});
const key =
  keyRes.json?.data?.secret ||
  (await api("POST", "/settings/api-key", { cookie })).json?.data?.secret;
if (!key) die(`API key creation failed (${keyRes.status}): ${JSON.stringify(keyRes.json).slice(0, 200)}`);
console.log("[demo-reset] API key created: Recording gateway key");

await mongoose.disconnect();

/* ── 4. Print the recording cheat-sheet ──────────────────────────── */
console.log(`
============================================================
 DEMO READY — copy these for your recording setup
============================================================
 Login        ${DEMO_EMAIL}
 Password     ${DEMO_PASSWORD}
 API key      ${key}

 Site         Northwind Fabrication
 Machine      Compressor Line 2 [COMP-02]
 Sensors      Temperature · Vibration · Current · RPM · Discharge Pressure
============================================================
 Next: start the frontend, log in, then run the paced
 sequence:  bun server/scripts/demo-run.js
 (keep this key — it is shown only once)
============================================================
`);
