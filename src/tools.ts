import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  NOTICE_TYPES,
  clock,
  UpstreamError,
  SOURCE,
  type NoticePage,
  type OpenSolicitationsPage,
  searchNotices,
  getNoticesByAgency,
  getNoticesByType,
  getProcurementNotices,
  getPublicHearings,
  getOpenSolicitations,
  getNoticesByDateRange,
} from "./city-record.js";
import {
  BETANYC_INSTRUCTIONS,
  annotateTools,
  createBetanycTools,
  errorSummary,
  isRealDate,
  provenance,
  toolError,
  whatWasDone,
  type ChangedByBetanyc,
} from "./betanyc-tools.js";
import { PACKAGE_VERSION } from "./version.js";
import { foldOpenSolicitations, type Folded } from "./solicitations.js";
import { readFileSync } from "node:fs";

/**
 * whats_changed, about_betanyc and about_data, the three tools BetaNYC adds to each of its MCP
 * servers (betanyc-ai-workspace platform/system/whats-changed-standard.md § 7 and
 * about-data-standard.md § 3). betanyc-tools.ts is a copy of the workspace's canonical file:
 * never edit it here. The tools validate their own arguments (unknown keys are rejected by
 * name, as this server's own tools do), so they have no entry in SCHEMAS. WHATS-CHANGED.md,
 * DATA-SOURCES.json and data.json ship in the npm package (package.json `files`), one level
 * above dist/; the tools read them locally and never touch the network. The one source is
 * fetched live, so no freshness hook is needed. Throws at startup if DATA-SOURCES.json does
 * not describe this server.
 */
export const betanyc = createBetanycTools({
  serverName: "nyc-record-mcp",
  version: PACKAGE_VERSION,
  repoUrl: "https://github.com/BetaNYC/nyc-record-mcp",
  whatsChangedPath: new URL("../WHATS-CHANGED.md", import.meta.url),
  dataSourcesPath: new URL("../DATA-SOURCES.json", import.meta.url),
});

/**
 * get_open_solicitations is the one tool whose answers BetaNYC modifies (it folds older amended
 * notices, lists matched cancellation notices apart and adds labels), so DATA-SOURCES.json describes it in its own entry,
 * "open-solicitations", with changes.changed true. Its answers repeat that entry's changes, read
 * here from the same file so the two cannot disagree. Throws at startup if the entry is missing.
 */
export const OPEN_SOLICITATIONS_CHANGES: { changed: true; steps: string[]; detail: string } = (() => {
  const doc = JSON.parse(readFileSync(new URL("../DATA-SOURCES.json", import.meta.url), "utf8"));
  const entry = doc.sources?.find((s: { id?: string }) => s.id === "open-solicitations");
  const ch = entry?.changes;
  if (!entry?.tools?.includes("get_open_solicitations") || ch?.changed !== true || !ch.steps?.length || !ch.detail) {
    throw new Error("DATA-SOURCES.json must describe get_open_solicitations in an 'open-solicitations' entry with changes.changed true, steps and detail");
  }
  return { changed: true, steps: [...ch.steps], detail: ch.detail };
})();

/**
 * What a get_open_solicitations answer says BetaNYC did, through the shared provenance()
 * (module 1.5.2), so its Source line reads "BetaNYC modified this data: … This copy should not
 * be considered the official record. … Official record: City Record Online …, <link>", the same
 * kind as about_data gives. By default the words are about_data's own (whatWasDone of the
 * entry's steps). With include_superseded nothing is folded or moved, so the line says only
 * what was done.
 */
export function openSolicitationsChange(includeSuperseded: boolean): ChangedByBetanyc {
  return {
    kind: "modified-by-betanyc",
    detail: includeSuperseded
      ? "listed every notice on this page as NYC Open Data sent it, kept due times of 00:00 listed through their day and added labels under betanyc_notes; nothing was folded or moved"
      : whatWasDone(OPEN_SOLICITATIONS_CHANGES.steps),
  };
}

/** The server's MCP instructions: what it covers, then the shared module's own instructions
 * (call about_data, about_betanyc and whats_changed). */
