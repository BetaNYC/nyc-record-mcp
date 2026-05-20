#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  searchNotices,
  getNoticesByAgency,
  getNoticesByType,
  getProcurementNotices,
  getPublicHearings,
  getOpenSolicitations,
  getNoticesByDateRange,
} from "./city-record.js";

const server = new Server(
  { name: "nyc-record-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
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
            enum: [
              "Solicitation",
              "Award",
              "Intent to Award",
              "Intent to Negotiate",
              "Public Hearings",
              "Public Comment",
              "Meeting",
              "Notice",
              "Vendor List",
              "Sale",
            ],
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
      description:
        "Get all City Record notices published within a date range.",
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
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "search_notices": {
        const { query, limit } = z
          .object({ query: z.string(), limit: z.number().max(100).optional() })
          .parse(args);
        const results = await searchNotices(query, limit ?? 25);
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      }

      case "get_notices_by_agency": {
        const { agency_name, limit } = z
          .object({ agency_name: z.string(), limit: z.number().max(100).optional() })
          .parse(args);
        const results = await getNoticesByAgency(agency_name, limit ?? 25);
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      }

      case "get_notices_by_type": {
        const { notice_type, limit } = z
          .object({ notice_type: z.string(), limit: z.number().max(100).optional() })
          .parse(args);
        const results = await getNoticesByType(notice_type, limit ?? 25);
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      }

      case "get_procurement_notices": {
        const { limit } = z
          .object({ limit: z.number().max(100).optional() })
          .parse(args ?? {});
        const results = await getProcurementNotices(limit ?? 25);
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      }

      case "get_public_hearings": {
        const { limit } = z
          .object({ limit: z.number().max(100).optional() })
          .parse(args ?? {});
        const results = await getPublicHearings(limit ?? 25);
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      }

      case "get_open_solicitations": {
        const { limit } = z
          .object({ limit: z.number().max(100).optional() })
          .parse(args ?? {});
        const results = await getOpenSolicitations(limit ?? 25);
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      }

      case "get_notices_by_date_range": {
        const { start_date, end_date, limit } = z
          .object({
            start_date: z.string(),
            end_date: z.string(),
            limit: z.number().max(200).optional(),
          })
          .parse(args);
        const results = await getNoticesByDateRange(start_date, end_date, limit ?? 50);
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      }

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
