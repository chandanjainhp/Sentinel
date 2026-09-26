import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import mongoose from "mongoose";
import { getRedis } from "../db/redis.js";

/**
 * Health endpoints.
 *
 * The former "overnight diagnostics" (seed-status, and the overnight block in
 * /full) queried a `nightDate` field that neither the Event nor the Incident
 * model has — every count was a constant zero dressed up as a health signal.
 * Removed rather than rebuilt; /health/full now reports exactly what it can
 * honestly measure: service identity and dependency connectivity/latency.
 */

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
 * GET /api/v1/health/full
 * Extended diagnostics: service identity + dependency connectivity and
 * latency. No data-level statistics — those live in real feature endpoints.
 */
const getFullHealth = asyncHandler(async (req, res) => {
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
  };

  res
    .status(200)
    .json(new ApiResponse(200, diagnostics, "Full health diagnostics"));
});

export { healthCheck, getFullHealth };
