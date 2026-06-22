# nyc-record-mcp

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server for NYC City Record notices, powered by the [NYC Open Data](https://data.cityofnewyork.us/City-Government/City-Record-Online/dg92-zbpx) dataset.

The City Record is the official publication of the City of New York — procurement solicitations, contract awards, public hearings, and agency notices, all in one place.

Vibe coded with [Claude](https://claude.ai) by [BetaNYC](https://beta.nyc).

---

## API key

**No API key is required.** The City Record dataset is public and this server works out of the box — no signup, no token.

Optionally, you can set a free [NYC Open Data (Socrata) app token](https://data.cityofnewyork.us/profile/app_tokens) to get higher rate limits under heavy use. It is not needed for normal use. To use one, set it as the `SOCRATA_APP_TOKEN` environment variable:

```bash
export SOCRATA_APP_TOKEN="your-app-token"
```

---

## What it does

Exposes 7 tools over MCP:

| Tool | Description |
|---|---|
| `search_notices` | Full-text search across all notices |
| `get_notices_by_agency` | Notices from a specific city agency |
| `get_notices_by_type` | Filter by notice type (Solicitation, Award, Public Hearings, etc.) |
| `get_procurement_notices` | Recent solicitations, awards, and intent-to-award notices |
| `get_public_hearings` | Recent public hearings, comment periods, and meetings |
| `get_open_solicitations` | Active RFPs/RFQs where the deadline has not passed |
| `get_notices_by_date_range` | All notices published within a date window |

---

## Tools reference

### `search_notices`

Full-text search across notice titles, descriptions, and agency names.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `query` | string | yes | — | Search term |
| `limit` | number | no | 25 | Max results (max 100) |

```
search_notices("affordable housing")
search_notices("cybersecurity", limit=50)
```

---

### `get_notices_by_agency`

Get notices from a specific city agency. Accepts partial name matches.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `agency_name` | string | yes | — | Agency name or partial name |
| `limit` | number | no | 25 | Max results (max 100) |

```
get_notices_by_agency("DCAS")
get_notices_by_agency("Department of City Planning")
get_notices_by_agency("Parks")
```

---

### `get_notices_by_type`

Filter notices by type.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `notice_type` | string | yes | — | One of: Solicitation, Award, Intent to Award, Intent to Negotiate, Public Hearings, Public Comment, Meeting, Notice, Vendor List, Sale |
| `limit` | number | no | 25 | Max results (max 100) |

```
get_notices_by_type("Solicitation")
get_notices_by_type("Public Hearings")
get_notices_by_type("Award", limit=50)
```

---

### `get_procurement_notices`

Returns recent solicitations, awards, intent-to-award, and vendor list notices — the full procurement lifecycle.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `limit` | number | no | 25 | Max results (max 100) |

```
get_procurement_notices()
get_procurement_notices(limit=100)
```

---

### `get_public_hearings`

Returns recent public hearings, public comment periods, agency meetings, and general notices.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `limit` | number | no | 25 | Max results (max 100) |

```
get_public_hearings()
```

---

### `get_open_solicitations`

Returns active solicitations where the due date has not yet passed, sorted by soonest deadline first.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `limit` | number | no | 25 | Max results (max 100) |

```
get_open_solicitations()
get_open_solicitations(limit=50)
```

---

### `get_notices_by_date_range`

Get all City Record notices published within a date range.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `start_date` | string | yes | — | Start date, YYYY-MM-DD |
| `end_date` | string | yes | — | End date, YYYY-MM-DD |
| `limit` | number | no | 50 | Max results (max 200) |

```
get_notices_by_date_range("2026-05-01", "2026-05-19")
get_notices_by_date_range("2026-01-01", "2026-03-31", limit=200)
```

---

## Common workflows

### Track open RFPs before they close

```
get_open_solicitations()        → sorted by due date — soonest first
search_notices("technology")    → filter by topic to narrow scope
```

### Monitor a specific agency's procurement activity

```
get_notices_by_agency("DOITT")           → all recent notices
get_notices_by_type("Solicitation")      → open bids from any agency
```

### Research recent contract awards

```
get_notices_by_type("Award")             → recent contract awards
search_notices("cybersecurity award")    → keyword-filtered awards
```

### Find public comment opportunities

```
get_public_hearings()                    → hearings, meetings, comment periods
get_notices_by_date_range("2026-05-01", "2026-05-31")   → by month
```

---

## Prerequisites

- Node.js 18 or later
- No API key required — the dataset is public
- Optional: [NYC Open Data app token](https://data.cityofnewyork.us/profile/app_tokens) for higher rate limits (set as `SOCRATA_APP_TOKEN`)

---

## Installation

### Option 1 — npx (no install required)

```bash
npx @betanyc/nyc-record-mcp
```

### Option 2 — global install

```bash
npm install -g @betanyc/nyc-record-mcp
nyc-record-mcp
```

### Option 3 — build from source

```bash
git clone https://github.com/BetaNYC/nyc-record-mcp.git
cd nyc-record-mcp
npm install
npm run build
npm start
```

---

## Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "nyc-record": {
      "command": "npx",
      "args": ["-y", "@betanyc/nyc-record-mcp"]
    }
  }
}
```

With an optional app token:

```json
{
  "mcpServers": {
    "nyc-record": {
      "command": "npx",
      "args": ["-y", "@betanyc/nyc-record-mcp"],
      "env": {
        "SOCRATA_APP_TOKEN": "your_token_here"
      }
    }
  }
}
```

### Claude Code

Add to your project's `.claude/settings.json`:

```json
{
  "mcpServers": {
    "nyc-record": {
      "command": "npx",
      "args": ["-y", "@betanyc/nyc-record-mcp"]
    }
  }
}
```

---

## Example usage

Once connected, you can ask your AI assistant things like:

- *"What RFPs are currently open from the Department of City Planning?"*
- *"What contracts did DCAS award this month?"*
- *"Are there any public hearings about zoning this week?"*
- *"What solicitations related to cybersecurity are still open?"*
- *"Show me all City Record notices from Parks Department in April 2026."*

---

## Data source

All data comes from the [NYC City Record Online dataset](https://data.cityofnewyork.us/City-Government/City-Record-Online/dg92-zbpx) on NYC Open Data, published by the NYC Department of Citywide Administrative Services (DCAS). The dataset is updated daily and includes notices published in the official City Record since 2015.

---

## Related projects

If you're looking for broader access to NYC Open Data — or Socrata-powered portals in other cities — check out Nathan Storey's **[socrata-mcp-server](https://github.com/npstorey/socrata-mcp-server)**. It connects AI assistants to any Socrata portal with tools for dataset discovery and SoQL queries, including NYC, Chicago, San Francisco, and [New York State's open data portal](https://data.ny.gov) (data.ny.gov), among hundreds more. The SODA API pattern in this project was informed by Nathan's work.

---

## Contributing

Issues and pull requests welcome at [github.com/BetaNYC/nyc-record-mcp](https://github.com/BetaNYC/nyc-record-mcp).

---

## License

MIT License

Copyright (c) 2026 BetaNYC

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
