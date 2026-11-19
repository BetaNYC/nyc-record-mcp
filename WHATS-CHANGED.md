# What's changed

This page lists the changes to nyc-record-mcp that a reader would notice: new tools, changes to what the tools return, and corrections when the server gave a wrong answer. Newest first. Dates are New York dates, the day a version reached npm. CHANGELOG.md sometimes gives the date in UTC instead.

- **History begins:** 2026-05-21, the first release. Corrections made before this date may be missing.
- **Data refresh:** None to list. Every answer asks the City Record Online dataset on NYC Open Data at the time of the question.

To report a bug in this server or ask for a new feature, [open an issue on GitHub](https://github.com/BetaNYC/nyc-record-mcp/issues).

## Unreleased: Ask the server where its data comes from

- **Tags:** MCP
- **What changed:** A new tool answers "where does this notice come from?", "is this official?", "how current is it?" and "how do I check it?". It names the source, the City Record Online dataset on NYC Open Data, and its publisher, the NYC Department of Citywide Administrative Services. It says that the notices are passed on exactly as the City publishes them, that every answer asks NYC Open Data at the time of the question, where to check a notice on City Record Online, and where to report an error in the data. It also says what to expect from the data: about 88% of the notices are Changes in Personnel listings, which have no notice type, so the tools that pick notices by type never return them, while keyword, agency and date searches can be mostly personnel listings. It gives BetaNYC's email address for questions about the data, lab@beta.nyc. The same information is published as a data catalog. Every tool now tells your AI app that it only reads and never changes anything. When something goes wrong, the tool now says in a plain sentence what happened and what to try, instead of a technical error, and a request to NYC Open Data that hangs gives up after 30 seconds (60 for a keyword search). Every answer now ends with its source, City Record Online from the NYC Department of Citywide Administrative Services, a link to the dataset and the time the notices were fetched. Every list says how many notices it shows and whether more match; a new setting, offset, gets the next ones. One question to NYC Open Data now gives up after 90 seconds in all, even when it has to try again. The list of open solicitations now leaves out a solicitation as soon as its deadline passes: before, one due at 10 a.m. still showed as open for the rest of that day. A date range with a date that does not exist, such as February 31, or a start after the end, now gets a plain message instead of an empty answer. The open-solicitation list also adds BetaNYC's own labels, kept apart from the City's data: a notice with no closing time stays listed through its due day, with a note to check the real time with the agency; a due date years away is marked as a likely placeholder; and when a solicitation was extended or corrected, only its newest notice is listed, with the older ones named under it by number and date. A cancellation notice is listed apart, but it never takes a solicitation off the list: the solicitation stays, with a note that a cancellation notice matches it, because an agency can cancel an old round and bid it again under the same number. Because BetaNYC arranges that list, it is no longer the official record, and the server now says so: the official record is the City Record Online dataset on NYC Open Data. The labels are our reading of the notice titles, not an official status, so read the notice before you rely on one. Every notice that is listed still has all of the City's own information, unchanged, and you can ask for every notice, folded ones included. The other search tools give the City's notices exactly as published. Warning for programs that read the answers: if you wrote a program that reads this server's answers itself, it will break. The answer used to be a plain list of notices. It is now an object, and the notices are in its "notices" field. The source line comes after it, as a separate piece of text. [CHANGELOG.md](CHANGELOG.md) shows the old and new forms and the one-line change to make. If you only ask questions through an AI app, nothing changes for you.
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
