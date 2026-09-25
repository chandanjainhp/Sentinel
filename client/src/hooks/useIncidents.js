import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getIncidents,
  getIncidentById,
  getIncidentEvidenceGraph,
  explainIncident,
} from "@/lib/api";
import { normalizeIncident } from "@/lib/projectContext";
import { incidentQueryKey } from "@/store/incidentFilterStore";

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
  return {
    incidents,
    serious: incidents.filter((i) => i.severity === "serious"),
    minor: incidents.filter((i) => i.severity === "minor"),
    uncertain: incidents.filter((i) => i.severity === "uncertain"),
    harmless: incidents.filter((i) => i.severity === "harmless"),
    unclassified: incidents.filter((i) => !i.severity),
    pending: incidents.filter(
      (i) => i.status !== "resolved" && i.status !== "complete" && i.status !== "closed",
    ),
  };
}

/**
 * @param {object} filters — nightDate, severity, status, workPackageId, assetId
 */
export function useIncidents(filters = {}, options = {}) {
  const key = incidentQueryKey(filters);

  return useQuery({
    queryKey: ["incidents", key],
    queryFn: () =>
      getIncidents({
        nightDate: key.nightDate || undefined,
        severity: key.severity || undefined,
        status: key.status || undefined,
        workPackageId: key.workPackageId || undefined,
        assetId: key.assetId || undefined,
      }),
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
