import { create } from 'zustand';

/**
 * Incident list filters. Only fields the server actually filters on
 * (see incident.service getIncidents) plus nightDate, which useIncidents
 * converts to a createdAt from/to window.
 */
export const useIncidentFilterStore = create((set) => ({
  nightDate: null,
  severity: null,
  status: null,
  priority: null,

  setFilter: (key, value) =>
    set((state) => ({
      [key]: value === '' || value === 'all' ? null : value,
    })),

  setFilters: (partial) =>
    set((state) => {
      const next = { ...state };
      for (const [key, value] of Object.entries(partial || {})) {
        if (
          [
            'nightDate',
            'severity',
            'status',
            'priority',
          ].includes(key)
        ) {
          next[key] = value === '' || value === 'all' ? null : value;
        }
      }
      return next;
    }),

  clearFilters: () =>
    set({
      severity: null,
      status: null,
      priority: null,
    }),
}));

/** Stable query-key slice from filter store / filter object. */
export function incidentQueryKey(filters = {}) {
  return {
    nightDate: filters.nightDate || null,
    severity: filters.severity || null,
    status: filters.status || null,
  };
}
