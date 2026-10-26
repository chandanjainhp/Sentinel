import ApiKey, { hashApiKeySecret } from "../models/apiKey.model.js";
import crypto from "node:crypto";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";
import { Site } from "../models/site.model.js";

export const verifyApiKey = asyncHandler(async (req, _res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    throw new ApiError(401, "API key is required");
  }

  const rawKey = authorization.slice(7).trim();
  if (!rawKey) {
    throw new ApiError(401, "API key is required");
  }

  if (!/^sk_(?:live_)?[A-Za-z0-9_-]{8,100}$/.test(rawKey)) {
    throw new ApiError(401, "Invalid API key");
  }

  const hashedSecret = hashApiKeySecret(rawKey);

  // One key per user; existence of the document means the key is valid
  // (revocation deletes the document).
  const apiKey = await ApiKey.findOne({ hashedSecret });

  if (!apiKey) {
    throw new ApiError(401, "Invalid API key");
  }
  const expected = Buffer.from(apiKey.hashedSecret, "utf8");
  const actual = Buffer.from(hashedSecret, "utf8");
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new ApiError(401, "Invalid API key");
  }

  if (apiKey.revokedAt || (apiKey.expiresAt && apiKey.expiresAt <= new Date())) {
    throw new ApiError(apiKey.expiresAt && apiKey.expiresAt <= new Date() ? 403 : 401, "API key is not active");
  }
  if (apiKey.siteId) {
    const site = await Site.findById(apiKey.siteId).select("status siteId");
    if (!site || site.status !== "active") throw new ApiError(403, "Site is disabled");
    req.siteKey = true;
    req.site = site;
    req.apiSiteId = site.siteId;
  }
  apiKey.lastUsedAt = new Date();
  await apiKey.save();

  req.apiKey = apiKey;
  req.userFilter = { userId: apiKey.userId };

  next();
});