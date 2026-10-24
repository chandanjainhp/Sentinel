import { memo } from "react";
import { isIncidentStatus, getStatusLabel } from "@/lib/status";

/**
 * Incident lifecycle badge. Mirrors SeverityBadge: tokens only, no hardcoded
 * rgb values, and statuses come from lib/status.js so the list, the detail
 * page, the investigations page and the filter dropdown cannot drift apart.
 */
function StatusBadge({ status }) {
  const value = isIncidentStatus(status) ? String(status).toLowerCase() : null;
  const tone =
    value === "open"
      ? { color: "var(--sev-minor)", border: "var(--sev-minor-dim)", bg: "var(--sev-minor-bg)" }
      : value === "reviewed"
        ? { color: "var(--fg-2)", border: "var(--border-default)", bg: "var(--bg-surface-2)" }
        : value === "closed"
          ? { color: "var(--sev-harmless)", border: "var(--sev-harmless-dim)", bg: "var(--sev-harmless-bg)" }
          : { color: "var(--fg-4)", border: "var(--border-default)", bg: "transparent" };

  return (
    <span
      style={{
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        color: tone.color,
        fontSize: "10px",
        fontFamily: "var(--font-mono)",
        fontWeight: 600,
        letterSpacing: "0.08em",
        padding: "3px 8px",
        borderRadius: "4px",
        display: "inline-flex",
        alignItems: "center",
        whiteSpace: "nowrap",
      }}
    >
      {getStatusLabel(value)}
    </span>
  );
}

export default memo(StatusBadge);
