import crypto from "crypto";
import { Event } from "../models/event.model.js";
import { Site } from "../models/site.model.js";
import { Machine } from "../models/machine.model.js";
import { Sensor } from "../models/sensor.model.js";
import { predictionQueue } from "../queues/prediction.queue.js";
import { ApiError } from "../utils/api-error.js";
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

  const existingEvent = await Event.findOne({
    userId,
    idempotencyKey,
  });

  if (existingEvent) {
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
  });

  // Record the reading time for computed connectivity status. This must
  // never fail or block ingestion — log and continue on error.
  try {
    await Sensor.updateOne(
      { _id: sensor._id },
      { $set: { lastReadingAt: new Date(timestamp) } }
    );
  } catch (err) {
    console.error(
      "[EventService] Failed to update sensor lastReadingAt:",
      err.message
    );
  }

  // Queue BullMQ prediction job asynchronously
  try {
    await predictionQueue.add(
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
    );
  } catch (err) {
    console.error("[EventService] Failed to queue prediction job:", err.message);
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
