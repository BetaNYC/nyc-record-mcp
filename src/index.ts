#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./server.js";

const transport = new StdioServerTransport();
await buildServer().connect(transport);
