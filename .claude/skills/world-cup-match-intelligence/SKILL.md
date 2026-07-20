---
name: world-cup-match-intelligence
description: Use when building or maintaining football match intelligence workflows, including public source synchronization, lineup/news/weather context, Polymarket soccer competition discovery, market probability curves, AI synthesis, confidence downgrades, history archiving, backtesting, bilingual dashboard UI updates, and deployment checks. This repository includes a reference World Cup dashboard implementation that now generalizes to authoritative soccer competitions on Polymarket.
---

# Soccer Match Intelligence

Use this skill when building, modifying, operating, or extending a football/soccer match intelligence workflow.

## Core Rules

- Treat the dashboard as research and monitoring software. Do not automate orders, guarantee outcomes, or present outputs as financial advice.
- Do not fabricate missing sports, odds, Polymarket, lineup, injury, weather, or account data. Mark unavailable inputs as missing, stale, or source-unreachable.
- Keep model probabilities independent from market prices. Market prices may inform edge and market movement, but should not simply become the model prediction.
- Keep match analysis competition-agnostic where possible: World Cup layers such as FIFA ranking/group/finals history apply only when relevant, while club or non-World-Cup fixtures keep those fields missing/fallback; discover Polymarket soccer fixtures from the soccer/games pool, classify major competition families such as World Cup, Euros, Copa America, UCL, Europa League, EPL, La Liga, Serie A, Bundesliga, Ligue 1, MLS, Liga MX, Libertadores, Sudamericana, and CONCACAF, and only turn single `A vs B` games into match cards. Other high-liquidity soccer should stay hidden from the main dashboard unless explicitly enabled by configuration and reviewed as real football.
- Comprehensive match forecasts should use a transparent xG-to-score-distribution layer: long-term strength/Elo-style baseline, recent form, World Cup record, dynamic context, tournament trend, Poisson score grid, and only a light market calibration. Do not present this as an official Goldman Sachs model unless using an official source; label it as Goldman-style public methodology when relevant.
- Probability adjustments for win/draw/loss, totals, BTTS, and top correct scores must stay tied to one score-distribution grid. Do not patch BTTS or over/under percentages independently in a way that contradicts the displayed most-likely scores.
- Comprehensive match forecasts should also check supplemental dimensions when data exists: rest days since the previous match, current-tournament team form, 20-year head-to-head, knockout-stage experience, public tipster consensus, travel/venue burden, referee/card risk, suspension accumulation, penalty taker/keeper evidence, goalkeeper shot-stopping evidence, goalkeeper proxy strength, and squad age/fatigue structure. Only the structured dimensions may enter the model; unverified dimensions stay as missing/watchlist items.
- From the round of 16 onward, structured squad physical mismatches are core model inputs, not just notes: overall height gap, midfield height/duel gap, forward-vs-defender height gap, goalkeeper proxy, age/fatigue, and club-tier counterweight should adjust the same xG/score grid. If a favorite has a clear physical/duel disadvantage, downgrade regulation win, deep handicap, second-goal paths, and favorite-extension correct scores while lifting draw/current-score protection.
- Neutral media and expert previews may enter the model only after source filtering: prioritize reputable neutral outlets, downgrade betting-tip or odds-preview articles to market context, exclude search-proxy noise, preserve source URLs/snippets, and ask the local OpenAI-compatible model for a conservative structured summary. Media consensus should be a low-weight xG/BTTS/total/draw signal, never a replacement for lineups, injuries, live stats, or the score-grid model.
- Include a tournament-trend layer when current-tournament results exist: compute it from deduplicated final scores, keep the sample size visible, and apply only small weighted adjustments so early-tournament signals do not overfit.
- In final group-stage rounds, include group qualification situation and motivation: current points, rank, goal difference, whether a team needs a win, whether goal difference matters, whether a draw has value, knockout-path value for finishing first vs second, and whether tempo control or rotation risk rises. Apply only small, explainable xG adjustments.
- In final group-stage rounds, do not stop at "draw has value." If first-place finish changes the likely knockout path or avoids a stronger opponent, model a small aggression/path-value adjustment and explain it in the match notes.
- In knockout rounds, keep 90-minute match result separate from `Team to Advance`. Regulation win/draw/loss remains a 90-minute market; advancement equals regulation win plus the draw probability split by extra-time/penalty tiebreak factors.
- For `Team to Advance`, compute and display a separate advancement probability using regulation probabilities plus a conservative tiebreak split from xG edge, ranking/depth, and World Cup record. Do not compare a 90-minute win price directly with an advancement price.
- For knockout advancement, include knockout-stage experience as a low-weight tiebreak factor when structured World Cup records exist: best finish, finals appearances, and finals matches can form a transparent proxy. Label it as a proxy, not as verified penalty-taking ability.
- In knockout rounds, add rest/fatigue and current-tournament form as low-weight model factors when schedule and completed-score data exist. Public tipster consensus may only be used as a small market-context signal, never as a substitute for the model.
- In knockout rounds, apply the post-review correction learned from Brazil-Japan, Germany-Paraguay, and Netherlands-Morocco on June 29-30, 2026: lift regulation draw/extra-time paths, keep BTTS tied to the score grid, and downgrade favorite 90-minute moneyline/deep handicap unless edge is strong. Quarter-finals and later use a stricter stage profile because team quality is closer; `Team to Advance` is often the cleaner favorite market when price is fair.
- From the round of 16 onward, keep group-stage logic intact but enable a separate live structural layer: reduce reliance on world-ranking/favorite priors, and weight verified live personnel/position signals, lead quality, defensive load, injury substitutions, late cards, goalkeeper saves, clearances, and estimated stoppage time. A favorite trailing or level late can remain a small correct-score path only when synced stats show dangerous pressure, not mere reputation.
- After the Switzerland-Colombia 0-0 review on July 8, 2026, add a match-shape step before correct-score recommendations. If a knockout match is near-even by model and market, has elevated draw/under-2.5/low-score mass, and no clear regulation favorite, classify it as `balanced knockout low-score`; pre-match correct-score combos should start from the low-event draw cluster `0-0 / 1-1` plus both one-goal covers `1-0 / 0-1`, keep reserve for the 18-25 minute tempo check, and avoid turning a slight to-advance edge into a 90-minute win core.
- Correct-score combos must be path-cluster aware, not just sorted by individual score probability. Use clusters such as low-event draw, one-goal covers, favorite-extension, and chaotic high-goal tails; show which shape drove the combo so later review can tell whether the platform made the right kind of plan.
- If key dynamic inputs are missing, downgrade recommendations to observation, waiting, or low confidence.
- Keep per-match AI action summaries structured, price-disciplined, and explicitly framed as decision support rather than automated betting or guaranteed profit.
- Never commit secrets, local credentials, generated SQLite databases, runtime context snapshots, or personal marketing drafts.

