import { Router } from "express";
import {
  listApiKeys,
  createNamedApiKey,
  revokeApiKeyByKeyId,
  renameApiKey,
  getApiKeyMeta,
  createApiKey,
  revokeApiKey,
} from "../controllers/apiKey.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  createApiKeySchema,
  apiKeyIdSchema,
  renameApiKeySchema,
} from "../industrial/apiKey.schema.js";

const router = Router();

router.use(verifyJWT);

// Named API keys (multi-key)
router.get("/api-keys", listApiKeys);
router.post("/api-keys", validate(createApiKeySchema), createNamedApiKey);
router.delete(
  "/api-keys/:keyId",
  validate(apiKeyIdSchema),
  revokeApiKeyByKeyId
);
router.put(
  "/api-keys/:keyId",
  validate(renameApiKeySchema),
  renameApiKey
);

// Legacy single-key surface (kept for existing gateways/clients)
router.get("/api-key", getApiKeyMeta);
router.post("/api-key", createApiKey);
router.delete("/api-key", revokeApiKey);

export default router;
