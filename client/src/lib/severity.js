import { AlertTriangle, AlertCircle, Circle, CheckCircle, HelpCircle } from "lucide-react";

export const SEV_TOKENS = {
  // Server vocabulary (Incident model enum: critical | warning | minor | unknown).
  // critical → red/danger tone, warning → amber tone (theme aliases
  // --danger/--warning already point at these same tokens).
  critical: {
    token: "var(--sev-serious)",
    bg: "var(--sev-serious-bg)",
    dim: "var(--sev-serious-dim)",
    icon: AlertTriangle,
    label: "Critical",
    order: 0,
  },
  warning: {
    token: "var(--sev-minor)",
    bg: "var(--sev-minor-bg)",
    dim: "var(--sev-minor-dim)",
    icon: AlertCircle,
    label: "Warning",
    order: 1,
  },
  minor: {
    token: "var(--sev-minor)",
    bg: "var(--sev-minor-bg)",
    dim: "var(--sev-minor-dim)",
    icon: Circle,
    label: "Minor",
    order: 2,
  },
  harmless: {
    token: "var(--sev-harmless)",
    bg: "var(--sev-harmless-bg)",
    dim: "var(--sev-harmless-dim)",
    icon: CheckCircle,
    label: "Harmless",
    order: 3,
  },
  serious: {
    // Legacy client-side name; no server payload emits it. Kept so old
    // cached/local data still renders sensibly.
    token: "var(--sev-serious)",
    bg: "var(--sev-serious-bg)",
    dim: "var(--sev-serious-dim)",
    icon: AlertTriangle,
    label: "Serious",
    order: 4,
  },
  unknown: {
    token: "var(--sev-unknown)",
    bg: "var(--sev-unknown-bg)",
    dim: "var(--border-default)",
    icon: HelpCircle,
    label: "Unknown",
    order: 5,
  },
  uncertain: {
    token: "var(--sev-unknown)",
    bg: "var(--sev-unknown-bg)",
    dim: "var(--border-default)",
    icon: HelpCircle,
    label: "Uncertain",
    order: 6,
  },
};

export const getSeverity = (value) => SEV_TOKENS[value] ?? SEV_TOKENS.uncertain;
