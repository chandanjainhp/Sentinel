import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import Event from "../models/event.model.js";
import Incident from "../models/incident.model.js";
import mongoose from "mongoose";
import { getRedis } from "../db/redis.js";

const getNightRange = (nightDateInput) => {
  const base = nightDateInput ? new Date(nightDateInput) : new Date();

  if (!nightDateInput) {
    base.setDate(base.getDate() - 1);
  }

  base.setHours(0, 0, 0, 0);
  const start = new Date(base);
  const end = new Date(base);
  end.setHours(23, 59, 59, 999);

  const year = start.getFullYear();
  const month = String(start.getMonth() + 1).padStart(2, "0");
  const day = String(start.getDate()).padStart(2, "0");

  return { start, end, nightDate: `${year}-${month}-${day}` };
};

const healthCheck = asyncHandler(async (req, res) => {
  const mongoReady = mongoose.connection.readyState === 1;
  const redisClient = getRedis();
  let redisReady = false;

  if (redisClient) {
    try {
      await redisClient.ping();
      redisReady = true;
    } catch {
      redisReady = false;
    }
  }

  const healthy = mongoReady && redisReady;
  const payload = {
    status: healthy ? 'ok' : 'degraded',
    mongo: mongoReady ? 'connected' : 'disconnected',
    redis: redisReady ? 'connected' : 'disconnected',
  };

  res
    .status(healthy ? 200 : 503)
    .json(new ApiResponse(healthy ? 200 : 503, payload, healthy ? 'Server is healthy' : 'Dependency check failed'));
});

/**
 * GET /api/v1/health/seed-status
 * Returns the current seed data status for the night
 */
const getSeedStatus = asyncHandler(async (req, res) => {
  const { start, end, nightDate } = getNightRange(req.query?.nightDate);

  const eventCount = await Event.countDocuments({
    nightDate: { $gte: start, $lte: end },
  });
  const incidentCount = await Incident.countDocuments({
    nightDate: { $gte: start, $lte: end },
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        seeded: eventCount > 0,
        eventCount,
        incidentCount,
        nightDate,
      },
      'Seed status'
    )
  );
});

/**
 * GET /api/v1/health/full
 * Extended diagnostics for API, DBs, and overnight data readiness.
 */
const getFullHealth = asyncHandler(async (req, res) => {
  const { start, end, nightDate } = getNightRange(req.query?.nightDate);

  const mongoStateMap = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };

  const mongoReadyState = mongoose.connection.readyState;
  const redisClient = getRedis();
  const redisConnected = Boolean(redisClient && redisClient.status === "ready");

  let redisLatencyMs = null;
  if (redisClient) {
    try {
      const pingStart = Date.now();
      await redisClient.ping();
      redisLatencyMs = Date.now() - pingStart;
    } catch {
      redisLatencyMs = null;
    }
  }

  const [
    eventCount,
    incidentCount,
    eventsBySeverity,
    incidentsByStatus,
    incidentsBySeverity,
    eventsByWp,
    incidentsByWp,
  ] = await Promise.all([
    Event.countDocuments({ nightDate: { $gte: start, $lte: end } }),
    Incident.countDocuments({ nightDate: { $gte: start, $lte: end } }),
    Event.aggregate([
      { $match: { nightDate: { $gte: start, $lte: end } } },
      { $group: { _id: "$severity", count: { $sum: 1 } } },
      { $project: { _id: 0, key: { $ifNull: ["$_id", "unknown"] }, count: 1 } },
    ]),
    Incident.aggregate([
      { $match: { nightDate: { $gte: start, $lte: end } } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $project: { _id: 0, key: { $ifNull: ["$_id", "unknown"] }, count: 1 } },
    ]),
    Incident.aggregate([
      { $match: { nightDate: { $gte: start, $lte: end } } },
      { $group: { _id: { $ifNull: ["$severity", "uncertain"] }, count: { $sum: 1 } } },
      { $project: { _id: 0, key: { $ifNull: ["$_id", "unknown"] }, count: 1 } },
    ]),
    Event.aggregate([
      { $match: { nightDate: { $gte: start, $lte: end } } },
      { $group: { _id: "$projectContext.workPackageId", count: { $sum: 1 } } },
      { $project: { _id: 0, key: { $ifNull: ["$_id", "unknown"] }, count: 1 } },
    ]),
    Incident.aggregate([
      { $match: { nightDate: { $gte: start, $lte: end } } },
      { $group: { _id: "$projectContext.workPackageId", count: { $sum: 1 } } },
      { $project: { _id: 0, key: { $ifNull: ["$_id", "unknown"] }, count: 1 } },
    ]),
  ]);

  const toMap = (rows) =>
    rows.reduce((acc, row) => {
      acc[row.key] = row.count;
      return acc;
    }, {});

  const diagnostics = {
    service: {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      env: process.env.NODE_ENV || "development",
    },
    connections: {
      mongo: {
        readyState: mongoReadyState,
        status: mongoStateMap[mongoReadyState] || "unknown",
      },
      redis: {
        connected: redisConnected,
        status: redisClient?.status || "disconnected",
        latencyMs: redisLatencyMs,
      },
    },
    overnight: {
      nightDate,
      seeded: eventCount > 0,
      eventCount,
      incidentCount,
      eventsBySeverity: toMap(eventsBySeverity),
      incidentsByStatus: toMap(incidentsByStatus),
      incidentsBySeverity: toMap(incidentsBySeverity),
      eventsByWorkPackage: toMap(eventsByWp),
      incidentsByWorkPackage: toMap(incidentsByWp),
    },
  };

  res
    .status(200)
    .json(new ApiResponse(200, diagnostics, "Full health diagnostics"));
});

export { healthCheck, getSeedStatus, getFullHealth };
