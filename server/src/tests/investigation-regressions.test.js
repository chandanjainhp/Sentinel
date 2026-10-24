import { describe, expect, it } from "bun:test";
import { reportingWindow } from "../utils/reporting-window.js";
import { aggregateChannelStats } from "../services/investigation.service.js";

describe("investigation reporting window", () => {
  it("uses explicit UTC midnight boundaries", () => {
    const { from, to } = reportingWindow("2026-01-02");
    expect(from.toISOString()).toBe("2026-01-02T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-01-03T00:00:00.000Z");
    expect(new Date("2026-01-01T23:59:59.999Z") < from).toBe(true);
    expect(new Date("2026-01-02T23:59:59.999Z") < to).toBe(true);
    expect(new Date("2026-01-03T00:00:00.000Z") < to).toBe(false);
  });

  it("does not reinterpret positive or negative UTC offsets as local dates", () => {
    const { from, to } = reportingWindow("2026-01-02");
    expect(new Date("2026-01-02T00:00:00+05:30") < from).toBe(true);
    expect(new Date("2026-01-02T23:59:59-07:00") < to).toBe(false);
    expect(reportingWindow("2026-02-31")).toBeNull();
  });
});

describe("investigation evidence aggregation", () => {
  it("aggregates every event instead of silently stopping at 200", () => {
    const events = Array.from({ length: 201 }, (_, index) => ({ values: { temperature: index } }));
    expect(aggregateChannelStats(events)).toEqual([
      { channel: "temperature", min: 0, max: 200, avg: 100, samples: 201 },
    ]);
  });
});
