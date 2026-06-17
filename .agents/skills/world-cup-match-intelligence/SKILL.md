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
- Keep per-match AI action summaries structured, price-disciplined, and explicitly framed as decision support rather than automated betting or guaranteed profit.
- Never commit secrets, local credentials, generated SQLite databases, runtime context snapshots, or personal marketing drafts.

## Project Map

- `server.js`: HTTP server, API routes, dashboard merge logic, Polymarket/public market fetches, elite account aggregation, probability calculations.
- `public/index.html`: single-page bilingual dashboard UI.
- `data/worldcup-dashboard.json`: seed/static match data and manually maintained market scaffolding.
- `data/research-framework.json`: structured research dimensions and scoring framework.
- `data/head-to-head-overrides.json`: manually verified structured H2H records and no-meeting confirmations.
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
8. For dashboard changes, deploy after validation and then commit/push. If GitHub push times out, report the local commit and ahead status.

## Match Window And Lifecycle

- Default dashboard scope is the next three days of not-finished matches, not only today's matches.
- Hide a match when a final result exists in `match_results`, or when the kickoff is more than the configured post-kickoff grace period ago and no live status keeps it active.
- Fetch schedule windows with a lookback day when host-local dates can differ from the user's timezone. Do not drop an in-progress match only because the kickoff is several hours old if the schedule source has not marked it completed.
- Keep the public sync script and dashboard server on the same match-window rules: lookback days, live grace hours, hide-after hours, and finished-status handling should not diverge.
- Use public schedule/status sources such as ESPN/FIFA only for fixture timing and status unless full modeling inputs exist.
- If a fixture is inside the three-day window but lacks local team static data, model parameters, odds, or market mappings, generate a conservative auto-baseline model from schedule/team identifiers. Do not call it pending-model in the user UI.
- Auto-baseline fixtures may render basic win/draw/loss, total, and handicap probabilities, but must mark missing dynamic context and real markets. Do not render live edge or price advice unless real odds/Polymarket mappings exist.
- Auto-baseline fixtures must still merge any available generated `worldcup-context.json` dynamic context by schedule id. If the sync produced lineup/news/weather/AI fields, the dashboard should show them instead of default placeholders.
- Keep full local models and auto-baseline fixtures visually distinct in the UI and API payload.

## Static Match Context

- Team static data should include world ranking when available, with source name, source URL, and update date.
- World ranking should use an official/public ranking source or a timestamped local snapshot fallback such as `data/fifa-rankings.json`; it should not remain blank for common national teams.
- When new schedule teams appear, refresh ranking coverage for every visible team code in the current match window, not only the single reported fixture.
- Each team should include recent match form against other opponents when a public results feed is available: date, opponent, score, W/D/L, competition, source URL, update time, and a compact W/D/L plus goals summary.
- Recent form belongs in the Static tab as historical context. It can inform low-weight model review, but missing or stale recent-form data must not be invented or treated as confirmed team news.
- Each team should include all-time FIFA World Cup finals record when available: appearances, matches, W/D/L, goals for/against, best finish, source, update date, and as-of scope. Exclude qualifiers; explicitly mark teams with no pre-2026 finals appearances.
- Each team should include squad physical and line-profile context when a public squad source is available: average height, age, caps, GK/DF/MF/FW splits, club-tier level, source, update date, and data limits. Do not infer market value, goalkeeper shot-stopping, player ratings, or fitness from these lineup metrics; label unavailable value/rating fields explicitly.
- AI "human read" notes may summarize squad-profile contrasts only after structured data exists. They must not invent transfer values, injuries, lineups, save rates, or tactical facts not present in the payload.
- If head-to-head is not yet available for an auto-baseline fixture, show a structured missing/pending status with source target, not a blank value.
- Each modeled match should include recent head-to-head context for the four years before kickoff: window start/end, match count, W/D/L, goals, latest meetings, sources, update time, and model impact.
- Do not backfill the current match result into pre-match head-to-head context. If the recent window has no meetings, state that explicitly and apply no head-to-head model weighting.
- Do not display search-engine snippets as head-to-head meetings. Only dated, auditable score records belong in latest meetings; generic search summaries may only appear as source status or pending-verification notes.
- Do not show search-engine proxy URLs as H2H source links. Link only to auditable source pages such as ESPN, 11v11, worldfootball.net, National Football Teams, or reputable match previews.
- Historical context outside the four-year window may be shown as background only; label it separately from model inputs.
- When static context is added, surface it in the Static tab and preserve it in dashboard history if it affects future review.

