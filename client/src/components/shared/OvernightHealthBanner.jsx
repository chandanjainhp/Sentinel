"use client";

import { useQuery } from "@tanstack/react-query";
import { getOvernightHealthCurrent } from "@/lib/api";
import { REPORTING_TIMEZONE } from "@/lib/reporting-window";

const STATUS_CONFIG = {
  completed: { label: "Completed", color: "var(--sev-harmless)" },
  completed_with_warnings: { label: "Completed with warnings", color: "var(--sev-minor)" },
  running: { label: "Running", color: "var(--accent)" },
  scheduled: { label: "Scheduled", color: "var(--fg-3)" },
  failed: { label: "Failed", color: "var(--sev-serious)" },
};

const shell = {
  padding: "12px 16px",
  border: "1px solid var(--border-default)",
  borderRadius: "4px",
  background: "var(--bg-surface-1)",
};

const label = {
  fontFamily: "var(--font-mono)",
  fontSize: "10px",
  color: "var(--fg-3)",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
};

/**
 * Compact overnight-health banner.
 *
 * Shared by the investigations workspace (and anywhere else that needs the
 * run context) so the fetch, the status vocabulary and the copy live in one
 * place instead of being re-implemented per page.
 */
export default function OvernightHealthBanner({ nightDate }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["overnight-health", "current"],
    queryFn: getOvernightHealthCurrent,
    refetchInterval: 60 * 1000,
    staleTime: 30 * 1000,
  });

  if (isLoading) {
    return (
      <div style={shell}>
        <span style={{ ...label, color: "var(--fg-4)" }}>Loading overnight health status…</span>
      </div>
    );
  }

  const config = data?.status ? STATUS_CONFIG[String(data.status).toLowerCase()] : null;
  if (isError || !config) {
    return (
      <div style={shell}>
        <span style={label}>Overnight Health: Status unavailable</span>
      </div>
    );
  }

  const assessed = data.assessedMachines ?? "—";
  const expected = data.expectedMachines ?? "—";
  const found = Array.isArray(data.incidents) ? data.incidents.length : "—";
  const reportingDate = data.reportingDate || nightDate;
  const timezone = data.timezone || REPORTING_TIMEZONE;
  const failed = String(data.status).toLowerCase() === "failed";

  return (
    <div
      style={{
        ...shell,
        borderColor: config.color,
        background: failed ? "var(--sev-serious-bg)" : "var(--bg-surface-1)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          color: config.color,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}
      >
        <span
          aria-hidden="true"
          style={{ width: "6px", height: "6px", borderRadius: "50%", background: config.color }}
        />
        <span>Overnight Health: {config.label}</span>
      </div>
      <div
        style={{
          marginTop: "8px",
          ...label,
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <span>{assessed}/{expected} machines assessed</span>
        <span aria-hidden="true">·</span>
        <span>{found} incidents found</span>
        <span aria-hidden="true">·</span>
        <span>Reporting window {reportingDate} · {timezone}</span>
      </div>
      {failed && data.errorDetails?.[0] ? (
        <div
          style={{
            marginTop: "6px",
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            color: "var(--sev-serious)",
          }}
        >
          Error: {data.errorDetails[0]}
        </div>
      ) : null}
    </div>
  );
}
