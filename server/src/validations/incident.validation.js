import { z } from "zod";

const incidentStatus = z.enum([
  "open",
  "reviewed",
  "closed",
]);

const incidentSeverity = z.enum([
  "critical",
  "warning",
  "minor",
  "unknown",
]);

const incidentQuery = z
  .object({
    siteId: z.string().min(1).optional(),

    machineId: z.string().min(1).optional(),

    status: incidentStatus.optional(),

    severity: incidentSeverity.optional(),

    from: z.coerce.date().optional(),

    to: z.coerce.date().optional(),

    limit: z
      .coerce
      .number()
      .int()
      .min(1)
      .max(500)
      .default(100),
  })
  .refine(
    (data) => {
      if (!data.from || !data.to) {
        return true;
      }

      return data.from <= data.to;
    },
    {
      message: "`from` must be before `to`",
      path: ["from"],
    }
  );

export const getIncidentsSchema = z.object({
  body: z.object({}),

  params: z.object({}),

  query: incidentQuery,
});

export const incidentIdSchema = z.object({
  body: z.object({}),

  params: z.object({
    incidentId: z.string().min(1),
  }),

  query: z.object({}),
});

export const updateIncidentStatusSchema = z.object({
  body: z.object({
    status: incidentStatus,
  }),

  params: z.object({
    incidentId: z.string().min(1),
  }),

  query: z.object({}),
});
