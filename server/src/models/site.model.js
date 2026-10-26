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
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    nameNormalized: { type: String, index: true },
    country: { type: String, trim: true, default: "" },
    postalCode: { type: String, trim: true, default: null },
    city: { type: String, trim: true, default: "" },
    cityNormalized: { type: String, index: true, default: "" },
    cityVerified: { type: Boolean, default: false },

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
      default: "Asia/Kolkata",
    },
    monitoringEnabled: { type: Boolean, default: true },
    monitoringStartTime: {
      type: String,
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
      default: "00:00",
    },
    monitoringEndTime: {
      type: String,
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
      default: "09:00",
    },

    coordinates: {
      type: coordinatesSchema,
      default: null,
    },

    status: {
      type: String,
      enum: ["active", "inactive", "maintenance", "disabled"],
      default: "active",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

siteSchema.index({ userId: 1, nameNormalized: 1, cityNormalized: 1 }, { unique: true, sparse: true });
siteSchema.pre("validate", function normalizeSiteFields(next) {
  this.nameNormalized = this.name?.trim().replace(/\s+/g, " ").toLowerCase();
  this.cityNormalized = this.city?.trim().replace(/\s+/g, " ").toLowerCase();
  if (!this.accountId) this.accountId = this.userId;
  next();
});

export const Site = mongoose.model("Site", siteSchema);
export default Site;
