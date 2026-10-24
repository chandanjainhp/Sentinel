import { ApiError } from "../utils/api-error.js";

/**
 * CSRF protection middleware.
 *
 * For cookie-based authentication, we use the Origin header check as a
 * first line of defense. This middleware ensures that authenticated
 * state-changing requests (POST, PUT, PATCH, DELETE) originate from
 * the expected CORS origin, preventing CSRF attacks.
 *
 * The Origin header is automatically sent by browsers for cross-origin
 * requests and can be validated against the configured CORS origins.
 */

const allowedMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Parse CORS_ORIGIN into an array of allowed origins
const getAllowedOrigins = () => {
  const origins = process.env.CORS_ORIGIN?.split(',') || [];
  // Add default origins
  const defaults = ['http://localhost:3000', 'https://localhost:3000'];
  return [...new Set([...origins, ...defaults])];
};

// Normalize origin by removing trailing slashes
const normalizeOrigin = (origin) => {
  if (!origin) return null;
  // Remove trailing slash
  return origin.replace(/\/$/, '');
};

// Check if origin is in the allowed list
const isOriginAllowed = (origin, allowedOrigins) => {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  
  return allowedOrigins.some((allowed) => {
    const normalizedAllowed = normalizeOrigin(allowed);
    // Exact match
    if (normalized === normalizedAllowed) return true;
    
    // For development, allow localhost with any port
    if (normalizedAllowed?.startsWith('http://localhost:')) {
      return normalized.startsWith('http://localhost:');
    }
    if (normalizedAllowed?.startsWith('https://localhost:')) {
      return normalized.startsWith('https://localhost:');
    }
    
    return false;
  });
};

/**
 * CSRF middleware - validates Origin header for state-changing requests
 * when user is authenticated via cookies.
 */
export const csrfProtection = (req, res, next) => {
  // Only apply to state-changing methods
  if (!allowedMethods.has(req.method)) {
    return next();
  }

  // Skip if running in test mode
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  // If user is authenticated via Bearer token (not cookies), the request
  // is likely from a trusted client or service, so skip CSRF check
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return next();
  }

  // If user is authenticated via cookies, check Origin header
  const hasCookies = req.cookies?.accessToken;
  if (!hasCookies) {
    // No cookie auth, continue without CSRF check
    return next();
  }

  // Check Origin header
  const origin = req.headers.origin || req.headers.referer;
  const allowedOrigins = getAllowedOrigins();
  
  if (!isOriginAllowed(origin, allowedOrigins)) {
    throw new ApiError(403, 'Cross-origin request forbidden');
  }

  next();
};

export default csrfProtection;
