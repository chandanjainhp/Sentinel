import { describe, expect, it } from "bun:test";
import {
  currentMonitoringWindow,
  isValidTimeZone,
  monitoringWindow,
  nextMonitoringStart,
  validMonitoringTime,
} from "../utils/monitoring-window.js";

const iso = (date) => date.toISOString();

describe("monitoring window conversion", () => {
  it("converts a same-day window to UTC", () => {
    const window = monitoringWindow("2026-10-23", "Asia/Kolkata", "00:00", "09:00");
    expect(iso(window.from)).toBe("2026-10-22T18:30:00.000Z");
    expect(iso(window.to)).toBe("2026-10-23T03:30:00.000Z");
    expect(window.reportingDate).toBe("2026-10-23");
  });

  it("supports windows that cross midnight", () => {
    const window = monitoringWindow("2026-10-20", "America/New_York", "22:00", "06:00");
    expect(iso(window.from)).toBe("2026-10-21T02:00:00.000Z");
    expect(iso(window.to)).toBe("2026-10-21T10:00:00.000Z");
    expect(window.reportingDate).toBe("2026-10-20");
  });

  it("stays correct across the spring-forward DST transition", () => {
    const window = monitoringWindow("2026-03-08", "America/New_York", "22:00", "06:00");
    // 22:00 EDT (UTC-4) = 02:00Z next day; 06:00 EDT = 10:00Z.
    expect(iso(window.from)).toBe("2026-03-09T02:00:00.000Z");
    expect(iso(window.to)).toBe("2026-03-09T10:00:00.000Z");
  });

  it("stays correct across the fall-back DST transition", () => {
    const window = monitoringWindow("2026-11-01", "America/New_York", "22:00", "06:00");
    // 22:00 EST (UTC-5) = 03:00Z next day; 06:00 EST = 11:00Z.
    expect(iso(window.from)).toBe("2026-11-02T03:00:00.000Z");
    expect(iso(window.to)).toBe("2026-11-02T11:00:00.000Z");
  });

  it("rejects malformed times, equal times and impossible dates", () => {
    expect(monitoringWindow("2026-10-20", "UTC", "25:00", "06:00")).toBeNull();
    expect(monitoringWindow("2026-10-20", "UTC", "06:00", "06:00")).toBeNull();
    expect(monitoringWindow("2026-10-20", "UTC", "bad", "06:00")).toBeNull();
    expect(monitoringWindow("2026-13-40", "UTC", "00:00", "09:00")).toBeNull();
  });
});

describe("current window lookup", () => {
  it("returns the window that contains now, including overnight windows", () => {
    const during = currentMonitoringWindow(
      new Date("2026-10-21T05:00:00Z"),
      "America/New_York",
      "22:00",
      "06:00"
    );
    expect(during.reportingDate).toBe("2026-10-20");

    const after = currentMonitoringWindow(
      new Date("2026-10-21T11:00:00Z"),
      "America/New_York",
      "22:00",
      "06:00"
    );
    expect(after).toBeNull();
  });

  it("does not report a window active before its start", () => {
    expect(
      currentMonitoringWindow(
        new Date("2026-10-21T01:59:00Z"),
        "America/New_York",
        "22:00",
        "06:00"
      )
    ).toBeNull();
  });
});

describe("next scheduled start", () => {
  it("returns today's start when it has not happened yet", () => {
    const next = nextMonitoringStart(
      new Date("2026-10-20T00:00:00Z"),
      "UTC",
      "09:00"
    );
    expect(iso(next)).toBe("2026-10-20T09:00:00.000Z");
  });

  it("returns tomorrow's start after today's has passed, across DST", () => {
    const next = nextMonitoringStart(
      new Date("2026-03-08T13:00:00Z"),
      "America/New_York",
      "02:30"
    );
    // 02:30 on 2026-03-09 is EDT (UTC-4) = 06:30Z.
    expect(iso(next)).toBe("2026-03-09T06:30:00.000Z");
  });
});

describe("time validation helpers", () => {
  it("accepts only HH:mm wall-clock strings", () => {
    expect(validMonitoringTime("00:00")).toBe(true);
    expect(validMonitoringTime("23:59")).toBe(true);
    expect(validMonitoringTime("24:00")).toBe(false);
    expect(validMonitoringTime("9:00")).toBe(false);
    expect(validMonitoringTime(null)).toBe(false);
  });

  it("accepts IANA zones and rejects junk", () => {
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});
