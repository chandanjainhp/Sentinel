import { asyncHandler } from "../utils/async-handler.js";
import { ApiResponse } from "../utils/api-response.js";
import * as briefingService from "../services/briefing.service.js";

export const generateBriefing = asyncHandler(async (req, res) => {
  const { briefing, created } = await briefingService.generateBriefing({
    userId: req.user._id,
    nightDate: req.body.nightDate,
  });

  const statusCode = created ? 201 : 200;
  return res
    .status(statusCode)
    .json(
      new ApiResponse(
        statusCode,
        briefing,
        created
          ? "Briefing generated"
          : "A briefing for this night already exists",
      ),
    );
});

export const listBriefings = asyncHandler(async (req, res) => {
  const briefings = await briefingService.listBriefings(req.validated.query, req.userFilter);
  return res
    .status(200)
    .json(new ApiResponse(200, briefings, "Briefings fetched successfully"));
});

// A night with no briefing is a normal empty state, not a 404: the page asks
// for "the latest" before anything has been generated.
export const getLatestBriefing = asyncHandler(async (req, res) => {
  const briefing = await briefingService.getLatestBriefing({
    userId: req.user._id,
    nightDate: req.validated.query.nightDate,
  });
  return res
    .status(200)
    .json(new ApiResponse(200, briefing, briefing ? "Briefing fetched successfully" : "No briefing yet"));
});

export const getBriefing = asyncHandler(async (req, res) => {
  const briefing = await briefingService.getBriefingById(
    req.params.briefingId,
    req.userFilter,
  );
  return res
    .status(200)
    .json(new ApiResponse(200, briefing, "Briefing fetched successfully"));
});

export const updateBriefingSection = asyncHandler(async (req, res) => {
  const briefing = await briefingService.updateBriefingSection({
    briefingId: req.params.briefingId,
    sectionName: req.params.sectionName,
    content: req.body.content,
    userFilter: req.userFilter,
  });
  return res
    .status(200)
    .json(new ApiResponse(200, briefing, "Briefing section updated successfully"));
});

export const approveBriefing = asyncHandler(async (req, res) => {
  const briefing = await briefingService.approveBriefing({
    briefingId: req.params.briefingId,
    userId: req.user._id,
    userFilter: req.userFilter,
  });
  return res
    .status(200)
    .json(new ApiResponse(200, briefing, "Briefing approved successfully"));
});
