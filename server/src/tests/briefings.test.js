import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import mongoose from "mongoose";
import app from "../app.js";
import { connectDatabases, disconnectDatabases } from "../db/index.js";
import { User } from "../models/user.model.js";
import { Incident } from "../models/incident.model.js";
import Briefing from "../models/briefing.model.js";

/**
 * Briefings API: auth, ownership, validation, generation idempotency, editing
 * and approval. Generation is deterministic (no queue/LLM), so the suite seeds
 * incidents directly and asserts the document the service builds.
 *
 * Port 8111 (Bun), per the agreed test-port ranges.
 */

const PORT = 8111;
const BASE_URL = `http://localhost:${PORT}/api/v1`;
let server;

const api = (method, route, { cookie, body } = {}) =>
  fetch(`${BASE_URL}${route}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

const cookies = (res) => res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

const register = async (suffix) => {
  const res = await api("POST", "/auth/register", {
    body: {
      email: `briefing-${suffix}@factory.com`,
      username: `briefing_${suffix}`,
      password: "Password123!",
      ageConfirmed: true,
    },
  });
  expect(res.status).toBe(201);
  return { cookie: cookies(res), user: (await res.json()).data.user };
};

const createEstate = async (cookie) => {
  const siteRes = await api("POST", "/sites", {
    cookie,
    body: { name: "Briefing Plant", timezone: "UTC" },
  });
  const site = (await siteRes.json()).data;

  const machineRes = await api("POST", `/machines/sites/${site.siteId}/machines`, {
    cookie,
    body: { assetId: "PUMP-B1", name: "Boiler Feed Pump", machineType: "Centrifugal Pump" },
  });
  const machine = (await machineRes.json()).data;

  return { site, machine };
};

const seedIncident = async ({ userId, site, machine, nightDate, severity = "warning", status = "open", title, explanation }) => {
  const incident = await Incident.create({
    userId,
    siteId: site._id,
    machineId: machine._id,
    type: "machine_health",
    severity,
    title: title || `${severity} incident`,
    reason: "Seeded by the briefings test",
    status,
    evidence: { anomalyScore: 0.82, faultType: "bearing_wear" },
    ...(explanation ? { explanation } : {}),
  });
  // createdAt drives the night window; Mongoose timestamps treat it as
  // immutable in update(), so write it through the driver.
  await Incident.collection.updateOne(
    { _id: incident._id },
    { $set: { createdAt: new Date(`${nightDate}T12:00:00.000Z`) } },
  );
  return incident;
};

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  await connectDatabases();
  for (const c of await mongoose.connection.db.collections()) await c.deleteMany({});
  await Briefing.init(); // build the unique (userId, nightDate) index before the race test
  server = app.listen(PORT);
});

afterAll(async () => {
  if (server) server.close();
  await disconnectDatabases();
});

describe("briefings API", () => {
  let owner;
  let other;
  let estate;

  beforeAll(async () => {
    owner = await register("owner");
    other = await register("other");
    estate = await createEstate(owner.cookie);
  });

  it("requires authentication on every endpoint", async () => {
    const calls = [
      ["GET", "/briefings"],
      ["GET", "/briefings/latest"],
      ["POST", "/briefings/generate"],
      ["GET", "/briefings/briefing_missing"],
      ["PATCH", "/briefings/briefing_missing/sections/executive_summary"],
      ["POST", "/briefings/briefing_missing/approve"],
    ];

    for (const [method, route] of calls) {
      const res = await api(method, route, method === "POST" || method === "PATCH" ? { body: {} } : {});
      expect(res.status).toBe(401);
    }
  });

  it("rejects malformed generation payloads and impossible dates", async () => {
    const missing = await api("POST", "/briefings/generate", { cookie: owner.cookie, body: {} });
    expect(missing.status).toBe(400);
    const missingBody = await missing.json();
    expect(missingBody.errors.length).toBeGreaterThan(0);

    const impossible = await api("POST", "/briefings/generate", {
      cookie: owner.cookie,
      body: { nightDate: "2026-02-31" },
    });
    expect(impossible.status).toBe(400);

    const badFormat = await api("POST", "/briefings/generate", {
      cookie: owner.cookie,
      body: { nightDate: "20-02-2026" },
    });
    expect(badFormat.status).toBe(400);
  });

  it("rejects out-of-range list pagination and unknown statuses", async () => {
    for (const query of ["?limit=0", "?limit=101", "?status=archived", "?nightDate=2026-13-01"]) {
      const res = await api("GET", `/briefings${query}`, { cookie: owner.cookie });
      expect(res.status).toBe(400);
    }
  });

  it("generates a deterministic briefing for the night's incidents", async () => {
    const nightDate = "2026-05-01";
    await seedIncident({
      userId: owner.user._id,
      site: estate.site,
      machine: estate.machine,
      nightDate,
      severity: "critical",
      status: "open",
      title: "CRITICAL: Boiler Feed Pump - bearing wear",
      explanation: {
        source: "fallback",
        status: "ready",
        summary: "Bearing wear detected.",
        recommendedAction: "Replace the outboard bearing before the next shift.",
        urgency: "now",
      },
    });

    const res = await api("POST", "/briefings/generate", {
      cookie: owner.cookie,
      body: { nightDate },
    });
    expect(res.status).toBe(201);
    const briefing = (await res.json()).data;

    expect(briefing.briefingId.startsWith("briefing_")).toBe(true);
    expect(briefing.userId).toBe(owner.user._id);
    expect(briefing.nightDate).toBe(nightDate);
    expect(briefing.status).toBe("draft");
    expect(briefing.generatedAt).toBeTruthy();
    expect(briefing.metadata.counts.incidents).toBe(1);

    expect(briefing.sections.map((s) => s.name)).toEqual([
      "executive_summary",
      "incidents",
      "recommendations",
      "anomalies",
      "follow_up",
    ]);

    const byName = Object.fromEntries(briefing.sections.map((s) => [s.name, s.content]));
    expect(byName.executive_summary).toContain("1 incident");
    expect(byName.incidents[0]).toMatchObject({
      severity: "critical",
      machine: "Boiler Feed Pump",
      assetId: "PUMP-B1",
    });
    expect(byName.recommendations).toContain(
      "Replace the outboard bearing before the next shift.",
    );
    expect(byName.anomalies[0].faultType).toBe("bearing_wear");
    expect(byName.follow_up).toContain(
      "Review open incident: CRITICAL: Boiler Feed Pump - bearing wear",
    );
  });

  it("is idempotent: a duplicate generate returns the same briefing", async () => {
    const nightDate = "2026-05-01";
    const before = await Briefing.countDocuments({ userId: owner.user._id, nightDate });

    const res = await api("POST", "/briefings/generate", {
      cookie: owner.cookie,
      body: { nightDate },
    });
    expect(res.status).toBe(200);
    const briefing = (await res.json()).data;

    expect(await Briefing.countDocuments({ userId: owner.user._id, nightDate })).toBe(before);
    expect(briefing.nightDate).toBe(nightDate);
  });

  it("handles a concurrent duplicate generate without creating a second briefing", async () => {
    const nightDate = "2026-06-02";
    const results = await Promise.all([
      api("POST", "/briefings/generate", { cookie: owner.cookie, body: { nightDate } }),
      api("POST", "/briefings/generate", { cookie: owner.cookie, body: { nightDate } }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    const ids = await Promise.all(results.map(async (r) => (await r.json()).data.briefingId));
    expect(ids[0]).toBe(ids[1]);
    expect(await Briefing.countDocuments({ userId: owner.user._id, nightDate })).toBe(1);
  });

  it("documents a quiet night instead of failing", async () => {
    const res = await api("POST", "/briefings/generate", {
      cookie: owner.cookie,
      body: { nightDate: "2026-07-03" },
    });
    expect(res.status).toBe(201);
    const briefing = (await res.json()).data;
    const summary = briefing.sections.find((s) => s.name === "executive_summary").content;
    expect(summary).toContain("No incidents were recorded");
    expect(briefing.metadata.counts.incidents).toBe(0);
  });

  it("lists, filters and paginates the owner's briefings only", async () => {
    const list = await api("GET", "/briefings", { cookie: owner.cookie });
    expect(list.status).toBe(200);
    const items = (await list.json()).data;
    expect(items.length).toBeGreaterThanOrEqual(3);
    // Newest night first.
    expect(items[0].nightDate >= items[1].nightDate).toBe(true);

    const filtered = await api("GET", "/briefings?nightDate=2026-05-01", { cookie: owner.cookie });
    const filteredItems = (await filtered.json()).data;
    expect(filteredItems.length).toBe(1);
    expect(filteredItems[0].nightDate).toBe("2026-05-01");

    const limited = await api("GET", "/briefings?limit=1", { cookie: owner.cookie });
    expect((await limited.json()).data.length).toBe(1);

    const statusFiltered = await api("GET", "/briefings?status=approved", { cookie: owner.cookie });
    expect((await statusFiltered.json()).data.length).toBe(0);

    const otherList = await api("GET", "/briefings", { cookie: other.cookie });
    expect((await otherList.json()).data).toEqual([]);
  });

  it("returns the latest briefing for a night and null for a night with none", async () => {
    const exact = await api("GET", "/briefings/latest?nightDate=2026-05-01", { cookie: owner.cookie });
    expect(exact.status).toBe(200);
    expect((await exact.json()).data.nightDate).toBe("2026-05-01");

    const latest = await api("GET", "/briefings/latest", { cookie: owner.cookie });
    expect((await latest.json()).data.nightDate).toBe("2026-07-03");

    const empty = await api("GET", "/briefings/latest?nightDate=2020-01-01", { cookie: owner.cookie });
    expect(empty.status).toBe(200);
    expect((await empty.json()).data).toBeNull();
  });

  it("fetches one briefing by public id and by ObjectId, and hides other users'", async () => {
    const doc = await Briefing.findOne({ userId: owner.user._id, nightDate: "2026-05-01" });

    const byPublicId = await api("GET", `/briefings/${doc.briefingId}`, { cookie: owner.cookie });
    expect(byPublicId.status).toBe(200);
    expect((await byPublicId.json()).data._id).toBe(String(doc._id));

    const byObjectId = await api("GET", `/briefings/${doc._id}`, { cookie: owner.cookie });
    expect(byObjectId.status).toBe(200);

    const foreign = await api("GET", `/briefings/${doc.briefingId}`, { cookie: other.cookie });
    expect(foreign.status).toBe(404);

    const missing = await api("GET", "/briefings/briefing_does_not_exist", { cookie: owner.cookie });
    expect(missing.status).toBe(404);
  });

  it("validates section edits and records lastEditedAt", async () => {
    const doc = await Briefing.findOne({ userId: owner.user._id, nightDate: "2026-05-01" });

    const unknownSection = await api(
      "PATCH",
      `/briefings/${doc.briefingId}/sections/not_a_section`,
      { cookie: owner.cookie, body: { content: "x" } },
    );
    expect(unknownSection.status).toBe(400);

    const emptyContent = await api(
      "PATCH",
      `/briefings/${doc.briefingId}/sections/executive_summary`,
      { cookie: owner.cookie, body: { content: "" } },
    );
    expect(emptyContent.status).toBe(400);

    const updated = await api(
      "PATCH",
      `/briefings/${doc.briefingId}/sections/executive_summary`,
      { cookie: owner.cookie, body: { content: "Operator-reviewed summary." } },
    );
    expect(updated.status).toBe(200);
    const section = (await updated.json()).data.sections.find(
      (s) => s.name === "executive_summary",
    );
    expect(section.content).toBe("Operator-reviewed summary.");
    expect(section.lastEditedAt).toBeTruthy();

    const listContent = await api(
      "PATCH",
      `/briefings/${doc.briefingId}/sections/recommendations`,
      { cookie: owner.cookie, body: { content: ["Do this first."] } },
    );
    expect(listContent.status).toBe(200);
    expect(
      (await listContent.json()).data.sections.find((s) => s.name === "recommendations").content,
    ).toEqual(["Do this first."]);

    const foreign = await api(
      "PATCH",
      `/briefings/${doc.briefingId}/sections/executive_summary`,
      { cookie: other.cookie, body: { content: "hijack" } },
    );
    expect(foreign.status).toBe(404);
  });

  it("approves once, then locks the briefing", async () => {
    const doc = await Briefing.findOne({ userId: owner.user._id, nightDate: "2026-05-01" });

    const foreign = await api("POST", `/briefings/${doc.briefingId}/approve`, {
      cookie: other.cookie,
    });
    expect(foreign.status).toBe(404);

    const approved = await api("POST", `/briefings/${doc.briefingId}/approve`, {
      cookie: owner.cookie,
    });
    expect(approved.status).toBe(200);
    const approvedDoc = (await approved.json()).data;
    expect(approvedDoc.status).toBe("approved");
    expect(approvedDoc.approvedAt).toBeTruthy();
    expect(approvedDoc.approvedBy).toBe(owner.user._id);

    const again = await api("POST", `/briefings/${doc.briefingId}/approve`, {
      cookie: owner.cookie,
    });
    expect(again.status).toBe(409);

    const edit = await api(
      "PATCH",
      `/briefings/${doc.briefingId}/sections/executive_summary`,
      { cookie: owner.cookie, body: { content: "Too late." } },
    );
    expect(edit.status).toBe(409);
  });

  it("returns 500 rather than hanging when the database read fails", async () => {
    const original = Briefing.findOne;
    Briefing.findOne = () => {
      throw new Error("injected database failure");
    };
    try {
      const res = await api("GET", "/briefings/latest", { cookie: owner.cookie });
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.message).toBe("Internal server error");
      expect(body.stack).toBeUndefined();
    } finally {
      Briefing.findOne = original;
    }
  });

  it("serializes concurrent approval requests and never edits an approved briefing", async () => {
    const generated = await api("POST", "/briefings/generate", {
      cookie: owner.cookie,
      body: { nightDate: "2026-08-04" },
    });
    const briefingId = (await generated.json()).data.briefingId;

    const results = await Promise.all([
      api("POST", `/briefings/${briefingId}/approve`, { cookie: owner.cookie }),
      api("POST", `/briefings/${briefingId}/approve`, { cookie: owner.cookie }),
      api("PATCH", `/briefings/${briefingId}/sections/executive_summary`, {
        cookie: owner.cookie,
        body: { content: "Concurrent edit" },
      }),
    ]);

    expect(results.map((res) => res.status).sort()).toEqual([200, 409, 409]);
    const final = await Briefing.findOne({ briefingId });
    expect(final.status).toBe("approved");
    expect(final.approvedBy.toString()).toBe(owner.user._id);
  });
});
