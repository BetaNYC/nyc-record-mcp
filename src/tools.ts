import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  NOTICE_TYPES,
  UpstreamError,
  SOURCE,
  type NoticePage,
  searchNotices,
  getNoticesByAgency,
  getNoticesByType,
  getProcurementNotices,
  getPublicHearings,
  getOpenSolicitations,
  getNoticesByDateRange,
} from "./city-record.js";
import { BETANYC_INSTRUCTIONS, annotateTools, createBetanycTools, provenance, toolError } from "./betanyc-tools.js";
import { PACKAGE_VERSION } from "./version.js";

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

/** The server's MCP instructions: what it covers, then the shared module's own instructions
 * (call about_data, about_betanyc and whats_changed). */
export const SERVER_INSTRUCTIONS =
  "Notices published in The City Record, New York City's official newspaper, from the City Record Online " +
  "dataset on NYC Open Data, by BetaNYC. " +
  BETANYC_INSTRUCTIONS;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date in YYYY-MM-DD format");

/** The paging parameter every City Record tool takes (#25). */
const OFFSET_PROP = { type: "integer", minimum: 0, description: "Skip this many notices, for the next page (default 0)" };

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
        limit: { type: "number", description: "Max results (default 25, max 100)" },
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
        limit: { type: "number", description: "Max results (default 25, max 100)" },
        offset: OFFSET_PROP,
      },
      required: ["agency_name"],
      additionalProperties: false,
    },
  },
  {
    name: "get_notices_by_type",
    description:
      "Get notices filtered by type. Valid types: Solicitation, Award, Intent to Award, Intent to Negotiate, Public Hearings, Public Comment, Meeting, Notice, Vendor List, Sale.",
    inputSchema: {
      type: "object",
      properties: {
        notice_type: {
          type: "string",
          enum: [...NOTICE_TYPES],
          description: "Notice type",
        },
        limit: { type: "number", description: "Max results (default 25, max 100)" },
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
        limit: { type: "number", description: "Max results (default 25, max 100)" },
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
        limit: { type: "number", description: "Max results (default 25, max 100)" },
        offset: OFFSET_PROP,
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_open_solicitations",
    description:
      "Get active solicitations (RFPs, RFQs, IFBs) where the due date has not yet passed. Sorted by due date ascending — soonest deadlines first.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 25, max 100)" },
        offset: OFFSET_PROP,
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
        limit: { type: "number", description: "Max results (default 50, max 200)" },
        offset: OFFSET_PROP,
      },
      required: ["start_date", "end_date"],
      additionalProperties: false,
    },
  },
];

/**
 * Tool definitions advertised to clients by the ListTools handler. Every tool only reads, so
 * annotateTools (shared module 1.5.0) gives each readOnlyHint: true, openWorldHint and a title.
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
const offset = z.number().int().min(0).optional();

export const SCHEMAS = {
  search_notices: z
    .object({ query: z.string(), limit: z.number().max(100).optional(), offset })
    .strict(),
  get_notices_by_agency: z
    .object({ agency_name: z.string(), limit: z.number().max(100).optional(), offset })
    .strict(),
  get_notices_by_type: z
    .object({
      notice_type: z.enum(NOTICE_TYPES),
      limit: z.number().max(100).optional(),
      offset,
    })
    .strict(),
  get_procurement_notices: z
    .object({ limit: z.number().max(100).optional(), offset })
    .strict(),
  get_public_hearings: z.object({ limit: z.number().max(100).optional(), offset }).strict(),
  get_open_solicitations: z
    .object({ limit: z.number().max(100).optional(), offset })
    .strict(),
  get_notices_by_date_range: z
    .object({
      start_date: isoDate,
      end_date: isoDate,
      limit: z.number().max(200).optional(),
      offset,
    })
    .strict(),
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

/**
 * The text block every domain tool answers with (#23, #24, #25): how many notices are shown,
 * whether more match and how to get them, the notices, and the source with its link and the
 * time it was fetched (shared provenance(), kind "live": every answer is a live query).
 */
function answer(page: NoticePage, limit: number) {
  const p = provenance({ ...SOURCE, kind: "live" });
  const n = page.notices.length;
  const next = page.offset + n;
  const body = {
    showing: n,
    offset: page.offset,
    more_available: page.more,
    ...(page.more
      ? { how_to_get_more: `Call again with offset ${next} (and the same limit, ${limit}) for the next notices, or narrow the search.` }
      : {}),
    notices: page.notices,
    source: p.provenance,
  };
  return { content: [{ type: "text" as const, text: `${JSON.stringify(body, null, 2)}\n\n${p.text}` }] };
}

/**
 * Run one tool call: the shared tools, then the seven City Record tools. Every failure comes
 * back as an isError result with a plain sentence (shared toolError: stack lines dropped,
 * upstream body cut to 500 characters, the app token redacted), never as a thrown error.
 */
export async function callTool(name: string, args: unknown) {
  if (betanyc.handles(name)) return betanyc.call(name, args);
  const secrets = [process.env.SOCRATA_APP_TOKEN];
  try {
    switch (name) {
      case "search_notices": {
        const { query, limit, offset } = parseToolArgs("search_notices", args);
        return answer(await searchNotices(query, limit ?? 25, offset), limit ?? 25);
      }
      case "get_notices_by_agency": {
        const { agency_name, limit, offset } = parseToolArgs("get_notices_by_agency", args);
        return answer(await getNoticesByAgency(agency_name, limit ?? 25, offset), limit ?? 25);
      }
      case "get_notices_by_type": {
        const { notice_type, limit, offset } = parseToolArgs("get_notices_by_type", args);
        return answer(await getNoticesByType(notice_type, limit ?? 25, offset), limit ?? 25);
      }
      case "get_procurement_notices": {
        const { limit, offset } = parseToolArgs("get_procurement_notices", args);
        return answer(await getProcurementNotices(limit ?? 25, offset), limit ?? 25);
      }
      case "get_public_hearings": {
        const { limit, offset } = parseToolArgs("get_public_hearings", args);
        return answer(await getPublicHearings(limit ?? 25, offset), limit ?? 25);
      }
      case "get_open_solicitations": {
        const { limit, offset } = parseToolArgs("get_open_solicitations", args);
        return answer(await getOpenSolicitations(limit ?? 25, offset), limit ?? 25);
      }
      case "get_notices_by_date_range": {
        const { start_date, end_date, limit, offset } = parseToolArgs("get_notices_by_date_range", args);
        return answer(await getNoticesByDateRange(start_date, end_date, limit ?? 50, offset), limit ?? 50);
      }
      default:
        return toolError(`Unknown tool: ${name}. This server's tools are: ${TOOLS.map((t) => t.name).join(", ")}.`);
    }
  } catch (err) {
    if (err instanceof UpstreamError) return toolError(err.message, { upstreamBody: err.body, secrets });
    const message = err instanceof Error ? err.message : String(err);
    return toolError(message, { secrets });
  }
}
