import { Incident } from "../models/incident.model.js";
import { Site } from "../models/site.model.js";
import { Machine } from "../models/machine.model.js";
import { ApiError } from "../utils/api-error.js";
import {
  dispatchArgusExplain,
  argusExplainJobId,
  argusRegenerateJobId,
} from "../queues/argus-explain.queue.js";
import { SEVERITY_RANK } from "./argus-explain.service.js";
import mongoose from "mongoose";

/**
 * One live incident per machine (Fix B).
 *
 * Every scored prediction in a warning/critical state lands on the machine's
 * existing open OR reviewed incident instead of creating a new one: reason,
 * evidence and predictionId are refreshed to the latest prediction,
 * occurrenceCount is bumped, lastSeenAt is set, and severity escalates
 * warning → critical when the new prediction is worse (never downgrades).
 * A new incident is created only when the previous one was closed.
 *
 * On escalation the argus-explain job is re-enqueued under the new severity
 * jobId, so the explanation reflects the worse state.
 */
export const createIncidentIfEligible = async ({
  machine,
  prediction,
  severity,
  anomalyScore,
  faultProbability,
}) => {
  const existingIncident = await Incident.findOne({
    userId: machine.userId,
    machineId: machine._id,
    status: { $in: ["open", "reviewed"] },
  }).sort({ createdAt: -1 });

  const buildTitle = () =>
    `${severity.toUpperCase()}: ${machine.name} (${machine.assetId}) - ${prediction.faultType || "Abnormal signal detected"}`;

  const buildReason = () =>
    `Machine ${machine.name} reached ${severity} state. Anomaly Score: ${anomalyScore}, Fault Probability: ${faultProbability}, Fault Type: ${prediction.faultType || "none"}.`;

  const buildEvidence = () => ({
    predictionId: prediction.predictionId,
    model: prediction.model,
    anomalyScore,
    faultProbability,
    faultType: prediction.faultType,
    rulValue: prediction.rulValue,
    timestamp: prediction.timestamp,
  });

  if (existingIncident) {
    const escalated =
      (SEVERITY_RANK[severity] ?? 0) > (SEVERITY_RANK[existingIncident.severity] ?? 0);

    existingIncident.predictionId = prediction._id;
    existingIncident.reason = buildReason();
    existingIncident.evidence = buildEvidence();
    existingIncident.occurrenceCount = (existingIncident.occurrenceCount || 1) + 1;
    existingIncident.lastSeenAt = new Date();

    if (escalated) {
      existingIncident.severity = severity;
      existingIncident.title = buildTitle();
      existingIncident.type =
        prediction.faultType && prediction.faultType !== "none"
          ? "fault_risk"
          : "anomaly";
    }

    await existingIncident.save();

    // Re-explain on escalation (new jobId with the new severity); same-severity
    // updates keep the existing explanation — the underlying state did not change.
    if (escalated) {
      await dispatchArgusExplain({
        incidentId: existingIncident.incidentId,
        severity,
        jobId: argusExplainJobId(existingIncident.incidentId, severity),
      });
    }

    return existingIncident;
  }

  const type = prediction.faultType && prediction.faultType !== "none"
    ? "fault_risk"
    : (anomalyScore >= 0.75 ? "anomaly" : "machine_health");

  const incident = await Incident.create({
    userId: machine.userId,
    siteId: machine.siteId,
    machineId: machine._id,
    predictionId: prediction._id,
    type,
    severity,
    title: buildTitle(),
    reason: buildReason(),
    evidence: buildEvidence(),
    status: "open",
    occurrenceCount: 1,
    lastSeenAt: new Date(),
  });

  // Argus explanation for the NEW incident. jobId deduplicates: the same
  // incident+severity never re-runs automatically (see argus-explain.queue.js).
  await dispatchArgusExplain({
    incidentId: incident.incidentId,
    severity,
    jobId: argusExplainJobId(incident.incidentId, severity),
  });

  return incident;
};

export const getIncidents = async (filters = {}, userFilter = {}) => {
  const { siteId, machineId, status, severity, from, to, limit = 100 } = filters;

  const filter = { ...userFilter };

  // Accept both public string ids (site_xxx / machine_xxx) and ObjectIds;
  // resolve them to _id so the ObjectId-typed filter fields never receive a
  // plain string. Unresolvable ids simply match nothing.
  if (siteId) {
    const isObj = mongoose.Types.ObjectId.isValid(siteId);
    const site = await Site.findOne(
      isObj
        ? { ...userFilter, $or: [{ siteId }, { _id: siteId }] }
        : { ...userFilter, siteId }
    );
    if (!site) return [];
    filter.siteId = site._id;
  }

  if (machineId) {
    const isObj = mongoose.Types.ObjectId.isValid(machineId);
    const machine = await Machine.findOne(
      isObj
        ? { ...userFilter, $or: [{ machineId }, { _id: machineId }] }
        : { ...userFilter, machineId }
    );
    if (!machine) return [];
    filter.machineId = machine._id;
  }

  if (status) filter.status = status;
  if (severity) filter.severity = severity;

  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }

  return Incident.find(filter)
    .sort({ createdAt: -1 })
    .limit(Number(limit));
};

export const getIncidentById = async (incidentIdParam, userFilter = {}) => {
  const isObjectId = mongoose.Types.ObjectId.isValid(incidentIdParam);
  const query = isObjectId
    ? { ...userFilter, $or: [{ incidentId: incidentIdParam }, { _id: incidentIdParam }] }
    : { ...userFilter, incidentId: incidentIdParam };

  const incident = await Incident.findOne(query);
  if (!incident) {
    throw new ApiError(404, "Incident not found");
  }
  return incident;
};

/**
 * Re-queue the Argus explanation for one incident (user-initiated).
 * Uses a regenerate jobId so it always re-runs regardless of earlier jobs.
 */
export const requestIncidentExplanation = async (incidentIdParam, userFilter = {}) => {
  const isObjectId = mongoose.Types.ObjectId.isValid(incidentIdParam);
  const query = isObjectId
    ? { ...userFilter, $or: [{ incidentId: incidentIdParam }, { _id: incidentIdParam }] }
    : { ...userFilter, incidentId: incidentIdParam };

  const incident = await Incident.findOne(query);
  if (!incident) {
    throw new ApiError(404, "Incident not found");
  }

  await dispatchArgusExplain({
    incidentId: incident.incidentId,
    severity: incident.severity,
    jobId: argusRegenerateJobId(incident.incidentId, incident.severity),
  });

  return {
    incidentId: incident.incidentId,
    explanationStatus: incident.explanation?.status ?? "pending",
  };
};

export const updateIncidentStatus = async (incidentIdParam, newStatus, userId, userFilter = {}) => {
  if (!["open", "reviewed", "closed"].includes(newStatus)) {
    throw new ApiError(400, "Invalid incident status");
  }

  const isObjectId = mongoose.Types.ObjectId.isValid(incidentIdParam);
  const query = isObjectId
    ? { ...userFilter, $or: [{ incidentId: incidentIdParam }, { _id: incidentIdParam }] }
    : { ...userFilter, incidentId: incidentIdParam };

  const updateFields = {
    status: newStatus,
    reviewedBy: userId,
    reviewedAt: new Date(),
  };

  if (newStatus === "closed") {
    updateFields.closedAt = new Date();
  }

  const incident = await Incident.findOneAndUpdate(query, { $set: updateFields }, { new: true, runValidators: true });
  if (!incident) {
    throw new ApiError(404, "Incident not found");
  }
  return incident;
};
