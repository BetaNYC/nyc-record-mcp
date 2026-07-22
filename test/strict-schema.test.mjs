// Unknown tool parameters must be rejected, not silently dropped (issue #10).
//
// Runs entirely offline: it exercises the argument-validation layer, which is
// where the drop happened, and never reaches the Socrata City Record API.
import test from "node:test";
import assert from "node:assert/strict";
import { TOOLS, SCHEMAS, parseToolArgs } from "../dist/tools.js";

// Durable: holds for tools added later, not just today's seven.
test("every advertised tool sets additionalProperties: false", () => {
  assert.ok(TOOLS.length > 0, "TOOLS must not be empty");
  for (const tool of TOOLS) {
    assert.equal(
      tool.inputSchema.additionalProperties,
      false,
      `${tool.name} must set additionalProperties:false so unknown params are rejected`
    );
  }
});

test("every advertised tool has an argument schema, and vice versa", () => {
  assert.deepEqual(
    TOOLS.map((t) => t.name).sort(),
    Object.keys(SCHEMAS).sort()
  );
});

// The behavioral test from issue #10: today the call succeeds and returns
// normal results; after the fix it raises.
test("a call carrying an undeclared parameter is rejected", () => {
  assert.throws(
    () =>
      parseToolArgs("get_open_solicitations", {
        limit: 1,
        bogus_unknown_param: "SHOULD_REJECT",
      }),
    /unrecognized|unknown|not permitted/i,
    "an undeclared parameter must raise, not be silently dropped"
  );
});

test("the rejection names the bad key and the accepted parameters", () => {
  assert.throws(
    () => parseToolArgs("search_notices", { query: "x", council_district: 10 }),
    (err) => {
      assert.match(err.message, /council_district/);
      assert.match(err.message, /\bquery\b/);
      assert.match(err.message, /\blimit\b/);
      return true;
    }
  );
});

test("every tool rejects an undeclared parameter", () => {
  const valid = {
    search_notices: { query: "x" },
    get_notices_by_agency: { agency_name: "DCAS" },
    get_notices_by_type: { notice_type: "Solicitation" },
    get_procurement_notices: {},
    get_public_hearings: {},
    get_open_solicitations: {},
    get_notices_by_date_range: { start_date: "2026-01-01", end_date: "2026-01-31" },
  };
  for (const [name, args] of Object.entries(valid)) {
    assert.throws(
      () => parseToolArgs(name, { ...args, bogus_unknown_param: "x" }),
      /unrecognized|unknown|not permitted/i,
      `${name} accepted an undeclared parameter`
    );
  }
});

// Regression guard: do not over-correct into rejecting valid calls.
test("valid calls still parse", () => {
  assert.deepEqual(parseToolArgs("get_open_solicitations", { limit: 1 }), { limit: 1 });
  assert.deepEqual(parseToolArgs("get_open_solicitations", undefined), {});
  assert.deepEqual(parseToolArgs("search_notices", { query: "rfp", limit: 5 }), {
    query: "rfp",
    limit: 5,
  });
  assert.deepEqual(
    parseToolArgs("get_notices_by_date_range", {
      start_date: "2026-01-01",
      end_date: "2026-01-31",
    }),
    { start_date: "2026-01-01", end_date: "2026-01-31" }
  );
});

// Ordinary validation errors must keep their own messages.
test("a bad value for a declared parameter still reports normally", () => {
  assert.throws(
    () => parseToolArgs("get_notices_by_date_range", { start_date: "Jan 1", end_date: "2026-01-31" }),
    /YYYY-MM-DD/
  );
});
