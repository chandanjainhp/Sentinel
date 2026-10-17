import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "bun:test";
import http from "http";
import mongoose from "mongoose";
import { connectDatabases, disconnectDatabases } from "../db/index.js";
import { Incident } from "../models/incident.model.js";
import { Prediction } from "../models/prediction.model.js";
import { Site } from "../models/site.model.js";
import { Machine } from "../models/machine.model.js";
import { User } from "../models/user.models.js";
import { resetAIClient, getModelName } from "../utils/anthropic.js";
import { getMlServiceUrl, ML_TIMEOUT_MS } from "../services/ml-contract.service.js";

/**
 * Sarvam provider end-to-end against a LOCAL STUB HTTP server (like the ML
 * stubs in pipeline-ml/coverage-gating suites bind 9111–9126). The real API
 * is never contacted.
 *
 * Covers the full Argus path with LLM_PROVIDER=sarvam:
 *   - a valid response → explanation.source === "llm"
 *   - fenced / garbage JSON  → fallback
 *   - an invalid urgency     → fallback
 *   - HTTP 401 / 429 / 500   → fallback
 *   - a hanging connection (timeout via ML_TIMEOUT_MS AbortController-style
 *     bound, exercised through the service's withTimeout) → fallback
 *   - an empty SARVAM_API_KEY → client init throws, fallback
 *
 * bun test runs all files in one process, so every env mutation here is
 * saved and restored around each test.
 */

const SARVAM_PORT = 9131; // outside the 9111–9126 range other suites use
const BASE = `http://localhost:${SARVAM_PORT}`;

const MANAGED_KEYS = [
  "MOCK_AI",
  "LLM_PROVIDER",
  "USE_LOCAL_LLM",
  "NODE_ENV",
  "OPENAI_BASE_URL",
  "OPENROUTER_API_KEY",
  "ANTHROPIC_API_KEY",
  "MISTRAL_API_KEY",
  "SARVAM_API_KEY",
  "SARVAM_MODEL",
  "SARVAM_BASE_URL",
];

let savedNodeEnv;
let savedEnv = new Map();
let stubServer;
let stubHandler; // (req, res, body) assigned per test
const capturedRequests = [];

const listenStub = () =>
  new Promise((resolve) => {
    stubServer = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        capturedRequests.push({
          url: req.url,
          method: req.method,
          headers: req.headers,
          body: raw ? JSON.parse(raw) : null,
        });
        stubHandler(req, res, raw);
      });
    });
    stubServer.listen(SARVAM_PORT, "127.0.0.1", resolve);
  });

const okResponse = (content) => ({
  id: "20261009_stub",
  object: "chat.completion",
  created: Math.floor(Date.now() / 1000),
  model: "sarvam-105b-conversations",
  choices: [
    { index: 0, finish_reason: "stop", message: { role: "assistant", content } },
  ],
  usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
});

const VALID_JSON = JSON.stringify({
  summary: "Vibration on Compressor Line 2 is trending upward fast.",
  likelyCause: "Discharge valve or bearing wear is suspected.",
  recommendedAction: "Inspect the vibration probe mounting and bearing within this shift.",
  urgency: "soon",
});

let seeded = {};

beforeAll(async () => {
  savedNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = ""; // getAIProvider() would force 'local' under "test"

  await listenStub();

  await connectDatabases();
  await mongoose.connection.dropDatabase();

  const user = await User.create({
    email: "sarvam@factory.com",
    username: "sarvam_tester",
    password: "Password123!",
    isVerified: true,
  });
  const site = await Site.create({ userId: user._id, name: "Sarvam Plant", timezone: "UTC" });
  const machine = await Machine.create({
    userId: user._id,
    siteId: site._id,
    assetId: "SARV-COMP-1",
    name: "Compressor Line 2",
    machineType: "Compressor",
    status: "critical",
  });
  const prediction = await Prediction.create({
    userId: user._id,
    siteId: site._id,
    machineId: machine._id,
    model: "lstm_autoencoder",
    modelVersion: "0.1.0+synthetic.test",
    timestamp: new Date(),
    rulValue: null,
    rulUnit: null,
    anomalyScore: 0.93,
    faultProbability: 0.66,
    faultType: "vibration_anomaly",
    confidence: 1.0,
    evidence: { windowSize: 60, suspectChannel: "vibration", methods: { rul: "not_available" } },
  });
  const incident = await Incident.create({
    userId: user._id,
    siteId: site._id,
    machineId: machine._id,
    predictionId: prediction._id,
    type: "fault_risk",
    severity: "critical",
    title: "CRITICAL: Compressor Line 2 (SARV-COMP-1) - vibration_anomaly",
    reason: "Machine reached critical state.",
    status: "open",
  });
  seeded = { user, site, machine, prediction, incident };
});

