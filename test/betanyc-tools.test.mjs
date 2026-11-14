// whats_changed, about_betanyc and about_data, the three tools BetaNYC adds to each of its MCP
// servers (betanyc-ai-workspace platform/system/whats-changed-standard.md § 7 and
// about-data-standard.md § 3). They read this repo's WHATS-CHANGED.md and DATA-SOURCES.json and
// never touch the network. about_data has its own tests in test/about-data.test.mjs. The server's CallTool handler lives in
// src/index.ts, which connects to stdio on import, so the end-to-end tests run the built
// server over stdio with the SDK client; the rest call the same `betanyc` object the handler
// calls.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { TOOLS, betanyc } from "../dist/tools.js";
import { SHARED_MODULE_VERSION } from "../dist/betanyc-tools.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
const whatsChanged = readFileSync(new URL("../WHATS-CHANGED.md", import.meta.url), "utf8");
const REPO = "https://github.com/BetaNYC/nyc-record-mcp";
const SOURCE = `${REPO}/blob/HEAD/WHATS-CHANGED.md`;
// Dated entries only: the tool leaves out an "## Unreleased:" entry (the version waiting for its tag).
const entryCount = (whatsChanged.match(/^## [0-9]{4}-[0-9]{2}-[0-9]{2}: /gm) ?? []).length;
const unreleased = (whatsChanged.match(/^## Unreleased: /gm) ?? []).length;

const textOf = (r) => r.content[0].text;

test("the three shared tools are advertised, read-only, with an output schema", () => {
  assert.equal(TOOLS.length, 10);
  assert.equal(new Set(TOOLS.map((t) => t.name)).size, TOOLS.length, "tool names are unique");
  for (const name of ["whats_changed", "about_betanyc", "about_data"]) {
    const t = TOOLS.find((x) => x.name === name);
    assert.ok(t, name);
    assert.equal(t.outputSchema.type, "object", name);
    assert.equal(t.annotations.readOnlyHint, true, name);
    assert.equal(t.inputSchema.additionalProperties, false, name);
  }
});

test("whats_changed answers from this repo's WHATS-CHANGED.md, with every entry valid", () => {
  const r = betanyc.call("whats_changed", { limit: 50 });
  assert.notEqual(r.isError, true, textOf(r));
  const s = r.structuredContent;
  assert.deepEqual(s.server, { name: "nyc-record-mcp", version: pkg.version });
  assert.equal(s.source, SOURCE);
  assert.equal(s.history_begins, "2026-05-21");
  assert.equal(s.total_matching, entryCount);
  assert.equal(s.returned, entryCount);
  if (unreleased) assert.match(s.note, /not released yet/, "the note says an unreleased entry is left out");
  else assert.equal(s.note, null);
  assert.doesNotMatch(s.note ?? "", /error/, "no entry was left out for an error");
  for (const e of s.entries) {
    assert.ok(e.url.startsWith(`${SOURCE}#${e.date}-`), e.url);
    for (const l of e.links) assert.match(l.url, /^https:\/\//, `${e.title}: ${l.url}`);
  }
});

test("the version in package.json has its own MCP entry, dated or Unreleased (release protocol)", () => {
  assert.ok(unreleased <= 1);
  assert.match(whatsChanged, new RegExp(`- \\*\\*MCP version:\\*\\* \\[nyc-record-mcp ${pkg.version.replace(/\./g, "\\.")}\\]`));
  const r = betanyc.call("whats_changed", { tag: "mcp", limit: 50 });
  assert.equal(r.structuredContent.filters.tag, "MCP", "any case is accepted; answers use the canonical spelling");
  assert.equal(r.structuredContent.returned, entryCount, "every entry in this repo is an MCP entry");
});

test("whats_changed filters: Correction entries carry advice for people who used the old answers", () => {
  const r = betanyc.call("whats_changed", { tag: "Correction" });
  assert.ok(r.structuredContent.returned >= 3);
  for (const e of r.structuredContent.entries) {
    assert.ok(e.tags.includes("Correction"));
    assert.ok(e.if_you_used_the_old_numbers, e.title);
  }
  const since = betanyc.call("whats_changed", { since: "2026-07-21" });
  assert.ok(since.structuredContent.returned >= 1);
  for (const e of since.structuredContent.entries) assert.ok(e.date >= "2026-07-21", e.date);
});

test("whats_changed rejects bad arguments by name", () => {
  for (const [args, re] of [
    [{ since: "last week" }, /since must be a real date/],
    [{ tag: "Parks" }, /tag must be one of/],
    [{ limit: 51 }, /limit must be a whole number from 1 to 50/],
    [{ agency_name: "DCAS" }, /does not accept 'agency_name'/],
  ]) {
    const r = betanyc.call("whats_changed", args);
    assert.equal(r.isError, true, JSON.stringify(args));
    assert.match(textOf(r), re);
  }
});

test("about_betanyc names the server, its version, and where to report a bug or ask for a feature", () => {
  const r = betanyc.call("about_betanyc", {});
  assert.notEqual(r.isError, true, textOf(r));
  const s = r.structuredContent;
  assert.deepEqual(s.server, {
    name: "nyc-record-mcp",
    version: pkg.version,
    repository: REPO,
    shared_module_version: SHARED_MODULE_VERSION,
  });
  assert.equal(s.built_by, "BetaNYC, a project of the Fund for the City of New York");
  assert.deepEqual(s.bugs_and_requests, { issues: `${REPO}/issues`, new_issue: `${REPO}/issues/new` });
  assert.equal(s.whats_changed, SOURCE);
  const bad = betanyc.call("about_betanyc", { verbose: true });
  assert.equal(bad.isError, true);
  assert.match(textOf(bad), /takes no parameters/);
});

test("over stdio, the server answers the shared tools through its CallTool handler, and the SDK client accepts them", async () => {
  // Client.callTool validates structuredContent against the outputSchema from tools/list
  // and throws when it does not match, so this is the MCP contract checked end to end.
  const transport = new StdioClientTransport({ command: process.execPath, args: ["dist/index.js"], stderr: "ignore" });
  const client = new Client({ name: "betanyc-tools-test", version: "0" });
  await client.connect(transport);
  try {
    assert.equal(client.getServerVersion().version, pkg.version, "server reports package.json's version");
    const { tools } = await client.listTools();
    assert.equal(tools.length, 10);
    const wc = await client.callTool({ name: "whats_changed", arguments: { limit: 3 } });
    assert.equal(wc.structuredContent.returned, 3);
    const about = await client.callTool({ name: "about_betanyc", arguments: {} });
    assert.equal(about.structuredContent.server.version, pkg.version);
    const data = await client.callTool({ name: "about_data", arguments: {} });
    assert.notEqual(data.isError, true, textOf(data));
    assert.equal(data.structuredContent.contact_email, "lab@beta.nyc");
    assert.match(client.getInstructions() ?? "", /about_data/, "the server's instructions name about_data");
    const badArg = await client.callTool({ name: "whats_changed", arguments: { bogus: 1 } });
    assert.equal(badArg.isError, true);
    assert.match(textOf(badArg), /does not accept 'bogus'/);
    // An existing tool still goes through its own strict schema (no network: rejected first).
    const strict = await client.callTool({ name: "get_open_solicitations", arguments: { bogus: 1 } });
    assert.equal(strict.isError, true);
    assert.match(textOf(strict), /unrecognized parameter\(s\): bogus/);
  } finally {
    await client.close();
  }
});

test("WHATS-CHANGED.md, DATA-SOURCES.json and data.json ship in the npm package", () => {
  const out = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { encoding: "utf8" });
  const files = JSON.parse(out)[0].files.map((f) => f.path);
  for (const f of ["WHATS-CHANGED.md", "DATA-SOURCES.json", "data.json"]) assert.ok(files.includes(f), `${f}: ${files.join(", ")}`);
  assert.ok(files.includes("dist/betanyc-tools.js"));
});
