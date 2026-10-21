import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { startInvestigation, getInvestigation, getIncidents } from "@/lib/api";
import { summarizeInvestigations } from "@/lib/investigation-state";
import { useInvestigationStore } from "@/store/investigationStore";
import { incidentQueryKey } from "@/store/incidentFilterStore";
import { toast } from "sonner";
import { useEffect } from "react";

export function useStartInvestigation(options = {}) {
  const setJobIds = useInvestigationStore((state) => state.setJobIds);
  const setJobStatus = useInvestigationStore((state) => state.setJobStatus);
  const setInvestigationStats = useInvestigationStore(
    (state) => state.setInvestigationStats,
  );

  return useMutation({
    mutationFn: (input) => {
      const nightDate =
        typeof input === "string"
          ? input
          : input?.nightDate ||
            (() => {
              const d = new Date();
              d.setDate(d.getDate() - 1);
              const year = d.getFullYear();
              const month = String(d.getMonth() + 1).padStart(2, "0");
              const day = String(d.getDate()).padStart(2, "0");
              return `${year}-${month}-${day}`;
            })();

      return startInvestigation(nightDate);
    },
    onSuccess: (result, variables, context) => {
      const jobIds = result.jobIds || [];
      setJobIds(jobIds);

      // Server tells us there is nothing to investigate — stay idle.
      if (result.status === "no_incidents") {
        setJobStatus("idle");
        setInvestigationStats({ totalIncidents: 0, resolvedIncidents: 0 });
        toast.success("No incidents to investigate for this night.");
        if (options.onSuccess) options.onSuccess(result, variables, context);
        return;
      }

      setInvestigationStats({
        totalIncidents: result.totalJobs ?? jobIds.length,
        resolvedIncidents: 0,
      });
      if (jobIds.length > 0) setJobStatus("queued");

      const toastMessages = {
        already_running:
          "Investigation already running — polling for status.",
        already_complete: "Night already investigated — loading results.",
      };
      toast.success(
        toastMessages[result.status] || "Investigation protocol initiated.",
      );
      if (options.onSuccess) options.onSuccess(result, variables, context);
    },
    onError: (error, variables, context) => {
      toast.error(
        `Investigation failed to initialize: ${error?.message || String(error) || "Unknown error"}`,
      );
      if (options.onError) options.onError(error, variables, context);
    },
    ...options,
  });
}

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
    queryFn: () => getIncidents({ nightDate }),
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
