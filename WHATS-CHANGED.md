# What's changed

This page lists the changes to nyc-record-mcp that a reader would notice: new tools, changes to what the tools return, and corrections when the server gave a wrong answer. Newest first. Dates are New York dates, the day a version reached npm. CHANGELOG.md sometimes gives the date in UTC instead.

- **History begins:** 2026-05-21, the first release. Corrections made before this date may be missing.
- **Data refresh:** None to list. Every answer asks the City Record Online dataset on NYC Open Data at the time of the question.

To report a bug in this server or ask for a new feature, [open an issue on GitHub](https://github.com/BetaNYC/nyc-record-mcp/issues).

## Unreleased: Ask the server where its data comes from

- **Tags:** MCP
- **What changed:** A new tool answers "where does this notice come from?", "is this official?", "how current is it?" and "how do I check it?". It names the source, the City Record Online dataset on NYC Open Data, and its publisher, the NYC Department of Citywide Administrative Services. It says that the notices are passed on exactly as the City publishes them, that every answer asks NYC Open Data at the time of the question, where to check a notice on City Record Online, and where to report an error in the data. It also says what the data leaves out: most notices in the dataset have no notice type, so the tools that pick notices by type never return them. It gives BetaNYC's email address for questions about the data, lab@beta.nyc. The same information is published as a data catalog.
- **MCP version:** [nyc-record-mcp 1.3.0](CHANGELOG.md)
- **More detail:** [Where the data comes from](DATA-SOURCES.json) · [Data catalog](data.json) · [Release notes](CHANGELOG.md)

## 2026-11-13: Two tools that explain the server, and this page

- **Tags:** MCP
- **What changed:** This page is new and lists every change to the server that a reader would notice. Two new tools let your AI assistant answer "what's new in this server?" from this page, and "who built this?" with links to BetaNYC and to the place to report a bug in this server or ask for a new feature.
- **MCP version:** [nyc-record-mcp 1.2.0](CHANGELOG.md#120---2026-11-13)
- **More detail:** [Release notes](CHANGELOG.md)

## 2026-07-21: Tools ignored settings they did not have, without saying so

- **Tags:** MCP, Correction
- **What changed:** From May 21 to July 21, 2026, when an AI assistant passed a setting a tool does not have, the tool dropped it without saying so. The answer looked right but could answer a different question: a search for open solicitations with a made-up setting still returned ordinary results. Version 1.1.0 refuses the call and names the settings the tool does accept; CHANGELOG.md dates it July 22, the date in UTC.
- **If you used the old numbers:** We found no report of a wrong answer this caused in nyc-record-mcp. If you asked a question then that named something the tool could not filter on, such as a Council district, ask it again with the current version.
- **MCP version:** [nyc-record-mcp 1.1.0](CHANGELOG.md#110---2026-07-22)
- **More detail:** [The issue](https://github.com/BetaNYC/nyc-record-mcp/issues/10) · [The fix](https://github.com/BetaNYC/nyc-record-mcp/pull/11)

## 2026-07-06: Searches by agency name came back empty

- **Tags:** MCP, Correction
- **What changed:** From May 21 to July 6, 2026, searching City Record notices by agency name almost always found nothing, because the server garbled the search pattern before sending it to NYC Open Data. It failed especially for agency names with spaces or special characters, such as Parks and Recreation. Version 1.0.2 sends the pattern correctly.
- **If you used the old numbers:** If a search by agency name in that period found no notices, or fewer than you expected, search again with the current version or on City Record Online. Searches by notice type, date or keyword were not affected by this problem.
- **MCP version:** [nyc-record-mcp 1.0.2](CHANGELOG.md#102---2026-07-06)
- **More detail:** [The fix](https://github.com/BetaNYC/nyc-record-mcp/pull/6)

## 2026-07-06: Open solicitations due that day were left out in the evening

- **Tags:** MCP, Correction
- **What changed:** From May 21 to July 6, 2026, the list of open solicitations used the date in UTC, so after about 8 p.m. New York time it treated the day as over and left out solicitations due that day. Version 1.0.2 uses the date in New York.
- **If you used the old numbers:** If you asked for open solicitations on an evening in that period, the ones due that same day were missing. Lists asked for earlier in the day were not affected.
- **MCP version:** [nyc-record-mcp 1.0.2](CHANGELOG.md#102---2026-07-06)
- **More detail:** [The fix](https://github.com/BetaNYC/nyc-record-mcp/pull/7)

## 2026-07-06: Searches with an apostrophe work, and errors say what went wrong

- **Tags:** MCP
- **What changed:** A search value with an apostrophe in it could break the query sent to NYC Open Data; version 1.0.2 handles it. The server now checks notice types and dates before it asks, and when NYC Open Data rejects a request, the error passes on its explanation.
- **MCP version:** [nyc-record-mcp 1.0.2](CHANGELOG.md#102---2026-07-06)
- **More detail:** [The fix](https://github.com/BetaNYC/nyc-record-mcp/pull/7)

## 2026-05-21: First release, with City Record notices from NYC Open Data

- **Tags:** MCP
- **What changed:** The first version, published on npm, searched the City Record, the City's official publication of procurement solicitations, contract awards, public hearings and agency notices, through the City Record Online dataset on NYC Open Data. Its seven tools search notices by keyword, agency, type or date, and list recent procurement notices, public hearings and open solicitations.
- **MCP version:** [nyc-record-mcp 1.0.0](CHANGELOG.md#100---2026-05-21)
- **More detail:** [Release notes](CHANGELOG.md#100---2026-05-21) · [The package on npm](https://www.npmjs.com/package/@betanyc/nyc-record-mcp)
