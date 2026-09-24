"use client";

import React, { memo } from "react";
import { formatToolName, truncateText, formatTimeWithSeconds } from "@/lib/formatters";
import { getSeverity } from "@/lib/severity";

/* terminal type → label & color token ─────────────────── */
const TYPE_MAP = {
  tool_called:    { label: "tool",     color: "var(--term-tool)" },
  tool_result:    { label: "result",   color: "var(--term-result)" },
  reasoning:      { label: "reason",   color: "var(--term-dim)" },
  classification: { label: "classify", color: "var(--term-classify)" },
  error:          { label: "error",    color: "var(--term-error)" },
};

const AgentFeedItem = memo(({ item }) => {
  const { type, data, timestamp } = item;
  const timeStr = formatTimeWithSeconds(timestamp);
  const meta    = TYPE_MAP[type] || { label: type, color: "var(--term-dim)" };

  /* build the message string */
  let message = "";
  if (type === "tool_called") {
    message = formatToolName(data?.toolName) || item.summary || "";
  } else if (type === "classification") {
    const sev = data?.severity || "unknown";
    const conf = data?.confidence ? ` · conf ${data.confidence.toFixed(2)}` : "";
    message = `${sev.toUpperCase()}${conf} — ${truncateText(data?.reasoning || item.summary, 80)}`;
  } else {
    message = truncateText(item.summary, 100) || "";
  }

  /* for classification, override color with severity color */
  let msgColor = meta.color;
  let rowBg = "transparent";
  if (type === "classification") {
    msgColor = getSeverity(data?.severity).token;
    rowBg = "rgba(255,255,255,0.02)";
  }
  if (type === "error") {
    rowBg = "var(--sev-serious-bg)";
  }

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "62px 58px 1fr",
      gap: "8px",
      padding: "2px 0",
      lineHeight: "1.7",
      background: rowBg,
      borderRadius: rowBg !== "transparent" ? "2px" : undefined,
    }}>
      {/* timestamp */}
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: "11px",
        color: "var(--term-dim)", flexShrink: 0,
      }}>
        {timeStr}
      </span>

      {/* type label */}
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: "10px",
        textTransform: "uppercase", letterSpacing: "0.08em",
        color: meta.color, flexShrink: 0,
      }}>
        {meta.label}
      </span>

      {/* message */}
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: "11px",
        color: msgColor,
        fontWeight: type === "classification" ? 500 : 400,
        wordBreak: "break-word",
      }}>
        {type === "tool_called" && (
          <span style={{ color: "var(--term-dim)", marginRight: "4px" }}>→</span>
        )}
        {message}
        {type === "reasoning" && (
          <span style={{ color: "var(--term-uncertain)" }}>
            {" "}[{truncateText(item.summary, 60)}]
          </span>
        )}
      </span>
    </div>
  );
});

AgentFeedItem.displayName = "AgentFeedItem";

export default AgentFeedItem;
