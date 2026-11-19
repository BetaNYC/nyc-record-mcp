// get_open_solicitations (review of epic #33). Offline: the clock is fixed and fetch is mocked
// with a small dataset that answers both of the tool's queries the way NYC Open Data would:
// the open list (due_date > now OR due_date = today at 00:00, soonest first, $limit/$offset)
// and the extra query for amended and cancelled notices ($select, title prefix, posted in the
// last 400 days, newest first). Rows posted after "now" do not exist yet.
//
// Rows come from test/fixtures/solicitations.json: real solicitations pulled 2026-11-18, with
// contact fields removed. A test that needs a case the real rows lack DERIVES a row from a real
// one and says so in a comment.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clock, nyNow, nyToday } from "../dist/city-record.js";
import { callTool } from "../dist/tools.js";
import { NOTE_NO_TIME, NOTE_PLACEHOLDER, NOTE_CANCEL_UNMATCHED, noticeKind, matchKey } from "../dist/solicitations.js";

const REAL = JSON.parse(readFileSync(new URL("./fixtures/solicitations.json", import.meta.url), "utf8")).rows;
const row = (id) => {
  const r = REAL.find((x) => x.request_id === id);
  assert.ok(r, `fixture row ${id}`);
  return { ...r };
};

let fakeNow = 0;
function fixClock(t, iso) {
  fakeNow = Date.parse(iso);
  t.mock.method(clock, "now", () => fakeNow);
  t.mock.method(clock, "sleep", async () => {});
}

/** Mock NYC Open Data over `rows`. `amendments`: "ok", or a Response/Error for the extra query. */
function mockDataset(t, rows, { amendments = "ok", mainTakesMs = 0 } = {}) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    const p = new URL(String(url)).searchParams;
    calls.push(p);
    const today = nyToday(new Date(clock.now()));
    const exists = rows.filter((r) => r.start_date.slice(0, 10) <= today);
    const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    if (p.has("$select")) {
      if (amendments instanceof Error) throw amendments;
      if (amendments instanceof Response) return amendments;
      const since = p.get("$where").match(/start_date >= '([^']+)'/)[1];
      const fields = p.get("$select").split(",");
      const found = exists
        .filter((r) => ["Bid Extension:", "Correction:", "Cancel"].some((x) => r.short_title.startsWith(x)) && r.start_date >= since)
        .sort((a, b) => (a.start_date < b.start_date ? 1 : a.start_date > b.start_date ? -1 : a.request_id < b.request_id ? -1 : 1))
        .slice(0, Number(p.get("$limit")))
        .map((r) => Object.fromEntries(fields.filter((f) => f in r).map((f) => [f, r[f]])));
      return json(found);
    }
    const where = p.get("$where");
    const m = where.match(/due_date > '([^']+)' OR due_date = '([^']+)'/) ?? where.match(/due_date >=? '([^']+)'/);
    assert.ok(m, `no due_date comparison in ${where}`);
    const open = (d) => (m[2] !== undefined ? d > m[1] || d === m[2] : where.includes(">=") ? d >= m[1] : d > m[1]);
    const off = Number(p.get("$offset") ?? 0);
    const lim = Number(p.get("$limit"));
    const found = exists
      .filter((r) => r.type_of_notice_description === "Solicitation" && open(r.due_date))
      .sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : a.request_id < b.request_id ? -1 : 1))
      .slice(off, off + lim);
    fakeNow += mainTakesMs;
    return json(found);
  });
  return calls;
}

const call = async (args = {}) => {
  const r = await callTool("get_open_solicitations", args);
  assert.ok(!r.isError, r.content[0].text);
  return JSON.parse(r.content[0].text);
};
const ids = (body) => body.notices.map((n) => n.request_id);
const notesOf = (body, id) => body.notices.find((n) => n.request_id === id).betanyc_notes;

// ---------------------------------------------------------------- the open list and its clock

test("a deadline one hour ago is left out, one an hour ahead is kept", async (t) => {
  fixClock(t, "2026-11-18T13:35:00-05:00");
  const a = { ...row("20261106020"), request_id: "1", due_date: "2026-11-18T12:35:00.000" }; // derived: due times moved
  const b = { ...row("20261106020"), request_id: "2", due_date: "2026-11-18T14:35:00.000" };
  const calls = mockDataset(t, [a, b]);
  assert.deepEqual(ids(await call()), ["2"]);
  assert.equal(
    calls[0].get("$where"),
    "type_of_notice_description='Solicitation' AND (due_date > '2026-11-18T13:35:00.000' OR due_date = '2026-11-18T00:00:00.000')"
  );
});

