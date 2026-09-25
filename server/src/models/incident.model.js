import mongoose from "mongoose";
import crypto from "node:crypto";

/**
 * Argus explanation sub-document. Written only by the argus-explain worker —
 * incident creation leaves it null so the UI can distinguish "not yet
 * explained" (null) from "explanation failed" (status: "failed").
 */
const explanationSchema = new mongoose.Schema(
  {
    summary: { type: String, default: "", maxlength: 2000 },
    likelyCause: { type: String, default: "", maxlength: 2000 },
    recommendedAction: { type: String, default: "", maxlength: 2000 },
    urgency: {
      type: String,
      enum: ["now", "soon", "monitor"],
      default: "monitor",
    },
    source: {
      type: String,
      enum: ["llm", "fallback"],
      required: true,
    },
    provider: { type: String, default: null },
    model: { type: String, default: null },
    generatedAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["pending", "ready", "failed"],
      default: "pending",
    },
    /** Deterministic fallback text for the last failed LLM attempt, if any. */
    error: { type: String, default: null },
  },
  { _id: false }
);

const incidentSchema = new mongoose.Schema(
  {
    incidentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => `incident_${crypto.randomUUID()}`,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    siteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Site",
      required: true,
      index: true,
    },

    machineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Machine",
      required: true,
      index: true,
    },

    predictionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Prediction",
      default: null,
    },

    type: {
      type: String,
      enum: [
        "anomaly",
        "fault_risk",
        "rul_risk",
        "machine_health",
      ],
      required: true,
      index: true,
    },

    severity: {
      type: String,
      enum: [
        "critical",
        "warning",
        "minor",
        "unknown",
      ],
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },

    evidence: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    status: {
      type: String,
      enum: ["open", "reviewed", "closed"],
      default: "open",
      index: true,
    },

    explanation: {
      type: explanationSchema,
      default: null,
    },

    /** How many predictions have landed on this incident (Fix B). */
    occurrenceCount: {
      type: Number,
      min: 1,
      default: 1,
    },

    /** Last time a prediction confirmed this incident. */
    lastSeenAt: {
      type: Date,
      default: null,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    closedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

incidentSchema.index({
  userId: 1,
  machineId: 1,
  createdAt: -1,
});

// The dedup/escalation lookup in createIncidentIfEligible filters by exactly
// these fields (status in open/reviewed, per machine).
incidentSchema.index({
  machineId: 1,
  status: 1,
  createdAt: -1,
});

export const Incident = mongoose.model(
  "Incident",
  incidentSchema
);
export default Incident;