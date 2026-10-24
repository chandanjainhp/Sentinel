"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Calendar, Play, Search } from "lucide-react";
import {
  useIncidents,
  useIncidentById,
  useIncidentEvidenceGraph,
} from "@/hooks/useIncidents";
import { useNightInvestigations, useStartInvestigation } from "@/hooks/useInvestigation";
import { useInvestigationStore } from "@/store/investigationStore";
import AgentFeed from "@/components/agent/AgentFeed";
import EventPanel from "@/components/events/EventPanel";
import SeverityBadge from "@/components/events/SeverityBadge";
import StatusBadge from "@/components/incident/StatusBadge";
import OvernightHealthBanner from "@/components/shared/OvernightHealthBanner";
import ActiveJobBanner from "@/components/investigation/ActiveJobBanner";
import FailedJobBanner from "@/components/investigation/FailedJobBanner";
import InvestigationEmptyState from "@/components/investigation/InvestigationEmptyState";
import PersistedResultsView, {
  deriveInvestigationResults,
} from "@/components/investigation/PersistedResultsView";
import PageContainer from "@/components/layout/PageContainer";
import { defaultNightDate } from "@/lib/reporting-window";
import styles from "./investigations.module.css";

// Incident links (detail page, event cards) carry the public incidentId, so
// the picker must use the same value the ?incidentId= deep link holds.
const pickerValue = (incident) =>
  incident?.incidentId || incident?.id || incident?._id;

const TABS = [
  { id: "workspace", label: "Argus Workspace" },
  { id: "events", label: "Events Timeline" },
];

export default function InvestigationsPage() {
  const nightDate = useMemo(() => defaultNightDate(), []);

  return (
    <Suspense
      fallback={
        <PageContainer style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-3)" }}>
          Loading investigations…
        </PageContainer>
      }
    >
      <InvestigationsWorkspace nightDate={nightDate} />
    </Suspense>
  );
}

