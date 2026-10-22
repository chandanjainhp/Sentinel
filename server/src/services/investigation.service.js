import Investigation from "../models/investigation.model.js";
import { Incident } from "../models/incident.model.js";
import { Event } from "../models/event.model.js";
import { Machine } from "../models/machine.model.js";
import { dispatchInvestigation } from "../queues/investigation.queue.js";
import { ApiError } from "../utils/api-error.js";
import { reportingWindow, REPORTING_TIMEZONE } from "../utils/reporting-window.js";
import { z } from "zod";
import { Prediction } from "../models/prediction.model.js";
import { getAIClient, getAIProviderName, getModelName } from "../utils/anthropic.js";
import { withTimeout } from "../utils/with-timeout.js";
import { getMlTimeoutMs } from "./ml-contract.service.js";
import logger from "../utils/logger.js";

const LLM_MAX_TOKENS = 2400;
const INVESTIGATION_LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 15000);
const arrayOrSingle = (value) => Array.isArray(value) ? value : [value];

const investigationResultSchema = z.object({
  executiveSummary: z.string().trim().min(1).max(2000),
  findings: z.array(z.object({
    category: z.string().trim().min(1).max(120),
    detail: z.string().trim().min(1).max(2000),
    severity: z.enum(["critical", "warning", "minor", "unknown"]),
  })).max(20),
  rootCause: z.string().trim().min(1).max(2000),
  recommendedActions: z.preprocess(arrayOrSingle, z.array(z.string().trim().min(1).max(1000)).max(20)),
  // Sarvam sometimes compresses a single limitation into a string.
  dataLimitations: z.preprocess((value) => Array.isArray(value) ? value : [value], z.array(z.string().trim().min(1).max(500)).max(20)),
  unresolvedQuestions: z.preprocess(arrayOrSingle, z.array(z.string().trim().min(1).max(500)).max(20)),
  classification: z.object({
    severity: z.enum(["serious", "minor", "harmless", "uncertain"]),
    confidence: z.number().min(0).max(1),
    reasoning: z.string().trim().min(1).max(2000),
    uncertainties: z.preprocess(arrayOrSingle, z.array(z.string().trim().min(1).max(500)).max(20)),
    recommendedFollowup: z.string().trim().min(1).max(1000),
  }),
});

const extractLLMText = (response) =>
  (Array.isArray(response?.content) ? response.content : [])
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");

