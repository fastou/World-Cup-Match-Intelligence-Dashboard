# World Cup Match Intelligence Skill

A reusable Agent Skill for building and maintaining football match intelligence workflows with public match context, lineup/news/weather checks, market-style probability curves, AI synthesis, confidence downgrades, and historical snapshots for later calibration.

The repository also includes a bilingual World Cup dashboard as a reference implementation of the skill.

This project is designed for research, information organization, and data visualization. It does not place orders, execute actions, or provide automated financial instructions.

## Skill Files

```text
.agents/skills/world-cup-match-intelligence/SKILL.md
.claude/skills/world-cup-match-intelligence/SKILL.md
```

The two files have the same instructions so the workflow is available to Codex repo skills and Claude Code project skills.

Validate the packaged skill files with:

```bash
npm run validate:skills
```

## Features

- Public match data synchronization workflow.
- Lineup, injury, news, weather, venue, and tactical context handling.
- AI synthesis rules with explicit missing-data and stale-data downgrades.
- Market-style curves for match result, handicap, and totals when public data is available.
- Separation between model probabilities and public market prices.
- Elite public account position display rules for transparent source-backed panels.
- SQLite history archiving for calibration and backtesting.
- Bilingual UI guidance for Chinese / English dashboards.
- Deployment checks for serving a reference app under `/worldcup`.

The reference dashboard demonstrates:

- Chinese / English language switcher in the browser
- match tabs for switching between daily fixtures
- AI-assisted match probability summary
- public price curves for match result, handicap, and totals markets when a live source is available
- structured match intelligence:
  - projected or official lineups
  - injuries and suspensions
  - team news
  - recent form
  - tactical matchup notes
  - weather and venue context
  - source timestamps and confidence notes
- football account performance panel based on public data
- SQLite history archive for snapshots, price points, account positions, context updates, and final match results

## Project Name

Recommended GitHub repository name:

```text
world-cup-match-intelligence-skill
```

Current repository:

```text
World-Cup-Match-Intelligence-Dashboard
```

## Requirements

- Node.js 18 or newer
- Python 3 with the standard `sqlite3` module
- Network access for live public sources

No npm dependencies are required for the current version.

## Run Locally

```bash
npm start
```

Open:

```text
http://localhost:4173/
```

To serve the app under `/worldcup`:

```bash
BASE_PATH=/worldcup PORT=4174 npm start
```

Open:

```text
http://localhost:4174/worldcup/
```

## Data Refresh

Refresh local static match data:

```bash
npm run update:data
```

Sync public match context:

```bash
npm run sync:context
```

Archive the current dashboard snapshot into SQLite:

```bash
npm run archive:dashboard
```

Record a final score:

```bash
npm run record:result -- --match 2026-06-12-mex-rsa --home-goals 2 --away-goals 1 --source manual
```

## API Endpoints

```text
GET /api/health
GET /api/dashboard
GET /api/dashboard?force=1
GET /api/history/summary
```

When `BASE_PATH=/worldcup`, the same endpoints are mounted below `/worldcup`.

## History Database

The SQLite database is generated at:

```text
data/worldcup-history.sqlite
```

It is intentionally ignored by Git because it is runtime data.

Useful tables include:

- `dashboard_runs`
- `match_snapshots`
- `market_snapshots`
- `price_points`
- `elite_trader_rankings`
- `elite_position_snapshots`
- `context_runs`
- `context_match_snapshots`
- `match_results`

The view `v_moneyline_backtest` links stored probabilities, public prices, and recorded results for calibration checks.

## Deployment Notes

Systemd examples are included in `deploy/`:

- `worldcup-dashboard.service`
- `worldcup-context-sync.service`
- `worldcup-context-sync.timer`
- `worldcup-history-archive.service`
- `worldcup-history-archive.timer`

Nginx path mounting example:

```text
deploy/nginx-worldcup.conf
```

## Optional AI Synthesis

The context sync script can use an OpenAI-compatible Responses API endpoint if configured through environment variables or `/etc/worldcup-dashboard.env`.

Example:

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com
```

Do not commit API keys.

## Repository Hygiene

The repository ignores:

- local unrelated workspace folder `app/`
- generated context snapshots
- SQLite history databases
- environment files
- caches and logs

This keeps the GitHub repository focused on the reusable skill, reference dashboard source code, and seed data.
