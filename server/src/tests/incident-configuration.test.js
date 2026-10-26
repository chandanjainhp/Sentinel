import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import app from "../app.js";
import { connectDatabases, disconnectDatabases } from "../db/index.js";
import { User } from "../models/user.model.js";
import { Site } from "../models/site.model.js";
import { IncidentConfiguration } from "../models/incidentConfiguration.model.js";
import OvernightHealthRun from "../models/overnight-health-run.model.js";
import { getIncidentConfigurationStatus } from "../services/incident-configuration.service.js";
import { accessTokenSecret } from "../config/secrets.js";

/**
 * Incident configuration API: persistence, ownership, validation, status and
 * report retrieval. Uses an isolated database + Redis DB so it can run next to
 * the other suites.
 */

const PORT = 8093;
const BASE = `http://localhost:${PORT}/api/v1`;
let server;

const swapPath = (url, path) => {
  const parsed = new URL(url);
  parsed.pathname = path;
  return parsed.toString();
};

const seeded = {};
const tokenFor = (user) =>
  jwt.sign(
    { _id: user._id, tokenVersion: user.tokenVersion ?? 0 },
    accessTokenSecret(),
    { expiresIn: "1h" }
  );

const request = (token, path, options = {}) =>
  fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

beforeAll(async () => {
  process.env.MONGODB_URL = swapPath(
    process.env.MONGODB_URL,
    "/sentinel_ci_incident_config"
  );
  process.env.REDIS_URL = swapPath(process.env.REDIS_URL, "/8");
  await connectDatabases();
  await mongoose.connection.dropDatabase();

  seeded.owner = await User.create({
    email: "config-owner@factory.com",
    username: "config_owner",
    password: "Password123!",
  });
  seeded.other = await User.create({
    email: "config-other@factory.com",
    username: "config_other",
    password: "Password123!",
  });
  seeded.siteA = await Site.create({
    userId: seeded.owner._id,
    name: "Config Plant A",
    timezone: "UTC",
  });
  seeded.siteB = await Site.create({
    userId: seeded.owner._id,
    name: "Config Plant B",
    timezone: "America/New_York",
  });
  seeded.siteOther = await Site.create({
    userId: seeded.other._id,
    name: "Other Plant",
    timezone: "Europe/Berlin",
  });

  seeded.ownerToken = tokenFor(seeded.owner);
  seeded.otherToken = tokenFor(seeded.other);

  server = app.listen(PORT);
});

afterAll(async () => {
  if (server) server.close();
  await disconnectDatabases();
});

