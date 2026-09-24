import { Router } from "express";
import {
  ingestEvent,
  getEvents,
  getEvent,
} from "../controllers/event.controller.js";
import { verifyJWT, scopeToUser } from "../middlewares/auth.middleware.js";
import { verifyApiKey } from "../middlewares/apiKey.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { ingestEventSchema } from "../industrial/event.schema.js";

const router = Router();

/*
 * Sensor / gateway ingestion via API Key
 */
router.post(
  "/",
  verifyApiKey,
  validate(ingestEventSchema),
  ingestEvent
);

/*
 * Human / customer read access via JWT
 */
router.get("/", verifyJWT, scopeToUser, getEvents);

router.get("/:eventId", verifyJWT, scopeToUser, getEvent);

export default router;
