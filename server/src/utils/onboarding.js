export const SENSOR_TYPES = Object.freeze([
  "temperature",
  "vibration",
  "pressure",
  "current",
  "rpm",
  "flow",
]);

export const SENSOR_UNITS = Object.freeze({
  temperature: "°C",
  vibration: "mm/s",
  pressure: "bar",
  current: "A",
  rpm: "rpm",
  flow: "L/min",
});

export const PLAUSIBLE_RANGES = Object.freeze({
  temperature: [-100, 1500],
  vibration: [0, 200],
  pressure: [0, 1000],
  current: [0, 10000],
  rpm: [0, 100000],
  flow: [0, 100000],
});

export const normalizeName = (value) =>
  String(value || "").trim().replace(/\s+/g, " ").toLowerCase();

export const normalizeCity = normalizeName;

const postalRules = {
  IN: { label: "PIN code", pattern: /^\d{6}$/ },
  US: { label: "ZIP code", pattern: /^\d{5}(?:-\d{4})?$/ },
  GB: { label: "Postal code", pattern: /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i },
  UK: { label: "Postal code", pattern: /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i },
  DE: { label: "Postal code", pattern: /^\d{5}$/ },
  AE: { label: "Postal code (optional)", pattern: /^.*$/ },
  UAE: { label: "Postal code (optional)", pattern: /^.*$/ },
};

export function postalRule(country) {
  return postalRules[String(country || "").toUpperCase()] || {
    label: "Postal code",
    pattern: /^.+$/,
  };
}

export function validatePostalCode(country, postalCode) {
  if (String(country || "").toUpperCase() === "AE" || String(country || "").toUpperCase() === "UAE") {
    return { valid: true, known: false };
  }
  const rule = postalRule(country);
  if (!postalCode || !rule.pattern.test(String(postalCode).trim())) {
    return { valid: false, known: false };
  }
  return { valid: true, known: false };
}
