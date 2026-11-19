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
import { callTool, arrangeOpenList } from "../dist/tools.js";
import { NOTE_NO_TIME, NOTE_PLACEHOLDER, NOTE_CANCEL_UNMATCHED, noticeKind, matchKey, foldOpenSolicitations } from "../dist/solicitations.js";

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
        .filter((r) => ["Bid Extension:", "Correction:", "Cancellation:"].some((x) => r.short_title.startsWith(x)) && r.start_date >= since)
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

test("only the three prefixes seen in the real data count, exactly as written", () => {
  assert.equal(noticeKind("Bid Extension: New Elevator Maintenance"), "extension");
  assert.equal(noticeKind("Correction: Jacobi Building 1 Roof 2"), "correction");
  assert.equal(noticeKind("Cancellation: ACS - Sauces, Seasonings, Spices"), "cancellation");
  assert.equal(noticeKind("New Elevator Maintenance and Repair Service"), "original");
  // Forms that are NOT in the 1,000 real rows are not read as amendments.
  for (const t of ["Bid Extension - New Elevator", "BID EXTENSION: X", "Bid extension: X", "Cancelled: X", "Cancel: X", "CANCELLATION: X", " Correction: X", "Correction - X"]) {
    assert.equal(noticeKind(t), "original", t);
  }
  const doc = row("20260429002");
  assert.equal(doc.agency_name, "Correction", "the Department of Correction: an agency, not a prefix");
  assert.equal(noticeKind(doc.short_title), "original");
});

test("a \"Bid Extension -\" title does not fold into the original", async (t) => {
  // DERIVED from the real Bid Extension 20260227028: the same notice with "Bid Extension -".
  const ext = { ...row("20260227028"), short_title: "Bid Extension - New Elevator Maintenance and Repair Service" };
  const orig = { ...ext, request_id: "20260206999", start_date: "2026-02-13T00:00:00.000", short_title: "New Elevator Maintenance and Repair Service", due_date: "2026-03-20T11:30:00.000" };
  fixClock(t, "2026-03-10T12:00:00-04:00");
  mockDataset(t, [orig, ext]);
  const body = await call();
  assert.equal(body.notices.length, 2);
  assert.equal(body.folded_into_newer_notice, 0);
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
  // The folded-into (current) row keeps every City field, due_date included, exactly.
  const { betanyc_notes, ...fields } = body.notices[0];
  assert.deepEqual(fields, ext);
  assert.deepEqual(betanyc_notes.supersedes, [
    { request_id: orig.request_id, notice_kind: "original", start_date: orig.start_date, due_date: orig.due_date },
  ]);
  assert.equal(betanyc_notes.notice_kind, "extension");
  assert.ok(!betanyc_notes.notes.some((x) => /Earlier notices .* later due date/.test(x)), "the newest due date is the later one");
  assert.equal(body.folded_into_newer_notice, 1);
  assert.equal(body.city_notices_on_this_page, 2);
  assert.match(body.paging_note, /1 older notice\(s\) were folded .* so 1 are in notices\. A cancellation never takes a solicitation off the list\. Call again with include_superseded: true to list all 2/);
});

test("the PIN must be at least 8 characters: 7 does not fold, 8 does", async (t) => {
  // DERIVED from the real Venture Forward pair (80126D0002), with the PIN cut to 7 and to 8.
  for (const [pin, foldsInto] of [["80126D0", null], ["80126D00", "20251223006"]]) {
    fixClock(t, "2026-01-05T10:00:00-05:00");
    mockDataset(t, [{ ...row("20251212006"), pin }, { ...row("20251223006"), pin }]);
    const body = await call();
    assert.equal(body.folded_into_newer_notice, foldsInto ? 1 : 0, `PIN ${pin}`);
    if (foldsInto) assert.deepEqual(ids(body), [foldsInto], `PIN ${pin}`);
    else assert.deepEqual(ids(body).sort(), ["20251212006", "20251223006"], `PIN ${pin}`);
    t.mock.restoreAll();
  }
});

test("a correction is folded into the newer notice for the same solicitation", async (t) => {
  // Real: SBS "Venture Forward", a Correction posted 2025-12-19, then the plain title on 12-29.
  fixClock(t, "2026-01-05T10:00:00-05:00");
  mockDataset(t, [row("20251212006"), row("20251223006")]);
  const body = await call();
  assert.deepEqual(ids(body), ["20251223006"]);
  assert.deepEqual(body.notices[0].betanyc_notes.supersedes.map((s) => [s.request_id, s.notice_kind]), [["20251212006", "correction"]]);
});

test("when the newest notice gives an earlier due date, the current row says so (JISH)", async (t) => {
  // Real: JISH (81622P0004), 2039-12-30 in the two older notices, 2026-12-31 in the newest.
  fixClock(t, "2026-11-18T13:35:00-05:00");
  mockDataset(t, [row("20260408021"), row("20260128026"), row("20251007002")]);
  const body = await call();
  assert.deepEqual(ids(body), ["20260408021"]);
  assert.equal(body.notices[0].due_date, "2026-12-31T23:59:00.000");
  assert.ok(body.notices[0].betanyc_notes.notes.some((x) => /^Earlier notices for this solicitation gave a different, later due date \(2039-12-30T23:59:00\.000 in request 20260128026; 2039-12-30T23:59:00\.000 in request 20251007002\)/.test(x)));
});

