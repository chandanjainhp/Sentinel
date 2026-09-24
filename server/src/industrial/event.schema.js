import { z } from "zod";

const sensorValuesSchema = z
  .record(z.string(), z.number().finite())
  .refine(
    (values) => Object.keys(values).length > 0,
    {
      message: "At least one sensor value is required",
    }
  );

export const ingestEventSchema = z.object({
  body: z.object({
    siteId: z.string().min(1),
    machineId: z.string().min(1),
    sensorId: z.string().min(1),

    type: z
      .enum([
        "sensor_reading",
        "equipment_anomaly",
        "machine_state_change",
      ])
      .default("sensor_reading"),

    timestamp: z.coerce.date(),
    values: sensorValuesSchema,

    rawData: z
      .record(z.string(), z.unknown())
      .optional(),

    source: z
      .enum([
        "api",
        "edge",
        "gateway",
        "opcua",
        "mqtt",
        "manual",
      ])
      .default("api"),
  }),

  params: z.object({}),

  query: z.object({}),
});
