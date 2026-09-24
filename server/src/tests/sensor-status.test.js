import { describe, it, expect } from "bun:test";
import {
  computeSensorStatus,
  sensorAgeSec,
  SENSOR_STATUS,
  ONLINE_MULTIPLIER,
  STALE_MULTIPLIER,
} from "../utils/sensor-status.js";

const NOW = new Date("2026-01-15T12:00:00.000Z");
const INTERVAL = 60; // seconds

const sensor = (overrides = {}) => ({
  expectedIntervalSec: INTERVAL,
  lastReadingAt: new Date(NOW.getTime() - 10 * 1000),
  ...overrides,
});

describe("computeSensorStatus", () => {
  it("WAITING when lastReadingAt is null or missing", () => {
    expect(computeSensorStatus(sensor({ lastReadingAt: null }), NOW)).toBe(SENSOR_STATUS.WAITING);
    expect(computeSensorStatus(sensor({ lastReadingAt: undefined }), NOW)).toBe(SENSOR_STATUS.WAITING);
    expect(computeSensorStatus({}, NOW)).toBe(SENSOR_STATUS.WAITING);
    expect(computeSensorStatus(sensor({ lastReadingAt: "not-a-date" }), NOW)).toBe(SENSOR_STATUS.WAITING);
  });

  it("ONLINE just inside and exactly at the 3x boundary", () => {
    const justInside = NOW.getTime() - (ONLINE_MULTIPLIER * INTERVAL - 1) * 1000;
    expect(computeSensorStatus(sensor({ lastReadingAt: new Date(justInside) }), NOW)).toBe(SENSOR_STATUS.ONLINE);

    const exact = NOW.getTime() - ONLINE_MULTIPLIER * INTERVAL * 1000;
    expect(computeSensorStatus(sensor({ lastReadingAt: new Date(exact) }), NOW)).toBe(SENSOR_STATUS.ONLINE);

    expect(computeSensorStatus(sensor({ lastReadingAt: NOW }), NOW)).toBe(SENSOR_STATUS.ONLINE);
  });

  it("STALE just past 3x, across the range, and exactly at the 10x boundary", () => {
    const justPast = NOW.getTime() - (ONLINE_MULTIPLIER * INTERVAL + 1) * 1000;
    expect(computeSensorStatus(sensor({ lastReadingAt: new Date(justPast) }), NOW)).toBe(SENSOR_STATUS.STALE);

    const mid = NOW.getTime() - (6 * INTERVAL) * 1000;
    expect(computeSensorStatus(sensor({ lastReadingAt: new Date(mid) }), NOW)).toBe(SENSOR_STATUS.STALE);

    const exact = NOW.getTime() - STALE_MULTIPLIER * INTERVAL * 1000;
    expect(computeSensorStatus(sensor({ lastReadingAt: new Date(exact) }), NOW)).toBe(SENSOR_STATUS.STALE);
  });

  it("OFFLINE just past the 10x boundary and far beyond", () => {
    const justPast = NOW.getTime() - (STALE_MULTIPLIER * INTERVAL + 1) * 1000;
    expect(computeSensorStatus(sensor({ lastReadingAt: new Date(justPast) }), NOW)).toBe(SENSOR_STATUS.OFFLINE);

    const hours = NOW.getTime() - (24 * 3600) * 1000;
    expect(computeSensorStatus(sensor({ lastReadingAt: new Date(hours) }), NOW)).toBe(SENSOR_STATUS.OFFLINE);
  });

  it("respects the sensor's own expectedIntervalSec", () => {
    // interval 600s → 3x = 1800s; age 1000s is ONLINE for this sensor
    const slow = sensor({ expectedIntervalSec: 600, lastReadingAt: new Date(NOW.getTime() - 1000 * 1000) });
    expect(computeSensorStatus(slow, NOW)).toBe(SENSOR_STATUS.ONLINE);

    // interval 1s → 3x = 3s; age 10s is STALE, 60s is OFFLINE
    const fast = sensor({ expectedIntervalSec: 1, lastReadingAt: new Date(NOW.getTime() - 10 * 1000) });
    expect(computeSensorStatus(fast, NOW)).toBe(SENSOR_STATUS.STALE);
    const faster = sensor({ expectedIntervalSec: 1, lastReadingAt: new Date(NOW.getTime() - 60 * 1000) });
    expect(computeSensorStatus(faster, NOW)).toBe(SENSOR_STATUS.OFFLINE);
  });

  it("falls back to a 60s interval when expectedIntervalSec is invalid", () => {
    const bad = sensor({ expectedIntervalSec: 0, lastReadingAt: new Date(NOW.getTime() - 200 * 1000) });
    expect(computeSensorStatus(bad, NOW)).toBe(SENSOR_STATUS.STALE); // 200s > 3*60, <= 10*60
    const bad2 = sensor({ expectedIntervalSec: 0, lastReadingAt: new Date(NOW.getTime() - 100 * 1000) });
    expect(computeSensorStatus(bad2, NOW)).toBe(SENSOR_STATUS.ONLINE); // 100s <= 3*60
  });

  it("treats a future lastReadingAt as ONLINE (zero age)", () => {
    const future = sensor({ lastReadingAt: new Date(NOW.getTime() + 60 * 1000) });
    expect(computeSensorStatus(future, NOW)).toBe(SENSOR_STATUS.ONLINE);
  });

  it("sensorAgeSec returns floor of age or null", () => {
    expect(sensorAgeSec(sensor({ lastReadingAt: new Date(NOW.getTime() - 95000) }), NOW)).toBe(95);
    expect(sensorAgeSec(sensor({ lastReadingAt: null }), NOW)).toBeNull();
  });
});
