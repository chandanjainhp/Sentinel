const DEFAULT_TIMEZONE = process.env.OVERNIGHT_TIMEZONE || "Asia/Kolkata";
const configuredEndHour = Number(process.env.OVERNIGHT_END_HOUR || 9);

export const REPORTING_TIMEZONE = DEFAULT_TIMEZONE;
export const OVERNIGHT_END_HOUR = [8, 9].includes(configuredEndHour)
  ? configuredEndHour
  : 9;

const partsFor = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(({ type }) => type !== "literal").map(({ type, value }) => [type, Number(value)]));
};

const offsetAt = (date, timeZone) => {
  const p = partsFor(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime();
};

/** Convert a wall-clock time in an IANA zone into its UTC instant. */
export const zonedDateTimeToUtc = (date, hour, timeZone = REPORTING_TIMEZONE) => {
  const [year, month, day] = date.split("-").map(Number);
  let instant = new Date(Date.UTC(year, month - 1, day, hour, 0, 0));
  instant = new Date(instant.getTime() - offsetAt(instant, timeZone));
  instant = new Date(Date.UTC(year, month - 1, day, hour, 0, 0) - offsetAt(instant, timeZone));
  return instant;
};

export const localDateFor = (instant = new Date(), timeZone = REPORTING_TIMEZONE) => {
  const p = partsFor(new Date(instant), timeZone);
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
};

export function reportingWindow(reportingDate, timeZone, endHour) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportingDate)) return null;
  const [year, month, day] = reportingDate.split("-").map(Number);
  const calendarCheck = new Date(Date.UTC(year, month - 1, day));
  if (calendarCheck.getUTCFullYear() !== year || calendarCheck.getUTCMonth() !== month - 1 || calendarCheck.getUTCDate() !== day) return null;
  // Legacy investigation callers pass only a date; retain their full UTC-day
  // semantics while the health checker always supplies site zone and cutoff.
  if (timeZone === undefined && endHour === undefined) {
    const from = calendarCheck;
    return { from, to: new Date(from.getTime() + 24 * 60 * 60 * 1000) };
  }
  const zone = timeZone || REPORTING_TIMEZONE;
  const cutoff = endHour === undefined ? OVERNIGHT_END_HOUR : Number(endHour);
  if (![8, 9].includes(cutoff)) return null;
  const start = zonedDateTimeToUtc(reportingDate, 0, zone);
  const end = zonedDateTimeToUtc(reportingDate, cutoff, zone);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
  return { from: start, to: end, reportingDate, timeZone: zone, endHour: cutoff };
}

export const currentReportingWindow = (now = new Date(), timeZone = REPORTING_TIMEZONE, endHour = OVERNIGHT_END_HOUR) =>
  reportingWindow(localDateFor(now, timeZone), timeZone, endHour);

export const previousReportingDate = (now = new Date(), timeZone = REPORTING_TIMEZONE) => {
  const date = new Date(zonedDateTimeToUtc(localDateFor(now, timeZone), 0, timeZone));
  date.setUTCDate(date.getUTCDate() - 1);
  return localDateFor(date, timeZone);
};

export function defaultNightDate(now = new Date()) {
  return previousReportingDate(now, REPORTING_TIMEZONE);
}
