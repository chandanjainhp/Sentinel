import { describe, it, expect } from "bun:test";
import {
  summarizeInvestigations,
  buildInvestigationFeedItems,
} from "../src/lib/investigation-state.js";
import { normalizeIncident } from "../src/lib/projectContext.js";

const doc = (id, status, extra = {}) => ({ _id: id, status, ...extra });

describe("summarizeInvestigations — status", () => {
  it("is idle with no jobs", () => {
    expect(summarizeInvestigations([], 0)).toEqual({
      status: "idle", resolved: 0, total: 0, failureReason: null,
    });
  });

  it("is queued once jobs exist but before the first poll returns", () => {
    expect(summarizeInvestigations([], 3)).toEqual({
      status: "queued", resolved: 0, total: 3, failureReason: null,
    });
  });

  it("is running while any job is running", () => {
    const summary = summarizeInvestigations(
      [doc("a", "running"), doc("b", "queued"), doc("c", "queued")],
      3,
    );
    expect(summary.status).toBe("running");
  });

  it("is queued while all returned jobs are queued", () => {
    expect(summarizeInvestigations([doc("a", "queued")], 1).status).toBe("queued");
  });

  it("is complete only when every job finished", () => {
    const summary = summarizeInvestigations(
      [doc("a", "complete"), doc("b", "complete")],
      2,
    );
    expect(summary.status).toBe("complete");
    expect(summary.resolved).toBe(2);
  });
});

describe("summarizeInvestigations — polling sequence", () => {
  it("moves queued → running → complete as successive polls land", () => {
    const snapshots = [
      [],
      [doc("a", "queued"), doc("b", "queued")],
      [doc("a", "running"), doc("b", "queued")],
      [doc("a", "complete"), doc("b", "running")],
      [doc("a", "complete"), doc("b", "complete")],
    ];
    const states = snapshots.map((snapshot) => {
      const { status, resolved } = summarizeInvestigations(snapshot, 2);
      return `${status}:${resolved}`;
    });

    expect(states).toEqual([
      "queued:0",
      "queued:0",
      "running:0",
      "running:1",
      "complete:2",
    ]);
  });
});

describe("summarizeInvestigations — progress counts incidents, not tool calls", () => {
  it("counts completed documents out of all queued jobs", () => {
    const summary = summarizeInvestigations(
      [
        doc("a", "complete", { toolCallSequence: [{}, {}, {}, {}] }),
        doc("b", "running", { toolCallSequence: [{}, {}] }),
        doc("c", "queued"),
      ],
      3,
    );
    expect(summary).toEqual({
      status: "running", resolved: 1, total: 3, failureReason: null,
    });
  });

  it("falls back to the document count when totalJobs is omitted", () => {
    expect(summarizeInvestigations([doc("a", "complete")]).total).toBe(1);
  });
});

describe("summarizeInvestigations — failure", () => {
  it("reports failed with the worker's failureReason", () => {
    const summary = summarizeInvestigations(
      [
        doc("a", "failed", { failureReason: "Incident missing" }),
        doc("b", "complete"),
      ],
      2,
    );
    expect(summary.status).toBe("failed");
    expect(summary.failureReason).toBe("Incident missing");
    expect(summary.resolved).toBe(1);
  });

  it("keeps a failure without a recorded reason as null (never invents text)", () => {
    const summary = summarizeInvestigations([doc("a", "failed")], 1);
    expect(summary.status).toBe("failed");
    expect(summary.failureReason).toBeNull();
  });
});

describe("buildInvestigationFeedItems", () => {
  it("returns nothing for queued documents", () => {
    expect(buildInvestigationFeedItems([doc("a", "queued")])).toEqual([]);
  });

  it("merges traces from every job without key collisions", () => {
    const docs = [
      doc("a", "complete", {
        toolCallSequence: [{ callIndex: 1, toolName: "get_incident_context", toolResult: { title: "A" } }],
        evidenceChain: [{ finding: "a finding", source: "incident", confidence: "high" }],
        classification: { severity: "serious", confidence: 0.81, reasoning: "a reasoning" },
      }),
      doc("b", "complete", {
        toolCallSequence: [
          { callIndex: 1, toolName: "get_incident_context", toolResult: { title: "B" } },
          { callIndex: 2, toolName: "classify_incident" },
        ],
        evidenceChain: [],
        classification: { severity: "minor", confidence: 0.4, reasoning: "b reasoning" },
      }),
    ];

    const items = buildInvestigationFeedItems(docs);
    const ids = items.map((item) => item.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(items.filter((item) => item.type === "classification")).toHaveLength(2);
    expect(items.filter((item) => item.type === "tool_called")).toHaveLength(3);
    expect(items.filter((item) => item.type === "reasoning")).toHaveLength(1);
  });

  it("skips the classification row when no reasoning was stored", () => {
    const items = buildInvestigationFeedItems([
      doc("a", "failed", { classification: {} }),
    ]);
    expect(items).toEqual([]);
  });
});

describe("normalizeIncident — persisted investigation reference", () => {
  it("keeps the latest complete investigation attached by the API", () => {
    const investigation = { _id: "inv1", status: "complete", classification: { reasoning: "r" } };
    expect(normalizeIncident({ _id: "inc1", investigationId: investigation }).investigationId)
      .toEqual(investigation);
  });

  it("is null for incidents without a finished investigation", () => {
    expect(normalizeIncident({ _id: "inc1" }).investigationId).toBeNull();
  });
});
