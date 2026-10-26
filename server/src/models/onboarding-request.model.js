import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    idempotencyKey: { type: String, required: true },
    result: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

schema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
export const OnboardingRequest = mongoose.model("OnboardingRequest", schema);
