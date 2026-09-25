import { Queue } from "bullmq";
import { getRedis } from "../db/redis.js";

/**
 * argus-explain queue (Fix A / Wave 4).
 *
 * jobId convention: `argus-<incidentId>-<severity>` — BullMQ deduplicates by
 * job id, so a job with the same id is not re-run. Re-explanations therefore
 * happen only when:
 *   - the incident is NEW (first job for this incident id),
 *   - severity escalates (new id with the new severity),
 *   - a user explicitly regenerates (REGENERATE_SUFFIX keeps the id distinct
 *     from the automatic one so it always re-runs).
 */

export const ARGUS_EXPLAIN_JOB_PREFIX = "argus-";
export const REGENERATE_SUFFIX = "-manual";

export const argusExplainJobId = (incidentId, severity) =>
  `${ARGUS_EXPLAIN_JOB_PREFIX}${incidentId}-${severity}`;

// Monotonic suffix so two regenerates in the same millisecond stay unique.
let regenerateCounter = 0;

export const argusRegenerateJobId = (incidentId, severity) => {
  regenerateCounter += 1;
  return `${argusExplainJobId(incidentId, severity)}${REGENERATE_SUFFIX}-${Date.now()}-${regenerateCounter}`;
};

const ARGUS_EXPLAIN_QUEUE_NAME =
  process.env.ARGUS_EXPLAIN_QUEUE_NAME || "argus-explain";

let argusExplainQueueInstance = null;
let argusExplainQueueConnection = null;

export const getArgusExplainQueue = () => {
  const connection = getRedis();
  // Rebuild when the Redis client was reconnected (mirrors prediction.queue.js).
  if (!argusExplainQueueInstance || argusExplainQueueConnection !== connection) {
    argusExplainQueueInstance = new Queue(ARGUS_EXPLAIN_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        // Explanations must never block the pipeline: failures are recorded
        // in the incident's explanation.error by the service itself.
        removeOnComplete: true,
        removeOnFail: true,
        attempts: 1,
      },
    });
    argusExplainQueueConnection = connection;
  }
  return argusExplainQueueInstance;
};

/**
 * Enqueue an explanation job. Fire-and-forget safe: enqueue failures are
 * logged, never thrown into the incident pipeline.
 */
export const dispatchArgusExplain = async ({ incidentId, severity, jobId }) => {
  try {
    const queue = getArgusExplainQueue();
    const job = await queue.add(
      "explain",
      { incidentId },
      { jobId: jobId || argusExplainJobId(incidentId, severity) }
    );
    console.log(
      `[ArgusExplainQueue] Job dispatched: ${job.id} | Incident: ${incidentId} | Severity: ${severity}`
    );
    return job;
  } catch (err) {
    console.error(
      `[ArgusExplainQueue] Failed to dispatch explanation for ${incidentId}:`,
      err.message
    );
    return null;
  }
};

export const closeArgusExplainQueue = async () => {
  if (argusExplainQueueInstance) {
    await argusExplainQueueInstance.close();
    argusExplainQueueInstance = null;
  }
};
