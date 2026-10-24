"use client";

import styles from "./investigation.module.css";

const LABELS = {
  queued: "Queued",
  running: "Running",
  complete: "Complete",
  idle: "Idle",
};

/** Progress for the night's queued investigation jobs. */
export default function ActiveJobBanner({ jobStatus, stats }) {
  const total = stats?.totalIncidents ?? 0;
  const resolved = stats?.resolvedIncidents ?? 0;
  const percent = total > 0 ? Math.min(100, (resolved / total) * 100) : 0;
  const active = jobStatus === "queued" || jobStatus === "running";

  return (
    <div className={styles.banner}>
      <div className={styles.bannerRow}>
        <span className={styles.bannerLabel}>
          <span
            aria-hidden="true"
            className={`${styles.bannerDot} ${
              active ? styles.bannerDotRunning : jobStatus === "complete" ? styles.bannerDotDone : styles.bannerDotIdle
            }`}
          />
          {LABELS[jobStatus] ?? jobStatus}
        </span>
        <span className={styles.bannerStat}>
          {resolved}/{total} incidents classified
        </span>
      </div>
      <div
        className={styles.progressTrack}
        role="progressbar"
        aria-label="Investigation progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={resolved}
      >
        <div className={styles.progressBar} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
