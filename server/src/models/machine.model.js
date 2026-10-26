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
    nameNormalized: { type: String, index: true },

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
        "disabled",
        "deleted",
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
machineSchema.index({ siteId: 1, nameNormalized: 1 }, { unique: true, sparse: true });
machineSchema.pre("validate", function normalizeMachineName(next) {
  this.nameNormalized = this.name?.trim().replace(/\s+/g, " ").toLowerCase();
  next();
});

export const Machine = mongoose.model(
  "Machine",
  machineSchema
);
export default Machine;