import { Router } from "express";
import {
  getMachinePredictions,
  getLatestPrediction,
  getPrediction,
} from "../controllers/prediction.controller.js";
import { verifyJWT, scopeToUser } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  machinePredictionsSchema,
  predictionIdSchema,
} from "../industrial/prediction.schema.js";

const router = Router();

router.use(verifyJWT);
router.use(scopeToUser);

router.get(
  "/machines/:machineId",
  validate(machinePredictionsSchema),
  getMachinePredictions
);

router.get(
  "/machines/:machineId/latest",
  validate(machinePredictionsSchema),
  getLatestPrediction
);

router.get(
  "/:predictionId",
  validate(predictionIdSchema),
  getPrediction
);

export default router;
