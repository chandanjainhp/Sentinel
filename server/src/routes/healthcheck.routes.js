import {Router} from "express";
import {healthCheck, getFullHealth} from "../controllers/healthcheck.controller.js";

const router = Router();

router.route("/").get(healthCheck);
router.route("/full").get(getFullHealth);

export default router;
