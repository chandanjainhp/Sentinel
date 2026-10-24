/**
 * Sensitive data filtering utilities.
 *
 * This module provides filtering for sensitive data that should never appear
 * in logs, error responses, or client output.
 *
 * IMPORTANT: This is a defense-in-depth measure. The application should
 * NEVER intentionally log or return sensitive data in the first place.
 * These filters provide an additional safety net.
 */

import crypto from 'crypto';

// Patterns that should be filtered from logs and responses
const SENSITIVE_PATTERNS = [
  // JWT tokens (typical format: xxx.yyy.zzz)
  /[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g,
  
  // Bearer tokens
  /Bearer [A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/gi,
  
  // Generic API keys (long alphanumeric strings)
  /(?:api[_-]?key|apikey|token|secret|password|passwd)[=:\s]?[\"']?([A-Za-z0-9\-_]{16,})[\"']?/gi,
  
  // Passwords in various formats
  /(?:password|passwd|pwd)[=:]\s*[\"']?[^\s\"'&]+[\"']?/gi,
  
  // MongoDB connection strings
  /mongodb:\/\/[^\s]+/gi,
  
  // Redis connection strings
  /redis:\/\/[^\s]+/gi,
  
  // Generic connection strings with credentials
  /\/\/[^:]+:[^@]+@[^\s\/]+/gi,
  
  // Email addresses (for privacy)
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  
  // Credit card numbers (simplified pattern)
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  
  // Social Security Numbers (US format)
  /\b\d{3}-\d{2}-\d{4}\b/g,
  
  // AWS access keys
  /(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}/g,
  
  // Generic secrets
  /(?:secret|private[_-]?key)[=:]\s*[\"']?[^\s\"'&]+[\"']?/gi,
];

// Mask string for replacements
const MASK = '[FILTERED]';
const MASK_SHORT = '[F]';

/**
 * Filter sensitive data from a string.
 * Replaces sensitive patterns with [FILTERED] placeholder.
 * @param {string} input - The string to filter
 * @param {Object} options - Filtering options
 * @param {boolean} options.shortMask - Use short mask [F] instead of [FILTERED]
 * @param {RegExp[]} options.additionalPatterns - Additional patterns to filter
 * @returns {string} - The filtered string
 */
export const filterSensitiveData = (input, options = {}) => {
  if (typeof input !== 'string') {
    return input;
  }

  const { shortMask = false, additionalPatterns = [] } = options;
  const mask = shortMask ? MASK_SHORT : MASK;
  
  // Combine default and additional patterns
  const allPatterns = [...SENSITIVE_PATTERNS, ...additionalPatterns];
  
  let result = input;
  for (const pattern of allPatterns) {
    result = result.replace(pattern, mask);
  }
  
  return result;
};

/**
 * Deep filter sensitive data from an object or array.
 * Recursively filters all string values in the object.
 * @param {any} obj - The object/array to filter
 * @param {Object} options - Filtering options (same as filterSensitiveData)
 * @returns {any} - The filtered object/array
 */
export const deepFilterSensitiveData = (obj, options = {}) => {
  if (obj === null || typeof obj !== 'object') {
    return typeof obj === 'string' ? filterSensitiveData(obj, options) : obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepFilterSensitiveData(item, options));
  }

  const filtered = {};
  for (const [key, value] of Object.entries(obj)) {
    // Filter the key if it contains sensitive data
    const filteredKey = typeof key === 'string' ? filterSensitiveData(key, options) : key;
    
    // Recursively filter the value
    filtered[filteredKey] = deepFilterSensitiveData(value, options);
  }
  
  return filtered;
};

/**
 * Filter sensitive data from request/response for logging.
 * This is a middleware-compatible function.
 * @param {Object} data - Request or response data to filter
 * @returns {Object} - Filtered data
 */
export const filterForLogging = (data) => {
  return deepFilterSensitiveData(data, { shortMask: false });
};

/**
 * Filter sensitive data for client responses.
 * More aggressive filtering for data that goes to clients.
 * @param {Object} data - Response data to filter
 * @returns {Object} - Filtered data
 */
export const filterForResponse = (data) => {
  return deepFilterSensitiveData(data, { shortMask: false });
};

/**
 * Create a hash of sensitive data for logging purposes.
 * Useful when you need to track a value but not expose it.
 * @param {string} value - The sensitive value to hash
 * @returns {string} - A SHA-256 hash of the value
 */
export const hashForLogging = (value) => {
  if (!value) {
    return '[NULL]';
  }
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
};

/**
 * Check if a string looks like it might be sensitive.
 * @param {string} input - The string to check
 * @returns {boolean} - True if the string appears sensitive
 */
export const isSensitive = (input) => {
  if (typeof input !== 'string') {
    return false;
  }

  // Check against all patterns
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(input)) {
      return true;
    }
  }
  
  // Check for high entropy (likely a token/secret)
  const entropy = calculateShannonEntropy(input);
  if (input.length > 16 && entropy > 3.0) {
    return true;
  }
  
  return false;
};

/**
 * Calculate Shannon entropy of a string.
 * High entropy strings are likely random/secret values.
 * @param {string} str - The string to analyze
 * @returns {number} - The entropy in bits
 */
const calculateShannonEntropy = (str) => {
  if (!str) return 0;
  
  const freq = {};
  for (const char of str) {
    freq[char] = (freq[char] || 0) + 1;
  }
  
  const len = str.length;
  let entropy = 0;
  
  for (const char in freq) {
    const p = freq[char] / len;
    entropy -= p * Math.log2(p);
  }
  
  return entropy;
};

/**
 * Create a pino serializer that filters sensitive data.
 * Use this with pino-http to filter request/response data.
 */
export const pinoRequestSerializer = (req) => {
  const filtered = {
    method: req.method,
    url: req.url,
    headers: filterForLogging({
      ...req.headers,
      // Remove common sensitive headers
      authorization: req.headers.authorization ? '[FILTERED]' : undefined,
      cookie: req.headers.cookie ? '[FILTERED]' : undefined,
    }),
    // Filter query parameters
    query: filterForLogging(req.query),
    // Filter body
    body: req.body ? filterForLogging(req.body) : undefined,
  };
  
  // Remove undefined values
  return Object.fromEntries(
    Object.entries(filtered).filter(([_, value]) => value !== undefined)
  );
};

/**
 * Create a pino serializer that filters sensitive data from responses.
 */
export const pinoResponseSerializer = (res) => {
  return {
    status: res.statusCode,
    headers: filterForLogging({
      ...res.getHeaders(),
      // Remove set-cookie header
      'set-cookie': res.getHeaders()['set-cookie'] ? ['[FILTERED]'] : undefined,
    }),
    // Note: We don't filter the body here as it should already be safe
  };
};

/**
 * Create a pino serializer that filters sensitive data from error objects.
 */
export const pinoErrorSerializer = (err) => {
  if (!err) return null;
  
  return {
    type: err.name || err.constructor?.name,
    message: filterSensitiveData(err.message || String(err)),
    stack: err.stack ? filterSensitiveData(err.stack) : undefined,
    // Filter any additional properties
    ...filterForLogging({
      ...err,
      message: undefined,
      stack: undefined,
      name: undefined,
    }),
  };
};

export default {
  filterSensitiveData,
  deepFilterSensitiveData,
  filterForLogging,
  filterForResponse,
  hashForLogging,
  isSensitive,
  pinoRequestSerializer,
  pinoResponseSerializer,
  pinoErrorSerializer,
};
