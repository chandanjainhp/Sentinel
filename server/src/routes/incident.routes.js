import { Router } from "express";
import {
  getIncidents,
  getIncident,
  updateIncidentStatus,
} from "../controllers/incident.controller.js";
import { verifyJWT, scopeToUser } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  getIncidentsSchema,
  incidentIdSchema,
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

router.patch(
  "/:incidentId/status",
  validate(updateIncidentStatusSchema),
  updateIncidentStatus
);

export default router;
