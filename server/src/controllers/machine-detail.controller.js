import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { getMachineDetail } from "../services/machine-detail.service.js";

/**
 * GET /api/v1/machines/:machineId/detail
 *
 * Single aggregation for the machine signature page: machine + site
 * breadcrumb, latest prediction, per-sensor trend series (from real events),
 * prediction history and open incidents. 404s on another user's machine.
 */
export const getMachineDetailController = asyncHandler(async (req, res) => {
  const detail = await getMachineDetail(req.params.machineId, req.userFilter);
  return res
    .status(200)
    .json(new ApiResponse(200, detail, "Machine detail fetched successfully"));
});
