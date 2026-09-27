import { Router } from "express";
import {
  startInvestigationController,
  getInvestigation,
} from "../controllers/investigation.controller.js";
import { verifyJWT, scopeToUser } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  startInvestigationSchema,
  investigationIdSchema,
} from "../industrial/investigation.schema.js";

const router = Router();

router.use(verifyJWT);
router.use(scopeToUser);

router.post(
  "/start",
  validate(startInvestigationSchema),
  startInvestigationController
);

router.get(
  "/:investigationId",
  validate(investigationIdSchema),
  getInvestigation
);

export default router;
