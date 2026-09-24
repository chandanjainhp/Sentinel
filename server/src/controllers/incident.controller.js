import { asyncHandler } from "../utils/async-handler.js";
import { ApiResponse } from "../utils/api-response.js";
import * as incidentService from "../services/incident.service.js";

export const getIncidents = asyncHandler(async (req, res) => {
  const incidents = await incidentService.getIncidents(req.query, req.userFilter);
  return res.status(200).json(new ApiResponse(200, incidents, "Incidents fetched successfully"));
});

export const getIncident = asyncHandler(async (req, res) => {
  const { incidentId } = req.params;
  const incident = await incidentService.getIncidentById(incidentId, req.userFilter);
  return res.status(200).json(new ApiResponse(200, incident, "Incident fetched successfully"));
});

export const updateIncidentStatus = asyncHandler(async (req, res) => {
  const { incidentId } = req.params;
  const { status } = req.body;
  const userId = req.user._id;

  const incident = await incidentService.updateIncidentStatus(incidentId, status, userId, req.userFilter);
  return res.status(200).json(new ApiResponse(200, incident, "Incident status updated successfully"));
});