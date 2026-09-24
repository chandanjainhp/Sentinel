import { z } from "zod";

const machineStatus = z.enum([
  "healthy",
  "warning",
  "critical",
  "offline",
  "maintenance",
  "unknown",
]);

export const createMachineSchema = z.object({
  body: z.object({
    assetId: z.string().trim().min(1).max(100),
    name: z.string().trim().min(2).max(120),
    machineType: z.string().trim().min(1).max(100),
    manufacturer: z.string().trim().max(100).optional(),
    model: z.string().trim().max(100).optional(),
    serialNumber: z.string().trim().max(100).optional(),
    location: z.string().trim().max(200).optional(),
    zone: z.string().trim().max(100).optional(),
  }),

  params: z.object({
    siteId: z.string().min(1),
  }),

  query: z.object({}),
});

export const updateMachineSchema = z.object({
  body: z
    .object({
      assetId: z.string().trim().min(1).max(100).optional(),
      name: z.string().trim().min(2).max(120).optional(),
      machineType: z.string().trim().min(1).max(100).optional(),
      manufacturer: z.string().trim().max(100).optional(),
      model: z.string().trim().max(100).optional(),
      serialNumber: z.string().trim().max(100).optional(),
      location: z.string().trim().max(200).optional(),
      zone: z.string().trim().max(100).optional(),
      status: machineStatus.optional(),
    })
    .strict(),

  params: z.object({
    machineId: z.string().min(1),
  }),

  query: z.object({}),
});

export const machineIdSchema = z.object({
  body: z.object({}),

  params: z.object({
    machineId: z.string().min(1),
  }),

  query: z.object({}),
});

export const siteMachineParamsSchema = z.object({
  body: z.object({}),

  params: z.object({
    siteId: z.string().min(1),
  }),

  query: z.object({}),
});
