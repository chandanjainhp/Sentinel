import Briefing from "../models/briefing.model.js";
import { Incident } from "../models/incident.model.js";
import Investigation from "../models/investigation.model.js";
import { Machine } from "../models/machine.model.js";
import { ApiError } from "../utils/api-error.js";
import { BRIEFING_SECTIONS, BRIEFING_STATUS } from "../utils/constants.js";

/**
 * Morning Operations Briefing.
 *
 * Generation is deterministic and synchronous: it aggregates the night's
 * incidents, their investigations and the machine names into five sections.
 * No LLM, no queue, no scheduler — there is nothing to leave stuck in
 * "generating", and the same data always produces the same document.
 *
 * One briefing per user per nightDate (enforced by a partial unique index).
 * POST /generate is therefore idempotent: the first call creates it (201),
 * later calls return the same document (200) so a double-click cannot duplicate
 * or overwrite the operator's edits.
 *
 * Approving locks the briefing (409 afterwards). The documented webhook
 * handoff is not dispatched: the webhook subsystem is still dead scaffolding
 * (see docs/audit-fixes.md), so approval only records approvedAt/approvedBy.
 */

const SEVERITY_RANK = { critical: 3, warning: 2, minor: 1, unknown: 0 };

const nightWindow = (nightDate) => {
  const from = new Date(`${nightDate}T00:00:00.000Z`);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return { from, to };
};

const uniqueStrings = (values) => {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
};

const machineLabel = (machine) =>
  machine ? `${machine.name}${machine.assetId ? ` (${machine.assetId})` : ""}` : "Unknown machine";

/**
 * Pure section builder — no I/O, so the document's shape is unit-testable.
 */
