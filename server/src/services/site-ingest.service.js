import crypto from "node:crypto";
import { Event } from "../models/event.model.js";
import { Machine } from "../models/machine.model.js";
import { Sensor } from "../models/sensor.model.js";
import { ApiError } from "../utils/api-error.js";
import { PLAUSIBLE_RANGES } from "../utils/onboarding.js";

const error = (status, message) => {
  throw new ApiError(status, message);
};

export async function ingestSiteEvent({ apiKey, apiSiteId, body }) {
  if (!body || Array.isArray(body) || typeof body !== "object") error(400, "Invalid JSON body");
  if (body.type !== "sensor_reading") error(422, "type must be sensor_reading");
  const { siteId, machineId, sensorId } = body;
  if (siteId !== apiSiteId) error(403, "Site does not match API key");

  const machine = await Machine.findOne({ machineId, siteId: apiKey.siteId }).lean();
  if (!machine) error(404, "Machine not found");
  const sensor = await Sensor.findOne({ sensorId, machineId: machine._id }).lean();
  if (!sensor) error(404, "Sensor not found");
  if (machine.status === "deleted" || sensor.status === "deleted" || machine.status === "disabled" || sensor.status === "disabled") {
    error(409, "Sensor or machine is disabled");
  }

  const values = body.values;
  if (!values || typeof values !== "object" || Array.isArray(values) || Object.keys(values).length !== 1 || Object.keys(values)[0] !== sensor.type) {
    error(422, "values must contain exactly one key matching the sensor type");
  }
  const value = values[sensor.type];
  if (typeof value !== "number" || !Number.isFinite(value)) error(422, "Sensor value must be finite");
  const range = PLAUSIBLE_RANGES[sensor.type];
  if (!range || value < range[0] || value > range[1]) error(422, "Sensor value is outside the plausible range");

  if (body.timestamp !== undefined && (typeof body.timestamp !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(body.timestamp))) {
    error(422, "Invalid timestamp");
  }
  const timestamp = body.timestamp === undefined ? new Date() : new Date(body.timestamp);
  if (Number.isNaN(timestamp.getTime())) error(422, "Invalid timestamp");
  const now = Date.now();
  if (timestamp.getTime() > now + 5 * 60 * 1000 || timestamp.getTime() < now - 7 * 24 * 60 * 60 * 1000) {
    error(422, "Timestamp is outside the accepted window");
  }

  const existing = await Event.findOne({ sensorId: sensor._id, timestamp }).select("eventId").lean();
  if (existing) return { duplicate: true, id: existing.eventId };
  try {
    const event = await Event.create({
      userId: apiKey.userId,
      siteId: apiKey.siteId,
      machineId: machine._id,
      sensorId: sensor._id,
      type: "sensor_reading",
      timestamp,
      values,
      source: "api",
      idempotencyKey: crypto.randomUUID(),
      payloadHash: crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex"),
    });
    return { duplicate: false, id: event.eventId };
  } catch (err) {
    if (err?.code === 11000) {
      const duplicate = await Event.findOne({ sensorId: sensor._id, timestamp }).select("eventId").lean();
      if (duplicate) return { duplicate: true, id: duplicate.eventId };
    }
    throw err;
  }
}