## Project Map

- `server.js`, `public/index.html`: HTTP/API/dashboard merge logic, Polymarket soccer competition discovery, probability calculations, and bilingual UI with competition category filters.
- `data/worldcup-dashboard.json`, `data/research-framework.json`, `data/head-to-head-overrides.json`: seed/static match data, structured research dimensions, and verified H2H overrides.
- `data/worldcup-context.json`: generated runtime context, ignored by Git.
- `scripts/sync-worldcup-context.js`, `archive-dashboard.js`, `record-match-result.js`, `history-store.js`: public sync, history/archive, result recording, and SQLite persistence.
- `deploy/`: systemd and nginx examples.

## Workflow

1. Inspect `git status --short --branch` before changes.
2. Read relevant files before editing with `rg`; preserve bilingual UI and add Chinese/English copy for new visible strings.
4. Keep public source records attached to dynamic facts: source name, URL if available, timestamp, status, confidence, and reason.
5. Recompute affected model outputs after data changes: win/draw/loss, handicap, totals, edge, max informational entry price, and observe/wait/reduce/add labels.
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
- Current-tournament trend analysis should use the full tournament-to-date schedule range when available, not only the visible three-day window. Deduplicate `schedule-...` and bare ESPN ids before calculating rates.

## Static Match Context

