import mongoose from "mongoose";
import { Site } from "../models/site.model.js";
import { IncidentConfiguration } from "../models/incidentConfiguration.model.js";
import OvernightHealthRun from "../models/overnight-health-run.model.js";
import { getRedis } from "../db/redis.js";
import { ApiError } from "../utils/api-error.js";
import { OVERNIGHT_END_HOUR, localDateFor } from "../utils/reporting-window.js";
import {
  currentMonitoringWindow,
  isValidTimeZone,
  monitoringWindow,
  nextMonitoringStart,
  validMonitoringTime,
} from "../utils/monitoring-window.js";

/**
 * Automated monitoring configuration.
 *
 * Scope: one schedule per site. The schedule is stored in
 * IncidentConfiguration; the Site document keeps a projection of the same
 * four fields because the legacy Settings page and site PATCH endpoint still
 * read/write them. Both directions are synced, so a user can never end up
 * with two conflicting schedules.
 *
 * Window semantics: [startTime, endTime) in the site's IANA time zone is the
 * period during which scheduled checks execute AND the historical range they
 * analyse for each reporting date. A window may cross midnight; its
 * reportingDate is the local calendar date the window started on.
 */

const DEFAULT_END_TIME = `${String(OVERNIGHT_END_HOUR).padStart(2, "0")}:00`;

const safeTimezone = (value) =>
  isValidTimeZone(value) ? value : "UTC";

const timeOr = (value, fallback) =>
  validMonitoringTime(value) ? value : fallback;

/**
 * Merge a persisted configuration (or site defaults when none exists) into
 * the values the scheduler actually uses.
 */
export const monitoringSettingsFor = (site, config = null) => {
  const timezone = safeTimezone(config?.timezone || site.timezone);
  return {
    enabled: config ? config.enabled !== false : site.monitoringEnabled !== false,
    timezone,
    startTime: timeOr(config?.startTime, timeOr(site.monitoringStartTime, "00:00")),
    endTime: timeOr(config?.endTime, timeOr(site.monitoringEndTime, DEFAULT_END_TIME)),
    scheduleType: config?.scheduleType || "daily",
    persisted: Boolean(config),
  };
};

const findOwnedSite = async (userId, siteIdParam) => {
  const sites = await Site.find({ userId }).sort({ createdAt: 1 }).lean();
  if (siteIdParam) {
    const isObjectId = mongoose.Types.ObjectId.isValid(siteIdParam);
    const site = sites.find(
      (candidate) =>
        candidate.siteId === siteIdParam ||
        (isObjectId && String(candidate._id) === String(siteIdParam))
    );
    if (!site) throw new ApiError(404, "Site not found");
    return site;
  }
  if (sites.length === 0) throw new ApiError(404, "No site configured for this account");
  if (sites.length > 1) {
    throw new ApiError(
      400,
      "siteId is required when the account has more than one site"
    );
  }
  return sites[0];
};

const toPublicConfiguration = (site, config) => {
  const settings = monitoringSettingsFor(site, config);
  return {
    id: config?._id ? String(config._id) : null,
    siteId: site.siteId,
    siteName: site.name,
    enabled: settings.enabled,
    timezone: settings.timezone,
    startTime: settings.startTime,
    endTime: settings.endTime,
    scheduleType: settings.scheduleType,
    persisted: settings.persisted,
    createdAt: config?.createdAt ?? null,
    updatedAt: config?.updatedAt ?? null,
  };
};

const describeSchedule = (configuration, now) => {
  if (!configuration.enabled) return { currentWindow: null, nextRunAt: null };
  const window = currentMonitoringWindow(
    now,
    configuration.timezone,
    configuration.startTime,
    configuration.endTime
  );
  return {
    currentWindow: window
      ? {
          from: window.from,
          to: window.to,
          reportingDate: window.reportingDate,
          timezone: window.timeZone,
        }
      : null,
    nextRunAt: nextMonitoringStart(
      now,
      configuration.timezone,
      configuration.startTime
    ),
  };
};

const loadConfiguration = (userId, site) =>
  IncidentConfiguration.findOne({ userId, siteId: site._id }).lean();

export const getIncidentConfiguration = async (
  userId,
  siteIdParam,
  now = new Date()
) => {
  const site = await findOwnedSite(userId, siteIdParam);
  const config = await loadConfiguration(userId, site);
  const configuration = toPublicConfiguration(site, config);
  return { configuration, ...describeSchedule(configuration, now) };
};

/** Merge request input over the current effective configuration. */
const mergeConfigurationInput = (site, config, input) => {
  const current = toPublicConfiguration(site, config);
  const merged = {
    enabled: input.enabled ?? current.enabled,
    timezone: input.timezone ?? current.timezone,
    startTime: input.startTime ?? current.startTime,
    endTime: input.endTime ?? current.endTime,
    scheduleType: input.scheduleType ?? current.scheduleType,
  };
  if (!isValidTimeZone(merged.timezone)) {
    throw new ApiError(400, "timezone must be a valid IANA time zone");
  }
  if (!validMonitoringTime(merged.startTime) || !validMonitoringTime(merged.endTime)) {
    throw new ApiError(400, "startTime and endTime must be HH:mm (00:00–23:59)");
  }
  if (merged.startTime === merged.endTime) {
    throw new ApiError(400, "startTime and endTime must differ");
  }
  if (merged.scheduleType !== "daily") {
    throw new ApiError(400, "Only the daily schedule type is supported");
  }
  return merged;
};

