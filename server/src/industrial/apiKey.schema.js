import { z } from "zod";

const keyName = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(64, "Name must be 64 characters or fewer");

export const createApiKeySchema = z.object({
  body: z.object({
    name: keyName,
  }),
  params: z.object({}),
  query: z.object({}),
});

export const apiKeyIdSchema = z.object({
  body: z.object({}),
  params: z.object({
    keyId: z.string().min(1),
  }),
  query: z.object({}),
});

export const renameApiKeySchema = z.object({
  body: z.object({
    name: keyName,
  }),
  params: z.object({
    keyId: z.string().min(1),
  }),
  query: z.object({}),
});
