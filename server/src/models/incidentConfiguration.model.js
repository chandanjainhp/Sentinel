import mongoose from "mongoose";

/**
 * Automated monitoring schedule for one site.
 *
 * One document per (user, site) — the scheduler reads these as the source of
 * truth and projects the values onto the Site's legacy monitoring fields so
 * older clients (Settings page, site PATCH) stay consistent. Times are local
 * wall-clock times in `timezone`; the scheduler converts them to UTC per
 * reporting date (DST-safe via zonedDateTimeToUtc).
 *
 * `startTime === endTime` is rejected by validation: a zero-length window
 * would either never run or run for a full day depending on interpretation.
 */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const incidentConfigurationSchema = new mongoose.Schema(
  {
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
    enabled: { type: Boolean, default: true },
    timezone: { type: String, required: true, trim: true, default: "UTC" },
    startTime: { type: String, required: true, match: TIME_RE, default: "00:00" },
    endTime: { type: String, required: true, match: TIME_RE, default: "09:00" },
    scheduleType: {
      type: String,
      enum: ["daily"],
      default: "daily",
    },
  },
  { timestamps: true }
);

// One schedule per site; this is also the upsert key.
incidentConfigurationSchema.index({ userId: 1, siteId: 1 }, { unique: true });
incidentConfigurationSchema.index({ userId: 1, updatedAt: -1 });

export const IncidentConfiguration = mongoose.model(
  "IncidentConfiguration",
  incidentConfigurationSchema
);
export default IncidentConfiguration;
