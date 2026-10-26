import { localDateFor, zonedDateTimeToUtc } from "./reporting-window.js";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const validMonitoringTime = (value) =>
  typeof value === "string" && TIME_RE.test(value);

/** True when Intl accepts the value as an IANA time zone. */
export const isValidTimeZone = (value) => {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

/** First upcoming UTC instant at which a daily `startTime` window opens. */
export const nextMonitoringStart = (now, timeZone, startTime) => {
  if (!isValidTimeZone(timeZone) || !validMonitoringTime(startTime)) return null;
  const today = localDateFor(now, timeZone);
  const todayStart = zonedDateTimeToUtc(today, startTime, timeZone);
  if (todayStart > now) return todayStart;
  const tomorrow = localDateFor(
    new Date(zonedDateTimeToUtc(today, "12:00", timeZone).getTime() + 86400000),
    timeZone
  );
  return zonedDateTimeToUtc(tomorrow, startTime, timeZone);
};

const minutes = (value) => {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date: rejects "2026-13-40" style rollover strings. */
const isCalendarDate = (date) => {
  const match = DATE_RE.exec(date);
  if (!match) return false;
  const noon = new Date(`${date}T12:00:00.000Z`);
  return !Number.isNaN(noon.getTime()) && noon.toISOString().slice(0, 10) === date;
};

export const monitoringWindow = (date, timeZone, startTime, endTime) => {
  if (!isCalendarDate(date) || !validMonitoringTime(startTime) || !validMonitoringTime(endTime)) return null;
  // Equal times would mean either a zero-length window or an implicit 24h
  // window; neither is a supported schedule (see IncidentConfiguration).
  if (startTime === endTime) return null;
  const start = zonedDateTimeToUtc(date, startTime, timeZone);
  const endDate = minutes(endTime) > minutes(startTime) ? date : localDateFor(new Date(`${date}T12:00:00Z`).getTime() + 86400000, timeZone);
  const end = zonedDateTimeToUtc(endDate, endTime, timeZone);
  if (!start || !end || end <= start) return null;
  return { from: start, to: end, reportingDate: date, timeZone, startTime, endTime };
};

export const currentMonitoringWindow = (now, timeZone, startTime, endTime) => {
  const date = localDateFor(now, timeZone);
  const today = monitoringWindow(date, timeZone, startTime, endTime);
  if (today && now >= today.from && now < today.to) return today;
  const previousDate = localDateFor(new Date(now.getTime() - 86400000), timeZone);
  const previous = monitoringWindow(previousDate, timeZone, startTime, endTime);
  return previous && now >= previous.from && now < previous.to ? previous : null;
};