- Team static data should include world ranking when available, with source name, source URL, and update date.
- World ranking should use an official/public ranking source or a timestamped local snapshot fallback such as `data/fifa-rankings.json`; it should not remain blank for common national teams.
- When new schedule teams appear, refresh ranking coverage for every visible team code in the current match window, not only the single reported fixture.
- Each team should include recent match form against other opponents when a public results feed is available: date, opponent, score, W/D/L, competition, source URL, update time, and a compact W/D/L plus goals summary.
- Recent form belongs in the Static tab as historical context. It can inform low-weight model review, but missing or stale recent-form data must not be invented or treated as confirmed team news.
- Each team should include all-time FIFA World Cup finals record when available: appearances, matches, W/D/L, goals for/against, best finish, source, update date, and as-of scope. Exclude qualifiers; explicitly mark teams with no pre-2026 finals appearances.
- Each team should include squad physical and line-profile context when a public squad source is available: average height, age, caps, GK/DF/MF/FW splits, club-tier level, source, update date, and data limits. Do not infer market value, goalkeeper shot-stopping, player ratings, or fitness from these lineup metrics; label unavailable value/rating fields explicitly.
- Forecasts may use a low-weight goalkeeper/age structure factor only from structured squad fields and recent defensive evidence: goalkeeper height, international caps, club-tier proxy, goalkeeper age, outfield age, defensive-line age, recent clean sheets, and recent goals conceded. Do not call this verified save percentage or fitness data unless a direct source exists.
- AI "human read" notes may summarize squad-profile contrasts only after structured data exists. They must not invent transfer values, injuries, lineups, save rates, or tactical facts not present in the payload.
- If head-to-head is not yet available for an auto-baseline fixture, show a structured missing/pending status with source target, not a blank value.
- Each modeled match should include recent head-to-head context for the 20 years before kickoff: window start/end, match count, W/D/L, goals, latest meetings, sources, update time, and model impact.
- Do not backfill the current match result into pre-match head-to-head context. If the recent window has no meetings, state that explicitly and apply no head-to-head model weighting.
- Do not display search-engine snippets as head-to-head meetings. Only dated, auditable score records belong in latest meetings; generic search summaries may only appear as source status or pending-verification notes.
- Do not show search-engine proxy URLs as H2H source links. Link only to auditable source pages such as ESPN, 11v11, worldfootball.net, National Football Teams, or reputable match previews.
- Historical context outside the 20-year window may be shown as background only; label it separately from model inputs.
- When static context is added, surface it in the Static tab and preserve it in dashboard history if it affects future review.

## Data Quality Logic

Use these prediction modes:
- `baseline`: long-term strength, seed data, and existing model only.
- `dynamic`: baseline plus current lineup, injury, team news, form, tactical, weather, venue, odds, and market curve inputs.
- `lineup-confirmed`: dynamic mode after official starting lineups are available.

Downgrade output when inputs are incomplete:
- Missing lineups or injuries: no strong confidence or aggressive action label.
- Lineup gate reasons must distinguish projected lineups, queried-but-unverified lineups, and missing lineup sources. Do not collapse those states into a vague "lineup not fully confirmed" message.
- Missing odds or Polymarket curves: no price guidance.
- Auto-baseline fixtures: only low-confidence AI context and observation labels until static teams, real odds, Polymarket curves, and dynamic context are available.
- Stale news, weather, or AI synthesis: show the stale reason and update time.
- Major changes such as goalkeeper changes, core-player absence, red cards, severe weather, or large market moves should trigger a recomputation and visible reason.

Every data dimension should use an explicit source chain instead of simply waiting:

- `primary`: official or closest public source for the fact, for example schedule/venue/status from ESPN/FIFA, weather from Open-Meteo, rankings from FIFA snapshots, market curves from Polymarket, and lineups/injuries from official or reputable match previews.
- `backup`: reputable public search/articles for the same dimension, with source URLs and extraction status preserved.
- `fallback`: a conservative, clearly labelled low-confidence baseline from already verified facts such as schedule, venue, ranking, team rating, weather availability, and model priors.

Fallbacks may explain uncertainty and keep the page useful, but they must not fabricate unavailable facts. For example, do not create starting XIs, confirmed injuries, holder rows, odds, or head-to-head scores when no source supports them. Show `queried / pending`, `pending verification`, or `rule fallback` instead of blank values when the sync ran but did not produce a verified fact.

Ranking, venue, weather, recent form, tactical matchup, AI synthesis, and 20-year head-to-head context should all have either a verified value or a visible low-confidence fallback. A plain `waiting` state should be reserved for source failures, not for dimensions that can be explained from existing baseline inputs.

