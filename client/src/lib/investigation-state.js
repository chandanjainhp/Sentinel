/**
 * Night-investigation aggregation.
 *
 * The start endpoint returns one BullMQ job per incident, so "progress" is
 * completed investigation documents out of queued jobs — never tool-call
 * counts. Pure functions so the polling logic is testable without React.
 */

const ACTIVE = new Set(["queued", "running"]);

export function summarizeInvestigations(docs = [], totalJobs = 0) {
  const total = totalJobs || docs.length;
  const resolved = docs.filter((doc) => doc?.status === "complete").length;
  const failed = docs.find((doc) => doc?.status === "failed");
  const active = docs.filter((doc) => ACTIVE.has(doc?.status));

  let status = "idle";
  if (total > 0) {
    if (active.length > 0) status = active.some((doc) => doc.status === "running") ? "running" : "queued";
    // No document polled back yet: jobs are accepted but not picked up.
    else if (docs.length === 0) status = "queued";
    else if (failed) status = "failed";
    else status = "complete";
  }

  return {
    status,
    resolved,
    total,
    // Real reason recorded by the worker; null when it failed before touching
    // the document (the UI must not invent one).
    failureReason: failed?.failureReason || null,
  };
}

/** Merge every incident's trace into one terminal-style feed. */
export function buildInvestigationFeedItems(docs = []) {
  const items = [];

  for (const doc of docs) {
    if (!doc) continue;
    const key = String(doc._id || doc.id || doc.incidentId);

    (doc.toolCallSequence || []).forEach((call, index) => {
      items.push({
        id: `${key}-tool-${index}`,
        type: "tool_called",
        timestamp: call.timestamp || doc.createdAt,
        summary: call.toolName || `Tool call ${index + 1}`,
        data: { toolName: call.toolName, toolInput: call.toolInput, durationMs: call.durationMs },
        isNew: false,
      });

      if (call.toolResult) {
        items.push({
          id: `${key}-result-${index}`,
          type: "tool_result",
          timestamp: call.timestamp || doc.createdAt,
          summary: `Result for ${call.toolName}`,
          data: call.toolResult,
          isNew: false,
        });
      }
    });

    (doc.evidenceChain || []).forEach((evidence, index) => {
      items.push({
        id: `${key}-evidence-${index}`,
        type: "reasoning",
        timestamp: doc.createdAt,
        summary: evidence.finding || `Evidence ${index + 1}`,
        data: {
          finding: evidence.finding,
          source: evidence.source,
          confidence: evidence.confidence,
        },
        isNew: false,
      });
    });

    if (doc.classification?.reasoning) {
      items.push({
        id: `${key}-classification`,
        type: "classification",
        timestamp: doc.updatedAt || doc.createdAt,
        summary: doc.classification.reasoning,
        data: {
          severity: doc.classification.severity,
          confidence: doc.classification.confidence,
          reasoning: doc.classification.reasoning,
          resultSource: doc.resultSource,
        },
        isNew: false,
      });
    }
  }

  return items;
}
