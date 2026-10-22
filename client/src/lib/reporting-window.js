// Must match server/src/utils/reporting-window.js.
export const REPORTING_TIMEZONE = "UTC";

export function reportingWindow(nightDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nightDate)) return null;
  const [year, month, day] = nightDate.split("-").map(Number);
  const from = new Date(`${nightDate}T00:00:00.000Z`);
  if (
    Number.isNaN(from.getTime()) ||
    from.getUTCFullYear() !== year ||
    from.getUTCMonth() !== month - 1 ||
    from.getUTCDate() !== day
  ) return null;
  return { from, to: new Date(from.getTime() + 24 * 60 * 60 * 1000) };
}

export function previousReportingDate(now = new Date()) {
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/** Night label for UI and investigation — matches NEXT_PUBLIC_SEED_NIGHT_DATE when set. */
export function defaultNightDate(now = new Date()) {
  if (process.env.NEXT_PUBLIC_SEED_NIGHT_DATE) {
    return process.env.NEXT_PUBLIC_SEED_NIGHT_DATE;
  }
  return previousReportingDate(now);
}
