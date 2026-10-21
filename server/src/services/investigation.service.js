import Investigation from "../models/investigation.model.js";
import { Incident } from "../models/incident.model.js";
import { Event } from "../models/event.model.js";
import { Machine } from "../models/machine.model.js";
import { dispatchInvestigation } from "../queues/investigation.queue.js";
import { ApiError } from "../utils/api-error.js";
import { reportingWindow, REPORTING_TIMEZONE } from "../utils/reporting-window.js";

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
      byIncident.set(String(incident._id), doc);
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const doc = await Investigation.findOne({ incidentId: incident._id, nightDate });
      if (!doc) throw error;
      byIncident.set(String(incident._id), doc);
    }
  }

  const docs = incidents.map((incident) => byIncident.get(String(incident._id)));
  for (const doc of docs) {
    // A queued document is also the recovery ledger for a dispatch that failed
    // after the document was written. BullMQ's deterministic job id makes a
    // retry safe if the earlier add actually reached Redis.
    if (doc.status !== "queued") continue;
    await dispatch(String(doc.incidentId), 5, String(doc._id), {
      investigationId: String(doc._id),
      nightDate,
    });
  }

  const jobIds = docs.map((doc) => String(doc._id));
  const complete = docs.every((doc) => doc.status === "complete");
  const status = complete ? "already_complete" : existing.length ? "already_running" : "started";
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

  return { incident, machine, stats, events: events.length, classification, toolCallSequence, evidenceChain };
};
