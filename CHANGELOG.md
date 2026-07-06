# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