// ---- Cancellations never take a solicitation off the list (review of #33).

test("the reviewer's case: old round, re-bid, then a cancellation a day later; the re-bid stays listed", async (t) => {
  // DERIVED from the real truck-chassis pair (PIN 85726B0044): an old round, a re-bid of the same
  // PIN, agency and title, and a "Cancellation:" notice posted the day after the re-bid.
  const rebid = row("20260616056"); // posted 2026-06-16, due 2026-07-08
  const old = { ...rebid, request_id: "20260301999", start_date: "2026-03-05T00:00:00.000", end_date: "2026-03-05T00:00:00.000", due_date: "2026-07-01T10:30:00.000" };
  const cancel = { ...row("20260609061"), start_date: "2026-06-17T00:00:00.000" }; // due 2026-08-19
  fixClock(t, "2026-06-20T12:00:00-04:00");
  mockDataset(t, [old, rebid, cancel]);
  const body = await call();
  assert.deepEqual(ids(body), [rebid.request_id], "the re-bid is in notices; the old round is folded under it");
  const n = body.notices[0].betanyc_notes;
  assert.deepEqual(n.supersedes.map((x) => x.request_id), [old.request_id]);
  assert.ok(n.notes.some((x) => x === `A cancellation notice matches this solicitation (request ${cancel.request_id}, posted 2026-06-17): same PIN, agency and title. It may be cancelled, or the cancellation may refer to an earlier round. Read both notices or ask the agency.`), JSON.stringify(n.notes));
  assert.deepEqual(n.matching_cancellations.map((x) => x.request_id), [cancel.request_id]);
  // The cancellation notice itself is under cancelled: the City's full row, unchanged, plus a note.
  assert.equal(body.cancelled.length, 1);
  const { betanyc_notes, ...fields } = body.cancelled[0];
  assert.deepEqual(fields, cancel);
  assert.deepEqual(betanyc_notes.matches.map((x) => x.request_id).sort(), [old.request_id, rebid.request_id].sort());
  assert.ok(betanyc_notes.notes.some((x) => /^This cancellation notice matches .*None of them is taken off the list/.test(x)));
});

test("a cancellation with a later due date than the original never hides it", async (t) => {
  // Real rows 20260609061 (Cancellation, due 2026-08-19) and 20260616056 (due 2026-07-08).
  // DERIVED: the cancellation posted a day after the original (really the same day).
  const cancel = { ...row("20260609061"), start_date: "2026-06-17T00:00:00.000" };
  const orig = row("20260616056");
  fixClock(t, "2026-06-20T12:00:00-04:00");
  mockDataset(t, [orig, cancel]);
  const body = await call();
  assert.deepEqual(ids(body), [orig.request_id]);
  assert.ok(body.notices[0].betanyc_notes.notes.some((x) => /^A cancellation notice matches this solicitation/.test(x)));
  assert.deepEqual(body.cancelled.map((c) => c.request_id), [cancel.request_id]);
  assert.match(body.paging_note, /0 older notice\(s\) were folded .* and 1 matched cancellation notice\(s\) are listed under cancelled, so 1 are in notices/);
});

test("a cancellation and its original posted the same day: the original stays, with a note", async (t) => {
  // Real: exactly as published (the truck-chassis pair, PIN 85726B0044, both 2026-06-16).
  fixClock(t, "2026-06-20T12:00:00-04:00");
  mockDataset(t, [row("20260616056"), row("20260609061")]);
  const body = await call();
  assert.deepEqual(ids(body), ["20260616056"]);
  assert.ok(body.notices[0].betanyc_notes.notes.some((x) => /posted 2026-06-16, the same day as this notice/.test(x)));
  assert.deepEqual(body.cancelled.map((c) => c.request_id), ["20260609061"]);
});

test("a cancellation found only by the extra query adds a note; the row stays listed", async (t) => {
  // Real: the Cancellation 20260710019 (posted 2026-07-16, due 2026-09-03). DERIVED: its original,
  // still open on 2026-09-05 (due 2026-09-10), while the cancellation is past its due date.
  const cancel = row("20260710019");
  const orig = { ...cancel, request_id: "20260520999", start_date: "2026-06-01T00:00:00.000", end_date: "2026-06-01T00:00:00.000",
    short_title: "85726B0064-2600020 - Level 3 EVSE Distributed Power System", due_date: "2026-09-10T10:00:00.000" };
  fixClock(t, "2026-09-05T12:00:00-04:00");
  const calls = mockDataset(t, [orig, cancel]);
  const body = await call();
  assert.equal(calls.length, 2, "the main query and one extra query");
  assert.deepEqual(ids(body), [orig.request_id]);
  assert.ok(body.notices[0].betanyc_notes.notes.some((x) => x.startsWith(`A cancellation notice matches this solicitation (request ${cancel.request_id}, posted 2026-07-16)`)));
  assert.equal(body.cancelled, undefined, "the cancellation is not on this page, so it is named, not listed");
});

