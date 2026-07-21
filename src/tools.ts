import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { NOTICE_TYPES } from "./city-record.js";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date in YYYY-MM-DD format");

/** Tool definitions advertised to clients by the ListTools handler. */
export const TOOLS: Tool[] = [
  {
    name: "search_notices",
    description:
      "Full-text search across all NYC City Record notices. Returns recent matching notices sorted by date.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term" },
        limit: { type: "number", description: "Max results (default 25, max 100)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_notices_by_agency",
    description:
      "Get City Record notices published by a specific city agency (partial name match).",
    inputSchema: {
      type: "object",
      properties: {
        agency_name: { type: "string", description: "Agency name or partial name, e.g. 'DCAS', 'Parks'" },
        limit: { type: "number", description: "Max results (default 25, max 100)" },
      },
      required: ["agency_name"],
    },
  },
  {
    name: "get_notices_by_type",
    description:
      "Get notices filtered by type. Valid types: Solicitation, Award, Intent to Award, Intent to Negotiate, Public Hearings, Public Comment, Meeting, Notice, Vendor List, Sale.",
    inputSchema: {
      type: "object",
      properties: {
        notice_type: {
          type: "string",
          enum: [...NOTICE_TYPES],
          description: "Notice type",
        },
        limit: { type: "number", description: "Max results (default 25, max 100)" },
      },
      required: ["notice_type"],
    },
  },
  {
    name: "get_procurement_notices",
    description:
      "Get recent procurement-related notices: solicitations, awards, intent to award, vendor lists. Useful for tracking open contracts and recent awards.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 25, max 100)" },
      },
    },
  },
  {
    name: "get_public_hearings",
    description:
      "Get recent public hearings, public comment periods, and agency meetings from the City Record.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 25, max 100)" },
      },
    },
  },
  {
    name: "get_open_solicitations",
    description:
      "Get active solicitations (RFPs, RFQs, IFBs) where the due date has not yet passed. Sorted by due date ascending — soonest deadlines first.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 25, max 100)" },
      },
    },
  },
  {
    name: "get_notices_by_date_range",
    description: "Get all City Record notices published within a date range.",
    inputSchema: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "Start date, YYYY-MM-DD" },
        end_date: { type: "string", description: "End date, YYYY-MM-DD" },
        limit: { type: "number", description: "Max results (default 50, max 200)" },
      },
      required: ["start_date", "end_date"],
    },
  },
];

/** Argument schemas, one per tool name in TOOLS. */
export const SCHEMAS = {
  search_notices: z.object({
    query: z.string(),
    limit: z.number().max(100).optional(),
  }),
  get_notices_by_agency: z.object({
    agency_name: z.string(),
    limit: z.number().max(100).optional(),
  }),
  get_notices_by_type: z.object({
    notice_type: z.enum(NOTICE_TYPES),
    limit: z.number().max(100).optional(),
  }),
  get_procurement_notices: z.object({ limit: z.number().max(100).optional() }),
  get_public_hearings: z.object({ limit: z.number().max(100).optional() }),
  get_open_solicitations: z.object({ limit: z.number().max(100).optional() }),
  get_notices_by_date_range: z.object({
    start_date: isoDate,
    end_date: isoDate,
    limit: z.number().max(200).optional(),
  }),
} satisfies Record<string, z.ZodTypeAny>;

export type ToolName = keyof typeof SCHEMAS;

export function parseToolArgs<K extends ToolName>(
  name: K,
  args: unknown
): z.infer<(typeof SCHEMAS)[K]> {
  return SCHEMAS[name].parse(args ?? {});
}
