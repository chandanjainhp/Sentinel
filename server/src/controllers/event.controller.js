import { asyncHandler } from "../utils/async-handler.js";
import { ApiResponse } from "../utils/api-response.js";
import * as eventService from "../services/event.service.js";

export const ingestEvent = asyncHandler(async (req, res) => {
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