import { describe, it, expect } from "bun:test";
import {
  startInvestigationSchema,
  investigationIdSchema,
} from "../industrial/investigation.schema.js";
import {
  getIncidentsSchema,
  updateIncidentStatusSchema,
} from "../industrial/incident.schema.js";
import { createSiteSchema, updateSiteSchema } from "../industrial/site.schema.js";
import { createMachineSchema, updateMachineSchema } from "../industrial/machine.schema.js";
import { createSensorSchema, updateSensorSchema } from "../industrial/sensor.schema.js";
import { ingestEventSchema, getEventsSchema } from "../industrial/event.schema.js";
import { createApiKeySchema } from "../industrial/apiKey.schema.js";
import {
  registerSchema,
  resetPasswordSchema,
  refreshTokenSchema,
} from "../validations/auth.validation.js";

const parse = (schema, body, params = {}, query = {}) =>
  schema.safeParse({ body, params, query });

const ok = (schema, body, params, query) => {
  const result = parse(schema, body, params, query);
  if (!result.success) throw new Error(JSON.stringify(result.error.issues));
  return result.data;
};

const fails = (schema, body, params, query) => {
  const result = parse(schema, body, params, query);
  expect(result.success).toBe(false);
  return result.error.issues;
};

const pathOf = (issues) => issues.map((i) => i.path.join("."));

describe("investigation schema", () => {
  it("accepts a real calendar date", () => {
    expect(ok(startInvestigationSchema, { nightDate: "2026-10-20" }).body.nightDate).toBe("2026-10-20");
  });

  it("rejects a missing or malformed nightDate", () => {
    expect(fails(startInvestigationSchema, {})).toBeTruthy();
    expect(fails(startInvestigationSchema, { nightDate: "20-10-2026" })).toBeTruthy();
  });

  it("rejects an impossible calendar date instead of rolling it forward", () => {
    // 2026-02-31 is not a date; Date() would silently turn it into 2026-03-03.
    const issues = fails(startInvestigationSchema, { nightDate: "2026-02-31" });
    expect(pathOf(issues)).toContain("body.nightDate");
  });

  it("rejects a non-string investigation id", () => {
    expect(fails(investigationIdSchema, {}, { investigationId: 123 })).toBeTruthy();
    expect(fails(investigationIdSchema, {}, { investigationId: "" })).toBeTruthy();
  });
});

describe("incident query schema", () => {
  const query = (overrides) => ({ ...overrides });

  it("accepts a full valid filter", () => {
    const parsed = ok(getIncidentsSchema, {}, {}, query({
      status: "open",
      severity: "critical",
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-02T00:00:00.000Z",
      limit: "50",
    }));
    expect(parsed.query.limit).toBe(50);
    expect(parsed.query.from).toBeInstanceOf(Date);
  });

  it("rejects an invalid enum", () => {
    expect(fails(getIncidentsSchema, {}, {}, query({ status: "resolved" }))).toBeTruthy();
    expect(fails(getIncidentsSchema, {}, {}, query({ severity: "serious" }))).toBeTruthy();
  });

  it("rejects a repeated query parameter (?status=a&status=b) instead of picking one", () => {
    expect(fails(getIncidentsSchema, {}, {}, query({ status: ["open", "closed"] }))).toBeTruthy();
  });

  it("rejects a non-numeric or out-of-range limit", () => {
    expect(fails(getIncidentsSchema, {}, {}, query({ limit: "abc" }))).toBeTruthy();
    expect(fails(getIncidentsSchema, {}, {}, query({ limit: "0" }))).toBeTruthy();
    expect(fails(getIncidentsSchema, {}, {}, query({ limit: "501" }))).toBeTruthy();
  });

  it("rejects an impossible date", () => {
    expect(fails(getIncidentsSchema, {}, {}, query({ from: "2026-13-45" }))).toBeTruthy();
  });

  it("rejects a window whose from is after to", () => {
    const issues = fails(getIncidentsSchema, {}, {}, query({
      from: "2026-10-02T00:00:00.000Z",
      to: "2026-10-01T00:00:00.000Z",
    }));
    expect(pathOf(issues)).toContain("query.from");
  });

  it("rejects an invalid status transition value", () => {
    expect(fails(updateIncidentStatusSchema, { status: "resolved" }, { incidentId: "x" })).toBeTruthy();
  });
});

