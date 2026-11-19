// Every tool definition and the server instructions are sent to the model on every turn,
// so their size is a cost. Issue #28; same measure as nyc-311-mcp test/tool-size.test.mjs.
//
// Measured 2026-11-18 at 14,836 characters (tools/list JSON plus the instructions), with
// shared module 1.5.0 and annotations on every tool; the budget is just above that. If a
// change needs more, raise it on purpose with a dated line here saying why, and put text
// several tools share in the server instructions rather than in each description.
// Raised on purpose 2026-11-18 (#25): an `offset` parameter on each of the seven City Record
// tools, so a list cut at its limit can be continued. Measured 15,606 characters.
// Raised on purpose 2026-11-18 (#32): the answer guide shared by the seven City Record tools,
// said once in the instructions (the type list is no longer repeated in a description).
// Measured 16,104 characters.
// Raised on purpose 2026-11-18 (review of #33): each City Record tool's limit is advertised as
// an integer with a minimum and a maximum, says a larger number is lowered, and the answer guide
// names the two text blocks. Measured 16,517 characters with shared module 1.5.1.
import test from "node:test";
import assert from "node:assert/strict";
import { TOOLS, SERVER_INSTRUCTIONS, ANSWER_GUIDE } from "../dist/tools.js";
import { toolListSize } from "../dist/betanyc-tools.js";

const BUDGET_CHARS = 17_000;

test("tool definitions plus server instructions stay within the size budget", () => {
  const size = toolListSize(TOOLS, SERVER_INSTRUCTIONS);
  assert.ok(size <= BUDGET_CHARS, `tools/list JSON + instructions is ${size} characters, over the ${BUDGET_CHARS} budget`);
});

test("the shared answer guide is said once, in the instructions, not in tool descriptions", () => {
  assert.ok(SERVER_INSTRUCTIONS.includes(ANSWER_GUIDE));
  for (const t of TOOLS) {
    for (const phrase of ["more_available", "how_to_get_more", "Changes in Personnel", "Valid types"]) {
      assert.ok(!t.description.includes(phrase), `${t.name} repeats "${phrase}"; it belongs in the instructions`);
    }
  }
});
