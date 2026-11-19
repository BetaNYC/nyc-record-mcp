// about_data: "where does this data come from?" (betanyc-ai-workspace
// platform/system/about-data-standard.md). The answer comes from DATA-SOURCES.json through
// BetaNYC's shared module (src/betanyc-tools.ts, a copy: never edit it here). These tests keep
// promises: every tool has a documented source, so a new tool cannot ship unexplained; six tools
// pass DCAS's City Record Online on unchanged, an official record; and get_open_solicitations,
// which BetaNYC arranges (folds, cancellations listed apart, labels), says BetaNYC modified it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TOOLS, betanyc, SERVER_INSTRUCTIONS } from "../dist/tools.js";
import { assertEveryToolExplained, BETANYC_INSTRUCTIONS, SHARED_MODULE_VERSION } from "../dist/betanyc-tools.js";

const DS_TEXT = readFileSync(new URL("../DATA-SOURCES.json", import.meta.url), "utf8");
const NAMES = TOOLS.map((t) => t.name);

test("shared module 1.5.2", () => {
  assert.equal(SHARED_MODULE_VERSION, "1.5.2");
});

test("every tool says where its data comes from, so a new tool cannot ship unexplained", () => {
  assert.ok(NAMES.includes("about_data"));
  assertEveryToolExplained(DS_TEXT, NAMES);
  assert.throws(() => assertEveryToolExplained(DS_TEXT, [...NAMES, "brand_new_tool"]), /brand_new_tool/);
});

test("about_data lists this server's topic in its description", () => {
  const def = TOOLS.find((t) => t.name === "about_data");
  assert.match(def.description, /Topics on this server: city-record, open-solicitations\./);
});

test("the source: DCAS's City Record Online on NYC Open Data, official, live, passed on unchanged", () => {
  const r = betanyc.call("about_data", { topic: "city-record" });
  assert.notEqual(r.isError, true, r.content[0].text);
  const body = r.structuredContent;
  assert.deepEqual(body.topics, ["city-record", "open-solicitations"]);
  assert.equal(body.contact_email, "lab@beta.nyc");
  const [s] = body.sources;
  assert.equal(s.publisher, "NYC Department of Citywide Administrative Services");
  assert.equal(s.source_url, "https://data.cityofnewyork.us/d/dg92-zbpx");
  assert.equal(s.official, true);
  assert.equal(s.figures_official, true);
  assert.deepEqual(s.changed_by_betanyc, { changed: false, steps: [], detail: null });
  assert.equal(s.as_of_status, "live");
  assert.equal(s.update_frequency, "daily");
  assert.equal(s.report_errors.in_the_data, "https://www.nyc.gov/opendata/contact-us");
  // The form is NYC Open Data's, not the publisher's (upstream_name, module 1.3.7).
  assert.equal(s.report_errors.in_the_data_name, "NYC Open Data");
  assert.equal(s.corrections.length, 2);
  assert.deepEqual(s.tools, SIX);
  assert.match(r.content[0].text, /^Publisher: NYC Department of Citywide Administrative Services\. BetaNYC did not modify it\. Source: City Record Online, https:\/\/data\.cityofnewyork\.us\/d\/dg92-zbpx$/m);
  assert.match(r.content[0].text, /Report an error in the data to NYC Open Data: https:\/\/www\.nyc\.gov\/opendata\/contact-us/);
  assert.match(r.content[0].text, /Questions or error reports about this data, to BetaNYC: lab@beta\.nyc/);
});

test("a tool name as the topic gives the source behind that tool", () => {
  for (const name of NAMES.filter((n) => !["whats_changed", "about_betanyc", "about_data"].includes(n))) {
    const r = betanyc.call("about_data", { topic: name.toUpperCase() });
    const want = name === "get_open_solicitations" ? "open-solicitations" : "city-record";
    assert.deepEqual(r.structuredContent.sources.map((s) => s.topic), [want], name);
  }
});

// The owner's rule (review of #33): "If we've changed the data in any way, this is the only
// option." get_open_solicitations folds, moves cancellations and adds labels, so about_data must
// say BetaNYC modified it; the other six return the City's rows as given and must not.
const SIX = ["search_notices", "get_notices_by_agency", "get_notices_by_type", "get_procurement_notices", "get_public_hearings", "get_notices_by_date_range"];

test("about_data says BetaNYC modified get_open_solicitations, and the other six it did not", () => {
  const open = betanyc.call("about_data", { topic: "get_open_solicitations" });
  assert.notEqual(open.isError, true, open.content[0].text);
  const [s] = open.structuredContent.sources;
  assert.equal(s.topic, "open-solicitations");
  assert.deepEqual(s.tools, ["get_open_solicitations"]);
  assert.equal(s.official, true, "the dataset itself is an official record");
  assert.equal(s.figures_official, false, "this copy is not");
  assert.equal(s.changed_by_betanyc.changed, true);
  assert.deepEqual(s.changed_by_betanyc.steps, ["filtered", "reshaped"]);
  for (const words of [
    /folds an older notice under a newer one when the PIN \(8 characters or more\), the agency and the title .* all match/,
    /the older notice is listed by request_id and dates in the newer one's supersedes, and its full row is available with include_superseded: true/,
    /A matched cancellation notice is listed in a separate cancelled list, but a cancellation never takes a solicitation off the list/,
    /A notice whose due time is 00:00 \(no closing time given\) stays listed through the end of its due date/,
    /BetaNYC's labels are added under betanyc_notes/,
    /Every row that is listed, in notices or in cancelled, keeps every City field unchanged/,
    /The official record is the City Record Online dataset: https:\/\/data\.cityofnewyork\.us\/d\/dg92-zbpx/,
  ]) assert.match(s.changed_by_betanyc.detail, words);
  const text = open.content[0].text;
  assert.match(text, /^BetaNYC modified this data: left some records out and reshaped it\. This copy should not be considered the official record\. Official record: City Record Online \(NYC Department of Citywide Administrative Services\), https:\/\/data\.cityofnewyork\.us\/d\/dg92-zbpx$/m);
  assert.doesNotMatch(text, /BetaNYC did not modify it\. Source/);
  assert.equal(s.report_errors.in_these_figures, "https://github.com/BetaNYC/nyc-record-mcp/issues", "errors in BetaNYC's arrangement go to BetaNYC");

  for (const name of SIX) {
    const r = betanyc.call("about_data", { topic: name });
    const [x] = r.structuredContent.sources;
    assert.equal(x.figures_official, true, name);
    assert.deepEqual(x.changed_by_betanyc, { changed: false, steps: [], detail: null }, name);
    assert.match(r.content[0].text, /^Publisher: NYC Department of Citywide Administrative Services\. BetaNYC did not modify it\./m, name);
    assert.doesNotMatch(r.content[0].text, /BetaNYC modified this data/, name);
  }
});

test("a bad topic is an error that lists the topics; an unknown key is refused by name", () => {
  const bad = betanyc.call("about_data", { topic: "parking-tickets" });
  assert.equal(bad.isError, true);
  assert.match(bad.content[0].text, /city-record/);
  const extra = betanyc.call("about_data", { verbose: true });
  assert.equal(extra.isError, true);
  assert.match(extra.content[0].text, /verbose/);
});

test("the server's instructions tell the AI app to call about_data", () => {
  assert.ok(SERVER_INSTRUCTIONS.includes(BETANYC_INSTRUCTIONS));
  assert.match(SERVER_INSTRUCTIONS, /City Record/);
});
