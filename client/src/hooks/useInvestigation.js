import { useQueries, useQuery } from "@tanstack/react-query";
import { getInvestigation, getIncidents } from "@/lib/api";
import { summarizeInvestigations } from "@/lib/investigation-state";
import { useInvestigationStore } from "@/store/investigationStore";
import { incidentQueryKey } from "@/store/incidentFilterStore";
import { useEffect } from "react";
import { buildIncidentsListParams } from "@/hooks/useIncidents";

/**
 * Poll every investigation job the night's start call returned.
 *
 * React Query v5 has no query-level onSuccess, so the store is synced from a
 * useEffect over the derived summary primitives (runs once per real change,
 * not once per render). The same documents are returned for the feed, so the
 * panel and the progress counter can never disagree.
 */
export function useNightInvestigations(jobIds = []) {
  const setJobStatus = useInvestigationStore((state) => state.setJobStatus);
  const setInvestigationStats = useInvestigationStore((state) => state.setInvestigationStats);
  const setError = useInvestigationStore((state) => state.setError);

  const queries = useQueries({
    queries: jobIds.map((id) => ({
      queryKey: ["investigation", id],
      queryFn: () => getInvestigation(id),
      enabled: !!id,
      staleTime: 0,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        // Keep polling until the worker records a terminal status.
        return !status || status === "queued" || status === "running" ? 2000 : false;
      },
      retry: (failureCount, error) => {
        if (error?.statusCode === 401 || error?.statusCode === 403 || error?.statusCode === 400) return false;
        if (!error?.statusCode) return failureCount < 2;
        return failureCount < 1;
      },
    })),
  });

  const docs = queries.map((query) => query.data).filter(Boolean);
  const summary = summarizeInvestigations(docs, jobIds.length);

  useEffect(() => {
    setJobStatus(summary.status);
    setInvestigationStats({ totalIncidents: summary.total, resolvedIncidents: summary.resolved });
    setError(summary.failureReason);
  }, [
    summary.status,
    summary.total,
    summary.resolved,
    summary.failureReason,
    setJobStatus,
    setInvestigationStats,
    setError,
  ]);

  return {
    docs,
    summary,
    isLoading: queries.some((query) => query.isLoading),
  };
}

export function useNightSummary(nightDate, options = {}) {
  return useQuery({
    queryKey: ["incidents", incidentQueryKey({ nightDate })],
    queryFn: () => getIncidents(buildIncidentsListParams({ nightDate })),
    select: (data) => {
      const raw = Array.isArray(data) ? data : [];
      const incidents = raw.map((i) => ({
        ...i,
        id: i.id || i._id,
      }));
      return {
        incidents,
        serious: incidents.filter((i) => i.severity === "serious"),
        minor: incidents.filter((i) => i.severity === "minor"),
        harmless: incidents.filter((i) => i.severity === "harmless"),
        uncertain: incidents.filter((i) => i.severity === "uncertain"),
        unclassified: incidents.filter((i) => !i.severity),
      };
    },
    staleTime: 10 * 1000,
    ...options,
  });
}
