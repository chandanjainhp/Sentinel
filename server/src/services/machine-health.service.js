import { Machine } from "../models/machine.model.js";
import { Sensor } from "../models/sensor.model.js";
import { computeSensorStatus, SENSOR_STATUS } from "../utils/sensor-status.js";
import { createIncidentIfEligible } from "./incident.service.js";
import {
  CRITICAL_ANOMALY_SCORE,
  CRITICAL_FAULT_PROBABILITY,
  WARNING_ANOMALY_SCORE,
} from "./ml-contract.service.js";

/**
 * Named health thresholds (approved decision 4).
 * The ML contract recommends anomalyScore-only severity; faultProbability is
 * a persistence statistic and may only CONFIRM a CRITICAL (an anomaly that
 * has been sustained), never create one alone.
 */
export const HEALTH_THRESHOLDS = {
  CRITICAL_ANOMALY_SCORE, // 0.90
  CRITICAL_FAULT_PROBABILITY, // 0.5 — must hold together with the anomaly rule
  WARNING_ANOMALY_SCORE, // 0.75
};

/** Machine.status values used by the deterministic health evaluation. */
export const HEALTH_STATUS = {
  HEALTHY: "healthy",
  WARNING: "warning",
  CRITICAL: "critical",
  OFFLINE: "offline",
  UNKNOWN: "unknown",
};

/** Canonical reasons a machine is UNKNOWN (surfaced in healthUnknownReason). */
export const HEALTH_UNKNOWN_REASONS = {
  ML_UNREACHABLE: "ML service unreachable",
  ML_MODEL_NOT_LOADED: "ML model not loaded (service reports 503)",
  ML_BAD_REQUEST: "ML rejected our request",
  ML_BAD_RESPONSE: "ML response failed validation",
  MISSING_CHANNELS: "Missing sensor channels",
  COLLECTING: "Collecting data",
};

/**
 * Mark a machine UNKNOWN with a human-readable reason.
 * Skips the write when the reason is unchanged (a backfill burst would
 * otherwise issue hundreds of identical writes).
 */
export const markMachineUnknown = async (machineId, reason) => {
  const machine = await Machine.findById(machineId);
  if (!machine) return null;

  if (machine.status === HEALTH_STATUS.UNKNOWN && machine.healthUnknownReason === reason) {
    return machine; // no change
  }

  machine.status = HEALTH_STATUS.UNKNOWN;
  machine.healthUnknownReason = reason;
  await machine.save();
  return machine;
};

const classifyScores = (anomalyScore, faultProbability) => {
  if (
    anomalyScore >= CRITICAL_ANOMALY_SCORE &&
    faultProbability >= CRITICAL_FAULT_PROBABILITY
  ) {
    return HEALTH_STATUS.CRITICAL;
  }
  if (anomalyScore >= WARNING_ANOMALY_SCORE) {
    return HEALTH_STATUS.WARNING;
  }
  return HEALTH_STATUS.HEALTHY;
};

export const evaluateMachineHealth = async (prediction) => {
  if (!prediction || !prediction.machineId) return null;

  const machine = await Machine.findById(prediction.machineId);
  if (!machine) return null;

  // Contract discipline: a missing score is "not available", never zero.
  // A scored prediction always carries numeric scores, so this only guards
  // against schema drift.
  const anomalyScore =
    typeof prediction.anomalyScore === "number" ? prediction.anomalyScore : null;
  const faultProbability =
    typeof prediction.faultProbability === "number" ? prediction.faultProbability : null;

  let newStatus;
  if (anomalyScore === null || faultProbability === null) {
    newStatus = HEALTH_STATUS.UNKNOWN;
    machine.healthUnknownReason = HEALTH_UNKNOWN_REASONS.ML_BAD_RESPONSE;
  } else {
    newStatus = classifyScores(anomalyScore, faultProbability);
    // A healthy, scored reading clears any stale UNKNOWN reason.
    machine.healthUnknownReason = null;
  }

  // Offline check from computed sensor connectivity (all sensors offline).
  const sensors = await Sensor.find({ machineId: machine._id });
  if (sensors.length > 0) {
    const anyConnected = sensors.some(
      (s) => computeSensorStatus(s) !== SENSOR_STATUS.OFFLINE
    );
    if (!anyConnected) {
      newStatus = HEALTH_STATUS.OFFLINE;
    }
  }

  machine.status = newStatus;
  await machine.save();

  // Incidents only from real scored states — never from UNKNOWN/OFFLINE.
  if (newStatus === HEALTH_STATUS.CRITICAL || newStatus === HEALTH_STATUS.WARNING) {
    await createIncidentIfEligible({
      machine,
      prediction,
      severity: newStatus,
      anomalyScore,
      faultProbability,
    });
  }

  return { machineId: machine._id, status: newStatus };
};
