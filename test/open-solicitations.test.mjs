// get_open_solicitations: "open" means the due date AND time, in New York, has not passed
// (review of #33). Comparing with the bare date counted a deadline from earlier today as open.
// Offline: the clock is fixed and fetch is mocked with a dataset that applies the due_date
// comparison in the $where clause to its rows, as text, the way floating timestamps compare.
import test from "node:test";
import assert from "node:assert/strict";
import { clock, nyNow } from "../dist/city-record.js";
import { callTool } from "../dist/tools.js";

function fixClock(t, iso) {
  t.mock.method(clock, "now", () => Date.parse(iso));
}

function mockDueDates(t, dueDates) {
  const wheres = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    const where = new URL(String(url)).searchParams.get("$where") ?? "";
    wheres.push(where);
    const m = where.match(/due_date (>=|>) '([^']+)'/);
    assert.ok(m, `no due_date comparison in ${where}`);
    const rows = dueDates
      .filter((d) => (m[1] === ">" ? d > m[2] : d >= m[2]))
      .map((d, i) => ({ request_id: String(i), type_of_notice_description: "Solicitation", due_date: d }));
    return new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json" } });
  });
  return wheres;
}

const dueDatesOf = (r) => JSON.parse(r.content[0].text).notices.map((n) => n.due_date);

test("a deadline one hour ago is left out, one an hour ahead is kept", async (t) => {
  fixClock(t, "2026-11-18T13:35:00-05:00"); // 1:35 p.m. EST
  const wheres = mockDueDates(t, ["2026-11-18T12:35:00.000", "2026-11-18T14:35:00.000"]);
  const r = await callTool("get_open_solicitations", {});
  assert.ok(!r.isError, r.content[0].text);
  assert.deepEqual(dueDatesOf(r), ["2026-11-18T14:35:00.000"]);
  assert.equal(wheres[0], "type_of_notice_description='Solicitation' AND due_date > '2026-11-18T13:35:00.000'");
});

test("the time is New York's, not UTC's, in the evening", async (t) => {
  fixClock(t, "2026-11-19T03:00:00Z"); // 10 p.m. EST on Nov 18; already Nov 19 in UTC
  mockDueDates(t, ["2026-11-18T21:00:00.000", "2026-11-18T23:00:00.000"]);
  assert.deepEqual(dueDatesOf(await callTool("get_open_solicitations", {})), ["2026-11-18T23:00:00.000"]);
});

test("across the spring daylight-saving change", async (t) => {
  // 2026-03-08: 2 a.m. EST jumps to 3 a.m. EDT. 07:30 UTC is 3:30 a.m. EDT (4:30 under a
  // fixed EST offset would be wrong the other way; 2:30 would be a time that never happened).
  fixClock(t, "2026-03-08T07:30:00Z");
  assert.equal(nyNow(), "2026-03-08T03:30:00.000");
  mockDueDates(t, ["2026-03-08T03:00:00.000", "2026-03-08T04:00:00.000"]);
  assert.deepEqual(dueDatesOf(await callTool("get_open_solicitations", {})), ["2026-03-08T04:00:00.000"]);
});

test("across the fall daylight-saving change", async (t) => {
  // 2026-11-01: 2 a.m. EDT falls back to 1 a.m. EST, so 1:30 happens twice.
  assert.equal(nyNow(new Date("2026-11-01T05:30:00Z")), "2026-11-01T01:30:00.000"); // EDT
  assert.equal(nyNow(new Date("2026-11-01T06:30:00Z")), "2026-11-01T01:30:00.000"); // EST
  fixClock(t, "2026-11-01T07:30:00Z"); // 2:30 a.m. EST
  assert.equal(nyNow(), "2026-11-01T02:30:00.000");
  mockDueDates(t, ["2026-11-01T02:00:00.000", "2026-11-01T03:00:00.000"]);
  assert.deepEqual(dueDatesOf(await callTool("get_open_solicitations", {})), ["2026-11-01T03:00:00.000"]);
});

test("midnight is 00, not 24", () => {
  assert.equal(nyNow(new Date("2026-07-07T04:00:05Z")), "2026-07-07T00:00:05.000");
});

test("the tool description says the due date and time have not passed", async () => {
  const { TOOLS } = await import("../dist/tools.js");
  const d = TOOLS.find((x) => x.name === "get_open_solicitations").description;
  assert.match(d, /due date and time, in New York, has not yet passed/);
});
