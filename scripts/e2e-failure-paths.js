#!/usr/bin/env bun
/**
 * Wave 4 — Step 2: failure-path checks over real HTTP.
 *
 * Phase A — API server with the ML service DOWN (nothing listens on the ML
 * port; equivalent to `docker stop sentinel-ml-service` from the server's
 * point of view):
 *   A1. full-coverage machine: events still stored, no crash, machine
 *       UNKNOWN with a reason, no prediction fabricated.
 *   A2. coverage-incomplete machine (missing channels): event stored and
 *       tagged SKIPPED_INSUFFICIENT_COVERAGE, reason "Missing sensor
 *       channels", no prediction — the gate closed before any ML call.
 *
 * Phase B — API server with the ML service UP but the LLM unconfigured:
 *   B1. full pipeline to an incident → explanation exists with
 *       source "fallback" (deterministic, provider-less).
 *   B2. the same event posted twice (same Idempotency-Key) → 201 then 200
 *       "Event already processed", one stored event.
 *
 * Orchestration mirrors scripts/e2e-smoke.js: by default this script starts
 * its own API server(s) and the ml-service. E2E_BASE_URL attaches to an
 * existing server instead (Phase A expects that server to have a dead ML).
 */

const PORT = Number(process.env.E2E_PORT || 8011);
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}/api/v1`;
const ML_URL = process.env.E2E_ML_URL || "http://localhost:9000";
const SPAWN_STACK = !process.env.E2E_BASE_URL;

const MONGO_URL =
  process.env.E2E_MONGO_URL ||
  "mongodb://sentinel:sentinel-test@localhost:28017/sentinel_e2e?authSource=admin";
const REDIS_URL = process.env.E2E_REDIS_URL || "redis://localhost:26379/4";

const RUN = `fail_${Date.now().toString(36)}`;
let currentStep = "bootstrap";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const waitUntil = async (describe, fn, timeoutMs, intervalMs = 1000) => {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = await fn();
    if (last && last.ok) return last;
    await wait(intervalMs);
  }
  const err = new Error(`${describe}: timed out after ${timeoutMs}ms`);
  err.actual = last ? JSON.stringify(last.value).slice(0, 400) : "(no state)";
  throw err;
};

const assert = (name, expected, actual, predicate) => {
  const pass = predicate ? predicate(actual) : Object.is(actual, expected);
  if (!pass) {
    const err = new Error(
      `[FAIL] ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
    err.step = currentStep;
    throw err;
  }
  console.log(`  ✓ ${name}`);
};

const api = async (method, path, { cookie, key, body, headers = {} } = {}) => {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }
  // getSetCookie() keeps every Set-Cookie header separately (Bun/undici safe).
  const setCookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : res.headers.get("set-cookie")
        ? [res.headers.get("set-cookie")]
        : [];
  // Send only name=value pairs; cookie attributes must not leak into requests.
  const cookieHeader = setCookies
    .map((c) => c.split(";")[0].trim())
    .join("; ");
  return { status: res.status, json, setCookie: cookieHeader || null, rawHeaders: setCookies };
};

const waitForHttp = async (url, timeoutMs, what) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await wait(500);
  }
  throw new Error(`${what} did not become reachable at ${url} within ${timeoutMs}ms`);
};

/* ── Synthetic data (same baselines as the smoke script) ─────────── */

const healthyValues = (i) => ({
  temperature: +(70.5 + Math.sin(i / 6) * 1.5).toFixed(3),
  vibration: +(2.3 + Math.sin(i / 4) * 0.15).toFixed(3),
  current: +(13.8 + Math.sin(i / 5) * 0.5).toFixed(3),
  rpm: Math.round(1487 + Math.sin(i / 7) * 6),
});

const faultValues = (i, n) => ({
  ...healthyValues(i),
  vibration: +(2.3 + (i / (n - 1)) * 9.5).toFixed(3),
});

/* ── Shared scenario helpers ─────────────────────────────────────── */

