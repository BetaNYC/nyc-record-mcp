import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../dist/server.js";

test("tool list exposes the seven City Record tools, names unchanged", async () => {
  const server = buildServer();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    [
      "get_notices_by_agency",
      "get_notices_by_date_range",
      "get_notices_by_type",
      "get_open_solicitations",
      "get_procurement_notices",
      "get_public_hearings",
      "search_notices",
    ]
  );
  for (const tool of tools) {
    assert.ok(tool.description && tool.description.length > 0, `${tool.name} has a description`);
    assert.equal(tool.inputSchema.type, "object");
  }

  await client.close();
  await server.close();
});
