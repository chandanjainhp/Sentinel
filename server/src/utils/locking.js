/**
 * Distributed locking utilities for multi-instance coordination.
 *
 * Uses Redis for distributed locking across multiple server instances.
 * This ensures that operations that must be serialized (like incident creation
 * for the same machine) work correctly even when multiple replicas are running.
 *
 * Features:
 * - Automatic lock expiration (TTL) to prevent deadlocks
 * - Atomic lock acquisition and release
 * - Retry logic for contested locks
 * - Graceful degradation when Redis is unavailable
 *
 * Usage:
 *   const lock = await acquireLock('incident:machine:123', 30000);
 *   if (lock) {
 *     try {
 *       // Critical section
 *     } finally {
 *       await releaseLock('incident:machine:123', lock);
 *     }
 *   }
 *
 * Or use the convenience wrapper:
 *   await withLock('incident:machine:123', async () => {
 *     // Critical section
 *   }, 30000);
 */

import crypto from 'crypto';
import { getRedis } from '../db/redis.js';
import logger from './logger.js';

// Lock configuration
const LOCK_PREFIX = 'sentinel:lock:';
const DEFAULT_LOCK_TTL_MS = 30000; // 30 seconds default
const LOCK_RETRY_DELAY_MS = 100; // 100ms between retry attempts
const MAX_LOCK_RETRIES = 5; // Maximum retry attempts

/**
 * Get the Redis client for locking.
 * Returns null if Redis is not available.
 */
const getLockingRedis = () => {
  try {
    const redis = getRedis();
    if (redis && redis.status === 'ready') {
      return redis;
    }
    return null;
  } catch (error) {
    logger.warn('[Locking] Failed to get Redis client:', error.message);
    return null;
  }
};

/**
 * Generate a unique lock value.
 * This value is used to ensure only the owner can release the lock.
 */
const generateLockValue = () => {
  return crypto.randomUUID();
};

/**
 * Get the full lock key for a given resource.
 */
const getLockKey = (key) => {
  return `${LOCK_PREFIX}${key}`;
};

/**
 * Acquire a distributed lock.
 *
 * Uses Redis SET with NX (set if not exists) and EX (expiry) options.
 * Returns the lock value if acquired, null otherwise.
 *
 * @param {string} key - The lock key (e.g., 'incident:machine:123')
 * @param {number} ttlMs - Lock TTL in milliseconds (defaults to DEFAULT_LOCK_TTL_MS)
 * @param {Object} options - Acquisition options
 * @param {number} options.maxRetries - Maximum retry attempts (default: MAX_LOCK_RETRIES)
 * @param {number} options.retryDelay - Delay between retries in ms (default: LOCK_RETRY_DELAY_MS)
 * @returns {Promise<string|null>} - Lock value if acquired, null otherwise
 */
export const acquireLock = async (key, ttlMs = DEFAULT_LOCK_TTL_MS, options = {}) => {
  const { maxRetries = MAX_LOCK_RETRIES, retryDelay = LOCK_RETRY_DELAY_MS } = options;
  const redis = getLockingRedis();
  
  if (!redis) {
    // Redis not available - cannot acquire distributed lock
    logger.warn('[Locking] Redis not available, cannot acquire distributed lock');
    return null;
  }

  const lockKey = getLockKey(key);
  const lockValue = generateLockValue();
  const ttlSeconds = Math.ceil(ttlMs / 1000);

  // Lua script for atomic lock acquisition with retry
  const acquireScript = `
    local lockValue = ARGV[1]
    local ttl = tonumber(ARGV[2])
    local maxRetries = tonumber(ARGV[3])
    local retryDelay = tonumber(ARGV[4])
    
    for i = 1, maxRetries do
      local result = redis.call('SET', KEYS[1], lockValue, 'NX', 'EX', ttl)
      if result then
        return lockValue
      end
      if i < maxRetries then
        -- Wait before retry
        -- Note: We can't actually sleep in Lua, so we'll do it in the caller
        break
      end
    end
    return nil
  `;

  try {
    // Try direct acquisition first
    const result = await redis.set(lockKey, lockValue, 'NX', 'EX', ttlSeconds);
    
    if (result === 'OK') {
      logger.debug(`[Locking] Acquired lock for ${key}`);
      return lockValue;
    }

    // Direct acquisition failed - try with retries
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      // Wait before retry
      if (attempt > 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }

      const result = await redis.set(lockKey, lockValue, 'NX', 'EX', ttlSeconds);
      
      if (result === 'OK') {
        logger.debug(`[Locking] Acquired lock for ${key} (attempt ${attempt})`);
        return lockValue;
      }
    }

    logger.debug(`[Locking] Failed to acquire lock for ${key} after ${maxRetries} attempts`);
    return null;
  } catch (error) {
    logger.error(`[Locking] Failed to acquire lock for ${key}:`, error.message);
    return null;
  }
};

/**
 * Release a distributed lock.
 *
 * Uses a Lua script to atomically check the lock value and delete only if
 * the value matches (prevents releasing someone else's lock).
 *
 * @param {string} key - The lock key
 * @param {string} lockValue - The lock value returned from acquireLock
 * @returns {Promise<boolean>} - True if lock was released, false otherwise
 */
