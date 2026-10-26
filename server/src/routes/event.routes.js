import { Router } from "express";
import {
  ingestEvent,
  getEvents,
  getEvent,
} from "../controllers/event.controller.js";
import { verifyJWT, scopeToUser } from "../middlewares/auth.middleware.js";
import { verifyApiKey } from "../middlewares/apiKey.middleware.js";
import { eventsLimiter } from "../middlewares/rateLimit.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { ingestEventSchema, getEventsSchema } from "../industrial/event.schema.js";

const router = Router();

/*
 * Sensor / gateway ingestion via API Key.
 * Rate limited per API key/user after authentication (the global limiter
 * deliberately skips this path — see app.js).
 */
router.post(
  "/",
  verifyApiKey,
  (req, res, next) => {
    if (req.is("application/json") !== "application/json") {
      return res.status(415).json({ success: false, message: "Content-Type must be application/json" });
    }
    next();
  },
  eventsLimiter,
  (req, res, next) => (req.siteKey ? next() : validate(ingestEventSchema)(req, res, next)),
  ingestEvent
);

/*
 * Human / customer read access via JWT
 */
router.get("/", verifyJWT, scopeToUser, validate(getEventsSchema), getEvents);

router.get("/:eventId", verifyJWT, scopeToUser, getEvent);

export default router;
