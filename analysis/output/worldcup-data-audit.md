# World Cup Research Data Audit

Generated: 2026-07-21 15:43:37 +0800

## Coverage

- DB schedule matches with prediction context: **52**
- Selected pre-match snapshots: **52**
- DB result rows joined to modelled matches: **52 / 52**
- ESPN public final-score rows fetched: **102**
- Market rows at selected snapshots: **452**
- Settled market rows after result join: **452**
- Live snapshots: **341**
- Synced/post live snapshots: **98**
- Price-points table rows: **0**
- Top-holder snapshot rows: **2155433**

## Result Backfill

- ESPN candidates matching archived modelled matches: **52**
- Already present before this run: **52**
- Backfilled this run: **0**
- DB write enabled: **True**

## Remaining Gaps

_无数据_

## Interpretation

1. The research-grade sample is now the set of modelled schedule matches that have a verified 90-minute result.
2. ESPN provides final match facts, but AET/PEN matches need two labels: 90-minute result for moneyline/totals/BTTS, advancement result for Team to Advance.
3. The `price_points` table is empty, so curve-level analysis currently uses archived market snapshots, not normalized tick-by-tick curves.
4. Live analysis is useful but limited: only synced/post live snapshots should be used for in-play factor claims.


> **Data QA warning:** total/大小球 rows show unusually strong flat ROI. Because historical UI issues included very low captured Under prices, treat this as a market-token/price-mapping QA signal first, not as a deployable model edge. Use the `all_ex_total` sensitivity rows for broad strategy review until total prices are independently validated.