/** Guidance shared by all seven City Record tools, said once here rather than in each
 * description (#32). The size-budget test (test/tool-size.test.mjs) guards the total. */
export const ANSWER_GUIDE =
  "Every City Record tool answers with two text blocks. The first is JSON: showing, more_available and, when more " +
  "notices match, how_to_get_more (call again with that offset), the notices, and source. Six tools give the notices " +
  "exactly as published; get_open_solicitations is BetaNYC's arrangement, not the official record. The last block is the Source line with the link and the time it was fetched; cite that line. " +
  "An empty answer means no notice in the dataset matched, not that none was published. " +
  "About 88% of notices are Changes in Personnel listings with no notice type: keyword, agency and date " +
  "searches can be mostly those, and the type tools never return them. search_notices is a full-text " +
  "search and can be slow for several words; the agency, type and date tools are faster. ";

export const SERVER_INSTRUCTIONS =
  "Notices published in The City Record, New York City's official newspaper, from the City Record Online " +
  "dataset on NYC Open Data, by BetaNYC. " +
  ANSWER_GUIDE +
  BETANYC_INSTRUCTIONS;

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const isoDate = z
  .string()
  .regex(DATE_FORMAT, "must be a date in YYYY-MM-DD format")
  // Only for a well-formed date, so "Jan 1" gets one message, not two.
  .refine((s) => !DATE_FORMAT.test(s) || isRealDate(s), "is not a real date on the calendar (check the month and the day)");

/** The paging parameter every City Record tool takes (#25). */
const OFFSET_PROP = { type: "integer", minimum: 0, description: "Notices to skip, for the next page (default 0)" };

/** Each tool's most notices per answer. A bigger whole number is lowered to it, and the answer says so. */
const MAX_LIMIT = { default: 100, get_notices_by_date_range: 200 } as const;
const limitProp = (dflt: number, max: number) => ({
  type: "integer",
  minimum: 1,
  maximum: max,
  description: `Max results (default ${dflt}; more than ${max} is lowered to ${max})`,
});
const LIMIT_PROP = limitProp(25, MAX_LIMIT.default);