afterAll(async () => {
  _setLLMDriverForTests(null);
  if (stubServer) stubServer.close();
  for (const [key, value] of savedEnv) process.env[key] = value;
  for (const key of MANAGED_KEYS) delete process.env[key];
  if (savedNodeEnv !== undefined) process.env.NODE_ENV = savedNodeEnv;
  await disconnectDatabases();
});

const service = await import("../services/argus-explain.service.js");
const { explainIncident, _setLLMDriverForTests } = service;

/** Point Argus at the stub and run one explainIncident with sarvam selected. */
const runWithSarvam = async () => {
  process.env.LLM_PROVIDER = "sarvam";
  process.env.SARVAM_API_KEY = process.env.SARVAM_API_KEY ?? "sk_test_dummy";
  process.env.SARVAM_BASE_URL = BASE;
  process.env.SARVAM_MODEL = "sarvam-105b-conversations";
  resetAIClient();
  _setLLMDriverForTests(null); // real driver → anthropic.js → stub server

  const result = await explainIncident({ incidentId: seeded.incident.incidentId });
  const doc = (await Incident.findById(seeded.incident._id)).toObject();
  return { result, doc };
};

beforeEach(() => {
  savedEnv = new Map(
    MANAGED_KEYS.filter((k) => k in process.env).map((k) => [k, process.env[k]])
  );
  for (const k of MANAGED_KEYS) delete process.env[k];
  capturedRequests.length = 0;
  resetAIClient();
});

afterEach(() => {
  _setLLMDriverForTests(null);
  resetAIClient();
  for (const [key, value] of savedEnv) process.env[key] = value;
});

