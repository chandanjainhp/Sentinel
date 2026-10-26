import { Router } from "express";
import {
  getInvestigation,
  getInvestigationReports,
} from "../controllers/investigation.controller.js";
import { verifyJWT, scopeToUser } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  investigationIdSchema,
} from "../industrial/investigation.schema.js";

const router = Router();

router.use(verifyJWT);
router.use(scopeToUser);

router.get("/", getInvestigationReports);

router.get(
  "/:investigationId",
  validate(investigationIdSchema),
  getInvestigation
);

export default router;
