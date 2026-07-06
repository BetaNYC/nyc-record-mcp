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
    throw new Error(`NYC Open Data API error ${res.status}: ${res.statusText}`);
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
  const escaped = agencyName.replace(/'/g, "''");
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
    $where: `type_of_notice_description='${noticeType}'`,
    $limit: String(limit),
    $order: "start_date DESC",
  });
}

export async function getProcurementNotices(
  limit = 25
): Promise<CityRecordNotice[]> {
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
  const today = new Date().toISOString().split("T")[0];
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
    $where: `start_date >= '${startDate}' AND start_date <= '${endDate}'`,
    $limit: String(limit),
    $order: "start_date DESC",
  });
}
