import { Router } from "express";
import {
  generateBriefing,
  listBriefings,
  getLatestBriefing,
  getBriefing,
  updateBriefingSection,
  approveBriefing,
} from "../controllers/briefing.controller.js";
import { verifyJWT, scopeToUser } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  generateBriefingSchema,
  latestBriefingSchema,
  listBriefingsSchema,
  briefingIdSchema,
  updateBriefingSectionSchema,
} from "../validations/briefing.validation.js";

const router = Router();

// Every briefing is private to its owner.
router.use(verifyJWT);
router.use(scopeToUser);

// Static paths before /:briefingId so "latest" is never parsed as an id.
router.get("/", validate(listBriefingsSchema), listBriefings);
router.get("/latest", validate(latestBriefingSchema), getLatestBriefing);
router.post("/generate", validate(generateBriefingSchema), generateBriefing);

router.get("/:briefingId", validate(briefingIdSchema), getBriefing);

router.patch(
  "/:briefingId/sections/:sectionName",
  validate(updateBriefingSectionSchema),
  updateBriefingSection,
);

router.post("/:briefingId/approve", validate(briefingIdSchema), approveBriefing);

export default router;
