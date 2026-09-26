import crypto from "crypto";
import { Event, EVENT_TAGS } from "../models/event.model.js";
import { Site } from "../models/site.model.js";
import { Machine } from "../models/machine.model.js";
import { Sensor } from "../models/sensor.model.js";
import { predictionQueue } from "../queues/prediction.queue.js";
import { ApiError } from "../utils/api-error.js";
import { withTimeout } from "../utils/with-timeout.js";
import { ML_TIMEOUT_MS } from "./ml-contract.service.js";
import mongoose from "mongoose";

const createEventHash = (payload) => {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
};

export const ingestEvent = async ({
  userId,
  siteIdParam,
  machineIdParam,
  sensorIdParam,
  type,
  timestamp,
  values,
  rawData,
  source,
  idempotencyHeader,
}) => {
  const isSiteObjId = mongoose.Types.ObjectId.isValid(siteIdParam);
  const isMachineObjId = mongoose.Types.ObjectId.isValid(machineIdParam);
  const isSensorObjId = mongoose.Types.ObjectId.isValid(sensorIdParam);

  const siteQuery = isSiteObjId ? { $or: [{ siteId: siteIdParam }, { _id: siteIdParam }] } : { siteId: siteIdParam };
  const site = await Site.findOne(siteQuery);
  if (!site) {
    throw new ApiError(404, "Site not found");
  }

  const machineQuery = isMachineObjId ? { $or: [{ machineId: machineIdParam }, { _id: machineIdParam }] } : { machineId: machineIdParam };
  const machine = await Machine.findOne(machineQuery);
  if (!machine) {
    throw new ApiError(404, "Machine not found");
  }

  const sensorQuery = isSensorObjId ? { $or: [{ sensorId: sensorIdParam }, { _id: sensorIdParam }] } : { sensorId: sensorIdParam };
  const sensor = await Sensor.findOne(sensorQuery);
  if (!sensor) {
    throw new ApiError(404, "Sensor not found");
  }

  // Cross-verify User ownership & hierarchy mismatch
  if (
    site.userId.toString() !== userId.toString() ||
    machine.userId.toString() !== userId.toString() ||
    sensor.userId.toString() !== userId.toString()
  ) {
    throw new ApiError(403, "User mismatch across resource hierarchy");
  }

  if (machine.siteId.toString() !== site._id.toString() || sensor.machineId.toString() !== machine._id.toString()) {
    throw new ApiError(400, "Resource hierarchy mismatch for site, machine, and sensor");
  }

  const idempotencyKey =
    idempotencyHeader ||
    createEventHash({
      siteId: site.siteId,
      machineId: machine.machineId,
      sensorId: sensor.sensorId,
      type: type || "sensor_reading",
      timestamp: new Date(timestamp).toISOString(),
      values,
    });

  // Hash of the payload bound to this idempotency key. A replay must carry
  // the SAME payload; a different payload under a reused key is a caller bug
  // (or a malicious gateway) and is rejected with 409 instead of silently
  // discarding data behind a 200.
  const payloadHash = createEventHash({
    machineId: machine.machineId,
    sensorId: sensor.sensorId,
    type: type || "sensor_reading",
    timestamp: new Date(timestamp).toISOString(),
    values,
  });

  const existingEvent = await Event.findOne({
    userId,
    idempotencyKey,
  });

  if (existingEvent) {
    if (existingEvent.payloadHash !== payloadHash) {
      throw new ApiError(
        409,
        "Idempotency key reused with a different payload"
      );
    }
    return { event: existingEvent, isDuplicate: true };
  }

  const event = await Event.create({
    userId,
    siteId: site._id,
    machineId: machine._id,
    sensorId: sensor._id,
    type: type || "sensor_reading",
    timestamp: new Date(timestamp),
    values,
    rawData: rawData || {},
    source: source || "api",
    idempotencyKey,
    payloadHash,
  });

  // Record the reading time for computed connectivity status. This must
  // never fail or block ingestion — log and continue on error.
  try {
    // Monotonic update: only advance lastReadingAt. A plain $set is
    // last-writer-wins, so under concurrent ingestion an older event that
    // lands last would drag lastReadingAt backwards (sensor wrongly STALE,
    // coverage gate spuriously closed). The guard makes the write max-wins
    // atomically: it applies when the field is unset (Mongo range operators
    // never match null, so the first reading needs its own arm) or older
    // than the incoming timestamp.
    await Sensor.updateOne(
      {
        _id: sensor._id,
        $or: [
          { lastReadingAt: null },
          { lastReadingAt: { $exists: false } },
          { lastReadingAt: { $lt: new Date(timestamp) } },
        ],
      },
      { $set: { lastReadingAt: new Date(timestamp) } }
    );
  } catch (err) {
    console.error(
      "[EventService] Failed to update sensor lastReadingAt:",
      err.message
    );
  }

  // Queue BullMQ prediction job. The enqueue is BOUNDED (same timeout as the
  // ML client): BullMQ's offline queue would otherwise make the producer wait
  // forever on a dead Redis, hanging POST /events. On timeout the event stays
  // stored — the historian's primary job — and the skip is made observable
  // via the PREDICTION_QUEUING_DEGRADED tag instead of an unbounded hang.
  try {
    await withTimeout(
      predictionQueue.add(
        "predict",
        {
          eventId: event._id.toString(),
          machineId: machine._id.toString(),
          siteId: site._id.toString(),
          userId: userId.toString(),
        },
        {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 1000,
          },
        }
      ),
      ML_TIMEOUT_MS,
      "Prediction queue enqueue"
    );
  } catch (err) {
    console.error("[EventService] Prediction queuing degraded:", err.message);
    await Event.updateOne(
      { _id: event._id },
      { $addToSet: { tags: EVENT_TAGS.PREDICTION_QUEUING_DEGRADED } }
    ).catch((tagErr) =>
      console.error(
        "[EventService] Failed to tag event with queuing degradation:",
        tagErr.message
      )
    );
  }

  return { event, isDuplicate: false };
};