describe("site schema", () => {
  it("defaults timezone and trims the name", () => {
    const parsed = ok(createSiteSchema, { name: "  Plant  " });
    expect(parsed.body.name).toBe("Plant");
    expect(parsed.body.timezone).toBe("UTC");
  });

  it("accepts null coordinates and rejects out-of-range ones", () => {
    expect(ok(createSiteSchema, { name: "Plant", coordinates: null }).body.coordinates).toBeNull();
    expect(fails(createSiteSchema, { name: "Plant", coordinates: { lat: 91, lng: 0 } })).toBeTruthy();
    expect(fails(createSiteSchema, { name: "Plant", coordinates: { lat: 0, lng: -181 } })).toBeTruthy();
  });

  it("rejects an empty name and a non-string timezone", () => {
    expect(fails(createSiteSchema, { name: "   " })).toBeTruthy();
    expect(fails(createSiteSchema, { name: "Plant", timezone: 5 })).toBeTruthy();
  });

  it("rejects unknown fields on update (strict) but not on create", () => {
    expect(fails(updateSiteSchema, { bogus: 1 }, { siteId: "x" })).toBeTruthy();
    expect(ok(createSiteSchema, { name: "Plant", bogus: 1 }).body.bogus).toBeUndefined();
  });
});

describe("machine and sensor schemas", () => {
  it("rejects a missing machine name and a bad status on update", () => {
    expect(fails(createMachineSchema, { assetId: "A-1", machineType: "motor" }, { siteId: "s" })).toBeTruthy();
    expect(fails(updateMachineSchema, { status: "broken" }, { machineId: "m" })).toBeTruthy();
  });

  it("rejects unknown fields on machine update", () => {
    expect(fails(updateMachineSchema, { bogus: 1 }, { machineId: "m" })).toBeTruthy();
  });

  it("rejects an invalid sensor type and out-of-range interval", () => {
    expect(fails(createSensorSchema, { name: "Vib", type: "humidity" }, { machineId: "m" })).toBeTruthy();
    expect(fails(createSensorSchema, { name: "Vib", type: "vibration", expectedIntervalSec: 0 }, { machineId: "m" })).toBeTruthy();
    expect(fails(createSensorSchema, { name: "Vib", type: "vibration", expectedIntervalSec: 86401 }, { machineId: "m" })).toBeTruthy();
  });

  it("rejects a string interval (the client parses it to a number first)", () => {
    expect(fails(createSensorSchema, { name: "Vib", type: "vibration", expectedIntervalSec: "60" }, { machineId: "m" })).toBeTruthy();
  });

  it("rejects unknown fields on sensor update", () => {
    expect(fails(updateSensorSchema, { bogus: 1 }, { sensorId: "s" })).toBeTruthy();
  });
});

describe("event schema", () => {
  const base = {
    siteId: "site_1",
    machineId: "machine_1",
    sensorId: "sensor_1",
    timestamp: "2026-10-20T06:30:00Z",
    values: { temperature: 82.4 },
  };

  it("accepts a valid reading and defaults type/source", () => {
    const parsed = ok(ingestEventSchema, base);
    expect(parsed.body.type).toBe("sensor_reading");
    expect(parsed.body.source).toBe("api");
    expect(parsed.body.timestamp).toBeInstanceOf(Date);
  });

  it("rejects an empty values object and non-numeric values", () => {
    expect(fails(ingestEventSchema, { ...base, values: {} })).toBeTruthy();
    expect(fails(ingestEventSchema, { ...base, values: { temperature: "hot" } })).toBeTruthy();
  });

  it("rejects invalid enums and a missing timestamp", () => {
    expect(fails(ingestEventSchema, { ...base, type: "telemetry" })).toBeTruthy();
    expect(fails(ingestEventSchema, { ...base, source: "carrier-pigeon" })).toBeTruthy();
    expect(fails(ingestEventSchema, { ...base, timestamp: undefined })).toBeTruthy();
  });

  it("rejects an invalid event list window", () => {
    expect(fails(getEventsSchema, {}, {}, { limit: "1000" })).toBeTruthy();
    expect(fails(getEventsSchema, {}, {}, { from: "not-a-date" })).toBeTruthy();
  });
});

describe("api key and auth schemas", () => {
  it("trims the key name and rejects a blank one", () => {
    expect(ok(createApiKeySchema, { name: "  gateway  " }).body.name).toBe("gateway");
    expect(fails(createApiKeySchema, { name: "   " })).toBeTruthy();
    expect(fails(createApiKeySchema, {})).toBeTruthy();
  });

  it("enforces the password policy on register and reset", () => {
    const valid = {
      email: "a@b.com",
      username: "abc",
      password: "Password123!",
    };
    expect(ok(registerSchema, valid).body.username).toBe("abc");
    expect(fails(registerSchema, { ...valid, password: "short" })).toBeTruthy();
    expect(fails(registerSchema, { ...valid, email: "nope" })).toBeTruthy();
    expect(fails(resetPasswordSchema, { otp: "123456", newPassword: "short" })).toBeTruthy();
  });

  it("keeps the refresh-token body optional but typed", () => {
    expect(ok(refreshTokenSchema, {}).body.refreshToken).toBeUndefined();
    expect(ok(refreshTokenSchema, { refreshToken: "abc" }).body.refreshToken).toBe("abc");
    expect(fails(refreshTokenSchema, { refreshToken: 123 })).toBeTruthy();
    expect(fails(refreshTokenSchema, { refreshToken: "" })).toBeTruthy();
  });
});
