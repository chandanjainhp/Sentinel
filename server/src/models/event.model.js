import mongoose from "mongoose";
import crypto from "node:crypto";

const eventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => `event_${crypto.randomUUID()}`,
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

    sensorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sensor",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: [
        "sensor_reading",
        "equipment_anomaly",
        "machine_state_change",
      ],
      default: "sensor_reading",
      index: true,
    },

    timestamp: {
      type: Date,
      required: true,
      index: true,
    },

    values: {
      type: Map,
      of: Number,
      required: true,
    },

    rawData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    source: {
      type: String,
      enum: [
        "api",
        "edge",
        "gateway",
        "opcua",
        "mqtt",
        "manual",
      ],
      default: "api",
    },

    severity: {
      type: String,
      enum: [
        "critical",
        "warning",
        "minor",
        "harmless",
        "unknown",
      ],
      default: "unknown",
      index: true,
    },

    idempotencyKey: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

eventSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true }
);

eventSchema.index({
  userId: 1,
  machineId: 1,
  timestamp: -1,
});

export const Event = mongoose.model(
  "Event",
  eventSchema
);
export default Event;