const stripJson = (value) => {
  const text = String(value || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = text.indexOf("{");
  if (start < 0) return text;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return text.slice(start);
};

const failureReason = (error) => {
  const text = String(error?.message || error || "").toLowerCase();
  if (text.includes("timed out") || text.includes("timeout")) return "timeout";
  if (text.includes("401") || text.includes("403") || text.includes("api key") || text.includes("authentication")) return "authentication";
  if (text.includes("validation") || text.includes("json")) return "invalid_response";
  if (text.includes("429") || text.includes("rate_limit") || text.includes("quota")) return "rate_limit";
  if (/\b[45]\d{2}\b/.test(text)) return "provider_http_error";
  return "provider_error";
};

export const buildInvestigationPrompt = ({ trace, predictionHistory }) => {
  const { incident, machine, stats, events, window, evidenceChain, recentReadings } = trace;
  const evidence = incident.evidence || {};
  const storedExplanation = incident.explanation || null;
  const system = [
    "You are Sentinel's overnight industrial reliability investigator.",
    "Use only the supplied stored evidence. Do not invent readings, causes, timestamps, or actions.",
    "Distinguish confirmed observations from likely causes in the finding text.",
    "Return only one JSON object matching the requested schema; no markdown or commentary.",
  ].join(" ");
  const user = JSON.stringify({
    requestedSchema: {
      executiveSummary: "string",
      findings: [{ category: "string", detail: "string", severity: "critical|warning|minor|unknown" }],
      rootCause: "string, explicitly hedged when not confirmed",
      recommendedActions: ["string"],
      dataLimitations: ["string"],
      unresolvedQuestions: ["string"],
      classification: { severity: "serious|minor|harmless|uncertain", confidence: "0..1", reasoning: "string", uncertainties: ["string"], recommendedFollowup: "string" },
    },
    investigationWindow: { nightDate: trace.nightDate, timezone: REPORTING_TIMEZONE, from: window.from.toISOString(), to: window.to.toISOString() },
    incident: { id: incident.incidentId, title: incident.title, severity: incident.severity, type: incident.type, reason: incident.reason, occurrenceCount: incident.occurrenceCount, createdAt: incident.createdAt, evidence },
    machine: machine ? { id: String(machine._id), name: machine.name, assetId: machine.assetId, siteId: String(machine.siteId), type: machine.machineType, status: machine.status } : null,
    readings: {
      eventCount: typeof events === "number" ? events : events.length,
      channelStats: stats,
      recentReadings: recentReadings || [],
    },
    existingEvidenceChain: evidenceChain || [],
    predictionHistory,
    argusExplanation: storedExplanation ? { summary: storedExplanation.summary, likelyCause: storedExplanation.likelyCause, recommendedAction: storedExplanation.recommendedAction, source: storedExplanation.source, generatedAt: storedExplanation.generatedAt } : null,
  });
  return { system, user };
};

export const aggregateChannelStats = (events) => {
  const channelStats = {};
  for (const event of events) {
    const values = event.values instanceof Map ? Object.fromEntries(event.values) : event.values || {};
    for (const [channel, value] of Object.entries(values)) {
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      const s = (channelStats[channel] ??= { min: value, max: value, sum: 0, count: 0 });
      s.min = Math.min(s.min, value);
      s.max = Math.max(s.max, value);
      s.sum += value;
      s.count += 1;
    }
  }
  return Object.entries(channelStats).map(([channel, s]) => ({
    channel,
    min: +s.min.toFixed(3),
    max: +s.max.toFixed(3),
    avg: +(s.sum / s.count).toFixed(3),
    samples: s.count,
  }));
};

/**
 * Overnight investigation orchestration.
 *
 * POST /investigations/start { nightDate }:
 *   1. Find the user's incidents created within the night window
 *      (nightDate 00:00 → +24h, UTC — same convention as the client's
 *      useIncidents night-window conversion).
 *   2. None → { status: "no_incidents", jobIds: [] } (client stays idle).
 *   3. Else create one Investigation doc per incident (queued) and enqueue a
 *      job per doc. BullMQ jobId = the doc id, so re-clicking Start within a
 *      run is idempotent-ish: finished jobs dedupe, while a running/failed
 *      night can be re-driven with fresh docs via a fresh doc id.
 *   4. Return { jobIds, status: "started", totalJobs } — the client polls
 *      GET /investigations/:jobId.
 *
 * GET /investigations/:investigationId: returns the doc (toolCallSequence,
 * evidenceChain, classification drive the AgentFeed UI).
 */

/** Resolve a job id that may be either an Investigation _id or a legacy BullMQ job id. */
const findInvestigationDoc = async (investigationId) => {
  if (investigationId.match(/^[a-f\d]{24}$/i)) {
    const byId = await Investigation.findById(investigationId);
    if (byId) return byId;
  }
  return Investigation.findOne({ jobId: investigationId });
};

export const startInvestigation = async ({ userId, nightDate, dispatch = dispatchInvestigation }) => {
  const window = reportingWindow(nightDate);
  if (!window) {
    throw new ApiError(400, "nightDate must be a valid YYYY-MM-DD date");
  }

  const incidents = await Incident.find({
    userId,
    createdAt: { $gte: window.from, $lt: window.to },
  })
    .sort({ createdAt: -1 })
    .lean();

  if (incidents.length === 0) {
    return { status: "no_incidents", jobIds: [], totalJobs: 0 };
  }

  const incidentIds = incidents.map((incident) => incident._id);
  const existing = await Investigation.find({ nightDate, incidentId: { $in: incidentIds } });
  const byIncident = new Map(existing.map((doc) => [String(doc.incidentId), doc]));

  // The unique (incidentId, nightDate) index is the cross-request lock. A
  // loser of a concurrent create simply reloads the winner's document.
  for (const incident of incidents) {
    if (byIncident.has(String(incident._id))) continue;
    try {
      const doc = await Investigation.create({ incidentId: incident._id, nightDate, status: "queued" });
      doc.jobId = String(doc._id);
      await doc.save({ validateBeforeSave: false });
      byIncident.set(String(incident._id), doc);
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const doc = await Investigation.findOne({ incidentId: incident._id, nightDate });
      if (!doc) throw error;
      byIncident.set(String(incident._id), doc);
    }
  }

  const docs = incidents.map((incident) => byIncident.get(String(incident._id)));
  let retried = false;
  for (const doc of docs) {
    // A queued document is also the recovery ledger for a dispatch that failed
    // after the document was written. BullMQ's deterministic job id makes a
    // retry safe if the earlier add actually reached Redis.
    if (doc.status === "failed") {
      doc.status = "queued";
      doc.failureReason = undefined;
      await doc.save({ validateBeforeSave: false });
      retried = true;
    }
    if (doc.status !== "queued") continue;
    if (!doc.jobId) {
      doc.jobId = String(doc._id);
      await doc.save({ validateBeforeSave: false });
    }
    await dispatch(String(doc.incidentId), 5, String(doc._id), {
      investigationId: String(doc._id),
      nightDate,
    });
  }

  const jobIds = docs.map((doc) => String(doc._id));
  const complete = docs.every((doc) => doc.status === "complete");
  const status = complete ? "already_complete" : existing.length && !retried ? "already_running" : "started";
  return { status, jobIds, totalJobs: jobIds.length };
};

export const getInvestigationById = async (investigationId, userFilter = {}) => {
  const doc = await findInvestigationDoc(investigationId);
  if (!doc) {
    throw new ApiError(404, "Investigation not found");
  }

  // Ownership: the incident belongs to the requesting user.
  const incident = await Incident.findOne({
    _id: doc.incidentId,
    ...(userFilter.userId ? { userId: userFilter.userId } : {}),
  }).lean();
  if (!incident) {
    throw new ApiError(404, "Investigation not found");
  }

  return doc;
};

/**
 * Worker-side: load full context for one incident and return a structured
 * "tool call" trace the agent UI can render. Deterministic — no LLM required.
 */
export const buildInvestigationTrace = async ({ incidentId, nightDate }) => {
  const incident = await Incident.findById(incidentId).lean();
  if (!incident) {
    throw new Error(`Incident ${incidentId} not found`);
  }

  const machine = await Machine.findOne({
    _id: incident.machineId,
    userId: incident.userId,
    siteId: incident.siteId,
  }).lean();

  const window = reportingWindow(nightDate);

  // Events around the incident window (same machine, the night in question).
  const events = await Event.find({
    machineId: incident.machineId,
    userId: incident.userId,
    siteId: incident.siteId,
    timestamp: { $gte: window.from, $lt: window.to },
  })
    .sort({ timestamp: 1 })
    .lean();

  // Per-channel min/max/avg over the complete reporting window.
  const stats = aggregateChannelStats(events);

  const evidence = incident.evidence || {};
  const anomalyScore = Number(evidence.anomalyScore ?? 0);
  const faultType = evidence.faultType || "none";

  // Deterministic classification (same thresholds as the health pipeline).
  const classification = {
    severity:
      incident.severity === "critical"
        ? "serious"
        : incident.severity === "warning"
          ? "minor"
          : "uncertain",
    confidence: Math.max(0.35, Math.min(0.95, 0.5 + anomalyScore * 0.45)),
    reasoning:
      `Anomaly score ${anomalyScore.toFixed(2)} with fault type "${faultType}". ` +
      `Night window analysed ${stats.length} channels / ${events.length} readings on ` +
      `${machine?.name || "machine"}.`,
    uncertainties:
      stats.length === 0
        ? ["No sensor readings recorded during the night window — classification is based on the prediction alone."]
        : [],
    recommendedFollowup:
      incident.severity === "critical"
        ? "Inspect the machine before the next shift; check the flagged channel first."
        : "Monitor during the next shift; no immediate action required.",
  };

  // Tool-call trace the AgentFeed renders step by step.
  const toolCallSequence = [
    {
      callIndex: 1,
      toolName: "get_incident_context",
      toolInput: { incidentId: incident.incidentId, severity: incident.severity },
      toolResult: { title: incident.title, reason: incident.reason, type: incident.type },
      timestamp: new Date(),
      significance: "supporting",
    },
    {
      callIndex: 2,
      toolName: "get_machine_profile",
      toolInput: { machineId: String(incident.machineId) },
      toolResult: {
        name: machine?.name,
        assetId: machine?.assetId,
        machineType: machine?.machineType,
        zone: machine?.zone,
      },
      timestamp: new Date(),
      significance: "supporting",
    },
    {
      callIndex: 3,
      toolName: "aggregate_overnight_readings",
      toolInput: { nightDate, timezone: REPORTING_TIMEZONE },
      toolResult: { readings: events.length, channels: stats },
      timestamp: new Date(),
      significance: "critical",
    },
    {
      callIndex: 4,
      toolName: "classify_incident",
      toolInput: { strategy: "deterministic_thresholds" },
      toolResult: {
        severity: classification.severity,
        confidence: classification.confidence,
      },
      timestamp: new Date(),
      significance: "critical",
    },
  ];

  const evidenceChain = [
    {
      step: 1,
      finding: `Incident raised: ${incident.title}`,
      source: "incident",
      confidence: "high",
    },
    ...(stats.length > 0
      ? stats.map((s, i) => ({
          step: i + 2,
          finding: `${s.channel}: min ${s.min}, max ${s.max}, avg ${s.avg} over ${s.samples} samples`,
          source: "aggregate_overnight_readings",
          confidence: s.samples >= 10 ? "high" : "medium",
        }))
      : []),
    {
      step: stats.length + 2,
      finding: classification.reasoning,
      source: "classify_incident",
      confidence: classification.confidence >= 0.7 ? "high" : "medium",
    },
  ];

  const predictionHistory = await Prediction.find({
    userId: incident.userId,
    siteId: incident.siteId,
    machineId: incident.machineId,
    timestamp: { $gte: window.from, $lt: window.to },
  })
    .select("timestamp model modelVersion anomalyScore faultProbability faultType confidence rulValue rulUnit evidence")
    .sort({ timestamp: 1 })
    .limit(100)
    .lean();

  const recentReadings = events.slice(-20).map((event) => ({
    timestamp: event.timestamp,
    values: event.values instanceof Map ? Object.fromEntries(event.values) : event.values || {},
  }));

  return { incident, machine, stats, events: events.length, recentReadings, classification, toolCallSequence, evidenceChain, predictionHistory, window, nightDate };
};

const callInvestigationLLM = async (system, user) => {
  const provider = getAIProviderName();
  const model = getModelName();
  const response = await getAIClient().messages.create({
    model,
    max_tokens: LLM_MAX_TOKENS,
    system,
    messages: [{ role: "user", content: user }],
  });
  return { ...response, provider, model };
};

let investigationLLM = callInvestigationLLM;

export const analyzeInvestigation = async ({ incidentId, nightDate }) => {
  const trace = await buildInvestigationTrace({ incidentId, nightDate });
  let lastError;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const prompt = buildInvestigationPrompt({ trace, predictionHistory: trace.predictionHistory });
      const response = await withTimeout(
        investigationLLM(prompt.system, prompt.user),
        Number(process.env.LLM_TIMEOUT_MS || INVESTIGATION_LLM_TIMEOUT_MS || getMlTimeoutMs()),
        "Investigation LLM call",
      );
      const parsed = investigationResultSchema.safeParse(JSON.parse(stripJson(extractLLMText(response))));
      if (!parsed.success) {
        const issue = parsed.error.issues?.[0];
        throw new Error(`Investigation LLM response validation failed at ${issue?.path?.join(".") || "root"}: ${issue?.message || "invalid shape"}`);
      }
      logger.info({ incidentId, provider: response.provider, model: response.model }, "Investigation LLM analysis succeeded");
      return { ...trace, ...parsed.data, resultSource: "llm", provider: response.provider, agentModel: response.model, failureReason: undefined };
    } catch (error) {
      lastError = error;
      logger.warn({ incidentId, attempt, category: failureReason(error), reason: String(error?.message || "").slice(0, 200) }, "Investigation LLM attempt failed");
    }
  }

  const fallback = {
    executiveSummary: trace.classification.reasoning,
    findings: [{ category: "deterministic_classification", detail: trace.classification.reasoning, severity: trace.incident.severity }],
    rootCause: "The stored prediction identifies an anomalous signal, but the underlying physical cause is not confirmed by the available evidence.",
    recommendedActions: [trace.classification.recommendedFollowup],
    dataLimitations: trace.classification.uncertainties,
    unresolvedQuestions: ["What physical mechanism caused the observed anomaly?"] ,
    resultSource: "fallback",
    provider: null,
    agentModel: null,
    failureReason: `LLM unavailable after retry: ${failureReason(lastError)}`,
  };
  logger.warn({ incidentId, source: "fallback", error: fallback.failureReason }, "Investigation deterministic fallback activated");
  return { ...trace, ...fallback };
};

export const _setInvestigationLLMForTests = (fn) => {
  investigationLLM = fn || callInvestigationLLM;
};
