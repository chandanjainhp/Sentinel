import mongoose from 'mongoose';
import crypto from 'node:crypto';
import { BRIEFING_SECTIONS } from '../utils/constants.js';

const briefingSectionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      enum: Object.values(BRIEFING_SECTIONS),
    },
    content: mongoose.Schema.Types.Mixed,
    lastEditedAt: Date,
  },
  { _id: false }
);

const briefingSchema = new mongoose.Schema(
  {
    // Owner. Every read/write is scoped by this — never by a client-supplied
    // user id (same rule as incidents and API keys).
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    briefingId: {
      type: String,
      unique: true,
      required: true,
      index: true,
      default: () => `briefing_${crypto.randomUUID()}`,
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

// "Latest briefing for this user / night" is the page's only hot query, and
// one briefing per night is the product rule. Partial on userId so legacy
// pre-ownership documents (no userId) can never block index creation.
briefingSchema.index(
  { userId: 1, nightDate: 1 },
  { unique: true, partialFilterExpression: { userId: { $exists: true } } }
);

briefingSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Briefing', briefingSchema);
