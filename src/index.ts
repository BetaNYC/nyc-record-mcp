#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { TOOLS, SERVER_INSTRUCTIONS, callTool } from "./tools.js";
import { PACKAGE_VERSION as version } from "./version.js";

const server = new Server(
  { name: "nyc-record-mcp", version },
  // The instructions tell the AI app to call about_data for questions about where the data
  // comes from (betanyc-ai-workspace platform/system/about-data-standard.md § 3).
  { capabilities: { tools: {} }, instructions: SERVER_INSTRUCTIONS }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

// The shared tools and the seven City Record tools; failures come back as isError results.
server.setRequestHandler(CallToolRequestSchema, async (request) =>
  callTool(request.params.name, request.params.arguments)
);

const transport = new StdioServerTransport();
await server.connect(transport);
