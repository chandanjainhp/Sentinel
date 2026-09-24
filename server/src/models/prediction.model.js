import mongoose from "mongoose";
import crypto from "node:crypto";

const predictionSchema = new mongoose.Schema(
  {
    predictionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => `prediction_${crypto.randomUUID()}`,
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

    model: {
      type: String,
      required: true,
      trim: true,
    },

    modelVersion: {
      type: String,
      required: true,
      trim: true,
    },

    timestamp: {
      type: Date,
      required: true,
      index: true,
    },

    rulValue: {
      type: Number,
      min: 0,
      default: null,
    },

    rulUnit: {
      type: String,
      enum: ["cycles", "hours", "days", null],
      default: null,
    },

    anomalyScore: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
    },

    faultProbability: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
    },

    faultType: {
      type: String,
      default: null,
    },

    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
    },

    evidence: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

predictionSchema.index({
  userId: 1,
  machineId: 1,
  timestamp: -1,
});

export const Prediction = mongoose.model(
  "Prediction",
  predictionSchema
);
export default Prediction;