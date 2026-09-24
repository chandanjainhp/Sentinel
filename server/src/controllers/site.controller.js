import { asyncHandler } from "../utils/async-handler.js";
import { ApiResponse } from "../utils/api-response.js";
import * as siteService from "../services/site.service.js";

export const createSite = asyncHandler(async (req, res) => {
  const { name, description, industry, timezone, coordinates } = req.body;
  const userId = req.user._id;

  const site = await siteService.createSite({
    userId,
    name,
    description,
    industry,
    timezone,
    coordinates,
  });

  return res.status(201).json(new ApiResponse(201, site, "Site created successfully"));
});

export const getSites = asyncHandler(async (req, res) => {
  const sites = await siteService.getSites(req.userFilter);
  return res.status(200).json(new ApiResponse(200, sites, "Sites fetched successfully"));
});

export const getSite = asyncHandler(async (req, res) => {
  const { siteId } = req.params;
  const site = await siteService.getSiteById(siteId, req.userFilter);
  return res.status(200).json(new ApiResponse(200, site, "Site fetched successfully"));
});

export const updateSite = asyncHandler(async (req, res) => {
  const { siteId } = req.params;
  const site = await siteService.updateSite(siteId, req.body, req.userFilter);
  return res.status(200).json(new ApiResponse(200, site, "Site updated successfully"));
});

export const deleteSite = asyncHandler(async (req, res) => {
  const { siteId } = req.params;
  await siteService.deleteSite(siteId, req.userFilter);
  return res.status(200).json(new ApiResponse(200, null, "Site deleted successfully"));
});