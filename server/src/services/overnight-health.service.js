import { Site } from "../models/site.model.js";
import { Machine } from "../models/machine.model.js";
import { Event } from "../models/event.model.js";
import { Prediction } from "../models/prediction.model.js";
import { Incident } from "../models/incident.model.js";
import OvernightHealthRun from "../models/overnight-health-run.model.js";
import { getMachineCoverage } from "./coverage.service.js";
import { OVERNIGHT_END_HOUR, localDateFor, reportingWindow } from "../utils/reporting-window.js";
import { tryWithLock } from "../utils/locking.js";
import logger from "../utils/logger.js";
import mongoose from "mongoose";

const configuredTimezone = (site) => site.timezone || process.env.OVERNIGHT_TIMEZONE || "Asia/Kolkata";
const configuredEndHour = Number(process.env.OVERNIGHT_END_HOUR || OVERNIGHT_END_HOUR);

const evaluateRun = async (run, site, now) => {
  const machines = await Machine.find({ userId: site.userId, siteId: site._id, status: { $ne: "maintenance" } }).lean();
  const from = run.windowStartAt;
  const to = new Date(Math.min(now.getTime(), run.windowEndAt.getTime()));
  const results = await Promise.all(machines.map(async (machine) => {
    const [event, prediction, incidents, coverage] = await Promise.all([
      Event.findOne({ userId: site.userId, machineId: machine._id, timestamp: { $gte: from, $lte: to } }).sort({ timestamp: -1 }).lean(),
      Prediction.findOne({ userId: site.userId, machineId: machine._id, timestamp: { $gte: from, $lte: to } }).sort({ timestamp: -1 }).lean(),
      Incident.find({
        userId: site.userId,
        machineId: machine._id,
        $or: [
          { createdAt: { $gte: from, $lte: to } },
          { lastSeenAt: { $gte: from, $lte: to } },
        ],
      }).sort({ createdAt: -1 }).lean(),
      getMachineCoverage(machine._id, { userFilter: { userId: site.userId }, now }),
    ]);
    const lastSeenAt = event?.timestamp || null;
    const assessed = Boolean(event && prediction && coverage.isReady);
    return {
      machineId: machine.machineId,
      machineName: machine.name,
      assessed,
      status: incidents.length ? incidents[0].severity : assessed ? "healthy" : "unassessed",
      lastSeenAt,
      incidents: incidents.map((incident) => ({
        incidentId: incident.incidentId,
        severity: incident.severity,
        title: incident.title,
        lastSeenAt: incident.lastSeenAt || incident.createdAt,
      })),
      coverage: coverage.isReady ? null : { missing: coverage.missing, lastSeenAt },
    };
  }));

  const abnormal = results.filter((item) => item.incidents.length > 0);
  const assessed = results.filter((item) => item.assessed);
  const gaps = results.filter((item) => item.coverage).map(({ machineId, machineName, coverage }) => ({ machineId, machineName, ...coverage }));
  const status = now >= run.windowEndAt
    ? (assessed.length === results.length && gaps.length === 0 ? "completed" : "completed_with_warnings")
    : "running";

  const update = {
    status,
    ...(status === "running" ? { startedAt: run.startedAt || now } : {}),
    progress: results.length ? Math.min(99, Math.round((assessed.length / results.length) * 100)) : 100,
    expectedMachines: results.length,
    assessedMachines: assessed.length,
    healthyMachines: assessed.length - abnormal.length,
    abnormalMachines: abnormal.length,
    unassessedMachines: results.length - assessed.length,
    sensorCoverageGaps: gaps,
    incidents: abnormal.flatMap((item) => item.incidents),
    machineResults: results,
    ...(status.startsWith("completed") ? { progress: 100, completedAt: now, reportGeneratedAt: now } : {}),
  };
  return OvernightHealthRun.findByIdAndUpdate(run._id, { $set: update }, { new: true }).lean();
};

const ensureRun = async (site, window) => OvernightHealthRun.findOneAndUpdate(
  { siteId: site._id, reportingDate: window.reportingDate },
  {
    $setOnInsert: {
      userId: site.userId,
      siteId: site._id,
      reportingDate: window.reportingDate,
      timezone: window.timeZone,
      windowStartAt: window.from,
      windowEndAt: window.to,
      status: "scheduled",
    },
  },
  { upsert: true, new: true, setDefaultsOnInsert: true },
);

export const processOvernightHealthChecks = async (now = new Date()) => {
  const sites = await Site.find({ status: "active" }).lean();
  for (const site of sites) {
    const timezone = configuredTimezone(site);
    const date = localDateFor(now, timezone);
    const window = reportingWindow(date, timezone, configuredEndHour);
    if (!window) continue;
    const inWindow = now >= window.from && now < window.to;
    const existing = await OvernightHealthRun.findOne({ siteId: site._id, reportingDate: date });
    // Never create a historical backfill after a window that was never started.
    // Existing scheduled/running/failed records are recoverable after restarts.
    if (!inWindow && !existing) continue;
    const run = await ensureRun(site, window);
    if (run.status === "completed" || run.status === "completed_with_warnings") continue;
    try {
      await evaluateRun(run, site, now);
    } catch (error) {
      await OvernightHealthRun.findByIdAndUpdate(run._id, {
        $set: { status: "failed", errorDetails: [String(error.message || "Health evaluation failed")] },
        $inc: { retryCount: 1 },
      });
      logger.error({ err: error, siteId: site._id }, "Overnight Health Checker run failed; will retry");
    }
  }
};

let timer = null;
export const startOvernightHealthScheduler = () => {
  if (timer) return timer;
  const tick = () => tryWithLock("overnight-health:scheduler", () => processOvernightHealthChecks(), 55000)
    .catch((error) => logger.error({ err: error }, "Overnight Health Checker scheduler tick failed"));
  timer = setInterval(tick, Number(process.env.OVERNIGHT_CHECK_INTERVAL_MS || 60000));
  timer.unref?.();
  tick();
  return timer;
};

export const stopOvernightHealthScheduler = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

const findOwnedSite = (siteId, userId) => {
  const siteQuery = { userId, status: "active" };
  if (siteId) {
    siteQuery.$or = mongoose.Types.ObjectId.isValid(siteId)
      ? [{ _id: siteId }, { siteId }]
      : [{ siteId }];
  }
  return Site.findOne(siteQuery);
};

export const getCurrentRun = async (siteId, userId, now = new Date()) => {
  const site = await findOwnedSite(siteId, userId);
  if (!site) return null;
  const timezone = configuredTimezone(site);
  const date = localDateFor(now, timezone);
  return OvernightHealthRun.findOne({ siteId: site._id, userId, reportingDate: date }).lean();
};

export const getRunHistory = async (userId, siteId, limit = 10) => {
  const site = siteId ? await findOwnedSite(siteId, userId) : null;
  if (siteId && !site) return [];
  return OvernightHealthRun.find({
    userId,
    ...(siteId ? { siteId: site?._id || null } : {}),
  }).sort({ reportingDate: -1 }).limit(Math.min(Number(limit) || 10, 30)).lean();
};
