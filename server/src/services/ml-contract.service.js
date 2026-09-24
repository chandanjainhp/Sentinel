import { z } from "zod";

/**
 * ML contract seam (ml-service/CONTRACT.md is the source of truth).
 *
 * Everything the worker needs to talk to the ML service lives here:
 * window construction from multi-sensor events, machine-type mapping,
 * response validation, and the health threshold constants. The ML service
 * is stateless and single-tenant: every /predict call carries the full
 * per-machine window.
 */

/* ── Named constants (approved decisions 4 & 5) ─────────────────── */

// Health thresholds. The ML contract's recommended severity mapping is
// anomalyScore-based; faultProbability is a persistence statistic, so it may
// only *confirm* a CRITICAL, never create one on its own.
export const CRITICAL_ANOMALY_SCORE = 0.9;
export const CRITICAL_FAULT_PROBABILITY = 0.5;
export const WARNING_ANOMALY_SCORE = 0.75;

// Window construction. The ML service expects the newest 60 rows, oldest
// first, each row carrying every required channel.
export const ML_WINDOW_SIZE = 60;
export const ML_RECOMMENDED_WINDOW = 60;

// A channel's last known value may fill a row only if it is younger than
// this (seconds). Never seen, or older → the machine cannot be scored.
export const CHANNEL_MAX_AGE_SEC = Number(process.env.CHANNEL_MAX_AGE_SEC || 300);

// HTTP behaviour toward the ML service.
export const ML_TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS || 5000);
export const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:9000";

/* ── Machine-type mapping (decision M3) ─────────────────────────── */

// The demo model is trained for generic_motor. Free-text machine types from
// the UI map onto it; anything unknown also maps onto it (the contract
// accepts only generic_motor today, and the ML service rejects others).
export const SUPPORTED_ML_MACHINE_TYPES = ["generic_motor"];

const MACHINE_TYPE_SYNONYMS = [
  /motor/,
  /pump/,
  /fan/,
  /blower/,
  /compressor/,
  /conveyor/,
  /centrifug/,
  /generat/,
  /turbine/,
  /engine/,
  /spindle/,
];

export const mapMachineType = (machineType) => {
  const raw = String(machineType || "").toLowerCase();
  if (SUPPORTED_ML_MACHINE_TYPES.includes(raw)) return raw;
  if (MACHINE_TYPE_SYNONYMS.some((rx) => rx.test(raw))) return "generic_motor";
  // Unknown free-text types still ride the only supported model rather than
  // failing every prediction with a 400.
  return "generic_motor";
};

/* ── Required channels ──────────────────────────────────────────── */

// Channel list of the generic_motor model (CONTRACT.md + GET /models).
export const REQUIRED_CHANNELS = ["temperature", "vibration", "current", "rpm"];

/* ── Machine window builder (decision 5: age-based forward-fill) ── */

const toRowTime = (value) => {
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
};

/**
 * Build the ML window from per-sensor events.
 *
 * Rows are timestamp buckets; each row's channel values come from the events
 * at that bucket. Gaps are forward-filled from the channel's previous known
 * value ONLY if that value is younger than CHANNEL_MAX_AGE_SEC (by AGE, not
 * by row count). A channel never seen, or whose last value is too old, makes
 * the machine unscoreable.
 *
 * @param {Array<{timestamp: Date|string, values: Record<string,number>|Map}>}
 * @returns {{ ok: true, window: Array<{timestamp: string, values: object}> }
 *          | { ok: false, reason: string, haveReadings: number, needReadings: number|null }}
 */
