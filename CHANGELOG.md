# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-11-19

Prepared as 1.3.0 (PRs #19, #20 and #34 to #39) and released as 2.0.0, because it changes
what callers get back: see Breaking changes.

Adds `about_data`, the third tool BetaNYC adds to each of its MCP servers, and
`DATA-SOURCES.json`, the file it answers from. Moves to BetaNYC's shared module 1.5.2
(`src/betanyc-tools.ts`; `scripts/whats_changed.py`, `scripts/mcp_shared/data-sources.schema.json`,
`scripts/tests/catalog_validate.py` are 1.4.1; all copied unchanged), whose answer to "is this data official?"
names the source, its publisher and a link: "Publisher: NYC Department of Citywide
Administrative Services. BetaNYC did not modify it. Source: City Record Online, …".
Part of BetaNYC/betanyc-ai-workspace#1655 and #1672 (epic #1652).

### Breaking changes

What a caller must do differently, compared with 1.2.0:

1. **Answer shape (all seven City Record tools).** `content[0].text` is now a JSON object, not
   a bare list, and the Source line is a second text block, always last. Read the notices with
   `JSON.parse(result.content[0].text).notices`, and do not join the blocks before parsing.
   Details below.
2. **`get_open_solicitations` is BetaNYC's arrangement, not the official record.** By default
   an older extended or corrected notice is folded under the newest one, and a matched
   cancellation notice moves to `cancelled`, so `notices` can hold fewer rows than the City sent.
   Count the City's rows with `city_notices_on_this_page`; ask for every row with
   `include_superseded: true`; cite the official record (City Record Online) named in the
   Source line, which now begins "BetaNYC modified this data".
3. **Each open-solicitation notice gains a `betanyc_notes` key.** The City's own fields are
   unchanged. Code that copies or compares every key of a notice should skip `betanyc_notes`.
4. **`get_open_solicitations` uses the time, not only the date.** A solicitation due earlier
   today is no longer listed; one whose due time is 00:00 (no time entered) stays listed through
   its due day. Do not expect the same list as 1.2.0 for the same day.
5. **Arguments that used to be sent are now refused.** `limit` must be a whole number of at
   least 1 (`0`, `-3` and `2.5` are refused; above the maximum is lowered, with a `note`, where
   1.2.0 refused it). `offset` must be a whole number of at least 0.
   `get_notices_by_date_range` refuses a date that does not exist (`2026-02-31`) and a start
   after the end, where 1.2.0 answered with an empty list. Send whole numbers and real dates,
   and check `isError`.
6. **Error text.** A bad value now gets one plain sentence instead of zod's JSON list of
   issues, and an API error carries up to 500 characters of NYC Open Data's answer (was 300).
   Do not parse error text; check `isError`.

#### The answer shape (item 1)

The seven City Record tools answer in a new shape. A program that parses the answer text must
change; an AI app reading the answer needs nothing.

- Old shape (1.2.0 and earlier): one text block, and `content[0].text` was a bare JSON list:
  `[{"request_id": "…", "agency_name": "…", …}, …]`.
- New shape (2.0.0): two text blocks. `content[0].text` is a JSON object, and nothing else:
  `{"showing": 25, "offset": 0, "more_available": true, "how_to_get_more": "…", "notices": [{…}, …], "source": {…}}`
  (`how_to_get_more` only when more match, `note` only when `limit` was lowered). The last
  block is the human-readable `Source: …` line.

How to update your code:

    notices = JSON.parse(result.content[0].text).notices   // was: JSON.parse(result.content[0].text)
    // Do not join the text blocks before parsing: the Source line is its own, last block.

#### `get_open_solicitations` (items 2 and 3)

- By default `notices` can hold fewer rows than the City sent: an older extended or corrected
  notice is folded under the newest notice for the same solicitation (named by request_id and
  dates in its `betanyc_notes.supersedes`), and a matched cancellation notice is listed under
  `cancelled`. `city_notices_on_this_page` gives the City's count; `include_superseded: true`
  returns every row.
- Each notice gains a `betanyc_notes` key (BetaNYC's labels). All of the City's own fields are
  unchanged. Code that copies every key of a notice should skip `betanyc_notes`.

### Added

- `about_data`: where the data comes from (publisher, link, official or not, how it is
  gathered, what BetaNYC changes, how current it is, coverage and gaps, terms and credit
  line, where to check a notice and where to report an error, which tools use it), and
  BetaNYC's contact address for data questions, lab@beta.nyc. `topic` takes the source id or
  a tool name, in any case. Reads the file shipped in the package; no network.
- `DATA-SOURCES.json`: one source, City Record Online (NYC Open Data `dg92-zbpx`), published
  by the NYC Department of Citywide Administrative Services (named in full, as module 1.4.0
  requires), an official record passed on unchanged and fetched live. Publisher, update
  frequency (daily) and the City Record Online link come from the dataset's own NYC Open Data
  metadata. The terms are the ones BetaNYC uses for every NYC Open Data source: "No
  restrictions on use", NYC Administrative Code § 23-502(d). Coverage, and the finding that about 88% of the
  notices are "Changes in Personnel" listings (from July 2013, with no notice type), come from
  read-only queries to the dataset on 2026-11-13. Terms: NYC Administrative Code § 23-502(d).
  Errors in the dataset go to NYC Open Data's contact form, credited to NYC Open Data with
  `report_errors.upstream_name` (new in module 1.3.7); a caveat adds that City Record Online
  sends questions about a notice's content to the agency or contact named in it. The three Correction entries
  in `WHATS-CHANGED.md` are linked to it.
- `data.json`, the DCAT-US 3.0 catalog generated from `DATA-SOURCES.json` with
  `whats_changed.py about-data catalog` (never edited by hand). No `croissant.json`: the
  server publishes no data files of its own.
- Server instructions: one sentence on what the server covers, then the shared module's
  `BETANYC_INSTRUCTIONS` (call `about_data` for questions about sources, freshness and
  accuracy).
- The validator kit, copied unchanged from the workspace: `scripts/tests/catalog_validate.py`,
  `scripts/mcp_shared/data-sources.schema.json` and `scripts/mcp_shared/vendor/dcat-us-3.0.0/`.

### Changed

- `src/betanyc-tools.ts` is the workspace's shared module 1.5.2 (was 1.2.4), and
  `scripts/whats_changed.py` and `scripts/mcp_shared/data-sources.schema.json` are 1.4.1, all
  copied in unchanged. Never edit the copies. Module 1.5.0 adds the helpers below for the
  server's own tools (#21, #28). Module 1.5.1 (BetaNYC/betanyc-ai-workspace#1702, commit
  `17938f2`; raw file sha256 `567838e0…a72d`, stamp hash on line 2 `e1e15642…a96`) tightens
  them: `assertEveryToolAnnotated` requires `readOnlyHint: true`, a boolean `openWorldHint`
  and a non-empty title; in `annotateTools` a tool's own declared hint wins; the Source line
  of a live answer gives the fetch time in New York time to the minute, and the `source`
  object gains `retrieved_at` (and `as_of_kind: "source"` when a live answer carries the
  data's own date, which this server's answers do not); source links with a username or
  password, and control characters in names, are refused; `toolError` scrubs more encoded
  forms of a secret and ignores secrets under 8 characters. Module 1.5.2 (commit `bbc1671`;
  raw file sha256 `bcc117e7…2b33`, 125,208 bytes; the stamp hash on line 2, `eb29cbfb…`, is a
  different number by design): `toolError` drops stack-frame lines from the caller's message and
  caps it at 1,000 characters; `errorSummary` gives the first plain line of an unknown error
  (used for every error this server did not write itself); `provenance()` takes
  `changedByBetanyc` and then says "BetaNYC modified this data: …" in about_data's words, which
  `get_open_solicitations` uses.
- Every tool carries MCP `annotations`: `readOnlyHint: true`, a `title`, and `openWorldHint`
  (`true` for the seven City Record tools, which query NYC Open Data live; `false` for the
  three shared tools, which read files in the package). Set with the shared `annotateTools`.
- Requests to NYC Open Data (#22): a 30-second timeout, a User-Agent naming the package and
  version, and at most two retries on HTTP 429 or 5xx, waiting for `Retry-After` (seconds or
  an HTTP-date, capped at 10 s; else 1 s then 2 s). No polling or cache: one request per call.
- The optional `SOCRATA_APP_TOKEN` goes in the `X-App-Token` header (Socrata's preferred
  method for SODA 2.x), no longer in the URL as `$$app_token` (#26).
- Errors (#30): every failure is an `isError` result from the shared `toolError`, a plain
  sentence saying what went wrong and what to try. A bad argument value no longer returns
  zod's JSON issue list; an API error carries at most 500 characters of the API's answer
  (was 300); stack lines are dropped and the app token is redacted. The call dispatch moved
  from `src/index.ts` to `callTool` in `src/tools.ts` so it can be tested without stdio.
- Answers (#23, #24, #25): every City Record tool now answers with a JSON object instead of a
  bare array: `showing`, `offset`, `more_available`, `how_to_get_more` (when more match),
  `notices`, and `source` (the shared `provenance()` object: source, publisher, link, the
  time it was fetched, `as_of_kind: "retrieved"`, `retrieved_at`). The shared one-line Source
  line is a second text block, always last, so `content[0].text` stays valid JSON (see
  Breaking). The server asks NYC Open Data for one row more than `limit` to tell whether more
  match, without a second count query.
- New optional `offset` parameter (integer, 0 or more) on all seven City Record tools, sent
  as `$offset`; the order gains `:id` as a tie-breaker so pages are stable, as Socrata
  advises. Defaults and maximums are unchanged (default 25, or 50 for a date range; at most
  100, or 200).
- `DATA-SOURCES.json`: the limit caveat says the answer reports more matches and `offset`
  gets them; `data.json` rebuilt.
- `search_notices` waits up to 60 seconds instead of 30 (#22, with the written reason in
  `src/city-record.ts`): on 2026-11-18 NYC Open Data took 29 s, 35 s and over 120 s to answer
  a several-word full-text search, and 8.9 s for one word. The timeout message now suggests
  the faster agency, type and date tools.
- Server instructions (#32): one answer guide for the seven City Record tools, said once
  (the answer's fields and how to get more, cite the Source line, what an empty answer means,
  the Changes in Personnel listings, keyword search can be slow), before the shared about_data
  paragraph. `get_notices_by_type`'s description no longer repeats the type list its schema
  already gives as an `enum`.
- Evaluation set (#27): `eval/questions.json`, 11 questions with answers found first by direct
  queries to the dataset on 2026-11-18, replayed offline from `eval/fixtures/` by
  `npm run eval` (`-- --record` to record missing fixtures live). Results in
  `eval/results.json`: 9 of 11. Q02 fails because NYC Open Data did not answer that
  full-text search within 60 seconds (the recorded fixture is the timeout). Q03 was first
  scored a pass, wrongly: its expected answer had closed at 10:00, before the 13:35 run, so
  the fair score was 9 of 11. Its expected answer is corrected (every notice must be due
  after the time asked); the corrected query was never recorded, so Q03 fails offline until
  it is recorded live. The replay fixes the server's clock at `asked_at` in
  `eval/questions.json`, and fixture keys write that moment as `<now>`.
- Live tests (#29): `test/live/`, run only by `npm run test:live`, never by `npm test` or CI.
- One tool call spends at most 90 seconds on NYC Open Data, across every try and wait
  (`CALL_BUDGET_MS`): a try's timeout is cut to what is left, and no retry starts once it is
  spent. Before, `search_notices` could take about 200 seconds (three 60-second tries plus
  waits).
- `limit` is a whole number of at least 1, advertised as `type: integer`, `minimum: 1`,
  `maximum` 100 (200 for a date range). A whole number above the maximum is lowered to it and
  the answer's `note` says so; before, it was refused. `offset` must be a whole number of at
  least 0.

### Fixed

From the review of epic #33.

- `get_open_solicitations` counted a deadline from earlier the same day as open, because it
  compared `due_date` with the bare date. It now compares with the date and time in New York,
  in the dataset's floating-timestamp form (`due_date > '2026-11-18T13:35:00.000'`), so a
  solicitation due at 10:00 leaves the list at 10:00. The clock can be fixed in tests
  (`clock` in `src/city-record.ts`). The tool description says "due date and time, in New
  York, has not yet passed".
- `limit: 0` answered "call again with offset 0" forever, and `limit: -3` or `2.5` went to
  NYC Open Data as bad queries. Each is now refused with a plain sentence, before any request.
- A 200 answer that was not JSON, a JSON object instead of a list, or a body that timed out
  while being read came back as a raw JavaScript error. The body is now read inside the
  request's error handling and checked to be a list; each case is a plain upstream error.
- `get_notices_by_date_range` accepted impossible dates such as `2026-02-31`, and a start
  after the end silently found nothing. Both are refused with a plain sentence.
- A comment in `src/city-record.ts` began with a stray tag; reworded.
- `get_open_solicitations`, BetaNYC's reading of the list (owner's request in the review of #33;
  evidence: the 1,000 newest solicitations, pulled 2026-11-18). Every notice keeps its fields as
  published; BetaNYC's additions are under its `betanyc_notes` and in the answer's own fields.
  - A due time of 00:00 means no closing time was entered (9 of the 1,000; 17.8% of all
    solicitations, mostly 2003-2008). Such a notice now stays listed through the end of its due
    date (`due_date > now OR due_date = today at 00:00`, so paging stays right), with a note to
    check the notice or the agency for the real time. Before, it left the list at the start of
    its due day.
  - A due date more than 366 days ahead gets a note that it looks like a placeholder for an
    open-ended or long-term solicitation. The row is still listed, `due_date` unchanged.
  - Amended notices are new rows. Each notice gets `notice_kind` from its title prefix
    (`extension` "Bid Extension:", `correction` "Correction:", `cancellation` "Cancellation:",
    exactly as written in the data, else `original`). Notices with the same PIN (8 characters
    or more), agency and title without the prefix are one solicitation: the newest extension,
    correction or original by posting date is listed, with `supersedes`, and a note when it
    gives an earlier due date than the older ones. When the two newest were posted the same day
    nothing is folded and both get a note. A cancellation never takes a solicitation off the
    list (review of #33: an agency can re-bid under the same PIN and title and then cancel the
    old round): the solicitation stays listed with a note naming each matching cancellation,
    and a matched cancellation notice on the page is listed under `cancelled` as the City's
    full row. With `include_superseded: true` nothing is folded or moved. One extra request per
    call (amended and cancelled solicitations posted in the last 400 days, at most 1,000, inside
    the same 90-second budget) finds amendments on other pages; if it fails, the list comes back
    with a note. New `include_superseded` lists every notice, labeled. New answer fields:
    `city_notices_on_this_page`, `folded_into_newer_notice`, `cancelled`, `paging_note`,
    `amendment_check`; `offset` and `more_available` still count the City's notices.
  - `other_info_1` is named in the known-fields comment: when it holds a date and time, that is
    the pre-bid meeting, not the deadline.
- `DATA-SOURCES.json` has two entries for the same dataset (owner's rule: "If we've changed the
  data in any way, this is the only option"). `open-solicitations` covers
  `get_open_solicitations` and says BetaNYC modified it (`changes.changed: true`, steps
  `filtered` and `reshaped`, with a plain `detail`), so `about_data` answers "BetaNYC modified
  this data … should not be considered the official record. Official record: City Record
  Online …". `city-record` keeps the other six tools, not modified; its `how_gathered` now
  says exactly what they do (one page of the City's rows as sent, in the order the query asks
  for, plus BetaNYC's own separate fields; nothing dropped, folded, re-sorted or rewritten).
  The open-solicitations correction moved to the new entry. `data.json` rebuilt.
- `get_open_solicitations` answers match: the Source line comes from the shared `provenance()`
  with `changedByBetanyc`, so it says, as `about_data` does, "BetaNYC modified this data: left
  some records out and reshaped it. This copy should not be considered the official record. …
  Official record: City Record Online …" (the steps are read from `DATA-SOURCES.json` at
  start), and `source` carries `changed_by_betanyc`. With `include_superseded: true` it says
  only what was done: every notice listed as sent, labels added, nothing folded or moved.
- `ANSWER_GUIDE` no longer says all seven tools give the notices exactly as published: six do;
  `get_open_solicitations` is BetaNYC's arrangement, each listed row keeping the City's fields.
- A bad answer to the amended-notice check (for example `[null]`) no longer fails the call:
  rows that do not look like notices are skipped and counted, and the folding runs in a guarded
  step (`arrangeOpenList`) that falls back to the page alone with a plain note.
- README: a `%` or `_` in an agency name is passed to the `like` match as typed, where it acts
  as a wildcard (no escape is used: the Socrata docs this repo cites do not give one).
- The server lists 10 tools instead of 9; `about_data`'s description lists this server's topic.
- `package.json` `files` adds `DATA-SOURCES.json` and `data.json`.
- README: `about_data` in the tool table and the shared tools section. The "Data source"
  section no longer says the dataset holds notices "since 2015" (2015 is when the dataset was
  made public; its notices go back to 2003), and it notes that about 88% are Changes in
  Personnel listings with no notice type.
- CI: a new `about-data` job (the tool list from the built server, `about-data check
  --tools-file`, `about-data catalog --check`, and the JSON Schema and DCAT-US 3.0 validators
  with pinned `jsonschema` 4.26.0, `referencing` 0.37.0 and `rfc3987` 1.3.8). The release
  workflow runs `about-data check --release` before `npm publish`.

### Tests

- `test/about-data.test.mjs`: every listed tool has a source (`assertEveryToolExplained`,
  which also fails on an unknown tool); the topic in the description; the source's publisher,
  link, official and live status, unchanged figures, error route and corrections; every tool
  name as a topic; a bad topic and an unknown key; the server instructions; module 1.5.2.
- `test/betanyc-tools.test.mjs`: three shared tools, read-only with an output schema;
  `about_data` over stdio answers with lab@beta.nyc and passes the SDK client's output-schema
  check, and the server's instructions name `about_data`; `npm pack --dry-run` lists
  `DATA-SOURCES.json` and `data.json`.
- `test/strict-schema.test.mjs` and `test/tools.test.mjs`: `about_data` among the shared tools.
- `test/tools.test.mjs`: every tool annotated (`assertEveryToolAnnotated`), read-only with a
  title, and only the seven City Record tools open-world (#21).
- `test/tool-size.test.mjs`: tools/list JSON plus the instructions stay within 15,500
  characters (measured 14,836 on 2026-11-18), using the shared `toolListSize` (#28).
- `test/upstream.test.mjs`: User-Agent and timeout on every request; the token in
  `X-App-Token` and never in the URL; 429 retried with `Retry-After`; 5xx retried twice then a
  plain error; 400 not retried, body cut at 500; timeout and network failure sentences; the
  token absent from every error text; a bad value and an unknown tool as plain `isError`.
- `test/soql.test.mjs`: the two tests of the old 300-character error message now check that
  the API's body travels apart from the plain message (cutting is tested in `upstream`).
- `test/answers.test.mjs`: `SOURCE` matches `DATA-SOURCES.json`; every City Record tool's
  answer names the source, publisher and link and an as-of at the time of the call; with a
  500-notice fixture, a list cut at its limit says more are available and how, the next page
  continues where the last stopped, the last page and an empty answer say nothing more; the
  limits stay capped and `offset` must be a whole number from 0.
- `test/tool-size.test.mjs`: budget raised to 16,000 for the `offset` parameter (measured
  15,606), with a dated note.
- `test/open-solicitations.test.mjs` (new): with a fixed clock, a deadline one hour ago is
  left out and one an hour ahead kept; New York time in the evening; across the spring and
  fall daylight-saving changes.
- `test/answers.test.mjs`: `JSON.parse(content[0].text)` works for every City Record tool
  and the Source line is the last block; `limit` 0, -3, 2.5 refused with nothing sent, above
  the maximum lowered with a note; `offset` -1 and 2.5 refused; the advertised limit schema;
  impossible dates and a start after the end refused.
- `test/upstream.test.mjs`: a 200 that is not JSON, a JSON object, and a body that times out
  are plain errors; with a fake clock, no retry starts after 90 seconds, and a try cut short by
  the budget says so.
- `test/open-solicitations.test.mjs` also covers the labels and folding, from real rows in
  `test/fixtures/solicitations.json` (contact fields removed; rows derived from a real one are
  marked): 00:00 kept through its due day and on daylight-saving days; placeholders; an
  extension and a correction folded; a cancellation never removing a solicitation (including
  the reviewer's case: an old round, a re-bid, then a cancellation a day later), the
  cancellation notice listed under `cancelled` as the full row; same-day pairs; reused short
  PINs and the 8-character boundary (7 does not fold, 8 does); another agency or title never
  folded; only the exact prefixes; the folded current row's fields unchanged; a note when the
  newest due date is earlier; `include_superseded` folding and moving nothing; the extra query
  failing, returning `[null]` or bad rows, cut at 1,000, skipped when the budget is spent; a
  folding failure falling back to the page; paging after folding; the City's fields unchanged.
- `test/about-data.test.mjs`: `about_data` says BetaNYC modified `get_open_solicitations` (the
  plain words of the detail, and the "modified" answer) and says the other six are not.
  `test/answers.test.mjs`: the open list's Source line and `source` say so too, and the six
  unchanged tools return the City's rows untouched, in the order sent.
- Eval Q12 (an extended bid, folded) and Q13 (a 00:00 due date kept with a note), each at its
  own `asked_at`, with fixtures built from rows of a direct query on 2026-11-18 (not recorded
  through the server). Offline score 11 of 13; Q02 and Q03 still fail as described above.
- `test/tool-size.test.mjs`: budget raised to 17,000 (measured 16,517) for the limit schema
  and the two-block answer guide, with a dated note.
- `test/eval.test.mjs`: at least 10 questions, unique ids, each with checks; the offline
  replay gives the same pass/fail per question as `eval/results.json` (#27).
- `test/stdout.test.mjs`: starts the built server, sends initialize, tools/list and two tool
  calls, and checks every stdout line is a JSON-RPC message (fails on a stray `console.log`,
  checked by adding one) (#31).
- `test/tool-size.test.mjs`: the answer guide is in the instructions and no tool description
  repeats it; budget raised to 16,500 for it (measured 16,104), with a dated note (#32).
- `test/upstream.test.mjs`: the timeout message names 60 seconds for `search_notices`.

## [1.2.0] - 2026-11-13

Adds `whats_changed` and `about_betanyc`, the two tools BetaNYC is adding to each of its MCP
servers, and `WHATS-CHANGED.md`, the reader-facing record of changes. Tracking: BetaNYC/betanyc-ai-workspace#1645 (epic #1637).

### Added

- `whats_changed`: what changed in this server, newest first, from `WHATS-CHANGED.md`
  (filters: `since`, `tag`, `limit`). Answers with readable text and `structuredContent`
  matching a declared `outputSchema`. Reads the file shipped in the package; no network.
- `about_betanyc`: who built the server, the repository, where to report a bug in this
  server or ask for a new feature, and BetaNYC's links.
- `src/betanyc-tools.ts`, copied unchanged from the workspace's
  `scripts/mcp_shared/betanyc-tools.ts` (v1.2.1). Never edit the copy; change the canonical
  file and copy it again. Its two tools are appended to `TOOLS` and answered first in the
  `CallTool` handler. They validate their own arguments (unknown keys rejected by name), so
  they have no entry in `SCHEMAS`.
- `src/version.ts`: the package version, read from package.json, shared by the server and
  `about_betanyc`.
- `WHATS-CHANGED.md`, backfilled to 1.0.0, shipped in the npm package (`files`). No site:
  GitHub's rendering of the file is the page, linked near the top of the README.
- `scripts/whats_changed.py`, copied unchanged from the workspace (v1.2.1). CI runs a
  `whats-changed` job with `check --base-ref` (old entries are append-only, and a version
  bump needs an entry). The release workflow runs `check --release` before `npm publish`,
  so a release cannot ship while the `WHATS-CHANGED.md` entry still says `Unreleased`.

### Changed

- 9 tools instead of 7 (README, with a reference section for the two new ones).
- README "Releases" has the release-day steps for dating the `WHATS-CHANGED.md` entry.

### Tests

- `test/betanyc-tools.test.mjs`: both tools listed with output schemas and read-only
  annotations; `whats_changed` answers from this repo's file with every entry valid, and its
  filters and argument errors; `about_betanyc`; both answers pass the SDK client's own
  `outputSchema` validation over stdio, and an existing tool still rejects an unknown key
  there; `npm pack --dry-run` lists `WHATS-CHANGED.md`.

## [1.1.1] - 2026-11-09

### Added

- `server.json` and `mcpName` in package.json, so the server can be listed in
  the official MCP Registry as `io.github.BetaNYC/nyc-record-mcp`. A new
  `Publish to MCP Registry` workflow lists each release after the Release
  workflow publishes it to npm, and the Release workflow now checks that
  `server.json` matches package.json before publishing.
- `glama.json`, to claim the server on Glama.

## [1.1.0] - 2026-07-22

### Fixed

- Reject unknown tool parameters instead of silently dropping them. Every
  tool's advertised `inputSchema` now sets `additionalProperties: false`, and
  every argument schema is `zod.strict()`, so an invented filter raises an
  error naming the bad key and the tool's accepted parameters rather than
  returning unfiltered results for a different question ([#10])

## [1.0.2] - 2026-07-06

### Fixed

- Stop double-encoding the SoQL `like` pattern in `get_notices_by_agency` —
  agency queries with special characters now match correctly ([#6])
- Escape all string values embedded in SoQL `$where` clauses via a shared
  `soqlString()` helper (quote-doubling), covering `get_notices_by_type`,
  `get_notices_by_agency`, and `get_notices_by_date_range` ([#7])
- Enforce `notice_type` with a `zod` enum derived from a single
  `NOTICE_TYPES` constant (live-verified against the dataset), and validate
  date params as `YYYY-MM-DD` ([#7])
- `get_open_solicitations` computes "today" in America/New_York instead of
  UTC, which dropped same-day deadlines after 8pm ET ([#7])
- Include the (truncated, 300-char) Socrata error body in thrown errors for
  actionable diagnostics ([#7])
- Server now reports its version from package.json instead of a hardcoded
  string ([#7])

### Security

- Bump transitive `hono` 4.12.21 → 4.12.27 (GHSA-wwfh-h76j-fc44) ([#4])

### Added

- Build-only CI workflow on GitHub Actions (Node 20/22 matrix) ([#3])
- Tag-triggered npm release automation and this changelog

### Changed

- Documentation: clear API-key subsection in the README ([#2]), Related
  projects section crediting socrata-mcp-server
- Sync package-lock.json self-version to package.json

## [1.0.1] - 2026-05-22

### Changed

- Add npm keywords for discoverability

## [1.0.0] - 2026-05-21

### Added

- Initial release: MCP server for NYC City Record notices via NYC Open Data
  (SODA API), with tools for searching notices, filtering by agency, type,
  and date range, and retrieving procurement notices, public hearings, and
  open solicitations

[Unreleased]: https://github.com/BetaNYC/nyc-record-mcp/compare/v1.0.2...HEAD
[1.0.2]: https://github.com/BetaNYC/nyc-record-mcp/compare/cf5a4da...v1.0.2
[1.0.1]: https://github.com/BetaNYC/nyc-record-mcp/compare/65deb20...cf5a4da
[1.0.0]: https://github.com/BetaNYC/nyc-record-mcp/releases
[#2]: https://github.com/BetaNYC/nyc-record-mcp/pull/2
[#3]: https://github.com/BetaNYC/nyc-record-mcp/pull/3
[#4]: https://github.com/BetaNYC/nyc-record-mcp/pull/4
[#6]: https://github.com/BetaNYC/nyc-record-mcp/pull/6
[#7]: https://github.com/BetaNYC/nyc-record-mcp/pull/7
[#10]: https://github.com/BetaNYC/nyc-record-mcp/issues/10
