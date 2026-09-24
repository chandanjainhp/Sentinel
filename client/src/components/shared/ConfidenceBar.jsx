"use client";

import { memo } from "react";
import { formatConfidence } from "@/lib/formatters";

const getToneClasses = (value) => {
  if (value === null || value === undefined)
    return { bar: "bg-text-muted", text: "text-text-muted" };
  if (value > 0.8)
    return { bar: "bg-severity-harmless", text: "text-severity-harmless" };
  if (value >= 0.5)
    return { bar: "bg-severity-minor", text: "text-severity-minor" };
  if (value >= 0.3) return { bar: "bg-orange-500", text: "text-orange-500" };
  return { bar: "bg-severity-serious", text: "text-severity-serious" };
};

const getWidthClass = (value) => {
  if (value <= 0) return "w-0";
  if (value <= 0.1) return "w-[10%]";
  if (value <= 0.2) return "w-[20%]";
  if (value <= 0.3) return "w-[30%]";
  if (value <= 0.4) return "w-[40%]";
  if (value <= 0.5) return "w-1/2";
  if (value <= 0.6) return "w-[60%]";
  if (value <= 0.7) return "w-[70%]";
  if (value <= 0.8) return "w-[80%]";
  if (value <= 0.9) return "w-[90%]";
  return "w-full";
};

const ConfidenceBar = memo(({ confidence, showLabel = true, size = "sm" }) => {
  const isUnknown = confidence === null || confidence === undefined;
  const value = isUnknown ? 0.5 : Math.min(1, Math.max(0, confidence));
  const tone = getToneClasses(isUnknown ? null : confidence);
  const widthClass = getWidthClass(value);
  const trackHeight = size === "md" ? "h-1.5" : "h-1";

  const { label } = isUnknown
    ? { label: "Confidence unknown" }
    : formatConfidence(confidence);

  return (
    <div className="w-full flex flex-col gap-1">
      <div
        className={`w-full ${trackHeight} bg-surface-3 rounded-full overflow-hidden`}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${tone.bar} ${widthClass}`}
        />
      </div>

      {showLabel && (
        <span
          className={`font-mono text-[10px] uppercase tracking-widest ${tone.text}`}
        >
          {label}
        </span>
      )}
    </div>
  );
});

ConfidenceBar.displayName = "ConfidenceBar";

export default ConfidenceBar;
