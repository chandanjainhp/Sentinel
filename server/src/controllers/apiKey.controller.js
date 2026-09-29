import ApiKey, {
  generateApiKeySecret,
  hashApiKeySecret,
  apiKeyPrefixFromSecret,
} from "../models/apiKey.model.js";
import { ApiResponse } from "../utils/api-response.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";

/**
 * Named API keys. A user may hold several (one per gateway, say); the raw
 * secret exists only in the create response and is never stored in plaintext.
 *   GET    /api/v1/settings/api-keys       → list (metadata only, never secrets)
 *   POST   /api/v1/settings/api-keys       → create named key; secret shown once
 *   DELETE /api/v1/settings/api-keys/:keyId → revoke (delete) one key
 *   PUT    /api/v1/settings/api-keys/:keyId → rename without rotating the secret
 *
 * Legacy single-key endpoints (GET/POST/DELETE /api/v1/settings/api-key) are
 * kept working for existing gateways and the sensors page.
 */

const MAX_KEYS_PER_USER = 10;

export const listApiKeys = asyncHandler(async (req, res) => {
  const keys = await ApiKey.find({ userId: req.user._id })
    .select("-hashedSecret")
    .sort({ createdAt: -1 })
    .lean();

  return res.status(200).json(
    new ApiResponse(
      200,
      keys.map((k) => ({
        keyId: k.keyId,
        id: k._id.toString(),
        userId: k.userId.toString(),
        name: k.name || "Unnamed key",
        keyPrefix: k.keyPrefix,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
      })),
      "API keys fetched successfully"
    )
  );
});

export const createNamedApiKey = asyncHandler(async (req, res) => {
  const name = req.validated?.body?.name;

  const count = await ApiKey.countDocuments({ userId: req.user._id });
  if (count >= MAX_KEYS_PER_USER) {
    throw new ApiError(
      400,
      `Key limit reached (${MAX_KEYS_PER_USER}). Revoke one before creating another.`
    );
  }

  const rawSecret = generateApiKeySecret();
  const keyPrefix = apiKeyPrefixFromSecret(rawSecret);
  const hashedSecret = hashApiKeySecret(rawSecret);

  const key = await ApiKey.create({
    userId: req.user._id,
    name,
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
      "API key created. Store the secret now; it will not be shown again."
    )
  );
});

export const revokeApiKeyByKeyId = asyncHandler(async (req, res) => {
  const keyId = req.validated?.params?.keyId;

  const key = await ApiKey.findOneAndDelete({
    keyId,
    userId: req.user._id,
  });

  if (!key) {
    throw new ApiError(404, "API key not found");
  }

  return res.status(200).json(
    new ApiResponse(200, null, "API key revoked successfully")
  );
});

export const renameApiKey = asyncHandler(async (req, res) => {
  const keyId = req.validated?.params?.keyId;
  const name = req.validated?.body?.name;

  const key = await ApiKey.findOneAndUpdate(
    { keyId, userId: req.user._id },
    { name },
    { new: true }
  ).select("-hashedSecret");

  if (!key) {
    throw new ApiError(404, "API key not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, key.toPublicJSON(), "API key renamed"));
});

/* ── Legacy single-key handlers (kept for existing clients) ── */

export const getApiKeyMeta = asyncHandler(async (req, res) => {
  const key = await ApiKey.findOne({ userId: req.user._id })
    .select("-hashedSecret")
    .sort({ createdAt: -1 });

  return res.status(200).json(
    new ApiResponse(
      200,
      key ? key.toPublicJSON() : null,
      key ? "API key fetched successfully" : "No API key configured"
    )
  );
});

export const createApiKey = asyncHandler(async (req, res) => {
  const count = await ApiKey.countDocuments({ userId: req.user._id });
  if (count >= MAX_KEYS_PER_USER) {
    throw new ApiError(
      400,
      `Key limit reached (${MAX_KEYS_PER_USER}). Revoke one before creating another.`
    );
  }

  const rawSecret = generateApiKeySecret();
  const keyPrefix = apiKeyPrefixFromSecret(rawSecret);
  const hashedSecret = hashApiKeySecret(rawSecret);

  const key = await ApiKey.create({
    userId: req.user._id,
    name: "Default key",
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
  const key = await ApiKey.findOneAndDelete({ userId: req.user._id }).sort({
    createdAt: -1,
  });

  if (!key) {
    throw new ApiError(404, "No API key configured");
  }

  return res.status(200).json(
    new ApiResponse(200, null, "API key revoked successfully")
  );
});
