/**
 * BetaNYC's reading of the open-solicitations list (review of epic #33): labels for rows with no
 * closing time or a placeholder due date, and folding of amended, extended and cancelled notices
 * into the newest notice for the same solicitation. Nothing here changes a field the City
 * published: every addition goes under each row's `betanyc_notes`, or in the answer's own
 * top-level fields. When in doubt a row is shown with a note; nothing is ever dropped silently.
 */
import type { CityRecordNotice } from "./city-record.js";
import { nyNow } from "./city-record.js";

export type NoticeKind = "original" | "extension" | "correction" | "cancellation";

/**
 * Amendments are posted as new rows whose short_title starts with a prefix. Counted in the
 * 1,000 newest solicitations (pulled 2026-11-18): "Bid Extension:" 181, "Correction:" 96,
 * "Cancellation:" 5, none 718. Prefixes can stack ("Correction: Bid Extension: …"). The
 * cancellation pattern takes any word starting "Cancel" ("Cancellation:", "Cancelled:", …).
 * Only the title is read: "Correction" is also an agency (the Department of Correction).
 */
const PREFIX = /^\s*(?:(bid\s+extension)\s*:|(correction)\s*:|(cancel\w*)\s*[:\-–—]?)\s*/i;

/** The PIN must be at least this long to match: short PINs (3434, 1414, 11233, 11260) are
 * reused for unrelated notices. */
export const MIN_PIN_LENGTH = 8;

/** A due date more than this far ahead is labeled a placeholder (2099-12-31, 2039, 2030, …). */
export const PLACEHOLDER_DAYS = 366;

export function noticeKind(title: string | undefined): NoticeKind {
  let t = title ?? "";
  let first: NoticeKind | null = null;
  for (let m = PREFIX.exec(t); m; m = PREFIX.exec(t)) {
    const kind: NoticeKind = m[1] ? "extension" : m[2] ? "correction" : "cancellation";
    if (kind === "cancellation") return kind; // a cancellation anywhere in the chain wins
    first ??= kind;
    t = t.slice(m[0].length);
  }
  return first ?? "original";
}

