/**
 * TEST ROUTES — development only
 * Gated by the NODE_ENV check in app.js.
 *
 * Post-single-user pivot this file no longer hosts the overnight
 * Work-Package/briefing seed harness (that pipeline is deferred). What
 * remains is a minimal smoke-testing helper for ingestion, which honors
 * the single-user scoping rules: the created event belongs to the
 * authenticated user.
 */

import express from 'express';
import { authenticateRequest } from '../middlewares/auth.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ApiError } from '../utils/api-error.js';
import { ApiResponse } from '../utils/api-response.js';
import { Sensor } from '../models/sensor.model.js';

const router = express.Router();
router.use(authenticateRequest);

/* ── POST /test/seed-sensor-event ─────────────────────── */
/**
 * Seed a single sensor_reading event for the authenticated user's sensor.
 * Body: { sensorId (public string id), value?, timestamp? }
 * Runs the same ingestEvent path as the public API (prediction queue is fed).
 */
router.post('/seed-sensor-event', asyncHandler(async (req, res) => {
  const { sensorId, value = 42, timestamp = new Date().toISOString() } = req.body ?? {};

  if (!sensorId) throw new ApiError(400, 'sensorId is required');

  const sensor = await Sensor.findOne({
    userId: req.user._id,
    $or: [{ sensorId }, { _id: sensorId }],
  });

  if (!sensor) throw new ApiError(404, 'Sensor not found for this user');

  const { ingestEvent } = await import('../services/event.service.js');

  const { event, isDuplicate } = await ingestEvent({
    userId: req.user._id,
    siteIdParam: String(sensor.siteId),
    machineIdParam: String(sensor.machineId),
    sensorIdParam: sensor.sensorId,
    type: 'sensor_reading',
    timestamp,
    values: { [sensor.type || 'vibration']: Number(value) },
    rawData: { source: 'test-api' },
    source: 'api',
    idempotencyHeader: null,
  });

  return res.status(isDuplicate ? 200 : 201).json(
    new ApiResponse(
      isDuplicate ? 200 : 201,
      {
        eventId: event._id,
        duplicate: isDuplicate,
        sensorId: sensor.sensorId,
      },
      isDuplicate ? 'Duplicate event (idempotent)' : 'Test event ingested'
    )
  );
}));

export default router;
