"use client";

import EvidenceStep from "@/components/incident/EvidenceStep";

export default function EvidenceChain({ steps, classification }) {
  if (!steps || steps.length === 0) {
    return (
      <div style={{
        padding: "16px", textAlign: "center",
        border: "1px dashed var(--border-default)",
        fontFamily: "var(--font-mono)", fontSize: "10px",
        textTransform: "uppercase", letterSpacing: "0.14em",
        color: "var(--fg-4)",
      }}>
        Evidence chain not yet available
      </div>
    );
  }

  const toConfidenceLevel = (score) => {
    const n = Number(score);
    if (Number.isNaN(n)) return "uncertain";
    if (n >= 0.8) return "high";
    if (n >= 0.5) return "medium";
    if (n > 0)   return "low";
    return "uncertain";
  };

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column" }}>
      {steps.map((stepInfo, idx) => {
        const { step, finding, source, confidence } = stepInfo;
        const isLastStep = !classification && idx === steps.length - 1;
        return (
          <EvidenceStep
            key={idx}
            step={step || idx + 1}
            finding={finding}
            source={source}
            confidence={confidence}
            isFirst={idx === 0}
            isLast={isLastStep}
          />
        );
      })}

      {classification && (
        <EvidenceStep
          step={steps.length + 1}
          source="classify_incident"
          finding={`Assessed as ${classification.severity || "uncertain"} with ${Math.round((classification.confidence || 0) * 100)}% confidence`}
          confidence={toConfidenceLevel(classification.confidence)}
          isFirst={steps.length === 0}
          isLast
        />
      )}
    </div>
  );
}