describe("sarvam provider end-to-end (stub server)", () => {
  it("a valid reply is stored with source llm and the request hits /v1/chat/completions", async () => {
    stubHandler = (req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(okResponse(VALID_JSON)));
    };

    const { result, doc } = await runWithSarvam();

    expect(result.source).toBe("llm");
    expect(doc.explanation.source).toBe("llm");
    expect(doc.explanation.provider).toBe("sarvam");
    expect(doc.explanation.model).toBe("sarvam-105b-conversations");
    expect(doc.explanation.urgency).toBe("soon");
    expect(doc.explanation.summary).toContain("trending upward");

    const req = capturedRequests[0];
    expect(req.url).toBe("/v1/chat/completions");
    expect(req.headers["api-subscription-key"]).toBe("sk_test_dummy");
    expect(req.headers.authorization).toBe("Bearer sk_test_dummy");
    expect(req.body.model).toBe("sarvam-105b-conversations");
    expect(req.body.response_format).toEqual({ type: "json_object" });
    expect(req.body.max_tokens).toBeGreaterThan(0);
    // Key must never appear in a log level field we control — smoke-checked
    // body only carries prompt content, never the key.
    expect(req.body.messages[0].content).not.toContain("sk_test_dummy");
    expect(getModelName()).toBe("sarvam-105b-conversations");
  });

  it("markdown-fenced JSON still parses and stores as llm", async () => {
    stubHandler = (req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(okResponse("```json\n" + VALID_JSON + "\n```")));
    };

    const { result, doc } = await runWithSarvam();
    expect(result.source).toBe("llm");
    expect(doc.explanation.source).toBe("llm");
  });

  it("reasoning prose around the JSON is stripped and the JSON is stored", async () => {
    stubHandler = (req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify(
          okResponse("Let me think. The vibration channel is escalating.\n" + VALID_JSON)
        )
      );
    };

    const { result, doc } = await runWithSarvam();
    expect(result.source).toBe("llm");
    expect(doc.explanation.urgency).toBe("soon");
  });

  it("garbage JSON falls back deterministically", async () => {
    stubHandler = (req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(okResponse("not json at all {{")));
    };

    const { result, doc } = await runWithSarvam();
    expect(result.source).toBe("fallback");
    expect(doc.explanation.source).toBe("fallback");
    expect(doc.explanation.summary).toContain("0.93");
    expect(doc.explanation.urgency).toBe("now"); // critical → now
    expect(doc.explanation.error).toContain("LLM unavailable after retry");
  });

  it("an invalid urgency value falls back (Zod rejects)", async () => {
    stubHandler = (req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify(
          okResponse(
            JSON.stringify({
              summary: "Vibration is rising.",
              likelyCause: "Bearing wear.",
              recommendedAction: "Inspect now.",
              urgency: "immediately",
            })
          )
        )
      );
    };

    const { result, doc } = await runWithSarvam();
    expect(result.source).toBe("fallback");
    expect(doc.explanation.source).toBe("fallback");
  });

  it("HTTP 401 falls back", async () => {
    stubHandler = (req, res) => {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Unauthorized", code: "authentication_error" } }));
    };
    const { result, doc } = await runWithSarvam();
    expect(result.source).toBe("fallback");
    expect(doc.explanation.source).toBe("fallback");
  });

  it("HTTP 429 (rate_limit_exceeded_error) falls back", async () => {
    stubHandler = (req, res) => {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ error: { message: "Quota Exceeded", code: "rate_limit_exceeded_error" } })
      );
    };
    const { result, doc } = await runWithSarvam();
    expect(result.source).toBe("fallback");
    expect(doc.explanation.error).toContain("429");
  });

  it("HTTP 500 (internal_server_error) falls back", async () => {
    stubHandler = (req, res) => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "boom", code: "internal_server_error" } }));
    };
    const { result, doc } = await runWithSarvam();
    expect(result.source).toBe("fallback");
    expect(doc.explanation.source).toBe("fallback");
  });

  it("a hanging connection hits the ML_TIMEOUT_MS bound and falls back", async () => {
    // withTimeout (ML_TIMEOUT_MS) rejects; the fetch itself is left dangling
    // against the stub, which never answers.
    stubHandler = () => {}; // never respond
    const started = Date.now();
    const { result, doc } = await runWithSarvam();
    const elapsed = Date.now() - started;

    expect(result.source).toBe("fallback");
    expect(doc.explanation.source).toBe("fallback");
    expect(elapsed).toBeLessThan(ML_TIMEOUT_MS * 2 + 5000); // 2 retries + slack
    expect(elapsed).toBeGreaterThanOrEqual(Math.min(ML_TIMEOUT_MS, 1000));
  }, 20000);

  it("an empty SARVAM_API_KEY makes client init throw and still falls back", async () => {
    stubHandler = (req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(okResponse(VALID_JSON)));
    };
    process.env.LLM_PROVIDER = "sarvam";
    process.env.SARVAM_API_KEY = ""; // empty
    process.env.SARVAM_BASE_URL = BASE;
    resetAIClient();

    const result = await explainIncident({ incidentId: seeded.incident.incidentId });
    expect(result.source).toBe("fallback");
    // The stub must never be reached with an empty key.
    expect(capturedRequests.length).toBe(0);
    const doc = (await Incident.findById(seeded.incident._id)).toObject();
    expect(doc.explanation.source).toBe("fallback");
  });

  it("ML_SERVICE_URL is untouched by sarvam selection (proves no env coupling)", () => {
    process.env.LLM_PROVIDER = "sarvam";
    process.env.SARVAM_API_KEY = "sk_test_dummy";
    resetAIClient();
    expect(getMlServiceUrl()).toContain("localhost");
  });
});
