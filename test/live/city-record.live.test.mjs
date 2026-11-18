// LIVE: asks NYC Open Data (dataset dg92-zbpx). Run with `npm run test:live`; never part of
// `npm test` or CI (#29). One small request per City Record tool, 2 s apart, read-only.
// Checks that the dataset still has the shape the offline mocks assume.
import test from "node:test";
import assert from "node:assert/strict";
import { callTool } from "../../dist/tools.js";

const CALLS = {
  search_notices: { query: "parks", limit: 2 },
  get_notices_by_agency: { agency_name: "Parks", limit: 2 },
  get_notices_by_type: { notice_type: "Solicitation", limit: 2 },
  get_procurement_notices: { limit: 2 },
  get_public_hearings: { limit: 2 },
  get_open_solicitations: { limit: 2 },
  get_notices_by_date_range: { start_date: "2026-11-02", end_date: "2026-11-06", limit: 2 },
};

for (const [name, args] of Object.entries(CALLS)) {
  test(`${name} answers live with notices, a source and an as-of`, async () => {
    await new Promise((r) => setTimeout(r, 2000));
    const r = await callTool(name, args);
    const text = r.content[0].text;
    assert.ok(!r.isError, text);
    const body = JSON.parse(text.slice(0, text.lastIndexOf("\n\nSource: ")));
    assert.ok(body.notices.length > 0, "some notices");
    assert.equal(body.showing, body.notices.length);
    assert.equal(typeof body.more_available, "boolean");
    for (const n of body.notices) {
      assert.match(n.request_id, /^\d+$/);
      assert.match(n.start_date, /^\d{4}-\d{2}-\d{2}T00:00:00\.000$/);
      assert.equal(typeof n.agency_name, "string");
    }
    assert.equal(body.source.as_of_kind, "retrieved");
    assert.ok(text.endsWith("Link: https://data.cityofnewyork.us/d/dg92-zbpx"));
  });
}
