import { Router } from "express";
import { verifyJWT, scopeToUser } from "../middlewares/auth.middleware.js";
import {
  getCurrentOvernightRun,
  getOvernightRunHistory,
  getOvernightReport,
} from "../controllers/overnight-health.controller.js";

const router = Router();
router.use(verifyJWT, scopeToUser);
router.get("/current", getCurrentOvernightRun);
router.get("/history", getOvernightRunHistory);
router.get("/reports/:reportingDate", getOvernightReport);
export default router;
