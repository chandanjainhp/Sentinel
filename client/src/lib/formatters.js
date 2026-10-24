import { format, parseISO } from "date-fns";
import { getSeverity } from "@/lib/severity";

/**
 * Safely parses Date or string into Date object.
 */
const safeParse = (dateOrString) => {
  if (!dateOrString) return new Date();
  if (dateOrString instanceof Date) return dateOrString;
  return parseISO(dateOrString);
};

export const formatTime = (dateOrString) => {
  try {
    return format(safeParse(dateOrString), "HH:mm");
  } catch (error) {
    return "--:--";
  }
};

export const formatTimeWithSeconds = (dateOrString) => {
  try {
    return format(safeParse(dateOrString), "HH:mm:ss");
  } catch (error) {
    return "--:--:--";
  }
};

export const formatNightLabel = (dateOrString) => {
  try {
    return `Night of ${format(safeParse(dateOrString), "EEE d MMM")}`;
  } catch (error) {
    return "Night of Unknown";
  }
};

export const formatDuration = (ms) => {
  if (!ms || isNaN(ms) || ms < 0) return "0s";

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

export const formatConfidence = (score) => {
  const value = parseFloat(score);
  if (isNaN(value)) return { label: 'Unknown', colorClass: 'text-slate-400' };

  if (value > 0.8) return { label: 'High', colorClass: 'text-green-400' };
  if (value >= 0.5) return { label: 'Medium', colorClass: 'text-amber-400' };
  if (value >= 0.3) return { label: 'Low', colorClass: 'text-red-400' };
  return { label: 'Very Low', colorClass: 'text-red-600' };
};

export const formatSeverityLabel = (severity) => getSeverity(severity).label;

export const truncateText = (text, maxLength = 120) => {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + "…";
};

export const formatToolName = (toolName) => {
  if (!toolName) return "Executing tool";

  const mappings = {
    "get_overnight_alerts": "Fetching overnight events",
    "submit_classification": "Submitting classification",
    "draft_briefing_section": "Drafting briefing section",
    "get_asset_history": "Reading asset history",
    "get_wp_schedule_status": "Checking work-package schedule",
    "get_shipment_status": "Checking shipment status",
  };

  if (mappings[toolName]) return mappings[toolName];

  // Fallback dynamic parsing for unmapped tools (e.g. "some_random_tool" -> "Some random tool")
  const clean = toolName.replace(/_/g, " ");
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

export const formatAgentFeedSummary = (progressEvent) => {
  if (!progressEvent) return "Unknown sequence";

  const { type } = progressEvent;
  const payload = progressEvent.payload || progressEvent.data || {};

  switch (type) {
    case "tool_called":
      return formatToolName(payload?.toolName);
    case "tool_result":
      return payload?.summary || `Acquired data from system... ${payload?.dataLength ? `${payload.dataLength} bytes` : ""}`.trim();
    case "reasoning":
      return payload?.thought ? truncateText(payload.thought, 70) : "Evaluating data points...";
    case "classification":
      return `Incident classified as: ${formatSeverityLabel(payload?.severity || payload?.classification?.severity)}`;
    case "connected":
      return "Agent connection established.";
    case "complete":
      return "Investigation job finalized.";
    case "failed":
      return `Analysis failed: ${payload?.message || payload?.error || "System error"}`;
    default:
      return "Processing...";
  }
};