/** The server's own tools. Each one sends a live query to NYC Open Data, so openWorldHint is true. */
const DOMAIN_TOOLS: Tool[] = [
  {
    name: "search_notices",
    description:
      "Full-text search across all NYC City Record notices. Returns recent matching notices sorted by date.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term" },
        limit: LIMIT_PROP,
        offset: OFFSET_PROP,
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_notices_by_agency",
    description:
      "Get City Record notices published by a specific city agency (partial name match).",
    inputSchema: {
      type: "object",
      properties: {
        agency_name: { type: "string", description: "Agency name or partial name, e.g. 'DCAS', 'Parks'" },
        limit: LIMIT_PROP,
        offset: OFFSET_PROP,
      },
      required: ["agency_name"],
      additionalProperties: false,
    },
  },
  {
    name: "get_notices_by_type",
    description:
      "Get notices of one type; notice_type lists the types.",
    inputSchema: {
      type: "object",
      properties: {
        notice_type: {
          type: "string",
          enum: [...NOTICE_TYPES],
          description: "Notice type",
        },
        limit: LIMIT_PROP,
        offset: OFFSET_PROP,
      },
      required: ["notice_type"],
      additionalProperties: false,
    },
  },
  {
    name: "get_procurement_notices",
    description:
      "Get recent procurement-related notices: solicitations, awards, intent to award, vendor lists. Useful for tracking open contracts and recent awards.",
    inputSchema: {
      type: "object",
      properties: {
        limit: LIMIT_PROP,
        offset: OFFSET_PROP,
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_public_hearings",
    description:
      "Get recent public hearings, public comment periods, and agency meetings from the City Record.",
    inputSchema: {
      type: "object",
      properties: {
        limit: LIMIT_PROP,
        offset: OFFSET_PROP,
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_open_solicitations",
    description:
      "Get active solicitations (RFPs, RFQs, IFBs) whose due date and time, in New York, has not yet passed. Sorted by due date ascending — soonest deadlines first. " +
      "BetaNYC labels notices in betanyc_notes (no closing time, placeholder date, extension, correction, cancellation) and folds older amended notices into the newest; matched cancellation notices go under cancelled, the solicitation stays listed.",
    inputSchema: {
      type: "object",
      properties: {
        limit: LIMIT_PROP,
        offset: OFFSET_PROP,
        include_superseded: { type: "boolean", description: "List every notice, folded ones included, each labeled (default false)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_notices_by_date_range",
    description: "Get all City Record notices published within a date range.",
    inputSchema: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "Start date, YYYY-MM-DD" },
        end_date: { type: "string", description: "End date, YYYY-MM-DD" },
        limit: limitProp(50, MAX_LIMIT.get_notices_by_date_range),
        offset: OFFSET_PROP,
      },
      required: ["start_date", "end_date"],
      additionalProperties: false,
    },
  },
];

/**
 * Tool definitions advertised to clients by the ListTools handler. Every tool only reads, so
 * annotateTools (shared module 1.5.0 and later) gives each readOnlyHint: true, openWorldHint and a title.
 * The three shared tools (what's changed, who built it, where the data comes from) declare their
 * own annotations and pass through. Their definitions are plain JSON Schema with an
 * outputSchema; the cast is only for the type.
 */
export const TOOLS: Tool[] = annotateTools(
  [...DOMAIN_TOOLS, ...(betanyc.tools as unknown as Tool[])],
  Object.fromEntries(DOMAIN_TOOLS.map((t) => [t.name, true]))
);

/**
 * Argument schemas, one per tool name in TOOLS.
 *
 * Every schema is `.strict()`. zod strips unknown keys by default, which meant
 * an invented filter (`council_district`, `vendor`, …) was silently discarded
 * and the tool answered a different question with real, plausible data — see
 * issue #10. Strict turns that into a loud failure.
 */
const offset = z
  .number()
  .int("must be a whole number of at least 0")
  .min(0, "must be a whole number of at least 0")
  .optional();
/** A whole number of at least 1. Above the tool's maximum is allowed here and lowered in callTool. */
const limit = z
  .number()
  .int("must be a whole number of at least 1")
  .min(1, "must be a whole number of at least 1")
  .optional();

export const SCHEMAS = {
  search_notices: z.object({ query: z.string(), limit, offset }).strict(),
  get_notices_by_agency: z.object({ agency_name: z.string(), limit, offset }).strict(),
  get_notices_by_type: z.object({ notice_type: z.enum(NOTICE_TYPES), limit, offset }).strict(),
  get_procurement_notices: z.object({ limit, offset }).strict(),
  get_public_hearings: z.object({ limit, offset }).strict(),
  get_open_solicitations: z.object({ limit, offset, include_superseded: z.boolean().optional() }).strict(),
  get_notices_by_date_range: z
    .object({ start_date: isoDate, end_date: isoDate, limit, offset })
    .strict()
    .superRefine((v, ctx) => {
      // Only when both are real dates: a malformed one already has its own message.
      if (isRealDate(v.start_date) && isRealDate(v.end_date) && v.start_date > v.end_date) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["start_date"],
          message: `${v.start_date} is after end_date ${v.end_date}; the start must be on or before the end`,
        });
      }
    }),
} satisfies Record<string, z.ZodTypeAny>;

export type ToolName = keyof typeof SCHEMAS;

/**
 * Parse a tool call's arguments, rejecting any parameter the tool does not
 * declare. zod's own strict message names the offending key but offers no
 * alternative, so the accepted names are read back off the advertised schema.
 */
export function parseToolArgs<K extends ToolName>(
  name: K,
  args: unknown
): z.infer<(typeof SCHEMAS)[K]> {
  const result = SCHEMAS[name].safeParse(args ?? {});
  if (result.success) return result.data;

  const unknown = result.error.issues.find((i) => i.code === "unrecognized_keys");
  if (unknown) {
    const accepted = Object.keys(TOOLS.find((t) => t.name === name)?.inputSchema.properties ?? {});
    throw new Error(
      `${name} received unrecognized parameter(s): ${unknown.keys.join(", ")}. ` +
        `It accepts only: ${accepted.join(", ")}. The call was rejected rather ` +
        `than run without that filter, because dropping it silently would ` +
        `return results for a different question.`
    );
  }
  // A bad value: one plain sentence per problem, not zod's JSON dump (#30).
  const problems = result.error.issues.map(
    (i) => `${i.path.join(".") || "the arguments"}: ${i.message}`
  );
  throw new Error(`${name} could not use its arguments. ${problems.join("; ")}. Fix the value and try again.`);
}

