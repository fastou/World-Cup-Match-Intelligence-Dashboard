---
name: world-cup-match-intelligence
description: Use when building or maintaining football match intelligence workflows, including public source synchronization, lineup/news/weather context, market probability curves, AI synthesis, confidence downgrades, history archiving, backtesting, bilingual dashboard UI updates, and deployment checks. This repository includes a reference World Cup dashboard implementation.
---

# World Cup Match Intelligence

Use this skill when building, modifying, operating, or extending a football match intelligence workflow. This repository includes a World Cup dashboard as a reference implementation.

## Core Rules

- Treat the dashboard as research and monitoring software. Do not automate orders, guarantee outcomes, or present outputs as financial advice.
- Do not fabricate missing sports, odds, Polymarket, lineup, injury, weather, or account data. Mark unavailable inputs as missing, stale, or source-unreachable.
- Keep model probabilities independent from market prices. Market prices may inform edge and market movement, but should not simply become the model prediction.
- If key dynamic inputs are missing, downgrade recommendations to observation, waiting, or low confidence.
- Never commit secrets, local credentials, generated SQLite databases, runtime context snapshots, or personal marketing drafts.

## Project Map

- `server.js`: HTTP server, API routes, dashboard merge logic, Polymarket/public market fetches, elite account aggregation, probability calculations.
- `public/index.html`: single-page bilingual dashboard UI.
- `data/worldcup-dashboard.json`: seed/static match data and manually maintained market scaffolding.
- `data/research-framework.json`: structured research dimensions and scoring framework.
- `data/worldcup-context.json`: generated runtime context, ignored by Git.
- `scripts/sync-worldcup-context.js`: public source sync and optional OpenAI-compatible AI synthesis.
- `scripts/archive-dashboard.js`: archives current dashboard snapshots into SQLite.
- `scripts/record-match-result.js`: records final scores for later calibration.
- `scripts/history-store.js`: SQLite schema, migrations, and persistence helpers.
- `deploy/`: systemd and nginx examples.

## Workflow

1. Inspect `git status --short --branch` before changes.
2. Read the relevant project files before editing. Use `rg` or `rg --files` first.
3. Preserve the dashboard's bilingual structure. Any new visible UI string needs Chinese and English copy.
4. Keep public source records attached to dynamic facts: source name, URL if available, timestamp, status, confidence, and reason.
5. Recompute affected model outputs after data changes:
   - win/draw/loss probabilities
   - handicap probabilities
   - totals probabilities
   - edge
   - max informational entry price
   - observe/wait/reduce/add labels
6. Persist newly important fields through the archive layer when they matter for later analysis.
7. Validate with local commands and API checks before committing.

## Data Quality Logic

Use these prediction modes:

- `baseline`: long-term strength, seed data, and existing model only.
- `dynamic`: baseline plus current lineup, injury, team news, form, tactical, weather, venue, odds, and market curve inputs.
- `lineup-confirmed`: dynamic mode after official starting lineups are available.

Downgrade output when inputs are incomplete:

- Missing lineups or injuries: no strong confidence or aggressive action label.
- Missing odds or Polymarket curves: no price guidance.
- Stale news, weather, or AI synthesis: show the stale reason and update time.
- Major changes such as goalkeeper changes, core-player absence, red cards, severe weather, or large market moves should trigger a recomputation and visible reason.

## Public Source Sync

When updating source collection:

- Prefer official team/FIFA sources for lineups, injuries, venue, and match status when available.
- Use reputable public sports sources for previews, projected lineups, injury lists, odds context, and tactical notes.
- Add multiple sources when a dimension is often missing, but preserve per-source status instead of hiding failures.
- Keep fetch timeouts bounded; one slow source should not block the whole dashboard.
- Optional AI synthesis must summarize only retrieved public facts and explicitly state missing inputs.

## Polymarket And Account Intelligence

When maintaining public market data:

- Fetch live curves for match result, handicap, and totals separately when markets exist.
- Keep chart controls usable for each market type and each outcome.
- Track elite football accounts from public data by transparent criteria such as soccer-market realized PnL, win rate, sample size, and recent activity.
- Show account positions as expandable row details with account, side, amount, average or latest price, timestamp, market, and source status.
- If account or position data is unavailable, show unavailable status instead of fallback-looking fake rows.

## History And Backtesting

Important dashboard updates should be archived so later strategy analysis can compare:

- model probability at the time
- public market prices and curves
- dynamic context state
- elite account positions
- final match result

When adding fields that affect model evaluation, update `scripts/history-store.js` and verify `npm run archive:dashboard`.

## Validation Commands

Use the subset relevant to the change:

```bash
npm start
npm run update:data
npm run sync:context
npm run archive:dashboard
npm run record:result -- --match MATCH_ID --home-goals 0 --away-goals 0 --source manual
BASE_PATH=/worldcup PORT=4174 npm start
```

Useful API checks:

```text
GET /api/health
GET /api/dashboard
GET /api/dashboard?force=1
GET /api/history/summary
```

## Deployment Checks

- Use the `deploy/` files as the source of truth for service shape.
- Confirm path mounting under `/worldcup` when `BASE_PATH=/worldcup`.
- Keep environment-specific secrets and API keys outside Git.
- After server deployment, verify the page, dashboard API, context sync timer, and archive timer.
