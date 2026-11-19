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

// Review of #33: a question with no recording says exactly why, and hand-built fixtures say so.
// Q03 was recorded live on 2026-11-19 (owner-authorized), so it now replays and passes.
test("Q03 replays from its live recording; a question with no recording says why; hand-built fixtures are labeled", async () => {
  const { runEval } = await import("../eval/run.mjs");
  const now = Object.fromEntries((await runEval()).map((r) => [r.id, r]));
  const recorded = Object.fromEntries(read("../eval/results.json").results.map((r) => [r.id, r]));
  for (const r of [now.Q03, recorded.Q03]) {
    assert.equal(r.pass, true);
    assert.equal(r.why, undefined);
    assert.equal(r.fixture, undefined);
  }
  const { questions } = read("../eval/questions.json");
  const q03 = questions.find((q) => q.id === "Q03");
  const [unrecorded] = await runEval([{ ...q03, id: "QX", args: { limit: 2, offset: 4321 } }]);
  assert.equal(unrecorded.pass, false);
  assert.match(unrecorded.why, /No recorded fixture for this query, and none was built by hand/);
  assert.match(unrecorded.why, /npm run eval -- --record/);
  for (const id of ["Q12", "Q13"]) {
    for (const r of [now[id], recorded[id]]) assert.match(r.fixture, /^hand-built from rows of a direct query on 2026-11-18/, id);
  }
});
