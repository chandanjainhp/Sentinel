import { memo } from "react";
import { getSeverity } from "@/lib/severity";

function SeverityBadge({ severity }) {
  const s = getSeverity(severity);
  const Icon = s.icon;

  return (
    <span style={{
      background: s.bg,
      border: `1px solid ${s.dim}`,
      color: s.token,
      fontSize: "10px",
      fontFamily: "var(--font-mono)",
      fontWeight: 600,
      letterSpacing: "0.08em",
      padding: "3px 8px",
      borderRadius: "4px",
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
    }}>
      <Icon size={12} aria-hidden="true" />
      {s.label.toUpperCase()}
    </span>
  );
}

export default memo(SeverityBadge);
