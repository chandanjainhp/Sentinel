"use client";

import { memo } from "react";

const SIZE_MAP = {
  sm: 16,
  md: 24,
  lg: 32,
};

function LoadingSpinner({ size = "md", color = "#3b82f6", className = "" }) {
  const dimension = SIZE_MAP[size] || SIZE_MAP.md;
  const wrapperClassName = className || undefined;

  return (
    <div className={wrapperClassName}>
      <style>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>

      <svg
        viewBox="0 0 24 24"
        width={dimension}
        height={dimension}
        style={{ animation: "spin 0.8s linear infinite" }}
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke={color}
          strokeOpacity="0.2"
          strokeWidth="2"
          fill="none"
        />
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke={color}
          strokeWidth="2"
          fill="none"
          strokeDasharray="31.4"
          strokeDashoffset="23.6"
        />
      </svg>
    </div>
  );
}

export default memo(LoadingSpinner);
