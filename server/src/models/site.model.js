import mongoose from "mongoose";
import crypto from "node:crypto";

const coordinatesSchema = new mongoose.Schema(
  {
    lat: Number,
    lng: Number,
  },
  { _id: false }
);

const siteSchema = new mongoose.Schema(
  {
    siteId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => `site_${crypto.randomUUID()}`,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    industry: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },

    timezone: {
      type: String,
      required: true,
      default: "UTC",
    },

    coordinates: {
      type: coordinatesSchema,
      default: null,
    },

    status: {
      type: String,
      enum: ["active", "inactive", "maintenance"],
      default: "active",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

siteSchema.index(
  { userId: 1, name: 1 },
  { unique: true }
);

export const Site = mongoose.model("Site", siteSchema);
export default Site;