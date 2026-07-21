# World Cup Prediction Research Report

Generated: 2026-07-21 16:00:54 +0800

## Executive Summary

I backfilled modelled World Cup match results from ESPN where available, keeping 90-minute results separate from advancement results for AET/PEN matches. The first reliable research layer is now:

- **52** archived schedule matches with prediction context.
- **52** modelled matches with joined results after backfill.
- **452** settled market rows at the selected pre-match snapshot.
- **98** synced/post live snapshots for in-play review.

The dataset is now good enough for a first descriptive and factor report, but not yet enough to make aggressive live-trading conclusions. Live data coverage is the bottleneck.

## Main Findings

1. **Result alignment was the biggest issue.** Late knockout results were not all recorded in `match_results`; ESPN can backfill them.
2. **AET/PEN must be split.** 90-minute markets and advancement markets settle differently. The new backfill payload preserves both.
3. **Market analysis is possible.** Moneyline, total, BTTS, handicap, and advance rows have model probability, price, edge, and settlement labels.
4. **Curve analysis still needs validation.** The `price_points` table is empty, so curve-level analysis currently uses archived market snapshots, not normalized tick-by-tick curves.
5. **Live strategy analysis is sample-limited.** Live snapshots exist, but only a small number are synced/post quality.

## Key Tables

### Market-Type Performance

| market | settled | hit rate | avg model | Brier | $1 flat ROI |
| --- | --- | --- | --- | --- | --- |
| advance | 44 | 50.0% | 50.0% | 0.17 | -0.14 |
| btts | 44 | 50.0% | 50.0% | 0.29 | -0.04 |
| handicap | 104 | 50.0% | 50.0% | 0.24 | 0.06 |
| moneyline | 156 | 33.3% | 33.3% | 0.18 | -0.12 |
| total | 104 | 50.0% | 50.0% | 0.26 | 0.71 |

### Sensitivity Snapshot

| edge >= | bets | hit rate | $1 flat ROI | avg price |
| --- | --- | --- | --- | --- |
| 0.0% | 131 | 26.0% | -0.21 | 0.28 |
| 3.0% | 105 | 26.7% | -0.19 | 0.28 |
| 5.0% | 85 | 25.9% | -0.16 | 0.27 |
| 8.0% | 62 | 21.0% | -0.29 | 0.25 |
| 10.0% | 45 | 17.8% | -0.38 | 0.25 |
| 15.0% | 26 | 15.4% | -0.28 | 0.22 |

## Recommended Next Research Steps

1. Rebuild normalized price history from archived `market_snapshots`, then test entry timing and closing-line value.
2. Build a wallet/holder factor table separately from match-level rows: current holder, elite-account classification, hedge/arbitrage filter, and final settlement.
3. Add post-16-team factor tests for physical mismatch, goalkeeper proxy, age/fatigue, and media-score consensus once those fields are consistently archived.
4. Only after those reports are stable should the prediction engine weights be changed.

Detailed reports:

- `worldcup-data-audit.md`
- `worldcup-descriptive-analysis.md`
- `worldcup-factor-analysis.md`
- `worldcup-background-factor-analysis-zh.md`
- `worldcup-live-factor-analysis-zh.md`
- `worldcup-sensitivity-analysis.md`
