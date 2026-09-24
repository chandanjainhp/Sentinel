import { describe, it, expect } from "bun:test";
import {
  buildMachineWindow,
  mapMachineType,
  parseMlResponse,
  REQUIRED_CHANNELS,
  ML_WINDOW_SIZE,
  CRITICAL_ANOMALY_SCORE,
  CRITICAL_FAULT_PROBABILITY,
  WARNING_ANOMALY_SCORE,
} from "../services/ml-contract.service.js";
import {
  HEALTH_THRESHOLDS,
  HEALTH_UNKNOWN_REASONS,
} from "../services/machine-health.service.js";

const NOW = Date.now();
const sec = (n) => new Date(NOW - n * 1000).toISOString();

const fullValues = { temperature: 60, vibration: 2, current: 10, rpm: 1500 };

describe("mapMachineType", () => {
  it("maps pump/motor/fan synonyms to generic_motor", () => {
    expect(mapMachineType("Centrifugal Pump")).toBe("generic_motor");
    expect(mapMachineType("motor")).toBe("generic_motor");
    expect(mapMachineType("exhaust fan")).toBe("generic_motor");
    expect(mapMachineType("compressor")).toBe("generic_motor");
  });

  it("maps unknown free text to generic_motor rather than failing", () => {
    expect(mapMachineType("hydraulic press")).toBe("generic_motor");
    expect(mapMachineType("")).toBe("generic_motor");
    expect(mapMachineType(null)).toBe("generic_motor");
  });
});

