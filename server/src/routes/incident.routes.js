import { Router } from "express";
import {
  getIncidents,
  getIncident,
  getIncidentGraph,
  explainIncident,
  updateIncidentStatus,
} from "../controllers/incident.controller.js";
import { verifyJWT, scopeToUser } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { getLimiter } from "../middlewares/rateLimit.middleware.js";
import {
  getIncidentsSchema,
  incidentIdSchema,
  incidentExplainSchema,
  updateIncidentStatusSchema,
} from "../industrial/incident.schema.js";

const router = Router();

router.use(verifyJWT);
router.use(scopeToUser);

router.get(
  "/",
  validate(getIncidentsSchema),
  getIncidents
);

router.get(
  "/:incidentId",
  validate(incidentIdSchema),
  getIncident
);

// Agent tool evidence chain + final classification for the detail page.
router.get(
  "/:incidentId/graph",
  validate(incidentIdSchema),
  getIncidentGraph
);

router.patch(
  "/:incidentId/status",
  validate(updateIncidentStatusSchema),
  updateIncidentStatus
);

// User-initiated Argus re-explanation. Rate-limited: each LLM call costs real
// provider tokens. Skipped in NODE_ENV=test for deterministic suites.
router.post(
  "/:incidentId/explain",
  (req, res, next) =>
    process.env.NODE_ENV === "test"
      ? next()
      : getLimiter("incidents-explain", 10 * 60 * 1000, 10, "incidents-explain")(req, res, next),
  validate(incidentExplainSchema),
  explainIncident
);

export default router;
