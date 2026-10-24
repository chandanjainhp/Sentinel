import pino from 'pino';
import pinoHttp from 'pino-http';
import { filterSensitiveData } from './sensitive-data-filter.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  // For human-readable dev output install pino-pretty:
  //   bun add -d pino-pretty
  // then set PINO_PRETTY=true in your .env — this file uses JSON by default.
  serializers: {
    // Filter sensitive data from error objects
    err(err) {
      if (!err) return null;
      return {
        type: err.name || err.constructor?.name,
        message: filterSensitiveData(err.message || String(err)),
        stack: err.stack ? filterSensitiveData(err.stack) : undefined,
      };
    },
  },
});

// Sensitive data filter enabled by default; can be disabled for debugging
const shouldFilterSensitive = process.env.LOG_FILTER_SENSITIVE_DATA !== 'false';

export const httpLogger = pinoHttp({
  logger,
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req(req) {
      if (!shouldFilterSensitive) {
        return { method: req.method, url: req.url };
      }

      // Filter sensitive data from request
      const filtered = {
        method: req.method,
        url: req.url,
        headers: {
          ...req.headers,
          // Remove sensitive headers
          authorization: req.headers.authorization ? '[FILTERED]' : undefined,
          cookie: req.headers.cookie ? '[FILTERED]' : undefined,
        },
      };

      // Clean up undefined values
      return Object.fromEntries(
        Object.entries(filtered).filter(([_, value]) => value !== undefined)
      );
    },
    res(res) {
      if (!shouldFilterSensitive) {
        return { status: res.statusCode };
      }

      // Filter sensitive data from response
      return {
        status: res.statusCode,
        headers: {
          ...res.getHeaders(),
          // Remove set-cookie header
          'set-cookie': res.getHeaders()['set-cookie'] ? ['[FILTERED]'] : undefined,
        },
      };
    },
  },
});

export default logger;
