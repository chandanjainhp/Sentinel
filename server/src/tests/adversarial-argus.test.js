import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import mongoose from "mongoose";
import { connectDatabases, disconnectDatabases } from "../db/index.js";
import { Incident } from "../models/incident.model.js";
import { Prediction } from "../models/prediction.model.js";
import { Site } from "../models/site.model.js";
import { Machine } from "../models/machine.model.js";
import { User } from "../models/user.models.js";
import { explainIncident, _setLLMDriverForTests } from "../services/argus-explain.service.js";

/**
 * Adversarial Scope B.5 — Argus edge cases beyond argus-explain.test.js:
 * hangs past the timeout budget, schema-valid-but-garbage urgency values,
 * concurrent explanations of the same incident, and storage-shape stability.
 *
 * Service-level only; HTTP rate limiting is disabled in NODE_ENV=test
 * (see incident.routes.js), so rate-limit behavior is documented in
 * BUGS_FOUND.md rather than tested here.
 */

const env = {};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  await connectDatabases();
  await mongoose.connection.dropDatabase();

  env.user = await User.create({
    email: "advargus@factory.com",
    username: "advargus",
    password: "Password123!",
    isVerified: true,
  });
  env.site = await Site.create({ userId: env.user._id, name: "Argus Adv Plant", timezone: "UTC" });
  env.machine = await Machine.create({
    userId: env.user._id,
    siteId: env.site._id,
    assetId: "ADVARG-1",
    name: "Argus Adv Motor",
    machineType: "motor",
    status: "critical",
  });
  env.prediction = await Prediction.create({
    userId: env.user._id,
    siteId: env.site._id,
    machineId: env.machine._id,
    model: "lstm_autoencoder",
    modelVersion: "0.1.0+synthetic.test",
    timestamp: new Date(),
    rulValue: null,
    rulUnit: null,
    anomalyScore: 0.93,
    faultProbability: 0.88,
    faultType: "vibration_anomaly",
    confidence: 1.0,
    evidence: { windowSize: 60, suspectChannel: "vibration", methods: { rul: "not_available" } },
  });
  env.incident = await Incident.create({
    userId: env.user._id,
    siteId: env.site._id,
    machineId: env.machine._id,
    predictionId: env.prediction._id,
    type: "fault_risk",
    severity: "critical",
    title: "CRITICAL: Argus Adv Motor (ADVARG-1) - vibration_anomaly",
    reason: "Machine reached critical state.",
    evidence: { anomalyScore: 0.93 },
    status: "open",
  });
});

afterAll(async () => {
  _setLLMDriverForTests(null);
  await disconnectDatabases();
});

describe("adversarial argus — provider pathologies", () => {
  it.todo(
    "FOUND BUG — LLM call that never resolves hangs explainIncident: no timeout guard wraps llmDriver, and the argus worker runs concurrency:1, so one hung provider call stalls ALL future explanations. Tracked in BUGS_FOUND.md; test written once a guard exists (expect fallback, not hang)."
  );

  it("schema-valid JSON with implausible urgency ('banana') → Zod rejects → deterministic fallback", async () => {
    _setLLMDriverForTests(async () => ({
      text: JSON.stringify({
        summary: "Looks fine.",
        likelyCause: "Nothing wrong.",
        recommendedAction: "Do nothing.",
        urgency: "banana",
      }),
      provider: "mock",
      model: "mock-model",
    }));

    const result = await explainIncident({ incidentId: env.incident.incidentId });
    expect(result.source).toBe("fallback");

    const doc = (await Incident.findById(env.incident._id)).toObject();
    expect(doc.explanation.urgency).toBe("now"); // fallback derives from severity, never trusts the LLM
    expect(doc.explanation.error).toContain("LLM unavailable after retry");
  });

  it("LLM inventing a disallowed extra key (strict schema) → fallback", async () => {
    _setLLMDriverForTests(async () => ({
      text: JSON.stringify({
        summary: "s",
        likelyCause: "c",
        recommendedAction: "a",
        urgency: "soon",
        severityOverride: "harmless",
      }),
      provider: "mock",
      model: "mock-model",
    }));

    const result = await explainIncident({ incidentId: env.incident.incidentId });
    expect(result.source).toBe("fallback");
  });

  it("the real explain rate limiter (10 per 10min) actually returns 429 on the 11th call", async () => {
    // NODE_ENV=test bypasses the HTTP limiter, so exercise the real middleware
    // instance directly against the real Redis store (getLimiter is shared).
    const { getLimiter } = await import("../middlewares/rateLimit.middleware.js");
    const limiter = getLimiter("incidents-explain", 10 * 60 * 1000, 10, "incidents-explain-test");
    // One bucket: all 11 hits share a key — fixed within the test, but
    // unique per RUN so a previous run's 10-minute Redis bucket can't bleed in.
    const FIXED_IP = `10.77.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

    const runOnce = () =>
      new Promise((resolve) => {
        const req = { ip: FIXED_IP, method: "POST", url: "/explain", headers: {} };
        const res = {
          status(code) { this.statusCode = code; return this; },
          json(body) { resolve({ code: this.statusCode, body }); },
          send(body) { resolve({ code: this.statusCode, body }); },
          setHeader() {},
        };
        limiter(req, res, () => resolve({ code: 200, next: true }));
      });

    const outcomes = [];
    for (let i = 0; i < 11; i += 1) outcomes.push(await runOnce());
    const statuses = outcomes.map((o) => o.code);
    expect(statuses.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  }, 30000);

  it("concurrent explains of the same incident: both complete, storage shape stable", async () => {
    let calls = 0;
    _setLLMDriverForTests(async () => {
      calls += 1;
      await wait(30); // force overlap
      return {
        text: JSON.stringify({ summary: `call ${calls}`, likelyCause: "c", recommendedAction: "a", urgency: "soon" }),
        provider: "mock",
        model: "mock-model",
      };
    });

    const results = await Promise.all([
      explainIncident({ incidentId: env.incident.incidentId }),
      explainIncident({ incidentId: env.incident.incidentId }),
      explainIncident({ incidentId: env.incident.incidentId }),
    ]);
    for (const r of results) {
      expect(["llm", "fallback"]).toContain(r.source);
      expect(r.status).toBe("ready");
    }

    const doc = (await Incident.findById(env.incident._id)).toObject();
    // Exactly one stored explanation, well-formed, incident body untouched.
    expect(doc.explanation.status).toBe("ready");
    expect(["llm", "fallback"]).toContain(doc.explanation.source);
    expect(doc.severity).toBe("critical");
    expect(doc.status).toBe("open");
    expect(typeof doc.explanation.summary).toBe("string");
    expect(doc.explanation.summary.length).toBeGreaterThan(0);
  });
});
