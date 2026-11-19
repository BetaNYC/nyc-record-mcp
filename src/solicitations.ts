/**
 * BetaNYC's reading of the open-solicitations list (review of epic #33): labels for rows with no
 * closing time or a placeholder due date, folding of extended and corrected notices into the
 * newest notice for the same solicitation, and cancellation notices listed apart. Nothing here
 * changes a field the City published: every row that is listed (in `notices` or `cancelled`) is
 * the City's full row, with BetaNYC's additions under its `betanyc_notes`. When in doubt a row is
 * shown with a note; nothing is ever dropped silently.
 *
 * Two promises:
 * - A cancellation NEVER takes a solicitation off the list. An agency can re-bid under the same
 *   PIN, agency and title and then post a cancellation for the OLD round; the re-bid stays listed,
 *   with a note naming the cancellation notice.
 * - With include_superseded: true nothing is folded and nothing is moved: every row on the page is
 *   in `notices`, labeled.
 */
import type { CityRecordNotice } from "./city-record.js";
import { nyNow } from "./city-record.js";

export type NoticeKind = "original" | "extension" | "correction" | "cancellation";

/**
 * Amendments are posted as new rows whose short_title starts with a prefix. Only the forms seen
 * in the 1,000 newest solicitations (pulled 2026-11-18) count, exactly as written there:
 * "Bid Extension:" 181, "Correction:" 96, "Cancellation:" 5; 718 had none. No other spelling
 * ("Bid Extension -", "CANCELLED:", …) and no stacked prefixes appeared, so none is read as an
 * amendment. Only the title is read: "Correction" is also an agency (the Department of Correction).
 */
const PREFIX = /^(Bid Extension|Correction|Cancellation):\s*/;
const KIND: Record<string, NoticeKind> = {
  "Bid Extension": "extension",
  Correction: "correction",
  Cancellation: "cancellation",
};

/** The PIN must be at least this long to match: short PINs (3434, 1414, 11233, 11260) are
 * reused for unrelated notices. */
export const MIN_PIN_LENGTH = 8;

/** A due date more than this far ahead is labeled a placeholder (2099-12-31, 2039, 2030, …). */
export const PLACEHOLDER_DAYS = 366;

const text = (v: unknown): string => (typeof v === "string" ? v : "");

export function noticeKind(title: unknown): NoticeKind {
  const m = PREFIX.exec(text(title));
  return m ? KIND[m[1]] : "original";
}

