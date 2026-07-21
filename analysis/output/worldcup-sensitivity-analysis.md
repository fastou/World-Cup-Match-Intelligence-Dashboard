# World Cup Sensitivity Analysis

Generated: 2026-07-21 16:00:54 +0800

## Edge Threshold Simulation

Flat $1 per historical candidate, Polymarket rows only. This is a research backtest, not a trading instruction.

| market | edge >= | bets | hit rate | $1 flat ROI | avg price |
| --- | --- | --- | --- | --- | --- |
| all | 0.0% | 174 | 32.2% | 0.33 | 0.28 |
| all | 3.0% | 144 | 31.9% | 0.42 | 0.28 |
| all | 5.0% | 121 | 31.4% | 0.55 | 0.26 |
| all | 8.0% | 96 | 29.2% | 0.66 | 0.25 |
| all | 10.0% | 76 | 27.6% | 0.83 | 0.23 |
| all | 15.0% | 53 | 28.3% | 1.38 | 0.19 |
| all_ex_total | 0.0% | 131 | 26.0% | -0.21 | 0.28 |
| all_ex_total | 3.0% | 105 | 26.7% | -0.19 | 0.28 |
| all_ex_total | 5.0% | 85 | 25.9% | -0.16 | 0.27 |
| all_ex_total | 8.0% | 62 | 21.0% | -0.29 | 0.25 |
| all_ex_total | 10.0% | 45 | 17.8% | -0.38 | 0.25 |
| all_ex_total | 15.0% | 26 | 15.4% | -0.28 | 0.22 |
| moneyline | 0.0% | 82 | 20.7% | -0.21 | 0.21 |
| moneyline | 3.0% | 63 | 19.0% | -0.24 | 0.20 |
| moneyline | 5.0% | 51 | 21.6% | -0.13 | 0.20 |
| moneyline | 8.0% | 36 | 13.9% | -0.37 | 0.17 |
| moneyline | 10.0% | 25 | 12.0% | -0.30 | 0.15 |
| moneyline | 15.0% | 15 | 13.3% | -0.04 | 0.14 |
| advance | 0.0% | 22 | 36.4% | -0.26 | 0.38 |
| advance | 3.0% | 18 | 38.9% | -0.17 | 0.38 |
| advance | 5.0% | 14 | 28.6% | -0.33 | 0.36 |
| advance | 8.0% | 11 | 36.4% | -0.14 | 0.37 |
| advance | 10.0% | 8 | 37.5% | -0.23 | 0.42 |
| advance | 15.0% | 2 | 50.0% | 0.27 | 0.34 |
| total | 0.0% | 43 | 51.2% | 2.00 | 0.29 |
| total | 3.0% | 39 | 46.2% | 2.09 | 0.27 |
| total | 5.0% | 36 | 44.4% | 2.25 | 0.25 |
| total | 8.0% | 34 | 44.1% | 2.38 | 0.23 |
| total | 10.0% | 31 | 41.9% | 2.59 | 0.20 |
| total | 15.0% | 27 | 40.7% | 2.98 | 0.16 |
| btts | 0.0% | 22 | 31.8% | -0.36 | 0.46 |
| btts | 3.0% | 20 | 35.0% | -0.29 | 0.45 |
| btts | 5.0% | 16 | 31.2% | -0.37 | 0.44 |
| btts | 8.0% | 11 | 18.2% | -0.62 | 0.41 |
| btts | 10.0% | 10 | 20.0% | -0.59 | 0.40 |
| btts | 15.0% | 7 | 14.3% | -0.76 | 0.35 |
| handicap | 0.0% | 5 | 40.0% | 0.50 | 0.28 |
| handicap | 3.0% | 4 | 50.0% | 0.87 | 0.23 |
| handicap | 5.0% | 4 | 50.0% | 0.87 | 0.23 |
| handicap | 8.0% | 4 | 50.0% | 0.87 | 0.23 |
| handicap | 10.0% | 2 | 0 | -1.00 | 0.19 |
| handicap | 15.0% | 2 | 0 | -1.00 | 0.19 |

## Broad Simulation Excluding Totals

This removes total/大小球 rows until their historical price direction is validated.

| edge >= | bets | hit rate | $1 flat ROI | avg price |
| --- | --- | --- | --- | --- |
| 0.0% | 131 | 26.0% | -0.21 | 0.28 |
| 3.0% | 105 | 26.7% | -0.19 | 0.28 |
| 5.0% | 85 | 25.9% | -0.16 | 0.27 |
| 8.0% | 62 | 21.0% | -0.29 | 0.25 |
| 10.0% | 45 | 17.8% | -0.38 | 0.25 |
| 15.0% | 26 | 15.4% | -0.28 | 0.22 |

## Knockout Favorite Haircut Sensitivity

This applies a simple haircut to knockout moneyline favorites before selecting positive-edge rows. It tests whether the model was too generous to favorites.

| favorite haircut | edge >= | bets | hit rate | $1 flat ROI |
| --- | --- | --- | --- | --- |
| 0.0% | 3.0% | 144 | 31.9% | 0.42 |
| 0.0% | 5.0% | 121 | 31.4% | 0.55 |
| 0.0% | 8.0% | 96 | 29.2% | 0.66 |
| 2.0% | 3.0% | 144 | 31.9% | 0.42 |
| 2.0% | 5.0% | 120 | 30.8% | 0.55 |
| 2.0% | 8.0% | 95 | 28.4% | 0.65 |
| 5.0% | 3.0% | 142 | 31.0% | 0.42 |
| 5.0% | 5.0% | 118 | 29.7% | 0.55 |
| 5.0% | 8.0% | 95 | 28.4% | 0.65 |
| 8.0% | 3.0% | 141 | 30.5% | 0.41 |
| 8.0% | 5.0% | 118 | 29.7% | 0.55 |
| 8.0% | 8.0% | 95 | 28.4% | 0.65 |

## Interpretation

- If ROI improves after favorite haircuts, the next model change should reduce favorite/ranking priors in knockout games.
- If ROI only appears at extremely low prices, inspect whether prices were real Polymarket rows or mapping artifacts before trusting the signal.
- If a threshold has very few bets, use it as a case-study filter, not as a deployable rule.


> **Data QA warning:** total/大小球 rows show unusually strong flat ROI. Because historical UI issues included very low captured Under prices, treat this as a market-token/price-mapping QA signal first, not as a deployable model edge. Use the `all_ex_total` sensitivity rows for broad strategy review until total prices are independently validated.
