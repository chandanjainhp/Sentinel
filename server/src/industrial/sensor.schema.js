import { z } from "zod";

const sensorType = z.enum([
  "temperature",
  "vibration",
  "pressure",
  "current",
  "voltage",
  "rpm",
  "flow",
]);

export const createSensorSchema = z.object({
  body: z.object({
    sensorId: z.string().trim().min(1).max(100).optional(),
    name: z.string().trim().min(2).max(120),
    type: sensorType,
    unit: z.string().trim().max(30).optional(),
    expectedIntervalSec: z.number().int().min(1).max(86400).optional(),
    samplingRate: z.number().positive().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),

  params: z.object({
    machineId: z.string().min(1),
  }),

  query: z.object({}),
});

export const updateSensorSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      type: sensorType.optional(),
      unit: z.string().trim().max(30).optional(),
      expectedIntervalSec: z.number().int().min(1).max(86400).optional(),
      samplingRate: z.number().positive().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    })
    .strict(),

  params: z.object({
    sensorId: z.string().min(1),
  }),

  query: z.object({}),
});

export const sensorIdSchema = z.object({
  body: z.object({}),

  params: z.object({
    sensorId: z.string().min(1),
  }),

  query: z.object({}),
});

export const machineSensorParamsSchema = z.object({
  body: z.object({}),

  params: z.object({
    machineId: z.string().min(1),
  }),

  query: z.object({}),
});
