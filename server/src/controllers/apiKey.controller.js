import ApiKey, {
  generateApiKeySecret,
  hashApiKeySecret,
  apiKeyPrefixFromSecret,
} from "../models/apiKey.model.js";
import { ApiResponse } from "../utils/api-response.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";

/**
 * Single API key per user.
 *   GET    /api/v1/settings/api-key  → metadata only (never the secret)
 *   POST   /api/v1/settings/api-key  → generate, replacing any existing key
 *   DELETE /api/v1/settings/api-key  → revoke (delete) the key
 */

export const getApiKeyMeta = asyncHandler(async (req, res) => {
  const key = await ApiKey.findOne({ userId: req.user._id }).select("-hashedSecret");

  return res.status(200).json(
    new ApiResponse(
      200,
      key ? key.toPublicJSON() : null,
      key ? "API key fetched successfully" : "No API key configured"
    )
  );
});

export const createApiKey = asyncHandler(async (req, res) => {
  const rawSecret = generateApiKeySecret();
  const keyPrefix = apiKeyPrefixFromSecret(rawSecret);
  const hashedSecret = hashApiKeySecret(rawSecret);

  // One key per user: replace any existing key.
  await ApiKey.findOneAndDelete({ userId: req.user._id });

  const key = await ApiKey.create({
    userId: req.user._id,
    keyPrefix,
    hashedSecret,
  });

  const responseData = {
    ...key.toPublicJSON(),
    secret: rawSecret,
  };

  return res.status(201).json(
    new ApiResponse(
      201,
      responseData,
      "API key created successfully. Store the secret now; it will not be shown again."
    )
  );
});

export const revokeApiKey = asyncHandler(async (req, res) => {
  const key = await ApiKey.findOneAndDelete({ userId: req.user._id });

  if (!key) {
    throw new ApiError(404, "No API key configured");
  }

  return res.status(200).json(
    new ApiResponse(200, null, "API key revoked successfully")
  );
});
