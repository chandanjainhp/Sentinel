import { z } from "zod";
import { SENSOR_TYPES } from "../utils/onboarding.js";

const name = z.string().trim().min(2).max(100);
const sensor = z.object({
  name,
  type: z.enum(SENSOR_TYPES),
});

export const createOnboardingSchema = z.object({
  body: z.object({
    existingSiteId: z.string().optional(),
    site: z.object({
      name,
      country: z.string().trim().min(2).max(3),
      postalCode: z.string().trim().max(20).nullable().optional(),
      city: z.string().trim().min(1).max(100),
      timezone: z.string().trim().min(1).default("UTC"),
      cityVerified: z.boolean().default(false),
    }).optional(),
    machine: z.object({ name }).strict(),
    sensors: z.array(sensor).min(1).max(100),
  }).strict(),
  params: z.object({}),
  query: z.object({}),
});
