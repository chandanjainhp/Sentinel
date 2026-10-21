/**
 * Manual API-key debug probe.
 *
 *   MONGO_DB=... DEBUG_BASE=http://localhost:8099/api/v1 bun src/tests/debug-key.mjs
 *
 * Runs against a TEST database only: it refuses to touch a connection whose
 * database name does not contain "test". It never drops or flushes a database;
 * it creates one account with a random email and removes exactly that account's
 * documents when it finishes.
 */

import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { connectDatabases, disconnectDatabases } from "../db/index.js";
import ApiKey from "../models/apiKey.model.js";
import { User } from "../models/user.model.js";

const BASE = process.env.DEBUG_BASE || "http://localhost:8099/api/v1";
const RUN_ID = randomUUID().slice(0, 8);
const EMAIL = `debug-key-${RUN_ID}@example.test`;
const USERNAME = `debug_key_${RUN_ID}`;
const PASSWORD = "Password123!";

let dbVerified = false;

const run = async () => {
  await connectDatabases();

  const dbName = mongoose.connection.name;
  if (!/test/i.test(dbName)) {
    throw new Error(
      `Refusing to run against database "${dbName}" — this probe needs an isolated test database (name must contain "test").`
    );
  }
  dbVerified = true;

  const registration = await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, username: USERNAME, password: PASSWORD, ageConfirmed: true }),
  });
  if (registration.status !== 201) {
    throw new Error(`register failed (${registration.status}): ${await registration.text()}`);
  }

  const login = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (login.status !== 200) {
    throw new Error(`login failed (${login.status}): ${await login.text()}`);
  }
  const authHeaders = { Cookie: login.headers.get("set-cookie"), "Content-Type": "application/json" };

  const k1 = (await (await fetch(`${BASE}/settings/api-key`, { method: "POST", headers: authHeaders })).json()).data;
  console.log("key1 id:", k1.id);

  // Simulate key usage (touches lastUsedAt). Garbage refs are fine — auth
  // happens before resolution.
  await fetch(`${BASE}/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${k1.secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      siteId: "x",
      machineId: "y",
      sensorId: "z",
      timestamp: new Date().toISOString(),
      values: { temperature: 1 },
    }),
  });

  const regen = await fetch(`${BASE}/settings/api-key`, { method: "POST", headers: authHeaders });
  console.log("regen status:", regen.status, JSON.stringify(await regen.json()).slice(0, 200));

  const keys = await ApiKey.find({}).lean();
  console.log("keys in db:", keys.length, keys.map((k) => k._id.toString()));
};

const cleanup = async () => {
  if (!dbVerified) return; // never write to a database this probe refused
  const user = await User.findOne({ email: EMAIL });
  if (user) {
    await ApiKey.deleteMany({ userId: user._id });
    await User.deleteOne({ _id: user._id });
  }
};

run()
  .catch((e) => {
    console.error(e.message || e);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await cleanup();
      await disconnectDatabases();
    } catch {}
  });
