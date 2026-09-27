#!/usr/bin/env bun
/**
 * Wave 4 — Step 1: end-to-end smoke test for Sentinel.
 *
 * Runs the FULL pipeline over real HTTP:
 *   register → API key → site → machine → sensors (all required channels)
 *   → 40 healthy readings → prediction stored, sensors ONLINE, health HEALTHY
 *   → sustained vibration-fault ramp → health WARNING/CRITICAL
 *   → exactly ONE open incident → its Argus explanation is present.
 *
 * Orchestration: by default the script STARTS its own stack —
 *   - the real API server (bun server/src/index.js) on PORT (default 8010)
 *   - the real ml-service (ml-service/.venv/bin/python -m app) on ML_PORT 9000
 * with Mongo/Redis pointed at the local test containers (28017 / 26379).
 * Set E2E_BASE_URL to attach to an already-running server instead (local dev
 * or a remote deployment). Attach mode never probes an ml-service directly —
 * predictions flow server-side — unless E2E_ML_URL is also set (e.g. an
 * SSH-forwarded port), which re-enables the health probe.
 *
 * Exit 0 + summary on success; exit 1 + `[FAIL] <step>: expected X, got Y`
 * on the first failing assertion.
 */

const PORT = Number(process.env.E2E_PORT || 8010);
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}/api/v1`;
const ML_URL = process.env.E2E_ML_URL || "http://localhost:9000";
const SPAWN_STACK = !process.env.E2E_BASE_URL;

const MONGO_URL =
  process.env.E2E_MONGO_URL ||
  "mongodb://sentinel:sentinel-test@localhost:28017/sentinel_e2e?authSource=admin";
const REDIS_URL = process.env.E2E_REDIS_URL || "redis://localhost:26379/4";

const RUN = `e2e_${Date.now().toString(36)}`;
let failures = [];
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

/* ── HTTP helpers ────────────────────────────────────────────────── */

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
  return { status: res.status, json, setCookie: res.headers.get("set-cookie") };
};

/* ── Stack orchestration ─────────────────────────────────────────── */

let serverProc = null;
let mlProc = null;

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

const startStack = async () => {
  const fs = await import("node:fs");
  if (!fs.existsSync("/tmp/ml_daemon.py")) {
    // Tiny double-fork daemonizer so the spawned ml-service survives this
    // script's process group (same helper used by e2e-failure-paths.js).
    fs.writeFileSync(
      "/tmp/ml_daemon.py",
      "import os, sys\npid = os.fork()\nif pid == 0:\n    os.setsid()\n    pid2 = os.fork()\n    if pid2 == 0:\n        os.execvp(sys.argv[1], sys.argv[1:])\n    os._exit(0)\nos.waitpid(pid, 0)\n"
    );
  }
  mlProc = Bun.spawn({
    cmd: ["python3", "/tmp/ml_daemon.py", ".venv/bin/python", "-m", "app"],
    cwd: "ml-service",
    env: { ...process.env, ML_PORT: "9000" },
    stdout: fs.openSync("/tmp/e2e-ml.log", "w"),
    stderr: fs.openSync("/tmp/e2e-ml.log", "a"),
  });
  await waitForHttp(`${ML_URL}/health`, 60000, "ml-service");

  serverProc = Bun.spawn({
    cmd: ["bun", "src/index.js"],
    cwd: "server",
    env: {
      ...process.env,
      PORT: String(PORT),
      // NODE_ENV=test disables the global/IP rate limiters (they would 429 a
      // 200-request smoke run from one IP) — pipeline semantics are unchanged.
      NODE_ENV: "test",
      MONGODB_URL: MONGO_URL,
      REDIS_URL,
      // Fresh queues per run: no backlog from earlier runs sharing this Redis.
      PREDICTION_QUEUE_NAME: `prediction-${RUN}`,
      ARGUS_EXPLAIN_QUEUE_NAME: `argus-explain-${RUN}`,
      ML_SERVICE_URL: ML_URL,
      // Deterministic explanations: the LLM endpoint is a dead port, so the
      // Argus worker uses its deterministic fallback (the spec accepts either
      // source; fallback is the reproducible one).
      LLM_PROVIDER: "",
      MOCK_AI: "false",
      ANTHROPIC_API_KEY: "",
      OPENROUTER_API_KEY: "",
      MISTRAL_API_KEY: "",
      OPENAI_BASE_URL: "http://localhost:9198/v1",
      USE_LOCAL_LLM: "",
    },
    stdout: fs.openSync("/tmp/e2e-server.log", "w"),
    stderr: fs.openSync("/tmp/e2e-server.log", "a"),
  });
  await waitForHttp(`${BASE_URL}/health`, 60000, "api server");
};

const stopStack = () => {
  for (const proc of [serverProc, mlProc]) {
    try {
      proc?.kill();
    } catch {
      /* already gone */
    }
  }
};

process.on("exit", stopStack);
process.on("SIGINT", () => process.exit(130));

/* ── Synthetic data (healthy baseline per train/synthetic.py means) ── */

const healthyValues = (i) => ({
  temperature: +(70.5 + Math.sin(i / 6) * 1.5).toFixed(3),
  vibration: +(2.3 + Math.sin(i / 4) * 0.15).toFixed(3),
  current: +(13.8 + Math.sin(i / 5) * 0.5).toFixed(3),
  rpm: Math.round(1487 + Math.sin(i / 7) * 6),
});

/** Ramping vibration fault, sustained for the whole cycle count. */
const faultValues = (i, n) => ({
  ...healthyValues(i),
  vibration: +(2.3 + (i / (n - 1)) * 9.5).toFixed(3), // 2.3 → ~11.8
});

/* ── Scenario ────────────────────────────────────────────────────── */

const postCycle = async (env, values, timestamp) => {
  // Real sensors never report at the exact same instant — stagger channels
  // by 400 ms. The server fetches the newest 60 EVENTS as its window source;
  // identical timestamps would cover only 15 buckets (< seq_len 30 →
  // insufficient_data). Staggered, the events span distinct timestamps which
  // the age-based forward-fill merges into complete rows.
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
      headers: { "Idempotency-Key": `${RUN}-${channel}-${ts}` },
    });
    assert(
      `POST /events ${channel} accepted`,
      201,
      res.status,
      (s) => s === 201 || s === 200
    );
  }
};

const getMachine = async (env) =>
  (await api("GET", `/machines/${env.machine.machineId}`, { cookie: env.cookie })).json?.data;

const listOpenIncidents = async (env) =>
  (await api("GET", `/incidents?machineId=${env.machine.machineId}&status=open`, { cookie: env.cookie })).json?.data || [];

const run = async () => {
  console.log(`[e2e-smoke] base=${BASE_URL} ml=${ML_URL} run=${RUN}`);
  if (SPAWN_STACK) {
    currentStep = "start-stack";
    console.log("[e2e-smoke] starting own server + ml-service…");
    await startStack();
  } else if (process.env.E2E_ML_URL) {
    // Attach mode: probe the ml-service only when explicitly pointed at one
    // (e.g. SSH-forwarded). A remote deployment target usually has no
    // reachable ml-service from here — predictions are made server-side, so
    // the script never needs a direct ML connection.
    await waitForHttp(`${ML_URL}/health`, 30000, "ml-service (external)");
  }

  /* 1. Register → verify-less login session → API key */
  currentStep = "register-and-api-key";
  const email = `${RUN}@smoke.test`;
  const reg = await api("POST", "/auth/register", {
    body: { email, username: `smoke_${RUN}`, password: "Password123!" },
  });
  assert("register returns 201", 201, reg.status);
  const cookie = reg.setCookie;
  assert("register sets session cookie", true, Boolean(cookie));

  const keyRes = await api("POST", "/settings/api-key", { cookie });
  assert("create API key returns 201", 201, keyRes.status);
  const key = keyRes.json?.data?.secret;
  assert("API key secret returned", true, typeof key === "string" && key.length > 10, Boolean);

  /* 2. Site + machine + sensors covering every required ML channel */
  currentStep = "create-site-machine-sensors";
  const site = (
    await api("POST", "/sites", {
      cookie,
      body: { name: `Smoke Plant ${RUN}`, timezone: "UTC" },
    })
  ).json.data;

  const machine = (
    await api("POST", `/machines/sites/${site.siteId}/machines`, {
      cookie,
      body: { assetId: `SMK-${RUN}`, name: "Smoke Motor", machineType: "Motor" },
    })
  ).json.data;

  const sensors = {};
  for (const type of ["temperature", "vibration", "current", "rpm"]) {
    sensors[type] = (
      await api("POST", `/sensors/machines/${machine.machineId}/sensors`, {
        cookie,
        body: { name: `${type} sensor`, type },
      })
    ).json.data;
  }
  const env = { cookie, key, site, machine, sensors };
  console.log(`  machine=${machine.machineId} sensors=${Object.keys(sensors).length}`);

  /* 3. 40 healthy readings across all sensors, spaced realistically */
  currentStep = "post-40-healthy-cycles";
  const base = Date.now() - 40 * 10000;
  for (let i = 0; i < 40; i += 1) {
    await postCycle(env, healthyValues(i), new Date(base + i * 10000).toISOString());
  }
  console.log(`  posted 40 cycles × 4 channels`);

  /* 4. Prediction stored */
  currentStep = "prediction-stored";
  await waitUntil(
    "prediction appears for the machine",
    async () => {
      const res = await api("GET", `/predictions/machines/${machine.machineId}/latest`, { cookie });
      const p = res.json?.data;
      return p && p.anomalyScore !== null && p.anomalyScore !== undefined
        ? { ok: true, value: p }
        : { ok: false, value: p };
    },
    60000
  );

  /* 5. Sensors ONLINE, machine HEALTHY, no incident */
  currentStep = "healthy-state";
  const sensorList = (
    await api("GET", `/sensors/machines/${machine.machineId}/sensors`, { cookie })
  ).json.data;
  assert(
    "all sensors ONLINE",
    "ONLINE",
    sensorList.map((s) => s.status).join(","),
    (joined) => joined.split(",").every((s) => s === "ONLINE")
  );
  const healthyMachine = await waitUntil(
    "machine reaches HEALTHY",
    async () => {
      const m = await getMachine(env);
      return m?.status === "healthy" ? { ok: true, value: m } : { ok: false, value: m };
    },
    30000
  );
  assert("healthUnknownReason cleared", null, healthyMachine.value.healthUnknownReason ?? null);

  const incidentsHealthy = await listOpenIncidents(env);
  assert("no open incident while healthy", 0, incidentsHealthy.length);

  /* 6. Sustained vibration-fault ramp (fills a full window and holds).
   * Posted in REAL TIME: the pipeline's duplicate-window collapse ignores any
   * event older than the newest stored prediction (wall-clock), so backdated
   * fault events would never be re-scored — exactly like a real sensor whose
   * readings keep arriving now. */
  currentStep = "post-fault-ramp";
  const n = 30;
  for (let i = 0; i < n; i += 1) {
    await postCycle(env, faultValues(i, n), new Date().toISOString());
    await wait(700);
  }
  console.log(`  posted ${n} realtime fault cycles × 4 channels (vibration 2.3 → ~11.8)`);

  /* 7. WARNING or CRITICAL, exactly one open incident, explanation present */
  currentStep = "degraded-state";
  const degraded = await waitUntil(
    "machine reaches WARNING or CRITICAL",
    async () => {
      const m = await getMachine(env);
      return m && (m.status === "warning" || m.status === "critical")
        ? { ok: true, value: m }
        : { ok: false, value: m };
    },
    120000
  );
  console.log(`  machine status=${degraded.value.status} (reason=${degraded.value.healthUnknownReason ?? "n/a"})`);

  const latest = (
    await api("GET", `/predictions/machines/${machine.machineId}/latest`, { cookie })
  ).json.data;
  console.log(
    `  latest prediction: anomalyScore=${latest.anomalyScore} faultProbability=${latest.faultProbability} faultType=${latest.faultType}`
  );

  currentStep = "one-open-incident";
  const incident = await waitUntil(
    "open incident appears",
    async () => {
      const list = await listOpenIncidents(env);
      return list.length >= 1 ? { ok: true, value: list } : { ok: false, value: list.length };
    },
    30000
  );
  assert(
    "exactly ONE open incident",
    1,
    incident.value.length,
    (len) => len === 1
  );
  const one = incident.value[0];
  console.log(`  incident=${one.incidentId} severity=${one.severity} occurrenceCount=${one.occurrenceCount}`);

  currentStep = "incident-explanation";
  const explained = await waitUntil(
    "incident gains an Argus explanation",
    async () => {
      const list = await listOpenIncidents(env);
      const exp = list[0]?.explanation;
      return exp && exp.status === "ready" ? { ok: true, value: exp } : { ok: false, value: exp };
    },
    45000
  );
  assert(
    'explanation source is "llm" or "fallback"',
    "llm|fallback",
    explained.value.source,
    (s) => s === "llm" || s === "fallback"
  );
  console.log(
    `  explanation: source=${explained.value.source} urgency=${explained.value.urgency} summary="${String(explained.value.summary).slice(0, 90)}…"`
  );

  console.log(`\n[e2e-smoke] PASS — all steps green (run ${RUN})`);
};

try {
  await run();
  process.exit(0);
} catch (err) {
  console.error(`\n[e2e-smoke] FAILURE at step "${err.step || currentStep}"`);
  console.error(err.actual ? `${err.message} | last state: ${err.actual}` : err.message);
  process.exit(1);
}
