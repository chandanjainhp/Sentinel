"use client";

import { Search } from "lucide-react";
import styles from "./investigation.module.css";

/**
 * No live job and no recorded results: explain the two ways in (pick an
 * incident with saved results, or start the night's investigation).
 */
export default function InvestigationEmptyState({ nightDate, onStart, isStarting }) {
  return (
    <div className={styles.state}>
      <Search size={20} className={styles.stateIcon} aria-hidden="true" />
      <span className={styles.stateTitle}>No investigation to show</span>
      <p className={styles.stateText}>
        No investigation is running for {nightDate} and the selected incident has no saved
        results. Pick an incident above, or start the AI agent protocol to analyse the overnight
        events.
      </p>
      {onStart && (
        <button
          className="tap-target"
          onClick={() => onStart()}
          disabled={isStarting}
          style={{
            padding: "8px 18px",
            border: "1px solid var(--accent)",
            borderRadius: "2px",
            background: "transparent",
            color: "var(--accent)",
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            fontWeight: 600,
            textTransform: "uppercase",
            cursor: isStarting ? "not-allowed" : "pointer",
            opacity: isStarting ? 0.6 : 1,
          }}
        >
          {isStarting ? "Initiating…" : "Start Investigation"}
        </button>
      )}
    </div>
  );
}
