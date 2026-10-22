/**
 * Migration Runner
 *
 * Executes database migrations in order, tracking progress to ensure
 * each migration runs exactly once.
 *
 * Features:
 * - Ordered migration execution
 * - Pre-flight checks for safety
 * - Duplicate prevention
 * - Error handling and status tracking
 * - Idempotent operations where possible
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import MigrationTracker from './migration-tracker.model.js';
import logger from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Migration directory
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Migration status constants
 */
export const MIGRATION_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  ROLLED_BACK: 'rolled_back',
};

/**
 * Sort migrations by version (semantic versioning: YYYY.MM.DD-XXX)
 */
const sortMigrationsByVersion = (migrations) => {
  return migrations.sort((a, b) => a.version.localeCompare(b.version));
};

/**
 * Validate migration version format (YYYY.MM.DD-XXX)
 */
const validateVersion = (version) => {
  const regex = /^\d{4}\.\d{2}\.\d{2}-\d{3}$/;
  return regex.test(version);
};

/**
 * Load all migration files from the migrations directory
 */
const loadMigrationFiles = () => {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    logger.info('[Migration] No migrations directory found');
    return [];
  }

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.js') && file !== 'runner.js')
    .map((file) => path.join(MIGRATIONS_DIR, file));

  return files.map((filePath) => {
    const module = fs.readFileSync(filePath, 'utf8');
    
    // Extract metadata from the file
    // Format: // MIGRATION: {"version": "...", "name": "...", "description": "..."}
    const metadataRegex = /\/\/\s*MIGRATION:\s*({"[\s\S]*?"})/;
    const match = module.match(metadataRegex);
    
    if (!match) {
      throw new Error(`Migration file ${filePath} is missing MIGRATION metadata`);
    }
    
    let metadata;
    try {
      metadata = JSON.parse(match[1]);
    } catch (error) {
      throw new Error(`Invalid MIGRATION metadata in ${filePath}: ${error.message}`);
    }
    
    if (!metadata.version || !metadata.name || !metadata.description) {
      throw new Error(`Migration file ${filePath} has incomplete metadata`);
    }
    
    if (!validateVersion(metadata.version)) {
      throw new Error(`Invalid migration version format in ${filePath}: ${metadata.version}`);
    }
    
    const migrationId = path.basename(filePath, '.js');
    
    return {
      filePath,
      migrationId,
      ...metadata,
      module,
    };
  });
};

/**
 * Get all applied migrations from the database
 */
const getAppliedMigrations = async () => {
  return MigrationTracker.find().sort({ version: 1 });
};

/**
 * Record a migration as applied
 */
const recordMigration = async (migration, status, durationMs, errorMessage = null) => {
  const record = {
    migrationId: migration.migrationId,
    version: migration.version,
    name: migration.name,
    description: migration.description,
    status,
    durationMs,
    errorMessage,
  };

  // Upsert to handle duplicate runs
  await MigrationTracker.findOneAndUpdate(
    { migrationId: migration.migrationId },
    record,
    { upsert: true, new: true }
  );
};

/**
 * Execute a single migration
 */
