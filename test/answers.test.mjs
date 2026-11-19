// What every City Record answer carries: the source and its link (#23), the time it was
// fetched (#24), and an honest "showing N, more available" with a way to get the rest (#25).
// Offline: fetch is mocked with a 500-notice fixture that honors $limit and $offset.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TOOLS, callTool, parseToolArgs } from "../dist/tools.js";
import { SOURCE } from "../dist/city-record.js";

const FIXTURE = Array.from({ length: 500 }, (_, i) => ({
  request_id: String(20260000000 + i),
  start_date: "2026-11-01T00:00:00.000",
  agency_name: "Parks and Recreation",
  type_of_notice_description: "Solicitation",
  short_title: `Notice ${i}`,
}));

function mockDataset(t, rows = FIXTURE) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    const p = new URL(String(url)).searchParams;
    calls.push(p);
    const off = Number(p.get("$offset") ?? 0);
    const lim = Number(p.get("$limit") ?? 1000);
    return new Response(JSON.stringify(rows.slice(off, off + lim)), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  return calls;
}

/** The JSON body (the first text block) and the Source line (the last) of an answer. */
function parse(r) {
  return { body: JSON.parse(r.content[0].text), line: r.content.at(-1).text };
}

const CALLS = {
  search_notices: { query: "parks" },
  get_notices_by_agency: { agency_name: "Parks" },
  get_notices_by_type: { notice_type: "Solicitation" },
  get_procurement_notices: {},
  get_public_hearings: {},
  get_open_solicitations: {},
  get_notices_by_date_range: { start_date: "2026-11-01", end_date: "2026-11-30" },
};

test("SOURCE matches DATA-SOURCES.json", () => {
  const ds = JSON.parse(readFileSync(new URL("../DATA-SOURCES.json", import.meta.url), "utf8")).sources[0];
  assert.equal(SOURCE.sourceName, ds.source_name);
  assert.equal(SOURCE.publisher, ds.publisher.name);
  assert.equal(SOURCE.sourceUrl, ds.source_url);
});

test("every City Record tool names the source, links it and says when it was fetched", async (t) => {
  mockDataset(t);
  for (const [name, args] of Object.entries(CALLS)) {
    const before = Date.now();
    const r = await callTool(name, args);
    assert.ok(!r.isError, name);
    const { body, line } = parse(r);
    assert.equal(body.source.source, "City Record Online", name);
    assert.equal(body.source.publisher, "NYC Department of Citywide Administrative Services", name);
    assert.equal(body.source.source_url, "https://data.cityofnewyork.us/d/dg92-zbpx", name);
    assert.equal(body.source.as_of_kind, "retrieved", name);
    const asOf = Date.parse(body.source.as_of);
    assert.ok(asOf >= before - 1000 && asOf <= Date.now() + 1000, `${name}: as_of is the time of the call`);
    assert.match(line, /^Source: City Record Online \(NYC Department of Citywide Administrative Services\)\. /, name);
    assert.equal(body.source.retrieved_at, body.source.as_of, name);
    assert.match(line, /\. Fetched from the source for this answer at \d{4}-\d{2}-\d{2} \d{2}:\d{2} E[SD]T \(New York time\)\. /, name);
    assert.ok(line.endsWith("Link: https://data.cityofnewyork.us/d/dg92-zbpx"), name);
  }
});

test("a list cut at its limit says so and how to get the rest", async (t) => {
  const calls = mockDataset(t);
  const r = await callTool("search_notices", { query: "parks" });
  const { body } = parse(r);
  assert.equal(body.showing, 25, "default limit 25");
  assert.equal(body.notices.length, 25);
  assert.equal(body.offset, 0);
  assert.equal(body.more_available, true);
  assert.match(body.how_to_get_more, /offset 25 .*limit, 25/);
  assert.equal(calls[0].get("$limit"), "26", "one extra row tells whether more match");
  assert.equal(calls[0].get("$offset"), "0");
  assert.match(calls[0].get("$order"), /,:id$/, "stable order for paging");
});

test("the next page continues where the last one stopped", async (t) => {
  mockDataset(t);
  const first = parse(await callTool("get_public_hearings", { limit: 100 })).body;
  const second = parse(await callTool("get_public_hearings", { limit: 100, offset: 100 })).body;
  assert.equal(first.notices.at(-1).request_id, FIXTURE[99].request_id);
  assert.equal(second.notices[0].request_id, FIXTURE[100].request_id);
  assert.match(second.how_to_get_more, /offset 200/);
});

test("the last page says nothing more is available", async (t) => {
  mockDataset(t);
  const { body } = parse(await callTool("get_notices_by_date_range", {
    start_date: "2026-11-01", end_date: "2026-11-30", limit: 200, offset: 400,
  }));
  assert.equal(body.showing, 100);
  assert.equal(body.more_available, false);
  assert.equal(body.how_to_get_more, undefined);
});

