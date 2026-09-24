import { Queue, QueueEvents } from 'bullmq';
import { getRedis } from '../db/redis.js';

// Queue name constant
const INVESTIGATION_QUEUE_NAME = 'investigations';

/**
 * Initialize and export the investigations queue
 * Uses Redis connection from redis.js
 */
let investigationQueue = null;

/**
 * Get or create the investigations queue
 * @returns {Queue} BullMQ Queue instance
 */
export const getInvestigationQueue = () => {
  if (!investigationQueue) {
    const redisClient = getRedis();
    if (!redisClient) {
      throw new Error('Redis client not initialized. Call connectRedis() first.');
    }

    investigationQueue = new Queue(INVESTIGATION_QUEUE_NAME, {
      connection: redisClient,
      defaultJobOptions: {
        removeOnComplete: true,
      },
    });

    // Log queue events for debugging
    investigationQueue.on('error', (error) => {
      console.error(`[InvestigationQueue] Error:`, error);
    });

    investigationQueue.on('drained', () => {
      console.log('[InvestigationQueue] Queue drained - all jobs processed');
    });
  }

  return investigationQueue;
};

/**
 * Dispatch an investigation job to the queue
 * @param {string} incidentId - The incident ID to investigate
 * @param {number} priority - Priority level (lower = higher priority)
 * @param {string} jobId - Optional BullMQ job ID for idempotency
 * @param {object} extraData - Additional job data payload
 * @returns {Promise<Job>} The BullMQ Job object
 */
export const dispatchInvestigation = async (
  incidentId,
  priority = 5,
  jobId = null,
  extraData = {}
) => {
  try {
    const queue = getInvestigationQueue();

    const jobData = {
      incidentId,
      dispatchedAt: new Date().toISOString(),
      ...extraData,
    };

    const jobOptions = {
      priority,
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: true,
      removeOnFail: false, // Keep failed jobs for review
    };

    // If jobId provided, use it for idempotency
    if (jobId) {
      jobOptions.jobId = jobId;
    }

    const job = await queue.add('investigate', jobData, jobOptions);

    console.log(
      `[InvestigationQueue] Job dispatched: ${job.id} | Incident: ${incidentId} | Priority: ${priority}`
    );

    return job;
  } catch (error) {
    console.error('[InvestigationQueue] Failed to dispatch investigation:', error);
    throw error;
  }
};

/**
 * Get the current status of a job
 * @param {string} jobId - The BullMQ job ID
 * @returns {Promise<object>} Job status object with { jobId, state, progress, result, failedReason }
 */
export const getJobStatus = async (jobId) => {
  try {
    const queue = getInvestigationQueue();
    const job = await queue.getJob(jobId);

    if (!job) {
      return {
        jobId,
        state: 'not-found',
        progress: null,
        result: null,
        failedReason: 'Job does not exist',
      };
    }

    const state = await job.getState();
    const progress = job.progress;
    const result = job.returnvalue;
    const failedReason = job.failedReason;

    return {
      jobId: job.id,
      state,
      progress,
      result,
      failedReason,
    };
  } catch (error) {
    console.error(`[InvestigationQueue] Failed to get job status ${jobId}:`, error);
    throw error;
  }
};

/**
 * Subscribe to job progress events
 * @param {string} jobId - The BullMQ job ID
 * @param {function} onProgress - Callback for progress updates
 * @param {function} onComplete - Callback for job completion
 * @param {function} onFailed - Callback for job failure
 * @returns {function} Cleanup function to remove listener
 */
export const subscribeToJobProgress = (jobId, onProgress, onComplete, onFailed) => {
  try {
    const queue = getInvestigationQueue();
    const queueEvents = new QueueEvents(INVESTIGATION_QUEUE_NAME, {
      connection: getRedis(),
    });

    // Event handlers
    const progressHandler = (eventData) => {
      if (eventData.jobId === jobId) {
        console.log(`[InvestigationQueue] Progress update for job ${jobId}:`, eventData);
        if (onProgress) {
          try {
            onProgress(eventData);
          } catch (error) {
            console.error('[InvestigationQueue] Error in onProgress callback:', error);
          }
        }
      }
    };

    const completeHandler = (eventData) => {
      if (eventData.jobId === jobId) {
        console.log(`[InvestigationQueue] Job completed: ${jobId}`);
        if (onComplete) {
          try {
            onComplete(eventData.returnvalue);
          } catch (error) {
            console.error('[InvestigationQueue] Error in onComplete callback:', error);
          }
        }
      }
    };

    const failedHandler = (eventData) => {
      if (eventData.jobId === jobId) {
        console.error(`[InvestigationQueue] Job failed: ${jobId} - ${eventData.failedReason}`);
        if (onFailed) {
          try {
            onFailed(new Error(eventData.failedReason));
          } catch (error) {
            console.error('[InvestigationQueue] Error in onFailed callback:', error);
          }
        }
      }
    };

    // Attach event listeners
    queueEvents.on('progress', progressHandler);
    queueEvents.on('completed', completeHandler);
    queueEvents.on('failed', failedHandler);

    // Return cleanup function
    const cleanup = async () => {
      try {
        queueEvents.off('progress', progressHandler);
        queueEvents.off('completed', completeHandler);
        queueEvents.off('failed', failedHandler);
        await queueEvents.close();
        console.log(`[InvestigationQueue] Cleaned up listeners for job ${jobId}`);
      } catch (error) {
        console.error('[InvestigationQueue] Error during cleanup:', error);
      }
    };

    return cleanup;
  } catch (error) {
    console.error('[InvestigationQueue] Failed to subscribe to job progress:', error);
    throw error;
  }
};

/**
 * Close the investigation queue
 * @returns {Promise<void>}
 */
export const closeInvestigationQueue = async () => {
  try {
    if (investigationQueue) {
      await investigationQueue.close();
      investigationQueue = null;
      console.log('[InvestigationQueue] ✓ Queue closed');
    }
  } catch (error) {
    console.error('[InvestigationQueue] Error closing queue:', error);
    throw error;
  }
};

export const getQueueStats = async () => {
  const queue = getInvestigationQueue();
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);
  return { waiting, active, completed, failed, delayed };
};

export const getFailedJobs = async (start = 0, end = 99) => {
  const queue = getInvestigationQueue();
  return queue.getFailed(start, end);
};

export const retryJob = async (jobId) => {
  const queue = getInvestigationQueue();
  const job = await queue.getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  await job.retry();
  return job;
};

export const deleteJob = async (jobId) => {
  const queue = getInvestigationQueue();
  const job = await queue.getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  await job.remove();
};

export default {
  dispatchInvestigation,
  getJobStatus,
  subscribeToJobProgress,
  closeInvestigationQueue,
  getInvestigationQueue,
  getQueueStats,
  getFailedJobs,
  retryJob,
  deleteJob,
};
