"use client";

import { memo, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Calendar, Filter, Search, X } from "lucide-react";
import { useIncidents } from "@/hooks/useIncidents";
import { useIncidentFilterStore } from "@/store/incidentFilterStore";
import SeverityBadge from "@/components/events/SeverityBadge";
import StatusBadge from "@/components/incident/StatusBadge";
import LoadingState from "@/components/shared/LoadingState";
import EmptyState from "@/components/shared/EmptyState";
import ErrorState from "@/components/shared/ErrorState";
import { SEVERITY_OPTIONS, SEV_TOKENS, FALLBACK_SEVERITY } from "@/lib/severity";
import { INCIDENT_STATUSES, STATUS_LABELS, FALLBACK_STATUS } from "@/lib/status";
import { defaultNightDate, REPORTING_TIMEZONE } from "@/lib/reporting-window";
import PageContainer from "@/components/layout/PageContainer";
import styles from "./incidents.module.css";

const getIncidentId = (incident) =>
  incident?.id || incident?._id || incident?.incidentId;

// Full ids are UUID-shaped and blow up the first column; keep them readable
// and expose the full value as a tooltip.
const shortId = (incident) => {
  const value = String(incident.incidentId || getIncidentId(incident) || "");
  return value.length > 15 ? `${value.slice(0, 13)}…` : value;
};

const formatTimestamp = (value) => {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString([], {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: REPORTING_TIMEZONE,
    });
  } catch {
    return "—";
  }
};

const IncidentRow = memo(function IncidentRow({ incident }) {
  const incidentId = getIncidentId(incident);
  const machineId = incident.machineId || incident.machine?._id;
  const sensorId = incident.sensorId || incident.evidence?.sensorId;
  const severity = incident.severity || FALLBACK_SEVERITY;
  const status = incident.status || FALLBACK_STATUS;

  return (
    // Non-interactive row: the title link is the single primary target, so
    // keyboard users get one stop per row instead of an overlapping
    // tr tabIndex + nested links.
    <tr className={styles.row}>
      <td className={styles.cellId} title={incident.incidentId || String(incidentId)}>
        {shortId(incident)}
      </td>
      <td className={styles.cellTitle}>
        <Link
          href={`/incidents/${incidentId}`}
          className={styles.titleLink}
          title={incident.title || "Unnamed Incident"}
        >
          {incident.title || "Unnamed Incident"}
        </Link>
      </td>
      <td className={styles.cellMachine}>
        {incident.machine?.name || incident.machineId || "—"}
      </td>
      <td>
        <SeverityBadge severity={severity} />
      </td>
      <td>
        <StatusBadge status={status} />
      </td>
      <td className={styles.mono}>{formatTimestamp(incident.createdAt)}</td>
      <td className={styles.mono}>
        {formatTimestamp(incident.lastSeenAt || incident.updatedAt || incident.createdAt)}
      </td>
      <td>
        <div className={styles.actions}>
          {machineId && (
            <Link
              href={`/machines/${machineId}`}
              className={styles.actionLink}
              title="View Machine"
            >
              MACHINE
            </Link>
          )}
          {sensorId && machineId && (
            <Link
              href={`/sensors/trends?machineId=${encodeURIComponent(machineId)}&sensorId=${encodeURIComponent(sensorId)}`}
              className={`${styles.actionLink} ${styles.actionLinkAccent}`}
              title="View Sensor Trends"
            >
              SENSOR
            </Link>
          )}
        </div>
      </td>
    </tr>
  );
});

function Metric({ label, value, tone }) {
  return (
    <div className={`${styles.metric}${tone ? ` ${styles[tone]}` : ""}`}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricValue}>{value}</span>
    </div>
  );
}

