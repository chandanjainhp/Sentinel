import ApiKey, {
  generateApiKeySecret,
  generateSiteApiKeySecret,
  hashApiKeySecret,
  apiKeyPrefixFromSecret,
} from "../models/apiKey.model.js";
import { ApiResponse } from "../utils/api-response.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";
import { Site } from "../models/site.model.js";
import { logAudit } from "../utils/audit.js";

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
  const now = new Date();
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
        siteId: k.siteId ? k.siteId.toString() : null,
        name: k.name || "Unnamed key",
        keyPrefix: k.keyPrefix,
        active: !k.revokedAt && !(k.expiresAt && k.expiresAt <= now),
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
        revokedAt: k.revokedAt,
        expiresAt: k.expiresAt,
      })),
      "API keys fetched successfully"
    )
  );
});

export const createNamedApiKey = asyncHandler(async (req, res) => {
  const name = req.validated?.body?.name;
  const siteId = req.validated?.body?.siteId;

  const count = await ApiKey.countDocuments({
    userId: req.user._id,
    revokedAt: null,
  });
  if (count >= MAX_KEYS_PER_USER) {
    throw new ApiError(
      400,
      `Key limit reached (${MAX_KEYS_PER_USER}). Revoke one before creating another.`
    );
  }

  let site = null;
  if (siteId) {
    site = await Site.findOne({ siteId, userId: req.user._id });
    if (!site) throw new ApiError(404, "Site not found");
  }
  const rawSecret = site ? generateSiteApiKeySecret() : generateApiKeySecret();
  const keyPrefix = apiKeyPrefixFromSecret(rawSecret);
  const hashedSecret = hashApiKeySecret(rawSecret);

  const key = await ApiKey.create({
    userId: req.user._id,
    siteId: site?._id || null,
    name,
    keyPrefix,
    hashedSecret,
  });

  await logAudit(req, "api_key.created", { type: "ApiKey", id: key._id }, {
    keyId: key.keyId,
    keyPrefix: key.keyPrefix,
    siteId: key.siteId ? key.siteId.toString() : null,
  });

  const responseData = {
    ...key.toPublicJSON(),
    active: true,
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

  const key = await ApiKey.findOneAndUpdate(
    { keyId, userId: req.user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
    { new: true }
  );

  if (!key) {
    throw new ApiError(404, "API key not found");
  }

  await logAudit(req, "api_key.revoked", { type: "ApiKey", id: key._id }, {
    keyId: key.keyId,
    keyPrefix: key.keyPrefix,
  });

  return res.status(200).json(
    new ApiResponse(200, null, "API key revoked successfully")
  );
});

export const rotateApiKey = asyncHandler(async (req, res) => {
  const key = await ApiKey.findOne({
    keyId: req.validated.params.keyId,
    userId: req.user._id,
  });
  if (!key) throw new ApiError(404, "API key not found");
  if (key.revokedAt) throw new ApiError(400, "API key is already revoked");

  // Revoke first so the old secret stops authenticating immediately, then
  // mint the replacement. If minting fails, restore the old key so the user
  // is not left without a working gateway credential.
  key.revokedAt = new Date();
  await key.save();

  let replacement;
  let secret;
  try {
    secret = key.siteId ? generateSiteApiKeySecret() : generateApiKeySecret();
    replacement = await ApiKey.create({
      userId: req.user._id,
      siteId: key.siteId || null,
      name: key.name,
      keyPrefix: apiKeyPrefixFromSecret(secret),
      hashedSecret: hashApiKeySecret(secret),
    });
  } catch (error) {
    key.revokedAt = null;
    await key.save().catch(() => {});
    throw error;
  }

  await logAudit(req, "api_key.rotated", { type: "ApiKey", id: key._id }, {
    oldKeyId: key.keyId,
    newKeyId: replacement.keyId,
    keyPrefix: replacement.keyPrefix,
  });

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { ...replacement.toPublicJSON(), active: true, secret },
        "API key rotated. Store the new secret now; the previous key is revoked."
      )
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
  const key = await ApiKey.findOne({ userId: req.user._id, revokedAt: null })
    .select("-hashedSecret")
    .sort({ createdAt: -1 });

  return res.status(200).json(
    new ApiResponse(
      200,
      key ? { ...key.toPublicJSON(), active: true } : null,
      key ? "API key fetched successfully" : "No API key configured"
    )
  );
});

export const createApiKey = asyncHandler(async (req, res) => {
  // Legacy single-key surface: replaces the user's non-site keys. Site-scoped
  // keys created through the named-key endpoint are left untouched so the old
  // sensors page cannot silently revoke a production gateway key.
  await ApiKey.deleteMany({ userId: req.user._id, siteId: null });

  const rawSecret = generateApiKeySecret();
  const keyPrefix = apiKeyPrefixFromSecret(rawSecret);
  const hashedSecret = hashApiKeySecret(rawSecret);

  const key = await ApiKey.create({
    userId: req.user._id,
    name: "Default key",
    keyPrefix,
    hashedSecret,
  });

  await logAudit(req, "api_key.created", { type: "ApiKey", id: key._id }, {
    keyId: key.keyId,
    keyPrefix: key.keyPrefix,
    legacy: true,
  });

  const responseData = {
    ...key.toPublicJSON(),
    active: true,
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

  await logAudit(req, "api_key.revoked", { type: "ApiKey", id: key._id }, {
    keyId: key.keyId,
    keyPrefix: key.keyPrefix,
    legacy: true,
  });

  return res.status(200).json(
    new ApiResponse(200, null, "API key revoked successfully")
  );
});
