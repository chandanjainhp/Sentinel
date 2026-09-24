"use client";

import { create } from "zustand";
import { devtools } from "zustand/middleware";

// Initial state object for reset capability
const initialState = {
  jobId: null,
  jobIds: [],
  jobStatus: "idle", // 'idle' | 'running' | 'complete' | 'failed'

  investigationStats: {
    totalIncidents: 0,
    resolvedIncidents: 0,
    escalationCount: 0,
    overallConfidence: null,
  },

  error: null,
};

export const useInvestigationStore = create(
  devtools(
    (set, get) => ({
      ...initialState,

      setJobId: (jobId) => set({ jobId }, false, "setJobId"),
      setJobIds: (jobIds = []) => set({ jobIds }, false, "setJobIds"),

      setJobStatus: (status) =>
        set(
          {
            jobStatus: status,
          },
          false,
          "setJobStatus",
        ),

      setInvestigationStats: (stats) =>
        set(
          (state) => ({
            investigationStats: { ...state.investigationStats, ...stats },
          }),
          false,
          "setInvestigationStats",
        ),

      updateProgress: (resolved, total) =>
        set(
          (state) => ({
            investigationStats: {
              ...state.investigationStats,
              resolvedIncidents: resolved,
              totalIncidents: total,
            },
          }),
          false,
          "updateProgress",
        ),

      setError: (error) => set({ error }, false, "setError"),

      resetStore: () => set(initialState, false, "resetStore"),
    }),
    { name: "InvestigationStore" },
  ),
);

// Derived Selectors
export const useIsInvestigating = () =>
  useInvestigationStore(
    (state) =>
      state.jobStatus === "running",
  );

export const useProgressPercent = () =>
  useInvestigationStore((state) => {
    const { resolvedIncidents, totalIncidents } = state.investigationStats;
    if (totalIncidents === 0) return 0;
    return (resolvedIncidents / totalIncidents) * 100;
  });

export const useEscalationCount = () =>
  useInvestigationStore((state) => state.investigationStats.escalationCount);
