import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import path from "node:path";
import mongoose from "mongoose";
import { connectDatabases, disconnectDatabases } from "../db/index.js";
import { runMigration } from "../scripts/migrate-org-to-user.js";

/**
 * The migration is destructive when pointed at the wrong data, so every guard
 * gets a test: discovery without registered models, accurate counts, repeat
 * runs, orphan handling, and the conditional organizations drop.
 *
 * Everything runs in a dedicated `sentinel_migration_test` database so the
 * app's real indexes and other test files' data never interfere.
 */

const DB_NAME = "sentinel_migration_test";
const silent = () => {};
const db = () => migrationDb;

let migrationDb;

const orgId = () => new mongoose.Types.ObjectId();

const isolatedUri = () => {
  const url = new URL(process.env.MONGODB_URL);
  url.pathname = `/${DB_NAME}`;
  return url.toString();
};

const wipe = async () => {
  for (const c of await migrationDb.db.collections()) await c.deleteMany({});
};

beforeAll(async () => {
  await connectDatabases();
  migrationDb = mongoose.connection.useDb(DB_NAME, { useCache: true });
  await wipe();
});

afterAll(async () => {
  await migrationDb.dropDatabase();
  await disconnectDatabases();
});

describe("migrate-org-to-user", () => {
  it("finds collections that exist in the database but have no registered model", async () => {
    const serverDir = path.resolve(import.meta.dir, "../..");
    const org = orgId();
    await db().collection("users").insertOne({ email: "legacy@factory.com", orgId: org });
    await db().collection("sites").insertMany([
      { siteId: "site_a", name: "A", orgId: org },
      { siteId: "site_b", name: "B", orgId: org },
    ]);

    // Standalone process: no app import, so no Mongoose models are registered.
    const child = Bun.spawnSync({
      cmd: ["bun", "src/scripts/migrate-org-to-user.js"],
      cwd: serverDir,
      env: { ...process.env, NODE_ENV: "test", MONGODB_URL: isolatedUri() },
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = child.stdout.toString();
    expect({ exitCode: child.exitCode, stderr: child.stderr.toString().slice(0, 500) }).toEqual({
      exitCode: 0,
      stderr: "",
    });

    const summaryLine = output.slice(output.indexOf("summary:") + "summary:".length);
    const summary = JSON.parse(summaryLine.slice(0, summaryLine.lastIndexOf("}") + 1));
    expect(summary.sites.scanned).toBe(2);
    expect(summary.sites.wouldMigrate).toBe(2);
    expect(summary.machines.exists).toBe(false);

    // A dry run must not touch the data.
    expect(await db().collection("sites").countDocuments({ orgId: { $exists: true } })).toBe(2);
  });

  it("dry run reports what it would do and writes nothing", async () => {
    await wipe();
    const org = orgId();
    const owner = new mongoose.Types.ObjectId();
    await db().collection("users").insertOne({ _id: owner, email: "dry@factory.com", orgId: org });
    await db().collection("sites").insertOne({ name: "A", orgId: org });
    await db().collection("events").insertOne({ type: "sensor_reading", orgId: org });
    await db().collection("organizations").insertOne({ _id: org, name: "Acme" });

    const result = await runMigration({ db: db(), apply: false, log: silent });

    expect(result.summary.sites).toEqual({
      exists: true,
      scanned: 1,
      migrated: 0,
      wouldMigrate: 1,
      orphans: 0,
    });
    expect(result.summary.events.wouldMigrate).toBe(1);
    expect(result.remainingWithOrgId).toEqual({ sites: 1, events: 1, users: 1 });
    expect(result.organizationsDropped).toBe(false);
    expect(await db().collection("sites").countDocuments({ orgId: { $exists: true } })).toBe(1);
  });

  it("a missing collection is reported as absent, not as an error", async () => {
    const result = await runMigration({ db: db(), apply: false, log: silent });
    expect(result.summary.sensors).toEqual({
      exists: false,
      scanned: 0,
      migrated: 0,
      wouldMigrate: 0,
      orphans: 0,
    });
  });

  it("apply maps orgId to userId with accurate counts, and a repeat run is a no-op", async () => {
    await wipe();
    const org = orgId();
    const owner = new mongoose.Types.ObjectId();
    await db().collection("users").insertOne({ _id: owner, email: "apply@factory.com", orgId: org });
    await db().collection("sites").insertOne({ name: "A", orgId: org });
    await db().collection("sites").insertOne({ name: "B", orgId: org });

    const first = await runMigration({ db: db(), apply: true, log: silent });
    expect(first.summary.sites.migrated).toBe(2);
    expect(first.summary.sites.orphans).toBe(0);
    // users.orgId is the mapping source and is kept until organizations is dropped.
    expect(first.remainingWithOrgId).toEqual({ users: 1 });
    expect(await db().collection("sites").countDocuments({ userId: owner })).toBe(2);
    expect(await db().collection("sites").countDocuments({ orgId: { $exists: true } })).toBe(0);

    const second = await runMigration({ db: db(), apply: true, log: silent });
    expect(second.summary.sites).toEqual({
      exists: true,
      scanned: 0,
      migrated: 0,
      wouldMigrate: 0,
      orphans: 0,
    });
    expect(second.remainingWithOrgId).toEqual({ users: 1 });
    // No documents were dropped or duplicated by the second pass.
    expect(await db().collection("sites").countDocuments({})).toBe(2);
  });

  it("leaves orphaned records alone and refuses to drop organizations", async () => {
    await wipe();
    await db().collection("sites").insertOne({ name: "orphan", orgId: orgId() });
    await db().collection("organizations").insertOne({ name: "Acme" });

    const result = await runMigration({
      db: db(),
      apply: true,
      dropOrganizations: true,
      log: silent,
    });

    expect(result.summary.sites.orphans).toBe(1);
    expect(result.summary.sites.migrated).toBe(0);
    expect(result.organizationsDropped).toBe(false);
    expect(await db().collection("organizations").countDocuments({})).toBe(1);
    expect(await db().collection("sites").countDocuments({ orgId: { $exists: true } })).toBe(1);
  });

  it("drops organizations only after every record is mapped", async () => {
    const orphan = await db().collection("sites").findOne({ name: "orphan" });
    await db()
      .collection("users")
      .insertOne({ email: "late@factory.com", orgId: orphan.orgId });

    const withoutFlag = await runMigration({ db: db(), apply: true, log: silent });
    expect(withoutFlag.organizationsDropped).toBe(false);
    expect(await db().collection("organizations").countDocuments({})).toBe(1);

    const withFlag = await runMigration({
      db: db(),
      apply: true,
      dropOrganizations: true,
      log: silent,
    });
    expect(withFlag.organizationsDropped).toBe(true);
    expect(withFlag.remainingWithOrgId).toEqual({});
    expect(await db().collection("users").countDocuments({ orgId: { $exists: true } })).toBe(0);
    const names = (await db().db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
    expect(names).not.toContain("organizations");
  });

  it("propagates a write failure and never drops organizations as a side effect", async () => {
    await wipe();
    const org = orgId();
    await db().collection("users").insertOne({ email: "boom@factory.com", orgId: org });
    await db().collection("sites").insertOne({ name: "A", orgId: org });
    await db().collection("machines").insertOne({ name: "M", orgId: org });
    await db().collection("organizations").insertOne({ _id: org, name: "Acme" });

    const realCollection = db().collection.bind(db());
    db().collection = (name) => {
      if (name === "machines") throw new Error("injected failure");
      return realCollection(name);
    };
    try {
      await expect(
        runMigration({ db: db(), apply: true, dropOrganizations: true, log: silent })
      ).rejects.toThrow("injected failure");
    } finally {
      db().collection = realCollection;
    }

    expect(await db().collection("organizations").countDocuments({})).toBe(1);
  });
});