export const buildBriefingSections = ({ nightDate, incidents, investigations, machineById }) => {
  const bySeverity = [...incidents].sort(
    (a, b) =>
      (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0) ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const counts = bySeverity.reduce(
    (acc, incident) => {
      acc.total += 1;
      if (incident.status === "open") acc.open += 1;
      if (incident.severity === "critical") acc.critical += 1;
      else if (incident.severity === "warning") acc.warning += 1;
      return acc;
    },
    { total: 0, open: 0, critical: 0, warning: 0 },
  );

  const completedInvestigations = investigations.filter((i) => i.status === "complete");
  const pendingInvestigations = investigations.filter((i) => i.status !== "complete");

  const executiveSummary =
    counts.total === 0
      ? `No incidents were recorded for ${nightDate}. The site reported no threshold breaches overnight — continue normal monitoring.`
      : `${counts.total} incident${counts.total === 1 ? "" : "s"} were recorded for ${nightDate}: ` +
        `${counts.critical} critical, ${counts.warning} warning, ` +
        `${counts.total - counts.critical - counts.warning} minor or unknown. ` +
        `${counts.open} remain open. ` +
        `${completedInvestigations.length} investigation${completedInvestigations.length === 1 ? "" : "s"} completed.`;

  const incidentRows = bySeverity.map((incident) => {
    const machine = machineById.get(String(incident.machineId));
    return {
      incidentId: incident.incidentId,
      title: incident.title,
      severity: incident.severity,
      status: incident.status,
      machine: machine ? machine.name : null,
      assetId: machine?.assetId ?? null,
      occurredAt: incident.createdAt,
    };
  });

  const recommendations = uniqueStrings([
    ...bySeverity.map((incident) => incident.explanation?.recommendedAction),
    ...completedInvestigations.map((i) => i.classification?.recommendedFollowup),
    counts.total === 0 ? "No action required — continue normal monitoring." : null,
  ]);

  const anomalies = bySeverity
    .filter((incident) => incident.evidence && (incident.evidence.anomalyScore != null || incident.evidence.faultType))
    .map((incident) => {
      const machine = machineById.get(String(incident.machineId));
      return {
        incidentId: incident.incidentId,
        machine: machine ? machine.name : null,
        severity: incident.severity,
        anomalyScore: incident.evidence.anomalyScore ?? null,
        faultType: incident.evidence.faultType ?? null,
        at: incident.createdAt,
      };
    });

  const followUp = uniqueStrings([
    ...bySeverity
      .filter((incident) => incident.status === "open")
      .map((incident) => `Review open incident: ${incident.title}`),
    ...bySeverity
      .filter((incident) => incident.explanation?.status !== "ready")
      .map((incident) => `Argus explanation pending for: ${incident.title}`),
    ...pendingInvestigations.map(
      (i) => `Investigation ${i.status} for incident ${String(i.incidentId)}`,
    ),
  ]);

  return [
    { name: BRIEFING_SECTIONS.EXECUTIVE_SUMMARY, content: executiveSummary },
    { name: BRIEFING_SECTIONS.INCIDENTS, content: incidentRows },
    { name: BRIEFING_SECTIONS.RECOMMENDATIONS, content: recommendations },
    { name: BRIEFING_SECTIONS.ANOMALIES, content: anomalies },
    { name: BRIEFING_SECTIONS.FOLLOW_UP, content: followUp },
  ];
};

/** Resolve a public briefingId or a raw ObjectId (same convenience as incidents). */
const findBriefingDoc = async (briefingId) => {
  if (/^[a-f\d]{24}$/i.test(briefingId)) {
    const byId = await Briefing.findById(briefingId);
    if (byId) return byId;
  }
  return Briefing.findOne({ briefingId });
};

const loadOwnedBriefing = async (briefingId, userFilter = {}) => {
  const doc = await findBriefingDoc(briefingId);
  // Missing and other-user records are indistinguishable: 404 for both.
  if (!doc || String(doc.userId) !== String(userFilter.userId)) {
    throw new ApiError(404, "Briefing not found");
  }
  return doc;
};

export const generateBriefing = async ({ userId, nightDate }) => {
  const existing = await Briefing.findOne({ userId, nightDate });
  if (existing) return { briefing: existing, created: false };

  const { from, to } = nightWindow(nightDate);

  const incidents = await Incident.find({ userId, createdAt: { $gte: from, $lt: to } })
    .sort({ createdAt: -1 })
    .lean();

  const machines = incidents.length
    ? await Machine.find({ userId, _id: { $in: incidents.map((i) => i.machineId) } }).lean()
    : [];

  const investigations = incidents.length
    ? await Investigation.find({ incidentId: { $in: incidents.map((i) => i._id) } })
        .select("incidentId status classification")
        .lean()
    : [];

  const machineById = new Map(machines.map((m) => [String(m._id), m]));
  const now = new Date();

  const doc = {
    userId,
    nightDate,
    status: BRIEFING_STATUS.DRAFT,
    sections: buildBriefingSections({ nightDate, incidents, investigations, machineById }),
    metadata: {
      nightDate,
      window: { from: from.toISOString(), to: to.toISOString() },
      counts: {
        incidents: incidents.length,
        investigations: investigations.length,
        machines: machines.length,
      },
      generator: "sentinel-deterministic-v1",
    },
    generatedAt: now,
    generationStartedAt: now,
    generationCompletedAt: now,
  };

  try {
    return { briefing: await Briefing.create(doc), created: true };
  } catch (error) {
    // A concurrent generate won the unique (userId, nightDate) index.
    if (error?.code === 11000) {
      const raced = await Briefing.findOne({ userId, nightDate });
      if (raced) return { briefing: raced, created: false };
    }
    throw error;
  }
};

export const getLatestBriefing = async ({ userId, nightDate }) => {
  const filter = { userId, ...(nightDate ? { nightDate } : {}) };
  return Briefing.findOne(filter).sort({ nightDate: -1, createdAt: -1 });
};

export const listBriefings = async (filters = {}, userFilter = {}) => {
  const { nightDate, status, limit = 20 } = filters;

  const filter = { ...userFilter };
  if (nightDate) filter.nightDate = nightDate;
  if (status) filter.status = status;

  return Briefing.find(filter)
    .sort({ nightDate: -1, createdAt: -1 })
    .limit(Number(limit));
};

export const getBriefingById = async (briefingId, userFilter = {}) =>
  loadOwnedBriefing(briefingId, userFilter);

export const updateBriefingSection = async ({ briefingId, sectionName, content, userFilter }) => {
  const doc = await loadOwnedBriefing(briefingId, userFilter);

  if (doc.status === BRIEFING_STATUS.APPROVED) {
    throw new ApiError(409, "Briefing is approved and can no longer be edited");
  }
  if (doc.status === BRIEFING_STATUS.GENERATING) {
    throw new ApiError(409, "Briefing is still being generated");
  }

  const section = doc.sections.find((s) => s.name === sectionName);
  if (!section) {
    throw new ApiError(400, `Section "${sectionName}" is not part of this briefing`);
  }

  section.content = content;
  section.lastEditedAt = new Date();
  await doc.save();

  return doc;
};

export const approveBriefing = async ({ briefingId, userId, userFilter }) => {
  const doc = await loadOwnedBriefing(briefingId, userFilter);

  if (doc.status === BRIEFING_STATUS.APPROVED) {
    throw new ApiError(409, "Briefing is already approved");
  }
  if (doc.status !== BRIEFING_STATUS.DRAFT) {
    throw new ApiError(409, `Briefing cannot be approved while it is ${doc.status}`);
  }

  doc.status = BRIEFING_STATUS.APPROVED;
  doc.approvedAt = new Date();
  doc.approvedBy = userId;
  await doc.save();

  return doc;
};