/** The title without its amendment prefix, lower case, spaces collapsed. */
export function baseTitle(title: unknown): string {
  return text(title).replace(PREFIX, "").replace(/\s+/g, " ").trim().toLowerCase();
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

/**
 * Two rows are the same solicitation ONLY when PIN (at least 8 characters), agency and the
 * title without its prefix all match, ignoring case and spacing. A PIN alone is never enough.
 */
export function matchKey(row: NoticeRow): string | null {
  const pin = text(row.pin).trim().toUpperCase();
  const agency = text(row.agency_name).replace(/\s+/g, " ").trim().toLowerCase();
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
  /** Older notices for the same solicitation, folded under this one (by default). */
  supersedes?: NoticeRef[];
  /** The newer notice this one is folded under. */
  superseded_by?: NoticeRef;
  /** Cancellation notices that match this solicitation. */
  matching_cancellations?: NoticeRef[];
  /** On a cancellation notice: the notices it matches. */
  matches?: NoticeRef[];
}

export type LabeledNotice = NoticeRow & { betanyc_notes: BetanycNotes };

export interface Folded {
  /** Rows to list: every page row, minus the ones folded or moved to `cancelled`. */
  notices: LabeledNotice[];
  /** Matched cancellation notices from this page, each the City's full row (default mode only). */
  cancelled: LabeledNotice[];
  /** Page rows folded into a newer notice for the same solicitation (named in its supersedes). */
  folded: number;
  /** Page rows listed under `cancelled` instead of `notices`: only cancellation notices. */
  movedToCancelled: number;
}

const ref = (r: NoticeRow): NoticeRef => ({
  request_id: r.request_id,
  notice_kind: noticeKind(r.short_title),
  start_date: r.start_date,
  due_date: r.due_date,
});
const day = (iso: unknown) => text(iso).slice(0, 10);
const newestFirst = (a: NoticeRow, b: NoticeRow) =>
  a.start_date !== b.start_date ? (a.start_date < b.start_date ? 1 : -1) : a.request_id < b.request_id ? 1 : -1;

export const NOTE_NO_TIME =
  "The City Record gives no closing time for this notice (a due time of 00:00 means none was entered). " +
  "This list keeps it through the end of its due date. Check the notice or the agency for the real closing time.";
export const NOTE_PLACEHOLDER =
  "The due date is more than a year away, so it looks like a placeholder for an open-ended or long-term " +
  "solicitation, not a real deadline. Read the notice.";
export const NOTE_CANCEL_UNMATCHED =
  "This is a cancellation notice (its title starts with \"Cancellation:\"). No other notice clearly matches it, so " +
  "it is listed here. Read it: the solicitation it names is probably cancelled.";

/** Plain labels on one row: notice kind, no closing time (Fix A), placeholder date (Fix B). */
function label(row: NoticeRow, now: Date): LabeledNotice {
  const notes: string[] = [];
  const due = text(row.due_date);
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
 * any due date), or null when that query failed.
 *
 * Within a strong-match group, extensions, corrections and originals fold: the newest by
 * start_date is current and the older ones are folded under it. When the two newest share a
 * start_date nothing folds (the request_id order does not say which came last).
 *
 * Cancellation notices never fold anything and never hide anything. Each solicitation row in the
 * group gets a note naming every matching cancellation posted the same day or later ("it may be
 * cancelled, or the cancellation may refer to an earlier round"). A matched cancellation notice on
 * this page is listed under `cancelled` (default mode), as the City's full row, with a note naming
 * what it matches.
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
  const nowStamp = nyNow(opts.now);

  for (const members of groups.values()) {
    if (members.length < 2 || !members.some((m) => onPage.has(m.request_id))) continue;
    for (const m of members) matched.add(m.request_id);
    const cancels = members.filter((m) => noticeKind(m.short_title) === "cancellation").sort(newestFirst);
    const others = members.filter((m) => noticeKind(m.short_title) !== "cancellation").sort(newestFirst);

    // 1. Extensions, corrections and originals: fold the older ones under the newest.
    if (others.length >= 2) {
      const [current, ...older] = others;
      if (day(current.start_date) === day(older[0].start_date)) {
        for (const m of others) {
          const row = onPage.get(m.request_id);
          if (!row) continue;
          const ids = others.filter((o) => o !== m).map((o) => o.request_id).join(", ");
          row.betanyc_notes.notes.push(
            `Another notice that looks like the same solicitation (request ${ids}) was posted the same day, so it is not clear which one is current. Both are listed; read both.`
          );
        }
      } else {
        const cur = ref(current);
        const curRow = onPage.get(current.request_id);
        if (curRow) {
          curRow.betanyc_notes.supersedes = older.map(ref);
          const later = older.filter((o) => text(o.due_date) > text(current.due_date));
          if (later.length) {
            curRow.betanyc_notes.notes.push(
              `Earlier notices for this solicitation gave a different, later due date (${later.map((o) => `${o.due_date} in request ${o.request_id}`).join("; ")}). This newest notice gives ${current.due_date}; read it before relying on either date.`
            );
          }
        }
        for (const o of older) {
          const row = onPage.get(o.request_id);
          if (!row) continue;
          row.betanyc_notes.superseded_by = cur;
          if (curRow && !opts.includeSuperseded) {
            folded.add(row.request_id);
          } else if (curRow) {
            row.betanyc_notes.notes.push(
              `Without include_superseded this notice is folded: ${kindWords[cur.notice_kind]} posted later for the same solicitation (request ${cur.request_id}, posted ${day(cur.start_date)}, due ${cur.due_date}) replaces it.`
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
    }

    // 2. Cancellations: a note on every solicitation row they match; never a removal.
    for (const m of others) {
      const row = onPage.get(m.request_id);
      if (!row || !cancels.length) continue;
      const after = cancels.filter((c) => day(c.start_date) >= day(m.start_date));
      const before = cancels.filter((c) => day(c.start_date) < day(m.start_date));
      row.betanyc_notes.matching_cancellations = cancels.map(ref);
      if (after.length) {
        const which = after
          .map((c) => `request ${c.request_id}, posted ${day(c.start_date)}${day(c.start_date) === day(m.start_date) ? ", the same day as this notice" : ""}`)
          .join("; ");
        row.betanyc_notes.notes.push(
          `A cancellation notice matches this solicitation (${which}): same PIN, agency and title. It may be cancelled, or the cancellation may refer to an earlier round. Read both notices or ask the agency.`
        );
      }
      if (before.length) {
        row.betanyc_notes.notes.push(
          `An earlier cancellation notice matches this solicitation (${before.map((c) => `request ${c.request_id}, posted ${day(c.start_date)}`).join("; ")}). This notice was posted after it, so it may be a new round. Read both notices.`
        );
      }
    }
    for (const c of cancels) {
      const row = onPage.get(c.request_id);
      if (!row) continue;
      const rest = members.filter((m) => m !== c);
      row.betanyc_notes.matches = rest.map(ref);
      row.betanyc_notes.notes.push(
        `This cancellation notice matches ${rest.map((m) => `request ${m.request_id} (posted ${day(m.start_date)})`).join(", ")}: same PIN, agency and title. None of them is taken off the list because of it; read them with this one, since a cancellation may refer to an earlier round.`
      );
      if (!opts.includeSuperseded) toCancelled.add(row.request_id);
    }
  }

  for (const row of labeled) {
    if (row.betanyc_notes.notice_kind === "cancellation" && !matched.has(row.request_id)) {
      row.betanyc_notes.notes.push(NOTE_CANCEL_UNMATCHED);
    }
  }
  return {
    notices: labeled.filter((r) => !folded.has(r.request_id) && !toCancelled.has(r.request_id)),
    cancelled: labeled.filter((r) => toCancelled.has(r.request_id)),
    folded: folded.size,
    movedToCancelled: toCancelled.size,
  };
}
