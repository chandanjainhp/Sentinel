import { describe, expect, it } from "bun:test";
import {
  reportingWindow,
  previousReportingDate,
  defaultNightDate,
} from "../src/lib/reporting-window.js";

describe("client reporting window", () => {
  it("matches UTC midnight and the adjacent-date boundary", () => {
    const { from, to } = reportingWindow("2026-01-02");
    expect(from.toISOString()).toBe("2026-01-02T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-01-03T00:00:00.000Z");
    expect(new Date(to.getTime() - 1).toISOString()).toBe("2026-01-02T23:59:59.999Z");
  });

  it("computes the previous UTC reporting date across midnight", () => {
    expect(previousReportingDate(new Date("2026-01-02T00:00:00.000Z"))).toBe("2026-01-01");
    expect(previousReportingDate(new Date("2026-01-02T23:59:59-08:00"))).toBe("2026-01-02");
  });

  it("defaultNightDate follows previousReportingDate when seed env is unset", () => {
    const now = new Date("2026-03-10T15:00:00.000Z");
    expect(defaultNightDate(now)).toBe(previousReportingDate(now));
  });
});
