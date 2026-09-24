import { AlertTriangle, Circle, CheckCircle, HelpCircle } from "lucide-react";

export const SEV_TOKENS = {
  serious: {
    token: "var(--sev-serious)",
    bg: "var(--sev-serious-bg)",
    dim: "var(--sev-serious-dim)",
    icon: AlertTriangle,
    label: "Serious",
    order: 0,
  },
  minor: {
    token: "var(--sev-minor)",
    bg: "var(--sev-minor-bg)",
    dim: "var(--sev-minor-dim)",
    icon: Circle,
    label: "Minor",
    order: 1,
  },
  harmless: {
    token: "var(--sev-harmless)",
    bg: "var(--sev-harmless-bg)",
    dim: "var(--sev-harmless-dim)",
    icon: CheckCircle,
    label: "Harmless",
    order: 2,
  },
  uncertain: {
    token: "var(--sev-unknown)",
    bg: "var(--sev-unknown-bg)",
    dim: "var(--border-default)",
    icon: HelpCircle,
    label: "Uncertain",
    order: 3,
  },
};

export const getSeverity = (value) => SEV_TOKENS[value] ?? SEV_TOKENS.uncertain;
