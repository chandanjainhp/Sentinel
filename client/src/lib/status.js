/**
 * Canonical incident status vocabulary.
 *
 * Mirrors the server enum (server/src/models/incident.model.js): the
 * lifecycle is open → reviewed → closed. Nothing else is ever emitted, so
 * every badge, filter and bucket reads this list instead of re-guessing.
 */
export const INCIDENT_STATUSES = ["open", "reviewed", "closed"];

export const STATUS_LABELS = {
  open: "Open",
  reviewed: "Reviewed",
  closed: "Closed",
};

export const FALLBACK_STATUS = "open";

export const isIncidentStatus = (value) =>
  INCIDENT_STATUSES.includes(String(value).toLowerCase());

export const getStatusLabel = (value) =>
  STATUS_LABELS[value] ?? "Unknown";
