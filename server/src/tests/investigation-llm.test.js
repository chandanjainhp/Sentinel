import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { connectDatabases, disconnectDatabases } from "../db/index.js";
import { User } from "../models/user.model.js";
import { Site } from "../models/site.model.js";
import { Machine } from "../models/machine.model.js";
import { Incident } from "../models/incident.model.js";
import Investigation from "../models/investigation.model.js";
import { analyzeInvestigation, buildInvestigationPrompt, _setInvestigationLLMForTests } from "../services/investigation.service.js";
import { getIncidentEvidenceGraph } from "../services/incident.service.js";
import { getRedis } from "../db/redis.js";
import { getInvestigationQueue, closeInvestigationQueue } from "../queues/investigation.queue.js";
import { startInvestigationWorker, stopInvestigationWorker } from "../queues/investigation.worker.js";

const suffix = `llm_${Date.now()}`;
const nightDate = "2026-02-10";
process.env.INVESTIGATION_QUEUE_NAME = `investigations_${suffix}`;
let seeded;

const valid = (overrides = {}) => ({
  executiveSummary: "The stored prediction indicates an elevated vibration anomaly.",
  findings: [{ category: "prediction", detail: "Anomaly score 0.94 is stored for the incident.", severity: "critical" }],
  rootCause: "Bearing wear is suspected, but is not confirmed by the stored evidence.",
  recommendedActions: ["Inspect the bearing before the next shift."],
  dataLimitations: ["Only the stored overnight readings were available."],
  unresolvedQuestions: ["What physical mechanism caused the vibration increase?"],
  classification: {
    severity: "serious",
    confidence: 0.88,
    reasoning: "The critical incident and stored anomaly score support serious classification.",
    uncertainties: ["The physical cause is not confirmed."],
    recommendedFollowup: "Inspect the bearing before the next shift.",
  },
  ...overrides,
});

beforeAll(async () => {
  await connectDatabases();
  seeded = {};
  seeded.user = await User.create({ email: `${suffix}@factory.com`, username: suffix, password: "Password123!" });
  seeded.site = await Site.create({ userId: seeded.user._id, name: suffix, timezone: "UTC" });
  seeded.machine = await Machine.create({ userId: seeded.user._id, siteId: seeded.site._id, assetId: suffix, name: "Test Pump", machineType: "pump" });
  seeded.incident = await Incident.create({
    userId: seeded.user._id,
    siteId: seeded.site._id,
    machineId: seeded.machine._id,
    type: "fault_risk",
    severity: "critical",
    title: "Critical pump vibration",
    reason: "Stored prediction crossed the critical threshold.",
    evidence: { anomalyScore: 0.94, faultProbability: 0.72, faultType: "vibration_anomaly" },
    createdAt: new Date("2026-02-10T04:00:00Z"),
  });
});

afterAll(async () => {
  _setInvestigationLLMForTests(null);
  await stopInvestigationWorker();
  await closeInvestigationQueue();
  await Investigation.deleteMany({ incidentId: seeded?.incident?._id });
  await Incident.deleteMany({ _id: seeded?.incident?._id });
  await Machine.deleteMany({ _id: seeded?.machine?._id });
  await Site.deleteMany({ _id: seeded?.site?._id });
  await User.deleteMany({ _id: seeded?.user?._id });
  await disconnectDatabases();
});

describe("LLM overnight investigation", () => {
  it("persists an LLM result and provenance through the BullMQ worker", async () => {
    _setInvestigationLLMForTests(async () => ({ content: [{ type: "text", text: JSON.stringify(valid()) }], provider: "sarvam", model: "sarvam-105b-conversations" }));
    const doc = await Investigation.create({ userId: seeded.user._id, incidentId: seeded.incident._id, nightDate, status: "queued", jobId: "pending" });
    doc.jobId = String(doc._id);
    await doc.save({ validateBeforeSave: false });
    const queue = getInvestigationQueue();
    const worker = startInvestigationWorker(getRedis());
    await queue.add("investigate", { investigationId: String(doc._id), incidentId: String(seeded.incident._id), nightDate, dispatchedAt: new Date().toISOString() }, { jobId: String(doc._id), attempts: 1 });
    const started = Date.now();
    while ((await Investigation.findById(doc._id)).status !== "complete") {
      if (Date.now() - started > 10000) throw new Error("worker did not complete");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const stored = await Investigation.findById(doc._id).lean();
    expect(stored.resultSource).toBe("llm");
    expect(stored.provider).toBe("sarvam");
    expect(stored.executiveSummary).toContain("elevated vibration");
    const graph = await getIncidentEvidenceGraph(seeded.incident.incidentId, { userId: seeded.user._id });
    expect(graph.resultSource).toBe("llm");
    expect(graph.executiveSummary).toContain("elevated vibration");
    expect(graph.agentReasoning.source).toBe("llm");
    expect(graph.agentReasoning.assessment).toContain("elevated vibration");
    expect(graph.agentReasoning.recommendedActions[0]).toContain("Inspect the bearing");
    expect(worker).toBeTruthy();
    await queue.obliterate({ force: true });
  });

  it("uses the configured provider seam and accepts a valid structured response", async () => {
    let calls = 0;
    _setInvestigationLLMForTests(async (system, user) => {
      calls += 1;
      expect(system).toContain("stored evidence");
      expect(user).toContain("Critical pump vibration");
      return { content: [{ type: "text", text: JSON.stringify(valid()) }], provider: "sarvam", model: "sarvam-105b-conversations" };
    });
    const result = await analyzeInvestigation({ incidentId: seeded.incident._id, nightDate });
    expect(calls).toBe(1);
    expect(result.resultSource).toBe("llm");
    expect(result.provider).toBe("sarvam");
    expect(result.agentModel).toBe("sarvam-105b-conversations");
    expect(result.findings[0].detail).toContain("0.94");
  });

  it("falls back for malformed responses and provider errors without labeling them LLM", async () => {
    _setInvestigationLLMForTests(async () => ({ content: [{ type: "text", text: "not json" }], provider: "sarvam", model: "sarvam-105b-conversations" }));
    const malformed = await analyzeInvestigation({ incidentId: seeded.incident._id, nightDate });
    expect(malformed.resultSource).toBe("fallback");
    expect(malformed.failureReason).toContain("invalid_response");

    _setInvestigationLLMForTests(async () => { throw new Error("Sarvam error (403): invalid_api_key_error"); });
    const authFailure = await analyzeInvestigation({ incidentId: seeded.incident._id, nightDate });
    expect(authFailure.resultSource).toBe("fallback");
    expect(authFailure.failureReason).toContain("authentication");
  });

  it("keeps evidence timestamps and data fields in the prompt", async () => {
    const result = await analyzeInvestigation({ incidentId: seeded.incident._id, nightDate });
    const prompt = buildInvestigationPrompt({ trace: result, predictionHistory: result.predictionHistory });
    expect(prompt.user).toContain("2026-02-10");
    expect(prompt.user).toContain("eventCount");
    expect(prompt.user).toContain("dataLimitations");
  });
});