const persistConfiguration = async (userId, site, merged) => {
  const update = { $set: merged };
  const options = {
    new: true,
    upsert: true,
    runValidators: true,
    setDefaultsOnInsert: true,
  };
  try {
    return await IncidentConfiguration.findOneAndUpdate(
      { userId, siteId: site._id },
      update,
      options
    );
  } catch (error) {
    // Concurrent first write: the unique (userId, siteId) index rejects the
    // losing upsert insert. Re-apply the same update to the winner's doc.
    if (error?.code !== 11000) throw error;
    return IncidentConfiguration.findOneAndUpdate(
      { userId, siteId: site._id },
      update,
      { new: true, runValidators: true }
    );
  }
};

export const saveIncidentConfiguration = async ({
  userId,
  siteIdParam,
  input = {},
  now = new Date(),
}) => {
  const site = await findOwnedSite(userId, input.siteId || siteIdParam);
  const config = await loadConfiguration(userId, site);
  const merged = mergeConfigurationInput(site, config, input);
  const saved = await persistConfiguration(userId, site, merged);

  // Keep the legacy site projection in step so the old Settings page and the
  // scheduler can never disagree about the active schedule.
  await Site.updateOne(
    { _id: site._id, userId },
    {
      $set: {
        timezone: merged.timezone,
        monitoringEnabled: merged.enabled,
        monitoringStartTime: merged.startTime,
        monitoringEndTime: merged.endTime,
      },
    }
  );

  const configuration = toPublicConfiguration(site, saved.toObject());
  return { configuration, ...describeSchedule(configuration, now) };
};

export const validateIncidentConfiguration = async ({
  userId,
  siteIdParam,
  input = {},
  now = new Date(),
}) => {
  const site = await findOwnedSite(userId, input.siteId || siteIdParam);
  const config = await loadConfiguration(userId, site);
  const merged = mergeConfigurationInput(site, config, input);
  const configuration = {
    ...toPublicConfiguration(site, config),
    ...merged,
  };
  const preview = monitoringWindow(
    localDateFor(now, merged.timezone),
    merged.timezone,
    merged.startTime,
    merged.endTime
  );
  return {
    valid: true,
    configuration,
    ...describeSchedule(configuration, now),
    todayWindow: preview
      ? { from: preview.from, to: preview.to, reportingDate: preview.reportingDate }
      : null,
  };
};

const redisStatus = () => {
  try {
    return getRedis()?.status || "unavailable";
  } catch {
    return "unavailable";
  }
};

const latestRunProjection =
  "reportingDate timezone windowStartAt windowEndAt status startedAt completedAt " +
  "reportGeneratedAt retryCount errorDetails investigationError summary " +
  "expectedMachines assessedMachines healthyMachines abnormalMachines " +
  "unassessedMachines incidents sensorCoverageGaps";

export const getIncidentConfigurationStatus = async (
  userId,
  siteIdParam,
  now = new Date()
) => {
  const site = await findOwnedSite(userId, siteIdParam);
  const config = await loadConfiguration(userId, site);
  const configuration = toPublicConfiguration(site, config);
  const schedule = describeSchedule(configuration, now);
  const latestRun = await OvernightHealthRun.findOne({
    userId,
    siteId: site._id,
  })
    .select(latestRunProjection)
    .sort({ windowStartAt: -1 })
    .lean();

  const warnings = [];
  const redis = redisStatus();
  if (redis !== "ready") {
    warnings.push(
      `Redis is ${redis}: distributed scheduler locks and investigation job dispatch are degraded`
    );
  }
  if (latestRun?.status === "failed") {
    warnings.push(
      latestRun.errorDetails?.[0] || "The latest monitoring run failed"
    );
  }
  if (latestRun?.investigationError) {
    warnings.push(`Investigation dispatch failed: ${latestRun.investigationError}`);
  }

  return {
    configuration,
    ...schedule,
    scheduler: {
      state: !configuration.enabled
        ? "disabled"
        : schedule.currentWindow
          ? "running"
          : "waiting",
      redis,
      pollIntervalMs: Number(process.env.OVERNIGHT_CHECK_INTERVAL_MS || 60000),
      distributedLocking: redis === "ready",
    },
    latestRun,
    warnings,
  };
};

export const getMonitoringReport = async (userId, siteIdParam, reportingDate) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(reportingDate || ""))) {
    throw new ApiError(400, "reportingDate must be YYYY-MM-DD");
  }
  const site = await findOwnedSite(userId, siteIdParam);
  const run = await OvernightHealthRun.findOne({
    userId,
    siteId: site._id,
    reportingDate,
  }).lean();
  if (!run) throw new ApiError(404, "Monitoring report not found");
  return run;
};

/**
 * Project a legacy Site PATCH (timezone/monitoring*) onto an existing
 * configuration, so both surfaces stay consistent.
 */
export const syncConfigurationFromSite = async (userId, site, changes = {}) => {
  const touchesSchedule =
    changes.timezone !== undefined ||
    changes.monitoringEnabled !== undefined ||
    changes.monitoringStartTime !== undefined ||
    changes.monitoringEndTime !== undefined;
  if (!touchesSchedule) return;

  const config = await IncidentConfiguration.findOne({ userId, siteId: site._id });
  if (!config) return;

  if (changes.timezone !== undefined && isValidTimeZone(changes.timezone)) {
    config.timezone = changes.timezone;
  }
  if (changes.monitoringEnabled !== undefined) {
    config.enabled = changes.monitoringEnabled !== false;
  }
  if (changes.monitoringStartTime !== undefined && validMonitoringTime(changes.monitoringStartTime)) {
    config.startTime = changes.monitoringStartTime;
  }
  if (changes.monitoringEndTime !== undefined && validMonitoringTime(changes.monitoringEndTime)) {
    config.endTime = changes.monitoringEndTime;
  }
  if (config.startTime === config.endTime) {
    throw new ApiError(400, "startTime and endTime must differ");
  }
  await config.save();
};
