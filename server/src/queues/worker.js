import Redis from 'ioredis';
import { startPredictionWorker, stopPredictionWorker } from './prediction.worker.js';
import { startArgusExplainWorker, stopArgusExplainWorker } from './argus-explain.worker.js';
import { startInvestigationWorker, stopInvestigationWorker } from './investigation.worker.js';

/**
 * Background workers for Sentinel.
 *
 * Live queues:
 *   - prediction     — fed by event ingestion (event.service.js)
 *   - argus-explain  — fed by incident creation/escalation and by
 *                      POST /api/v1/incidents/:id/explain (built in Wave 4,
 *                      Fix A). Deterministic fallback explanation when the
 *                      LLM is unavailable.
 *
 * Neutralized on purpose (their backing services no longer exist and any
 * incoming job would have crashed the worker):
 *   - correlation     — service file missing; no producer
 *   - briefings       — service file missing; no producer (briefing page is a
 *                       "coming later" stub as of Wave 0)
 *   - webhooks        — handler referenced Site.getSite() which does not exist;
 *                       it would have thrown on every delivery
 *   - investigations  — overnight investigation agent (investigation.worker.js):
 *                       one job per incident, deterministic trace + classify,
 *                       persisted on the Investigation doc.
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

    startArgusExplainWorker(workerRedisConnection);
    console.log('[Worker] ✓ Argus explain worker started (queue: argus-explain)');

    startInvestigationWorker(workerRedisConnection);
    console.log('[Worker] ✓ Investigation worker started (queue: investigations)');
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
    await stopArgusExplainWorker();
    await stopInvestigationWorker();

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
