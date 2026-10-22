import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getIncidents,
  getIncidentById,
  getIncidentEvidenceGraph,
  explainIncident,
} from "@/lib/api";
import { normalizeIncident } from "@/lib/projectContext";
import { incidentQueryKey } from "@/store/incidentFilterStore";
import { reportingWindow } from "@/lib/reporting-window";

function normalizeList(data) {
  const raw = Array.isArray(data)
    ? data
    : Array.isArray(data?.incidents)
      ? data.incidents
      : Array.isArray(data?.data)
        ? data.data
        : [];
  return raw.map(normalizeIncident).filter(Boolean);
}

function bucket(incidents) {
  // Server severity vocabulary (Incident model enum):
  // critical | warning | minor | unknown. The old client-side
  // serious/minor/harmless/uncertain buckets never matched what the
  // pipeline emits, which left the Events Timeline empty.
  return {
    incidents,
    critical: incidents.filter((i) => i.severity === "critical"),
    warning: incidents.filter((i) => i.severity === "warning"),
    minor: incidents.filter((i) => i.severity === "minor"),
    unknown: incidents.filter((i) => !i.severity || i.severity === "unknown"),
    pending: incidents.filter(
      (i) => i.status !== "resolved" && i.status !== "complete" && i.status !== "closed",
    ),
  };
}

/**
 * Query params for GET /incidents from filter state.
 *
 * nightDate is optional: when set, the server filters on createdAt from/to.
 * The main incidents table omits it so open incidents match the dashboard;
 * overnight investigation and EventPanel pass nightDate explicitly.
 */
export function buildIncidentsListParams(filters = {}) {
  const key = incidentQueryKey(filters);

  const nightWindow = key.nightDate
    ? (() => {
        const window = reportingWindow(key.nightDate);
        if (!window) return {};
        const { from, to } = window;
        // The API's `to` filter is inclusive; send the last millisecond of the
        // UTC calendar day so the next midnight is not included.
        return { from: from.toISOString(), to: new Date(to.getTime() - 1).toISOString() };
      })()
    : {};

  return {
    severity: key.severity || undefined,
    status: key.status || undefined,
    ...nightWindow,
  };
}

export function useIncidents(filters = {}, options = {}) {
  const key = incidentQueryKey(filters);

  return useQuery({
    queryKey: ["incidents", key],
    queryFn: () => getIncidents(buildIncidentsListParams(filters)),
    select: (data) => bucket(normalizeList(data)),
    staleTime: 15 * 1000,
    retry: (failureCount, error) => {
      if (error?.statusCode === 401 || error?.statusCode === 403) return false;
      if (!error?.statusCode) return failureCount < 2;
      return failureCount < 1;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    ...options,
  });
}

export function useIncidentById(id, options = {}) {
  return useQuery({
    queryKey: ["incidents", "byId", id],
    queryFn: () => getIncidentById(id),
    select: (data) => normalizeIncident(data),
    enabled: !!id,
    staleTime: 0,
    ...options,
  });
}

export function useIncidentEvidenceGraph(id, options = {}) {
  return useQuery({
    queryKey: ["incidents", "byId", id, "evidence-graph"],
    queryFn: () => getIncidentEvidenceGraph(id),
    enabled: !!id,
    ...options,
  });
}

/**
 * Ask Argus to (re-)explain this incident. The server enqueues a job; the
 * card refetches the incident a few seconds later to pick up the result.
 */
export function useIncidentExplain(id, options = {}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => explainIncident(id),
    ...options,
  });
  const regenerate = (...args) => {
    const result = mutation.mutate(...args);
    // Best-effort refetch chain; each refetch is cheap and the last one wins.
    setTimeout(() => queryClient.invalidateQueries({ queryKey: ["incidents", "byId", id] }), 4000);
    setTimeout(() => queryClient.invalidateQueries({ queryKey: ["incidents", "byId", id] }), 10000);
    return result;
  };
  return { ...mutation, regenerate };
}
