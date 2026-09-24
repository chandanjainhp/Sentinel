import mongoose from 'mongoose';

const investigationSchema = new mongoose.Schema(
  {
    incidentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Incident',
      required: true,
      index: true,
    },

    // Night and timing
    nightDate: {
      type: String,
      required: true,
      index: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },

    status: {
      type: String,
      enum: ['queued', 'running', 'complete', 'failed'],
      default: 'queued',
      index: true,
    },

    // Job tracking
    jobId: {
      type: String,
      index: true,
      description: 'BullMQ job ID for SSE stream matching',
    },

    agentModel: {
      type: String,
      description: 'Claude model version used, e.g. "claude-sonnet-4-20250514"',
    },

    // Tool calls sequence
    toolCallSequence: [
      {
        callIndex: Number,
        toolName: String,
        toolInput: mongoose.Schema.Types.Mixed,
        toolResult: mongoose.Schema.Types.Mixed,
        durationMs: Number,
        timestamp: Date,
        agentReasoningBefore: {
          type: String,
          description: 'Agent explanation before executing this tool',
        },
        significance: {
          type: String,
          enum: ['critical', 'supporting', 'inconclusive'],
          description: 'How important was this tool call to the final verdict',
        },
      },
    ],

    // Evidence trail
    evidenceChain: [
      {
        step: Number,
        finding: {
          type: String,
          description: 'Plain English — what was learned at this step',
        },
        source: {
          type: String,
          description: 'Which tool or observation provided this',
        },
        confidence: {
          type: String,
          enum: ['high', 'medium', 'low', 'uncertain'],
        },
      },
    ],

    classification: {
      severity: {
        type: String,
        enum: ['serious', 'minor', 'harmless', 'uncertain'],
        required: true,
      },
      confidence: {
        type: Number,
        min: 0,
        max: 1,
      },
      reasoning: String,
      uncertainties: [String],
      recommendedFollowup: String,
    },

    // Resource usage
    tokenUsage: {
      inputTokens: Number,
      outputTokens: Number,
    },

    // Investigation metrics
    totalToolCalls: Number,
    durationMs: Number,

    // Failure tracking
    failureReason: {
      type: String,
      description: 'Reason if status is failed or incomplete',
    },

    // Legacy fields (for compatibility)
    investigationIdLegacy: String,
    aiAgent: String,
    findings: [
      {
        category: String,
        detail: String,
        severity: String,
      },
    ],
    rootCause: String,
    recommendedActions: [String],
    executionLogs: [
      {
        timestamp: Date,
        action: String,
        result: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes for common queries
investigationSchema.index({ nightDate: 1, status: 1 });
investigationSchema.index({ status: 1, createdAt: -1 });

// Ensure virtuals are included in JSON output
investigationSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Investigation', investigationSchema);
