import jwt from "jsonwebtoken";
import { User } from "../models/user.models.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";

export const verifyJWT = asyncHandler(async (req, _res, next) => {
  const cookieToken = req.cookies?.accessToken;
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const token = cookieToken || bearerToken;

  if (!token) {
    throw new ApiError(401, "Authentication required");
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.ACCESS_TOKEN_SECRET || "default-secret-key"
    );

    const userId = decoded?._id || decoded?.sub;
    if (!userId) {
      throw new ApiError(401, "Invalid access token");
    }

    const user = await User.findById(userId).select("-password -refreshToken");
    if (!user) {
      throw new ApiError(401, "User not found");
    }

    if (!user.isActive) {
      throw new ApiError(403, "User account is inactive");
    }

    if (
      decoded.tokenVersion !== undefined &&
      decoded.tokenVersion !== user.tokenVersion
    ) {
      throw new ApiError(401, "Session has been invalidated");
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (error.name === "TokenExpiredError") {
      throw new ApiError(401, "Access token expired");
    }
    throw new ApiError(401, "Invalid access token");
  }
});

/**
 * Attach the authenticated user's ownership scope to the request.
 * Every owned-record query must include req.userFilter — never trust a
 * client-supplied userId.
 */
export const scopeToUser = (req, _res, next) => {
  if (!req.user) {
    throw new ApiError(401, "Authentication required");
  }

  req.userFilter = { userId: req.user._id };
  next();
};

// Alias for backwards compatibility
export const authenticateRequest = verifyJWT;
