import { Site } from "../models/site.model.js";
import { ApiError } from "../utils/api-error.js";
import { syncConfigurationFromSite } from "./incident-configuration.service.js";
import mongoose from "mongoose";

const buildSiteQuery = (siteId, userFilter = {}) => {
  const isObjectId = mongoose.Types.ObjectId.isValid(siteId);
  if (isObjectId) {
    return {
      ...userFilter,
      $or: [{ siteId }, { _id: siteId }],
    };
  }
  return {
    ...userFilter,
    siteId,
  };
};

export const createSite = async ({ userId, name, description, industry, timezone, coordinates }) => {
  const site = await Site.create({
    userId,
    accountId: userId,
    name,
    nameNormalized: name?.trim().replace(/\s+/g, " ").toLowerCase(),
    description: description || "",
    industry: industry || "",
    timezone: timezone || "UTC",
    coordinates: coordinates || null,
    status: "active",
  });
  return site;
};

export const getSites = async (userFilter = {}) => {
  return Site.find(userFilter).sort({ createdAt: -1 });
};

export const getSiteById = async (siteId, userFilter = {}) => {
  const query = buildSiteQuery(siteId, userFilter);
  const site = await Site.findOne(query);
  if (!site) {
    throw new ApiError(404, "Site not found");
  }
  return site;
};

export const updateSite = async (siteId, updateData, userFilter = {}) => {
  if (
    updateData.monitoringStartTime !== undefined &&
    updateData.monitoringEndTime !== undefined &&
    updateData.monitoringStartTime === updateData.monitoringEndTime
  ) {
    throw new ApiError(400, "monitoringStartTime and monitoringEndTime must differ");
  }
  const query = buildSiteQuery(siteId, userFilter);
  const site = await Site.findOneAndUpdate(query, { $set: updateData }, { new: true, runValidators: true });
  if (!site) {
    throw new ApiError(404, "Site not found");
  }
  // A persisted incident configuration is the scheduler's source of truth;
  // keep it aligned with the legacy site fields the settings UI edits.
  if (userFilter?.userId) {
    await syncConfigurationFromSite(userFilter.userId, site, updateData);
  }
  return site;
};

export const deleteSite = async (siteId, userFilter = {}) => {
  const query = buildSiteQuery(siteId, userFilter);
  const site = await Site.findOneAndDelete(query);
  if (!site) {
    throw new ApiError(404, "Site not found");
  }
  return site;
};
