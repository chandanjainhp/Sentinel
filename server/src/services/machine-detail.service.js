import mongoose from "mongoose";
import { Machine } from "../models/machine.model.js";
import { Site } from "../models/site.model.js";
import { Sensor } from "../models/sensor.model.js";
import { Event } from "../models/event.model.js";
import { Prediction } from "../models/prediction.model.js";
import { Incident } from "../models/incident.model.js";
import { ApiError } from "../utils/api-error.js";
import {
  WARNING_ANOMALY_SCORE,
  CRITICAL_ANOMALY_SCORE,
} from "./ml-contract.service.js";

/**
 * Machine detail — everything the /machines/[machineId] signature page
 * renders, in ONE deterministic, user-scoped aggregation:
 *
 *   machine      → name, type, status, asset/serial/location, health reason
 *   site         → breadcrumb (Sites › Site › Machine)
 *   prediction   → latest prediction (RUL, anomaly, fault, model) — or null
 *   sensorTrends → one series per sensor built from REAL stored events
 *                  (last TREND_WINDOW_MIN minutes, oldest→newest) plus the
 *                  sensor's warning threshold when one is configured
 *   history      → newest 20 predictions (mono table)
 *   incidents    → open incidents for the machine (severity dot rows)
 *
 * The client never computes health, severity or raw values; it renders this.
 */

const TREND_WINDOW_MIN = 60;
const TREND_MAX_POINTS = 240;
const HISTORY_LIMIT = 20;
const INCIDENT_LIMIT = 10;

const round2 = (n) => Math.round(n * 100) / 100;

/** Resolve a machineId param that may be the public string id or the _id. */
const resolveMachineId = async (machineIdParam, userFilter) => {
  const isObjectId = mongoose.Types.ObjectId.isValid(machineIdParam);
  const machine = await Machine.findOne({
    ...userFilter,
    ...(isObjectId
      ? { $or: [{ _id: machineIdParam }, { machineId: machineIdParam }] }
      : { machineId: machineIdParam }),
  })
    .select("_id machineId assetId name machineType manufacturer model serialNumber location zone status healthUnknownReason siteId updatedAt")
    .lean();

  if (!machine) throw new ApiError(404, "Machine not found");
  return machine;
};