const executeMigration = async (migration) => {
  const startTime = Date.now();
  
  try {
    logger.info(
      `[Migration] Starting migration ${migration.version} - ${migration.name}`
    );
    
    // Dynamically import and execute the migration
    const migrationModule = await import(migration.filePath);
    
    if (!migrationModule.up) {
      throw new Error(`Migration ${migration.version} is missing 'up' function`);
    }
    
    // Check preconditions
    if (migrationModule.preflightCheck) {
      logger.info(`[Migration] Running preflight check for ${migration.version}`);
      const preflightResult = await migrationModule.preflightCheck();
      if (!preflightResult.ok) {
        throw new Error(
          `Preflight check failed: ${preflightResult.reason || preflightResult.message}`
        );
      }
      logger.info(`[Migration] Preflight check passed for ${migration.version}`);
    }
    
    // Execute the migration
    const result = await migrationModule.up();
    
    if (!result || !result.ok) {
      throw new Error(
        `Migration ${migration.version} failed: ${result?.message || 'Unknown error'}`
      );
    }
    
    const durationMs = Date.now() - startTime;
    logger.info(
      `[Migration] Completed migration ${migration.version} in ${durationMs}ms`
    );
    
    // Record successful migration
    await recordMigration(migration, MIGRATION_STATUS.COMPLETED, durationMs);
    
    return { ok: true, migration, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error(
      `[Migration] Failed migration ${migration.version}: ${error.message}`
    );
    
    // Record failed migration
    await recordMigration(
      migration,
      MIGRATION_STATUS.FAILED,
      durationMs,
      error.message
    );
    
    return { ok: false, migration, durationMs, error: error.message };
  }
};

/**
 * Run all pending migrations
 */
export const runMigrations = async (options = {}) => {
  const {
    dryRun = false,
    toVersion = null,
    force = false,
  } = options;

  logger.info('[Migration] Starting migration runner');
  logger.info(`[Migration] Options: dryRun=${dryRun}, toVersion=${toVersion}, force=${force}`);

  // Ensure we're connected to MongoDB
  if (mongoose.connection.readyState !== 1) {
    throw new Error('MongoDB is not connected. Cannot run migrations.');
  }

  // Load migration files
  let migrations;
  try {
    migrations = loadMigrationFiles();
  } catch (error) {
    logger.error(`[Migration] Failed to load migrations: ${error.message}`);
    throw error;
  }

  if (migrations.length === 0) {
    logger.info('[Migration] No migrations found');
    return { ok: true, applied: 0, pending: 0, failed: 0 };
  }

  logger.info(`[Migration] Found ${migrations.length} migration(s)`);

  // Sort migrations by version
  migrations = sortMigrationsByVersion(migrations);

  // Get already applied migrations
  const appliedMigrations = await getAppliedMigrations();
  const appliedVersions = new Set(appliedMigrations.map((m) => m.version));

  // Filter to pending migrations
  let pendingMigrations = migrations.filter(
    (m) => !appliedVersions.has(m.version)
  );

  // Apply toVersion filter if specified
  if (toVersion) {
    pendingMigrations = pendingMigrations.filter(
      (m) => m.version <= toVersion
    );
  }

  // Check if force is needed (re-run completed migrations)
  const completedVersions = new Set(
    appliedMigrations
      .filter((m) => m.status === MIGRATION_STATUS.COMPLETED)
      .map((m) => m.version)
  );

  if (force) {
    // Add completed migrations to pending if force is true
    const forcedMigrations = migrations.filter(
      (m) => completedVersions.has(m.version)
    );
    pendingMigrations = [...forcedMigrations, ...pendingMigrations];
    pendingMigrations = sortMigrationsByVersion(pendingMigrations);
  }

  if (pendingMigrations.length === 0) {
    logger.info('[Migration] No pending migrations');
    return { ok: true, applied: 0, pending: 0, failed: 0, alreadyApplied: appliedMigrations.length };
  }

  logger.info(`[Migration] ${pendingMigrations.length} migration(s) to apply`);

  let appliedCount = 0;
  let failedCount = 0;
  const results = [];

  // Execute migrations in order
  for (const migration of pendingMigrations) {
    if (dryRun) {
      logger.info(
        `[Migration] [DRY RUN] Would run migration ${migration.version} - ${migration.name}`
      );
      results.push({
        ok: true,
        migration: migration.version,
        status: 'dry_run',
      });
      continue;
    }

    const result = await executeMigration(migration);
    results.push(result);

    if (result.ok) {
      appliedCount++;
      logger.info(
        `[Migration] Successfully applied ${migration.version} - ${migration.name}`
      );
    } else {
      failedCount++;
      logger.error(
        `[Migration] Failed to apply ${migration.version} - ${migration.name}`
      );
      
      // Stop on first failure unless force is true
      if (!force) {
        logger.error('[Migration] Stopping due to migration failure');
        break;
      }
    }
  }

  return {
    ok: failedCount === 0,
    applied: appliedCount,
    failed: failedCount,
    pending: pendingMigrations.length - appliedCount - failedCount,
    total: migrations.length,
    results,
  };
};

/**
 * Get migration status summary
 */
export const getMigrationStatus = async () => {
  const migrations = loadMigrationFiles();
  const appliedMigrations = await getAppliedMigrations();

  const appliedVersions = new Set(appliedMigrations.map((m) => m.version));

  const summary = {
    totalMigrations: migrations.length,
    applied: appliedMigrations.filter((m) => m.status === MIGRATION_STATUS.COMPLETED).length,
    pending: migrations.filter((m) => !appliedVersions.has(m.version)).length,
    failed: appliedMigrations.filter((m) => m.status === MIGRATION_STATUS.FAILED).length,
    migrations: migrations.map((m) => ({
      version: m.version,
      name: m.name,
      description: m.description,
      applied: appliedVersions.has(m.version),
      appliedAt: appliedMigrations.find((am) => am.version === m.version)?.appliedAt,
      status: appliedMigrations.find((am) => am.version === m.version)?.status || 'pending',
    })),
  };

  return summary;
};

/**
 * Get list of applied migrations
 */
export const listAppliedMigrations = async () => {
  return getAppliedMigrations();
};

/**
 * Rollback the last migration (if supported)
 * 
 * Note: Not all migrations support rollback. This is a best-effort operation.
 */
export const rollbackLastMigration = async () => {
  logger.warn('[Migration] Rollback is a destructive operation and may not be fully supported');
  logger.warn('[Migration] Always backup your database before rolling back');

  // Get the last applied migration
  const lastMigration = await MigrationTracker.findOne({
    status: MIGRATION_STATUS.COMPLETED,
  }).sort({ appliedAt: -1 });

  if (!lastMigration) {
    throw new Error('No completed migrations to rollback');
  }

  logger.info(
    `[Migration] Attempting to rollback migration ${lastMigration.version} - ${lastMigration.name}`
  );

  // Check if the migration has a down function
  const migrations = loadMigrationFiles();
  const migration = migrations.find((m) => m.version === lastMigration.version);

  if (!migration) {
    throw new Error(`Migration file for version ${lastMigration.version} not found`);
  }

  if (!migration.module.includes('down')) {
    throw new Error(`Migration ${lastMigration.version} does not support rollback (no 'down' function)`);
  }

  try {
    const migrationModule = await import(migration.filePath);
    
    if (!migrationModule.down) {
      throw new Error(`Migration ${lastMigration.version} is missing 'down' function`);
    }

    // Execute rollback
    const result = await migrationModule.down();
    
    if (!result || !result.ok) {
      throw new Error(
        `Rollback failed: ${result?.message || 'Unknown error'}`
      );
    }

    // Update migration status
    await MigrationTracker.findOneAndUpdate(
      { migrationId: lastMigration.migrationId },
      { status: MIGRATION_STATUS.ROLLED_BACK, updatedAt: new Date() }
    );

    logger.info(
      `[Migration] Successfully rolled back migration ${lastMigration.version}`
    );

    return { ok: true, migration: lastMigration };
  } catch (error) {
    logger.error(`[Migration] Rollback failed: ${error.message}`);
    throw error;
  }
};

/**
 * Validate migration chain
 * 
 * Checks that:
 * - All migrations have valid metadata
 * - Versions are unique
 * - Versions are in order
 * - No gaps in version sequence
 */
export const validateMigrationChain = async () => {
  const migrations = loadMigrationFiles();
  const errors = [];
  const versions = [];

  for (const migration of migrations) {
    // Check for duplicate versions
    if (versions.includes(migration.version)) {
      errors.push(`Duplicate version: ${migration.version} (${migration.name})`);
    }
    versions.push(migration.version);

    // Check version format
    if (!validateVersion(migration.version)) {
      errors.push(`Invalid version format: ${migration.version} (${migration.name})`);
    }
  }

  // Sort and check for gaps
  const sortedMigrations = sortMigrationsByVersion(migrations);
  for (let i = 1; i < sortedMigrations.length; i++) {
    const prevVersion = sortedMigrations[i - 1].version;
    const currVersion = sortedMigrations[i].version;
    
    // Extract numeric parts for comparison
    const prevParts = prevVersion.split('-')[0].split('.').map(Number);
    const currParts = currVersion.split('-')[0].split('.').map(Number);
    
    // Check if versions are sequential
    if (currParts[0] < prevParts[0] ||
        (currParts[0] === prevParts[0] && currParts[1] < prevParts[1]) ||
        (currParts[0] === prevParts[0] && currParts[1] === prevParts[1] && currParts[2] < prevParts[2])) {
      errors.push(`Version gap or out of order: ${prevVersion} -> ${currVersion}`);
    }
  }

  return {
    ok: errors.length === 0,
    migrations: sortedMigrations.length,
    errors,
  };
};

export default {
  runMigrations,
  getMigrationStatus,
  listAppliedMigrations,
  rollbackLastMigration,
  validateMigrationChain,
  MIGRATION_STATUS,
};