test("an empty answer shows 0 and nothing more", async (t) => {
  mockDataset(t, []);
  const { body } = parse(await callTool("get_open_solicitations", {}));
  assert.deepEqual([body.showing, body.more_available, body.notices], [0, false, []]);
});

// Review of #33: the first text block must stay valid JSON for programs that parse it. PR #37
// had put the Source line in the same block, so JSON.parse(content[0].text) failed.
test("every City Record tool's first text block is JSON alone, and the Source line is last", async (t) => {
  mockDataset(t);
  for (const [name, args] of Object.entries(CALLS)) {
    const r = await callTool(name, args);
    assert.ok(!r.isError, name);
    assert.equal(r.content.length, 2, name);
    let body;
    assert.doesNotThrow(() => (body = JSON.parse(r.content[0].text)), `${name}: content[0].text is not JSON`);
    for (const key of ["showing", "offset", "more_available", "notices", "source"]) assert.ok(key in body, `${name}: ${key}`);
    assert.match(r.content.at(-1).text, /^Source: City Record Online .*Link: https:\/\/data\.cityofnewyork\.us\/d\/dg92-zbpx$/, name);
  }
});

// Review of #33: limit 0 said "call again with offset 0" forever, and -3 or 2.5 went to NYC
// Open Data as bad queries.
test("limit must be a whole number of at least 1, and nothing is sent otherwise", async (t) => {
  const calls = mockDataset(t);
  for (const limit of [0, -3, 2.5, Number.NaN, "10"]) {
    const r = await callTool("search_notices", { query: "parks", limit });
    assert.equal(r.isError, true, `limit ${limit}`);
    assert.match(r.content[0].text, /limit: (must be a whole number of at least 1|Expected number)/, `limit ${limit}`);
  }
  assert.equal(calls.length, 0, "no request for a bad limit");
});

test("a whole limit above the maximum is lowered to it, and the answer says so", async (t) => {
  const calls = mockDataset(t);
  const { body } = parse(await callTool("get_public_hearings", { limit: 500 }));
  assert.equal(calls[0].get("$limit"), "101");
  assert.equal(body.showing, 100);
  assert.match(body.note, /limit 500 .*lowered to 100/);
  assert.match(body.how_to_get_more, /offset 100 .*limit, 100/);
  const range = parse(await callTool("get_notices_by_date_range", { start_date: "2026-11-01", end_date: "2026-11-30", limit: 1000 })).body;
  assert.equal(calls[1].get("$limit"), "201");
  assert.match(range.note, /lowered to 200/);
  const exact = parse(await callTool("get_public_hearings", { limit: 100 })).body;
  assert.equal(exact.note, undefined, "no note when nothing was lowered");
});

test("offset must be a whole number of at least 0", async (t) => {
  const calls = mockDataset(t);
  for (const offset of [-1, 2.5]) {
    const r = await callTool("get_public_hearings", { offset });
    assert.equal(r.isError, true, `offset ${offset}`);
    assert.match(r.content[0].text, /offset: must be a whole number of at least 0/);
  }
  assert.equal(calls.length, 0);
  assert.deepEqual(parseToolArgs("search_notices", { query: "x", offset: 50 }), { query: "x", offset: 50 });
});

test("the advertised schema says limit is an integer from 1 to the tool's maximum", () => {
  for (const tool of TOOLS.slice(0, 7)) {
    const { limit, offset } = tool.inputSchema.properties;
    const max = tool.name === "get_notices_by_date_range" ? 200 : 100;
    assert.deepEqual([limit.type, limit.minimum, limit.maximum], ["integer", 1, max], tool.name);
    assert.deepEqual([offset.type, offset.minimum], ["integer", 0], tool.name);
  }
});

// Review of #33: 2026-02-31 passed the format check, and a start after the end silently
// returned nothing.
test("get_notices_by_date_range refuses impossible dates and a start after the end", async (t) => {
  const calls = mockDataset(t);
  const bad = [
    [{ start_date: "2026-02-31", end_date: "2026-03-31" }, /start_date: is not a real date on the calendar/],
    [{ start_date: "2026-02-01", end_date: "2026-02-29" }, /end_date: is not a real date on the calendar/],
    [{ start_date: "2026-13-01", end_date: "2026-12-31" }, /start_date: is not a real date/],
    [{ start_date: "2026-03-01", end_date: "2026-02-01" }, /start_date: 2026-03-01 is after end_date 2026-02-01; the start must be on or before the end/],
  ];
  for (const [args, re] of bad) {
    const r = await callTool("get_notices_by_date_range", args);
    assert.equal(r.isError, true, JSON.stringify(args));
    assert.match(r.content[0].text, re);
  }
  assert.equal(calls.length, 0, "nothing sent for a bad date");
  for (const args of [{ start_date: "2028-02-29", end_date: "2028-02-29" }, { start_date: "2026-01-31", end_date: "2026-02-01" }]) {
    assert.ok(!(await callTool("get_notices_by_date_range", args)).isError, JSON.stringify(args));
  }
});
