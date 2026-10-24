"use client";

import styles from "./investigation.module.css";

export default function FailedJobBanner({ error, onRetry, isStarting }) {
  return (
    <div className={styles.failBanner} role="alert">
      <span>{error || "Investigation failed."}</span>
      {onRetry && (
        <button className={styles.retryButton} onClick={() => onRetry()} disabled={isStarting}>
          {isStarting ? "Retrying…" : "Retry Investigation"}
        </button>
      )}
    </div>
  );
}