test("the time is New York's, not UTC's, in the evening", async (t) => {
  fixClock(t, "2026-11-19T03:00:00Z"); // 10 p.m. EST on Nov 18; already Nov 19 in UTC
  const mk = (id, due) => ({ ...row("20261106020"), request_id: id, due_date: due }); // derived
  mockDataset(t, [mk("1", "2026-11-18T21:00:00.000"), mk("2", "2026-11-18T23:00:00.000")]);
  assert.deepEqual(ids(await call()), ["2"]);
});

test("across the spring and fall daylight-saving changes", async (t) => {
  // 2026-03-08: 2 a.m. EST jumps to 3 a.m. EDT. 07:30 UTC is 3:30 a.m. EDT.
  assert.equal(nyNow(new Date("2026-03-08T07:30:00Z")), "2026-03-08T03:30:00.000");
  // 2026-11-01: 2 a.m. EDT falls back to 1 a.m. EST, so 1:30 happens twice.
  assert.equal(nyNow(new Date("2026-11-01T05:30:00Z")), "2026-11-01T01:30:00.000");
  assert.equal(nyNow(new Date("2026-11-01T06:30:00Z")), "2026-11-01T01:30:00.000");
  assert.equal(nyNow(new Date("2026-07-07T04:00:05Z")), "2026-07-07T00:00:05.000", "midnight is 00, not 24");
  const mk = (id, due) => ({ ...row("20261106020"), request_id: id, start_date: "2026-02-01T00:00:00.000", due_date: due }); // derived
  fixClock(t, "2026-03-08T07:30:00Z");
  mockDataset(t, [mk("1", "2026-03-08T03:00:00.000"), mk("2", "2026-03-08T04:00:00.000")]);
  assert.deepEqual(ids(await call()), ["2"]);
});

// ---------------------------------------------------------------- Fix A: no closing time (00:00)

test("a 00:00 due time is listed all through its due day, with a note, and gone the next day", async (t) => {
  // Real row: FDNY EMS dispatch software, due 2026-01-07T00:00 (no time entered).
  const fdny = row("20251223003");
  for (const [at, listed] of [
    ["2026-01-07T09:00:00-05:00", true],
    ["2026-01-07T23:30:00-05:00", true],
    ["2026-01-08T00:30:00-05:00", false],
  ]) {
    fixClock(t, at);
    mockDataset(t, [fdny]);
    const body = await call();
    assert.equal(ids(body).includes(fdny.request_id), listed, at);
    if (listed) {
      assert.ok(notesOf(body, fdny.request_id).notes.includes(NOTE_NO_TIME), at);
      assert.equal(body.notices[0].due_date, "2026-01-07T00:00:00.000", "the City's due_date is unchanged");
    }
    t.mock.restoreAll();
  }
});

test("a 00:00 due time on daylight-saving days", async (t) => {
  const mk = (due) => ({ ...row("20251223003"), start_date: "2026-02-01T00:00:00.000", due_date: due }); // derived
  for (const [due, at, listed] of [
    ["2026-03-08T00:00:00.000", "2026-03-08T23:30:00-04:00", true], // spring forward day, EDT evening
    ["2026-03-08T00:00:00.000", "2026-03-09T00:30:00-04:00", false],
    ["2026-11-01T00:00:00.000", "2026-11-01T23:30:00-05:00", true], // fall back day, EST evening
    ["2026-11-01T00:00:00.000", "2026-11-02T00:30:00-05:00", false],
  ]) {
    fixClock(t, at);
    mockDataset(t, [mk(due)]);
    assert.equal((await call()).notices.length, listed ? 1 : 0, `${due} at ${at}`);
    t.mock.restoreAll();
  }
});

test("23:59 and other real clock times get no closing-time note", async (t) => {
  fixClock(t, "2026-11-18T13:35:00-05:00");
  mockDataset(t, [row("20260408021")]); // due 2026-12-31T23:59
  assert.deepEqual((await call()).notices[0].betanyc_notes.notes, []);
});

// ---------------------------------------------------------------- Fix B: placeholder due dates

