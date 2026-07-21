# World Cup Descriptive Analysis

Generated: 2026-07-21 15:43:37 +0800

## Tournament Result Distribution

| Sample | Matches | Home win | Draw | Away win | Over 2.5 | Under 2.5 | BTTS | Avg goals | AET/PEN |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ESPN completed events | 102 | 47.1% | 23.5% | 29.4% | 55.9% | 44.1% | 54.9% | 2.97 | 9 |
| Modelled archive sample | 52 | 48.1% | 23.1% | 28.8% | 51.9% | 48.1% | 57.7% | 3.04 | 6 |

## Market-Type Performance

| market | settled | hit rate | avg model | Brier | Log loss | $1 flat ROI |
| --- | --- | --- | --- | --- | --- | --- |
| advance | 44 | 50.0% | 50.0% | 0.17 | 0.51 | -0.14 |
| btts | 44 | 50.0% | 50.0% | 0.29 | 0.77 | -0.04 |
| handicap | 104 | 50.0% | 50.0% | 0.24 | 0.67 | 0.06 |
| moneyline | 156 | 33.3% | 33.3% | 0.18 | 0.55 | -0.12 |
| total | 104 | 50.0% | 50.0% | 0.26 | 0.71 | 0.71 |

## Stage Performance

| stage | settled rows | hit rate | avg model | Brier | $1 flat ROI |
| --- | --- | --- | --- | --- | --- |
| final_window | 22 | 45.5% | 45.5% | 0.26 | 0.34 |
| knockout_early | 154 | 45.5% | 45.5% | 0.21 | 0.31 |
| modelled_group_window | 210 | 42.9% | 42.9% | 0.23 | -0.01 |
| quarterfinal_window | 44 | 45.5% | 45.5% | 0.21 | -0.18 |
| semifinal_window | 22 | 45.5% | 45.5% | 0.24 | 0.37 |

## Calibration Buckets

| model bucket | n | avg model | actual hit | avg edge |
| --- | --- | --- | --- | --- |
| 0-10% | 6 | 7.6% | 16.7% | -0.00 |
| 10-20% | 16 | 16.6% | 12.5% | 0.00 |
| 20-30% | 73 | 26.9% | 17.8% | 0.04 |
| 30-40% | 106 | 35.9% | 43.4% | -0.06 |
| 40-50% | 86 | 45.4% | 43.0% | -0.07 |
| 50-60% | 75 | 54.2% | 61.3% | 0.06 |
| 60-70% | 73 | 63.3% | 56.2% | 0.10 |
| 70-80% | 10 | 74.2% | 90.0% | 0.05 |
| 80-90% | 6 | 83.8% | 66.7% | 0.02 |
| 90-100% | 1 | 92.2% | 1 | -0.01 |

## First Read

- Use Brier/log-loss for probability quality, not just hit rate. A row can have low hit rate if it is a longshot, but still be well-calibrated.
- The strongest descriptive warning is whether high model probabilities actually hit at the expected rate. If high-probability favorites underperform in the knockout sample, ranking/favorite priors should be reduced there.
- The modelled sample is still modest. Treat large ROI values on thin low-price rows as unstable until reviewed by market type and match context.


> **Data QA warning:** total/大小球 rows show unusually strong flat ROI. Because historical UI issues included very low captured Under prices, treat this as a market-token/price-mapping QA signal first, not as a deployable model edge. Use the `all_ex_total` sensitivity rows for broad strategy review until total prices are independently validated.
