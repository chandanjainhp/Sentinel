import { z } from "zod";

const nightDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "nightDate must be YYYY-MM-DD");

export const startInvestigationSchema = z.object({
  body: z.object({
    nightDate,
  }),
  params: z.object({}),
  query: z.object({}),
});

export const investigationIdSchema = z.object({
  body: z.object({}),
  params: z.object({
    investigationId: z.string().min(1),
  }),
  query: z.object({}),
});

export { nightDate as NIGHT_DATE_SCHEMA };
