import { Worker } from "bullmq";
import Investigation from "../models/investigation.model.js";
import { buildInvestigationTrace } from "../services/investigation.service.js";

let workerInstance = null;

/**
 * Investigation worker — consumes the legacy 'investigations' queue that had
 * no consumer. Each job investigates ONE incident: gathers overnight sensor
 * aggregates, builds a deterministic tool-call trace + evidence chain, and
 * persists the Investigation doc (status: running → complete/failed).
 *
 * Deterministic on purpose: same thresholds as the health pipeline, no LLM
 * dependency, so the Overnight Investigation always works, including offline.
 */
export const startInvestigationWorker = (connection) => {
  if (workerInstance) return workerInstance;

  const queueName = process.env.INVESTIGATION_QUEUE_NAME || "investigations";

  workerInstance = new Worker(
    queueName,
    async (job) => {
      const { investigationId, incidentId, nightDate } = job.data;
      if (!investigationId || !incidentId || !nightDate) {
        throw new Error(`Malformed investigation job ${job.id}: missing fields`);
      }

      const doc = await Investigation.findById(investigationId);
      if (!doc) {
        // Re-seeded DB etc. — nothing to update, fail fast (attempts: 2).
        throw new Error(`Investigation doc ${investigationId} not found`);
      }

      doc.status = "running";
      await doc.save({ validateBeforeSave: false });

      try {
        const trace = await buildInvestigationTrace({ incidentId, nightDate });

        doc.toolCallSequence = trace.toolCallSequence;
        doc.evidenceChain = trace.evidenceChain;
        doc.classification = trace.classification;
        doc.totalToolCalls = trace.toolCallSequence.length;
        doc.durationMs = Date.now() - new Date(job.data.dispatchedAt || Date.now()).getTime();
        doc.status = "complete";
        await doc.save({ validateBeforeSave: false });

        return {
          investigationId,
          status: "complete",
          severity: trace.classification.severity,
          toolCalls: trace.toolCallSequence.length,
        };
      } catch (err) {
        doc.status = "failed";
        doc.failureReason = err.message.slice(0, 500);
        await doc.save({ validateBeforeSave: false });
        throw err;
      }
    },
    {
      connection,
      // Aggregations are cheap; still keep it gentle.
      concurrency: 2,
    }
  );

  workerInstance.on("completed", (job, result) => {
    console.log(
      `[InvestigationWorker] ✓ Job completed: ${job.id} | incident=${job.data?.incidentId} severity=${result?.severity}`
    );
  });

  workerInstance.on("failed", (job, error) => {
    console.error(`[InvestigationWorker] ✗ Job failed: ${job?.id} - ${error.message}`);
  });

  return workerInstance;
};

export const stopInvestigationWorker = async () => {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
  }
};
