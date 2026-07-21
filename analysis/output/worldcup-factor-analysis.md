# World Cup Factor Analysis

Generated: 2026-07-21 15:43:37 +0800

## Simple Factor Signals

| factor | scope | n | low hit | high hit | lift | corr |
| --- | --- | --- | --- | --- | --- | --- |
| edge | all | 452 | 49.1% | 39.4% | -0.10 | -0.17 |
| market_price | all | 452 | 28.5% | 60.3% | 0.32 | 0.37 |
| model_probability | all | 452 | 32.7% | 55.8% | 0.23 | 0.32 |
| completeness_score | all | 452 | 44.6% | 42.9% | -0.02 | 0.01 |
| edge | moneyline | 156 | 44.9% | 21.8% | -0.23 | -0.35 |
| edge | total | 104 | 50.0% | 50.0% | 0.00 | -0.11 |
| edge | btts | 44 | 68.2% | 31.8% | -0.36 | -0.45 |
| edge | advance | 44 | 63.6% | 36.4% | -0.27 | -0.13 |

## Live-State Summary

| minute | snapshots | matches | any later goal | avg later goals | draw stays draw | leader held |
| --- | --- | --- | --- | --- | --- | --- |
| 0-29 | 254 | 68 | 91.7% | 2.96 | 16.3% | 77.8% |
| 30-59 | 37 | 16 | 81.1% | 1.49 | 41.7% | 88.0% |
| 60-74 | 14 | 8 | 78.6% | 1.50 | 25.0% | 90.0% |
| 75+ | 17 | 11 | 58.8% | 0.82 | 33.3% | 60.0% |

## Interpretation

- `edge` should not be treated as automatically profitable; it must be tested against settlement and price.
- `market_price` is a strong prior, but using it too heavily risks turning the model into the market. The useful test is whether model-market disagreement has positive realized value.
- In-play factors need stricter evidence gates. The live sample is much smaller than the pre-match archive, so it can suggest hypotheses, not final rules.
- Holder/elite-account effects should be analyzed as a separate wallet dataset next, because top-holder snapshots are large and can distort match-level analysis if joined naively.
