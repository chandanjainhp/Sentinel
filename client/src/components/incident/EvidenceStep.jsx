import { memo } from "react";
import { formatToolName } from "@/lib/formatters";

const CONFIDENCE_STYLES = {
  high: {
    background: "var(--sev-harmless-bg)",
    borderColor: "var(--sev-harmless)",
    textColor: "var(--sev-harmless)",
  },
  medium: {
    background: "var(--sev-minor-bg)",
    borderColor: "var(--sev-minor)",
    textColor: "var(--sev-minor)",
  },
  low: {
    background: "var(--sev-serious-bg)",
    borderColor: "var(--sev-serious-dim)",
    textColor: "var(--sev-serious)",
  },
  uncertain: {
    background: "var(--sev-unknown-bg)",
    borderColor: "var(--border-default)",
    textColor: "var(--sev-unknown)",
  },
};

const normalizeConfidence = (confidence) => {
  const normalized = (confidence || "").toLowerCase();
  if (normalized === "high" || normalized === "medium" || normalized === "low" || normalized === "uncertain") {
    return normalized;
  }
  return "uncertain";
};

const getConfidenceLabel = (confidence) => {
  if (confidence === "uncertain") return "UNCERTAIN";
  return confidence.toUpperCase() + " CONFIDENCE";
};

function EvidenceStep({ step, finding, source, confidence, isLast, isFirst }) {
  const normalizedConfidence = normalizeConfidence(confidence);
  const confidenceStyles = CONFIDENCE_STYLES[normalizedConfidence];
  const circleSize = isLast ? 28 : 24;

  return (
    <div style={{ display: "flex", flexDirection: "row" }}>
      <div
        style={{
          width: "32px",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            width: circleSize + "px",
            height: circleSize + "px",
            borderRadius: "50%",
            background: confidenceStyles.background,
            border: "1px solid " + confidenceStyles.borderColor,
            color: confidenceStyles.textColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "10px",
            fontFamily: "monospace",
            fontWeight: 600,
            lineHeight: 1,
          }}
          aria-label={isFirst ? "First evidence step" : "Evidence step"}
        >
          {step}
        </div>

        {!isLast && (
          <div
            style={
              normalizedConfidence === "uncertain"
                ? {
                    width: "2px",
                    flex: 1,
                    marginLeft: "11px",
                    borderLeft: "2px dashed #2a3347",
                    background: "transparent",
                  }
                : {
                    width: "2px",
                    flex: 1,
                    marginLeft: "11px",
                    background: "#2a3347",
                  }
            }
          />
        )}
      </div>

      <div
        style={{
          marginLeft: "12px",
          paddingBottom: isLast ? "0" : "20px",
          flex: 1,
        }}
      >
        <div
          style={{
            fontSize: "10px",
            fontFamily: "monospace",
            color: "#4a5568",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {formatToolName(source)}
        </div>

        <p
          style={{
            marginTop: "4px",
            fontSize: isLast ? "13px" : "12px",
            fontWeight: isLast ? 500 : 400,
            color: "#e2e8f0",
            lineHeight: 1.6,
          }}
        >
          {finding}
        </p>

        <div
          style={{
            marginTop: "4px",
            fontSize: "10px",
            fontFamily: "monospace",
            color: confidenceStyles.textColor,
            textTransform: "uppercase",
          }}
        >
          {getConfidenceLabel(normalizedConfidence)}
        </div>
      </div>
    </div>
  );
}

export default memo(EvidenceStep);
