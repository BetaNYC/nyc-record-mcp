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
  return sodaFetch({
    $where: `upper(agency_name) like upper('%25${encodeURIComponent(agencyName)}%25')`,
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
