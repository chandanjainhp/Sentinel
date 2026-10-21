/**
 * One-off migration: Organization → User ownership.
 *
 * Maps every existing `orgId` on owned records to the owning user's `_id` as
 * `userId`, then (only when explicitly asked) drops the `organizations`
 * collection.
 *
 * Ownership rule: each Organization's owner is the first user whose `orgId`
 * equals the org's `_id` (registration created exactly one user per org).
 *
 * Idempotent:
 *  - records already migrated (no `orgId`) are skipped
 *  - re-running after a full migration is a no-op
 *
 * Safety:
 *  - collections are discovered from the database itself, so records are found
 *    even when no Mongoose model is registered for them
 *  - `organizations` is dropped only with BOTH --apply and --drop-organizations,
 *    and only when no record anywhere still carries `orgId` and no record was
 *    orphaned (an orgId with no owning user)
 *
 * Usage:
 *   bun src/scripts/migrate-org-to-user.js                          # dry run (default)
 *   bun src/scripts/migrate-org-to-user.js --apply                  # write changes
 *   bun src/scripts/migrate-org-to-user.js --apply --drop-organizations
 *
 * Run from the server/ directory so .env is picked up:
 *   cd server && bun src/scripts/migrate-org-to-user.js [flags]
 */

import dotenv from 'dotenv';
import { connectDatabases, disconnectDatabases } from '../db/index.js';

dotenv.config({ path: './.env' });

// Collections that carry orgId on owned records.
export const OWNED_COLLECTIONS = [
  'sites',
  'machines',
  'sensors',
  'events',
  'predictions',
  'incidents',
  'apikeys',
];

const listCollectionNames = async (db) => {
  const found = await db.listCollections({}, { nameOnly: true });
  const collections = Array.isArray(found) ? found : await found.toArray(); // mongoose returns an array
  return collections.map((c) => c.name);
};

export const runMigration = async ({
  db,
  apply = false,
  dropOrganizations = false,
  log = console.log,
} = {}) => {
  if (!db) throw new Error('runMigration requires a mongoose connection');

  const existingCollections = await listCollectionNames(db);
  log(`[migrate-org-to-user] mode: ${apply ? 'APPLY' : 'DRY RUN (no writes)'}`);
  log(`[migrate-org-to-user] collections in database: ${existingCollections.length}`);

  // Map org _id -> owner user _id
  const orgOwnerMap = new Map();
  let usersWithOrg = 0;
  if (existingCollections.includes('users')) {
    const userDocs = await db
      .collection('users')
      .find({ orgId: { $exists: true, $ne: null } })
      .project({ _id: 1, orgId: 1 })
      .toArray();
    usersWithOrg = userDocs.length;
    for (const u of userDocs) {
      const key = String(u.orgId);
      if (!orgOwnerMap.has(key)) orgOwnerMap.set(key, u._id); // first user wins
    }
  }
  log(`[migrate-org-to-user] users with orgId: ${usersWithOrg} (${orgOwnerMap.size} organizations owned)`);

  const summary = {};

  for (const collName of OWNED_COLLECTIONS) {
    if (!existingCollections.includes(collName)) {
      summary[collName] = { exists: false, scanned: 0, migrated: 0, wouldMigrate: 0, orphans: 0 };
      continue;
    }

    const coll = db.collection(collName);
    const docs = await coll
      .find({ orgId: { $exists: true, $ne: null } }, { projection: { _id: 1, orgId: 1 } })
      .toArray();

    let migrated = 0;
    let wouldMigrate = 0;
    let orphans = 0;

    for (const doc of docs) {
      const owner = orgOwnerMap.get(String(doc.orgId));

      if (!owner) {
        orphans += 1;
        log(
          `[migrate-org-to-user] ORPHAN ${collName} _id=${doc._id} orgId=${doc.orgId} has no owner user — skipped`
        );
        continue;
      }

      if (!apply) {
        wouldMigrate += 1;
        continue;
      }

      // Guarded by the original orgId so a concurrent change is not clobbered.
      const res = await coll.updateOne(
        { _id: doc._id, orgId: doc.orgId },
        { $set: { userId: owner }, $unset: { orgId: '' } }
      );
      migrated += res.modifiedCount;
    }

    summary[collName] = {
      exists: true,
      scanned: docs.length,
      migrated,
      wouldMigrate,
      orphans,
    };
  }

  // Records still carrying orgId anywhere (not just the known owned collections).
  const remainingWithOrgId = {};
  for (const name of existingCollections) {
    if (name === 'organizations' || name.startsWith('system.')) continue;
    const count = await db.collection(name).countDocuments({ orgId: { $exists: true, $ne: null } });
    if (count > 0) remainingWithOrgId[name] = count;
  }
  const orphanTotal = Object.values(summary).reduce((a, s) => a + s.orphans, 0);

  const hasOrganizations = existingCollections.includes('organizations');
  const orgCount = hasOrganizations
    ? await db.collection('organizations').countDocuments()
    : 0;

  let organizationsDropped = false;
  if (dropOrganizations && hasOrganizations) {
    // `users.orgId` is the mapping source, so it is the last reference cleared:
    // only once every owned record is mapped, and only when the collection is
    // about to be dropped. A failed run therefore keeps the mapping intact.
    const otherRemaining = Object.entries(remainingWithOrgId).filter(([name]) => name !== 'users');

    if (!apply) {
      log('[migrate-org-to-user] refusing to drop organizations: --drop-organizations requires --apply');
    } else if (orphanTotal > 0) {
      log(`[migrate-org-to-user] refusing to drop organizations: ${orphanTotal} orphaned record(s)`);
    } else if (otherRemaining.length > 0) {
      log(
        `[migrate-org-to-user] refusing to drop organizations: record(s) still carry orgId (${JSON.stringify(Object.fromEntries(otherRemaining))})`
      );
    } else {
      if (remainingWithOrgId.users) {
        await db.collection('users').updateMany({ orgId: { $exists: true, $ne: null } }, { $unset: { orgId: '' } });
        delete remainingWithOrgId.users;
        log('[migrate-org-to-user] cleared users.orgId (organizations is being dropped)');
      }
      await db.collection('organizations').drop();
      organizationsDropped = true;
      log(`[migrate-org-to-user] dropped organizations collection (${orgCount} docs)`);
    }
  } else if (hasOrganizations) {
    log(
      `[migrate-org-to-user] organizations kept (${orgCount} docs) — pass --drop-organizations with --apply to remove it`
    );
  }

  log('[migrate-org-to-user] summary:', JSON.stringify(summary, null, 2));

  if (!apply) {
    log('[migrate-org-to-user] dry run complete — re-run with --apply to write changes.');
  } else {
    log(
      `[migrate-org-to-user] done. records still carrying orgId: ${Object.values(remainingWithOrgId).reduce((a, b) => a + b, 0)}; organizations dropped: ${organizationsDropped}`
    );
  }

  return {
    apply,
    summary,
    orphanTotal,
    remainingWithOrgId,
    organizationsDropped,
  };
};

const main = async () => {
  const apply = process.argv.includes('--apply');
  const dropOrganizations = process.argv.includes('--drop-organizations');

  await connectDatabases();
  try {
    await runMigration({ db: (await import('mongoose')).default.connection, apply, dropOrganizations });
  } finally {
    await disconnectDatabases();
  }
};

if (import.meta.main) {
  main().catch((err) => {
    console.error('[migrate-org-to-user] failed:', err);
    process.exitCode = 1;
  });
}
