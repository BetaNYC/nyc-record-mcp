// The tool names are the server's public interface: an AI assistant's saved setup and
// every example in the README call them by name. Offline: reads the advertised list only.
import test from "node:test";
import assert from "node:assert/strict";
import { TOOLS } from "../dist/tools.js";

test("the advertised tool names are unchanged", () => {
  assert.deepEqual(
    TOOLS.map((t) => t.name),
    [
      "search_notices",
      "get_notices_by_agency",
      "get_notices_by_type",
      "get_procurement_notices",
      "get_public_hearings",
      "get_open_solicitations",
      "get_notices_by_date_range",
      "whats_changed",
      "about_betanyc",
      "about_data",
    ]
  );
  for (const tool of TOOLS) {
    assert.ok(tool.description && tool.description.length > 0, `${tool.name} has a description`);
    assert.equal(tool.inputSchema.type, "object", tool.name);
  }
});
