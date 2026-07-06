import test from "node:test";
import assert from "node:assert/strict";
import { getNoticesByAgency } from "../dist/city-record.js";

test("getNoticesByAgency single-encodes the SoQL like pattern", async (t) => {
  let capturedUrl;
  t.mock.method(globalThis, "fetch", async (url) => {
    capturedUrl = String(url);
    return new Response("[]", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  await getNoticesByAgency("Parks & Recreation");

  const where = new URL(capturedUrl).searchParams.get("$where");
  // URLSearchParams.get decodes once; the decoded SoQL must contain the
  // literal % wildcard (SoQL `like`: https://dev.socrata.com/docs/functions/like.html)
  // and the raw agency name — no residual percent-encoding from a second pass.
  assert.equal(
    where,
    "upper(agency_name) like upper('%Parks & Recreation%')"
  );
  // The raw query string must encode % exactly once (%25, not %2525).
  const rawQuery = capturedUrl.split("?")[1];
  assert.ok(rawQuery.includes("%25"), "wildcard is URL-encoded once");
  assert.ok(!rawQuery.includes("%2525"), "wildcard is not double-encoded");
});
