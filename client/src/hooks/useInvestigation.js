import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { startInvestigation, getInvestigation, getIncidents } from "@/lib/api";
import { useInvestigationStore } from "@/store/investigationStore";
import { incidentQueryKey } from "@/store/incidentFilterStore";
import { toast } from "sonner";
import { useEffect } from "react";

export function useStartInvestigation(options = {}) {
  const setJobId = useInvestigationStore((state) => state.setJobId);
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

      console.log("[MUTATION] Starting investigation for", nightDate);
      return startInvestigation(nightDate);
    },
    onSuccess: (result, variables, context) => {
      console.log("[MUTATION] SUCCESS - Got result:", result);

      if (result.jobIds && result.jobIds.length > 0) {
        console.log("[MUTATION] Setting jobId:", result.jobIds[0]);
        setJobIds(result.jobIds);
        setJobId(result.jobIds[0]);
      } else {
        setJobIds([]);
        setJobId(null);
      }

      // Server tells us there is nothing to investigate — stay idle, don't open SSE.
      if (result.status === "no_incidents") {
        setJobStatus("idle");
        toast.success("No incidents to investigate for this night.");
        if (options.onSuccess) options.onSuccess(result, variables, context);
        return;
      }

      if (result.totalJobs !== undefined) {
        console.log("[MUTATION] Setting stats - totalJobs:", result.totalJobs);
        setInvestigationStats({ totalIncidents: result.totalJobs });
      }

      // Start polling for investigation status
      if (result.jobIds && result.jobIds.length > 0) {
        setJobStatus("running");
      }

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
      console.error("[MUTATION] ERROR raw:", error);
      console.error("[MUTATION] ERROR details:", {
        message: error?.message,
        name: error?.name,
        type: error?.type,
        statusCode: error?.statusCode,
        variables,
      });
      toast.error(
        `Investigation failed to initialize: ${error?.message || String(error) || "Unknown error"}`,
      );
      if (options.onError) options.onError(error, variables, context);
    },
    ...options,
  });
}

export function usePollInvestigationStatus(jobId, options = {}) {
  const queryClient = useQueryClient();
  const setJobStatus = useInvestigationStore((state) => state.setJobStatus);
  const setInvestigationStats = useInvestigationStore((state) => state.setInvestigationStats);

  const { data, isLoading, error } = useQuery({
    queryKey: ["investigation-poll", jobId],
    queryFn: () => getInvestigation(jobId),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 2000; // Initial poll
      if (data.status === 'running' || data.status === 'queued') return 2000; // Poll every 2s while running
      return false; // Stop polling when complete or failed
    },
    onSuccess: (data) => {
      if (data) {
        setJobStatus(data.status);
        // Update stats from investigation data
        if (data.toolCallSequence) {
          setInvestigationStats({
            resolvedIncidents: data.toolCallSequence.length,
            totalIncidents: data.totalToolCalls || data.toolCallSequence.length,
          });
        }
      }
    },
    retry: (failureCount, error) => {
      if (error?.statusCode === 401 || error?.statusCode === 403 || error?.statusCode === 400) return false;
      if (!error?.statusCode) return failureCount < 2;
      return failureCount < 1;
    },
    ...options,
  });

  return { data, isLoading, error };
}

export function useInvestigationData(id, options = {}) {
  return useQuery({
    queryKey: ["investigation", id],
    queryFn: () => getInvestigation(id),
    enabled: !!id,
    staleTime: 0, // Rapidly changing agent states should never cache
    ...options,
  });
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
        projectContext: i.projectContext
          ? {
              workPackageId: i.projectContext.workPackageId || null,
              assetId: i.projectContext.assetId || null,
            }
          : null,
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
