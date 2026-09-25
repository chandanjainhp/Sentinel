/** Normalize industrial projectContext from API payloads. */

export function normalizeProjectContext(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const workPackageId = raw.workPackageId ? String(raw.workPackageId) : null;
  const assetId = raw.assetId ? String(raw.assetId) : null;
  if (!workPackageId && !assetId) return null;
  return { workPackageId, assetId };
}

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
    projectContext: normalizeProjectContext(incident.projectContext),
    correlation: incident.correlation || null,
    agentSummary: incident.agentSummary || null,
    explanation,
  };
}

export function uniqueWorkPackages(incidents = []) {
  return new Set(
    incidents
      .map((i) => i.projectContext?.workPackageId)
      .filter(Boolean)
  ).size;
}

export function uniqueAssets(incidents = []) {
  return new Set(
    incidents
      .map((i) => i.projectContext?.assetId)
      .filter(Boolean)
  ).size;
}