Tournament trend fields should explain their evidence: sample size, BTTS rate, over/under rate, draw rate, underdog scoring rate, favorite clean-sheet rate, confederation summaries, and per-match adjustment notes. Never hard-code narrative beliefs such as "African teams are strong" as permanent truths; convert them into current-tournament, sample-weighted signals such as CAF goals, underdog scoring, BTTS, and results versus ranking expectation.

## Public Source Sync

When updating source collection:

- Prefer official team/FIFA sources for lineups, injuries, venue, and match status when available.
- Use reputable public sports sources for previews, projected lineups, injury lists, odds context, and tactical notes.
- Add multiple sources when a dimension is often missing, but preserve per-source status instead of hiding failures.
- Keep fetch timeouts bounded; one slow source should not block the whole dashboard.
- Optional AI synthesis must summarize only retrieved public facts and explicitly state missing inputs.
- Public sync should generate `worldcup-context.json` fields for lineups, injuries, team news, recent form, tactical matchup, weather, AI synthesis, and head-to-head. If a field cannot be verified, write a structured low-confidence explanation with source status rather than leaving the UI blank.
- When adding new dimensions, separate computable inputs from watchlist inputs. Computable examples: rest days from schedule, current-tournament W/D/L and goals from final scores, 20-year H2H from verified overrides, and public tipster direction from parsed tips. Watchlist examples until a source exists: referee/card tendency, yellow-card suspension risk, penalty taker/keeper evidence, goalkeeper shot-stopping, and travel fatigue beyond venue/kickoff.
- ESPN schedule venue data should be carried into match records and used to drive weather lookup whenever possible.
- Context writes should not fail just because historical archiving is slow or locked. Write `worldcup-context.json` first, then archive with a bounded timeout and warning.
- Server-side AI trade summaries should use the merged dashboard state after live prices, curves, holders, model probabilities, and trading gates are attached. Use a rule-based fallback first, then optional OpenAI-compatible synthesis from server environment/Codex config without committing secrets.

## Polymarket And Account Intelligence

When maintaining public market data:

