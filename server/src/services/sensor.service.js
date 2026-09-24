import { Sensor } from "../models/sensor.model.js";
import { getMachineById } from "./machine.service.js";
import { ApiError } from "../utils/api-error.js";
import { computeSensorStatus, sensorAgeSec } from "../utils/sensor-status.js";
import mongoose from "mongoose";

const MAX_SENSORS = Number(process.env.MAX_SENSORS || 20);

export const buildSensorQuery = (sensorId, userFilter = {}) => {
  const isObjectId = mongoose.Types.ObjectId.isValid(sensorId);
  if (isObjectId) {
    return {
      ...userFilter,
      $or: [{ sensorId }, { _id: sensorId }],
    };
  }
  return {
    ...userFilter,
    sensorId,
  };
};

/** Shape a sensor document for API responses with computed connectivity. */
export const presentSensor = (sensor, now = new Date()) => {
  const raw = typeof sensor.toObject === "function" ? sensor.toObject() : sensor;
  return {
    ...raw,
    status: computeSensorStatus(raw, now),
    ageSec: sensorAgeSec(raw, now),
  };
};

export const createSensor = async (machineIdParam, sensorData, userId) => {
  const machine = await getMachineById(machineIdParam, { userId });

  const total = await Sensor.countDocuments({ userId });
  if (total >= MAX_SENSORS) {
    throw new ApiError(
      409,
      `Sensor limit reached (${total}/${MAX_SENSORS}). Delete a sensor to add another.`
    );
  }

  const sensor = await Sensor.create({
    userId,
    siteId: machine.siteId,
    machineId: machine._id,
    sensorId: sensorData.sensorId, // default string generator if omitted
    name: sensorData.name,
    type: sensorData.type,
    unit: sensorData.unit || "",
    expectedIntervalSec: sensorData.expectedIntervalSec || 60,
    samplingRate: sensorData.samplingRate || null,
    metadata: sensorData.metadata || {},
  });

  return sensor;
};

export const getSensorsByMachine = async (machineIdParam, userFilter = {}) => {
  const machine = await getMachineById(machineIdParam, userFilter);
  const sensors = await Sensor.find({ ...userFilter, machineId: machine._id }).sort({ createdAt: -1 });
  const now = new Date();
  return sensors.map((s) => presentSensor(s, now));
};

export const getSensorById = async (sensorIdParam, userFilter = {}) => {
  const query = buildSensorQuery(sensorIdParam, userFilter);
  const sensor = await Sensor.findOne(query);
  if (!sensor) {
    throw new ApiError(404, "Sensor not found");
  }
  return presentSensor(sensor);
};

export const updateSensor = async (sensorIdParam, updateData, userFilter = {}) => {
  const query = buildSensorQuery(sensorIdParam, userFilter);
  const sensor = await Sensor.findOneAndUpdate(query, { $set: updateData }, { new: true, runValidators: true });
  if (!sensor) {
    throw new ApiError(404, "Sensor not found");
  }
  return presentSensor(sensor);
};

export const deleteSensor = async (sensorIdParam, userFilter = {}) => {
  const query = buildSensorQuery(sensorIdParam, userFilter);
  const sensor = await Sensor.findOneAndDelete(query);
  if (!sensor) {
    throw new ApiError(404, "Sensor not found");
  }
  return sensor;
};

/**
 * Flat list of every sensor owned by the user, enriched with site and
 * machine names and computed connectivity.
 */
export const listSensors = async (userFilter = {}) => {
  const now = new Date();
  const { Site } = await import("../models/site.model.js");
  const { Machine } = await import("../models/machine.model.js");

  const sensors = await Sensor.find(userFilter)
    .sort({ createdAt: -1 })
    .lean();

  // Resolve display names without replacing the raw ids in the payload
  const siteIds = [...new Set(sensors.map((s) => String(s.siteId)))].filter(Boolean);
  const machineIds = [...new Set(sensors.map((s) => String(s.machineId)))].filter(Boolean);
  const [sites, machines] = await Promise.all([
    siteIds.length ? Site.find({ _id: { $in: siteIds } }, { name: 1 }).lean() : [],
    machineIds.length ? Machine.find({ _id: { $in: machineIds } }, { name: 1 }).lean() : [],
  ]);
  const siteNames = new Map(sites.map((d) => [String(d._id), d.name]));
  const machineNames = new Map(machines.map((d) => [String(d._id), d.name]));

  return sensors.map((s) => {
    const presented = presentSensor(s, now);
    return {
      ...presented,
      siteName: siteNames.get(String(s.siteId)) || null,
      machineName: machineNames.get(String(s.machineId)) || null,
    };
  });
};

/**
 * Sensor summary for the logged-in user, computed with one aggregation:
 *   { limit, total, remaining, counts: { online, stale, offline, waiting }, byType: {...} }
 * Connectivity counts are computed from the aggregated lastReadingAt values.
 */
export const getSensorSummary = async (userFilter = {}) => {
  const now = new Date();

  const byTypeRows = await Sensor.aggregate([
    { $match: userFilter },
    {
      $group: {
        _id: "$type",
        count: { $sum: 1 },
        lastReadingAts: { $push: "$lastReadingAt" },
        expectedIntervalSecs: { $push: "$expectedIntervalSec" },
      },
    },
  ]);

  const counts = { online: 0, stale: 0, offline: 0, waiting: 0 };
  const byType = {};
  let total = 0;

  for (const row of byTypeRows) {
    byType[row._id] = row.count;
    total += row.count;

    for (let i = 0; i < row.count; i += 1) {
      const status = computeSensorStatus(
        {
          lastReadingAt: row.lastReadingAts[i],
          expectedIntervalSec: row.expectedIntervalSecs[i],
        },
        now
      );
      const key = status.toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
    }
  }

  return {
    limit: MAX_SENSORS,
    total,
    remaining: Math.max(0, MAX_SENSORS - total),
    counts,
    byType,
  };
};