/** The title without its amendment prefixes, lower case, spaces collapsed. */
export function baseTitle(title: string | undefined): string {
  let t = title ?? "";
  for (let m = PREFIX.exec(t); m; m = PREFIX.exec(t)) t = t.slice(m[0].length);
  return t.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Two rows are the same solicitation ONLY when PIN (at least 8 characters), agency and the
 * title without its prefix all match, ignoring case and spacing. A PIN alone is never enough.
 */
export function matchKey(row: NoticeRow): string | null {
  const pin = (row.pin ?? "").trim().toUpperCase();
  const agency = (row.agency_name ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  const title = baseTitle(row.short_title);
  if (pin.length < MIN_PIN_LENGTH || !agency || !title) return null;
  return `${pin}\u0000${agency}\u0000${title}`;
}

export interface NoticeRef {
  request_id: string;
  notice_kind: NoticeKind;
  start_date: string;
  due_date: string;
}

export interface BetanycNotes {
  notice_kind: NoticeKind;
  notes: string[];
  supersedes?: NoticeRef[];
  superseded_by?: NoticeRef;
}

/** The fields the folding reads. Every row's own fields are passed on unchanged. */
export interface NoticeRow {
  request_id: string;
  start_date: string;
  due_date: string;
  short_title: string;
  agency_name: string;
  pin?: string;
  [field: string]: unknown;
}

export type LabeledNotice = NoticeRow & { betanyc_notes: BetanycNotes };

export interface CancelledEntry {
  request_id: string;
  short_title: string;
  agency_name: string;
  cancellation_posted: string;
  cancels: NoticeRef[];
  betanyc_notes: string;
}

export interface Folded {
  /** Rows to list: every page row, minus the ones folded or moved to `cancelled`. */
  notices: LabeledNotice[];
  cancelled: CancelledEntry[];
  /** Page rows folded into a newer notice for the same solicitation (named in its supersedes). */
  folded: number;
  /** Page rows listed under `cancelled` instead of `notices` (a cancellation and what it cancels). */
  movedToCancelled: number;
}

const ref = (r: NoticeRow): NoticeRef => ({
  request_id: r.request_id,
  notice_kind: noticeKind(r.short_title),
  start_date: r.start_date,
  due_date: r.due_date,
});
const day = (iso: string | undefined) => (iso ?? "").slice(0, 10);

export const NOTE_NO_TIME =
  "The City Record gives no closing time for this notice (a due time of 00:00 means none was entered). " +
  "This list keeps it through the end of its due date. Check the notice or the agency for the real closing time.";
export const NOTE_PLACEHOLDER =
  "The due date is more than a year away, so it looks like a placeholder for an open-ended or long-term " +
  "solicitation, not a real deadline. Read the notice.";
export const NOTE_CANCEL_UNMATCHED =
  "This is a cancellation notice (its title starts with \"Cancel\"). No other notice clearly matches it, so it is " +
  "listed here. Read it: the solicitation it names is probably cancelled.";

/** Plain labels on one row: notice kind, no closing time (Fix A), placeholder date (Fix B). */
function label(row: NoticeRow, now: Date): LabeledNotice {
  const notes: string[] = [];
  const due = String(row.due_date ?? "");
  if (/T00:00:00(\.000)?$/.test(due)) notes.push(NOTE_NO_TIME);
  if (due > nyNow(new Date(now.getTime() + PLACEHOLDER_DAYS * 86_400_000))) notes.push(NOTE_PLACEHOLDER);
  return { ...row, betanyc_notes: { notice_kind: noticeKind(row.short_title), notes } };
}

const kindWords: Record<NoticeKind, string> = {
  original: "a notice",
  extension: "a bid extension",
  correction: "a correction",
  cancellation: "a cancellation",
};

/**
 * Fold the page. `amendments` are amended and cancelled notices from the extra query (any page,
 * any due date), or null when that query failed. Within a strong-match group the newest row by
 * start_date is current; when the two newest share a start_date the group is left unfolded
 * (the request_id order does not say which came last: a cancellation and its original were
 * posted the same day in the real data, with the cancellation's request_id the lower one).
 */
export function foldOpenSolicitations(
  pageRows: readonly CityRecordNotice[],
  amendments: readonly CityRecordNotice[] | null,
  opts: { now: Date; includeSuperseded?: boolean }
): Folded {
  const labeled = pageRows.map((r) => label(r as unknown as NoticeRow, opts.now));
  const onPage = new Map(labeled.map((r) => [r.request_id, r]));
  const groups = new Map<string, NoticeRow[]>();
  const add = (r: NoticeRow) => {
    const k = matchKey(r);
    if (k) groups.set(k, [...(groups.get(k) ?? []), r]);
  };
  labeled.forEach(add);
  for (const a of amendments ?? []) if (!onPage.has(a.request_id)) add(a as unknown as NoticeRow);

  const folded = new Set<string>();
  const toCancelled = new Set<string>();
  const matched = new Set<string>();
  const cancelled: CancelledEntry[] = [];
  const nowStamp = nyNow(opts.now);

  for (const members of groups.values()) {
    if (members.length < 2 || !members.some((m) => onPage.has(m.request_id))) continue;
    for (const m of members) matched.add(m.request_id);
    const sorted = [...members].sort((a, b) =>
      a.start_date !== b.start_date ? (a.start_date < b.start_date ? 1 : -1) : a.request_id < b.request_id ? 1 : -1
    );
    const [current, ...older] = sorted;
    if (day(current.start_date) === day(older[0].start_date)) {
      for (const m of members) {
        const row = onPage.get(m.request_id);
        if (!row) continue;
        const others = members.filter((o) => o !== m).map((o) => o.request_id).join(", ");
        row.betanyc_notes.notes.push(
          `Another notice that looks like the same solicitation (request ${others}) was posted the same day, so it is not clear which one is current. Both are listed; read both.`
        );
      }
      continue;
    }
    const cur = ref(current);
    const curRow = onPage.get(current.request_id);
    if (curRow) curRow.betanyc_notes.supersedes = older.map(ref);

    if (cur.notice_kind === "cancellation" && curRow && opts.includeSuperseded) {
      curRow.betanyc_notes.notes.push(
        `This cancellation notice is the newest notice for the same solicitation as ${older.length} earlier notice(s), named in supersedes. Without include_superseded they are listed under cancelled.`
      );
    }
    if (cur.notice_kind === "cancellation" && !opts.includeSuperseded) {
      if (curRow) toCancelled.add(curRow.request_id);
      for (const o of older) if (onPage.has(o.request_id)) toCancelled.add(o.request_id);
      cancelled.push({
        request_id: current.request_id,
        short_title: current.short_title,
        agency_name: current.agency_name,
        cancellation_posted: current.start_date,
        cancels: older.map(ref),
        betanyc_notes:
          "BetaNYC's reading of the titles: this cancellation notice is the newest notice for the same PIN, agency and title, so the solicitation is listed here, not as open. Read the notice.",
      });
      continue;
    }
    for (const o of older) {
      const row = onPage.get(o.request_id);
      if (!row) continue;
      row.betanyc_notes.superseded_by = cur;
      if (curRow && !opts.includeSuperseded) {
        folded.add(row.request_id);
      } else if (curRow || cur.notice_kind === "cancellation") {
        row.betanyc_notes.notes.push(
          cur.notice_kind === "cancellation"
            ? `A later cancellation notice (request ${cur.request_id}, posted ${day(cur.start_date)}) matches this solicitation, so it is probably cancelled. Without include_superseded it is listed under cancelled.`
            : `Folded by default: ${kindWords[cur.notice_kind]} posted later for the same solicitation (request ${cur.request_id}, posted ${day(cur.start_date)}, due ${cur.due_date}) replaces this one.`
        );
      } else {
        const passed = cur.due_date <= nowStamp;
        row.betanyc_notes.notes.push(
          `A newer notice for the same solicitation, ${kindWords[cur.notice_kind]} (request ${cur.request_id}, posted ${day(cur.start_date)}), gives the due date ${cur.due_date}` +
            (passed
              ? ", which has passed. This solicitation may be closed or changed: read both notices."
              : ", and is listed on its own. This row's due date may be out of date.")
        );
      }
    }
  }

  for (const row of labeled) {
    if (row.betanyc_notes.notice_kind === "cancellation" && !matched.has(row.request_id)) {
      row.betanyc_notes.notes.push(NOTE_CANCEL_UNMATCHED);
    }
  }
  return {
    notices: labeled.filter((r) => !folded.has(r.request_id) && !toCancelled.has(r.request_id)),
    cancelled,
    folded: folded.size,
    movedToCancelled: toCancelled.size,
  };
}