const makeUserAndKey = async () => {
  const reg = await api("POST", "/auth/register", {
    body: {
      email: `${RUN}-${Math.random().toString(36).slice(2, 8)}@smoke.test`,
      username: `fail_${RUN}_${Math.random().toString(36).slice(2, 8)}`,
      password: "Password123!",
    },
  });
  if (reg.status !== 201) {
    const err = new Error(`register failed: ${reg.status}`);
    err.step = currentStep;
    err.actual = JSON.stringify(reg.json).slice(0, 300);
    throw err;
  }
  const cookie = reg.setCookie;
  if (!cookie) {
    const err = new Error("register returned no Set-Cookie");
    err.step = currentStep;
    err.actual = `status=${reg.status} headers=${JSON.stringify([...reg.rawHeaders])} body=${JSON.stringify(reg.json).slice(0, 200)}`;
    throw err;
  }
  const keyRes = await api("POST", "/settings/api-key", { cookie });
  if (keyRes.status !== 201 || !keyRes.json?.data?.secret) {
    const err = new Error(`api-key creation failed: ${keyRes.status}`);
    err.step = currentStep;
    err.actual = JSON.stringify(keyRes.json).slice(0, 300);
    throw err;
  }
  return { cookie, key: keyRes.json.data.secret };
};

const makeMachineWithSensors = async ({ cookie }, types) => {
  const site = (
    await api("POST", "/sites", { cookie, body: { name: `Fail Plant ${RUN}`, timezone: "UTC" } })
  ).json.data;
  const machine = (
    await api("POST", `/machines/sites/${site.siteId}/machines`, {
      cookie,
      body: { assetId: `FAIL-${Math.random().toString(36).slice(2, 8)}`, name: "Fail Motor", machineType: "Motor" },
    })
  ).json.data;
  const sensors = {};
  for (const type of types) {
    sensors[type] = (
      await api("POST", `/sensors/machines/${machine.machineId}/sensors`, {
        cookie,
        body: { name: `${type} sensor`, type },
      })
    ).json.data;
  }
  return { site, machine, sensors };
};

const postCycle = async (env, values, timestamp, idemSuffix = "") => {
  let idx = 0;
  for (const [channel, value] of Object.entries(values)) {
    const ts = new Date(Date.parse(timestamp) + idx * 400).toISOString();
    idx += 1;
    const res = await api("POST", "/events", {
      key: env.key,
      body: {
        siteId: env.site.siteId,
        machineId: env.machine.machineId,
        sensorId: env.sensors[channel].sensorId,
        type: "sensor_reading",
        timestamp: ts,
        values: { [channel]: value },
      },
      headers: { "Idempotency-Key": `${RUN}-${idemSuffix}-${channel}-${ts}` },
    });
    if (res.status !== 201 && res.status !== 200) {
      const err = new Error(`POST /events ${channel} → ${res.status}`);
      err.step = currentStep;
      err.actual = JSON.stringify(res.json).slice(0, 300);
      throw err;
    }
  }
};

const getMachine = async (env) =>
  (await api("GET", `/machines/${env.machine.machineId}`, { cookie: env.cookie })).json?.data;

const eventCountFor = async (env) => {
  const res = await api(
    "GET",
    `/events?machineId=${env.machine.machineId}&limit=500`,
    { cookie: env.cookie }
  );
  return (res.json?.data || []).length;
};

/* ── Stack orchestration ─────────────────────────────────────────── */

let procs = [];

const spawnServer = async (extraEnv) => {
  const fs = await import("node:fs");
  const proc = Bun.spawn({
    cmd: ["bun", "src/index.js"],
    cwd: "server",      env: {
        ...process.env,
        PORT: String(PORT),
      NODE_ENV: "test", // disables global rate limiters for this volume of requests
      MONGODB_URL: MONGO_URL,
      REDIS_URL,
      PREDICTION_QUEUE_NAME: `prediction-${RUN}`,
      ARGUS_EXPLAIN_QUEUE_NAME: `argus-explain-${RUN}`,
      ML_SERVICE_URL: ML_URL,
        ML_TIMEOUT_MS: "15000", // dead-ML: 3 attempts x 15s > the assertion window
        LLM_PROVIDER: "",
        MOCK_AI: "false",
        ANTHROPIC_API_KEY: "",
        OPENROUTER_API_KEY: "",
        MISTRAL_API_KEY: "",
        OPENAI_BASE_URL: "http://localhost:9198/v1", // deterministic dead LLM
        USE_LOCAL_LLM: "",
        ...extraEnv,
      },
    stdout: fs.openSync("/tmp/e2e-fail-server.log", "a"),
    stderr: fs.openSync("/tmp/e2e-fail-server.log", "a"),
  });
  procs.push(proc);
  await waitForHttp(`${BASE_URL}/health`, 60000, "api server");
  return proc;
};