describe("buildMachineWindow", () => {
  it("returns Missing channel when a required channel was never seen", () => {
    const events = [
      { timestamp: sec(10), values: { temperature: 60, vibration: 2, current: 10 } }, // no rpm
    ];
    const result = buildMachineWindow(events);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("Missing channel: rpm");
  });

  it("returns Collecting data when there are no readings", () => {
    const result = buildMachineWindow([{ timestamp: sec(5), values: {} }]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Collecting data");
  });

  it("builds a complete window when all channels report at every row", () => {
    const events = [];
    for (let i = 1; i <= 35; i += 1) {
      events.push({ timestamp: sec(i * 5), values: { ...fullValues } });
    }
    events.reverse(); // newest first, like the DB query
    const result = buildMachineWindow(events);
    expect(result.ok).toBe(true);
    expect(result.window.length).toBe(35);
    // oldest first
    expect(new Date(result.window[0].timestamp).getTime()).toBeLessThan(
      new Date(result.window[1].timestamp).getTime()
    );
    for (const ch of REQUIRED_CHANNELS) {
      expect(ch in result.window[0].values).toBe(true);
    }
  });

  it("forward-fills a gap from the channel's last value while it is young enough (age-based)", () => {
    // vibration reports every row; temperature stops 60s ago (older rows only).
    // CHANNEL_MAX_AGE_SEC default is 300 — a 60s-old value still fills.
    const events = [];
    for (let i = 1; i <= 10; i += 1) {
      const t = i * 10; // seconds ago, ascending age
      const values = { ...fullValues };
      if (i <= 4) values.temperature = 61; // newest rows (10–40s ago) lack temperature
      events.push({ timestamp: sec(t), values });
    }
    events.reverse();
    const result = buildMachineWindow(events);
    expect(result.ok).toBe(true);
    // Newest row (10s ago) should have temperature forward-filled from the
    // 50s-old reading (age 40s ≤ 300s).
    const newest = result.window[result.window.length - 1];
    expect(newest.values.temperature).toBe(61);
  });

  it("refuses rows whose filling channel is older than CHANNEL_MAX_AGE_SEC", () => {
    // temperature only ever reported once, 1000s ago; the newest rows are
    // far beyond the 300s age limit from that value. Rows within the age
    // window may fill; the stale tail must be dropped entirely.
    const events = [
      { timestamp: sec(1000), values: { ...fullValues, temperature: 55 } },
      { timestamp: sec(900), values: { vibration: 2, current: 10, rpm: 1500 } },
      { timestamp: sec(800), values: { vibration: 2, current: 10, rpm: 1500 } },
      { timestamp: sec(700), values: { vibration: 2, current: 10, rpm: 1500 } },
      { timestamp: sec(600), values: { vibration: 2, current: 10, rpm: 1500 } },
      { timestamp: sec(500), values: { vibration: 2, current: 10, rpm: 1500 } },
    ];
    const result = buildMachineWindow(events);
    expect(result.ok).toBe(true);
    // Rows at age 900..700s are within 300s of the temperature value at
    // 1000s ago (age 0–300s) and fill; 600s/500s rows exceed it and are
    // dropped: (1000→age 0) (900→100) (800→200) (700→300 inclusive) kept.
    expect(result.window.length).toBe(4);
    const newest = result.window[result.window.length - 1];
    expect(newest.values.temperature).toBe(55); // filled
  });

  it("keeps only the reporting row when every later row is beyond the age limit", () => {
    const events = [
      { timestamp: sec(1000), values: { ...fullValues, temperature: 55 } },
      { timestamp: sec(650), values: { vibration: 2, current: 10, rpm: 1500 } },
      { timestamp: sec(600), values: { vibration: 2, current: 10, rpm: 1500 } },
    ];
    // The 1000s row is complete (temperature reported there, age 0). Later
    // rows would need temperature at age 350s/400s > 300s → dropped.
    const result = buildMachineWindow(events);
    expect(result.ok).toBe(true);
    expect(result.window.length).toBe(1);
    expect(result.window[0].values.temperature).toBe(55);
  });

  it("caps the window at ML_WINDOW_SIZE rows, oldest first", () => {
    const events = [];
    for (let i = 1; i <= 90; i += 1) {
      events.push({ timestamp: sec(i), values: { ...fullValues } });
    }
    events.reverse();
    const result = buildMachineWindow(events);
    expect(result.ok).toBe(true);
    expect(result.window.length).toBe(ML_WINDOW_SIZE);
  });

  it("merges channels from different sensors into shared rows", () => {
    // Two sensors on one machine: vibration sensor and a 4-channel gateway.
    const events = [
      { timestamp: sec(30), values: { vibration: 1.1 } },
      { timestamp: sec(30), values: { temperature: 60, current: 10, rpm: 1500 } },
      { timestamp: sec(20), values: { vibration: 1.2 } },
      { timestamp: sec(20), values: { temperature: 61, current: 11, rpm: 1510 } },
    ];
    events.reverse();
    const result = buildMachineWindow(events);
    expect(result.ok).toBe(true);
    expect(result.window.length).toBe(2);
    // window is oldest first → index 0 is the 30s-old row.
    expect(result.window[0].values.vibration).toBe(1.1);
    expect(result.window[0].values.rpm).toBe(1500);
    // newest row (20s ago) merges both sensors' values in one row.
    expect(result.window[1].values.vibration).toBe(1.2);
    expect(result.window[1].values.temperature).toBe(61);
  });
});

describe("parseMlResponse", () => {
  const scoredBody = {
    machineId: "pump-7",
    status: "ok",
    model: "lstm_autoencoder",
    modelVersion: "0.1.0+synthetic.20260924",
    anomalyScore: 0.94,
    faultProbability: 0.7,
    faultType: "vibration_anomaly",
    suspectChannel: "vibration",
    rulValue: null,
    rulUnit: null,
    confidence: 1.0,
    methods: { rul: "not_available" },
  };

  it("accepts a contract-scored response", () => {
    const result = parseMlResponse(scoredBody);
    expect(result.kind).toBe("scored");
    expect(result.data.anomalyScore).toBe(0.94);
    expect(result.data.rulValue).toBeNull();
  });

  it("rejects a scored body with a missing/invalid anomalyScore", () => {
    const bad = { ...scoredBody, anomalyScore: "high" };
    const result = parseMlResponse(bad);
    expect(result.kind).toBe("invalid");
  });

  it("rejects a scored body missing modelVersion", () => {
    const bad = { ...scoredBody };
    delete bad.modelVersion;
    expect(parseMlResponse(bad).kind).toBe("invalid");
  });

  it("accepts insufficient_data and surfaces have/need", () => {
    const result = parseMlResponse({ machineId: "p", status: "insufficient_data", have: 12, need: 30 });
    expect(result.kind).toBe("insufficient_data");
    expect(result.have).toBe(12);
    expect(result.need).toBe(30);
  });

  it("rejects malformed junk", () => {
    expect(parseMlResponse(null).kind).toBe("invalid");
    expect(parseMlResponse("nope").kind).toBe("invalid");
    expect(parseMlResponse({ status: "weird" }).kind).toBe("invalid");
  });
});

describe("health thresholds (named constants)", () => {
  it("exposes the approved decision-4 values", () => {
    expect(WARNING_ANOMALY_SCORE).toBe(0.75);
    expect(CRITICAL_ANOMALY_SCORE).toBe(0.9);
    expect(CRITICAL_FAULT_PROBABILITY).toBe(0.5);
    expect(HEALTH_THRESHOLDS.CRITICAL_ANOMALY_SCORE).toBe(0.9);
    expect(HEALTH_THRESHOLDS.CRITICAL_FAULT_PROBABILITY).toBe(0.5);
    expect(HEALTH_UNKNOWN_REASONS.ML_UNREACHABLE).toBe("ML service unreachable");
  });
});
