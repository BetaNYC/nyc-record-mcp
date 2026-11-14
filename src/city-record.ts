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

/** Today's date (YYYY-MM-DD) in America/New_York, regardless of host timezone. */
export function nyToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
}

async function sodaFetch(params: Record<string, string>): Promise<CityRecordNotice[]> {
  const url = new URL(`${BASE_URL}/resource/${DATASET_ID}.json`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const appToken = process.env.SOCRATA_APP_TOKEN;
  if (appToken) {
    url.searchParams.set("$$app_token", appToken);
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    // Socrata puts the useful diagnostic (e.g. malformed SoQL) in the body.
    let detail = "";
    try {
      const body = (await res.text()).trim();
      if (body) {
        detail = ` — ${body.length > 300 ? `${body.slice(0, 300)}…` : body}`;
      }
    } catch {
      // body unreadable; fall through with status line only
    }
    throw new Error(`NYC Open Data API error ${res.status}: ${res.statusText}${detail}`);
  }
  return res.json() as Promise<CityRecordNotice[]>;
}

export async function searchNotices(
  query: string,
  limit = 25
): Promise<CityRecordNotice[]> {
  return sodaFetch({
    $q: query,
    $limit: String(limit),
    $order: "start_date DESC",
  });
}

export async function getNoticesByAgency(
  agencyName: string,
  limit = 25
): Promise<CityRecordNotice[]> {
  // SoQL `like` uses a literal `%` wildcard (https://dev.socrata.com/docs/functions/like.html).
  // Build the SoQL value unencoded; URLSearchParams performs the single
  // URL-encoding pass. Single quotes are escaped by doubling per SQL rules.
  const escaped = soqlString(agencyName);
  return sodaFetch({
    $where: `upper(agency_name) like upper('%${escaped}%')`,
    $limit: String(limit),
    $order: "start_date DESC",
  });
}

export async function getNoticesByType(
  noticeType: string,
  limit = 25
): Promise<CityRecordNotice[]> {
  return sodaFetch({
    $where: `type_of_notice_description='${soqlString(noticeType)}'`,
    $limit: String(limit),
    $order: "start_date DESC",
  });
}

export async function getProcurementNotices(
  limit = 25
): Promise<CityRecordNotice[]> {
  // Values live-verified against the dataset 2026-07-06 (see NOTICE_TYPES).
  return sodaFetch({
    $where:
      "type_of_notice_description in ('Solicitation','Award','Intent to Award','Intent to Negotiate','Vendor List')",
    $limit: String(limit),
    $order: "start_date DESC",
  });
}

export async function getPublicHearings(
  limit = 25
): Promise<CityRecordNotice[]> {
  // Values live-verified against the dataset 2026-07-06 (see NOTICE_TYPES).
  return sodaFetch({
    $where:
      "type_of_notice_description in ('Public Hearings','Public Comment','Meeting','Notice')",
    $limit: String(limit),
    $order: "start_date DESC",
  });
}

export async function getOpenSolicitations(
  limit = 25
): Promise<CityRecordNotice[]> {
  // Use the New York calendar date, not UTC: between 8pm and midnight ET the
  // UTC date is already "tomorrow", which would wrongly drop same-day deadlines.
  const today = nyToday();
  return sodaFetch({
    $where: `type_of_notice_description='Solicitation' AND due_date >= '${today}'`,
    $limit: String(limit),
    $order: "due_date ASC",
  });
}

export async function getNoticesByDateRange(
  startDate: string,
  endDate: string,
  limit = 50
): Promise<CityRecordNotice[]> {
  return sodaFetch({
    // Live-verified 2026-07-06: every start_date in the dataset carries a
    // midnight time component (query with date_extract_hh/mm != 0 returned 0
    // rows), so `<= endDate` safely includes the full end day. Revisit if the
    // dataset ever starts publishing non-midnight start_date values.
    $where: `start_date >= '${soqlString(startDate)}' AND start_date <= '${soqlString(endDate)}'`,
    $limit: String(limit),
    $order: "start_date DESC",
  });
}
