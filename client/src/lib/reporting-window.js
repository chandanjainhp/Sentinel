// Must match server/src/utils/reporting-window.js.
export const REPORTING_TIMEZONE =
  process.env.NEXT_PUBLIC_OVERNIGHT_TIMEZONE || "Asia/Kolkata";
export const OVERNIGHT_END_HOUR =
  [8, 9].includes(Number(process.env.NEXT_PUBLIC_OVERNIGHT_END_HOUR))
    ? Number(process.env.NEXT_PUBLIC_OVERNIGHT_END_HOUR)
    : 9;

export function reportingWindow(nightDate, timeZone, endHour) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nightDate)) return null;
  const [year, month, day] = nightDate.split("-").map(Number);
  const calendarCheck = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarCheck.getUTCFullYear() !== year ||
    calendarCheck.getUTCMonth() !== month - 1 ||
    calendarCheck.getUTCDate() !== day
  ) return null;
  if (timeZone === undefined && endHour === undefined) {
    return { from: calendarCheck, to: new Date(calendarCheck.getTime() + 24 * 60 * 60 * 1000) };
  }
  const zone = timeZone || REPORTING_TIMEZONE;
  const cutoff = endHour === undefined ? OVERNIGHT_END_HOUR : Number(endHour);
  if (![8, 9].includes(cutoff)) return null;
  const localParts = (date) =>
    Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(date)
        .filter(({ type }) => type !== "literal")
        .map(({ type, value }) => [type, Number(value)]),
    );
  const offsetAt = (date) => {
    const p = localParts(date);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime();
  };
  const zoned = (hour) => {
    let instant = new Date(Date.UTC(year, month - 1, day, hour));
    instant = new Date(instant.getTime() - offsetAt(instant));
    return new Date(Date.UTC(year, month - 1, day, hour) - offsetAt(instant));
  };
  const from = zoned(0);
  if (Number.isNaN(from.getTime())) return null;
  return { from, to: zoned(cutoff) };
}

export function previousReportingDate(now = new Date()) {
  const date = new Date(now);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORTING_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const local = Object.fromEntries(parts.filter(({ type }) => type !== "literal").map(({ type, value }) => [type, Number(value)]));
  const yesterday = new Date(Date.UTC(local.year, local.month - 1, local.day - 1));
  return yesterday.toISOString().slice(0, 10);
}

/** Reporting-date label for UI and investigation. */
export function defaultNightDate(now = new Date()) {
  if (process.env.NEXT_PUBLIC_SEED_NIGHT_DATE) {
    return process.env.NEXT_PUBLIC_SEED_NIGHT_DATE;
  }
  return previousReportingDate(now);
}
