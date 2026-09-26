/** Incident normalization helpers. */

export function normalizeIncident(incident) {
  if (!incident || typeof incident !== 'object') return incident;
  const id = incident.id || incident._id?.toString?.() || incident._id || null;
  const rawExplanation = incident.explanation || null;
  const explanation = rawExplanation
    ? {
        summary: rawExplanation.summary ?? '',
        likelyCause: rawExplanation.likelyCause ?? '',
        recommendedAction: rawExplanation.recommendedAction ?? '',
        urgency: rawExplanation.urgency ?? 'monitor',
        source: rawExplanation.source ?? null,
        provider: rawExplanation.provider ?? null,
        model: rawExplanation.model ?? null,
        status: rawExplanation.status ?? 'pending',
        generatedAt: rawExplanation.generatedAt ?? null,
      }
    : null;
  return {
    id,
    _id: id,
    incidentId: incident.incidentId || id,
    title: incident.title,
    description: incident.description,
    severity: incident.severity || 'uncertain',
    status: incident.status,
    priority: incident.priority,
    nightDate: incident.nightDate,
    machineId: incident.machineId || null,
    machine: incident.machine || null,
    correlation: incident.correlation || null,
    agentSummary: incident.agentSummary || null,
    explanation,
  };
}

/**
 * Distinct machines referenced by the given incidents. "Assets" in this
 * build are machines: the Incident model has no projectContext/asset field,
 * so counts derived from projectContext would always be 0.
 */
export function uniqueAssets(incidents = []) {
  const ids = new Set(
    incidents.map((i) => i.machineId).filter(Boolean)
  );
  // Fall back to machine names when only the populated machine doc is present.
  if (ids.size === 0) {
    for (const name of incidents.map((i) => i.machine?.name).filter(Boolean)) {
      ids.add(name);
    }
  }
  return ids.size;
}
