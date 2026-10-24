import { Worker } from "bullmq";
import Investigation from "../models/investigation.model.js";
import { analyzeInvestigation } from "../services/investigation.service.js";
import { resolveInvestigationQueueName } from "./investigation.queue.js";
import { recordInvestigationOutcome } from "../utils/metrics.js";

let workerInstance = null;

/**
 * Investigation worker — consumes the legacy 'investigations' queue that had
 * Each job investigates one incident, first using the configured LLM and then
 * the deterministic trace/classification when the provider or response fails.
 */
export const startInvestigationWorker = (connection) => {
  if (workerInstance) return workerInstance;

  const queueName = resolveInvestigationQueueName();

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

      if (doc.status === "complete") {
        return { investigationId, status: "complete", toolCalls: doc.totalToolCalls || 0 };
      }

      doc.status = "running";
      if (!doc.jobId) doc.jobId = String(job.id);
      await doc.save({ validateBeforeSave: false });

      try {
        const result = await analyzeInvestigation({ incidentId, nightDate });

        doc.toolCallSequence = result.toolCallSequence;
        doc.evidenceChain = result.evidenceChain;
        doc.classification = result.classification;
        doc.resultSource = result.resultSource;
        doc.provider = result.provider;
        doc.agentModel = result.agentModel;
        doc.executiveSummary = result.executiveSummary;
        doc.findings = result.findings;
        doc.rootCause = result.rootCause;
        doc.recommendedActions = result.recommendedActions;
        doc.dataLimitations = result.dataLimitations;
        doc.unresolvedQuestions = result.unresolvedQuestions;
        doc.failureReason = result.failureReason;
        doc.totalToolCalls = result.toolCallSequence.length;
        doc.durationMs = Date.now() - new Date(job.data.dispatchedAt || Date.now()).getTime();
        doc.status = "complete";
        const update = doc.toObject();
        delete update._id;
        delete update.__v;
        const saved = await Investigation.findOneAndUpdate(
          { _id: doc._id, status: "running", jobId: String(job.id) },
          { $set: update },
          { new: true, runValidators: false },
        );
        if (!saved) return { investigationId, status: "stale", source: result.resultSource };

        return {
          investigationId,
          status: "complete",
          severity: result.classification.severity,
          source: result.resultSource,
          toolCalls: result.toolCallSequence.length,
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
    // Record successful investigation completion
    if (result?.severity) {
      recordInvestigationOutcome(result.severity);
    }
  });

  workerInstance.on("failed", (job, error) => {
    console.error(`[InvestigationWorker] ✗ Job failed: ${job?.id} - ${error.message}`);
    // Record failed investigation
    recordInvestigationOutcome('failed');
  });

  return workerInstance;
};

export const stopInvestigationWorker = async () => {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
  }
};
