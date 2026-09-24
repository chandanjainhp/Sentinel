import { Event } from "../models/event.model.js";
import { Prediction } from "../models/prediction.model.js";
import { Machine } from "../models/machine.model.js";
import {
  evaluateMachineHealth,
  markMachineUnknown,
  HEALTH_UNKNOWN_REASONS,
} from "./machine-health.service.js";
import {
  buildMachineWindow,
  mapMachineType,
  parseMlResponse,
  ML_RECOMMENDED_WINDOW,
} from "./ml-contract.service.js";
import { ML_SERVICE_URL, ML_TIMEOUT_MS } from "./ml-contract.service.js";
import { ApiError } from "../utils/api-error.js";
import mongoose from "mongoose";

/**
 * How many prediction runs may be waiting/running per machine at once.
 * Ingestion of 40+ backfilled events fans out one job per event; without a
 * guard each job fetches its own window and hammers the ML service with
 * identical work. A per-machine in-process counter skips the surplus runs —
 * the most recent event's job still runs and wins.
 */
const MAX_CONCURRENT_PREDICTIONS_PER_MACHINE = 2;
const machineRuns = new Map(); // machineId -> count

const acquireRunSlot = (machineKey) => {
  const current = machineRuns.get(machineKey) || 0;
  if (current >= MAX_CONCURRENT_PREDICTIONS_PER_MACHINE) return false;
  machineRuns.set(machineKey, current + 1);
  return true;
};

const releaseRunSlot = (machineKey) => {
  const current = machineRuns.get(machineKey) || 0;
  if (current <= 1) machineRuns.delete(machineKey);
  else machineRuns.set(machineKey, current - 1);
};

export const runPrediction = async ({ eventId, machineId }) => {
  const isEventObjId = mongoose.Types.ObjectId.isValid(eventId);
  const event = isEventObjId
    ? await Event.findById(eventId)
    : await Event.findOne({ eventId });
  if (!event) {
    throw new Error("Event not found for prediction");
  }

  const isMachineObjId = mongoose.Types.ObjectId.isValid(machineId);
  const machine = isMachineObjId
    ? await Machine.findById(machineId)
    : await Machine.findOne({ machineId });
  if (!machine) {
    throw new Error("Machine not found for prediction");
  }

  // Flood guard: backfilled history fans out one job per event. Only the two
  // most recent runs per machine proceed; the rest skip quietly — the newest
  // event's run is what matters and it computes over the full window anyway.
  if (!acquireRunSlot(String(machine._id))) {
    return { skipped: true, reason: "prediction already running for machine" };
  }
  try {
    return await predictForMachine({ event, machine });
  } finally {
    releaseRunSlot(String(machine._id));
  }
};

