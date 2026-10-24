/**
 * Security headers middleware.
 *
 * Configurable security headers that can be customized via environment variables.
 * This provides fine-grained control over security policies while maintaining
 * sensible defaults.
 *
 * IMPORTANT: HSTS should only be enabled in production after verifying:
 *   1. All subdomains support HTTPS
 *   2. TLS certificates are valid and automatically renewed
 *   3. No mixed content issues exist
 *   4. A rollback plan exists for HSTS preload submission
 *
 * CSP should be tested in report-only mode first before enforcing.
 */

import helmet from 'helmet';

/**
 * Parse CSP directives from environment variable.
 * Format: "directive1 value1 value2; directive2 value3"
 * Example: "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.example.com"
 */
const parseCspDirectives = () => {
  const directives = process.env.SECURITY_CSP_DIRECTIVES || '';
  if (!directives.trim()) {
    // Sensible defaults for a modern web application
    return {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'https:'],
      'font-src': ["'self'"],
      'connect-src': ["'self'"],
      'frame-src': ["'none'"],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
    };
  }

  // Parse custom directives
  const result = {};
  const pairs = directives.split(';');
  for (const pair of pairs) {
    const [key, ...values] = pair.trim().split(/\s+/);
    if (key) {
      result[key] = values.filter(v => v);
    }
  }
  return result;
};

/**
 * Build Content-Security-Policy header value.
 * Only applied if SECURITY_CSP_ENABLED is true (default: true in production).
 */
const buildContentSecurityPolicy = () => {
  if (process.env.SECURITY_CSP_ENABLED !== 'true' && process.env.NODE_ENV !== 'production') {
    return null;
  }

  const directives = parseCspDirectives();
  const parts = [];
  
  for (const [key, values] of Object.entries(directives)) {
    if (values.length > 0) {
      parts.push(`${key} ${values.join(' ')}`);
    }
  }
  
  return parts.join('; ');
};

/**
 * Build Strict-Transport-Security header value.
 * Only applied if SECURITY_HSTS_ENABLED is true (default: false for safety).
 * 
 * WARNING: Once HSTS is enabled and browsers cache it, it cannot be easily
 * disabled. Only enable this after thorough testing in production.
 */
const buildStrictTransportSecurity = () => {
  if (process.env.SECURITY_HSTS_ENABLED !== 'true') {
    return null;
  }

  const maxAge = Number(process.env.SECURITY_HSTS_MAX_AGE || 31536000); // 1 year
  const includeSubDomains = process.env.SECURITY_HSTS_INCLUDE_SUBDOMAINS === 'true';
  const preload = process.env.SECURITY_HSTS_PRELOAD === 'true';

  let value = `max-age=${maxAge}`;
  if (includeSubDomains) {
    value += '; includeSubDomains';
  }
  if (preload) {
    value += '; preload';
  }

  return value;
};

/**
 * Security headers middleware.
 * 
 * Applies security headers to all responses. Some headers are only set
 * in production or when explicitly enabled via environment variables.
 */
export const securityHeaders = (req, res, next) => {
  // Set security headers
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Enable XSS filter in browsers
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Control referrer information
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Restrict which browser features can be used
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  
  // Isolate cross-origin requests
  // Google Identity Services uses a popup and postMessage during sign-in.
  // Allow that trusted popup relationship without enabling cross-origin
  // window access for ordinary application content.
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  
  // Prevent cross-origin resource loading
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  
  // Content Security Policy (configurable)
  const csp = buildContentSecurityPolicy();
  if (csp) {
    res.setHeader('Content-Security-Policy', csp);
    // Also set report-to for CSP violations (optional)
    if (process.env.SECURITY_CSP_REPORT_URI) {
      res.setHeader('Content-Security-Policy-Report-Only', 
        `${csp}; report-uri ${process.env.SECURITY_CSP_REPORT_URI}`);
    }
  }
  
  // HTTP Strict Transport Security (opt-in, dangerous to enable)
  const hsts = buildStrictTransportSecurity();
  if (hsts) {
    res.setHeader('Strict-Transport-Security', hsts);
  }
  
  // Continue to next middleware
  next();
};

/**
 * Create a security middleware with configurable helmet options.
 * Combines helmet defaults with our custom security headers.
 */
export const createSecurityMiddleware = () => {
  // Use helmet with customized options
  const helmetMiddleware = helmet({
    // Disable helmet's CSP to use our custom implementation
    contentSecurityPolicy: false,
    // Disable helmet's HSTS to use our custom implementation
    hsts: false,
    // Other helmet protections remain active
    crossOriginEmbedderPolicy: false, // Use COOP/COEP instead
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: false,
    permittedCrossDomainPolicies: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true,
  });

  return (req, res, next) => {
    // Apply helmet middleware first
    helmetMiddleware(req, res, () => {
      // Then apply our custom headers
      securityHeaders(req, res, next);
    });
  };
};

/**
 * Security middleware instance to export.
 * Use this in app.js instead of plain helmet().
 */
export const securityMiddleware = createSecurityMiddleware();

export default securityMiddleware;
