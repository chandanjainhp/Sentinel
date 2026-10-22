import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { buildIncidentsListParams } from "../src/hooks/useIncidents.js";
import { incidentQueryKey } from "../src/store/incidentFilterStore.js";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("incidents list loading", () => {
  it("does not scope the workspace table to a night window (matches dashboard incidents)", () => {
    const page = read("src/app/incidents/page.jsx");
    expect(page).toContain("useIncidents(");
    expect(page).not.toMatch(/useIncidents\(\s*\{[^}]*nightDate/s);
  });

  it("buildIncidentsListParams omits from/to when nightDate is absent", () => {
    const params = buildIncidentsListParams({ severity: "critical", status: "open" });
    expect(params).toEqual({ severity: "critical", status: "open" });
    expect(params.from).toBeUndefined();
    expect(params.to).toBeUndefined();
  });

  it("buildIncidentsListParams adds UTC night window when nightDate is set", () => {
    const params = buildIncidentsListParams({ nightDate: "2026-01-02" });
    expect(params.from).toBe("2026-01-02T00:00:00.000Z");
    expect(params.to).toBe("2026-01-02T23:59:59.999Z");
  });

  it("uses distinct query keys for night-scoped vs all-incidents lists", () => {
    expect(incidentQueryKey({ severity: "warning" })).toEqual({
      nightDate: null,
      severity: "warning",
      status: null,
    });
    expect(incidentQueryKey({ nightDate: "2026-05-01" })).toEqual({
      nightDate: "2026-05-01",
      severity: null,
      status: null,
    });
  });

  it("shows an error row instead of the empty-state copy on fetch failure", () => {
    const page = read("src/app/incidents/page.jsx");
    expect(page).toContain("isError");
    expect(page).toContain("Could not load incidents");
  });

  it("keeps severity as a status badge and makes row selection keyboard accessible", () => {
    const page = read("src/app/incidents/page.jsx");
    expect(page).toContain("<SeverityBadge severity={incident.severity || \"uncertain\"} />");
    expect(page).toContain("tabIndex={0}");
    expect(page).toContain('event.key === "Enter" || event.key === " "');
    expect(page).toContain("aria-selected={selected}");
  });

  it("renders a visible retry path when the investigation fails", () => {
    const page = read("src/app/incidents/page.jsx");
    expect(page).toContain('jobStatus === "failed"');
    expect(page).toContain("investigationError || \"Investigation failed.\"");
    expect(page).toContain("Retry Investigation");
  });

  it("incident detail route loads by id without overview coupling", () => {
    const detail = read("src/app/incidents/[incidentId]/page.jsx");
    expect(detail).toContain("getIncidentDetail");
    expect(detail).toContain("useParams");
    expect(detail).not.toContain("/overview");
  });
});
