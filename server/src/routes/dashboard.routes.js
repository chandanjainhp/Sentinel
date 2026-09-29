import { Router } from "express";
import { getDashboard } from "../controllers/dashboard.controller.js";
import { verifyJWT, scopeToUser } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyJWT);
router.use(scopeToUser);

router.get("/", getDashboard);

export default router;