const ensureMlUp = async () => {
  try {
    const res = await fetch(`${ML_URL}/health`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) return;
  } catch {
    /* fall through and start it */
  }
  const fs = await import("node:fs");
  if (!fs.existsSync("/tmp/ml_daemon.py")) {
    fs.writeFileSync(
      "/tmp/ml_daemon.py",
      "import os, sys\npid = os.fork()\nif pid == 0:\n    os.setsid()\n    pid2 = os.fork()\n    if pid2 == 0:\n        os.execvp(sys.argv[1], sys.argv[1:])\n    os._exit(0)\nos.waitpid(pid, 0)\n"
    );
  }
  const proc = Bun.spawn({
    cmd: ["python3", "/tmp/ml_daemon.py", ".venv/bin/python", "-m", "app"],
    cwd: "ml-service",
    env: { ...process.env, ML_PORT: "9000" },
    stdout: fs.openSync("/tmp/e2e-fail-ml.log", "w"),
    stderr: fs.openSync("/tmp/e2e-fail-ml.log", "a"),
  });
  procs.push(proc);
  await waitForHttp(`${ML_URL}/health`, 60000, "ml-service");
};

const stopStack = () => {
  for (const proc of procs.reverse()) {
    try {
      proc?.kill();
    } catch {
      /* already gone */
    }
  }
};

process.on("exit", stopStack);
process.on("SIGINT", () => process.exit(130));

/* ── Scenario ────────────────────────────────────────────────────── */

