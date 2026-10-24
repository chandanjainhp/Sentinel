import mongoose from "mongoose";

const overnightHealthRunSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: "Site", required: true, index: true },
    reportingDate: { type: String, required: true },
    timezone: { type: String, required: true },
    windowStartAt: { type: Date, required: true },
    windowEndAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ["scheduled", "running", "completed", "completed_with_warnings", "failed"],
      default: "scheduled",
      index: true,
    },
    progress: { type: Number, min: 0, max: 100, default: 0 },
    expectedMachines: { type: Number, default: 0 },
    assessedMachines: { type: Number, default: 0 },
    healthyMachines: { type: Number, default: 0 },
    abnormalMachines: { type: Number, default: 0 },
    unassessedMachines: { type: Number, default: 0 },
    sensorCoverageGaps: { type: [mongoose.Schema.Types.Mixed], default: [] },
    machineResults: { type: [mongoose.Schema.Types.Mixed], default: [] },
    incidents: { type: [mongoose.Schema.Types.Mixed], default: [] },
    errorDetails: { type: [String], default: [] },
    retryCount: { type: Number, default: 0 },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    reportGeneratedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

overnightHealthRunSchema.index({ siteId: 1, reportingDate: 1 }, { unique: true });
overnightHealthRunSchema.index({ userId: 1, createdAt: -1 });

export const OvernightHealthRun = mongoose.model("OvernightHealthRun", overnightHealthRunSchema);
export default OvernightHealthRun;
