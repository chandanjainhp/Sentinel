import ApiKey, { hashApiKeySecret } from "../models/apiKey.model.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";

export const verifyApiKey = asyncHandler(async (req, _res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    throw new ApiError(401, "API key is required");
  }

  const rawKey = authorization.slice(7).trim();
  if (!rawKey) {
    throw new ApiError(401, "API key is required");
  }

  const hashedSecret = hashApiKeySecret(rawKey);

  // One key per user; existence of the document means the key is valid
  // (revocation deletes the document).
  const apiKey = await ApiKey.findOne({ hashedSecret });

  if (!apiKey) {
    throw new ApiError(401, "Invalid API key");
  }

  apiKey.lastUsedAt = new Date();
  await apiKey.save();

  req.apiKey = apiKey;
  req.userFilter = { userId: apiKey.userId };

  next();
});