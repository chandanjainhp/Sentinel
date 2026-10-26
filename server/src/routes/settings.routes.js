import { Router } from "express";
import {
  listApiKeys,
  createNamedApiKey,
  revokeApiKeyByKeyId,
  renameApiKey,
  getApiKeyMeta,
  createApiKey,
  revokeApiKey,
  rotateApiKey,
} from "../controllers/apiKey.controller.js";
import {
  getConfiguration,
  updateConfiguration,
  validateConfiguration,
  getConfigurationStatus,
} from "../controllers/incident-configuration.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  createApiKeySchema,
  apiKeyIdSchema,
  renameApiKeySchema,
  rotateApiKeySchema,
} from "../industrial/apiKey.schema.js";
import {
  getIncidentConfigurationSchema,
  updateIncidentConfigurationSchema,
  validateIncidentConfigurationSchema,
  getIncidentConfigurationStatusSchema,
} from "../industrial/incidentConfiguration.schema.js";

const router = Router();

router.use(verifyJWT);

// Automated monitoring configuration (persisted, used by the scheduler)
router.get(
  "/incident-configuration",
  validate(getIncidentConfigurationSchema),
  getConfiguration
);
router.put(
  "/incident-configuration",
  validate(updateIncidentConfigurationSchema),
  updateConfiguration
);
router.post(
  "/incident-configuration/validate",
  validate(validateIncidentConfigurationSchema),
  validateConfiguration
);
router.get(
  "/incident-configuration/status",
  validate(getIncidentConfigurationStatusSchema),
  getConfigurationStatus
);

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
router.post("/api-keys/:keyId/rotate", validate(rotateApiKeySchema), rotateApiKey);

// Legacy single-key surface (kept for existing gateways/clients)
router.get("/api-key", getApiKeyMeta);
router.post("/api-key", createApiKey);
router.delete("/api-key", revokeApiKey);

export default router;
