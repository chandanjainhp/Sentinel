import mongoose from "mongoose";
import crypto from "node:crypto";

const sensorSchema = new mongoose.Schema(
  {
    sensorId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => `sensor_${crypto.randomUUID()}`,
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

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    type: {
      type: String,
      enum: [
        "temperature",
        "vibration",
        "pressure",
        "current",
        "voltage",
        "rpm",
        "flow",
      ],
      required: true,
      index: true,
    },

    unit: {
      type: String,
      trim: true,
      default: "",
    },

    // Expected seconds between readings. Connectivity status is computed from
    // this and lastReadingAt on every read — status is never stored.
    expectedIntervalSec: {
      type: Number,
      min: 1,
      default: 60,
    },

    // Date of the most recent ingested reading. Null until the first event.
    lastReadingAt: {
      type: Date,
      default: null,
      index: true,
    },

    samplingRate: {
      type: Number,
      min: 0,
      default: null,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

sensorSchema.index(
  { userId: 1, sensorId: 1 },
  { unique: true }
);

export const Sensor = mongoose.model(
  "Sensor",
  sensorSchema
);
export default Sensor;
