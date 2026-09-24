import mongoose from "mongoose";
import crypto from "node:crypto";

const machineSchema = new mongoose.Schema(
  {
    machineId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => `machine_${crypto.randomUUID()}`,
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

    assetId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    machineType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    manufacturer: {
      type: String,
      trim: true,
      default: "",
    },

    model: {
      type: String,
      trim: true,
      default: "",
    },

    serialNumber: {
      type: String,
      trim: true,
      default: "",
    },

    location: {
      type: String,
      trim: true,
      default: "",
    },

    zone: {
      type: String,
      trim: true,
      default: "",
    },

    status: {
      type: String,
      enum: [
        "healthy",
        "warning",
        "critical",
        "offline",
        "maintenance",
        "unknown",
      ],
      default: "unknown",
      index: true,
    },

    /** Why the machine is UNKNOWN (missing channels, ML unreachable, …). */
    healthUnknownReason: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

machineSchema.index(
  { userId: 1, assetId: 1 },
  { unique: true }
);

export const Machine = mongoose.model(
  "Machine",
  machineSchema
);
export default Machine;