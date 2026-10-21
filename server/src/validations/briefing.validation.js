import { z } from "zod";
import { NIGHT_DATE_SCHEMA } from "../industrial/investigation.schema.js";
import { BRIEFING_SECTIONS, BRIEFING_STATUS } from "../utils/constants.js";

/**
 * Request schemas for /api/v1/briefings.
 *
 * Night dates reuse the investigation validator (YYYY-MM-DD, real calendar
 * date) so a briefing can never be generated for a different night than an
 * investigation would analyse.
 */

const sectionName = z.enum(Object.values(BRIEFING_SECTIONS));
const briefingStatus = z.enum(Object.values(BRIEFING_STATUS));

// A section is either prose (executive summary) or a list of items/strings
// (incidents, recommendations, anomalies, follow-up). List items are bounded
// so an edit cannot turn one section into an unbounded blob.
const sectionContent = z.union([
  z.string().min(1, "Section content cannot be empty").max(8000, "Section content is too long"),
  z
    .array(z.union([z.string().max(2000), z.record(z.string(), z.unknown())]))
    .max(100, "A section cannot hold more than 100 items"),
]);

export const generateBriefingSchema = z.object({
  body: z.object({
    nightDate: NIGHT_DATE_SCHEMA,
  }),
  params: z.object({}),
  query: z.object({}),
});

export const latestBriefingSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    nightDate: NIGHT_DATE_SCHEMA.optional(),
  }),
});

export const listBriefingsSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    nightDate: NIGHT_DATE_SCHEMA.optional(),
    status: briefingStatus.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

export const briefingIdSchema = z.object({
  body: z.object({}),
  params: z.object({
    briefingId: z.string().min(1, "briefingId is required"),
  }),
  query: z.object({}),
});

export const updateBriefingSectionSchema = z.object({
  body: z.object({
    content: sectionContent,
  }),
  params: z.object({
    briefingId: z.string().min(1, "briefingId is required"),
    sectionName,
  }),
  query: z.object({}),
});
