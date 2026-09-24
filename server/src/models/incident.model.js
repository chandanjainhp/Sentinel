import mongoose from "mongoose";
import crypto from "node:crypto";

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

export const Incident = mongoose.model(
  "Incident",
  incidentSchema
);
export default Incident;