test("a due date more than 366 days ahead is labeled a placeholder, and kept as published", async (t) => {
  fixClock(t, "2026-11-18T13:35:00-05:00");
  const sbhc = row("20260415039"); // real: due 2099-12-31T00:00, "OPEN-ENDED"
  mockDataset(t, [sbhc, row("20260408021")]);
  const body = await call();
  const notes = notesOf(body, sbhc.request_id).notes;
  assert.ok(notes.includes(NOTE_PLACEHOLDER));
  assert.ok(notes.includes(NOTE_NO_TIME), "00:00 too");
  assert.equal(body.notices.find((n) => n.request_id === sbhc.request_id).due_date, "2099-12-31T00:00:00.000");
  assert.ok(!notesOf(body, "20260408021").notes.includes(NOTE_PLACEHOLDER), "six weeks out is not a placeholder");
});

// ---------------------------------------------------------------- Fix C: amended and cancelled notices

test("titles are classified by their prefix only", () => {
  assert.equal(noticeKind("Bid Extension: New Elevator Maintenance"), "extension");
  assert.equal(noticeKind("Correction: Jacobi Building 1 Roof 2"), "correction");
  assert.equal(noticeKind("Cancellation: ACS - Sauces, Seasonings, Spices"), "cancellation");
  assert.equal(noticeKind("Correction: Cancellation: X"), "cancellation");
  assert.equal(noticeKind("New Elevator Maintenance and Repair Service"), "original");
  const doc = row("20260429002");
  assert.equal(doc.agency_name, "Correction", "the Department of Correction: an agency, not a prefix");
  assert.equal(noticeKind(doc.short_title), "original");
});

test("an extension folds its original, and the later deadline is the one listed", async (t) => {
  // Real: the Bid Extension 20260227028 (due 2026-04-20 11:30). DERIVED: its original, the same
  // PIN, agency and title without the prefix, posted earlier with an earlier deadline (the real
  // original is older than the rows pulled).
  const ext = row("20260227028");
  const orig = { ...ext, request_id: "20260206999", start_date: "2026-02-13T00:00:00.000", end_date: "2026-02-13T00:00:00.000",
    short_title: "New Elevator Maintenance and Repair Service", due_date: "2026-03-20T11:30:00.000" };
  fixClock(t, "2026-03-10T12:00:00-04:00");
  mockDataset(t, [orig, ext]);
  const body = await call();
  assert.deepEqual(ids(body), [ext.request_id]);
  assert.equal(body.notices[0].due_date, "2026-04-20T11:30:00.000");
  assert.deepEqual(body.notices[0].betanyc_notes.supersedes, [
    { request_id: orig.request_id, notice_kind: "original", start_date: orig.start_date, due_date: orig.due_date },
  ]);
  assert.equal(body.notices[0].betanyc_notes.notice_kind, "extension");
  assert.equal(body.folded_into_newer_notice, 1);
  assert.equal(body.city_notices_on_this_page, 2);
  assert.match(body.paging_note, /1 were folded .* so 1 are in notices\. Call again with include_superseded: true to list all 2/);
});

test("a correction is folded into the newer notice for the same solicitation", async (t) => {
  // Real: SBS "Venture Forward", a Correction posted 2025-12-19, then the plain title on 12-29.
  fixClock(t, "2026-01-05T10:00:00-05:00");
  mockDataset(t, [row("20251212006"), row("20251223006")]);
  const body = await call();
  assert.deepEqual(ids(body), ["20251223006"]);
  assert.deepEqual(body.notices[0].betanyc_notes.supersedes.map((s) => [s.request_id, s.notice_kind]), [["20251212006", "correction"]]);
});

test("a cancellation moves the solicitation to cancelled, even with a later due date than the original", async (t) => {
  // Real: the Cancellation 20260609061 (due 2026-08-19) and its original 20260616056 (due
  // 2026-07-08). DERIVED: the cancellation posted a day after the original (really the same day).
  const cancel = { ...row("20260609061"), start_date: "2026-06-17T00:00:00.000" };
  const orig = row("20260616056");
  fixClock(t, "2026-06-20T12:00:00-04:00");
  mockDataset(t, [orig, cancel]);
  const body = await call();
  assert.deepEqual(ids(body), [], "not presented as open");
  assert.equal(body.cancelled.length, 1);
  const c = body.cancelled[0];
  assert.deepEqual([c.request_id, c.agency_name, c.cancellation_posted], [cancel.request_id, cancel.agency_name, "2026-06-17T00:00:00.000"]);
  assert.match(c.short_title, /^Cancellation: 85726B0044/);
  assert.deepEqual(c.cancels.map((x) => x.request_id), [orig.request_id]);
  assert.match(body.paging_note, /0 were folded .* and 2 are listed under cancelled, so 0 are in notices/);
});

