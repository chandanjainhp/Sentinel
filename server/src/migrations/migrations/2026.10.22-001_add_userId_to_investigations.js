/**
 * Migration 2026.10.22-001: Add userId to Investigations
 *
 * This migration adds the userId field to existing investigation documents
 * that were created before the schema change. The userId is inferred from
 * the associated incident's userId.
 *
 * MIGRATION: {"version": "2026.10.22-001", "name": "Add userId to investigations", "description": "Adds userId field to investigation documents, inferred from associated incident"}
 */

import Investigation from '../../models/investigation.model.js';
import { Incident } from '../../models/incident.model.js';
import logger from '../../utils/logger.js';

/**
 * Check if this migration is needed and safe to run
 */
export const preflightCheck = async () => {
  try {
    // Check if there are any investigations without userId
    const countWithoutUserId = await Investigation.countDocuments({
      $or: [
        { userId: { $exists: false } },
        { userId: null },
      ],
    });

    // Check if userId field exists in schema
    const schema = Investigation.schema;
    const hasUserId = schema.paths.userId !== undefined;

    if (!hasUserId) {
      return {
        ok: false,
        reason: 'userId field does not exist in Investigation schema',
      };
    }

    if (countWithoutUserId === 0) {
      return {
        ok: true,
        reason: 'No investigations without userId found. Migration may have already been applied.',
        countWithoutUserId,
      };
    }

    return {
      ok: true,
      countWithoutUserId,
      message: `Found ${countWithoutUserId} investigations without userId`,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error.message,
    };
  }
};

/**
 * Apply the migration
 */
export const up = async () => {
  logger.info('[Migration 2026.10.22-001] Starting migration to add userId to investigations');

  const preflight = await preflightCheck();
  if (!preflight.ok) {
    throw new Error(preflight.reason);
  }

  if (preflight.countWithoutUserId === 0) {
    logger.info('[Migration 2026.10.22-001] No investigations need migration');
    return { ok: true, message: 'No investigations to migrate' };
  }

  logger.info(
    `[Migration 2026.10.22-001] Migrating ${preflight.countWithoutUserId} investigations`
  );

  // Batch process to avoid memory issues
  const BATCH_SIZE = 100;
  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  const cursor = Investigation.find({
    $or: [
      { userId: { $exists: false } },
      { userId: null },
    ],
  }).cursor();

  while (await cursor.hasNext()) {
    const batch = await cursor.nextBatch(BATCH_SIZE);
    
    for (const doc of batch) {
      processed++;
      
      try {
        // Skip if already has userId
        if (doc.userId) {
          skipped++;
          continue;
        }

        // Find the associated incident to get userId
        const incident = await Incident.findById(doc.incidentId);
        
        if (!incident) {
          logger.warn(
            `[Migration 2026.10.22-001] Incident not found for investigation ${doc._id}, skipping`
          );
          skipped++;
          continue;
        }

        // Update the investigation with userId
        await Investigation.updateOne(
          { _id: doc._id },
          { $set: { userId: incident.userId } }
        );
        
        updated++;
        
        if (processed % 10 === 0) {
          logger.info(
            `[Migration 2026.10.22-001] Processed ${processed}/${preflight.countWithoutUserId} (updated: ${updated}, skipped: ${skipped})`
          );
        }
      } catch (error) {
        errors++;
        logger.error(
          `[Migration 2026.10.22-001] Error migrating investigation ${doc?._id}: ${error.message}`
        );
      }
    }
  }

  logger.info(
    `[Migration 2026.10.22-001] Migration complete. Processed: ${processed}, Updated: ${updated}, Skipped: ${skipped}, Errors: ${errors}`
  );

  if (errors > 0) {
    return {
      ok: false,
      message: `Migration completed with ${errors} errors`,
      processed,
      updated,
      skipped,
      errors,
    };
  }

  return {
    ok: true,
    message: `Successfully migrated ${updated} investigations`,
    processed,
    updated,
    skipped,
    errors,
  };
};

/**
 * Rollback the migration (if possible)
 * 
 * WARNING: This rollback will REMOVE the userId field from investigations.
 * This may break functionality that depends on the userId field.
 * Always backup your database before rolling back.
 */
export const down = async () => {
  logger.warn('[Migration 2026.10.22-001] Rolling back - removing userId from investigations');
  logger.warn('[Migration 2026.10.22-001] This may break investigation ownership validation!');

  // Count investigations with userId set
  const countWithUserId = await Investigation.countDocuments({
    userId: { $exists: true, $ne: null },
  });

  if (countWithUserId === 0) {
    return {
      ok: true,
      message: 'No investigations with userId to rollback',
    };
  }

  logger.info(
    `[Migration 2026.10.22-001] Rolling back ${countWithUserId} investigations`
  );

  // Remove userId from all investigations
  const result = await Investigation.updateMany(
    { userId: { $exists: true } },
    { $unset: { userId: "" } }
  );

  logger.info(
    `[Migration 2026.10.22-001] Removed userId from ${result.modifiedCount} investigations`
  );

  return {
    ok: true,
    message: `Removed userId from ${result.modifiedCount} investigations`,
    modifiedCount: result.modifiedCount,
  };
};

export default {
  preflightCheck,
  up,
  down,
};
