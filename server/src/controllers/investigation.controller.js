import {
  startInvestigation,
  getInvestigationById,
} from "../services/investigation.service.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";

export const startInvestigationController = asyncHandler(async (req, res) => {
  const { nightDate } = req.body;

  const result = await startInvestigation({
    userId: req.user._id,
    nightDate,
  });

  const statusCode = result.status === "no_incidents" ? 200 : 202;
  return res.status(statusCode).json(
    new ApiResponse(
      statusCode,
      result,
      result.status === "no_incidents"
        ? "No incidents recorded for this night."
        : `Investigation ${result.status} — ${result.totalJobs} incident(s) queued.`
    )
  );
});

export const getInvestigation = asyncHandler(async (req, res) => {
  const doc = await getInvestigationById(req.params.investigationId, req.userFilter);
  return res
    .status(200)
    .json(new ApiResponse(200, doc, "Investigation fetched successfully"));
});
