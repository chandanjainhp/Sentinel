import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import mongoose from "mongoose";
import app from "../app.js";
import { connectDatabases, disconnectDatabases } from "../db/index.js";
import { Incident } from "../models/incident.model.js";
import { Site } from "../models/site.model.js";
import { Machine } from "../models/machine.model.js";
import { User } from "../models/user.models.js";
import { argusExplainJobId, argusRegenerateJobId } from "../queues/argus-explain.queue.js";

/**
 * Authz + endpoint behaviour for POST /api/v1/incidents/:id/explain (Fix A).
 * Runs against the mounted app. The argus-explain worker is NOT started in
 * this suite, so enqueued jobs are never processed and no LLM can be called.
 */

// 809x ports below 8095 are used by other suites/tools on shared machines.
const PORT = 8099;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

let server;

const seeded = {};

const login = async (email) => {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Password123!" }),
  });
  return res.headers.get("set-cookie");
};

beforeAll(async () => {
  await connectDatabases();
  await mongoose.connection.dropDatabase();

  for (const suffix of ["a", "b"]) {
    const user = await User.create({
      email: `argus-authz-${suffix}@factory.com`,
      username: `argus_authz_${suffix}`,
      password: "Password123!",
      isEmailVerified: true,
    });
    const site = await Site.create({
      userId: user._id,
      name: `Plant ${suffix}`,
      timezone: "UTC",
    });
    const machine = await Machine.create({
      userId: user._id,
      siteId: site._id,
      assetId: `AZ-${suffix}`,
      name: `Machine ${suffix}`,
      machineType: "Motor",
      status: "warning",
    });
    const incident = await Incident.create({
      userId: user._id,
      siteId: site._id,
      machineId: machine._id,
      type: "anomaly",
      severity: "warning",
      title: `WARNING: Machine ${suffix}`,
      reason: "test",
      status: "open",
    });
    seeded[suffix] = { user, site, machine, incident };
  }

  server = app.listen(PORT);
});

afterAll(async () => {
  if (server) server.close();
  await disconnectDatabases();
});

describe("POST /incidents/:id/explain — authorization", () => {
  it("explaining another user's incident is a 404", async () => {
    const cookieA = await login("argus-authz-a@factory.com");
    const res = await fetch(
      `${BASE_URL}/incidents/${seeded.b.incident.incidentId}/explain`,
      {
        method: "POST",
        headers: { Cookie: cookieA, "Content-Type": "application/json" },
      }
    );
    expect(res.status).toBe(404);
  });

  it("explaining an unknown incident is a 404", async () => {
    const cookieA = await login("argus-authz-a@factory.com");
    const res = await fetch(`${BASE_URL}/incidents/incident_does_not_exist/explain`, {
      method: "POST",
      headers: { Cookie: cookieA, "Content-Type": "application/json" },
    });
    expect(res.status).toBe(404);
  });

  it("unauthenticated requests are rejected", async () => {
    const res = await fetch(
      `${BASE_URL}/incidents/${seeded.a.incident.incidentId}/explain`,
      { method: "POST", headers: { "Content-Type": "application/json" } }
    );
    expect(res.status).toBe(401);
  });

  it("owner gets 202 with the queued explanation status", async () => {
    const cookieA = await login("argus-authz-a@factory.com");
    const res = await fetch(
      `${BASE_URL}/incidents/${seeded.a.incident.incidentId}/explain`,
      { method: "POST", headers: { Cookie: cookieA, "Content-Type": "application/json" } }
    );
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.incidentId).toBe(seeded.a.incident.incidentId);
    expect(["pending", "ready", "failed"]).toContain(body.data.explanationStatus);
  });

  it("reading another user's incident via GET is a 404", async () => {
    const cookieA = await login("argus-authz-a@factory.com");
    const res = await fetch(`${BASE_URL}/incidents/${seeded.b.incident.incidentId}`, {
      headers: { Cookie: cookieA },
    });
    expect(res.status).toBe(404);
  });

  it("jobId convention: argus-<incidentId>-<severity>, regenerate ids are unique", () => {
    expect(argusExplainJobId("incident_x", "warning")).toBe("argus-incident_x-warning");
    const j1 = argusRegenerateJobId("incident_x", "warning");
    const j2 = argusRegenerateJobId("incident_x", "warning");
    expect(j1.startsWith("argus-incident_x-warning-manual-")).toBe(true);
    expect(j1).not.toBe(j2);
  });
});
