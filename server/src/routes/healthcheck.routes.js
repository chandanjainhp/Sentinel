import {Router} from "express";
import {healthCheck, getSeedStatus, getFullHealth} from "../controllers/healthcheck.controller.js";

const router = Router();

router.route("/").get(healthCheck);
router.route("/seed-status").get(getSeedStatus);
router.route("/full").get(getFullHealth);

export default router;
