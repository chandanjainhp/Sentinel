import { Worker } from "bullmq";
import { explainIncident } from "../services/argus-explain.service.js";
import logger from "../utils/logger.js";

let workerInstance = null;

export const startArgusExplainWorker = (connection) => {
  if (workerInstance) return workerInstance;

  // Must match the producer's queue name (see argus-explain.queue.js).
  const queueName = process.env.ARGUS_EXPLAIN_QUEUE_NAME || "argus-explain";
  workerInstance = new Worker(
    queueName,
    async (job) => {
      if (job.name === "explain") {
        logger.info({ jobId: job.id, incidentId: job.data?.incidentId }, "Argus job started");
        return explainIncident({ ...job.data, jobId: job.id });
      }
      throw new Error(`Unknown job name: ${job.name}`);
    },
    {
      connection,
      // Explanations are one LLM call each; keep the pipeline lane free.
      concurrency: 1,
    }
  );

  workerInstance.on("completed", (job, result) => {
    logger.info({ jobId: job.id, incidentId: job.data?.incidentId, source: result?.source, status: result?.status }, "Argus job completed");
  });

  workerInstance.on("failed", (job, error) => {
    // explainIncident is written to never throw after the incident is loaded;
    // a failure here means the incident itself was not found. Nothing to retry.
    logger.error({ jobId: job?.id, incidentId: job?.data?.incidentId, error: error.message.slice(0, 200) }, "Argus job failed");
  });

  return workerInstance;
};

export const stopArgusExplainWorker = async () => {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
  }
};
