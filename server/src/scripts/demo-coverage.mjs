/**
 * Manual verification: boots the real Express app, walks one machine from
 * partial → full sensor coverage, and prints the ACTUAL coverage endpoint
 * responses. Self-terminating — safe to run repeatedly.
 *
 *   PORT=8098 \
 *   MONGODB_URL="mongodb://sentinel:sentinel-test@localhost:28017/sentinel_demo_coverage?authSource=admin" \
 *   REDIS_URL="redis://localhost:26379/3" \
 *   bun src/scripts/demo-coverage.mjs
 */
process.env.NODE_ENV = process.env.NODE_ENV || "development";

const { default: app } = await import("../app.js");
const { connectDatabases, disconnectDatabases } = await import("../db/index.js");
const mongoose = (await import("mongoose")).default;

const PORT = Number(process.env.PORT || 8098);
const BASE = `http://localhost:${PORT}/api/v1`;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const server = app.listen(PORT);
await connectDatabases();

// Deterministic demo database: clear data, keep indexes.
const collections = await mongoose.connection.db.collections();
for (const c of collections) await c.deleteMany({});

try {
  // ── Register (cookies carry auth) ──
  const reg = await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "demo@factory.com",
      username: "demo",
      password: "Password123!",
    }),
  });
  const cookie = reg.headers.get("set-cookie").split(";")[0];
  const auth = { Cookie: cookie, "Content-Type": "application/json" };

  // ── Site + Pump machine ──
  const site = (await (await fetch(`${BASE}/sites`, {
    method: "POST", headers: auth,
    body: JSON.stringify({ name: "Demo Plant", timezone: "UTC" }),
  })).json()).data;

  const machine = (await (await fetch(`${BASE}/machines/sites/${site.siteId}/machines`, {
    method: "POST", headers: auth,
    body: JSON.stringify({
      assetId: "PUMP-42", name: "Demo Feedwater Pump", machineType: "Centrifugal Pump",
    }),
  })).json()).data;

  // ── API key for gateway-style ingestion ──
  const { secret } = (await (await fetch(`${BASE}/settings/api-key`, {
    method: "POST", headers: auth,
  })).json()).data;

  const addSensor = async (type) => (await (await fetch(
    `${BASE}/sensors/machines/${machine.machineId}/sensors`,
    { method: "POST", headers: auth, body: JSON.stringify({ name: `${type} sensor`, type }) }
  )).json()).data;

  const sendReading = (sensor, channel, value) => fetch(`${BASE}/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `demo-${Math.random().toString(36).slice(2)}`,
    },
    body: JSON.stringify({
      siteId: site.siteId,
      machineId: machine.machineId,
      sensorId: sensor.sensorId,
      type: "sensor_reading",
      timestamp: new Date().toISOString(),
      values: { [channel]: value },
    }),
  });

  const printCoverage = async (label) => {
    const res = await fetch(`${BASE}/machines/${machine.machineId}/coverage`, { headers: { Cookie: cookie } });
    const body = await res.json();
    console.log(`\n=== ${label} — GET /api/v1/machines/${machine.machineId}/coverage → ${res.status}`);
    console.log(JSON.stringify(body.data, null, 2));
    return body.data;
  };

  // ── PARTIAL: temperature + vibration attached and reporting ──
  const temperature = await addSensor("temperature");
  const vibration = await addSensor("vibration");
  await sendReading(temperature, "temperature", 61.5);
  await sendReading(vibration, "vibration", 2.2);
  await wait(400);
  const partial = await printCoverage("PARTIAL COVERAGE (2 of 5 required channels)");

  // ── FULL: add pressure, current, rpm and report on them ──
  const pressure = await addSensor("pressure");
  const current = await addSensor("current");
  const rpm = await addSensor("rpm");
  await sendReading(pressure, "pressure", 3.4);
  await sendReading(current, "current", 12.1);
  await sendReading(rpm, "rpm", 1480);
  await wait(400);
  const full = await printCoverage("FULL COVERAGE (all required channels reporting)");

  console.log("\n=== Summary");
  console.log(`partial → isReady=${partial.isReady} gateState=${partial.gateState} covered=[${partial.covered}] missing=[${partial.missing}] sensors=${partial.sensorsWorking}/${partial.sensorsTotal}`);
  console.log(`full    → isReady=${full.isReady} gateState=${full.gateState} covered=[${full.covered}] missing=[${full.missing}] sensors=${full.sensorsWorking}/${full.sensorsTotal}`);
} finally {
  server.close();
  await disconnectDatabases().catch(() => {});
  process.exit(0);
}
