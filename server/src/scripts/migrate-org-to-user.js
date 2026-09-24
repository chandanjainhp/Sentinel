/**
 * One-off migration: Organization → User ownership.
 *
 * Maps every existing `orgId` on owned records to the owning user's `_id` as
 * `userId`, then drops the `organizations` collection.
 *
 * Ownership rule: each Organization's owner is the first user whose `orgId`
 * equals the org's `_id` (registration created exactly one user per org).
 *
 * Idempotent:
 *  - records already migrated (no `orgId`) are skipped
 *  - re-running after a full migration is a no-op
 *
 * Usage:
 *   bun src/scripts/migrate-org-to-user.js            # dry run (default)
 *   bun src/scripts/migrate-org-to-user.js --apply    # write changes
 *
 * Run from the server/ directory so .env is picked up:
 *   cd server && bun src/scripts/migrate-org-to-user.js [--apply]
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDatabases, disconnectDatabases } from '../db/index.js';

dotenv.config({ path: './.env' });

const APPLY = process.argv.includes('--apply');
const db = mongoose.connection;

// Collections that carry orgId on owned records.
const OWNED_COLLECTIONS = [
  'sites',
  'machines',
  'sensors',
  'events',
  'predictions',
  'incidents',
  'apikeys',
];

async function main() {
  const dryRun = !APPLY;
  console.log(`[migrate-org-to-user] mode: ${dryRun ? 'DRY RUN (no writes)' : 'APPLY'}`);

  await connectDatabases();

  // User orgId may be stored under different names across history.
  const users = db.collection('users');

  // Map org _id -> owner user _id
  const orgOwnerMap = new Map();
  const userDocs = await users.find({}).project({ _id: 1, orgId: 1 }).toArray();
  for (const u of userDocs) {
    if (u.orgId) orgOwnerMap.set(u.orgId.toString(), u._id);
  }
  console.log(`[migrate-org-to-user] users with orgId: ${orgOwnerMap.size}`);

  const summary = {};

  for (const collName of OWNED_COLLECTIONS) {
    if (!db.collections[collName]) {
      summary[collName] = { scanned: 0, migrated: 0, skipped: 0, orphans: 0 };
      continue;
    }
    const coll = db.collection(collName);

    const cursor = coll.find({ orgId: { $exists: true } }, { projection: { _id: 1, orgId: 1 } });
    let migrated = 0;
    let orphans = 0;
    let scanned = 0;

    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      scanned += 1;
      const owner = orgOwnerMap.get(doc.orgId.toString());

      if (!owner) {
        orphans += 1;
        console.warn(
          `[migrate-org-to-user] ORPHAN ${collName} _id=${doc._id} orgId=${doc.orgId} has no owner user — skipped`
        );
        continue;
      }

      if (dryRun) {
        migrated += 1;
        continue;
      }

      const res = await coll.updateOne(
        { _id: doc._id },
        {
          $set: { userId: owner },
          $unset: { orgId: '' },
        }
      );
      migrated += res.modifiedCount;
    }

    summary[collName] = { scanned, migrated, skipped: scanned - migrated - orphans, orphans };
  }

  // Drop the organizations collection (last step, after records are mapped)
  let orgsDropped = false;
  if (db.collections['organizations']) {
    const count = await db.collection('organizations').countDocuments();
    if (dryRun) {
      console.log(`[migrate-org-to-user] would drop organizations collection (${count} docs)`);
    } else {
      await db.collection('organizations').drop();
      orgsDropped = true;
      console.log(`[migrate-org-to-user] dropped organizations collection (${count} docs)`);
    }
  }

  console.log('[migrate-org-to-user] summary:', JSON.stringify(summary, null, 2));

  if (dryRun) {
    console.log('[migrate-org-to-user] dry run complete — re-run with --apply to write changes.');
  } else {
    console.log(`[migrate-org-to-user] done. organizations dropped: ${orgsDropped}`);
  }
}

main()
  .catch((err) => {
    console.error('[migrate-org-to-user] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await disconnectDatabases();
    } catch {}
  });