## Data Quality Logic

Use these prediction modes:

- `baseline`: long-term strength, seed data, and existing model only.
- `dynamic`: baseline plus current lineup, injury, team news, form, tactical, weather, venue, odds, and market curve inputs.
- `lineup-confirmed`: dynamic mode after official starting lineups are available.

Downgrade output when inputs are incomplete:

- Missing lineups or injuries: no strong confidence or aggressive action label.
- Missing odds or Polymarket curves: no price guidance.
- Auto-baseline fixtures: only low-confidence AI context and observation labels until static teams, real odds, Polymarket curves, and dynamic context are available.
- Stale news, weather, or AI synthesis: show the stale reason and update time.
- Major changes such as goalkeeper changes, core-player absence, red cards, severe weather, or large market moves should trigger a recomputation and visible reason.

Every data dimension should use an explicit source chain instead of simply waiting:

- `primary`: official or closest public source for the fact, for example schedule/venue/status from ESPN/FIFA, weather from Open-Meteo, rankings from FIFA snapshots, market curves from Polymarket, and lineups/injuries from official or reputable match previews.
- `backup`: reputable public search/articles for the same dimension, with source URLs and extraction status preserved.
- `fallback`: a conservative, clearly labelled low-confidence baseline from already verified facts such as schedule, venue, ranking, team rating, weather availability, and model priors.

Fallbacks may explain uncertainty and keep the page useful, but they must not fabricate unavailable facts. For example, do not create starting XIs, confirmed injuries, holder rows, odds, or head-to-head scores when no source supports them. Show `queried / pending`, `pending verification`, or `rule fallback` instead of blank values when the sync ran but did not produce a verified fact.

Ranking, venue, weather, recent form, tactical matchup, AI synthesis, and four-year head-to-head context should all have either a verified value or a visible low-confidence fallback. A plain `waiting` state should be reserved for source failures, not for dimensions that can be explained from existing baseline inputs.

## Public Source Sync

When updating source collection:

- Prefer official team/FIFA sources for lineups, injuries, venue, and match status when available.
- Use reputable public sports sources for previews, projected lineups, injury lists, odds context, and tactical notes.
- Add multiple sources when a dimension is often missing, but preserve per-source status instead of hiding failures.
- Keep fetch timeouts bounded; one slow source should not block the whole dashboard.
- Optional AI synthesis must summarize only retrieved public facts and explicitly state missing inputs.
- Public sync should generate `worldcup-context.json` fields for lineups, injuries, team news, recent form, tactical matchup, weather, AI synthesis, and head-to-head. If a field cannot be verified, write a structured low-confidence explanation with source status rather than leaving the UI blank.
- ESPN schedule venue data should be carried into match records and used to drive weather lookup whenever possible.
- Context writes should not fail just because historical archiving is slow or locked. Write `worldcup-context.json` first, then archive with a bounded timeout and warning.
- Server-side AI trade summaries should use the merged dashboard state after live prices, curves, holders, model probabilities, and trading gates are attached. Use a rule-based fallback first, then optional OpenAI-compatible synthesis from server environment/Codex config without committing secrets.

## Polymarket And Account Intelligence

When maintaining public market data:

- Fetch live curves for match result, handicap, and totals separately when markets exist.
- Prioritize direct match sports slugs and sports-page payload markets ahead of broad tournament searches so long-term World Cup markets do not crowd out current fixture curves.
- Maintain explicit Polymarket team slug and alias overrides when market slugs or display names differ from schedule abbreviations, for example Cape Verde/Cabo Verde using `cvi` rather than `cpv`.
- Keep chart controls usable for each market type and each outcome.
- Track elite football accounts from public data by transparent criteria such as soccer-market realized PnL, win rate, sample size, and recent activity.
- Show account positions as expandable row details with account, side, amount, average or latest price, timestamp, market, and source status.
- Fetch and display top holders for relevant Polymarket condition/token pairs when public holder data is available. Mark whether holders match the football Top 100 list.
- Store holder snapshots separately for recommendation-mapped markets and general World Cup market-pool tokens so later analysis can compare holder behavior to outcomes.
- If account or position data is unavailable, show unavailable status instead of fallback-looking fake rows.

## History And Backtesting

Important dashboard updates should be archived so later strategy analysis can compare:

- model probability at the time
- public market prices and curves
- dynamic context state
- elite account positions
- top holder snapshots
- static world rankings, team recent form, and head-to-head context
- squad physical/line-profile context and AI human-read notes
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
