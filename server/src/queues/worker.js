import Redis from 'ioredis';
import { startPredictionWorker, stopPredictionWorker } from './prediction.worker.js';

/**
 * Background workers for Sentinel.
 *
 * Wave 0 of the cohesion plan: only queues with live producers are served.
 * The prediction queue is fed by event ingestion (event.service.js).
 *
 * Neutralized on purpose (their backing services no longer exist and any
 * incoming job would have crashed the worker):
 *   - investigations  — rebuilt in Wave 3 as the Argus explanation worker
 *   - correlation     — service file missing; no producer
 *   - briefings       — service file missing; no producer (briefing page is a
 *                       "coming later" stub as of Wave 0)
 *   - webhooks        — handler referenced Site.getSite() which does not exist;
 *                       it would have thrown on every delivery
 */

let workerRedisConnection = null;

/**
 * Create separate Redis connection for BullMQ workers.
 * BullMQ requires its own connection, separate from the app's.
 */
const createWorkerRedisConnection = () => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  const connection = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    enableOfflineQueue: true,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      if (times > 10) {
        console.error('[Worker] Max retries exceeded');
        return null;
      }
      return delay;
    },
  });

  connection.on('error', (err) => {
    console.error('[Worker] Redis connection error:', err.message);
  });

  connection.on('connect', () => {
    console.log('[Worker] Redis worker connection established');
  });

  return connection;
};

/**
 * Start the background workers.
 * Called after database connections are established.
 * @returns {Promise<void>}
 */
export const startWorker = async () => {
  try {
    if (workerRedisConnection) {
      console.warn('[Worker] Worker already started');
      return;
    }

    workerRedisConnection = createWorkerRedisConnection();

    startPredictionWorker(workerRedisConnection);
    console.log('[Worker] ✓ Prediction worker started (queue: prediction)');
  } catch (error) {
    console.error('[Worker] Failed to start worker:', error);
    throw error;
  }
};

/**
 * Stop the background workers and close the Redis connection.
 * @returns {Promise<void>}
 */
export const stopWorker = async () => {
  try {
    await stopPredictionWorker();

    if (workerRedisConnection) {
      await workerRedisConnection.quit();
      workerRedisConnection = null;
      console.log('[Worker] ✓ Worker Redis connection closed');
    }
  } catch (error) {
    console.error('[Worker] Error stopping worker:', error.message);
    throw error;
  }
};

export default {
  startWorker,
  stopWorker,
};