/** The limit a call uses: the one asked for (or the default), lowered to the tool's maximum,
 * with a sentence saying so when it was lowered. */
function useLimit(asked: number | undefined, dflt: number, max: number): { limit: number; note?: string } {
  const n = asked ?? dflt;
  if (n <= max) return { limit: n };
  return { limit: max, note: `limit ${n} is more than this tool returns at once, so it was lowered to ${max}.` };
}

/**
 * What every domain tool answers with (#23, #24, #25), as two text blocks. The first is JSON
 * alone, so a program can JSON.parse it: how many notices are shown, whether more match and how
 * to get them, the notices, and the source object. The last is the human-readable Source line
 * with the link and the time it was fetched (shared provenance(), kind "live").
 */
function answer(page: NoticePage, use: { limit: number; note?: string }, open?: OpenExtras) {
  const p = provenance({
    ...SOURCE,
    kind: "live",
    ...(open ? { changedByBetanyc: openSolicitationsChange(open.includeSuperseded) } : {}),
  });
  // offset, limit and more_available count notices as NYC Open Data returns them, so paging
  // stays right when some of them are folded (get_open_solicitations).
  const cityRows = page.notices.length;
  const listed = open ? open.folded.notices : page.notices;
  const next = page.offset + cityRows;
  const body = {
    showing: listed.length,
    offset: page.offset,
    more_available: page.more,
    ...(page.more
      ? { how_to_get_more: `Call again with offset ${next} (and the same limit, ${use.limit}) for the next notices, or narrow the search.` }
      : {}),
    ...(use.note ? { note: use.note } : {}),
    ...(open ? openSummary(open, cityRows) : {}),
    notices: listed,
    // For the open list, provenance() adds changed_by_betanyc (kind and detail).
    source: p.provenance,
  };
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(body, null, 2) },
      { type: "text" as const, text: p.text },
    ],
  };
}

export interface OpenExtras {
  folded: Folded;
  includeSuperseded: boolean;
  amendmentNote?: string;
}

/** get_open_solicitations' own top-level fields: how the City's rows became this list. */
function openSummary(open: OpenExtras, cityRows: number) {
  const { folded, movedToCancelled, cancelled } = open.folded;
  const listedCount = cityRows - folded - movedToCancelled;
  return {
    city_notices_on_this_page: cityRows,
    folded_into_newer_notice: folded,
    ...(cancelled.length ? { cancelled } : {}),
    paging_note:
      `offset, limit and more_available count notices as NYC Open Data returns them: ${cityRows} on this page. ` +
      (open.includeSuperseded
        ? "include_superseded is on, so nothing was folded or moved: every one is in notices, labeled. "
        : folded || movedToCancelled
          ? `${folded} older notice(s) were folded under a newer notice for the same solicitation (named by request_id and dates in its supersedes) and ${movedToCancelled} matched cancellation notice(s) are listed under cancelled, so ${listedCount} are in notices. A cancellation never takes a solicitation off the list. Call again with include_superseded: true to list all ${cityRows}, each labeled. `
          : "None were folded or moved. ") +
      "The labels in betanyc_notes are BetaNYC's reading of the titles and dates, not an official status.",
    ...(open.amendmentNote ? { amendment_check: open.amendmentNote } : {}),
  };
}

/**
 * Run one tool call: the shared tools, then the seven City Record tools. Every failure comes
 * back as an isError result with a plain sentence (shared toolError: stack lines dropped from
 * the upstream body, which is cut to 500 characters; the app token redacted everywhere), never
 * as a thrown error.
 */
