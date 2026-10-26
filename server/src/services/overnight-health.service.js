import mongoose from "mongoose";
import { Site } from "../models/site.model.js";
import { Machine } from "../models/machine.model.js";
import { Event } from "../models/event.model.js";
import { Prediction } from "../models/prediction.model.js";
import { Incident } from "../models/incident.model.js";
import { IncidentConfiguration } from "../models/incidentConfiguration.model.js";
import OvernightHealthRun from "../models/overnight-health-run.model.js";
import { getMachineCoverage } from "./coverage.service.js";
import { OVERNIGHT_END_HOUR, localDateFor } from "../utils/reporting-window.js";
import { tryWithLock } from "../utils/locking.js";
import { getRedis } from "../db/redis.js";
import logger from "../utils/logger.js";
import { currentMonitoringWindow } from "../utils/monitoring-window.js";
import { startInvestigation } from "./investigation.service.js";
import { monitoringSettingsFor } from "./incident-configuration.service.js";

/**
 * Overnight Health Checker.
 *
 * Every tick evaluates each active site whose persisted IncidentConfiguration
 * is enabled and whose local monitoring window is currently open. The window
 * is both:
 *   - the execution period (checks run while now ∈ [start, end)), and
 *   - the historical range analysed for the report (windowStartAt → now,
 *     clamped to windowEndAt).
 *
 * A run is identified by (siteId, reportingDate) and is unique in MongoDB, so
 * multiple replicas can never create two reports for the same site and
 * reporting date. Replicas additionally serialize work with the existing Redis
 * distributed lock; when Redis is unavailable the unique index and per-site
 * lock fallback keep the pipeline safe, and the report records the degraded
 * state in its error details.
 *
 * Restart recovery: a scheduled/running/failed run whose window closed within
 * OVERNIGHT_RECOVERY_HOURS is picked up and finalised on the next tick, even
 * when the current window is no longer open. Investigation dispatch is
 * retried until the report is marked investigationsQueued.
 */

const MAX_RUN_RETRIES = Number(process.env.OVERNIGHT_MAX_RETRIES || 3);
const RECOVERY_LOOKBACK_MS =
  Number(process.env.OVERNIGHT_RECOVERY_HOURS || 48) * 60 * 60 * 1000;

const redisReady = () => {
  try {
    return getRedis()?.status === "ready";
  } catch {
    return false;
  }
};

