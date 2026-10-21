"use client";

import React, { useEffect, useRef } from "react";
import { useInvestigationStore } from "@/store/investigationStore";
import { buildInvestigationFeedItems } from "@/lib/investigation-state";
import AgentFeedItem from "./AgentFeedItem";

/**
 * Renders the traces of every investigation job for the viewed night.
 * The documents come from the page's single polling hook, so this feed and
 * the progress counter are always reading the same snapshot.
 */
export default function AgentFeed({ investigations = [] }) {
  const jobStatus  = useInvestigationStore((s) => s.jobStatus);
  const stats      = useInvestigationStore((s) => s.investigationStats);
  const errorMsg   = useInvestigationStore((s) => s.error);

  const scrollRef = useRef(null);
  const bottomRef = useRef(null);

  const feedItems = React.useMemo(
    () => buildInvestigationFeedItems(investigations),
    [investigations],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= 50) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [feedItems.length]);

  const pending = jobStatus === "queued" || jobStatus === "running";

  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      overflow: "hidden", background: "var(--bg-terminal)",
    }}>
      <div
        ref={scrollRef}
        style={{
          flex: 1, overflowY: "auto",
          padding: "12px 16px",
          display: "flex", flexDirection: "column", gap: 0,
        }}
      >
        {/* empty states */}
        {jobStatus === "idle" && feedItems.length === 0 && (
          <div style={{
            marginTop: "40px", textAlign: "center",
            fontFamily: "var(--font-mono)", fontSize: "10px",
            color: "var(--term-dim)", letterSpacing: "0.12em", textTransform: "uppercase",
          }}>
            Waiting for investigation to start
          </div>
        )}

        {pending && feedItems.length === 0 && (
          <div style={{
            marginTop: "40px", textAlign: "center",
            fontFamily: "var(--font-mono)", fontSize: "10px",
            color: "var(--term-dim)", letterSpacing: "0.12em", textTransform: "uppercase",
          }}>
            {jobStatus === "queued" ? "Queued — waiting for a worker" : "Polling for results"}
          </div>
        )}

        {feedItems.map((item) => (
          <AgentFeedItem key={item.id} item={item} />
        ))}

        {jobStatus === "complete" && (
          <div style={{
            marginTop: "8px",
            fontFamily: "var(--font-mono)", fontSize: "11px",
            color: "var(--term-classify)", letterSpacing: "0.08em",
          }}>
            ▸ Investigation complete · {stats.resolvedIncidents}/{stats.totalIncidents} incidents classified
          </div>
        )}

        {jobStatus === "failed" && (
          <div style={{
            marginTop: "8px", padding: "8px 12px",
            border: "1px solid var(--sev-serious-dim)",
            background: "var(--sev-serious-bg)",
            fontFamily: "var(--font-mono)", fontSize: "10px",
            color: "var(--sev-serious)", letterSpacing: "0.08em", textTransform: "uppercase",
          }}>
            ✕ {errorMsg || "Investigation failed — no reason recorded."}
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
