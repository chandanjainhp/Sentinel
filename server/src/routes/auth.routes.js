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
import { authLimiter, passwordResetLimiter, emailVerificationLimiter } from "../middlewares/rateLimit.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  registerSchema,
  loginSchema,
  googleAuthSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  refreshTokenSchema,
} from "../validations/auth.validation.js";

const router = Router();

// Unsecured routes
router.post("/register", validate(registerSchema), registerUser);
router.post("/login", authLimiter, validate(loginSchema), login);
// Google Identity Services: the GIS client posts the ID token here; the
// backend verifies it against GOOGLE_CLIENT_ID before issuing session cookies.
router.post("/google", authLimiter, validate(googleAuthSchema), googleAuth);
router.post("/verify-email", emailVerificationLimiter, validate(verifyEmailSchema), verifyEmail);
router.post("/refresh-token", validate(refreshTokenSchema), refreshAccessToken);
router.post("/forgot-password", passwordResetLimiter, validate(forgotPasswordSchema), forgotPasswordRequest);
router.post("/reset-password", passwordResetLimiter, validate(resetPasswordSchema), resetForgotPassword);

// Secure routes
router.post("/logout", verifyJWT, logoutUser);
router.get("/current-user", verifyJWT, getCurrentUser);
router.post("/change-password", verifyJWT, validate(changePasswordSchema), changeCurrentPassword);
router.post("/resend-email-verification", verifyJWT, resendEmailVerification);

export default router;
