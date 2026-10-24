import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { getCurrentRun, getRunHistory } from "../services/overnight-health.service.js";

export const getCurrentOvernightRun = asyncHandler(async (req, res) => {
  const run = await getCurrentRun(req.query.siteId || req.user.siteId, req.user._id);
  res.json(new ApiResponse(200, run, "Overnight Health Checker status"));
});

export const getOvernightRunHistory = asyncHandler(async (req, res) => {
  const runs = await getRunHistory(req.user._id, req.query.siteId, req.query.limit);
  res.json(new ApiResponse(200, runs, "Overnight Health Checker history"));
});
