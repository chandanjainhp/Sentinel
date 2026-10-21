import { z } from "zod";

const nightDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "nightDate must be YYYY-MM-DD")
  // Reject impossible dates (2026-02-31): new Date() rolls them into the next
  // month, which would silently investigate a different night.
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "nightDate must be a real calendar date");

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