/** Sensor-level warning threshold, when the customer configured one. */
const sensorThreshold = (sensor) => {
  const md = sensor.metadata || {};
  const raw =
    md.warningThreshold ??
    md.threshold ??
    md.warning_threshold ??
    md.maxValue ??
    md.max_value;
  const n = typeof raw === "string" ? Number(raw) : raw;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

const SENSOR_META = {
  temperature: { unit: "°C" },
  vibration: { unit: "mm/s" },
  pressure: { unit: "bar" },
  current: { unit: "A" },
  voltage: { unit: "V" },
  rpm: { unit: "rpm" },
  flow: { unit: "L/min" },
};

export const getMachineDetail = async (machineIdParam, userFilter = {}) => {
  const machine = await resolveMachineId(machineIdParam, userFilter);
  const machineKey = machine._id;

  const [site, sensors, latestPrediction, historyDocs, openIncidents] =
    await Promise.all([
      machine.siteId
        ? Site.findById(machine.siteId).select("name siteId").lean()
        : null,

      Sensor.find({ ...userFilter, machineId: machineKey })
        .select("name type unit metadata lastReadingAt")
        .lean(),

      Prediction.findOne({ ...userFilter, machineId: machineKey })
        .sort({ createdAt: -1 })
        .lean(),

      Prediction.find({ ...userFilter, machineId: machineKey })
        .sort({ createdAt: -1 })
        .limit(HISTORY_LIMIT)
        .lean(),

      Incident.find({ ...userFilter, machineId: machineKey, status: { $in: ["open", "reviewed"] } })
        .sort({ createdAt: -1 })
        .limit(INCIDENT_LIMIT)
        .lean(),
    ]);

  /* ---- Sensor trend series from REAL events ---- */
  const sensorIds = sensors.map((s) => s._id);
  const windowStart = new Date(Date.now() - TREND_WINDOW_MIN * 60 * 1000);

  const events =
    sensorIds.length > 0
      ? await Event.find({
          ...userFilter,
          machineId: machineKey,
          sensorId: { $in: sensorIds },
          timestamp: { $gte: windowStart },
        })
          .sort({ timestamp: 1 })
          .select("sensorId timestamp values")
          .limit(sensorIds.length * TREND_MAX_POINTS)
          .lean()
      : [];

  const bySensor = new Map();
  for (const e of events) {
    const key = String(e.sensorId);
    if (!bySensor.has(key)) bySensor.set(key, []);
    bySensor.get(key).push(e);
  }

  const trendSeries = sensors.map((sensor) => {
    const meta = SENSOR_META[sensor.type] || { unit: sensor.unit || "" };
    const seriesEvents = bySensor.get(String(sensor._id)) || [];

    // A sensor may report several channels per event; the series plots the
    // channel named after the sensor type, falling back to its first channel.
    const points = [];
    for (const e of seriesEvents) {
      const values =
        e.values instanceof Map
          ? Object.fromEntries(e.values)
          : e.values || {};
      let v = values[sensor.type];
      if (typeof v !== "number" || !Number.isFinite(v)) {
        const firstNumeric = Object.values(values).find(
          (x) => typeof x === "number" && Number.isFinite(x),
        );
        v = firstNumeric;
      }
      if (typeof v === "number") {
        points.push({ t: new Date(e.timestamp).getTime(), v });
      }
    }

    return {
      sensorId: sensor.sensorId,
      name: sensor.name,
      type: sensor.type,
      unit: meta.unit,
      threshold: sensorThreshold(sensor),
      lastReadingAt: sensor.lastReadingAt || null,
      points: points.slice(-TREND_MAX_POINTS),
    };
  });

  /* ---- Latest prediction (the three tiles) ---- */
  const latest = latestPrediction
    ? {
        predictionId: latestPrediction.predictionId,
        model: latestPrediction.model,
        modelVersion: latestPrediction.modelVersion,
        rulValue:
          typeof latestPrediction.rulValue === "number"
            ? latestPrediction.rulValue
            : null,
        rulUnit: latestPrediction.rulUnit || null,
        anomalyScore:
          typeof latestPrediction.anomalyScore === "number"
            ? round2(latestPrediction.anomalyScore)
            : null,
        faultProbability:
          typeof latestPrediction.faultProbability === "number"
            ? round2(latestPrediction.faultProbability)
            : null,
        faultType: latestPrediction.faultType || null,
        confidence:
          typeof latestPrediction.confidence === "number"
            ? round2(latestPrediction.confidence)
            : null,
        timestamp: latestPrediction.timestamp,
        createdAt: latestPrediction.createdAt,
      }
    : null;

  /* ---- Prediction history rows (mono table) ---- */
  const history = historyDocs.map((p) => ({
    predictionId: p.predictionId,
    model: p.model,
    modelVersion: p.modelVersion,
    rulValue: typeof p.rulValue === "number" ? p.rulValue : null,
    rulUnit: p.rulUnit || null,
    anomalyScore: typeof p.anomalyScore === "number" ? round2(p.anomalyScore) : null,
    faultProbability:
      typeof p.faultProbability === "number" ? round2(p.faultProbability) : null,
    faultType: p.faultType || null,
    createdAt: p.createdAt,
  }));

  /* ---- Open incidents ---- */
  const incidents = openIncidents.map((i) => ({
    incidentId: i.incidentId || String(i._id),
    severity: i.severity,
    type: i.type,
    title: i.title,
    reason: i.reason,
    status: i.status,
    occurrenceCount: i.occurrenceCount,
    lastSeenAt: i.lastSeenAt || null,
    createdAt: i.createdAt,
  }));

  return {
    machine: {
      _id: String(machine._id),
      machineId: machine.machineId,
      assetId: machine.assetId,
      name: machine.name,
      machineType: machine.machineType,
      manufacturer: machine.manufacturer || null,
      model: machine.model || null,
      serialNumber: machine.serialNumber || null,
      location: machine.location || null,
      zone: machine.zone || null,
      status: machine.status,
      healthUnknownReason: machine.healthUnknownReason || null,
      updatedAt: machine.updatedAt,
    },
    site: site ? { siteId: site.siteId, _id: String(site._id), name: site.name } : null,
    prediction: latest,
    sensorTrends: trendSeries,
    history,
    incidents,
    thresholds: {
      warningAnomalyScore: WARNING_ANOMALY_SCORE,
      criticalAnomalyScore: CRITICAL_ANOMALY_SCORE,
    },
    trendWindowMin: TREND_WINDOW_MIN,
  };
};
