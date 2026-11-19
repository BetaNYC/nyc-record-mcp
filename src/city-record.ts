import { PACKAGE_VERSION } from "./version.js";

const BASE_URL = "https://data.cityofnewyork.us";
const DATASET_ID = "dg92-zbpx";

/**
 * Notices come from the NYC Open Data "City Record Online" dataset
 * (dg92-zbpx). Rows are passed through to clients as JSON without
 * field-level access; known fields for reference:
 * request_id, start_date, end_date, agency_name,
 * type_of_notice_description, category_description, short_title,
 * selection_method_description, section_name,
 * special_case_reason_description, pin, due_date, address_to_request,
 * contact_name, contact_phone, email, contract_amount, contact_fax,
 * additional_description_1..3, vendor_name, vendor_address,
 * document_links, event_date, building_name, street_address_1,
 * street_address_2, city, state, zip_code.
 */
export type CityRecordNotice = Record<string, string>;

/**
 * All distinct type_of_notice_description values in the dataset.
 * Live-verified 2026-07-06 via
 * `$select=type_of_notice_description,count(1)&$group=type_of_notice_description`:
 * exactly these 10 values exist (plus ~956k rows with a null type).
 */
export const NOTICE_TYPES = [
  "Solicitation",
  "Award",
  "Intent to Award",
  "Intent to Negotiate",
  "Public Hearings",
  "Public Comment",
  "Meeting",
  "Notice",
  "Vendor List",
  "Sale",
] as const;

export type NoticeType = (typeof NOTICE_TYPES)[number];

/**
 * Escape a value for embedding in a single-quoted SoQL string literal.
 * Single quotes are escaped by doubling per SQL rules
 * (https://dev.socrata.com/docs/datatypes/text.html).
 */
export function soqlString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * The clock and the wait every tool call uses. Tests replace `now` and `sleep` (for example with
 * `t.mock.method(clock, "now", ...)`) to fix "now" or to run the retry budget without waiting.
 */
export const clock = {
  now: (): number => Date.now(),
  sleep: (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms)),
};

/** Today's date (YYYY-MM-DD) in America/New_York, regardless of host timezone. */
export function nyToday(now: Date = new Date(clock.now())): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
}

const NY_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/**
 * The date and time in New York as a floating timestamp, the form the dataset uses for
 * due_date ("2026-11-18T10:00:00.000": New York wall-clock time, no zone). Daylight saving is
 * the time zone database's job, so 2:30 a.m. on a spring-forward day never appears.
 */
