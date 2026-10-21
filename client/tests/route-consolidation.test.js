import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("incident route consolidation", () => {
  it("keeps plural incidents as canonical and preserves legacy URLs", () => {
    const legacy = read("src/app/incident/[id]/page.js");
    const canonical = read("src/app/incidents/[incidentId]/page.jsx");
    expect(legacy).toContain('redirect(`/incidents/${id}`)');
    expect(canonical).toContain("useIncidentEvidenceGraph");
    expect(canonical).toContain("useIncidentExplain");
    expect(canonical).toContain("<EvidenceChain");
    expect(canonical).toContain("<AgentReasoning");
  });

  it("keeps the investigation bookmark redirect and event-card links canonical", () => {
    expect(read("src/app/investigate/page.js")).toContain('redirect("/incidents")');
    expect(read("src/components/events/EventCard.jsx")).toContain("/incidents/${id}");
  });
});
