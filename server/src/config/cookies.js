/**
 * Centralized cookie configuration.
 *
 * All cookies used in the application should use these configuration objects
 * to ensure consistency across all endpoints.
 *
 * Security Notes:
 * - HttpOnly: Prevents client-side JavaScript from accessing cookies (XSS protection)
 * - Secure: Only send cookies over HTTPS (prevents MITM attacks)
 * - SameSite: Controls when cookies are sent with cross-site requests
 *   - 'lax': Cookies sent with top-level navigations (default, good balance)
 *   - 'strict': Cookies only sent for same-site requests (most secure)
 *   - 'none': Cookies sent with all cross-site requests (requires Secure)
 * - MaxAge: Cookie lifetime in milliseconds
 * - Path: Cookie available path (default: '/')
 * - Domain: Cookie available domain (optional, for subdomain sharing)
 */

/**
 * Parse milliseconds from various formats.
 * Supports: number, string number, or time format like "15m", "1h", "7d"
 */
const parseMs = (value, defaultValue) => {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  if (typeof value === 'number') {
    return value;
  }

  const stringValue = String(value).toLowerCase().trim();
  
  // Try parsing as number
  const num = Number(stringValue);
  if (!isNaN(num)) {
    return num;
  }

  // Parse time format
  const match = stringValue.match(/^(\d+)([smhd])$/);
  if (match) {
    const num = parseInt(match[1], 10);
    const unit = match[2];
    
    switch (unit) {
      case 's': return num * 1000;
      case 'm': return num * 60 * 1000;
      case 'h': return num * 60 * 60 * 1000;
      case 'd': return num * 24 * 60 * 60 * 1000;
      default: return defaultValue;
    }
  }

  return defaultValue;
};

/**
 * Base cookie options that should be used for all cookies.
 * These are the minimum security requirements.
 */
const baseCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production' || 
          process.env.COOKIE_SECURE === 'true',
  sameSite: process.env.COOKIE_SAME_SITE || 'lax',
  path: '/',
  domain: process.env.COOKIE_DOMAIN || undefined,
};

/**
 * Cookie options for access token.
 * Short lifetime - matches JWT expiry (15 minutes by default).
 */
export const accessTokenCookieOptions = {
  ...baseCookieOptions,
  maxAge: parseMs(
    process.env.ACCESS_TOKEN_COOKIE_MAX_AGE_MS || 
    process.env.ACCESS_TOKEN_EXPIRY,
    15 * 60 * 1000 // 15 minutes default
  ),
};

/**
 * Cookie options for refresh token.
 * Longer lifetime - matches JWT expiry (7 days by default).
 */
export const refreshTokenCookieOptions = {
  ...baseCookieOptions,
  maxAge: parseMs(
    process.env.REFRESH_TOKEN_COOKIE_MAX_AGE_MS || 
    process.env.REFRESH_TOKEN_EXPIRY,
    7 * 24 * 60 * 60 * 1000 // 7 days default
  ),
};

/**
 * Cookie options for session token (if used).
 */
export const sessionCookieOptions = {
  ...baseCookieOptions,
  maxAge: parseMs(
    process.env.SESSION_COOKIE_MAX_AGE_MS,
    24 * 60 * 60 * 1000 // 24 hours default
  ),
};

/**
 * Cookie options for short-lived tokens (e.g., email verification, password reset).
 */
export const temporaryCookieOptions = {
  ...baseCookieOptions,
  maxAge: parseMs(
    process.env.TEMPORARY_COOKIE_MAX_AGE_MS,
    20 * 60 * 1000 // 20 minutes default
  ),
};

/**
 * Clear cookie options (for logout, etc.).
 * Same options as set, but with expired date.
 */
export const clearCookieOptions = {
  ...baseCookieOptions,
  expires: new Date(0),
  maxAge: 0,
};

/**
 * Get cookie options for a specific cookie type.
 * @param {string} type - Cookie type ('access', 'refresh', 'session', 'temporary')
 * @returns {Object} Cookie options object
 */
export const getCookieOptions = (type) => {
  switch (type) {
    case 'access':
      return accessTokenCookieOptions;
    case 'refresh':
      return refreshTokenCookieOptions;
    case 'session':
      return sessionCookieOptions;
    case 'temporary':
      return temporaryCookieOptions;
    default:
      return baseCookieOptions;
  }
};

/**
 * Validate cookie configuration.
 * Called at startup to ensure cookie settings are secure.
 */
export const validateCookieConfig = () => {
  const errors = [];
  const warnings = [];

  // In production, secure flag should be true
  if (process.env.NODE_ENV === 'production' && 
      process.env.COOKIE_SECURE !== 'true') {
    warnings.push(
      'COOKIE_SECURE is not explicitly set to true in production. ' +
      'Cookies may be sent over insecure connections.'
    );
  }

  // SameSite should be set
  if (!process.env.COOKIE_SAME_SITE) {
    warnings.push(
      'COOKIE_SAME_SITE is not configured. Defaulting to "lax". ' +
      'Consider setting to "strict" for enhanced security.'
    );
  }

  // Check if cookie domain is set for subdomain sharing
  if (process.env.COOKIE_DOMAIN && 
      !process.env.COOKIE_DOMAIN.startsWith('.')) {
    warnings.push(
      'COOKIE_DOMAIN is set but does not start with ".". ' +
      'This may not work for subdomains as expected.'
    );
  }

  return { errors, warnings };
};

export default {
  accessTokenCookieOptions,
  refreshTokenCookieOptions,
  sessionCookieOptions,
  temporaryCookieOptions,
  clearCookieOptions,
  getCookieOptions,
  validateCookieConfig,
};
