/**
 * Sensor coverage requirements — the single source of truth for which
 * sensor channels each machine type needs before its predictions may run.
 *
 * Two layers combine into the effective requirements:
 *   1. TYPE_SPECIFIC_CHANNELS — domain channels a given machine type should
 *      have beyond the model baseline (e.g. pressure for pumps).
 *   2. ML_REQUIRED_CHANNELS — the channels the ML window builder requires
 *      for every machine (ml-contract.service.js). The gate must never
 *      declare a machine ready that the pipeline would still reject, so it
 *      is always unioned in.
 *
 * To add or change a machine type's requirements, edit
 * TYPE_SPECIFIC_CHANNELS. Channel names must be drawn from the
 * Machine.sensor `type` enum in models/sensor.model.js.
 */
import { REQUIRED_CHANNELS as ML_REQUIRED_CHANNELS } from "./ml-contract.service.js";

export const MACHINE_TYPES = Object.freeze({
  MOTOR: "motor",
  PUMP: "pump",
  COMPRESSOR: "compressor",
  FAN: "fan",
  CONVEYOR: "conveyor",
  GEARBOX: "gearbox",
});

/** Type-specific channel requirements, on top of the ML model baseline. */
export const TYPE_SPECIFIC_CHANNELS = Object.freeze({
  [MACHINE_TYPES.MOTOR]: [],
  [MACHINE_TYPES.PUMP]: ["pressure"],
  [MACHINE_TYPES.COMPRESSOR]: ["pressure"],
  [MACHINE_TYPES.FAN]: [],
  [MACHINE_TYPES.CONVEYOR]: [],
  [MACHINE_TYPES.GEARBOX]: [],
});

/**
 * Effective required channels per machine type = ML baseline ∪ type extras.
 * Frozen derived map — do not edit directly.
 */
export const REQUIRED_SENSOR_CHANNELS = Object.freeze(
  Object.fromEntries(
    Object.entries(TYPE_SPECIFIC_CHANNELS).map(([type, extras]) => [
      type,
      [...new Set([...ML_REQUIRED_CHANNELS, ...extras])],
    ])
  )
);

/**
 * All known machine types (used to normalize free-text entries such as
 * "Centrifugal Pump" onto a canonical key).
 */
export const KNOWN_MACHINE_TYPES = Object.freeze(
  Object.values(MACHINE_TYPES)
);

/** Substring → canonical machine type. First match wins. */
const MACHINE_TYPE_ALIASES = Object.freeze([
  ["centrifugal pump", MACHINE_TYPES.PUMP],
  ["centrifug", MACHINE_TYPES.PUMP],
  ["gear", MACHINE_TYPES.GEARBOX],
  ["compress", MACHINE_TYPES.COMPRESSOR],
  ["conveyor", MACHINE_TYPES.CONVEYOR],
  ["blower", MACHINE_TYPES.FAN],
  ["fan", MACHINE_TYPES.FAN],
  ["pump", MACHINE_TYPES.PUMP],
  ["motor", MACHINE_TYPES.MOTOR],
]);

/**
 * Normalize a free-text machineType onto one of the known types so that
 * lookups never fail because of display formatting ("Centrifugal Pump" →
 * "pump"). Unrecognized types fall back to the Motor requirements — the
 * strictest common denominator and the shape the ML model expects.
 *
 * @param {string} machineType
 * @returns {string} one of KNOWN_MACHINE_TYPES
 */
export const normalizeMachineType = (machineType) => {
  const raw = String(machineType || "").toLowerCase();
  const exact = KNOWN_MACHINE_TYPES.find((t) => raw.includes(t));
  if (exact) return exact;
  const alias = MACHINE_TYPE_ALIASES.find(([fragment]) =>
    raw.includes(fragment)
  );
  if (alias) return alias[1];
  return MACHINE_TYPES.MOTOR;
};

/**
 * Required channels for a machine type (free-text is normalized).
 * Unknown types inherit the Motor requirements rather than failing.
 *
 * @param {string} machineType
 * @returns {string[]}
 */
export const getRequiredChannels = (machineType) => {
  const normalized = normalizeMachineType(machineType);
  return [...(REQUIRED_SENSOR_CHANNELS[normalized] ?? [])];
};

/** How fresh a sensor's last reading must be to count as "working". */
export const COVERAGE_RECENCY_WINDOW_SEC = Number(
  process.env.COVERAGE_RECENCY_WINDOW_SEC || 900
); // 15 minutes
