import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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

const { version } = createRequire(import.meta.url)("../package.json") as {
  version: string;
};

function jsonResult(results: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(results, null, 2) },
    ],
  };
}

export function buildServer(): McpServer {
  const server = new McpServer({ name: "nyc-record-mcp", version });

  server.registerTool(
    "search_notices",
    {
      description:
        "Full-text search across all NYC City Record notices. Returns recent matching notices sorted by date.",
      inputSchema: {
        query: z.string().describe("Search term"),
        limit: z
          .number()
          .max(100)
          .optional()
          .describe("Max results (default 25, max 100)"),
      },
    },
    async ({ query, limit }) => jsonResult(await searchNotices(query, limit ?? 25))
  );

  server.registerTool(
    "get_notices_by_agency",
    {
      description:
        "Get City Record notices published by a specific city agency (partial name match).",
      inputSchema: {
        agency_name: z
          .string()
          .describe("Agency name or partial name, e.g. 'DCAS', 'Parks'"),
        limit: z
          .number()
          .max(100)
          .optional()
          .describe("Max results (default 25, max 100)"),
      },
    },
    async ({ agency_name, limit }) =>
      jsonResult(await getNoticesByAgency(agency_name, limit ?? 25))
  );

  server.registerTool(
    "get_notices_by_type",
    {
      description:
        "Get notices filtered by type. Valid types: Solicitation, Award, Intent to Award, Intent to Negotiate, Public Hearings, Public Comment, Meeting, Notice, Vendor List, Sale.",
      inputSchema: {
        notice_type: z
          .enum([
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
          ])
          .describe("Notice type"),
        limit: z
          .number()
          .max(100)
          .optional()
          .describe("Max results (default 25, max 100)"),
      },
    },
    async ({ notice_type, limit }) =>
      jsonResult(await getNoticesByType(notice_type, limit ?? 25))
  );

  server.registerTool(
    "get_procurement_notices",
    {
      description:
        "Get recent procurement-related notices: solicitations, awards, intent to award, vendor lists. Useful for tracking open contracts and recent awards.",
      inputSchema: {
        limit: z
          .number()
          .max(100)
          .optional()
          .describe("Max results (default 25, max 100)"),
      },
    },
    async ({ limit }) => jsonResult(await getProcurementNotices(limit ?? 25))
  );

  server.registerTool(
    "get_public_hearings",
    {
      description:
        "Get recent public hearings, public comment periods, and agency meetings from the City Record.",
      inputSchema: {
        limit: z
          .number()
          .max(100)
          .optional()
          .describe("Max results (default 25, max 100)"),
      },
    },
    async ({ limit }) => jsonResult(await getPublicHearings(limit ?? 25))
  );

  server.registerTool(
    "get_open_solicitations",
    {
      description:
        "Get active solicitations (RFPs, RFQs, IFBs) where the due date has not yet passed. Sorted by due date ascending — soonest deadlines first.",
      inputSchema: {
        limit: z
          .number()
          .max(100)
          .optional()
          .describe("Max results (default 25, max 100)"),
      },
    },
    async ({ limit }) => jsonResult(await getOpenSolicitations(limit ?? 25))
  );

  server.registerTool(
    "get_notices_by_date_range",
    {
      description: "Get all City Record notices published within a date range.",
      inputSchema: {
        start_date: z.string().describe("Start date, YYYY-MM-DD"),
        end_date: z.string().describe("End date, YYYY-MM-DD"),
        limit: z
          .number()
          .max(200)
          .optional()
          .describe("Max results (default 50, max 200)"),
      },
    },
    async ({ start_date, end_date, limit }) =>
      jsonResult(await getNoticesByDateRange(start_date, end_date, limit ?? 50))
  );

  return server;
}
