"use client";

import { useState } from "react";
import { useIncidents } from "@/hooks/useIncidents";
import EventCard from "./EventCard";

const PILL_CONFIG = {
  serious: {
    label: "Serious",
    dot: "var(--sev-serious)",
    dataKey: "serious",
    bg: "rgba(255, 0, 0, 0.15)",
    border: "var(--sev-serious)",
    color: "var(--sev-serious)",
  },
  minor: {
    label: "Minor",
    dot: "var(--sev-minor)",
    dataKey: "minor",
    bg: "rgba(255, 165, 0, 0.15)",
    border: "var(--sev-minor)",
    color: "var(--sev-minor)",
  },
  harmless: {
    label: "Harmless",
    dot: "var(--sev-harmless)",
    dataKey: "harmless",
    bg: "rgba(150, 150, 150, 0.15)",
    border: "var(--sev-harmless)",
    color: "var(--fg-2)",
  },
  uncertain: {
    label: "Uncertain",
    dot: "var(--sev-unknown)",
    dataKey: "uncertain",
    bg: "transparent",
    border: "var(--sev-unknown)",
    color: "var(--fg-3)",
    dashed: true,
  },
};

const GROUPINGS = [
  { title: "Serious", key: "serious", dataKey: "serious" },
  { title: "Minor", key: "minor", dataKey: "minor" },
  { title: "Uncertain", key: "uncertain", dataKey: "uncertain" },
  { title: "Harmless", key: "harmless", dataKey: "harmless" },
  { title: "Unknown", key: "unknown", dataKey: "unclassified" },
];

const GROUP_DOT_COLOR = {
  serious: "var(--sev-serious)",
  minor: "var(--sev-minor)",
  uncertain: "var(--sev-unknown)",
  harmless: "var(--sev-harmless)",
  unknown: "var(--fg-4)",
};

const GROUP_TITLE_COLOR = {
  serious: "var(--sev-serious)",
  minor: "var(--sev-minor)",
  uncertain: "var(--fg-3)",
  harmless: "var(--sev-harmless)",
  unknown: "var(--fg-4)",
};

function SeverityGroup({ title, severityKey, events }) {
  const [open, setOpen] = useState(true);
  if (!events?.length) return null;

  const dotColor = GROUP_DOT_COLOR[severityKey] || "var(--fg-4)";
  const titleColor = GROUP_TITLE_COLOR[severityKey] || "var(--fg-3)";

  return (
    <div style={{ borderBottom: "1px solid var(--border-hairline)" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "8px 16px",
          background: "var(--bg-base)",
          border: "none",
          textAlign: "left",
          cursor: "pointer",
          position: "sticky",
          top: 0,
          zIndex: 1,
        }}
      >
        <span
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: dotColor,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            color: titleColor,
          }}
        >
          {title}
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            color: "var(--fg-3)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {events.length}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            color: "var(--fg-4)",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 150ms",
            lineHeight: 1,
          }}
        >
          ›
        </span>
      </button>

      {open &&
        events.map((ev) => <EventCard key={ev.id || ev._id} incident={ev} />)}
    </div>
  );
}

export default function EventPanel({ nightDate: nightDateProp }) {
  const nightDate =
    nightDateProp ||
    (() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return d.toISOString().split("T")[0];
    })();

  const { data, isLoading, isError, error } = useIncidents({ nightDate });
  const [activeSeverityFilters, setActiveSeverityFilters] = useState([
    "serious",
    "minor",
    "harmless",
    "uncertain",
  ]);
  const toggleSeverityFilter = (key) => {
    setActiveSeverityFilters((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: "8px",
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: "var(--accent)",
            animation: "status-pulse 1.4s ease-in-out infinite",
          }}
        />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            color: "var(--fg-4)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          Loading event matrix…
        </span>
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ padding: "20px 16px" }}>
        <div
          style={{
            padding: "10px 14px",
            background: "var(--sev-serious-bg)",
            border: "1px solid var(--sev-serious-dim)",
            borderRadius: "2px",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              color: "var(--sev-serious)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: "4px",
            }}
          >
            Error loading event data
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              color: "var(--fg-4)",
            }}
          >
            {error?.message || "Unknown error"}
          </div>
        </div>
      </div>
    );
  }

  const allIncidents = data?.incidents || [];

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* ── Filter pills ──────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: "6px",
          padding: "10px 16px",
          flexWrap: "wrap",
          borderBottom: "1px solid var(--border-hairline)",
          background: "var(--bg-surface-1)",
          flexShrink: 0,
        }}
      >
        {Object.entries(PILL_CONFIG).map(([key, cfg]) => {
          const isOn = activeSeverityFilters.includes(key);
          const count = (data?.[cfg.dataKey] || []).length;
          return (
            <button
              key={key}
              onClick={() => toggleSeverityFilter(key)}
              aria-pressed={isOn}
              aria-label={`Filter by ${cfg.label} severity`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                padding: "4px 10px",
                borderRadius: "999px",
                border: `${cfg.dashed ? "1px dashed" : "1px solid"} ${cfg.border}`,
                background: cfg.bg,
                color: cfg.color,
                cursor: "pointer",
                userSelect: "none",
                opacity: isOn ? 1 : 0.55,
                transition: "opacity 100ms, background 100ms, border-color 100ms, color 100ms",
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: cfg.dot,
                  flexShrink: 0,
                }}
              />
              {count > 0 ? `${cfg.label} · ${count}` : cfg.label}
            </button>
          );
        })}
      </div>

      {/* ── Scrollable event list ─────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)" }}>
        {allIncidents.length === 0 && (
          <div
            style={{
              padding: "30% 24px 24px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                color: "var(--fg-3)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              No overnight events for {nightDate}
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                color: "var(--fg-3)",
                maxWidth: "260px",
                lineHeight: 1.5,
              }}
            >
              Patrol either did not run or did not detect anything reportable.
            </span>
          </div>
        )}

        {GROUPINGS.map((g) => {
          const groupData = (data?.[g.dataKey] || []).filter((inc) =>
            activeSeverityFilters.includes(inc.severity || "unknown"),
          );
          return (
            <SeverityGroup
              key={g.key}
              title={g.title}
              severityKey={g.key}
              events={groupData}
            />
          );
        })}
      </div>
    </div>
  );
}
