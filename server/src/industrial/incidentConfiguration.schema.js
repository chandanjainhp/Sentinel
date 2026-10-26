import { z } from "zod";
import { isValidTimeZone, validMonitoringTime } from "../utils/monitoring-window.js";

const siteId = z.string().trim().min(1).max(200);
const time = z
  .string()
  .trim()
  .refine(validMonitoringTime, "Time must be HH:mm (00:00–23:59)");
const timezone = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine(isValidTimeZone, "timezone must be a valid IANA time zone");

const configurationBody = z
  .object({
    siteId: siteId.optional(),
    enabled: z.boolean().optional(),
    timezone: timezone.optional(),
    startTime: time.optional(),
    endTime: time.optional(),
    scheduleType: z.literal("daily").optional(),
  })
  .strict();

const siteQuery = z.object({ siteId: siteId.optional() });

export const updateIncidentConfigurationSchema = z.object({
  body: configurationBody,
  params: z.object({}),
  query: z.object({}),
});

// Same payload as PUT, but nothing is persisted.
export const validateIncidentConfigurationSchema = z.object({
  body: configurationBody,
  params: z.object({}),
  query: z.object({}),
});

export const getIncidentConfigurationSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: siteQuery,
});

export const getIncidentConfigurationStatusSchema =
  getIncidentConfigurationSchema;
