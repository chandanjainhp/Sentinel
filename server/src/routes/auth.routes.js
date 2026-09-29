import { Router } from "express";
import {
  changeCurrentPassword,
  forgotPasswordRequest,
  getCurrentUser,
  googleAuth,
  login,
  logoutUser,
  refreshAccessToken,
  registerUser,
  resendEmailVerification,
  resetForgotPassword,
  verifyEmail,
} from "../controllers/auth.controller.js";
import { authLimiter } from "../middlewares/rateLimit.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// Unsecured routes
router.post("/register", registerUser);
router.post("/login", authLimiter, login);
// Google Identity Services: the GIS client posts the ID token here; the
// backend verifies it against GOOGLE_CLIENT_ID before issuing session cookies.
router.post("/google", authLimiter, googleAuth);
router.post("/verify-email", verifyEmail);
router.post("/refresh-token", refreshAccessToken);
router.post("/forgot-password", forgotPasswordRequest);
router.post("/reset-password", resetForgotPassword);

// Secure routes
router.post("/logout", verifyJWT, logoutUser);
router.get("/current-user", verifyJWT, getCurrentUser);
router.post("/change-password", verifyJWT, changeCurrentPassword);
router.post("/resend-email-verification", verifyJWT, resendEmailVerification);

export default router;
