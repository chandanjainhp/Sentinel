import { asyncHandler } from "../utils/async-handler.js";
import { ApiResponse } from "../utils/api-response.js";
import { logAudit } from "../utils/audit.js";
import {
  getIncidentConfiguration,
  getIncidentConfigurationStatus,
  saveIncidentConfiguration,
  validateIncidentConfiguration,
} from "../services/incident-configuration.service.js";

/**
 * Automated monitoring configuration for the authenticated user's site.
 *
 *   GET  /api/v1/settings/incident-configuration
 *   PUT  /api/v1/settings/incident-configuration
 *   POST /api/v1/settings/incident-configuration/validate
 *   GET  /api/v1/settings/incident-configuration/status
 */

export const getConfiguration = asyncHandler(async (req, res) => {
  const result = await getIncidentConfiguration(
    req.user._id,
    req.validated?.query?.siteId
  );
  return res
    .status(200)
    .json(new ApiResponse(200, result, "Incident configuration fetched"));
});

export const updateConfiguration = asyncHandler(async (req, res) => {
  const result = await saveIncidentConfiguration({
    userId: req.user._id,
    input: req.validated.body,
  });
  await logAudit(
    req,
    "incident_configuration.updated",
    { type: "IncidentConfiguration", id: result.configuration.id },
    {
      siteId: result.configuration.siteId,
      enabled: result.configuration.enabled,
      timezone: result.configuration.timezone,
      startTime: result.configuration.startTime,
      endTime: result.configuration.endTime,
    }
  );
  return res
    .status(200)
    .json(new ApiResponse(200, result, "Incident configuration saved"));
});

export const validateConfiguration = asyncHandler(async (req, res) => {
  const result = await validateIncidentConfiguration({
    userId: req.user._id,
    input: req.validated.body,
  });
  return res
    .status(200)
    .json(new ApiResponse(200, result, "Incident configuration is valid"));
});

export const getConfigurationStatus = asyncHandler(async (req, res) => {
  const result = await getIncidentConfigurationStatus(
    req.user._id,
    req.validated?.query?.siteId
  );
  return res
    .status(200)
    .json(new ApiResponse(200, result, "Incident configuration status fetched"));
});
