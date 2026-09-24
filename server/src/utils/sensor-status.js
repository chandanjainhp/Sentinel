export const ONLINE_MULTIPLIER = 3;
export const STALE_MULTIPLIER = 10;

export const SENSOR_STATUS = Object.freeze({
  WAITING: "WAITING",
  ONLINE: "ONLINE",
  STALE: "STALE",
  OFFLINE: "OFFLINE",
});

const DEFAULT_INTERVAL_SEC = 60;

/**
 * Compute a sensor's connectivity status from its last reading time.
 * Status is NEVER stored — always computed on read.
 *
 *   WAITING  — no reading has ever arrived (lastReadingAt is null)
 *   ONLINE   — age <= ONLINE_MULTIPLIER x expectedIntervalSec
 *   STALE    — age <= STALE_MULTIPLIER x expectedIntervalSec
 *   OFFLINE  — older than that
 *
 * Boundaries are inclusive: a sensor exactly 3x its interval old is ONLINE;
 * exactly 10x is STALE.
 */
export function computeSensorStatus(sensor, now = new Date()) {
  const lastReadingAt = sensor?.lastReadingAt ? new Date(sensor.lastReadingAt) : null;
  if (!lastReadingAt || Number.isNaN(lastReadingAt.getTime())) {
    return SENSOR_STATUS.WAITING;
  }

  const intervalSec = Math.max(
    1,
    Number(sensor?.expectedIntervalSec) > 0
      ? Number(sensor.expectedIntervalSec)
      : DEFAULT_INTERVAL_SEC
  );
  const ageSec = Math.max(0, (now.getTime() - lastReadingAt.getTime()) / 1000);

  if (ageSec <= ONLINE_MULTIPLIER * intervalSec) return SENSOR_STATUS.ONLINE;
  if (ageSec <= STALE_MULTIPLIER * intervalSec) return SENSOR_STATUS.STALE;
  return SENSOR_STATUS.OFFLINE;
}

/** Seconds since the last reading, or null if the sensor never reported. */
export function sensorAgeSec(sensor, now = new Date()) {
  const lastReadingAt = sensor?.lastReadingAt ? new Date(sensor.lastReadingAt) : null;
  if (!lastReadingAt || Number.isNaN(lastReadingAt.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - lastReadingAt.getTime()) / 1000));
}
