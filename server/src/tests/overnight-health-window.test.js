import { describe, expect, it } from "bun:test";
import { reportingWindow, localDateFor } from "../utils/reporting-window.js";

describe("Overnight Health Checker reporting windows", () => {
  it("converts the configured site window to UTC and supports an 08:00 cutoff", () => {
    const window = reportingWindow("2026-10-23", "Asia/Kolkata", 8);
    expect(window.from.toISOString()).toBe("2026-10-22T18:30:00.000Z");
    expect(window.to.toISOString()).toBe("2026-10-23T02:30:00.000Z");
  });

  it("handles daylight-saving date boundaries without using server local time", () => {
    const window = reportingWindow("2026-03-08", "America/New_York", 9);
    expect(window.from.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(window.to.toISOString()).toBe("2026-03-08T13:00:00.000Z");
    expect(localDateFor(new Date("2026-03-08T04:59:00.000Z"), "America/New_York")).toBe("2026-03-07");
  });
});