export const getEvents = async (queryFilters, userFilter = {}) => {
  const { siteId, machineId, sensorId, from, to, limit = 100 } = queryFilters;

  const filter = { ...userFilter };

  if (siteId) {
    const isObjectId = mongoose.Types.ObjectId.isValid(siteId);
    if (isObjectId) {
      filter.$or = [{ siteId }, { _id: siteId }];
    } else {
      filter.siteId = siteId;
    }
  }

  if (machineId) {
    const isObjectId = mongoose.Types.ObjectId.isValid(machineId);
    const siteMatch = await Machine.findOne({ $or: [{ machineId }, ...(isObjectId ? [{ _id: machineId }] : [])] });
    if (siteMatch) filter.machineId = siteMatch._id;
  }

  if (sensorId) {
    const isObjectId = mongoose.Types.ObjectId.isValid(sensorId);
    const sensorMatch = await Sensor.findOne({ $or: [{ sensorId }, ...(isObjectId ? [{ _id: sensorId }] : [])] });
    if (sensorMatch) filter.sensorId = sensorMatch._id;
  }

  if (from || to) {
    filter.timestamp = {};
    if (from) filter.timestamp.$gte = new Date(from);
    if (to) filter.timestamp.$lte = new Date(to);
  }

  return Event.find(filter)
    .sort({ timestamp: -1 })
    .limit(Number(limit));
};

export const getEventById = async (eventIdParam, userFilter = {}) => {
  const isObjectId = mongoose.Types.ObjectId.isValid(eventIdParam);
  const query = isObjectId
    ? { ...userFilter, $or: [{ eventId: eventIdParam }, { _id: eventIdParam }] }
    : { ...userFilter, eventId: eventIdParam };

  const event = await Event.findOne(query);
  if (!event) {
    throw new ApiError(404, "Event not found");
  }
  return event;
};