test("an earlier cancellation is named on a later notice, which stays listed", async (t) => {
  // DERIVED: a cancellation of an old round, then a new notice with the same PIN, agency and title.
  const cancel = { ...row("20260609061"), start_date: "2026-06-10T00:00:00.000" };
  const rebid = { ...row("20260616056"), due_date: "2026-07-20T11:00:00.000" };
  fixClock(t, "2026-06-20T12:00:00-04:00");
  mockDataset(t, [rebid, cancel]);
  const body = await call();
  assert.deepEqual(ids(body), [rebid.request_id]);
  assert.ok(body.notices[0].betanyc_notes.notes.some((x) => /^An earlier cancellation notice matches this solicitation .* so it may be a new round/.test(x)));
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
  const r = await callTool("get_open_solicitations", { include_superseded: true });
  const body = JSON.parse(r.content[0].text);
  assert.deepEqual(ids(body).sort(), ["20251212006", "20251223006"]);
  assert.equal(notesOf(body, "20251212006").superseded_by.request_id, "20251223006");
  assert.ok(notesOf(body, "20251212006").notes.some((x) => /^Without include_superseded this notice is folded/.test(x)));
  assert.equal(notesOf(body, "20251223006").supersedes[0].request_id, "20251212006");
  assert.equal(body.folded_into_newer_notice, 0);
  // Nothing is folded or moved in this mode, and the answer's lines do not say otherwise.
  const line = r.content.at(-1).text;
  assert.match(line, /^BetaNYC modified this data: listed every notice on this page as NYC Open Data sent it, kept due times of 00:00 listed through their day and added labels under betanyc_notes; nothing was folded or moved\. /);
  assert.doesNotMatch(line, /left some records out|folded,|listed apart/);
  assert.match(body.paging_note, /include_superseded is on, so nothing was folded or moved/);
});

test("include_superseded: true moves no cancellation notice", async (t) => {
  // The reviewer's shape (derived from PIN 85726B0044 rows, as above).
  const rebid = row("20260616056");
  const cancel = { ...row("20260609061"), start_date: "2026-06-17T00:00:00.000" };
  fixClock(t, "2026-06-20T12:00:00-04:00");
  mockDataset(t, [rebid, cancel]);
  const body = await call({ include_superseded: true });
  assert.deepEqual(ids(body).sort(), [cancel.request_id, rebid.request_id].sort());
  assert.equal(body.cancelled, undefined);
  assert.ok(notesOf(body, rebid.request_id).notes.some((x) => /^A cancellation notice matches this solicitation/.test(x)));
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

test("a bad answer to the extra query ([null], bad rows) never fails the call", async (t) => {
  const bad = [[null], [1, "x", []], [{ request_id: 5 }], [{ request_id: "1", start_date: "2026-01-01T00:00:00.000", due_date: "x", agency_name: "Y", short_title: "Correction: Z", pin: 12345678 }]];
  for (const rows of bad) {
    fixClock(t, "2026-01-05T10:00:00-05:00");
    mockDataset(t, [row("20251212006"), row("20251223006")], { amendments: new Response(JSON.stringify(rows), { status: 200 }) });
    const r = await callTool("get_open_solicitations", {});
    assert.ok(!r.isError, `${JSON.stringify(rows)}: ${r.content[0].text}`);
    const body = JSON.parse(r.content[0].text);
    assert.deepEqual(ids(body), ["20251223006"], JSON.stringify(rows));
    assert.match(body.amendment_check, /did not look like a notice; (it was|they were) skipped/, JSON.stringify(rows));
    t.mock.restoreAll();
  }
});

test("a failure while folding falls back to the page, with a plain note and no stack lines", async () => {
  const page = { notices: [row("20251212006"), row("20251223006")], offset: 0, more: false, amendments: [] };
  const opts = { now: new Date("2026-01-05T15:00:00Z"), includeSuperseded: false };
  let calls = 0;
  const flaky = (rows, amendments, o) => {
    calls++;
    if (amendments !== null) throw new TypeError("Cannot read properties of null (reading 'pin')\n    at matchKey (file:///x/solicitations.js:1:1)");
    return foldOpenSolicitations(rows, amendments, o);
  };
  const out = arrangeOpenList(page, opts, flaky);
  assert.equal(calls, 2);
  assert.deepEqual(out.folded.notices.map((n) => n.request_id), ["20251223006"], "the page still folds on its own");
  assert.equal(out.amendmentNote, "Amended, extended and cancelled notices could not be checked this time (Cannot read properties of null (reading 'pin')). Notices on other pages or past their due date were not checked, so a notice here may have a newer deadline or a cancellation notice.");
  const broken = () => { throw new Error("no"); };
  const last = arrangeOpenList(page, opts, broken);
  assert.deepEqual(last.folded.notices, page.notices, "the City's rows, as sent");
  assert.match(last.amendmentNote, /labels could not be added either \(no\)/);
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
      "(short_title like 'Bid Extension:%' OR short_title like 'Correction:%' OR short_title like 'Cancellation:%')"
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