/** Evaluate every machine that belongs to the run's site and window. */
const evaluateRun = async (run, site, now) => {
  const machines = await Machine.find({
    userId: site.userId,
    siteId: site._id,
    status: { $ne: "maintenance" },
  }).lean();
  const from = run.windowStartAt;
  const to = new Date(Math.min(now.getTime(), run.windowEndAt.getTime()));

  const results = await Promise.all(
    machines.map(async (machine) => {
      const [event, prediction, incidents, coverage] = await Promise.all([
        Event.findOne({
          userId: site.userId,
          machineId: machine._id,
          timestamp: { $gte: from, $lte: to },
        })
          .sort({ timestamp: -1 })
          .lean(),
        Prediction.findOne({
          userId: site.userId,
          machineId: machine._id,
          timestamp: { $gte: from, $lte: to },
        })
          .sort({ timestamp: -1 })
          .lean(),
        Incident.find({
          userId: site.userId,
          machineId: machine._id,
          $or: [
            { createdAt: { $gte: from, $lte: to } },
            { lastSeenAt: { $gte: from, $lte: to } },
          ],
        })
          .sort({ createdAt: -1 })
          .lean(),
        getMachineCoverage(machine._id, {
          userFilter: { userId: site.userId },
          now,
        }),
      ]);

      const lastSeenAt = event?.timestamp || null;
      const assessed = Boolean(event && prediction && coverage.isReady);
      return {
        machineId: machine.machineId,
        machineName: machine.name,
        assessed,
        status: incidents.length
          ? incidents[0].severity
          : assessed
            ? "healthy"
            : "unassessed",
        lastSeenAt,
        incidents: incidents.map((incident) => ({
          incidentId: incident.incidentId,
          severity: incident.severity,
          title: incident.title,
          lastSeenAt: incident.lastSeenAt || incident.createdAt,
          evidence: {
            anomalyScore: incident.evidence?.anomalyScore ?? null,
            faultProbability: incident.evidence?.faultProbability ?? null,
            faultType: incident.evidence?.faultType ?? null,
            predictionId: incident.evidence?.predictionId ?? null,
          },
          // Stored Argus explanation, never generated on read.
          explanation: incident.explanation
            ? {
                summary: incident.explanation.summary,
                likelyCause: incident.explanation.likelyCause,
                recommendedAction: incident.explanation.recommendedAction,
                urgency: incident.explanation.urgency,
                source: incident.explanation.source,
                status: incident.explanation.status,
                generatedAt: incident.explanation.generatedAt,
              }
            : null,
        })),
        coverage: coverage.isReady ? null : { missing: coverage.missing, lastSeenAt },
      };
    })
  );

  const withIncidents = results.filter((item) => item.incidents.length > 0);
  const assessed = results.filter((item) => item.assessed);
  const gaps = results
    .filter((item) => item.coverage)
    .map(({ machineId, machineName, coverage }) => ({
      machineId,
      machineName,
      ...coverage,
    }));
  const windowEnded = now >= run.windowEndAt;
  const status = windowEnded
    ? assessed.length === results.length && gaps.length === 0
      ? "completed"
      : "completed_with_warnings"
    : "running";

  const update = {
    status,
    ...(status === "running" ? { startedAt: run.startedAt || now } : {}),
    progress: results.length
      ? Math.min(99, Math.round((assessed.length / results.length) * 100))
      : 100,
    expectedMachines: results.length,
    assessedMachines: assessed.length,
    healthyMachines: assessed.length - withIncidents.length,
    abnormalMachines: withIncidents.length,
    unassessedMachines: results.length - assessed.length,
    sensorCoverageGaps: gaps,
    incidents: withIncidents.flatMap((item) => item.incidents),
    machineResults: results,
    summary: {
      machinesEvaluated: results.length,
      healthyMachines: assessed.length - withIncidents.length,
      abnormalMachines: withIncidents.length,
      unassessedMachines: results.length - assessed.length,
      incidents: withIncidents.length,
      sensorCoverageGaps: gaps.length,
      windowEnded,
    },
    ...(status.startsWith("completed")
      ? {
          progress: 100,
          completedAt: run.completedAt || now,
          reportGeneratedAt: now,
          investigationError: null,
        }
      : {}),
  };

  return OvernightHealthRun.findByIdAndUpdate(run._id, { $set: update }, { new: true }).lean();
};

