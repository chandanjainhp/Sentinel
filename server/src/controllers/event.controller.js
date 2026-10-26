import { asyncHandler } from "../utils/async-handler.js";
import { ApiResponse } from "../utils/api-response.js";
import * as eventService from "../services/event.service.js";
import { recordEventIngestion } from "../utils/metrics.js";
import { ingestSiteEvent } from "../services/site-ingest.service.js";

export const ingestEvent = asyncHandler(async (req, res) => {
  if (req.siteKey) {
    const payloads = Array.isArray(req.body) ? req.body : [req.body];
    const results = [];
    for (const payload of payloads) {
      try {
        results.push({ ok: true, ...(await ingestSiteEvent({ apiKey: req.apiKey, apiSiteId: req.apiSiteId, body: payload })) });
      } catch (error) {
        if (!Array.isArray(req.body)) throw error;
        results.push({ ok: false, status: error.statusCode || 500, error: error.message });
      }
    }
    const failed = results.filter((item) => !item.ok);
    const status = Array.isArray(req.body)
      ? (failed.length && failed.length === results.length ? 422 : 201)
      : (results[0].duplicate ? 200 : 201);
    return res.status(status).json(new ApiResponse(status, Array.isArray(req.body) ? results : results[0], "Events processed"));
  }
  const { siteId, machineId, sensorId, type, timestamp, values, rawData, source } = req.body;
  const idempotencyHeader = req.get("Idempotency-Key");

  const result = await eventService.ingestEvent({
    userId: req.apiKey.userId,
    siteIdParam: siteId,
    machineIdParam: machineId,
    sensorIdParam: sensorId,
    type,
    timestamp,
    values,
    rawData,
    source,
    idempotencyHeader,
  });

  // Record event ingestion metrics
  recordEventIngestion('received');
  if (result.isDuplicate) {
    recordEventIngestion('skipped');
  } else {
    recordEventIngestion('processed');
  }

  const statusCode = result.isDuplicate ? 200 : 201;
  const message = result.isDuplicate ? "Event already processed" : "Event ingested successfully";

  return res.status(statusCode).json(new ApiResponse(statusCode, result.event, message));
});

export const getEvents = asyncHandler(async (req, res) => {
  const events = await eventService.getEvents(req.query, req.userFilter);
  return res.status(200).json(new ApiResponse(200, events, "Events fetched successfully"));
});

export const getEvent = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const event = await eventService.getEventById(eventId, req.userFilter);
  return res.status(200).json(new ApiResponse(200, event, "Event fetched successfully"));
});