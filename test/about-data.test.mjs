// about_data: "where does this data come from?" (betanyc-ai-workspace
// platform/system/about-data-standard.md). The answer comes from DATA-SOURCES.json through
// BetaNYC's shared module (src/betanyc-tools.ts, a copy: never edit it here). These tests keep
// two promises: every tool has a documented source, so a new tool cannot ship unexplained; and
// the one source is DCAS's City Record Online, an official record passed on unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TOOLS, betanyc, SERVER_INSTRUCTIONS } from "../dist/tools.js";
import { assertEveryToolExplained, BETANYC_INSTRUCTIONS, SHARED_MODULE_VERSION } from "../dist/betanyc-tools.js";

const DS_TEXT = readFileSync(new URL("../DATA-SOURCES.json", import.meta.url), "utf8");
const NAMES = TOOLS.map((t) => t.name);

test("shared module 1.3.6", () => {
  assert.equal(SHARED_MODULE_VERSION, "1.3.6");
});

test("every tool says where its data comes from, so a new tool cannot ship unexplained", () => {
  assert.ok(NAMES.includes("about_data"));
  assertEveryToolExplained(DS_TEXT, NAMES);
  assert.throws(() => assertEveryToolExplained(DS_TEXT, [...NAMES, "brand_new_tool"]), /brand_new_tool/);
});

test("about_data lists this server's topic in its description", () => {
  const def = TOOLS.find((t) => t.name === "about_data");
  assert.match(def.description, /Topics on this server: city-record\./);
});

test("the source: DCAS's City Record Online on NYC Open Data, official, live, passed on unchanged", () => {
  const r = betanyc.call("about_data", {});
  assert.notEqual(r.isError, true, r.content[0].text);
  const body = r.structuredContent;
  assert.deepEqual(body.topics, ["city-record"]);
  assert.equal(body.contact_email, "lab@beta.nyc");
  const [s] = body.sources;
  assert.equal(s.publisher, "NYC Department of Citywide Administrative Services (DCAS)");
  assert.equal(s.source_url, "https://data.cityofnewyork.us/d/dg92-zbpx");
  assert.equal(s.official, true);
  assert.equal(s.figures_official, true);
  assert.deepEqual(s.changed_by_betanyc, { changed: false, steps: [], detail: null });
  assert.equal(s.as_of_status, "live");
  assert.equal(s.update_frequency, "daily");
  assert.equal(s.report_errors.in_the_data, "https://www.nyc.gov/opendata/contact-us");
  assert.equal(s.corrections.length, 3);
  assert.match(r.content[0].text, /Official record: yes, passed on as NYC Department of Citywide Administrative Services \(DCAS\) publishes it\./);
  assert.match(r.content[0].text, /Questions or error reports about this data, to BetaNYC: lab@beta\.nyc/);
});

test("a tool name as the topic gives the source behind that tool", () => {
  for (const name of NAMES.filter((n) => !["whats_changed", "about_betanyc", "about_data"].includes(n))) {
    const r = betanyc.call("about_data", { topic: name.toUpperCase() });
    assert.deepEqual(r.structuredContent.sources.map((s) => s.topic), ["city-record"], name);
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
