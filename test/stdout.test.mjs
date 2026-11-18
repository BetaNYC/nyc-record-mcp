// In server mode stdout carries only the MCP protocol: every line is one JSON-RPC message
// (#31). A stray log line there would break the stdio transport. Offline: the calls made
// (tools/list, an unknown tool, whats_changed) never reach the network.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

test("stdout holds only JSON-RPC messages", async () => {
  const child = spawn(process.execPath, [new URL("../dist/index.js", import.meta.url).pathname], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  const send = (m) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n");
  send({ id: 1, method: "initialize", params: { protocolVersion: LATEST_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "stdout-test", version: "0" } } });
  send({ method: "notifications/initialized" });
  send({ id: 2, method: "tools/list" });
  send({ id: 3, method: "tools/call", params: { name: "no_such_tool", arguments: {} } });
  send({ id: 4, method: "tools/call", params: { name: "whats_changed", arguments: { limit: 1 } } });

  const deadline = Date.now() + 10_000;
  while (!/"id":4[,}]/.test(out) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
  child.stdin.end();
  child.kill();

  const lines = out.split("\n").filter((l) => l.trim());
  assert.ok(lines.length >= 4, `expected 4 responses, got ${lines.length}`);
  for (const line of lines) {
    let msg;
    assert.doesNotThrow(() => (msg = JSON.parse(line)), `not JSON on stdout: ${line.slice(0, 200)}`);
    assert.equal(msg.jsonrpc, "2.0", line.slice(0, 200));
  }
  assert.deepEqual(lines.map((l) => JSON.parse(l).id), [1, 2, 3, 4]);
});
