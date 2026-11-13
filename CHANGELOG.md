# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - Unreleased

Adds `whats_changed` and `about_betanyc`, the two tools BetaNYC is adding to each of its MCP
servers, and `WHATS-CHANGED.md`, the reader-facing record of changes. Tracking: BetaNYC/betanyc-ai-workspace#1645 (epic #1637).

### Added

- `whats_changed`: what changed in this server, newest first, from `WHATS-CHANGED.md`
  (filters: `since`, `tag`, `limit`). Answers with readable text and `structuredContent`
  matching a declared `outputSchema`. Reads the file shipped in the package; no network.
- `about_betanyc`: who built the server, the repository, where to report a bug in this
  server or ask for a new feature, and BetaNYC's links.
- `src/betanyc-tools.ts`, copied unchanged from the workspace's
  `scripts/mcp_shared/betanyc-tools.ts` (v1.2.0). Never edit the copy; change the canonical
  file and copy it again. Its two tools are appended to `TOOLS` and answered first in the
  `CallTool` handler. They validate their own arguments (unknown keys rejected by name), so
  they have no entry in `SCHEMAS`.
- `src/version.ts`: the package version, read from package.json, shared by the server and
  `about_betanyc`.
- `WHATS-CHANGED.md`, backfilled to 1.0.0, shipped in the npm package (`files`). No site:
  GitHub's rendering of the file is the page, linked near the top of the README.
- `scripts/whats_changed.py`, copied unchanged from the workspace (v1.2.0). CI runs a
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
