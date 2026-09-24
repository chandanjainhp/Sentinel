import { Incident } from "../models/incident.model.js";
import { Site } from "../models/site.model.js";
import { Machine } from "../models/machine.model.js";
import { ApiError } from "../utils/api-error.js";
import mongoose from "mongoose";

export const createIncidentIfEligible = async ({
  machine,
  prediction,
  severity,
  anomalyScore,
  faultProbability,
}) => {
  const cooldownCutoff = new Date(Date.now() - 15 * 60 * 1000); // 15-minute cooldown window

  const existingIncident = await Incident.findOne({
    userId: machine.userId,
    machineId: machine._id,
    status: "open",
    createdAt: { $gte: cooldownCutoff },
  });

  if (existingIncident) {
    return existingIncident;
  }

  const type = prediction.faultType && prediction.faultType !== "none"
    ? "fault_risk"
    : (anomalyScore >= 0.75 ? "anomaly" : "machine_health");

  const title = `${severity.toUpperCase()}: ${machine.name} (${machine.assetId}) - ${prediction.faultType || "Abnormal signal detected"}`;
  const reason = `Machine ${machine.name} reached ${severity} state. Anomaly Score: ${anomalyScore}, Fault Probability: ${faultProbability}, Fault Type: ${prediction.faultType || "none"}.`;

  const incident = await Incident.create({
    userId: machine.userId,
    siteId: machine.siteId,
    machineId: machine._id,
    predictionId: prediction._id,
    type,
    severity,
    title,
    reason,
    evidence: {
      predictionId: prediction.predictionId,
      model: prediction.model,
      anomalyScore,
      faultProbability,
      faultType: prediction.faultType,
      rulValue: prediction.rulValue,
      timestamp: prediction.timestamp,
    },
    status: "open",
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