/** Create the run idempotently; the unique index resolves replica races. */
const ensureRun = async (site, window) => {
  const existing = await OvernightHealthRun.findOne({
    siteId: site._id,
    reportingDate: window.reportingDate,
  });
  if (existing) return existing;
  try {
    return await OvernightHealthRun.create({
      userId: site.userId,
      siteId: site._id,
      reportingDate: window.reportingDate,
      timezone: window.timeZone,
      windowStartAt: window.from,
      windowEndAt: window.to,
      status: "scheduled",
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return OvernightHealthRun.findOne({
      siteId: site._id,
      reportingDate: window.reportingDate,
    });
  }
};

/**
 * Enqueue overnight investigations for a completed report. Safe to retry:
 * startInvestigation deduplicates on (userId, incidentId, nightDate) and the
 * BullMQ job id is the investigation document id.
 */
const ensureInvestigations = async (run) => {
  if (run.investigationsQueued) return;
  try {
    const result = await startInvestigation({
      userId: run.userId,
      nightDate: run.reportingDate,
      window: { from: run.windowStartAt, to: run.windowEndAt },
    });
    const investigationIds = (result.jobIds || [])
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    await OvernightHealthRun.updateOne(
      { _id: run._id },
      {
        $set: {
          investigationsQueued: true,
          investigationIds,
          investigationError: null,
        },
      }
    );
  } catch (error) {
    const message = String(error?.message || "Investigation dispatch failed");
    logger.error(
      { err: error, siteId: run.siteId, reportingDate: run.reportingDate },
      "Overnight health investigation dispatch failed; will retry"
    );
    await OvernightHealthRun.updateOne(
      { _id: run._id },
      { $set: { investigationError: message.slice(0, 500) } }
    ).catch(() => {});
  }
};

const markRunFailed = async (run, error, extra = {}) => {
  const message = `${extra.prefix || "Health evaluation failed"}: ${String(
    error?.message || error
  )}`;
  await OvernightHealthRun.updateOne(
    { _id: run._id },
    {
      $set: {
        status: "failed",
        errorDetails: [message.slice(0, 500)],
      },
      $inc: { retryCount: 1 },
    }
  ).catch(() => {});
  logger.error(
    { err: error, siteId: run.siteId, reportingDate: run.reportingDate },
    "Overnight Health Checker run failed; it will be retried"
  );
};

const processRun = async (site, run, now) => {
  if (run.status === "completed" || run.status === "completed_with_warnings") {
    await ensureInvestigations(run);
    return;
  }
  if (run.status === "failed" && (run.retryCount || 0) >= MAX_RUN_RETRIES) {
    return;
  }
  if (now < run.windowStartAt) return;

  try {
    const updated = await evaluateRun(run, site, now);
    if (
      updated.status === "completed" ||
      updated.status === "completed_with_warnings"
    ) {
      await ensureInvestigations(updated);
    }
  } catch (error) {
    await markRunFailed(run, error);
  }
};

const withSiteLock = async (siteId, fn) => {
  if (!redisReady()) {
    // Redis holds both the distributed lock and the investigation queue. The
    // unique (siteId, reportingDate) index still prevents duplicate reports,
    // so continue in-process instead of skipping monitoring entirely.
    logger.warn(
      { siteId },
      "Redis is unavailable; running overnight health checks without a distributed lock"
    );
    return fn();
  }
  return tryWithLock(`overnight-health:site:${siteId}`, fn, 55000);
};

const activeWindowFor = (now, settings) =>
  currentMonitoringWindow(
    now,
    settings.timezone,
    settings.startTime,
    settings.endTime
  );

export const processOvernightHealthChecks = async (now = new Date()) => {
  const sites = await Site.find({ status: "active" }).lean();
  if (sites.length === 0) return;

  const configs = await IncidentConfiguration.find({
    siteId: { $in: sites.map((site) => site._id) },
  }).lean();
  const configBySite = new Map(
    configs.map((config) => [String(config.siteId), config])
  );

  for (const site of sites) {
    const config = configBySite.get(String(site._id)) || null;
    const settings = monitoringSettingsFor(site, config);
    if (!settings.enabled) continue;

    const window = activeWindowFor(now, settings);
    const currentDate =
      window?.reportingDate || localDateFor(now, settings.timezone);

    await withSiteLock(site._id, async () => {
      let currentRun = await OvernightHealthRun.findOne({
        siteId: site._id,
        reportingDate: currentDate,
      });
      if (!currentRun && window) {
        currentRun = await ensureRun(site, window);
      }

      // Restart recovery: pick up an unfinished run whose window closed
      // recently. Bounded by OVERNIGHT_RECOVERY_HOURS so an ancient scheduled
      // record is never resurrected.
      const recoverable =
        !currentRun || currentRun.status !== "running"
          ? await OvernightHealthRun.findOne({
              userId: site.userId,
              siteId: site._id,
              status: { $in: ["scheduled", "running", "failed"] },
              windowStartAt: { $lte: now },
              windowEndAt: {
                $gte: new Date(now.getTime() - RECOVERY_LOOKBACK_MS),
              },
            }).sort({ windowStartAt: -1 })
          : null;

      const candidates = new Map();
      if (currentRun) candidates.set(String(currentRun._id), currentRun);
      if (recoverable) candidates.set(String(recoverable._id), recoverable);

      for (const run of candidates.values()) {
        await processRun(site, run, now);
      }
    });
  }
};

let timer = null;
let tickInProgress = false;

export const startOvernightHealthScheduler = () => {
  if (timer) return timer;
  const tick = async () => {
    if (tickInProgress) return;
    tickInProgress = true;
    try {
      if (redisReady()) {
        await tryWithLock(
          "overnight-health:scheduler",
          () => processOvernightHealthChecks(),
          55000
        );
      } else {
        await processOvernightHealthChecks();
      }
    } catch (error) {
      logger.error(
        { err: error },
        "Overnight Health Checker scheduler tick failed"
      );
    } finally {
      tickInProgress = false;
    }
  };
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
  const config = await IncidentConfiguration.findOne({
    userId,
    siteId: site._id,
  }).lean();
  const { timezone } = monitoringSettingsFor(site, config);
  const date = localDateFor(now, timezone);
  return OvernightHealthRun.findOne({ siteId: site._id, userId, reportingDate: date }).lean();
};

export const getRunHistory = async (userId, siteId, limit = 10) => {
  const site = siteId ? await findOwnedSite(siteId, userId) : null;
  if (siteId && !site) return [];
  return OvernightHealthRun.find({
    userId,
    ...(siteId ? { siteId: site._id } : {}),
  })
    .sort({ reportingDate: -1 })
    .limit(Math.min(Number(limit) || 10, 30))
    .lean();
};
