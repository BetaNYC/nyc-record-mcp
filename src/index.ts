#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createRequire } from "node:module";
import {
  searchNotices,
  getNoticesByAgency,
  getNoticesByType,
  getProcurementNotices,
  getPublicHearings,
  getOpenSolicitations,
  getNoticesByDateRange,
} from "./city-record.js";
import { TOOLS, parseToolArgs } from "./tools.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const server = new Server(
  { name: "nyc-record-mcp", version },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "search_notices": {
        const { query, limit } = parseToolArgs("search_notices", args);
        const results = await searchNotices(query, limit ?? 25);
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      }

      case "get_notices_by_agency": {
        const { agency_name, limit } = parseToolArgs("get_notices_by_agency", args);
        const results = await getNoticesByAgency(agency_name, limit ?? 25);
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      }

      case "get_notices_by_type": {
        const { notice_type, limit } = parseToolArgs("get_notices_by_type", args);
        const results = await getNoticesByType(notice_type, limit ?? 25);
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      }

      case "get_procurement_notices": {
        const { limit } = parseToolArgs("get_procurement_notices", args);
        const results = await getProcurementNotices(limit ?? 25);
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      }

      case "get_public_hearings": {
        const { limit } = parseToolArgs("get_public_hearings", args);
        const results = await getPublicHearings(limit ?? 25);
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      }

      case "get_open_solicitations": {
        const { limit } = parseToolArgs("get_open_solicitations", args);
        const results = await getOpenSolicitations(limit ?? 25);
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      }

      case "get_notices_by_date_range": {
        const { start_date, end_date, limit } = parseToolArgs(
          "get_notices_by_date_range",
          args
        );
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