function InvestigationsWorkspace({ nightDate }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // The URL is the single source of truth for the selection, so incident
  // links and reloads land on the same investigation.
  const selectedIncidentId = searchParams.get("incidentId") || "";
  const [activeTab, setActiveTab] = useState(TABS[0].id);

  const jobIds = useInvestigationStore((s) => s.jobIds);
  const jobStatus = useInvestigationStore((s) => s.jobStatus);
  const stats = useInvestigationStore((s) => s.investigationStats);
  const investigationError = useInvestigationStore((s) => s.error);
  const { mutate: startInvestigation, isPending: isStarting } = useStartInvestigation();

  // One poll per queued job; the same documents feed the activity list.
  const { docs: investigations, isLoading: jobsLoading } = useNightInvestigations(jobIds);

  const { data: list } = useIncidents({}, { refetchInterval: 60 * 1000 });
  const incidents = list?.incidents ?? [];

  const { data: selectedIncident, isLoading: incidentLoading } = useIncidentById(
    selectedIncidentId,
    { enabled: Boolean(selectedIncidentId) },
  );
  const { data: evidenceGraph, isLoading: graphLoading } = useIncidentEvidenceGraph(
    selectedIncidentId,
    { enabled: Boolean(selectedIncidentId) },
  );

  const results = useMemo(
    () => deriveInvestigationResults({ incident: selectedIncident, graph: evidenceGraph }),
    [selectedIncident, evidenceGraph],
  );

  const isNightJobActive = jobStatus !== "idle" || jobIds.length > 0;
  const resultsLoading =
    Boolean(selectedIncidentId) && (incidentLoading || graphLoading || jobsLoading);
  const showResults = !isNightJobActive && results.hasResults;
  const startDisabled = isStarting || jobStatus === "queued" || jobStatus === "running";

  const pickIncident = (incidentId) => {
    const params = new URLSearchParams(searchParams.toString());
    if (incidentId) params.set("incidentId", incidentId);
    else params.delete("incidentId");
    const query = params.toString();
    router.replace(query ? `/investigations?${query}` : "/investigations", { scroll: false });
  };

  return (
    <PageContainer wide>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.headerText}>
            <div className={styles.eyebrow}>Operations · Argus workspace</div>
            <h1 className={styles.title}>
              <Search size={24} aria-hidden="true" />
              Investigations
            </h1>
            <p className={styles.description}>
              What the overnight agent is doing and what it concluded — live tool activity,
              reasoning, evidence chain and the night&apos;s events.
            </p>
            <p className={styles.window}>
              <Calendar size={12} aria-hidden="true" />
              <span>Reporting date {nightDate}</span>
            </p>
          </div>

          <Link href="/incidents" className={styles.headerAction}>
            <AlertTriangle size={12} aria-hidden="true" />
            Incident register
          </Link>
        </div>

        <OvernightHealthBanner nightDate={nightDate} />
      </header>

      <section className={styles.toolbar} aria-label="Investigation controls">
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="investigation-incident">
            Incident
          </label>
          <select
            id="investigation-incident"
            className={`${styles.select} tap-target`}
            value={selectedIncidentId}
            onChange={(event) => pickIncident(event.target.value)}
          >
            <option value="">No incident selected (night-wide view)</option>
            {incidents.map((incident) => {
              const id = pickerValue(incident);
              return (
                <option key={id} value={id}>
                  {incident.incidentId || String(id).substring(0, 8)} · {incident.title || "Unnamed incident"}
                </option>
              );
            })}
          </select>
        </div>

        <button
          className={`${styles.startButton} tap-target`}
          onClick={() => startInvestigation({ nightDate })}
          disabled={startDisabled}
        >
          <Play size={12} fill="currentColor" aria-hidden="true" />
          {isStarting ? "Initiating…" : "Start Investigation"}
        </button>
      </section>

      {!isNightJobActive && (
        <p className={styles.meta}>No investigation running for {nightDate}</p>
      )}

      {selectedIncidentId && (
        <div className={styles.toolbar} style={{ marginTop: 12 }} aria-label="Selected incident">
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Viewing</span>
            <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Link
                href={`/incidents/${selectedIncidentId}`}
                style={{ color: "var(--fg-1)", fontFamily: "var(--font-sans)", fontSize: 14 }}
              >
                {selectedIncident?.title || selectedIncident?.incidentId || selectedIncidentId}
              </Link>
              {selectedIncident && <SeverityBadge severity={selectedIncident.severity} />}
              {selectedIncident && <StatusBadge status={selectedIncident.status} />}
              {selectedIncident?.priority && (
                <span className={styles.meta}>P{selectedIncident.priority}</span>
              )}
            </span>
          </div>
        </div>
      )}

      {jobStatus === "failed" && (
        <div style={{ marginTop: 16 }}>
          <FailedJobBanner
            error={investigationError}
            onRetry={() => startInvestigation({ nightDate })}
            isStarting={isStarting}
          />
        </div>
      )}

      <div className={styles.tabs} role="tablist" aria-label="Investigation views">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`investigation-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`investigation-panel-${tab.id}`}
            className={`${styles.tab}${activeTab === tab.id ? ` ${styles.tabActive}` : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "workspace" ? (
        <div
          className={styles.panel}
          id="investigation-panel-workspace"
          role="tabpanel"
          aria-labelledby="investigation-tab-workspace"
        >
          {isNightJobActive ? (
            <>
              <ActiveJobBanner jobStatus={jobStatus} stats={stats} />
              <div className={styles.feedFrame}>
                <AgentFeed investigations={investigations} />
              </div>
            </>
          ) : showResults ? (
            <PersistedResultsView results={results} isLoading={resultsLoading} />
          ) : (
            <InvestigationEmptyState
              nightDate={nightDate}
              onStart={() => startInvestigation({ nightDate })}
              isStarting={startDisabled}
            />
          )}
        </div>
      ) : (
        <div
          className={styles.panel}
          id="investigation-panel-events"
          role="tabpanel"
          aria-labelledby="investigation-tab-events"
        >
          <div className={styles.eventsFrame}>
            <EventPanel nightDate={nightDate} />
          </div>
        </div>
      )}
    </PageContainer>
  );
}
