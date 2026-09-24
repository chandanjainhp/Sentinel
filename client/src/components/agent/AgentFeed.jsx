"use client";

import React, { useEffect, useRef } from "react";
import { useInvestigationStore } from "@/store/investigationStore";
import { useInvestigationData } from "@/hooks/useInvestigation";
import AgentFeedItem from "./AgentFeedItem";

export default function AgentFeed() {
  const jobId = useInvestigationStore((s) => s.jobId);
  const jobStatus  = useInvestigationStore((s) => s.jobStatus);
  const stats      = useInvestigationStore((s) => s.investigationStats);
  const errorMsg   = useInvestigationStore((s) => s.error);

  // Fetch investigation data for final results display
  const { data: investigation, isLoading } = useInvestigationData(jobId);

  const scrollRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= 50) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [investigation?.toolCallSequence?.length, investigation?.evidenceChain?.length]);

  // Convert toolCallSequence and evidenceChain to feed items for display
  const feedItems = React.useMemo(() => {
    if (!investigation) return [];
    
    const items = [];
    
    // Add tool calls as feed items
    if (investigation.toolCallSequence) {
      investigation.toolCallSequence.forEach((call, index) => {
        items.push({
          id: `tool-${index}`,
          type: "tool_called",
          timestamp: call.timestamp || new Date().toISOString(),
          summary: call.toolName || `Tool call ${index + 1}`,
          data: {
            toolName: call.toolName,
            toolInput: call.toolInput,
            durationMs: call.durationMs,
          },
          isNew: false,
        });
        
        if (call.toolResult) {
          items.push({
            id: `result-${index}`,
            type: "tool_result",
            timestamp: call.timestamp || new Date().toISOString(),
            summary: `Result for ${call.toolName}`,
            data: call.toolResult,
            isNew: false,
          });
        }
      });
    }
    
    // Add evidence chain items
    if (investigation.evidenceChain) {
      investigation.evidenceChain.forEach((evidence, index) => {
        items.push({
          id: `evidence-${index}`,
          type: "reasoning",
          timestamp: investigation.createdAt || new Date().toISOString(),
          summary: evidence.finding || `Evidence ${index + 1}`,
          data: {
            finding: evidence.finding,
            source: evidence.source,
            confidence: evidence.confidence,
          },
          isNew: false,
        });
      });
    }
    
    // Add classification if present
    if (investigation.classification) {
      items.push({
        id: "classification",
        type: "classification",
        timestamp: investigation.updatedAt || new Date().toISOString(),
        summary: investigation.classification.reasoning || "Final classification",
        data: {
          severity: investigation.classification.severity,
          confidence: investigation.classification.confidence,
          reasoning: investigation.classification.reasoning,
        },
        isNew: false,
      });
    }
    
    return items;
  }, [investigation]);

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

        {jobStatus === "running" && feedItems.length === 0 && (
          <div style={{
            marginTop: "40px", textAlign: "center",
            fontFamily: "var(--font-mono)", fontSize: "10px",
            color: "var(--term-dim)", letterSpacing: "0.12em", textTransform: "uppercase",
          }}>
            Polling for results
          </div>
        )}

        {isLoading && jobStatus === "running" && (
          <div style={{
            marginTop: "40px", textAlign: "center",
            fontFamily: "var(--font-mono)", fontSize: "10px",
            color: "var(--term-dim)", letterSpacing: "0.12em", textTransform: "uppercase",
          }}>
            Loading investigation data…
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
            ▸ Investigation complete · {stats?.resolvedIncidents || 0} incidents classified
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
            ✕ {errorMsg || "Unhandled agent exception"}
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