export function nyNow(now: Date = new Date(clock.now())): string {
  const p = Object.fromEntries(NY_PARTS.formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.000`;
}

// Polite requests to NYC Open Data (issue #22). One query per tool call, no background
// polling and no cache: every answer is live. Each request has a timeout and an identifying
// User-Agent, and a 429 or 5xx is retried at most twice, honoring Retry-After
// (Socrata throttles with 429: https://dev.socrata.com/docs/response-codes.html).
// The optional app token goes in the X-App-Token header, which Socrata calls "the preferred
// method" for SODA 2.x (https://dev.socrata.com/docs/app-tokens.html), never in the URL (#26).
// There is no per-host request gate and no cache: add them if one tool call ever makes more
// than one request.
export const USER_AGENT = `nyc-record-mcp/${PACKAGE_VERSION} (+https://github.com/BetaNYC/nyc-record-mcp)`;
export const REQUEST_TIMEOUT_MS = 30_000;
/** Full-text search ($q) gets longer, with a written reason: on 2026-11-18, $q queries on this
 * dataset (about a million rows) took 8.9 s for "parks" but 29 s, 35 s and over 120 s for
 * "City Environmental Quality Review Fee", with or without the :id tie-break, so 30 s cut off
 * searches NYC Open Data would have answered. The other tools filter on columns and stay at 30 s. */
export const SEARCH_TIMEOUT_MS = 60_000;
export const MAX_RETRIES = 2;
const MAX_WAIT_MS = 10_000;
/** The most time one tool call may spend on NYC Open Data, across every try and wait. Without
 * it, search_notices could take about 200 s (three 60 s tries plus waits). A try's timeout is
 * cut to what is left of this, and no retry starts once it is spent. */
export const CALL_BUDGET_MS = 90_000;

/** A failure talking to NYC Open Data: `message` is a plain sentence saying what to try, `body`
 * is what the API said (Socrata puts the useful diagnostic, e.g. malformed SoQL, there). */
export class UpstreamError extends Error {
  constructor(message: string, readonly body?: string) {
    super(message);
    this.name = "UpstreamError";
  }
}

/** Wait before retry `attempt` (1-based): Retry-After in seconds or as an HTTP-date
 * (RFC 9110 § 10.2.3), else 1 s then 2 s; never more than 10 s. */
export function retryWaitMs(retryAfter: string | null, attempt: number, now = Date.now()): number {
  const backoff = 1000 * 2 ** (attempt - 1);
  const v = retryAfter?.trim() ?? "";
  if (/^\d+$/.test(v)) return Math.min(Number(v) * 1000, MAX_WAIT_MS);
  const at = v ? Date.parse(v) : NaN;
  return Math.min(Number.isFinite(at) ? Math.max(at - now, 0) : backoff, MAX_WAIT_MS);
}

function failure(status: number): string {
  if (status === 400) return "NYC Open Data rejected the query (HTTP 400). Check the search words, agency name or dates, and try again.";
  if (status === 429) return "NYC Open Data is limiting requests right now (HTTP 429), even after waiting. Try again in a minute; setting SOCRATA_APP_TOKEN raises the limit.";
  if (status >= 500) return `NYC Open Data had a server error (HTTP ${status}), even after retrying. Try again in a few minutes.`;
  return `NYC Open Data answered with HTTP ${status}. Try again, or check the dataset at https://data.cityofnewyork.us/d/${DATASET_ID}.`;
}

const NOT_A_LIST = `NYC Open Data answered, but not with the list of notices this server expects. Try again in a minute; if it keeps happening, check the dataset at https://data.cityofnewyork.us/d/${DATASET_ID}.`;

function timedOut(seconds: number, budget: boolean): string {
  const what = budget
    ? `did not answer within this call's ${seconds}-second limit (counting every try)`
    : `did not answer within ${seconds} seconds`;
  return `NYC Open Data ${what}. Try again in a minute, or narrow the question: a shorter search, or get_notices_by_agency, get_notices_by_type or get_notices_by_date_range, which are faster than a full-text search.`;
}

/** Read a 200 answer: it must be JSON and a list. Anything else is a plain UpstreamError. */
async function readRows(res: Response): Promise<CityRecordNotice[]> {
  const text = await res.text();
  let rows: unknown;
  try {
    rows = JSON.parse(text);
  } catch {
    throw new UpstreamError(`${NOT_A_LIST} (The answer was not JSON.)`, text);
  }
  if (!Array.isArray(rows)) throw new UpstreamError(`${NOT_A_LIST} (The answer was JSON, but not a list.)`, text);
  return rows as CityRecordNotice[];
}

async function sodaFetch(params: Record<string, string>, timeoutMs = REQUEST_TIMEOUT_MS): Promise<CityRecordNotice[]> {
  const url = new URL(`${BASE_URL}/resource/${DATASET_ID}.json`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const headers: Record<string, string> = { Accept: "application/json", "User-Agent": USER_AGENT };
  const appToken = process.env.SOCRATA_APP_TOKEN;
  if (appToken) headers["X-App-Token"] = appToken;
  const deadline = clock.now() + CALL_BUDGET_MS;

  for (let attempt = 1; ; attempt++) {
    const left = deadline - clock.now();
    const budgetBound = left < timeoutMs;
    let res: Response;
    try {
      // The signal also bounds reading the body, so a body that stalls is a timeout too.
      res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(Math.max(1, Math.min(timeoutMs, left))) });
      if (res.ok) return await readRows(res);
    } catch (err) {
      if (err instanceof UpstreamError) throw err;
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        throw new UpstreamError(timedOut((budgetBound ? CALL_BUDGET_MS : timeoutMs) / 1000, budgetBound));
      }
      throw new UpstreamError("Could not reach NYC Open Data (a network error, not an answer from the API). Check the connection and try again.");
    }
    if (attempt <= MAX_RETRIES && (res.status === 429 || res.status >= 500)) {
      const wait = retryWaitMs(res.headers.get("retry-after"), attempt);
      if (clock.now() + wait < deadline) {
        await res.body?.cancel().catch(() => {});
        await clock.sleep(wait);
        continue;
      }
    }
    const body = await res.text().catch(() => "");
    throw new UpstreamError(failure(res.status), body);
  }
}

/** The source every answer names (issue #23). Same values as DATA-SOURCES.json, which a test checks. */
export const SOURCE = {
  sourceName: "City Record Online",
  publisher: "NYC Department of Citywide Administrative Services",
  sourceUrl: `${BASE_URL}/d/${DATASET_ID}`,
} as const;

/** One page of notices: the rows asked for, and whether more match after them (#25). */
export interface NoticePage {
  notices: CityRecordNotice[];
  offset: number;
  more: boolean;
}

/**
 * Ask for one row more than `limit` to learn whether more match without a second count query.
 * `:id` breaks ties in the order so paging with $offset is stable: Socrata says "if you're
 * paging, make sure you provide an $order clause or at a minimum $order=:id"
 * (https://dev.socrata.com/docs/queries/order, https://dev.socrata.com/docs/queries/offset).
 */
async function page(
  query: { where?: string; q?: string; order: string },
  limit: number,
  offset: number
): Promise<NoticePage> {
  const params: Record<string, string> = {
    $order: `${query.order},:id`,
    $limit: String(limit + 1),
    $offset: String(offset),
  };
  if (query.where) params.$where = query.where;
  if (query.q) params.$q = query.q;
  const rows = await sodaFetch(params, query.q ? SEARCH_TIMEOUT_MS : REQUEST_TIMEOUT_MS);
  return { notices: rows.slice(0, limit), offset, more: rows.length > limit };
}

export function searchNotices(query: string, limit = 25, offset = 0): Promise<NoticePage> {
  return page({ q: query, order: "start_date DESC" }, limit, offset);
}

export function getNoticesByAgency(agencyName: string, limit = 25, offset = 0): Promise<NoticePage> {
  // SoQL `like` uses a literal `%` wildcard (https://dev.socrata.com/docs/functions/like.html).
  // A `%` or `_` typed in the agency name also acts as a wildcard: the Socrata docs this repo
  // cites give no escape for them, so they are passed through (README says so).
  // Build the SoQL value unencoded; URLSearchParams performs the single
  // URL-encoding pass. Single quotes are escaped by doubling per SQL rules.
  const escaped = soqlString(agencyName);
  return page({ where: `upper(agency_name) like upper('%${escaped}%')`, order: "start_date DESC" }, limit, offset);
}

export function getNoticesByType(noticeType: string, limit = 25, offset = 0): Promise<NoticePage> {
  return page({ where: `type_of_notice_description='${soqlString(noticeType)}'`, order: "start_date DESC" }, limit, offset);
}

export function getProcurementNotices(limit = 25, offset = 0): Promise<NoticePage> {
  // Values live-verified against the dataset 2026-07-06 (see NOTICE_TYPES).
  return page(
    {
      where: "type_of_notice_description in ('Solicitation','Award','Intent to Award','Intent to Negotiate','Vendor List')",
      order: "start_date DESC",
    },
    limit,
    offset
  );
}

export function getPublicHearings(limit = 25, offset = 0): Promise<NoticePage> {
  // Values live-verified against the dataset 2026-07-06 (see NOTICE_TYPES).
  return page(
    {
      where: "type_of_notice_description in ('Public Hearings','Public Comment','Meeting','Notice')",
      order: "start_date DESC",
    },
    limit,
    offset
  );
}

export function getOpenSolicitations(limit = 25, offset = 0, now: Date = new Date(clock.now())): Promise<NoticePage> {
  // Compare with the date AND time in New York, in due_date's own floating form: a deadline
  // earlier today has passed (comparing with the bare date counted it as open all day), and
  // New York time, not UTC, so the evening and daylight saving come out right.
  return page(
    { where: `type_of_notice_description='Solicitation' AND due_date > '${nyNow(now)}'`, order: "due_date ASC" },
    limit,
    offset
  );
}

export function getNoticesByDateRange(startDate: string, endDate: string, limit = 50, offset = 0): Promise<NoticePage> {
  // Live-verified 2026-07-06: every start_date in the dataset carries a
  // midnight time component (query with date_extract_hh/mm != 0 returned 0
  // rows), so `<= endDate` safely includes the full end day. Revisit if the
  // dataset ever starts publishing non-midnight start_date values.
  return page(
    {
      where: `start_date >= '${soqlString(startDate)}' AND start_date <= '${soqlString(endDate)}'`,
      order: "start_date DESC",
    },
    limit,
    offset
  );
}
