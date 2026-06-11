# World Cup Match Intelligence Dashboard

A bilingual dashboard for following World Cup matches with structured team context, live market-style probability curves, model probabilities, lineup/news/weather intelligence, and historical snapshots for later model calibration.

The project is designed as a research and monitoring tool. It does not place orders, execute actions, or provide automated financial instructions.

## Features

- Chinese / English language switcher in the browser.
- Match tabs for switching between daily fixtures.
- AI-assisted match probability summary.
- Public price curves for match result, handicap, and totals markets when a live source is available.
- Structured match intelligence:
  - projected or official lineups
  - injuries and suspensions
  - team news
  - recent form
  - tactical matchup notes
  - weather and venue context
  - source timestamps and confidence notes
- Football account performance panel based on public Polymarket data.
- SQLite history archive for snapshots, price points, account positions, context updates, and final match results.
- Bundled Agent Skill for project-specific data sync, match intelligence, AI synthesis, history archiving, and deployment workflows.

## Project Name

Recommended GitHub repository name:

```text
world-cup-match-intelligence-dashboard
```

## Included Agent Skill

This repository includes a reusable skill for maintaining and extending the match intelligence workflow:

```text
.codex/skills/world-cup-match-intelligence/SKILL.md
.claude/skills/world-cup-match-intelligence/SKILL.md
```

The two files have the same instructions so the workflow is available to both Codex and Claude Code style skill loaders. The skill covers:

- public match data synchronization
- lineup, injury, news, weather, and tactical context handling
- live market curves for match result, handicap, and totals
- AI synthesis with confidence downgrades when inputs are missing
- elite public account position display rules
- SQLite history archiving for later calibration and backtesting
- deployment and `/worldcup` path verification

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

This keeps the GitHub repository focused on the dashboard source code and reusable seed data.
