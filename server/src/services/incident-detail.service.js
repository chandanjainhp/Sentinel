import { Incident } from "../models/incident.model.js";
import { Prediction } from "../models/prediction.model.js";
import { Event } from "../models/event.model.js";
import { Machine } from "../models/machine.model.js";
import { Site } from "../models/site.model.js";
import { ApiError } from "../utils/api-error.js";
import { getIncidentById } from "./incident.service.js";
import mongoose from "mongoose";

/**
 * Incident detail — everything the /incidents/[incidentId] page renders, in
 * ONE deterministic, user-scoped read:
 *
 *   incident     → title, severity, status lifecycle fields, reason, evidence
 *   machine      → the machine link target (name, assetId, machineId)
 *   site         → breadcrumb context
 *   event        → the triggering sensor event, verbatim JSON (from the
 *                  prediction's evidence.eventId back-reference)
 *   prediction   → the prediction JSON that caused the incident
 *   nextAction   → ONE deterministic checklist sentence (fixed rule by
 *                  severity — never LLM-generated)
 *
 * The client renders; it never invents evidence or narrative.
 */

/** Deterministic recommended next action, by severity. Fixed rule, no LLM. */
const nextActionFor = (severity, machineName) => {
  const m = machineName || "the machine";
  switch (severity) {
    case "critical":
      return `Isolate ${m} now: stop operation, inspect the suspect channel, and confirm health returns to normal before restarting.`;
    case "warning":
      return `Schedule an inspection of ${m} within the next shift and watch the suspect channel for further escalation.`;
    default:
      return `Keep ${m} under observation and review it at the next telemetry check.`;
  }
};

const predictionJson = (p) => ({
  predictionId: p.predictionId,
  model: p.model,
  modelVersion: p.modelVersion,
  timestamp: p.timestamp,
  rulValue: p.rulValue ?? null,
  rulUnit: p.rulUnit ?? null,
  anomalyScore: p.anomalyScore ?? null,
  faultProbability: p.faultProbability ?? null,
  faultType: p.faultType ?? null,
  confidence: p.confidence ?? null,
  evidence: {
    suspectChannel: p.evidence?.suspectChannel ?? null,
    windowSize: p.evidence?.windowSize ?? null,
    methods: p.evidence?.methods ?? {},
  },
});

const eventJson = (e) => ({
  eventId: e.eventId,
  type: e.type,
  timestamp: e.timestamp,
  values: e.values instanceof Map ? Object.fromEntries(e.values) : e.values ?? {},
  source: e.source,
  severity: e.severity,
  tags: e.tags ?? [],
  sensorId: e.sensorId,
  machineId: e.machineId,
  siteId: e.siteId,
});

export const getIncidentDetail = async (incidentIdParam, userFilter = {}) => {
  const incident = await getIncidentById(incidentIdParam, userFilter);

  const machineId = incident.machineId;
  const [machine, site, prediction] = await Promise.all([
    machineId
      ? Machine.findById(machineId)
          .select("name assetId machineId _id status")
          .lean()
      : null,
    incident.siteId ? Site.findById(incident.siteId).select("name siteId").lean() : null,
    incident.predictionId
      ? Prediction.findById(incident.predictionId).lean()
      : null,
  ]);

  // The triggering sensor event is referenced by the prediction's evidence.
  const triggeringEventId = prediction?.evidence?.eventId;
  const event =
    triggeringEventId && mongoose.Types.ObjectId.isValid(String(triggeringEventId))
      ? await Event.findById(triggeringEventId).lean()
      : null;

  return {
    incident: {
      incidentId: incident.incidentId,
      _id: String(incident._id),
      title: incident.title,
      type: incident.type,
      severity: incident.severity,
      status: incident.status,
      reason: incident.reason,
      evidenceSummary: incident.evidence ?? {},
      occurrenceCount: incident.occurrenceCount ?? 1,
      createdAt: incident.createdAt,
      lastSeenAt: incident.lastSeenAt ?? null,
      reviewedAt: incident.reviewedAt ?? null,
      closedAt: incident.closedAt ?? null,
      explanation: incident.explanation ?? null,
    },
    machine: machine
      ? {
          _id: String(machine._id),
          machineId: machine.machineId,
          assetId: machine.assetId,
          name: machine.name,
          status: machine.status,
        }
      : null,
    site: site ? { siteId: site.siteId, name: site.name } : null,
    event: event ? eventJson(event) : null,
    prediction: prediction ? predictionJson(prediction) : null,
    nextAction: nextActionFor(incident.severity, machine?.name),
  };
};
