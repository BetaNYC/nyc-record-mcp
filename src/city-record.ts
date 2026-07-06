const BASE_URL = "https://data.cityofnewyork.us";
const DATASET_ID = "dg92-zbpx";

export type CityRecordNotice = {
  request_id?: string;
  start_date?: string;
  end_date?: string;
  agency_name?: string;
  type_of_notice_description?: string;
  category_description?: string;
  short_title?: string;
  selection_method_description?: string;
  section_name?: string;
  special_case_reason_description?: string;
  pin?: string;
  due_date?: string;
  address_to_request?: string;
  contact_name?: string;
  contact_phone?: string;
  email?: string;
  contract_amount?: string;
  contact_fax?: string;
  additional_description_1?: string;
  additional_description_2?: string;
  additional_description_3?: string;
  vendor_name?: string;
  vendor_address?: string;
  document_links?: string;
  event_date?: string;
  building_name?: string;
  street_address_1?: string;
  street_address_2?: string;
  city?: string;
  state?: string;
  zip_code?: string;
};

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

function buildUrl(params: Record<string, string>): string {
  const url = new URL(`${BASE_URL}/resource/${DATASET_ID}.json`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const appToken = process.env.SOCRATA_APP_TOKEN;
  if (appToken) {
    url.searchParams.set("$$app_token", appToken);
  }
  return url.toString();
}

async function sodaFetch(params: Record<string, string>): Promise<CityRecordNotice[]> {
  const res = await fetch(buildUrl(params));
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
