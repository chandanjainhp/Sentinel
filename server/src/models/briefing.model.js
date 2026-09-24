import mongoose from 'mongoose';

const briefingSectionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    content: mongoose.Schema.Types.Mixed,
    lastEditedAt: Date,
  },
  { _id: false }
);

const briefingSchema = new mongoose.Schema(
  {
    briefingId: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    nightDate: {
      type: String,
      required: true,
      index: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    generatedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    status: {
      type: String,
      enum: ['generating', 'draft', 'approved', 'failed'],
      default: 'draft',
      index: true,
    },
    sections: [briefingSectionSchema],
    metadata: mongoose.Schema.Types.Mixed,
    generationStartedAt: Date,
    generationCompletedAt: Date,
    failureReason: String,
    approvedAt: Date,
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

briefingSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Briefing', briefingSchema);
