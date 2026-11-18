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
