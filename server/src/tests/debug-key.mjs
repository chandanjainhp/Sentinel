import mongoose from "mongoose";
import { connectDatabases, disconnectDatabases } from "../db/index.js";
import ApiKey from "../models/apiKey.model.js";

const BASE = process.env.DEBUG_BASE || "http://localhost:8099/api/v1";

const run = async () => {
  await connectDatabases();
  await mongoose.connection.dropDatabase();

  const reg = await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "o@f.com", username: "o", password: "Password123!" }),
  });

  const login = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "o@f.com", password: "Password123!" }),
  });
  const authHeaders = { Cookie: login.headers.get("set-cookie"), "Content-Type": "application/json" };

  const k1 = (await (await fetch(`${BASE}/settings/api-key`, { method: "POST", headers: authHeaders })).json()).data;
  console.log("key1 id:", k1.id);

  // Simulate key usage (touches lastUsedAt)
  await fetch(`${BASE}/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${k1.secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      // garbage refs are fine — auth happens before resolution
      siteId: "x", machineId: "y", sensorId: "z",
      timestamp: new Date().toISOString(),
      values: { temperature: 1 },
    }),
  });

  const regen = await fetch(`${BASE}/settings/api-key`, { method: "POST", headers: authHeaders });
  console.log("regen status:", regen.status, JSON.stringify(await regen.json()).slice(0, 200));

  const keys = await ApiKey.find({}).lean();
  console.log("keys in db:", keys.length, keys.map((k) => k._id.toString()));

  await disconnectDatabases();
};

run().catch((e) => { console.error(e); process.exit(1); });