- Fetch live curves for match result, handicap, and totals separately when markets exist.
- Treat BTTS / Both Teams To Score as a first-class market alongside match result, handicap, and totals: generate Yes/No probabilities, match Polymarket BTTS tokens when available, show curves, archive snapshots, and settle reviews from final scores.
- Treat `Team to Advance` as a first-class knockout market when Polymarket returns it, but never let advancement tokens satisfy 90-minute moneyline matching.
- Fetch each match's `-more-markets` event and expose derivative markets. Correct score/ball-score recommendations may be shown only by matching Polymarket `Correct Score` / `Exact Score` Yes prices to the same xG score grid, excluding `Any Other Score`, applying current-score gates, and treating live cards as path-trading plans with entry limit, scale-in trigger, take-profit, stop/no-chase, hedge rules, evidence, and warnings.
- Correct-score recommendations should include combo construction, not only single-score cards: show equal-return dutching, core-score plus cover, barbell/reserve, and in-play ladder/green-up styles when enough priced scorelines exist. Every combo must display budget share, coverage probability, price/cost, hit profit range, cash reserve, and path rules; make clear this reduces path concentration but does not remove loss risk.
- Live correct-score combos must not be shown at kickoff as if they were live edges. Pre-match combos may use the pre-match score grid, but in-play combo generation needs an evidence gate: hide live combos before roughly 18 minutes, hide or review-only after an early goal before roughly 30 minutes, require synced team stats beyond score-only data, and freeze during unresolved VAR/penalty events. When the gate blocks output, show the reason instead of an empty or fake recommendation.
- Every derived market recommendation must consume the already-adjusted model distribution, including goalkeeper/age, physical-matchup adjustment, tournament trend, knockout review, and context signals. Moneyline, handicap, totals, BTTS, Team to Advance, correct score, opportunity radar, and live remaining-goal models must not rebuild from raw seed lambdas unless the adjusted distribution is unavailable and the fallback is labelled.
- If Polymarket does not return a derivative category such as correct score/ball-score for a match, show a structured missing state for that category instead of leaving the UI blank or inventing prices.
- The next-three-day fixture window is a data collection and context sync scope. Do not render it as the primary home-page match list unless explicitly requested.
- The primary dashboard tabs should default to every match on the current Beijing/Shanghai matchday, not the entire ESPN/FIFA schedule window and not the date embedded in Polymarket market slugs. A late-night match whose Polymarket slug says the prior date should still be grouped by its kickoff date in Asia/Shanghai. Matches without live Polymarket curves may appear as schedule/awaiting-market, but must not generate fake price advice.
- Opportunity radar should use the same current Beijing/Shanghai matchday as the main tabs, then rank only real priced/curved market candidates within that focused set. Diversify surfaced candidates across BTTS, totals, handicap, and match result, and do not let high-edge longshot moneyline rows crowd out structured market opportunities with live curves.
- Opportunity radar should consume trend-adjusted probabilities and can add small ranking boosts for trend-supported markets such as BTTS-hot, underdog-scoring, or underdog-handicap signals. It must still obey price, data-quality, and curve gates.
- Opportunity radar scans should be archived as lightweight runs/items even when the visible dashboard is using light mode, so later review can compare surfaced candidates, observation candidates, prices, edge, and final outcomes.
- In-play recommendations must apply current-score gates before ranking: crossed/satisfied totals, BTTS, and correct-score paths are not new buy points; late deep handicaps and large-score comeback rows must be labeled `长尾不追` or blocked instead of `等待更好价格`.
- In-play probabilities for win/draw/loss, totals, BTTS, handicap, and correct score should share one remaining-goal distribution once a live score exists. Current-score exact score equals no-more-goals probability; after 70' in knockout matches, level-score favorite 90-minute wins are only late-goal paths and must be downgraded unless shots-on-target/dangerous pressure is clearly favorable.
- In round-of-16-or-later in-play correct-score logic, do not hard-block every late one-goal path just because regulation time is short. Estimate effective remaining time from stoppage indicators such as goals, injuries, substitutions, and late cards. If the pressure side has clear shots/SOT/corners and the defending side has high clearances/saves/injury substitutions, allow only an explicitly tiny "late knockout pressure" observation, never a loss-chasing recommendation.
- In-play advancement must be recomputed from the live regulation triplet plus the same extra-time/penalty tiebreak split, and must stay separate from 90-minute moneyline.
- In-play labels must distinguish real Polymarket prices from local/manual snapshots, separate sterile pressure from dangerous pressure, freeze during unresolved VAR/penalty events, and warn when a user's held positions are highly correlated on the same path.
- BTTS recommendations need a post-review discipline layer: downgrade BTTS Yes when low-score/clean-sheet paths dominate or underdog shot creation is unverified, but in knockout rounds do not over-downgrade it when current-tournament BTTS, underdog scoring, or team form supports both teams scoring.
- Match Polymarket team names with exact team aliases or word-boundary tokens. Do not treat short team codes such as `SCO`, `MAR`, or `CAN` as arbitrary substrings, because they can appear inside unrelated words like `score`, `market`, or `canceled`.
- Prioritize direct match sports slugs and sports-page payload markets ahead of broad tournament searches so long-term World Cup markets do not crowd out current fixture curves.
- For generalized soccer support, prioritize Polymarket `sports/soccer/games` and Gamma `soccer`/`games` event discovery. Classify events by tags, `seriesSlug`, slug, and title; show category filters in the UI; and do not let stale active=false/closed=false historical events appear if their event end date is outside the current window. The `games` pool can contain esports; reject Dota/BO3/LoL/CS2/Valorant style events before competition classification, and do not treat bare `EPL` as football unless the event is otherwise verified as soccer or Premier League.
- Competition labels must distinguish national-team and club fixtures. UEFA Champions League, Europa League, and Conference League are club competitions; July/August UEFA club fixtures should be labelled as qualifying rounds when no richer round metadata is available, for example `欧冠资格赛 · 俱乐部赛事`.
- Maintain explicit Polymarket team slug and alias overrides when market slugs or display names differ from schedule abbreviations, for example Cape Verde/Cabo Verde using `cvi` rather than `cpv`, and South Korea/Korea Republic using `kr` rather than `kor`.
- Keep chart controls usable for each market type and each outcome.
- Track elite World Cup accounts from public data by transparent criteria such as World Cup market realized PnL, win rate, sample size, and recent activity. General football/soccer history may be shown only as background context, not as the primary ranking for World Cup account monitoring.
- Keep the opportunity radar's elite-account monitor as a first-class view: refresh the World Cup Top 10 daily, show active positions against current World Cup match markets, and separate historical account performance from current model recommendations.
- Do not label large current holders as elite unless they pass explicit World Cup thresholds for audited sample size, positive realized PnL, and win rate. Below-threshold, negative-PnL, zero-win-rate, or thin-sample holders belong in a separate watchlist and must not count as elite signals or model boosts.
- Do not treat hedged, market-making, or arbitrage-style accounts as followable directional elite signals. If a wallet holds meaningful exposure on mutually exclusive outcomes in the same match market, classify it as watchlist-only and show the hedge/arbitrage reason.
- If the sports leaderboard produces no auditable World Cup samples, fall back to current World Cup market top holders as candidate accounts, then verify any settled World Cup positions before labeling them as World Cup Top 10. Current World Cup holders may still be monitored even when their settled World Cup sample is thin, but mark that distinction clearly.
- When public leaderboard fields do not expose World Cup win rate or PnL, fetch each candidate wallet's public closed-position history directly and compute settled World Cup sample count, W/L/P, realized PnL, and sample titles locally. Never display zero win rate, zero PnL, or zero sample as a conclusion when the account-history fetch failed; surface `fetch failed / partial / empty` status separately.
- Keep account-history requests rate-limited and cached. Prioritize current World Cup market holders before broad sports leaderboards, reuse the last successful wallet calculation during temporary 429/1015 limits, and label cached or stale account history visibly.
- Show account positions as expandable row details with account, side, amount, average or latest price, timestamp, market, and source status.
- Fetch and display top holders for relevant Polymarket condition/token pairs when public holder data is available. Mark whether holders match the World Cup Top 10 list.
- Store holder snapshots separately for recommendation-mapped markets and general World Cup market-pool tokens so later analysis can compare holder behavior to outcomes.
- If account or position data is unavailable, show unavailable status instead of fallback-looking fake rows.
- BettingExpert may be used as a public community-tipster source under each match. First parse the public World Cup leaderboard, then match those leaderboard users against each match page's public tips. If the leaderboard exposes fewer than 20 users or omits win-rate fields on some rows, show that source limit explicitly rather than filling ordinary match-page users into the Top 20.