export async function callTool(name: string, args: unknown) {
  if (betanyc.handles(name)) return betanyc.call(name, args);
  const secrets = [process.env.SOCRATA_APP_TOKEN];
  try {
    switch (name) {
      case "search_notices": {
        const { query, limit, offset } = parseToolArgs("search_notices", args);
        const use = useLimit(limit, 25, MAX_LIMIT.default);
        return answer(await searchNotices(query, use.limit, offset), use);
      }
      case "get_notices_by_agency": {
        const { agency_name, limit, offset } = parseToolArgs("get_notices_by_agency", args);
        const use = useLimit(limit, 25, MAX_LIMIT.default);
        return answer(await getNoticesByAgency(agency_name, use.limit, offset), use);
      }
      case "get_notices_by_type": {
        const { notice_type, limit, offset } = parseToolArgs("get_notices_by_type", args);
        const use = useLimit(limit, 25, MAX_LIMIT.default);
        return answer(await getNoticesByType(notice_type, use.limit, offset), use);
      }
      case "get_procurement_notices": {
        const { limit, offset } = parseToolArgs("get_procurement_notices", args);
        const use = useLimit(limit, 25, MAX_LIMIT.default);
        return answer(await getProcurementNotices(use.limit, offset), use);
      }
      case "get_public_hearings": {
        const { limit, offset } = parseToolArgs("get_public_hearings", args);
        const use = useLimit(limit, 25, MAX_LIMIT.default);
        return answer(await getPublicHearings(use.limit, offset), use);
      }
      case "get_open_solicitations": {
        const { limit, offset, include_superseded } = parseToolArgs("get_open_solicitations", args);
        const use = useLimit(limit, 25, MAX_LIMIT.default);
        const now = new Date(clock.now());
        const page = await getOpenSolicitations(use.limit, offset, now);
        const includeSuperseded = include_superseded ?? false;
        return answer(page, use, arrangeOpenList(page, { now, includeSuperseded }));
      }
      case "get_notices_by_date_range": {
        const { start_date, end_date, limit, offset } = parseToolArgs("get_notices_by_date_range", args);
        const use = useLimit(limit, 50, MAX_LIMIT.get_notices_by_date_range);
        return answer(await getNoticesByDateRange(start_date, end_date, use.limit, offset), use);
      }
      default:
        return toolError(`Unknown tool: ${name}. This server's tools are: ${TOOLS.map((t) => t.name).join(", ")}.`);
    }
  } catch (err) {
    if (err instanceof UpstreamError) return toolError(err.message, { upstreamBody: err.body, secrets });
    // Our own argument messages are one plain line; anything else is cut to its first plain line.
    return toolError(errorSummary(err, 1000), { secrets });
  }
}

/**
 * Fold and label the open list, guarded: the amended-notice check is extra, so a failure in it,
 * or in folding against it, must never fail the call. On any error the page is folded on its own
 * (no amendments) with a plain note; if even that fails, the City's rows are listed as sent, with
 * a note. `fold` is a parameter only so a test can make it fail.
 */
export function arrangeOpenList(
  page: OpenSolicitationsPage,
  opts: { now: Date; includeSuperseded: boolean },
  fold: typeof foldOpenSolicitations = foldOpenSolicitations
): OpenExtras {
  const base = { includeSuperseded: opts.includeSuperseded };
  try {
    return { ...base, folded: fold(page.notices, page.amendments, opts), amendmentNote: page.amendmentNote };
  } catch (err) {
    const note =
      `Amended, extended and cancelled notices could not be checked this time (${errorSummary(err, 200).replace(/\.$/, "")}). ` +
      "Notices on other pages or past their due date were not checked, so a notice here may have a newer deadline or a cancellation notice.";
    try {
      return { ...base, folded: fold(page.notices, null, opts), amendmentNote: note };
    } catch (err2) {
      return {
        ...base,
        folded: { notices: page.notices as unknown as Folded["notices"], cancelled: [], folded: 0, movedToCancelled: 0 },
        amendmentNote: `${note} BetaNYC's labels could not be added either (${errorSummary(err2, 200).replace(/\.$/, "")}); the notices are listed as NYC Open Data sent them.`,
      };
    }
  }
}
