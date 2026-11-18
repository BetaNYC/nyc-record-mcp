// Requests to NYC Open Data (#22), the app token (#26) and plain errors (#30).
// Offline: every test mocks globalThis.fetch.
import test from "node:test";
import assert from "node:assert/strict";
import { USER_AGENT, REQUEST_TIMEOUT_MS, retryWaitMs } from "../dist/city-record.js";
import { callTool } from "../dist/tools.js";
import { PACKAGE_VERSION } from "../dist/version.js";

const TOKEN = "tok-SECRET-1234567890";

/** Mock fetch with a queue of responses (or errors to throw); records each call. */
function mockFetch(t, queue) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next instanceof Error) throw next;
    const { status = 200, body = "[]", headers = {} } = next;
    return new Response(body, { status, headers: { "content-type": "application/json", ...headers } });
  });
  return calls;
}

function withToken(t) {
  const old = process.env.SOCRATA_APP_TOKEN;
  process.env.SOCRATA_APP_TOKEN = TOKEN;
  t.after(() => (old === undefined ? delete process.env.SOCRATA_APP_TOKEN : (process.env.SOCRATA_APP_TOKEN = old)));
}

const text = (r) => r.content.map((c) => c.text).join("\n");

test("every request names the package and version, and has a timeout", async (t) => {
  const calls = mockFetch(t, [{ body: "[]" }]);
  await callTool("get_public_hearings", {});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers["User-Agent"], USER_AGENT);
  assert.match(USER_AGENT, new RegExp(`^nyc-record-mcp/${PACKAGE_VERSION.replace(/\./g, "\\.")} \\(\\+https://github\\.com/BetaNYC/nyc-record-mcp\\)$`));
  assert.ok(calls[0].init.signal instanceof AbortSignal, "an AbortSignal bounds the request");
  assert.ok(REQUEST_TIMEOUT_MS >= 15_000 && REQUEST_TIMEOUT_MS <= 30_000);
});

test("the app token goes in the X-App-Token header, never in the URL", async (t) => {
  withToken(t);
  const calls = mockFetch(t, [{ body: "[]" }]);
  await callTool("search_notices", { query: "parks" });
  assert.equal(calls[0].init.headers["X-App-Token"], TOKEN);
  assert.ok(!calls[0].url.includes(TOKEN), "token not in the URL");
  assert.ok(!calls[0].url.includes("app_token"), "no $$app_token parameter");
});

test("without a token, no X-App-Token header is sent", async (t) => {
  const old = process.env.SOCRATA_APP_TOKEN;
  delete process.env.SOCRATA_APP_TOKEN;
  t.after(() => old !== undefined && (process.env.SOCRATA_APP_TOKEN = old));
  const calls = mockFetch(t, [{ body: "[]" }]);
  await callTool("search_notices", { query: "parks" });
  assert.equal(calls[0].init.headers["X-App-Token"], undefined);
});

test("a 429 is retried, honoring Retry-After, then succeeds", async (t) => {
  const calls = mockFetch(t, [{ status: 429, headers: { "retry-after": "0" } }, { body: '[{"request_id":"1"}]' }]);
  const r = await callTool("get_public_hearings", {});
  assert.equal(calls.length, 2);
  assert.ok(!r.isError);
  assert.match(text(r), /"request_id": "1"/);
});

test("a 5xx is retried at most twice, then fails with a plain sentence", async (t) => {
  const calls = mockFetch(t, [{ status: 503, body: "busy", headers: { "retry-after": "0" } }]);
  const r = await callTool("get_public_hearings", {});
  assert.equal(calls.length, 3, "one try plus two retries");
  assert.equal(r.isError, true);
  assert.match(text(r), /^Error: NYC Open Data had a server error \(HTTP 503\), even after retrying\. Try again/);
});

test("a 400 is not retried, and the upstream body is cut to 500 characters", async (t) => {
  const calls = mockFetch(t, [{ status: 400, body: `bad query ${"x".repeat(2000)}` }]);
  const r = await callTool("search_notices", { query: "parks" });
  assert.equal(calls.length, 1);
  assert.equal(r.isError, true);
  assert.match(text(r), /^Error: NYC Open Data rejected the query \(HTTP 400\)\. Check/);
  assert.match(text(r), /The source said: bad query x+… \(cut at 500 characters\)/);
  assert.ok(text(r).length < 800);
});

test("a timeout and a network failure each get a plain sentence", async (t) => {
  mockFetch(t, [new DOMException("The operation timed out.", "TimeoutError")]);
  let r = await callTool("search_notices", { query: "parks" });
  assert.equal(r.isError, true);
  assert.match(text(r), /did not answer within 30 seconds\. Try again/);
  t.mock.restoreAll();
  mockFetch(t, [new TypeError("fetch failed")]);
  r = await callTool("search_notices", { query: "parks" });
  assert.equal(r.isError, true);
  assert.match(text(r), /Could not reach NYC Open Data .* try again/);
});

test("the app token never appears in error text", async (t) => {
  withToken(t);
  const cases = [
    { status: 400, body: `echo: X-App-Token: ${TOKEN} ${encodeURIComponent(TOKEN)}` },
    { status: 403, body: `token ${TOKEN} refused` },
    new Error(`boom ${TOKEN}\n    at sodaFetch (city-record.js:1:1)`),
  ];
  for (const c of cases) {
    t.mock.restoreAll();
    mockFetch(t, [c]);
    const r = await callTool("search_notices", { query: "parks" });
    assert.equal(r.isError, true);
    assert.ok(!text(r).includes(TOKEN), `token leaked: ${text(r)}`);
    assert.ok(!/^\s+at /m.test(text(r)), "no stack frames");
  }
});

test("a bad argument value is a plain sentence, not a JSON dump", async () => {
  const r = await callTool("get_notices_by_date_range", { start_date: "Jan 1", end_date: "2026-01-31" });
  assert.equal(r.isError, true);
  assert.match(text(r), /^Error: get_notices_by_date_range could not use its arguments\. start_date: must be a date in YYYY-MM-DD format\. Fix the value and try again\.$/);
});

test("an unknown tool is an isError result naming the real tools", async () => {
  const r = await callTool("get_everything", {});
  assert.equal(r.isError, true);
  assert.match(text(r), /Unknown tool: get_everything\. This server's tools are: search_notices,/);
});

test("retryWaitMs honors Retry-After seconds and dates, capped at 10 s", () => {
  assert.equal(retryWaitMs("3", 1), 3000);
  assert.equal(retryWaitMs("120", 1), 10_000);
  assert.equal(retryWaitMs(new Date(5_000).toUTCString(), 1, 1_000), 4_000);
  assert.equal(retryWaitMs(null, 1), 1000);
  assert.equal(retryWaitMs(null, 2), 2000);
  assert.equal(retryWaitMs("soon", 1), 1000);
});
