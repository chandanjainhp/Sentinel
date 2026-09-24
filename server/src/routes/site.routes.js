import { Router } from "express";
import {
  createSite,
  getSites,
  getSite,
  updateSite,
  deleteSite,
} from "../controllers/site.controller.js";
import { verifyJWT, scopeToUser } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  createSiteSchema,
  siteIdSchema,
  updateSiteSchema,
} from "../industrial/site.schema.js";

const router = Router();

router.use(verifyJWT);
router.use(scopeToUser);

router.post("/", validate(createSiteSchema), createSite);

router.get("/", getSites);

router.get("/:siteId", validate(siteIdSchema), getSite);

router.patch("/:siteId", validate(updateSiteSchema), updateSite);

router.delete("/:siteId", validate(siteIdSchema), deleteSite);

export default router;