describe("incident configuration endpoints", () => {
  it("requires authentication", async () => {
    const res = await fetch(`${BASE}/settings/incident-configuration`);
    expect(res.status).toBe(401);
  });

  it("derives the effective configuration from the site when none is persisted", async () => {
    const res = await request(
      seeded.ownerToken,
      `/settings/incident-configuration?siteId=${seeded.siteA.siteId}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.configuration.siteId).toBe(seeded.siteA.siteId);
    expect(body.data.configuration.persisted).toBe(false);
    expect(body.data.configuration.enabled).toBe(true);
    expect(body.data.configuration.timezone).toBe("UTC");
    expect(body.data.configuration.startTime).toBe("00:00");
    expect(body.data.configuration.endTime).toBe("09:00");
    expect(body.data.configuration.scheduleType).toBe("daily");
  });

  it("requires an explicit siteId when the user owns more than one site", async () => {
    const missing = await request(seeded.ownerToken, "/settings/incident-configuration");
    expect(missing.status).toBe(400);
    const body = await missing.json();
    expect(body.message).toMatch(/siteId is required/i);
  });

  it("persists a schedule and keeps the legacy site fields in sync", async () => {
    const res = await request(seeded.ownerToken, "/settings/incident-configuration", {
      method: "PUT",
      body: JSON.stringify({
        siteId: seeded.siteA.siteId,
        timezone: "Asia/Kolkata",
        startTime: "21:30",
        endTime: "05:15",
        enabled: true,
        scheduleType: "daily",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.configuration.persisted).toBe(true);
    expect(body.data.configuration.timezone).toBe("Asia/Kolkata");
    expect(body.data.configuration.startTime).toBe("21:30");
    expect(body.data.configuration.endTime).toBe("05:15");

    const stored = await IncidentConfiguration.findOne({
      userId: seeded.owner._id,
      siteId: seeded.siteA._id,
    }).lean();
    expect(stored).not.toBeNull();
    expect(stored.timezone).toBe("Asia/Kolkata");

    const site = await Site.findById(seeded.siteA._id).lean();
    expect(site.timezone).toBe("Asia/Kolkata");
    expect(site.monitoringStartTime).toBe("21:30");
    expect(site.monitoringEndTime).toBe("05:15");
    expect(site.monitoringEnabled).toBe(true);
  });

  it("returns the saved configuration on the next read", async () => {
    const res = await request(
      seeded.ownerToken,
      `/settings/incident-configuration?siteId=${seeded.siteB.siteId}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // siteB never had a schedule saved — effective values come from its site
    expect(body.data.configuration.timezone).toBe("America/New_York");
    expect(body.data.configuration.persisted).toBe(false);

    const saved = await request(
      seeded.ownerToken,
      `/settings/incident-configuration?siteId=${seeded.siteA.siteId}`
    );
    const savedBody = await saved.json();
    expect(savedBody.data.configuration.persisted).toBe(true);
    expect(savedBody.data.configuration.startTime).toBe("21:30");
  });

  it("rejects invalid schedules without writing anything", async () => {
    const before = await IncidentConfiguration.countDocuments({});
    const cases = [
      { timezone: "Invalid/Zone" },
      { startTime: "24:00" },
      { endTime: "9:00" },
      { startTime: "08:00", endTime: "08:00" },
      { scheduleType: "hourly" },
      { bogus: true },
    ];
    for (const patch of cases) {
      const res = await request(
        seeded.ownerToken,
        "/settings/incident-configuration",
        {
          method: "PUT",
          body: JSON.stringify({ siteId: seeded.siteA.siteId, ...patch }),
        }
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    }
    expect(await IncidentConfiguration.countDocuments({})).toBe(before);
  });

  it("validates a proposed schedule without persisting it", async () => {
    const before = await IncidentConfiguration.countDocuments({});
    const res = await request(
      seeded.ownerToken,
      "/settings/incident-configuration/validate",
      {
        method: "POST",
        body: JSON.stringify({
          siteId: seeded.siteA.siteId,
          timezone: "America/New_York",
          startTime: "22:00",
          endTime: "06:00",
        }),
      }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.valid).toBe(true);
    expect(body.data.configuration.timezone).toBe("America/New_York");
    expect(body.data.nextRunAt).toBeTruthy();
    expect(body.data.todayWindow).not.toBeNull();
    expect(new Date(body.data.todayWindow.to).getTime()).toBeGreaterThan(
      new Date(body.data.todayWindow.from).getTime()
    );
    expect(await IncidentConfiguration.countDocuments({})).toBe(before);
  });

  it("prevents cross-user access to another owner's site", async () => {
    const get = await request(
      seeded.otherToken,
      `/settings/incident-configuration?siteId=${seeded.siteA.siteId}`
    );
    expect(get.status).toBe(404);

    const put = await request(seeded.otherToken, "/settings/incident-configuration", {
      method: "PUT",
      body: JSON.stringify({
        siteId: seeded.siteA.siteId,
        timezone: "UTC",
        startTime: "01:00",
        endTime: "02:00",
      }),
    });
    expect(put.status).toBe(404);

    const other = await request(
      seeded.otherToken,
      `/settings/incident-configuration?siteId=${seeded.siteOther.siteId}`
    );
    expect(other.status).toBe(200);
  });

  it("reports status with the latest run and next execution", async () => {
    const res = await request(
      seeded.ownerToken,
      `/settings/incident-configuration/status?siteId=${seeded.siteA.siteId}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.configuration.siteId).toBe(seeded.siteA.siteId);
    expect(body.data.nextRunAt).toBeTruthy();
    // state depends on whether the real clock is inside the window right
    // now; the deterministic assertions live below at service level with a
    // fixed `now`.
    expect(["waiting", "running"]).toContain(body.data.scheduler.state);
    expect(body.data.latestRun).toBeNull();

    // Fixed-clock checks: 17:00Z is 22:30 in Asia/Kolkata (inside the
    // 21:30–05:15 window), 10:00Z is 15:30 (outside it).
    const inside = await getIncidentConfigurationStatus(
      seeded.owner._id,
      seeded.siteA._id,
      new Date("2026-10-20T17:00:00Z")
    );
    expect(inside.scheduler.state).toBe("running");
    const waiting = await getIncidentConfigurationStatus(
      seeded.owner._id,
      seeded.siteA._id,
      new Date("2026-10-20T10:00:00Z")
    );
    expect(waiting.scheduler.state).toBe("waiting");

    const windowStart = new Date("2026-10-20T16:00:00Z");
    await OvernightHealthRun.create({
      userId: seeded.owner._id,
      siteId: seeded.siteA._id,
      reportingDate: "2026-10-20",
      timezone: "Asia/Kolkata",
      windowStartAt: windowStart,
      windowEndAt: new Date(windowStart.getTime() + 8 * 3600_000),
      status: "failed",
      errorDetails: ["ML service unavailable"],
      retryCount: 3,
    });

    const after = await request(
      seeded.ownerToken,
      `/settings/incident-configuration/status?siteId=${seeded.siteA.siteId}`
    );
    const afterBody = await after.json();
    expect(afterBody.data.latestRun.reportingDate).toBe("2026-10-20");
    expect(afterBody.data.latestRun.status).toBe("failed");
    expect(afterBody.data.warnings.join(" ")).toMatch(/ML service unavailable/);
  });

  it("serves a persisted monitoring report and isolates it by owner", async () => {
    const report = await request(
      seeded.ownerToken,
      `/overnight-health/reports/2026-10-20?siteId=${seeded.siteA.siteId}`
    );
    expect(report.status).toBe(200);
    const body = await report.json();
    expect(body.data.reportingDate).toBe("2026-10-20");
    expect(body.data.siteId.toString()).toBe(String(seeded.siteA._id));

    const foreign = await request(
      seeded.otherToken,
      `/overnight-health/reports/2026-10-20?siteId=${seeded.siteA.siteId}`
    );
    expect(foreign.status).toBe(404);

    const malformed = await request(
      seeded.ownerToken,
      `/overnight-health/reports/not-a-date?siteId=${seeded.siteA.siteId}`
    );
    expect(malformed.status).toBe(400);
  });

  it("disables monitoring and reports no next run", async () => {
    const res = await request(seeded.ownerToken, "/settings/incident-configuration", {
      method: "PUT",
      body: JSON.stringify({ siteId: seeded.siteA.siteId, enabled: false }),
    });
    expect(res.status).toBe(200);

    const status = await request(
      seeded.ownerToken,
      `/settings/incident-configuration/status?siteId=${seeded.siteA.siteId}`
    );
    const body = await status.json();
    expect(body.data.configuration.enabled).toBe(false);
    expect(body.data.nextRunAt).toBeNull();
    expect(body.data.scheduler.state).toBe("disabled");

    const site = await Site.findById(seeded.siteA._id).lean();
    expect(site.monitoringEnabled).toBe(false);
  });

  it("keeps the legacy site PATCH in sync with a persisted schedule", async () => {
    const res = await request(seeded.ownerToken, `/sites/${seeded.siteA._id}`, {
      method: "PATCH",
      body: JSON.stringify({
        timezone: "Europe/London",
        monitoringEnabled: true,
        monitoringStartTime: "23:00",
        monitoringEndTime: "06:30",
      }),
    });
    expect(res.status).toBe(200);

    const config = await IncidentConfiguration.findOne({
      userId: seeded.owner._id,
      siteId: seeded.siteA._id,
    }).lean();
    expect(config.timezone).toBe("Europe/London");
    expect(config.enabled).toBe(true);
    expect(config.startTime).toBe("23:00");
    expect(config.endTime).toBe("06:30");
  });

  it("rejects an invalid time zone on the legacy site endpoint", async () => {
    const res = await request(seeded.ownerToken, `/sites/${seeded.siteA._id}`, {
      method: "PATCH",
      body: JSON.stringify({ timezone: "Nowhere/Invalid" }),
    });
    expect(res.status).toBe(400);
  });
});
