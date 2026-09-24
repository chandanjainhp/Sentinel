import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { getRedis } from '../db/redis.js';

const limiterCache = new Map();

const buildLimiter = (windowMs, maxRequests, prefix) => {
  const redis = getRedis();

  return rateLimit({
    windowMs,
    max: maxRequests,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
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

const getLimiter = (name, windowMs, maxRequests, prefix) => {
  if (!limiterCache.has(name)) {
    limiterCache.set(name, buildLimiter(windowMs, maxRequests, prefix));
  }
  return limiterCache.get(name);
};

const wrapLimiter = (name, windowMs, maxRequests, prefix) => (req, res, next) => {
  // Deterministic test runs — rate limiting is exercised separately
  if (process.env.NODE_ENV === 'test') return next();
  return getLimiter(name, windowMs, maxRequests, prefix)(req, res, next);
};

const apiLimiter = wrapLimiter('api', 15 * 60 * 1000, 100, 'api');
const authLimiter = wrapLimiter('auth', 15 * 60 * 1000, 5, 'auth');
const eventsLimiter = wrapLimiter('events', 60 * 1000, 120, 'events');

export { apiLimiter, authLimiter, eventsLimiter, getLimiter };