export const buildMachineWindow = (events) => {
  const now = Date.now();

  // 1. Flatten events into (time, channel, value) triples.
  const rows = [];
  const everSeen = new Set(); // channels that reported at least once
  let haveReadings = 0;

  for (const event of events) {
    const time = toRowTime(event.timestamp);
    if (time === null) continue;
    const values =
      event.values instanceof Map
        ? Object.fromEntries(event.values)
        : event.values || {};

    let carriedValue = false;
    for (const [channel, value] of Object.entries(values)) {
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      rows.push({ time, channel, value });
      everSeen.add(channel);
      carriedValue = true;
    }
    if (carriedValue) haveReadings += 1;
  }

  if (rows.length === 0) {
    return {
      ok: false,
      reason: "Collecting data: no readings yet",
      haveReadings: 0,
      needReadings: null,
    };
  }

  // 2. Bucket into timestamp rows and check every required channel exists.
  const byTime = new Map();
  for (const row of rows) {
    if (!byTime.has(row.time)) byTime.set(row.time, {});
    byTime.get(row.time)[row.channel] = row.value;
  }

  const sortedTimes = [...byTime.keys()].sort((a, b) => a - b);

  for (const channel of REQUIRED_CHANNELS) {
    if (!everSeen.has(channel)) {
      return {
        ok: false,
        reason: `Missing channel: ${channel}`,
        haveReadings,
        needReadings: null,
      };
    }
  }

  // 3. Walk timestamps oldest→newest, forward-filling age-eligible gaps.
  // lastSeen only ever holds values from rows at or before the current time —
  // a future value can never fill a past row.
  const lastSeen = new Map(); // channel -> { time, value }
  const window = [];
  for (const time of sortedTimes) {
    const bucket = byTime.get(time);

    // First absorb this row's own readings into lastSeen.
    for (const [channel, value] of Object.entries(bucket)) {
      lastSeen.set(channel, { time, value });
    }

    const values = {};
    let complete = true;

    for (const channel of REQUIRED_CHANNELS) {
      if (typeof bucket[channel] === "number") {
        values[channel] = bucket[channel];
        continue;
      }
      const seen = lastSeen.get(channel);
      if (!seen) {
        complete = false;
        break; // channel not reported yet at this point in time
      }
      const ageSec = (time - seen.time) / 1000;
      if (ageSec <= CHANNEL_MAX_AGE_SEC) {
        values[channel] = seen.value;
      } else {
        complete = false;
        break;
      }
    }

    if (!complete) continue; // row cannot be completed within the age limit

    window.push({
      timestamp: new Date(time).toISOString(),
      values,
    });
  }

  // 4. Keep only the newest ML_RECOMMENDED_WINDOW rows, oldest first.
  const trimmed = window.slice(-ML_RECOMMENDED_WINDOW);

  if (trimmed.length === 0) {
    return {
      ok: false,
      reason: "Collecting data: 0 of need readings",
      haveReadings,
      needReadings: null,
    };
  }

  return { ok: true, window: trimmed };
};

/* ── ML response validation (Zod, per CONTRACT.md) ──────────────── */

const mlMethodsSchema = z
  .object({
    anomalyScore: z.string().optional(),
    faultProbability: z.string().optional(),
    faultType: z.string().optional(),
    rul: z.string().optional(),
  })
  .partial()
  .optional();

export const mlScoredResponseSchema = z.object({
  machineId: z.string(),
  status: z.literal("ok"),
  model: z.string().min(1),
  modelVersion: z.string().min(1),
  anomalyScore: z.number().min(0).max(1),
  faultProbability: z.number().min(0).max(1),
  faultType: z.string().min(1),
  suspectChannel: z.string().nullable().optional(),
  rulValue: z.number().nullable(),
  rulUnit: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  methods: mlMethodsSchema,
});

export const mlInsufficientDataSchema = z.object({
  machineId: z.string(),
  status: z.literal("insufficient_data"),
  have: z.number().int().nonnegative(),
  need: z.number().int().positive(),
});

/**
 * Parse and validate a 200 response body from the ML service.
 * @returns {{ kind: "scored", data: object } | { kind: "insufficient_data", have: number, need: number } | { kind: "invalid", error: string }}
 */
export const parseMlResponse = (body) => {
  if (!body || typeof body !== "object") {
    return { kind: "invalid", error: "ML response is not an object" };
  }

  if (body.status === "insufficient_data") {
    const parsed = mlInsufficientDataSchema.safeParse(body);
    if (!parsed.success) {
      return { kind: "invalid", error: `insufficient_data shape invalid: ${parsed.error.message}` };
    }
    return { kind: "insufficient_data", have: parsed.data.have, need: parsed.data.need };
  }

  const parsed = mlScoredResponseSchema.safeParse(body);
  if (!parsed.success) {
    return { kind: "invalid", error: `ML response failed validation: ${parsed.error.message}` };
  }
  return { kind: "scored", data: parsed.data };
};