function MetricsSummary({ incidents, isLoading, isError }) {
  const counts = useMemo(
    () => ({
      critical: incidents.filter((i) => i.severity === "critical").length,
      warning: incidents.filter((i) => i.severity === "warning").length,
      open: incidents.filter((i) => (i.status || FALLBACK_STATUS) === "open").length,
      total: incidents.length,
    }),
    [incidents],
  );

  if (isError) return null;

  if (isLoading) {
    return (
      <div className={styles.metrics} aria-busy="true">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={styles.metric}>
            <span className={styles.skeleton} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={styles.metrics}>
      <Metric label="Critical" value={counts.critical} tone={counts.critical > 0 ? "critical" : null} />
      <Metric label="Warning" value={counts.warning} tone={counts.warning > 0 ? "warning" : null} />
      <Metric label="Open" value={counts.open} tone={counts.open > 0 ? "open" : null} />
      <Metric label="Total" value={counts.total} />
    </div>
  );
}

function FilterControls({ filters, setFilter, onClear, onSearch, searchQuery }) {
  const [localSearch, setLocalSearch] = useState(searchQuery || "");

  const activeFilters = useMemo(() => {
    const active = [];
    if (filters.severity) active.push(`Severity: ${SEV_TOKENS[filters.severity]?.label ?? filters.severity}`);
    if (filters.status) active.push(`Status: ${STATUS_LABELS[filters.status] ?? filters.status}`);
    if (filters.priority) active.push(`Priority: P${filters.priority}`);
    if (localSearch) active.push(`Search: "${localSearch}"`);
    return active;
  }, [filters.severity, filters.status, filters.priority, localSearch]);

  const submitSearch = (event) => {
    event.preventDefault();
    onSearch(localSearch);
  };

  return (
    <div className={styles.filters}>
      <form className={styles.searchField} onSubmit={submitSearch} role="search">
        <label className={styles.fieldLabel} htmlFor="incident-search">Search</label>
        <div className={styles.fieldRow}>
          <input
            id="incident-search"
            className={`${styles.input} tap-target`}
            type="text"
            value={localSearch}
            onChange={(event) => setLocalSearch(event.target.value)}
            placeholder="Incident or machine name..."
          />
          <button type="submit" className={styles.iconButton} title="Search" aria-label="Search incidents">
            <Search size={14} aria-hidden="true" />
          </button>
          {localSearch && (
            <button
              type="button"
              className={styles.iconButton}
              title="Clear search"
              aria-label="Clear search"
              onClick={() => {
                setLocalSearch("");
                onSearch("");
              }}
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      </form>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="incident-priority">Priority</label>
        <select
          id="incident-priority"
          className={`${styles.select} tap-target`}
          value={filters.priority || "all"}
          onChange={(event) => setFilter("priority", event.target.value)}
        >
          <option value="all">All Priorities</option>
          <option value="1">Priority 1 (High)</option>
          <option value="2">Priority 2</option>
          <option value="3">Priority 3</option>
          <option value="4">Priority 4</option>
          <option value="5">Priority 5 (Low)</option>
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="incident-severity">Severity</label>
        <select
          id="incident-severity"
          className={`${styles.select} tap-target`}
          value={filters.severity || "all"}
          onChange={(event) => setFilter("severity", event.target.value)}
        >
          <option value="all">All Severities</option>
          {SEVERITY_OPTIONS.map((value) => (
            <option key={value} value={value}>{SEV_TOKENS[value].label}</option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="incident-status">Status</label>
        <select
          id="incident-status"
          className={`${styles.select} tap-target`}
          value={filters.status || "all"}
          onChange={(event) => setFilter("status", event.target.value)}
        >
          <option value="all">All Statuses</option>
          {INCIDENT_STATUSES.map((value) => (
            <option key={value} value={value}>{STATUS_LABELS[value]}</option>
          ))}
        </select>
      </div>

      {activeFilters.length > 0 && (
        <button
          className={styles.chipButton}
          onClick={onClear}
          title={`Clear filters: ${activeFilters.join(", ")}`}
        >
          <Filter size={14} aria-hidden="true" />
          Clear filters
        </button>
      )}

      {activeFilters.length > 0 && (
        <div className={styles.activeFilters}>
          {activeFilters.map((filter) => (
            <span key={filter} className={styles.chip}>{filter}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function IncidentsPage() {
  const nightDate = useMemo(() => defaultNightDate(), []);
  const severityFilter = useIncidentFilterStore((s) => s.severity);
  const statusFilter = useIncidentFilterStore((s) => s.status);
  const priorityFilter = useIncidentFilterStore((s) => s.priority);
  const setFilter = useIncidentFilterStore((s) => s.setFilter);
  const clearFilters = useIncidentFilterStore((s) => s.clearFilters);
  const [searchQuery, setSearchQuery] = useState("");

  const filters = useMemo(
    () => ({ severity: severityFilter, status: statusFilter, priority: priorityFilter }),
    [severityFilter, statusFilter, priorityFilter],
  );

  const { data, isLoading, isError, error, refetch } = useIncidents(
    { severity: severityFilter, status: statusFilter },
    { refetchInterval: 60 * 1000 },
  );

  const incidents = useMemo(() => data?.incidents ?? [], [data]);

  // Priority and free-text search are client-side; the server only filters
  // severity / status / date window.
  const filteredIncidents = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return incidents.filter((incident) => {
      const matchesPriority =
        !priorityFilter || String(incident.priority) === String(priorityFilter);
      const matchesSearch =
        !query ||
        [incident.title, incident.incidentId, incident.machine?.name, incident.machineId]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      return matchesPriority && matchesSearch;
    });
  }, [incidents, priorityFilter, searchQuery]);

  const hasFilters = Boolean(severityFilter || statusFilter || priorityFilter || searchQuery);
  const resetAll = () => {
    clearFilters();
    setSearchQuery("");
  };

  return (
    <PageContainer wide>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.headerText}>
            <div className={styles.eyebrow}>Operations · Incident register</div>
            <h1 className={styles.title}>
              <AlertTriangle size={24} aria-hidden="true" />
              Incidents
            </h1>
            <p className={styles.description}>
              Monitor, investigate, and resolve machine anomalies and fault predictions. Open an
              incident for its evidence; the Argus agent workspace lives under Investigations.
            </p>
            <p className={styles.window}>
              <Calendar size={12} aria-hidden="true" />
              <span>Reporting date {nightDate}</span>
              <span aria-hidden="true" className={styles.dot}>·</span>
              <span>Timezone: {REPORTING_TIMEZONE}</span>
            </p>
          </div>

          <Link href="/investigations" className={styles.headerAction}>
            <Search size={12} aria-hidden="true" />
            Open investigations
          </Link>
        </div>

        <MetricsSummary incidents={filteredIncidents} isLoading={isLoading} isError={isError} />

        <FilterControls
          filters={filters}
          setFilter={setFilter}
          onClear={resetAll}
          onSearch={setSearchQuery}
          searchQuery={searchQuery}
        />
      </header>

      <div className={styles.tableCard}>
        <div className={`${styles.tableScroll} table-scroll`}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.columnId} scope="col">ID</th>
                <th className={styles.columnTitle} scope="col">Title</th>
                <th className={styles.columnMachine} scope="col">Machine</th>
                <th className={styles.columnBadge} scope="col">Severity</th>
                <th className={styles.columnBadge} scope="col">Status</th>
                <th className={styles.columnTime} scope="col">Created</th>
                <th className={styles.columnTime} scope="col">Last Seen</th>
                <th className={styles.columnActions} scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className={styles.stateCell} colSpan={8}>
                    <LoadingState
                      label="Loading incidents…"
                      variant="skeleton"
                      rows={5}
                    />
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td className={styles.stateCell} colSpan={8}>
                    <ErrorState
                      title="Could not load incidents"
                      error={error}
                      onRetry={() => refetch()}
                      retryLabel="Retry"
                    />
                  </td>
                </tr>
              ) : filteredIncidents.length === 0 ? (
                <tr>
                  <td className={styles.stateCell} colSpan={8}>
                    {hasFilters ? (
                      <EmptyState
                        icon="search"
                        title="No incidents match the current filters"
                        description="Try clearing filters to see all incidents, or refine your search."
                        action={{
                          label: "Clear filters",
                          onClick: resetAll,
                        }}
                      />
                    ) : (
                      <EmptyState
                        icon="inbox"
                        title="No incidents to display"
                        description="Incidents will appear here once the overnight pipeline has processed them."
                      />
                    )}
                  </td>
                </tr>
              ) : (
                filteredIncidents.map((incident) => (
                  <IncidentRow key={getIncidentId(incident)} incident={incident} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageContainer>
  );
}
