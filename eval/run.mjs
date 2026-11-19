#!/usr/bin/env node
// Runs eval/questions.json through the built server's callTool (#27).
//   node eval/run.mjs            offline: NYC Open Data answers come from eval/fixtures/
//   node eval/run.mjs --record   live: asks NYC Open Data for each missing fixture and saves it
//                                (delete eval/fixtures/ first to re-record them all)
// Writes eval/results.json and exits 1 if any question fails. Needs `npm run build` first.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { callTool } from "../dist/tools.js";
import { clock, nyNow, nyToday } from "../dist/city-record.js";

const here = (p) => new URL(p, import.meta.url);
const RECORD = process.argv.includes("--record");
const { questions, asked_at } = JSON.parse(readFileSync(here("questions.json"), "utf8"));
const SOURCE_URL = "https://data.cityofnewyork.us/d/dg92-zbpx";

// The server's clock is fixed for the whole run: at asked_at for the offline replay, so
// "open now" means open when the questions were asked, and at the start of a --record run.
const NOW = RECORD ? Date.now() : Date.parse(asked_at);
if (!Number.isFinite(NOW)) throw new Error(`questions.json asked_at is not a date: ${asked_at}`);
clock.now = () => NOW;

/** A request's fixture key: its query parameters, sorted, with the run's moment in New York
 * as <now> and its date as <today>. */
export function fixtureKey(url) {
  const now = nyNow(new Date(NOW));
  const today = nyToday(new Date(NOW));
  return [...new URL(url).searchParams].sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v.split(now).join("<now>").split(today).join("<today>")}`).join("&");
}
const fixturePath = (key) => here(`fixtures/${createHash("sha256").update(key).digest("hex").slice(0, 16)}.json`);

const realFetch = globalThis.fetch;
const missing = new Set();
globalThis.fetch = async (url, init) => {
  const key = fixtureKey(String(url));
  const path = fixturePath(key);
  if (!RECORD && !existsSync(path)) missing.add(key);
  if (RECORD && !existsSync(path)) {
    await new Promise((r) => setTimeout(r, 2000)); // polite: 2 s between live requests
    mkdirSync(here("fixtures/"), { recursive: true });
    let res;
    try {
      res = await realFetch(url, init);
    } catch (err) {
      // A timeout is an answer too: record it, so the offline replay fails the same way.
      if (err?.name === "TimeoutError") writeFileSync(path, JSON.stringify({ key, timeout: true, recorded_at: new Date().toISOString() }) + "\n");
      throw err;
    }
    const body = await res.text();
    writeFileSync(path, JSON.stringify({ key, status: res.status, body: JSON.parse(body) }, null, 1) + "\n");
    return new Response(body, { status: res.status, headers: { "content-type": "application/json" } });
  }
  if (!existsSync(path)) throw new Error(`no fixture for ${key}; run with --record`);
  const f = JSON.parse(readFileSync(path, "utf8"));
  if (f.timeout) throw new DOMException(`recorded timeout (${f.recorded_at})`, "TimeoutError");
  return new Response(JSON.stringify(f.body), { status: f.status, headers: { "content-type": "application/json" } });
};

const get = (o, path) => path.split(".").reduce((v, k) => (v == null ? v : v[k]), o);
const has = (n, want) => Object.entries(want).every(([k, v]) => n?.[k] === v);

function check(c, r, body, text) {
  if (c.error) return r.isError === true && new RegExp(c.error).test(text);
  if (r.isError) return false;
  if (c.field) return get(body, c.field[0]) === c.field[1];
  if (c.top) { const { index, ...want } = c.top; return has(body.notices[index], want); }
  if (c.any) return body.notices.some((n) => has(n, c.any));
  if (c.all_prefix) return body.notices.every((n) => String(n[c.all_prefix[0]] ?? "").startsWith(c.all_prefix[1]));
  if (c.all_in) return body.notices.every((n) => c.all_in[1].includes(n[c.all_in[0]]));
  if (c.count) return body.notices.filter((n) => n[c.count[0]] === c.count[1]).length === c.count[2];
  if (c.all_after_now) return body.notices.every((n) => String(n[c.all_after_now] ?? "") > nyNow(new Date(NOW)));
  throw new Error(`unknown check ${JSON.stringify(c)}`);
}

function invariants(r, body, text) {
  if (r.isError) return [];
  const bad = [];
  if (body.source?.source !== "City Record Online") bad.push("source name");
  if (body.source?.publisher !== "NYC Department of Citywide Administrative Services") bad.push("publisher");
  if (body.source?.source_url !== SOURCE_URL || !text.endsWith(`Link: ${SOURCE_URL}`)) bad.push("link");
  if (body.source?.as_of_kind !== "retrieved" || !body.source?.as_of) bad.push("as-of");
  if (!text.split("\n").at(-1).startsWith("Source: ")) bad.push("Source line last");
  if (body.showing !== body.notices?.length) bad.push("showing");
  return bad;
}

export async function runEval() {
  const results = [];
  for (const q of questions) {
    missing.clear();
    const r = await callTool(q.tool, q.args);
    const text = r.content.map((c) => c.text).join("\n");
    let body = null;
    if (!r.isError) body = JSON.parse(r.content[0].text);
    const failed = missing.size
      ? [...missing].map((k) => `no recorded fixture for ${k} (run npm run eval -- --record)`)
      : q.checks.filter((c) => !check(c, r, body, text)).map((c) => JSON.stringify(c));
    const broken = invariants(r, body, text);
    results.push({
      id: q.id, q: q.q, pass: failed.length === 0 && broken.length === 0, failed_checks: failed, failed_invariants: broken,
      ...(r.isError && !missing.size ? { answer_error: text.slice(0, 300) } : {}),
    });
  }
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const results = await runEval();
  const passed = results.filter((r) => r.pass).length;
  for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.id} ${r.q}${r.pass ? "" : ` ${[...r.failed_checks, ...r.failed_invariants].join("; ")}`}`);
  console.log(`${passed} of ${results.length} passed (${RECORD ? "live, fixtures recorded" : "offline, from fixtures"})`);
  if (RECORD) console.log(`Set "asked_at" in eval/questions.json to ${new Date(NOW).toISOString()} so the replay asks at the same moment.`);
  writeFileSync(here("results.json"), JSON.stringify({
    run_at: new Date().toISOString(), mode: RECORD ? "live" : "offline", asked_at: new Date(NOW).toISOString(),
    passed, total: results.length, results,
  }, null, 2) + "\n");
  process.exit(passed === results.length ? 0 : 1);
}
