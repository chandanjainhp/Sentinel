/**
 * Deterministic machine-health presentation mapping.
 *
 * Health status comes from the backend (machine-health.service.js):
 *   HEALTHY | WARNING | CRITICAL | OFFLINE | UNKNOWN (+ defensive MAINTENANCE)
 * It is NEVER AI-narrated and never client-computed — this module only maps
 * an existing status to its Night Watch token, label and CSS class.
 */

export const HEALTH_STATUSES = [
  "healthy",
  "warning",
  "critical",
  "offline",
  "maintenance",
  "unknown",
];

const MAP = {
  healthy:     { token: "var(--health-healthy)",     cssClass: "hw-dot--healthy",     label: "HEALTHY" },
  warning:     { token: "var(--health-warning)",     cssClass: "hw-dot--warning",     label: "WARNING" },
  critical:    { token: "var(--health-critical)",    cssClass: "hw-dot--critical",    label: "CRITICAL" },
  offline:     { token: "var(--health-offline)",     cssClass: "hw-dot--offline",     label: "OFFLINE" },
  maintenance: { token: "var(--health-maintenance)", cssClass: "hw-dot--maintenance", label: "MAINTENANCE" },
  unknown:     { token: "var(--health-unknown)",     cssClass: "hw-dot--unknown",     label: "UNKNOWN" },
};

/** Normalize any backend/legacy status string into a known key. */
export function normalizeHealth(status) {
  const s = String(status || "").toLowerCase();
  if (HEALTH_STATUSES.includes(s)) return s;
  // Legacy severity vocabulary maps onto health deterministically.
  if (s === "serious" || s === "escalate") return "critical";
  if (s === "minor" || s === "monitor") return "warning";
  if (s === "harmless") return "healthy";
  return "unknown";
}

/**
 * @returns {{ key: string, token: string, cssClass: string, label: string }}
 */
export function healthMeta(status) {
  const key = normalizeHealth(status);
  return { key, ...MAP[key] };
}

/** Severity (incidents) → health key. Same deterministic rule everywhere. */
export function severityToHealth(severity) {
  return normalizeHealth(severity);
}
