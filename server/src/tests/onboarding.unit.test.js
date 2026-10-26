import { describe, expect, it } from "bun:test";
import { normalizeName, validatePostalCode, SENSOR_UNITS, PLAUSIBLE_RANGES } from "../utils/onboarding.js";

describe("onboarding validation helpers", () => {
  it("normalizes display names for uniqueness without changing the display value", () => {
    expect(normalizeName("  Main   Pump  ")).toBe("main pump");
    expect(normalizeName("MAIN PUMP")).toBe(normalizeName(" main  pump "));
  });

  it("validates country-specific postal formats and keeps unknown valid codes non-blocking", () => {
    expect(validatePostalCode("IN", "560001").valid).toBe(true);
    expect(validatePostalCode("IN", "56001").valid).toBe(false);
    expect(validatePostalCode("US", "10001-1234").valid).toBe(true);
    expect(validatePostalCode("DE", "10115").valid).toBe(true);
    expect(validatePostalCode("AE", "").valid).toBe(true);
  });

  it("keeps units and plausible ranges coupled to the six accepted types", () => {
    expect(Object.keys(SENSOR_UNITS)).toEqual(Object.keys(PLAUSIBLE_RANGES));
  });
});
