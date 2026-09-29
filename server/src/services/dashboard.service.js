import { Machine } from "../models/machine.model.js";
import { Site } from "../models/site.model.js";
import { Incident } from "../models/incident.model.js";
import { Prediction } from "../models/prediction.model.js";
import { WARNING_ANOMALY_SCORE } from "./ml-contract.service.js";

/**
 * Dashboard aggregation — every number the /overview stats band shows is
 * computed HERE, server-side, from real records. The client never invents,
 * mocks or derives counts; it renders what this service returns.
 *
 * Sources (all deterministic, all user-scoped via the passed filter):
 *   - Machine.status        → healthy/warning/critical/offline/unknown counts
 *                             (set by machine-health.service.js from ML scores)
 *   - Incident (open)       → active incidents + "open incidents" list
 *   - Prediction.latest     → predicted-risk tile (max anomalyScore among
 *                             scored predictions; scored = numeric anomalyScore)
 *
 * No magic numbers: the warning threshold comes from the ML contract.
 */

const round2 = (n) => Math.round(n * 100) / 100;

/** Age string for an incident, from now (server clock). */
const formatAge = (date) => {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
};

export const getDashboardSummary = async (userFilter = {}) => {
  const [machines, sites, openIncidents, latestPredictions] = await Promise.all([
    Machine.find(userFilter).select("status siteId name assetId machineType").lean(),
    Site.find(userFilter).sort({ createdAt: 1 }).lean(),
    Incident.find({ ...userFilter, status: { $in: ["open", "reviewed"] } })
      .sort({ createdAt: -1 })
      .populate("machineId", "name assetId")
      .lean(),
    // Latest scored prediction per machine — $sort into $group keeps the
    // most recent doc per machineId.
    Prediction.aggregate([
      { $match: { ...userFilter, anomalyScore: { $type: "number" } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$machineId",
          anomalyScore: { $first: "$anomalyScore" },
          faultProbability: { $first: "$faultProbability" },
          faultType: { $first: "$faultType" },
          createdAt: { $first: "$createdAt" },
        },
      },
    ]),
  ]);

  // ---- Fleet health counts (from Machine.status, deterministic) ----
  const byStatus = { healthy: 0, warning: 0, critical: 0, offline: 0, unknown: 0 };
  const siteRollups = new Map();

  const ensureRollup = (siteId) => {
    if (!siteRollups.has(siteId)) {
      siteRollups.set(siteId, {
        total: 0,
        healthy: 0,
        warning: 0,
        critical: 0,
        offline: 0,
        unknown: 0,
      });
    }
    return siteRollups.get(siteId);
  };

  for (const m of machines) {
    const key = byStatus[m.status] !== undefined ? m.status : "unknown";
    byStatus[key] += 1;

    const siteIdStr = m.siteId ? String(m.siteId) : "unassigned";
    const rollup = ensureRollup(siteIdStr);
    rollup.total += 1;
    rollup[key] += 1;
  }

  // ---- Fleet-wide predicted risk: worst anomaly among latest predictions ----
  const worstPrediction = latestPredictions.reduce(
    (worst, p) => (!worst || p.anomalyScore > worst.anomalyScore ? p : worst),
    null,
  );

  // ---- Sites with health rollups ----
  const fleet = sites.map((site) => {
    const siteIdStr = String(site._id);
    const rollup = siteRollups.get(siteIdStr) || ensureRollup(siteIdStr);
    // Fleet status = worst status present on the site (deterministic order).
    const status =
      rollup.critical > 0 ? "critical"
      : rollup.warning > 0 ? "warning"
      : rollup.total === 0 ? "unknown"
      : rollup.unknown + rollup.offline === rollup.total ? "unknown"
      : "healthy";

    return {
      siteId: site.siteId,
      _id: siteIdStr,
      name: site.name,
      timezone: site.timezone,
      machines: rollup.total,
      healthy: rollup.healthy,
      warning: rollup.warning,
      critical: rollup.critical,
      offline: rollup.offline,
      unknown: rollup.unknown,
      status,
    };
  });

  // ---- Open incidents list ----
  const incidents = openIncidents.slice(0, 10).map((i) => ({
    incidentId: i.incidentId || String(i._id),
    severity: i.severity,
    title: i.title,
    machine: i.machineId
      ? { name: i.machineId.name, assetId: i.machineId.assetId }
      : null,
    createdAt: i.createdAt,
    age: formatAge(i.createdAt),
  }));

  const activeIncidentCount = openIncidents.length;

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      machines: machines.length,
      healthy: byStatus.healthy,
      warning: byStatus.warning,
      critical: byStatus.critical,
      offline: byStatus.offline,
      unknown: byStatus.unknown,
      activeIncidents: activeIncidentCount,
    },
    predictedRisk:
      worstPrediction
        ? {
            anomalyScore: round2(worstPrediction.anomalyScore),
            faultProbability:
              typeof worstPrediction.faultProbability === "number"
                ? round2(worstPrediction.faultProbability)
                : null,
            faultType: worstPrediction.faultType || null,
            machineId: String(worstPrediction._id),
            at: worstPrediction.createdAt,
            level:
              worstPrediction.anomalyScore >= WARNING_ANOMALY_SCORE
                ? "warning"
                : "healthy",
          }
        : null,
    fleet,
    incidents,
  };
};