const predictForMachine = async ({ event, machine }) => {
  // ── Build the per-machine window from the machine's events ──
  // Newest first for the fetch, oldest first for the ML payload.
  const recentEvents = await Event.find({ machineId: machine._id })
    .sort({ timestamp: -1 })
    .limit(ML_RECOMMENDED_WINDOW)
    .lean();

  const built = buildMachineWindow(recentEvents);

  if (!built.ok) {
    // Honest state: no ML call, machine goes UNKNOWN with a visible reason.
    // A backfill spike must not flap the reason; only clear it once every
    // required channel has reported within the age limit.
    await markMachineUnknown(machine._id, built.reason);
    return { scored: false, reason: built.reason };
  }

  // One-shot window fetch per scored run: track the newest event we scored
  // so a burst of queued jobs collapses into the latest window.
  const newestEventTime = new Date(recentEvents[0].timestamp).getTime();

  // ── Call the ML service (contract shape, hard timeout) ──
  const payload = {
    machineId: machine.machineId,
    machineType: mapMachineType(machine.machineType),
    window: built.window,
  };

  let parsed;
  try {
    const response = await fetch(`${ML_SERVICE_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(ML_TIMEOUT_MS),
    });

    if (response.status === 503) {
      await markMachineUnknown(
        machine._id,
        HEALTH_UNKNOWN_REASONS.ML_MODEL_NOT_LOADED
      );
      return { scored: false, reason: HEALTH_UNKNOWN_REASONS.ML_MODEL_NOT_LOADED };
    }

    if (response.status === 400 || response.status === 422) {
      // Caller bug per contract — do not retry unchanged. Record and stop.
      const detail = await response.text();
      await markMachineUnknown(
        machine._id,
        `${HEALTH_UNKNOWN_REASONS.ML_BAD_REQUEST} (${response.status}: ${detail.slice(0, 200)})`
      );
      return { scored: false, reason: HEALTH_UNKNOWN_REASONS.ML_BAD_REQUEST };
    }

    if (!response.ok) {
      // 500-class: transient server fault. Re-throw for BullMQ backoff.
      throw new Error(`ML service returned status ${response.status}`);
    }

    parsed = parseMlResponse(await response.json());
  } catch (err) {
    // Timeout / connection refused / 500 → treat as "ML unavailable",
    // never as "machine is fine". UNKNOWN now; BullMQ retries the job.
    await markMachineUnknown(
      machine._id,
      HEALTH_UNKNOWN_REASONS.ML_UNREACHABLE
    ).catch(() => {});
    throw new Error(`ML service unavailable: ${err.message}`);
  }

  if (parsed.kind === "invalid") {
    await markMachineUnknown(
      machine._id,
      `${HEALTH_UNKNOWN_REASONS.ML_BAD_RESPONSE}: ${parsed.error.slice(0, 200)}`
    );
    return { scored: false, reason: parsed.error };
  }

  if (parsed.kind === "insufficient_data") {
    await markMachineUnknown(
      machine._id,
      `Collecting data: ${parsed.have} of ${parsed.need} readings`
    );
    return { scored: false, reason: "insufficient_data", have: parsed.have, need: parsed.need };
  }

  // ── Duplicate-window collapse: another queued job may already have scored
  // a window covering this event. If the newest stored prediction for the
  // machine is newer than the event that triggered us, skip quietly.
  const newestStored = await Prediction.findOne({ machineId: machine._id })
    .sort({ timestamp: -1 })
    .lean();
  if (
    newestStored &&
    new Date(newestStored.timestamp).getTime() >= newestEventTime
  ) {
    return { skipped: true, reason: "newer prediction already stored" };
  }

  // ── Store the prediction ──
  const prediction = await Prediction.create({
    userId: event.userId,
    siteId: event.siteId,
    machineId: event.machineId,
    model: parsed.data.model,
    modelVersion: parsed.data.modelVersion,
    timestamp: new Date(),
    rulValue: parsed.data.rulValue ?? null, // contract: null = not available
    rulUnit: parsed.data.rulUnit ?? null,
    anomalyScore: parsed.data.anomalyScore,
    faultProbability: parsed.data.faultProbability,
    faultType: parsed.data.faultType,
    confidence: parsed.data.confidence,
    evidence: {
      eventId: event._id,
      sensorValues: parsed.data.suspectChannel
        ? {
            suspectChannel: parsed.data.suspectChannel,
          }
        : {},
      windowSize: built.window.length,
      methods: parsed.data.methods ?? {},
    },
  });

  // ── Deterministic machine health + incident rules ──
  await evaluateMachineHealth(prediction);

  return { scored: true, predictionId: String(prediction._id) };
};

export const getMachinePredictions = async (machineIdParam, queryFilters = {}, userFilter = {}) => {
  const isObjectId = mongoose.Types.ObjectId.isValid(machineIdParam);
  const machine = await Machine.findOne(
    isObjectId
      ? { ...userFilter, $or: [{ machineId: machineIdParam }, { _id: machineIdParam }] }
      : { ...userFilter, machineId: machineIdParam }
  );

  if (!machine) {
    throw new ApiError(404, "Machine not found");
  }

  const { from, to, limit = 100 } = queryFilters;
  const filter = {
    ...userFilter,
    machineId: machine._id,
  };

  if (from || to) {
    filter.timestamp = {};
    if (from) filter.timestamp.$gte = new Date(from);
    if (to) filter.timestamp.$lte = new Date(to);
  }

  return Prediction.find(filter)
    .sort({ timestamp: -1 })
    .limit(Number(limit));
};

export const getLatestPrediction = async (machineIdParam, userFilter = {}) => {
  const isObjectId = mongoose.Types.ObjectId.isValid(machineIdParam);
  const machine = await Machine.findOne(
    isObjectId
      ? { ...userFilter, $or: [{ machineId: machineIdParam }, { _id: machineIdParam }] }
      : { ...userFilter, machineId: machineIdParam }
  );

  if (!machine) {
    throw new ApiError(404, "Machine not found");
  }

  const prediction = await Prediction.findOne({
    ...userFilter,
    machineId: machine._id,
  }).sort({ timestamp: -1 });

  if (!prediction) {
    throw new ApiError(404, "No prediction available");
  }

  return prediction;
};

export const getPredictionById = async (predictionIdParam, userFilter = {}) => {
  const isObjectId = mongoose.Types.ObjectId.isValid(predictionIdParam);
  const query = isObjectId
    ? { ...userFilter, $or: [{ predictionId: predictionIdParam }, { _id: predictionIdParam }] }
    : { ...userFilter, predictionId: predictionIdParam };

  const prediction = await Prediction.findOne(query);
  if (!prediction) {
    throw new ApiError(404, "Prediction not found");
  }
  return prediction;
};
