import { Worker } from "bullmq";
import { runPrediction } from "../services/prediction.service.js";

let workerInstance = null;

export const startPredictionWorker = (connection) => {
  if (workerInstance) return workerInstance;

  workerInstance = new Worker(
    "prediction",
    async (job) => {
      if (job.name === "predict") {
        return runPrediction(job.data);
      }
      throw new Error(`Unknown job name: ${job.name}`);
    },
    {
      connection,
      concurrency: 2,
    }
  );

  workerInstance.on("completed", (job, result) => {
    console.log(`[PredictionWorker] ✓ Job completed: ${job.id}`, result);
  });

  workerInstance.on("failed", (job, error) => {
    console.error(`[PredictionWorker] ✗ Job failed: ${job.id} - ${error.message}`);
  });

  return workerInstance;
};

export const stopPredictionWorker = async () => {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
  }
};