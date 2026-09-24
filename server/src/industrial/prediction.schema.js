import { z } from "zod";

const predictionQuery = z
  .object({
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

export const machinePredictionsSchema = z.object({
  body: z.object({}),

  params: z.object({
    machineId: z.string().min(1),
  }),

  query: predictionQuery,
});

export const predictionIdSchema = z.object({
  body: z.object({}),

  params: z.object({
    predictionId: z.string().min(1),
  }),

  query: z.object({}),
});
