/**
 * NOT MOUNTED, on purpose.
 *
 * Event idempotency is enforced in the database (event.service.js plus the
 * unique { userId, idempotencyKey } index on Event), which is the authoritative
 * path and survives multiple server replicas. Mounting this Redis cache as well
 * would answer replays before authentication/user scoping and return a cached
 * body instead of the stored event, so it stays as reference only.
 */
import crypto from 'node:crypto';
import { getRedis } from '../db/redis.js';

const IDEM_KEY_TTL = 24 * 60 * 60;
const HASH_KEY_TTL = 5 * 60;

const sha256 = (str) => crypto.createHash('sha256').update(str).digest('hex');

export const idempotencyMiddleware = async (req, res, next) => {
  const redis = getRedis();
  if (!redis) return next();

  const scope = 'site';
  const explicitKey = req.headers['idempotency-key'];

  if (explicitKey) {
    const redisKey = `idem:event:${scope}:${explicitKey}`;
    try {
      const cached = await redis.get(redisKey);
      if (cached) {
        return res.status(200).json(JSON.parse(cached));
      }
    } catch (err) {
      console.error('[Idempotency] Redis read error:', err.message);
    }
    req.idempotencyKey = redisKey;
    req.idempotencyTTL = IDEM_KEY_TTL;
  } else {
    const body = Array.isArray(req.body) ? req.body[0] : req.body;
    if (body) {
      const hashInput = JSON.stringify({
        type: body.type,
        timestamp: body.timestamp,
        locationName: body.location?.name,
        severity: body.severity,
      });
      const hash = sha256(hashInput);
      const redisKey = `idem:event:hash:${scope}:${hash}`;
      try {
        const cached = await redis.get(redisKey);
        if (cached) {
          res.setHeader('X-Idempotency', 'hash-dedup');
          return res.status(200).json(JSON.parse(cached));
        }
      } catch (err) {
        console.error('[Idempotency] Redis hash read error:', err.message);
      }
      req.idempotencyKey = redisKey;
      req.idempotencyTTL = HASH_KEY_TTL;
    }
  }

  if (req.idempotencyKey) {
    const origJson = res.json.bind(res);
    res.json = (body) => {
      const redis2 = getRedis();
      if (redis2) {
        redis2
          .set(req.idempotencyKey, JSON.stringify(body), 'EX', req.idempotencyTTL)
          .catch((err) => console.error('[Idempotency] Redis write error:', err.message));
      }
      return origJson(body);
    };
  }

  next();
};
