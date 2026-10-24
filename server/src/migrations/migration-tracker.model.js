/**
 * Migration Tracker Model
 *
 * Tracks which migrations have been applied to the database.
 * This ensures migrations are run exactly once and in order.
 */

import mongoose from 'mongoose';

const migrationTrackerSchema = new mongoose.Schema(
  {
    migrationId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      description: 'Unique identifier for the migration (e.g., "202610220001_add_userId_to_investigations")',
    },
    
    version: {
      type: String,
      required: true,
      trim: true,
      description: 'Migration version identifier (e.g., "2026.10.22-001")',
    },
    
    name: {
      type: String,
      required: true,
      trim: true,
      description: 'Human-readable name for the migration',
    },
    
    description: {
      type: String,
      required: true,
      trim: true,
      description: 'Description of what the migration does',
    },
    
    appliedAt: {
      type: Date,
      required: true,
      default: Date.now,
      description: 'When the migration was applied',
    },
    
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'rolled_back'],
      default: 'pending',
      description: 'Current status of the migration',
    },
    
    durationMs: {
      type: Number,
      description: 'How long the migration took to run in milliseconds',
    },
    
    errorMessage: {
      type: String,
      trim: true,
      description: 'Error message if migration failed',
    },
    
    checksum: {
      type: String,
      trim: true,
      description: 'Checksum of migration file for integrity verification',
    },
    
    // Index for fast lookups
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for ordering migrations
migrationTrackerSchema.index({ version: 1 }, { unique: true });
migrationTrackerSchema.index({ appliedAt: 1 });
migrationTrackerSchema.index({ status: 1 });

// Ensure virtuals are included in JSON output
migrationTrackerSchema.set('toJSON', { virtuals: true });

// Add a virtual for display purposes
migrationTrackerSchema.virtual('displayName').get(function () {
  return `${this.version} - ${this.name}`;
});

export default mongoose.model('MigrationTracker', migrationTrackerSchema);
