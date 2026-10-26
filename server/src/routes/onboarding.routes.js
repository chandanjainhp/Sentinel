import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { createOnboardingSchema } from "../industrial/onboarding.schema.js";
import { createOnboardingController } from "../controllers/onboarding.controller.js";

const router = Router();
router.use(verifyJWT);
router.post("/", validate(createOnboardingSchema), createOnboardingController);
export default router;
