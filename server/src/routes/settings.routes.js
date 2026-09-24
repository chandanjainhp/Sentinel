import { Router } from "express";
import {
  getApiKeyMeta,
  createApiKey,
  revokeApiKey,
} from "../controllers/apiKey.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyJWT);

// Single API key per user
router.get("/api-key", getApiKeyMeta);
router.post("/api-key", createApiKey);
router.delete("/api-key", revokeApiKey);

export default router;
