// Every tool definition and the server instructions are sent to the model on every turn,
// so their size is a cost. Issue #28; same measure as nyc-311-mcp test/tool-size.test.mjs.
//
// Measured 2026-11-18 at 14,836 characters (tools/list JSON plus the instructions), with
// shared module 1.5.0 and annotations on every tool; the budget is just above that. If a
// change needs more, raise it on purpose with a dated line here saying why, and put text
// several tools share in the server instructions rather than in each description.
import test from "node:test";
import assert from "node:assert/strict";
import { TOOLS, SERVER_INSTRUCTIONS } from "../dist/tools.js";
import { toolListSize } from "../dist/betanyc-tools.js";

const BUDGET_CHARS = 15_500;

test("tool definitions plus server instructions stay within the size budget", () => {
  const size = toolListSize(TOOLS, SERVER_INSTRUCTIONS);
  assert.ok(size <= BUDGET_CHARS, `tools/list JSON + instructions is ${size} characters, over the ${BUDGET_CHARS} budget`);
});
