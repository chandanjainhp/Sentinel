"use client";

import React, { memo } from "react";
import { useRouter } from "next/navigation";
import { formatNightLabel, formatTime } from "@/lib/formatters";
import { getSeverity } from "@/lib/severity";
import ProjectContextBadge from "@/components/shared/ProjectContextBadge";

const TYPE_LABELS = {
  work_package: "WORK PACKAGE",
  temporal: "TEMPORAL",
  cross_type: "CROSS TYPE",
};

const EventCard = memo(({ incident }) => {
  const router = useRouter();

  const id = incident?._id || incident?.id || incident?.incidentId;
  const severity = incident.severity || "uncertain";
  const s = getSeverity(severity);
  const tok = { text: s.token, bg: s.bg, border: s.dim, label: s.label.toUpperCase() };

  const typeLabel = TYPE_LABELS[incident.correlation?.type] || "INCIDENT";
  const nightDate = incident.nightDate;
  const timeLabel = nightDate
    ? formatNightLabel(nightDate)
    : incident?.firstEventTime
      ? formatTime(incident.firstEventTime)
      : "Night";

  return (
    <div
      onClick={() => router.push(`/incident/${id}`)}
      style={{
        display: "grid",
        gridTemplateColumns: "54px 1fr auto",
        alignItems: "center",
        padding: "10px 16px",
        gap: "10px",
        borderTop: "1px solid var(--border-hairline)",
        borderLeft: "2px solid transparent",
        background: "transparent",
        cursor: "pointer",
        transition: "background var(--dur-fast)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--bg-surface-1)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--fg-3)" }}>
        {timeLabel}
      </span>

      <div>
        <div style={{ marginBottom: "2px" }}>
          <ProjectContextBadge
            projectContext={incident.projectContext}
            fallback={incident.title || "Unknown WP"}
          />
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10.5px",
            color: "var(--fg-3)",
            lineHeight: 1.3,
          }}
        >
          {typeLabel}
        </div>
      </div>

      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "9px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          padding: "2px 7px",
          borderRadius: "2px",
          background: tok.bg,
          color: tok.text,
          border: `1px solid ${tok.border}`,
        }}
      >
        {tok.label}
      </span>
    </div>
  );
});

EventCard.displayName = "EventCard";
export default EventCard;