test("a cancellation and its original posted the same day are both listed, with a note", async (t) => {
  // Real: exactly as published. The request_id order would make the original "newest".
  fixClock(t, "2026-06-20T12:00:00-04:00");
  mockDataset(t, [row("20260616056"), row("20260609061")]);
  const body = await call();
  assert.deepEqual(ids(body).sort(), ["20260609061", "20260616056"]);
  for (const n of body.notices) assert.ok(n.betanyc_notes.notes.some((x) => /posted the same day/.test(x)), n.request_id);
  assert.equal(body.cancelled, undefined);
});

test("a cancellation found only by the extra query cancels the row on this page", async (t) => {
  // Real: the Cancellation 20260710019 (posted 2026-07-16, due 2026-09-03). DERIVED: its original,
  // still open on 2026-09-05 (due 2026-09-10), while the cancellation is past its due date.
  const cancel = row("20260710019");
  const orig = { ...cancel, request_id: "20260520999", start_date: "2026-06-01T00:00:00.000", end_date: "2026-06-01T00:00:00.000",
    short_title: "85726B0064-2600020 - Level 3 EVSE Distributed Power System", due_date: "2026-09-10T10:00:00.000" };
  fixClock(t, "2026-09-05T12:00:00-04:00");
  const calls = mockDataset(t, [orig, cancel]);
  const body = await call();
  assert.equal(calls.length, 2, "the main query and one extra query");
  assert.deepEqual(ids(body), []);
  assert.deepEqual(body.cancelled.map((c) => [c.request_id, c.cancels.map((x) => x.request_id)]), [[cancel.request_id, [orig.request_id]]]);
});

test("a cancellation with no match is listed, with its kind and a note", async (t) => {
  fixClock(t, "2026-08-01T12:00:00-04:00");
  mockDataset(t, [row("20260710019")]);
  const body = await call();
  assert.deepEqual(ids(body), ["20260710019"]);
  assert.equal(body.notices[0].betanyc_notes.notice_kind, "cancellation");
  assert.ok(body.notices[0].betanyc_notes.notes.includes(NOTE_CANCEL_UNMATCHED));
});

test("reused short PINs never fold, even with the same agency and title", async (t) => {
  // Real: PINs 3434, 11233, 1414 and 11260 are reused for unrelated notices. DERIVED: a copy of a
  // 3434 row with the identical title, posted later, still does not fold (PIN under 8 characters).
  const a = row("20260923024");
  const copy = { ...a, request_id: "20260930999", start_date: "2026-10-01T00:00:00.000", due_date: "2026-10-14T10:00:00.000" };
  for (const id of ["20260923024", "20260608067", "20260428031", "20260923026", "20260217024", "20260526018", "20260331040", "20260609058", "20251105014"]) {
    assert.equal(matchKey(row(id)), null, id);
  }
  fixClock(t, "2026-10-02T12:00:00-04:00");
  mockDataset(t, [a, copy]);
  const body = await call();
  assert.deepEqual(ids(body).sort(), [a.request_id, copy.request_id].sort());
  assert.equal(body.folded_into_newer_notice, 0);
});

test("the same PIN with a different agency, or a different title, does not fold", async (t) => {
  // Real: PIN 26202503, the same agency, two different titles. DERIVED: a copy of 20251223006
  // with another agency.
  fixClock(t, "2026-09-03T12:00:00-04:00");
  mockDataset(t, [row("20260825004"), row("20260825035")]);
  assert.equal((await call()).notices.length, 2);
  t.mock.restoreAll();
  const sbs = row("20251223006");
  const other = { ...sbs, request_id: "20251230999", start_date: "2025-12-30T00:00:00.000", agency_name: "Economic Development Corp" };
  fixClock(t, "2026-01-05T10:00:00-05:00");
  mockDataset(t, [sbs, other]);
  assert.equal((await call()).notices.length, 2);
});

test("include_superseded: true lists every notice, each labeled", async (t) => {
  fixClock(t, "2026-01-05T10:00:00-05:00");
  mockDataset(t, [row("20251212006"), row("20251223006")]);
  const body = await call({ include_superseded: true });
  assert.deepEqual(ids(body).sort(), ["20251212006", "20251223006"]);
  assert.equal(notesOf(body, "20251212006").superseded_by.request_id, "20251223006");
  assert.ok(notesOf(body, "20251212006").notes.some((x) => /^Folded by default/.test(x)));
  assert.equal(notesOf(body, "20251223006").supersedes[0].request_id, "20251212006");
  assert.equal(body.folded_into_newer_notice, 0);
});

