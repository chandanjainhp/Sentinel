import { Worker } from "bullmq";
import { explainIncident } from "../services/argus-explain.service.js";

let workerInstance = null;

export const startArgusExplainWorker = (connection) => {
  if (workerInstance) return workerInstance;

  // Must match the producer's queue name (see argus-explain.queue.js).
  const queueName = process.env.ARGUS_EXPLAIN_QUEUE_NAME || "argus-explain";
  workerInstance = new Worker(
    queueName,
    async (job) => {
      if (job.name === "explain") {
        return explainIncident(job.data);
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
    console.log(
      `[ArgusExplainWorker] ✓ Job completed: ${job.id} | source=${result?.source} status=${result?.status}`
    );
  });

  workerInstance.on("failed", (job, error) => {
    // explainIncident is written to never throw after the incident is loaded;
    // a failure here means the incident itself was not found. Nothing to retry.
    console.error(`[ArgusExplainWorker] ✗ Job failed: ${job?.id} - ${error.message}`);
  });

  return workerInstance;
};

export const stopArgusExplainWorker = async () => {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
  }
};