const run = async () => {
  console.log(`[e2e-failure] base=${BASE_URL} ml=${ML_URL} run=${RUN}`);

  /* ── Phase A: ML down ── */
  currentStep = "phase-A-start-server-with-dead-ml";
  const deadMlUrl = "http://localhost:9199"; // nothing listens here
  if (SPAWN_STACK) {
    // Temporarily point the spawn env at the dead ML port.
    const realMl = ML_URL;
    // spawnServer reads ML_URL via closure; patch by spawning with override.
    procs.push(
      await (async () => {
        const fs = await import("node:fs");
        const proc = Bun.spawn({
          cmd: ["bun", "src/index.js"],
          cwd: "server",
          env: {
            ...process.env,
            PORT: String(PORT),
            NODE_ENV: "test",
            MONGODB_URL: MONGO_URL,
            REDIS_URL,
            PREDICTION_QUEUE_NAME: `prediction-${RUN}`,
            ARGUS_EXPLAIN_QUEUE_NAME: `argus-explain-${RUN}`,
            ML_SERVICE_URL: deadMlUrl,
            ML_TIMEOUT_MS: "15000",
            LLM_PROVIDER: "",
            MOCK_AI: "false",
          },
          stdout: fs.openSync("/tmp/e2e-fail-server.log", "a"),
          stderr: fs.openSync("/tmp/e2e-fail-server.log", "a"),
        });
        await waitForHttp(`${BASE_URL}/health`, 60000, "api server (phase A)");
        return proc;
      })()
    );
  } else {
    console.log("[e2e-failure] E2E_BASE_URL set — assuming the target server has ML DOWN (phase A)");
  }

  /* A1. full-coverage machine, ML unreachable */
  currentStep = "A1-ml-down-full-coverage";
  console.log("Phase A1: ML unreachable, full-coverage machine");
  const { cookie: cookieA1, key: keyA1 } = await makeUserAndKey();
  const shapedA1 = await makeMachineWithSensors({ cookie: cookieA1 }, [
    "temperature",
    "vibration",
    "current",
    "rpm",
  ]);
  const envA1 = { cookie: cookieA1, key: keyA1, ...shapedA1 };

  const beforeA1 = await eventCountFor(envA1);
  for (let i = 0; i < 3; i += 1) {
    await postCycle(envA1, healthyValues(i), new Date(Date.now() - (3 - i) * 10000).toISOString(), "a1");
  }
  const afterA1 = await eventCountFor(envA1);
  assert("events still stored with ML down", 12, afterA1 - beforeA1);

  const unknownA1 = await waitUntil(
    "machine goes UNKNOWN with a reason",
    async () => {
      const m = await getMachine(envA1);
      return m?.status === "unknown" && m?.healthUnknownReason
        ? { ok: true, value: m }
        : { ok: false, value: { status: m?.status, reason: m?.healthUnknownReason } };
    },
    60000
  );
  console.log(`  reason="${unknownA1.value.healthUnknownReason}"`);

  const latestA1 = await api("GET", `/predictions/machines/${envA1.machine.machineId}/latest`, {
    cookie: envA1.cookie,
  });
  assert("no prediction fabricated (latest → 404)", 404, latestA1.status);

  const healthA1 = await api("GET", "/health");
  assert("server did not crash", 200, healthA1.status);

  /* A2. coverage-incomplete machine */
  currentStep = "A2-coverage-incomplete";
  console.log("Phase A2: coverage-incomplete machine (vibration only)");
  const { cookie: cookieA2, key: keyA2 } = await makeUserAndKey();
  const shapedA2 = await makeMachineWithSensors({ cookie: cookieA2 }, ["vibration"]);
  const envA2 = { cookie: cookieA2, key: keyA2, ...shapedA2 };

  const beforeA2 = await eventCountFor(envA2);
  await postCycle(envA2, { vibration: 2.4 }, new Date().toISOString(), "a2");
  const afterA2 = await eventCountFor(envA2);
  assert("event stored on gated machine", 1, afterA2 - beforeA2);

  // The coverage gate returns BEFORE the window builder/ML path (see
  // prediction.service.js checkCoverageGate), so healthUnknownReason stays
  // null; the API reason for a gated machine lives in the coverage endpoint
  // and the event's SKIPPED_INSUFFICIENT_COVERAGE tag.
  const tagged = await waitUntil(
    "event tagged SKIPPED_INSUFFICIENT_COVERAGE by the worker",
    async () => {
      const events =
        (await api("GET", `/events?machineId=${envA2.machine.machineId}&limit=10`, {
          cookie: envA2.cookie,
        })).json?.data || [];
      const ev = events[0];
      return ev && (ev.tags || []).includes("SKIPPED_INSUFFICIENT_COVERAGE")
        ? { ok: true, value: ev }
        : { ok: false, value: ev?.tags || [] };
    },
    60000
  );
  console.log(`  event tags=${JSON.stringify(tagged.value.tags)}`);

  const coverage = (
    await api("GET", `/machines/${envA2.machine.machineId}/coverage`, { cookie: envA2.cookie })
  ).json?.data;
  assert("coverage gate is GATE_CLOSED", "GATE_CLOSED", coverage?.gateState);
  assert("coverage not ready", false, coverage?.isReady);
  assert(
    "missing channels reflect the uncovered sensors",
    true,
    ["temperature", "current", "rpm"].every((c) => (coverage?.missing || []).includes(c))
  );
  console.log(`  coverage reason: gateState=${coverage.gateState} missing=${JSON.stringify(coverage.missing)}`);

  const latestA2 = await api("GET", `/predictions/machines/${envA2.machine.machineId}/latest`, {
    cookie: envA2.cookie,
  });
  assert("no ML call possible → no prediction", 404, latestA2.status);

  if (SPAWN_STACK) {
    currentStep = "phase-transition";
    for (const proc of procs) proc.kill();
    procs = [];
    await wait(2000);
  }

  /* ── Phase B: ML up, LLM unconfigured ── */
  currentStep = "phase-B-start-server-with-ml-up";
  console.log("Phase B: ML up, LLM unconfigured → fallback explanations");
  if (SPAWN_STACK) {
    await ensureMlUp();
    await spawnServer({});
  } else {
    console.log("[e2e-failure] E2E_BASE_URL set — assuming the target server has ML UP (phase B)");
    await waitForHttp(`${ML_URL}/health`, 30000, "ml-service (external)");
  }

  /* B1. pipeline → incident → fallback explanation */
  currentStep = "B1-llm-down-fallback-explanation";
  const { cookie: cookieB1, key: keyB1 } = await makeUserAndKey();
  const shapedB1 = await makeMachineWithSensors(
    { cookie: cookieB1 },
    ["temperature", "vibration", "current", "rpm"]
  );
  const envB1 = { cookie: cookieB1, key: keyB1, ...shapedB1 };

  for (let i = 0; i < 40; i += 1) {
    await postCycle(envB1, healthyValues(i), new Date(Date.now() - (45 - i) * 10000).toISOString(), "b1h");
  }
  // Realtime fault ramp (see e2e-smoke.js): backdated fault events would be
  // skipped by the duplicate-window collapse.
  const n = 30;
  for (let i = 0; i < n; i += 1) {
    await postCycle(envB1, faultValues(i, n), new Date().toISOString(), "b1f");
    await wait(700);
  }

  const incidentB1 = await waitUntil(
    "open incident appears",
    async () => {
      const list =
        (await api("GET", `/incidents?machineId=${envB1.machine.machineId}&status=open`, {
          cookie: cookieB1,
        })).json?.data || [];
      return list.length >= 1 ? { ok: true, value: list[0] } : { ok: false, value: list.length };
    },
    90000
  );
  assert("incident id present", true, Boolean(incidentB1.value?.incidentId));
  const allB1 =
    (await api("GET", `/incidents?machineId=${envB1.machine.machineId}`, { cookie: cookieB1 })).json
      ?.data || [];
  assert("one incident total (no duplicates)", 1, allB1.length);

  const explainedB1 = await waitUntil(
    "incident gains an explanation despite no LLM",
    async () => {
      const list =
        (await api("GET", `/incidents?machineId=${envB1.machine.machineId}&status=open`, {
          cookie: cookieB1,
        })).json?.data || [];
      const exp = list[0]?.explanation;
      return exp && exp.status === "ready" ? { ok: true, value: exp } : { ok: false, value: exp };
    },
    45000
  );
  assert(
    'explanation source is "fallback"',
    "fallback",
    explainedB1.value.source
  );
  console.log(
    `  fallback explanation: urgency=${explainedB1.value.urgency} summary="${String(explainedB1.value.summary).slice(0, 80)}…"`
  );

  /* B2. duplicate event (same Idempotency-Key) */
  currentStep = "B2-duplicate-event";
  const { cookie: cookieB2, key: keyB2 } = await makeUserAndKey();
  const shapedB2 = await makeMachineWithSensors({ cookie: cookieB2 }, ["vibration"]);
  const envB2 = { cookie: cookieB2, key: keyB2, ...shapedB2 };

  const dupBody = {
    siteId: envB2.site.siteId,
    machineId: envB2.machine.machineId,
    sensorId: envB2.sensors.vibration.sensorId,
    type: "sensor_reading",
    timestamp: new Date().toISOString(),
    values: { vibration: 2.5 },
  };
  const first = await api("POST", "/events", {
    key: keyB2,
    body: dupBody,
    headers: { "Idempotency-Key": `${RUN}-dup-key` },
  });
  const second = await api("POST", "/events", {
    key: keyB2,
    body: dupBody,
    headers: { "Idempotency-Key": `${RUN}-dup-key` },
  });
  assert("first POST returns 201", 201, first.status);
  assert("duplicate POST returns 200", 200, second.status);
  assert(
    'duplicate message is "Event already processed"',
    "Event already processed",
    second.json?.message
  );
  assert(
    "same event id returned for both",
    first.json?.data?.eventId,
    second.json?.data?.eventId
  );
  let countB2 = await eventCountFor(envB2);
  assert("only ONE event stored for the keyed pair", 1, countB2);

  // Payload-hash dedup (no Idempotency-Key): the service hashes the payload
  // itself. The identity is the key — a keyed event lives under the header
  // key, so the hash path must be tested keyless-vs-keyless with a fresh
  // payload.
  const hashBody = { ...dupBody, timestamp: new Date().toISOString() };
  const hashFirst = await api("POST", "/events", { key: keyB2, body: hashBody });
  const hashSecond = await api("POST", "/events", { key: keyB2, body: { ...hashBody } });
  assert("keyless POST returns 201", 201, hashFirst.status);
  assert("identical keyless POST returns 200", 200, hashSecond.status);
  assert(
    "keyless duplicate carries the dedup message",
    "Event already processed",
    hashSecond.json?.message
  );
  assert(
    "keyless duplicate returns the same event id",
    hashFirst.json?.data?.eventId,
    hashSecond.json?.data?.eventId
  );
  countB2 = await eventCountFor(envB2);
  assert("exactly two events stored (one keyed + one hashed)", 2, countB2);

  console.log(`\n[e2e-failure] PASS — all failure-path checks green (run ${RUN})`);
};

try {
  await run();
  process.exit(0);
} catch (err) {
  console.error(`\n[e2e-failure] FAILURE at step "${err.step || currentStep}"`);
  console.error(err.actual ? `${err.message} | last state: ${err.actual}` : err.message);
  process.exit(1);
}
