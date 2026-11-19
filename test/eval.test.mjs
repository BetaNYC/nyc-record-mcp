// The evaluation set (#27): at least 10 questions with known answers, replayed offline from
// eval/fixtures/. The replay must give the same pass/fail per question as the recorded
// eval/results.json, so a change that breaks a passing answer fails here.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));

test("the eval set has at least 10 questions, each with checks", () => {
  const { questions } = read("../eval/questions.json");
  assert.ok(questions.length >= 10, `${questions.length} questions`);
  assert.equal(new Set(questions.map((q) => q.id)).size, questions.length, "unique ids");
  for (const q of questions) assert.ok(q.q && q.tool && q.checks.length > 0, q.id);
});

test("the offline replay matches the recorded results", async () => {
  const { runEval } = await import("../eval/run.mjs");
  const now = await runEval();
  const recorded = read("../eval/results.json").results;
  assert.deepEqual(now.map((r) => [r.id, r.pass]), recorded.map((r) => [r.id, r.pass]));
});

// Review of #33: a failing question says exactly why, and hand-built fixtures say so.
test("the results say why Q03 fails and how to record it, and label the hand-built fixtures", async () => {
  const { runEval } = await import("../eval/run.mjs");
  const now = Object.fromEntries((await runEval()).map((r) => [r.id, r]));
  const recorded = Object.fromEntries(read("../eval/results.json").results.map((r) => [r.id, r]));
  for (const r of [now.Q03, recorded.Q03]) {
    assert.equal(r.pass, false);
    assert.match(r.why, /needs a live request to NYC Open Data, which was not authorized/);
    assert.match(r.why, /npm run eval -- --record/);
  }
  for (const id of ["Q12", "Q13"]) {
    for (const r of [now[id], recorded[id]]) assert.match(r.fixture, /^hand-built from rows of a direct query on 2026-11-18/, id);
  }
});