test("when the extra query fails, the list still comes back, with a plain note", async (t) => {
  for (const failure of [new Response("bad", { status: 400 }), new TypeError("fetch failed")]) {
    fixClock(t, "2026-01-05T10:00:00-05:00");
    mockDataset(t, [row("20251212006"), row("20251223006")], { amendments: failure });
    const body = await call();
    assert.match(body.amendment_check, /^Amended, extended and cancelled notices could not be checked this time/);
    assert.deepEqual(ids(body), ["20251223006"], "rows on the same page still fold");
    t.mock.restoreAll();
  }
});

test("both requests share one 90-second budget, and the extra one is skipped when it is spent", async (t) => {
  fixClock(t, "2026-01-05T10:00:00-05:00");
  const calls = mockDataset(t, [row("20251223006")], { mainTakesMs: 95_000 });
  const body = await call();
  assert.equal(calls.length, 1, "no extra request after the budget is spent");
  assert.match(body.amendment_check, /could not be checked this time \(NYC Open Data did not answer within this call's 90-second limit/);
});

test("the extra query asks only what matching needs, and is skipped for an empty page", async (t) => {
  fixClock(t, "2026-01-05T10:00:00-05:00");
  let calls = mockDataset(t, [row("20251223006")]);
  await call();
  const extra = calls[1];
  assert.equal(extra.get("$select"), "request_id,start_date,due_date,pin,agency_name,short_title");
  assert.equal(extra.get("$limit"), "1001");
  assert.equal(extra.get("$order"), "start_date DESC,:id");
  assert.equal(
    extra.get("$where"),
    "type_of_notice_description='Solicitation' AND start_date >= '2024-12-01' AND " +
      "(short_title like 'Bid Extension:%' OR short_title like 'Correction:%' OR short_title like 'Cancel%')"
  );
  t.mock.restoreAll();
  fixClock(t, "2026-01-05T10:00:00-05:00");
  calls = mockDataset(t, []);
  await call();
  assert.equal(calls.length, 1);
});

test("a full amendment list says it was cut", async (t) => {
  fixClock(t, "2026-01-05T10:00:00-05:00");
  const many = Array.from({ length: 1001 }, (_, i) => ({ request_id: `9${i}`, start_date: "2025-12-01T00:00:00.000", due_date: "2026-01-01T00:00:00.000", pin: "X", agency_name: "Y", short_title: "Correction: Z" }));
  mockDataset(t, [row("20251223006")], { amendments: new Response(JSON.stringify(many), { status: 200 }) });
  assert.match((await call()).amendment_check, /More than 1000 amended or cancelled solicitations .* only the newest 1000 were checked/);
});

test("paging counts the City's notices, so offsets stay right after folding", async (t) => {
  // The correction and its newer notice are due the same day; the FDNY row is due later.
  fixClock(t, "2026-01-05T10:00:00-05:00");
  const later = { ...row("20251223003"), due_date: "2026-02-15T14:00:00.000" }; // derived: due date moved
  const calls = mockDataset(t, [row("20251212006"), row("20251223006"), later]);
  const first = await call({ limit: 2 });
  assert.equal(first.city_notices_on_this_page, 2);
  assert.equal(first.showing, 1);
  assert.equal(first.more_available, true);
  assert.match(first.how_to_get_more, /offset 2 /);
  const second = await call({ limit: 2, offset: 2 });
  assert.equal(calls.at(-2).get("$offset"), "2");
  assert.deepEqual(ids(second), [later.request_id]);
  assert.equal(second.more_available, false);
});

test("the City's fields are passed on unchanged; BetaNYC's additions are only under betanyc_notes", async (t) => {
  fixClock(t, "2026-11-18T13:35:00-05:00");
  const rows = [row("20260415039"), row("20260408021"), row("20261007001")];
  mockDataset(t, rows);
  for (const n of (await call()).notices) {
    const { betanyc_notes, ...fields } = n;
    assert.deepEqual(fields, rows.find((r) => r.request_id === n.request_id), n.request_id);
    assert.ok(betanyc_notes.notice_kind);
  }
});

test("the tool description says the due date and time have not passed, and names the labels", async () => {
  const { TOOLS } = await import("../dist/tools.js");
  const tool = TOOLS.find((x) => x.name === "get_open_solicitations");
  assert.match(tool.description, /due date and time, in New York, has not yet passed/);
  assert.match(tool.description, /betanyc_notes/);
  assert.equal(tool.inputSchema.properties.include_superseded.type, "boolean");
});
