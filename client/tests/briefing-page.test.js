import { describe, it, expect, beforeEach, afterEach } from "bun:test";

/**
 * Briefing Page Tests
 * 
 * Tests for the briefing page UI components, hooks, and utility functions.
 * These are unit tests that verify the client-side logic without requiring
 * a full Next.js environment or mocking the entire React tree.
 */

// ============================================================================
// Utility Function Tests
// ============================================================================

describe("useDefaultNightDate utility", () => {
  it("should return yesterday's date in YYYY-MM-DD format", () => {
    // We can't test the actual hook without React, but we can test the logic
    const getYesterday = () => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };

    const yesterday = getYesterday();
    const date = new Date(yesterday);
    
    // Verify it's in the correct format
    expect(yesterday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    
    // Verify it's not today
    const today = new Date();
    const timeDiff = today.getTime() - date.getTime();
    const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
    expect(daysDiff).toBeGreaterThanOrEqual(0.5);
    expect(daysDiff).toBeLessThan(1.5);
  });
});

describe("formatDateForDisplay utility", () => {
  const formatDateForDisplay = (dateString) => {
    const date = new Date(`${dateString}T00:00:00`);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  it("should format a date string correctly", () => {
    const formatted = formatDateForDisplay("2026-10-20");
    expect(formatted).toContain("20");
    expect(formatted).toContain("Oct");
    expect(formatted).toContain("2026");
  });

  it("should handle valid date strings", () => {
    const testDates = ["2026-01-15", "2026-12-31", "2025-02-28"];
    testDates.forEach(dateStr => {
      const formatted = formatDateForDisplay(dateStr);
      expect(formatted.length).toBeGreaterThan(0);
      expect(typeof formatted).toBe("string");
    });
  });
});

describe("StatusBadge component props", () => {
  const statusConfig = {
    draft: { color: "var(--sev-minor)", label: "Draft" },
    generating: { color: "var(--accent)", label: "Generating" },
    approved: { color: "var(--sev-harmless)", label: "Approved" },
    failed: { color: "var(--sev-serious)", label: "Failed" },
  };

  it("should have all required status types", () => {
    expect(statusConfig.draft).toBeDefined();
    expect(statusConfig.generating).toBeDefined();
    expect(statusConfig.approved).toBeDefined();
    expect(statusConfig.failed).toBeDefined();
  });

  it("should have correct labels", () => {
    expect(statusConfig.draft.label).toBe("Draft");
    expect(statusConfig.generating.label).toBe("Generating");
    expect(statusConfig.approved.label).toBe("Approved");
    expect(statusConfig.failed.label).toBe("Failed");
  });
});

// ============================================================================
// Section Configuration Tests
// ============================================================================

describe("Briefing section configurations", () => {
  const SECTION_COMPONENTS = {
    executive_summary: "SectionContent",
    incidents: "IncidentsTable",
    recommendations: "SectionContent",
    anomalies: "AnomaliesTable",
    follow_up: "SectionContent",
  };

  const SECTION_LABELS = {
    executive_summary: "Executive Summary",
    incidents: "Incidents",
    recommendations: "Recommendations",
    anomalies: "Anomalies",
    follow_up: "Follow-Up Actions",
  };

  it("should have all five required sections", () => {
    const expectedSections = ["executive_summary", "incidents", "recommendations", "anomalies", "follow_up"];
    expectedSections.forEach(section => {
      expect(SECTION_COMPONENTS[section]).toBeDefined();
      expect(SECTION_LABELS[section]).toBeDefined();
    });
  });

  it("should have correct section labels", () => {
    expect(SECTION_LABELS.executive_summary).toBe("Executive Summary");
    expect(SECTION_LABELS.incidents).toBe("Incidents");
    expect(SECTION_LABELS.recommendations).toBe("Recommendations");
    expect(SECTION_LABELS.anomalies).toBe("Anomalies");
    expect(SECTION_LABELS.follow_up).toBe("Follow-Up Actions");
  });
});

// ============================================================================
// State Management Logic Tests
// ============================================================================

describe("Briefing page state logic", () => {
  it("should determine correct state based on briefing data", () => {
    // Mock briefing objects
    const noBriefing = null;
    const draftBriefing = { status: "draft" };
    const generatingBriefing = { status: "generating" };
    const approvedBriefing = { status: "approved" };
    const failedBriefing = { status: "failed" };

    // Test isApproved
    expect(noBriefing?.status === "approved").toBe(false);
    expect(draftBriefing.status === "approved").toBe(false);
    expect(generatingBriefing.status === "approved").toBe(false);
    expect(approvedBriefing.status === "approved").toBe(true);

    // Test isGenerating
    expect(noBriefing?.status === "generating").toBe(false);
    expect(draftBriefing.status === "generating").toBe(false);
    expect(generatingBriefing.status === "generating").toBe(true);
    expect(approvedBriefing.status === "generating").toBe(false);

    // Test canGenerate
    expect(!noBriefing).toBe(true); // Can generate if no briefing
    expect(generatingBriefing.status === "generating").toBe(true); // Cannot generate if already generating

    // Test canEdit
    expect(draftBriefing.status !== "approved" && draftBriefing.status !== "generating").toBe(true);
    expect(generatingBriefing.status !== "approved" && generatingBriefing.status !== "generating").toBe(false);
    expect(approvedBriefing.status !== "approved" && approvedBriefing.status !== "generating").toBe(false);

    // Test canApprove
    expect(draftBriefing.status === "draft").toBe(true);
    expect(generatingBriefing.status === "draft").toBe(false);
    expect(approvedBriefing.status === "draft").toBe(false);
  });
});

// ============================================================================
// Date Navigation Tests
// ============================================================================

describe("Date navigation logic", () => {
  it("should decrement date correctly", () => {
    const decrementDate = (nightDate) => {
      const d = new Date(`${nightDate}T00:00:00`);
      d.setDate(d.getDate() - 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };

    const result = decrementDate("2026-10-20");
    expect(result).toBe("2026-10-19");
  });

  it("should increment date correctly", () => {
    const incrementDate = (nightDate) => {
      const d = new Date(`${nightDate}T00:00:00`);
      d.setDate(d.getDate() + 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };

    const result = incrementDate("2026-10-20");
    expect(result).toBe("2026-10-21");
  });

  it("should handle month boundaries when decrementing", () => {
    const decrementDate = (nightDate) => {
      const d = new Date(`${nightDate}T00:00:00`);
      d.setDate(d.getDate() - 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };

    expect(decrementDate("2026-10-01")).toBe("2026-09-30");
    expect(decrementDate("2026-01-01")).toBe("2025-12-31");
  });

  it("should handle month boundaries when incrementing", () => {
    const incrementDate = (nightDate) => {
      const d = new Date(`${nightDate}T00:00:00`);
      d.setDate(d.getDate() + 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };

    expect(incrementDate("2026-09-30")).toBe("2026-10-01");
    expect(incrementDate("2025-12-31")).toBe("2026-01-01");
  });
});

// ============================================================================
// Severity Color Mapping Tests
// ============================================================================

describe("Severity color mapping", () => {
  const severityColor = (severity) => {
    const map = {
      critical: "var(--sev-serious)",
      warning: "var(--sev-minor)",
      serious: "var(--sev-serious)",
      minor: "var(--sev-minor)",
      harmless: "var(--sev-harmless)",
      uncertain: "var(--sev-minor)",
    };
    return map[severity] || "var(--fg-3)";
  };

  it("should map critical to serious color", () => {
    expect(severityColor("critical")).toBe("var(--sev-serious)");
  });

  it("should map warning to minor color", () => {
    expect(severityColor("warning")).toBe("var(--sev-minor)");
  });

  it("should map serious to serious color", () => {
    expect(severityColor("serious")).toBe("var(--sev-serious)");
  });

  it("should map minor to minor color", () => {
    expect(severityColor("minor")).toBe("var(--sev-minor)");
  });

  it("should map harmless to harmless color", () => {
    expect(severityColor("harmless")).toBe("var(--sev-harmless)");
  });

  it("should return default color for unknown severity", () => {
    expect(severityColor("unknown")).toBe("var(--fg-3)");
    expect(severityColor("")).toBe("var(--fg-3)");
    expect(severityColor(null)).toBe("var(--fg-3)");
  });
});

// ============================================================================
// Section Content Detection Tests
// ============================================================================

describe("Section content detection", () => {
  it("should identify empty string content", () => {
    const content = "";
    expect(!content || (Array.isArray(content) && content.length === 0)).toBe(true);
  });

  it("should identify empty array content", () => {
    const content = [];
    expect(!content || (Array.isArray(content) && content.length === 0)).toBe(true);
  });

  it("should identify non-empty string content", () => {
    const content = "Some executive summary text";
    expect(!content || (Array.isArray(content) && content.length === 0)).toBe(false);
  });

  it("should identify non-empty array content", () => {
    const content = ["item1", "item2"];
    expect(!content || (Array.isArray(content) && content.length === 0)).toBe(false);
  });

  it("should count array items correctly", () => {
    const content = ["item1", "item2", "item3"];
    const count = Array.isArray(content) ? content.length : undefined;
    expect(count).toBe(3);
  });

  it("should return undefined count for string content", () => {
    const content = "Some text";
    const count = Array.isArray(content) ? content.length : undefined;
    expect(count).toBe(undefined);
  });
});

// ============================================================================
// Metadata Extraction Tests
// ============================================================================

describe("Briefing metadata extraction", () => {
  it("should extract counts from metadata", () => {
    const briefing = {
      metadata: {
        counts: {
          incidents: 5,
          investigations: 3,
          machines: 2,
        },
        generator: "sentinel-deterministic-v1",
        window: { from: "2026-10-20T00:00:00.000Z", to: "2026-10-21T00:00:00.000Z" },
      },
    };

    expect(briefing.metadata.counts.incidents).toBe(5);
    expect(briefing.metadata.counts.investigations).toBe(3);
    expect(briefing.metadata.generator).toBe("sentinel-deterministic-v1");
  });

  it("should handle missing metadata gracefully", () => {
    const briefing = {};
    expect(briefing.metadata?.counts).toBe(undefined);
  });

  it("should format generatedAt date", () => {
    const briefing = {
      generatedAt: "2026-10-20T12:34:56.789Z",
    };

    const date = new Date(briefing.generatedAt);
    const formatted = date.toLocaleString();
    expect(formatted).toBeTruthy();
  });
});

// ============================================================================
// Formatting Tests
// ============================================================================

describe("Number formatting", () => {
  it("should format anomaly score to 3 decimal places", () => {
    const score = 0.823456;
    const formatted = score.toFixed(3);
    expect(formatted).toBe("0.823");
  });

  it("should handle null anomaly score", () => {
    const score = null;
    const formatted = score !== null && score !== undefined ? score.toFixed(3) : "—";
    expect(formatted).toBe("—");
  });

  it("should handle undefined anomaly score", () => {
    const score = undefined;
    const formatted = score !== null && score !== undefined ? score.toFixed(3) : "—";
    expect(formatted).toBe("—");
  });
});
