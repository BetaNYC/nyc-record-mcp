import test from "node:test";
import assert from "node:assert/strict";
import {
  soqlString,
  nyToday,
  getNoticesByType,
  getNoticesByAgency,
  getNoticesByDateRange,
  searchNotices,
} from "../dist/city-record.js";

function mockFetch(t, { status = 200, body = "[]", statusText = "OK" } = {}) {
  const captured = { url: undefined };
  t.mock.method(globalThis, "fetch", async (url) => {
    captured.url = String(url);
    return new Response(body, {
      status,
      statusText,
      headers: { "content-type": "application/json" },
    });
  });
  return captured;
}

test("soqlString doubles embedded single quotes", () => {
  assert.equal(soqlString("O'Brien's"), "O''Brien''s");
  assert.equal(soqlString("no quotes"), "no quotes");
});

test("getNoticesByType escapes single quotes in the $where clause", async (t) => {
  const captured = mockFetch(t);
  await getNoticesByType("Int'l Notice");
  const where = new URL(captured.url).searchParams.get("$where");
  assert.equal(where, "type_of_notice_description='Int''l Notice'");
});

test("getNoticesByAgency escapes single quotes", async (t) => {
  const captured = mockFetch(t);
  await getNoticesByAgency("Mayor's Office");
  const where = new URL(captured.url).searchParams.get("$where");
  assert.equal(where, "upper(agency_name) like upper('%Mayor''s Office%')");
});

test("getNoticesByDateRange escapes quotes in date params", async (t) => {
  const captured = mockFetch(t);
  await getNoticesByDateRange("2026-01-01' OR '1'='1", "2026-02-01");
  const where = new URL(captured.url).searchParams.get("$where");
  assert.equal(
    where,
    "start_date >= '2026-01-01'' OR ''1''=''1' AND start_date <= '2026-02-01'"
  );
});

test("nyToday returns the New York calendar date", () => {
  // 2026-07-07T02:00Z is still 2026-07-06 10pm in New York (EDT, UTC-4).
  assert.equal(nyToday(new Date("2026-07-07T02:00:00Z")), "2026-07-06");
  // Midday UTC matches the same NY date.
  assert.equal(nyToday(new Date("2026-07-06T12:00:00Z")), "2026-07-06");
  // Winter (EST, UTC-5): 2026-01-02T04:59Z is 2026-01-01 11:59pm in NY.
  assert.equal(nyToday(new Date("2026-01-02T04:59:00Z")), "2026-01-01");
});

test("API errors include truncated response body", async (t) => {
  const longBody = "x".repeat(500);
  mockFetch(t, { status: 400, statusText: "Bad Request", body: longBody });
  await assert.rejects(searchNotices("q"), (err) => {
    assert.match(err.message, /NYC Open Data API error 400: Bad Request/);
    assert.ok(err.message.includes("x".repeat(300)), "includes body text");
    assert.ok(!err.message.includes("x".repeat(301)), "truncated to ~300 chars");
    assert.ok(err.message.endsWith("…"), "signals truncation");
    return true;
  });
});

test("API errors with short bodies include the full body", async (t) => {
  mockFetch(t, {
    status: 400,
    statusText: "Bad Request",
    body: '{"message":"Could not parse SoQL query"}',
  });
  await assert.rejects(searchNotices("q"), /Could not parse SoQL query/);
});
