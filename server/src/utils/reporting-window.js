/**
 * Incident reporting is deliberately calendar-based in UTC. Keeping the
 * boundary construction here prevents local-process timezone drift.
 */
export const REPORTING_TIMEZONE = "UTC";

export const reportingWindow = (nightDate) => {
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
};
