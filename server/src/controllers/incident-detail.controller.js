import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { getIncidentDetail } from "../services/incident-detail.service.js";

/**
 * GET /api/v1/incidents/:incidentId/detail
 *
 * One aggregation for the incident detail page: incident + machine link +
 * site, the triggering sensor event JSON and the prediction JSON that caused
 * it, and one deterministic next-action sentence. 404s on another user's
 * incident exactly like the plain incident read.
 */
export const getIncidentDetailController = asyncHandler(async (req, res) => {
  const detail = await getIncidentDetail(req.params.incidentId, req.userFilter);
  return res
    .status(200)
    .json(new ApiResponse(200, detail, "Incident detail fetched successfully"));
});
