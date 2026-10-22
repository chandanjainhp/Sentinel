#!/usr/bin/env bun
/**
 * Migration Runner CLI
 *
 * Usage:
 *   bun run src/scripts/run-migrations.js [options]
 *
 * Options:
 *   --dry-run          Show what migrations would run without executing
 *   --force            Re-run completed migrations
 *   --to [version]     Run migrations up to a specific version
 *   --status           Show migration status
 *   --list             List applied migrations
 *   --validate         Validate migration chain
 *   --rollback         Rollback the last migration
 */

import { runMigrations, getMigrationStatus, listAppliedMigrations, validateMigrationChain, rollbackLastMigration } from '../migrations/runner.js';
import { connectDatabases, disconnectDatabases } from '../db/index.js';
import logger from '../utils/logger.js';

const args = process.argv.slice(2);

const options = {
  dryRun: args.includes('--dry-run'),
  force: args.includes('--force'),
  status: args.includes('--status'),
  list: args.includes('--list'),
  validate: args.includes('--validate'),
  rollback: args.includes('--rollback'),
};

// Extract --to value
let toVersion = null;
const toIndex = args.indexOf('--to');
if (toIndex !== -1 && args[toIndex + 1]) {
  toVersion = args[toIndex + 1];
}

const main = async () => {
  try {
    // Connect to databases
    logger.info('[Migration CLI] Connecting to databases...');
    await connectDatabases();
    logger.info('[Migration CLI] Connected to databases');

    if (options.status) {
      const status = await getMigrationStatus();
      console.log('\n=== Migration Status ===');
      console.log(`Total migrations: ${status.totalMigrations}`);
      console.log(`Applied: ${status.applied}`);
      console.log(`Pending: ${status.pending}`);
      console.log(`Failed: ${status.failed}`);
      console.log('\nMigrations:');
      for (const m of status.migrations) {
        const statusIcon = m.applied ? '✓' : '○';
        const statusText = m.status || (m.applied ? 'completed' : 'pending');
        console.log(`  ${statusIcon} ${m.version} - ${m.name} [${statusText}]`);
      }
      process.exit(0);
    }

    if (options.list) {
      const applied = await listAppliedMigrations();
      console.log('\n=== Applied Migrations ===');
      if (applied.length === 0) {
        console.log('  No migrations applied yet');
      } else {
        for (const m of applied) {
          console.log(`  ${m.version} - ${m.name}`);
          console.log(`    Applied: ${m.appliedAt}`);
          console.log(`    Status: ${m.status}`);
          console.log(`    Duration: ${m.durationMs}ms`);
          if (m.errorMessage) {
            console.log(`    Error: ${m.errorMessage}`);
          }
        }
      }
      process.exit(0);
    }

    if (options.validate) {
      const result = await validateMigrationChain();
      console.log('\n=== Migration Chain Validation ===');
      console.log(`Total migrations: ${result.migrations}`);
      console.log(`Valid: ${result.ok ? 'YES' : 'NO'}`);
      
      if (!result.ok && result.errors.length > 0) {
        console.log('\nErrors:');
        for (const error of result.errors) {
          console.log(`  ✗ ${error}`);
        }
        process.exit(1);
      }
      
      console.log('\nAll migrations are valid!');
      process.exit(0);
    }

    if (options.rollback) {
      console.log('\n=== WARNING ===');
      console.log('Rollback is a destructive operation!');
      console.log('Always backup your database before rolling back.');
      console.log('Type "CONFIRM" to continue: ');
      
      // Simple confirmation (not production-grade, but better than nothing)
      const readline = await import('node:readline/promises');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      
      const answer = await rl.question('');
      rl.close();
      
      if (answer.toUpperCase() !== 'CONFIRM') {
        console.log('Rollback cancelled.');
        process.exit(0);
      }
      
      const result = await rollbackLastMigration();
      if (result.ok) {
        console.log(`\n✓ Successfully rolled back migration ${result.migration.version}`);
        process.exit(0);
      } else {
        console.error(`\n✗ Rollback failed: ${result.error || result.message}`);
        process.exit(1);
      }
    }

    // Default: run migrations
    console.log('\n=== Running Migrations ===');
    console.log(`Dry run: ${options.dryRun}`);
    console.log(`Force: ${options.force}`);
    if (toVersion) {
      console.log(`To version: ${toVersion}`);
    }
    console.log('');

    const result = await runMigrations({
      dryRun: options.dryRun,
      force: options.force,
      toVersion,
    });

    if (!result.ok) {
      console.error(`\n✗ Migration failed`);
      console.error(`  Applied: ${result.applied}`);
      console.error(`  Failed: ${result.failed}`);
      
      if (result.results && result.results.length > 0) {
        console.error('\nFailed migrations:');
        for (const r of result.results) {
          if (!r.ok) {
            console.error(`  ✗ ${r.migration.version} - ${r.error || 'Unknown error'}`);
          }
        }
      }
      
      process.exit(1);
    }

    console.log(`\n✓ Migrations complete`);
    console.log(`  Applied: ${result.applied}`);
    console.log(`  Failed: ${result.failed}`);
    console.log(`  Total migrations: ${result.total}`);
    
    if (options.dryRun) {
      console.log('\n(Dry run - no changes were made)');
    }

    process.exit(0);
  } catch (error) {
    console.error(`\n✗ Error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  } finally {
    try {
      await disconnectDatabases();
      logger.info('[Migration CLI] Disconnected from databases');
    } catch (error) {
      console.error('[Migration CLI] Error disconnecting:', error.message);
    }
  }
};

main();