## History And Backtesting

Important dashboard updates should be archived so later strategy analysis can compare:

- model probability at the time
- supplemental signal payload: rest days, current-tournament form, 20-year H2H impact, tipster consensus, and missing/watchlist dimensions
- public market prices and curves
- BTTS Yes/No model probability, price, edge, recommendation, and final settlement
- dynamic context state
- elite account positions
- top holder snapshots
- static world rankings, team recent form, and head-to-head context
- squad physical/line-profile context and AI human-read notes
- goalkeeper/age structure adjustment, including proxy inputs, xG/probability deltas, and visible reasoning when it affects the model
- physical-matchup adjustment, including height/duel mismatch inputs, xG/probability deltas, and whether a favorite was downgraded
- tournament-trend sample, signals, and per-match adjustment notes
- group qualification situation, knockout-path motivation notes, and any small xG adjustment applied from points-table pressure or top-spot path value
- knockout-round advancement probability, tiebreak split, Team to Advance market price/curve, and settlement status when the match has an advancement market
- knockout-stage experience proxy used in advancement tiebreaks, including best finish, finals appearances, finals matches, and adjustment note
- opportunity radar runs and candidate items, including strict candidates, observation candidates, price, edge, max informational entry price, confidence, expiry time, and AI/rule rationale
- final match result

Keep history storage bounded. By default, archive structured fields needed for review but do not persist full dashboard payload JSON, every chart price point, or the global Polymarket holder pool on each timer run. Enable `WORLDCUP_ARCHIVE_FULL_PAYLOADS=1`, `WORLDCUP_ARCHIVE_PRICE_POINTS=1`, or `WORLDCUP_ARCHIVE_GLOBAL_HOLDERS=1` only for short diagnostic captures, then compact or prune the SQLite database afterward.

When adding fields that affect model evaluation, update `scripts/history-store.js` and verify `npm run archive:dashboard`.

## Validation Commands

Use the subset relevant to the change:

```bash
npm start
npm run update:data && npm run sync:context
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