export const releaseLock = async (key, lockValue) => {
  const redis = getLockingRedis();
  
  if (!redis) {
    logger.warn('[Locking] Redis not available, cannot release lock');
    return false;
  }

  const lockKey = getLockKey(key);

  // Lua script for atomic check-and-delete
  const releaseScript = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    else
      return 0
    end
  `;

  try {
    const result = await redis.eval(releaseScript, 1, lockKey, lockValue);
    const released = result === 1;
    
    if (released) {
      logger.debug(`[Locking] Released lock for ${key}`);
    } else {
      logger.warn(`[Locking] Failed to release lock for ${key} - value mismatch or already released`);
    }
    
    return released;
  } catch (error) {
    logger.error(`[Locking] Failed to release lock for ${key}:`, error.message);
    return false;
  }
};

/**
 * Check if a lock is currently held.
 *
 * @param {string} key - The lock key
 * @returns {Promise<boolean>} - True if lock is held, false otherwise
 */
export const isLocked = async (key) => {
  const redis = getLockingRedis();
  
  if (!redis) {
    return false;
  }

  const lockKey = getLockKey(key);

  try {
    const value = await redis.get(lockKey);
    return value !== null;
  } catch (error) {
    logger.error(`[Locking] Failed to check lock for ${key}:`, error.message);
    return false;
  }
};

/**
 * Get the value of a lock (for debugging).
 *
 * @param {string} key - The lock key
 * @returns {Promise<string|null>} - Lock value or null
 */
export const getLockValue = async (key) => {
  const redis = getLockingRedis();
  
  if (!redis) {
    return null;
  }

  const lockKey = getLockKey(key);

  try {
    return await redis.get(lockKey);
  } catch (error) {
    logger.error(`[Locking] Failed to get lock value for ${key}:`, error.message);
    return null;
  }
};

/**
 * Get the TTL of a lock.
 *
 * @param {string} key - The lock key
 * @returns {Promise<number|null>} - TTL in seconds, or null if not locked
 */
export const getLockTTL = async (key) => {
  const redis = getLockingRedis();
  
  if (!redis) {
    return null;
  }

  const lockKey = getLockKey(key);

  try {
    return await redis.ttl(lockKey);
  } catch (error) {
    logger.error(`[Locking] Failed to get lock TTL for ${key}:`, error.message);
    return null;
  }
};

/**
 * Execute a function with a distributed lock.
 *
 * Acquires the lock, executes the function, and releases the lock.
 * Automatically handles errors and lock release.
 *
 * @param {string} key - The lock key
 * @param {Function} fn - Async function to execute while holding the lock
 * @param {number} ttlMs - Lock TTL in milliseconds
 * @param {Object} options - Options for lock acquisition
 * @returns {Promise<any>} - The result of the function
 * @throws {Error} - If lock cannot be acquired or function throws
 */
export const withLock = async (key, fn, ttlMs = DEFAULT_LOCK_TTL_MS, options = {}) => {
  const lockValue = await acquireLock(key, ttlMs, options);
  
  if (!lockValue) {
    throw new Error(`Could not acquire lock for ${key}`);
  }

  try {
    return await fn();
  } finally {
    // Always attempt to release the lock
    await releaseLock(key, lockValue).catch(() => {});
  }
};

/**
 * Try to execute a function with a distributed lock.
 *
 * Same as withLock but returns null instead of throwing if lock cannot be acquired.
 *
 * @param {string} key - The lock key
 * @param {Function} fn - Async function to execute while holding the lock
 * @param {number} ttlMs - Lock TTL in milliseconds
 * @param {Object} options - Options for lock acquisition
 * @returns {Promise<any|null>} - The result of the function, or null if lock not acquired
 */
export const tryWithLock = async (key, fn, ttlMs = DEFAULT_LOCK_TTL_MS, options = {}) => {
  const lockValue = await acquireLock(key, ttlMs, options);
  
  if (!lockValue) {
    return null;
  }

  try {
    return await fn();
  } finally {
    // Always attempt to release the lock
    await releaseLock(key, lockValue).catch(() => {});
  }
};

/**
 * Create a lock manager for a specific resource type.
 *
 * This provides a more convenient API for managing locks for a specific
 * resource type (e.g., incidents, investigations).
 *
 * @param {string} resourceType - The resource type (e.g., 'incident', 'investigation')
 * @returns {Object} - Lock manager with acquire, release, and withLock methods
 */
export const createLockManager = (resourceType) => {
  const prefix = `${resourceType}:`;

  return {
    acquire: (id, ttlMs, options) => acquireLock(`${prefix}${id}`, ttlMs, options),
    release: (id, lockValue) => releaseLock(`${prefix}${id}`, lockValue),
    isLocked: (id) => isLocked(`${prefix}${id}`),
    withLock: (id, fn, ttlMs, options) => withLock(`${prefix}${id}`, fn, ttlMs, options),
    tryWithLock: (id, fn, ttlMs, options) => tryWithLock(`${prefix}${id}`, fn, ttlMs, options),
  };
};

// Pre-created lock managers for common resource types
export const incidentLocks = createLockManager('incident');
export const investigationLocks = createLockManager('investigation');
export const eventLocks = createLockManager('event');
export const machineLocks = createLockManager('machine');
export const userLocks = createLockManager('user');

export default {
  acquireLock,
  releaseLock,
  isLocked,
  getLockValue,
  getLockTTL,
  withLock,
  tryWithLock,
  createLockManager,
  incidentLocks,
  investigationLocks,
  eventLocks,
  machineLocks,
  userLocks,
};
