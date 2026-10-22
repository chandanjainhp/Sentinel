import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const file = (path) => new URL(`../${path}`, import.meta.url);
const read = (path) => readFileSync(file(path), "utf8");

describe("incident route consolidation", () => {
  it("keeps plural incidents canonical and removes obsolete legacy route files", () => {
    const canonical = read("src/app/incidents/[incidentId]/page.jsx");
    expect(existsSync(file("src/app/incident"))).toBe(false);
    expect(canonical).toContain("useIncidentEvidenceGraph");
    expect(canonical).toContain("useIncidentExplain");
    expect(canonical).toContain("<EvidenceChain");
    expect(canonical).toContain("<AgentReasoning");
  });

  it("keeps event-card links on the canonical route", () => {
    expect(existsSync(file("src/app/investigate"))).toBe(false);
    expect(read("src/components/events/EventCard.jsx")).toContain("/incidents/${id}");
  });
});
