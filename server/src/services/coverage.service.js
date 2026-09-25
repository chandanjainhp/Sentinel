import { Sensor } from "../models/sensor.model.js";
import { getMachineById } from "./machine.service.js";
import {
  getRequiredChannels,
  COVERAGE_RECENCY_WINDOW_SEC,
} from "./sensor-requirements.config.js";

/**
 * Which gate state a machine is in:
 *   GATE_CLOSED       — not enough required channels attached and reporting
 *   PARTIAL_REPORTING — all required channels attached, but some are not
 *                       reporting within the recency window
 *   FULLY_COVERED     — every required channel has a live, reporting sensor
 */
export const COVERAGE_GATE_STATE = Object.freeze({
  GATE_CLOSED: "GATE_CLOSED",
  PARTIAL_REPORTING: "PARTIAL_REPORTING",
  FULLY_COVERED: "FULLY_COVERED",
});

/** Human-readable label per gate state (surfaced in the API + UI). */
export const COVERAGE_GATE_LABELS = Object.freeze({
  [COVERAGE_GATE_STATE.GATE_CLOSED]:
    "Not enough sensors attached — predictions gated",
  [COVERAGE_GATE_STATE.PARTIAL_REPORTING]:
    "All required sensors attached, but some are not reporting",
  [COVERAGE_GATE_STATE.FULLY_COVERED]:
    "Fully covered — predictions run on incoming events",
});

/** Per-sensor info shape inside `sensorStatus`. */
const presentSensorCoverage = (sensor, requiredChannels, now, recencyWindowSec) => {
  const raw = typeof sensor.toObject === "function" ? sensor.toObject() : sensor;
  const lastReadingAt = raw.lastReadingAt ? new Date(raw.lastReadingAt) : null;
  const ageSec =
    lastReadingAt && !Number.isNaN(lastReadingAt.getTime())
      ? Math.max(0, (now.getTime() - lastReadingAt.getTime()) / 1000)
      : null;

  return {
    id: String(raw._id),
    name: raw.name,
    type: raw.type,
    isRequired: requiredChannels.includes(raw.type),
    lastReadingAt: lastReadingAt && !Number.isNaN(lastReadingAt.getTime())
      ? lastReadingAt.toISOString()
      : null,
    ageSec: ageSec === null ? null : Math.round(ageSec),
    working: typeof ageSec === "number" && ageSec <= recencyWindowSec,
  };
};

/**
 * Minimum sensor-coverage check for a machine.
 *
 * A machine is ready (isReady) only when every required channel for its type
 * has at least one attached sensor whose most recent reading is within the
 * recency window (default 15 min, configurable via
 * COVERAGE_RECENCY_WINDOW_SEC).
 *
 * @param {string} machineIdParam — machineId string or Mongo _id
 * @param {object} [opts] — { userFilter?: object, now?: Date }
 * @returns {Promise<{
 *   machineId: string,
 *   machineType: string,
 *   required: string[],
 *   covered: string[],
 *   missing: string[],
 *   sensorsTotal: number,
 *   sensorsWorking: number,
 *   isReady: boolean,
 *   gateState: "GATE_CLOSED" | "PARTIAL_REPORTING" | "FULLY_COVERED",
 *   gateLabel: string,
 *   recencyWindowSec: number,
 *   sensorStatus: Array<{ id, name, type, isRequired, lastReadingAt, ageSec, working }>,
 * }>}
 */
export const getMachineCoverage = async (machineIdParam, opts = {}) => {
  const { userFilter = {}, now = new Date() } = opts;

  const machine = await getMachineById(machineIdParam, userFilter);
  const sensors = await Sensor.find({
    ...userFilter,
    machineId: machine._id,
  }).lean();

  const required = getRequiredChannels(machine.machineType);
  const recencyWindowSec = COVERAGE_RECENCY_WINDOW_SEC;

  const sensorStatus = sensors.map((sensor) =>
    presentSensorCoverage(sensor, required, now, recencyWindowSec)
  );

  // Required channels covered = at least one *working* sensor of that type.
  const covered = required.filter((channel) =>
    sensorStatus.some((s) => s.type === channel && s.working)
  );
  const missing = required.filter((channel) => !covered.includes(channel));

  // Required channels with no sensor attached at all — these need hardware,
  // not just connectivity. Channels attached-but-not-reporting fall into the
  // PARTIAL_REPORTING state instead.
  const attachedTypes = new Set(sensorStatus.map((s) => s.type));
  const unattached = required.filter((channel) => !attachedTypes.has(channel));

  const sensorsWorking = sensorStatus.filter((s) => s.working).length;

  const isReady = missing.length === 0 && required.length > 0;
  const gateState = isReady
    ? COVERAGE_GATE_STATE.FULLY_COVERED
    : unattached.length > 0
      ? COVERAGE_GATE_STATE.GATE_CLOSED
      : COVERAGE_GATE_STATE.PARTIAL_REPORTING;

  return {
    machineId: String(machine._id),
    machineType: machine.machineType,
    required,
    covered,
    missing,
    unattached,
    sensorsTotal: sensors.length,
    sensorsWorking,
    isReady,
    gateState,
    gateLabel: COVERAGE_GATE_LABELS[gateState],
    recencyWindowSec,
    sensorStatus,
  };
};
