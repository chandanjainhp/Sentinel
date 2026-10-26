import { z } from "zod";
import { isValidTimeZone } from "../utils/monitoring-window.js";

const timezone = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine(isValidTimeZone, "timezone must be a valid IANA time zone");

const coordinatesSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  })
  .nullable()
  .optional();

export const createSiteSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(500).optional(),
    industry: z.string().trim().max(100).optional(),
    timezone: timezone.default("UTC"),
    coordinates: coordinatesSchema,
  }),
  params: z.object({}),
  query: z.object({}),
});

export const updateSiteSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      description: z.string().trim().max(500).optional(),
      industry: z.string().trim().max(100).optional(),
      timezone: timezone.optional(),
      monitoringEnabled: z.boolean().optional(),
      monitoringStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
      monitoringEndTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
      coordinates: coordinatesSchema,
      status: z.enum(["active", "inactive", "maintenance"]).optional(),
    })
    .strict(),

  params: z.object({
    siteId: z.string().min(1),
  }),

  query: z.object({}),
});

export const siteIdSchema = z.object({
  body: z.object({}),

  params: z.object({
    siteId: z.string().min(1),
  }),

  query: z.object({}),
});
