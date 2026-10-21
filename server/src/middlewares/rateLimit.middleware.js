import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { getRedis } from '../db/redis.js';

const limiterCache = new Map();

const buildLimiter = (windowMs, maxRequests, prefix, keyGenerator) => {
  const redis = getRedis();

  return rateLimit({
    windowMs,
    max: maxRequests,
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    ...(keyGenerator ? { keyGenerator } : {}),
    ...(redis
      ? {
          store: new RedisStore({
            prefix: `sentinel:${prefix}:`,
            sendCommand: (...args) => redis.call(...args),
          }),
        }
      : {}),
  });
};

const getLimiter = (name, windowMs, maxRequests, prefix, keyGenerator) => {
  if (!limiterCache.has(name)) {
    limiterCache.set(name, buildLimiter(windowMs, maxRequests, prefix, keyGenerator));
  }
  return limiterCache.get(name);
};

const wrapLimiter = (name, windowMs, maxRequests, prefix, keyGenerator) => (req, res, next) => {
  // Deterministic test runs — rate limiting is exercised separately
  if (process.env.NODE_ENV === 'test') return next();
  return getLimiter(name, windowMs, maxRequests, prefix, keyGenerator)(req, res, next);
};

// The dashboard polls several endpoints every 10s (~24 req/min), so one
// open tab alone needs ~360 requests per window. The old fixed 100/15min
// limit 429'd real user actions (e.g. Start Investigation) after a few
// minutes of browsing. Env-overridable for stricter deployments.
const API_RATE_LIMIT_MAX = Number(process.env.API_RATE_LIMIT_MAX || 1000);
const apiLimiter = wrapLimiter('api', 15 * 60 * 1000, API_RATE_LIMIT_MAX, 'api');
const authLimiter = wrapLimiter('auth', 15 * 60 * 1000, 5, 'auth');

// Ingest is authenticated by API key before this limiter runs, so keying by
// user keeps one site's gateway from throttling another site behind the same
// NAT/proxy IP.
const eventKey = (req) => req.apiKey?.userId?.toString() || req.ip;

// 600/min (~10/s) per key. A 5-channel gateway posting once a second is the
// realistic ceiling; above this is a runaway or abusive client, not sensors.
const EVENT_RATE_LIMIT_MAX = Number(process.env.EVENT_RATE_LIMIT_MAX || 600);
const eventsLimiter = wrapLimiter('events', 60 * 1000, EVENT_RATE_LIMIT_MAX, 'events', eventKey);

export { apiLimiter, authLimiter, eventsLimiter, getLimiter, buildLimiter, eventKey };
