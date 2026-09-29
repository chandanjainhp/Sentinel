import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { getDashboardSummary } from "../services/dashboard.service.js";

export const getDashboard = asyncHandler(async (req, res) => {
  const summary = await getDashboardSummary(req.userFilter);
  return res
    .status(200)
    .json(new ApiResponse(200, summary, "Dashboard summary fetched successfully"));
});
