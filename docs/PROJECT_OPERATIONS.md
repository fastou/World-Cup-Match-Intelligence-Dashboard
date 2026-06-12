# World Cup Match Intelligence Dashboard - 项目与部署说明

最后核验时间：2026-06-12 23:51 Asia/Shanghai  
当前线上地址：http://54.154.222.197/worldcup/

这份文档用于交接和运维。它只记录项目结构、部署方式、数据流和核心判断逻辑，不包含 API key、私钥、账户凭证或任何自动下单逻辑。

## 1. 项目定位

项目名称：

- 中文：世界杯 AI 分析平台
- 英文：World Cup Match Intelligence Dashboard

项目用途：

- 聚合世界杯赛程、球队静态信息、动态情报、天气、公开盘口、Polymarket 曲线和公开持仓数据。
- 生成胜平负、让球、大小球的模型概率、市场价格、edge 和观察信号。
- 归档每次 dashboard 快照，便于赛后复盘和策略校准。

合规边界：

- 这是研究、监控和数据可视化工具。
- 不自动下单，不托管用户资金，不保证收益。
- 动态数据缺失时必须降级显示，不伪造首发、伤停、盘口、持仓或结果。

## 2. 当前部署状态

服务器：

```text
Host: 54.154.222.197
User: ec2-user
App directory: /opt/worldcup-polymarket-dashboard
Public URL: http://54.154.222.197/worldcup/
Health URL: http://54.154.222.197/worldcup/api/health
Dashboard API: http://54.154.222.197/worldcup/api/dashboard
Force refresh API: http://54.154.222.197/worldcup/api/dashboard?force=1
```

Node 服务：

```text
systemd service: worldcup-dashboard
WorkingDirectory: /opt/worldcup-polymarket-dashboard
ExecStart: /usr/bin/node server.js
PORT: 4174
BASE_PATH: /worldcup
NODE_ENV: production
Current state: active / enabled
```

Nginx：

```text
/worldcup/ -> http://127.0.0.1:4174/worldcup/
```

定时任务：

```text
worldcup-context-sync.timer
  Purpose: 同步公开动态情报、天气、AI 综合上下文
  Frequency: every 15 minutes

worldcup-history-archive.timer
  Purpose: 归档 dashboard、概率、价格、持仓、上下文快照
  Frequency: every 15 minutes
```

运行时生成文件：

```text
data/worldcup-context.json
data/worldcup-history.sqlite
data/worldcup-history.sqlite-shm
data/worldcup-history.sqlite-wal
```

这些文件是运行数据，不提交 Git。

可选环境文件：

```text
/etc/worldcup-dashboard.env
```

这里可以放 OpenAI-compatible API 配置，但不要提交到仓库。

## 3. 代码结构

核心文件：

```text
server.js
  HTTP server、API 路由、赛程合并、Polymarket 抓取、模型计算、edge、持仓聚合、历史归档入口。

public/index.html
  单页 dashboard UI，支持中文/英文切换、比赛 tab、盘口曲线、比赛情报、高手持仓展开行。

data/worldcup-dashboard.json
  手工维护的种子赛事、球队和基础模型数据。

data/fifa-rankings.json
  FIFA 排名快照，用于静态强度输入。

data/research-framework.json
  研究框架结构化维度，用于页面逐项展示和评分。

scripts/sync-worldcup-context.js
  公共源同步脚本，生成 data/worldcup-context.json。

scripts/archive-dashboard.js
  把 dashboard 当前快照写入 SQLite。

scripts/record-match-result.js
  手工记录最终比分，供回测和校准。

scripts/history-store.js
  SQLite 表结构、迁移和写入逻辑。

deploy/
  systemd、nginx、安装脚本示例。

.agents/skills/world-cup-match-intelligence/SKILL.md
.claude/skills/world-cup-match-intelligence/SKILL.md
  Codex 和 Claude Code 可复用的足球比赛情报 skill。
```

不属于本项目的本地目录：

```text
polymarket-shadow-staging/
```

这是另一个未跟踪目录，不应随本项目提交或部署。

## 4. 数据流

Dashboard 每次刷新大致走这条链路：

1. 读取本地种子数据：

```text
data/worldcup-dashboard.json
data/fifa-rankings.json
data/research-framework.json
```

2. 拉取未来三天赛程：

```text
ESPN FIFA World Cup scoreboard
```

如果赛程里有本地未建模比赛，系统会生成保守的 auto-baseline fixture，让页面仍能展示基础概率，但必须标记为低置信或基线。

3. 合并动态上下文：

```text
data/worldcup-context.json
```

包括阵容、伤停、球队新闻、近期状态、战术对位、天气、AI 综合、四年交手信息。没有可靠源时写结构化缺失或低置信说明，不造数据。

4. 抓取 Polymarket：

```text
Gamma event endpoint
Gamma public-search endpoint
Polymarket sports page payload
CLOB batch price history endpoint
Polymarket Data API for holder / account data
```

5. 计算模型概率：

```text
胜 / 平 / 负
让球盘
大小球
比分分布
```

6. 合并市场价格和曲线：

```text
model probability != market price
edge = modelProbability - marketPrice
```

模型概率和盘口价格必须分开。盘口只用于 edge、价格纪律和市场变化，不直接变成 AI 概率。

7. 应用置信度和交易门槛：

```text
baseline
dynamic
lineup-confirmed
```

首发、伤停、盘口、Polymarket 曲线不完整时，不允许强信号。

8. 输出 API 和页面：

```text
GET /worldcup/api/dashboard
GET /worldcup/
```

9. 定时归档：

```text
data/worldcup-history.sqlite
```

用于赛后分析模型概率、盘口价格、edge、公开持仓和最终结果之间的关系。

## 5. 核心预测逻辑

模型输入分为三层：

### 5.1 静态输入

- 球队长期评分
- FIFA 世界排名
- 分组和赛程
- 场地信息
- 四年内历史交手，如果公开源可核验

### 5.2 动态输入

- 官方或可靠预计首发
- 伤停停赛
- 球队新闻
- 近期状态
- 战术对位
- 天气和场地
- AI 对公开信息的综合摘要

### 5.3 市场输入

- Polymarket 胜平负实时价格和历史曲线
- Polymarket 大小球和可匹配让球市场
- 本地基线参考盘口
- 公开持仓者和足球 Top100 账号持仓

市场输入不改变模型概率本身，只用于：

- edge
- 价格是否偏贵/偏便宜
- 曲线变化
- 公开持仓信号
- 是否允许给价格建议

## 6. 预测模式和降级规则

预测模式：

```text
baseline
  只使用长期实力、赛程、已有模型、低置信公开源。

dynamic
  加入阵容、伤停、天气、球队近况、新闻、AI 综合，但首发未完全确认。

lineup-confirmed
  官方首发确认后重新计算，是赛前最重要版本。
```

降级规则：

- 阵容或伤停未确认：不显示强买入/强加仓。
- Polymarket 曲线缺失：不显示价格建议，只显示观察或等待。
- auto-baseline fixture：只作为基线观察。
- 动态情报过期：显示过期/待确认，并降低置信。
- 重大变化出现时，需要重新评估：核心球员缺阵、门将变化、红牌、天气恶化、盘口剧烈变化。

## 7. Polymarket 抓取逻辑

Polymarket sports 页面有一个坑：关键词搜索不一定能抓到单场比赛。现在后端同时使用三种方式。

### 7.1 单场 sports slug

根据赛程生成候选 slug：

```text
fifwc-{homeCode}-{awayCode}-{date}
fifwc-{awayCode}-{homeCode}-{date}
```

日期会尝试 kickoff UTC 的前一天、当天、后一天，因为美国晚场比赛在页面 slug 里常用当地日期。

例子：

```text
fifwc-usa-par-2026-06-12
```

### 7.2 Gamma event endpoint

用于抓胜平负主市场：

```text
https://gamma-api.polymarket.com/events/slug/{slug}
```

USA vs Paraguay 已验证可返回：

```text
Will United States win on 2026-06-12?
Will United States vs. Paraguay end in a draw?
Will Paraguay win on 2026-06-12?
```

### 7.3 Sports page payload

用于补充 Gamma event 不直接返回的市场，例如：

```text
United States vs. Paraguay: O/U 2.5
Spread: United States (-1.5)
Spread: Paraguay (-1.5)
```

只抽取页面里已经存在的结构化 market object，且必须包含：

```text
question
conditionId
slug
outcomes
outcomePrices
clobTokenIds
```

不从页面文案里猜价格。

### 7.4 历史曲线

使用 CLOB batch history：

```text
https://clob.polymarket.com/batch-prices-history
```

当前配置：

```text
History window: 24 hours
Fidelity: 15 minutes
Batch size: 20 token IDs
Token limit: 80
```

## 8. USA vs Paraguay 最新核验样例

线上已验证：

```text
Match: 美国 vs 巴拉圭
Polymarket curve status: synced
History points: 97 per matched token
```

当前可匹配实时盘：

```text
美国胜: Polymarket 0.465
平局: Polymarket 0.295
巴拉圭胜: Polymarket 0.235
小于 2.5 球: Polymarket 0.615-0.625 附近，随实时刷新变化
大于 2.5 球: Polymarket 0.375-0.385 附近，随实时刷新变化
```

注意：

- Polymarket 页面上的让球盘口可能是 `-1.5`，而本地自动基线可能生成 `-0.5`。
- 如果盘口线不同，系统不会硬匹配成同一个盘；页面会保留本地参考价并说明无实时曲线。

## 9. 高手和持仓逻辑

账号逻辑来自公开 Polymarket Data API：

- 从 sports leaderboard 找候选账号。
- 抓取已结算 football/soccer 样本。
- 计算足球样本 PnL、胜率、样本量。
- 取 football Top100。
- 对当前 match 的 condition/token 抓公开持仓。
- 如果持仓账号命中 football Top100，则显示在盘口行展开详情里。

持仓数据必须包含公开来源字段。没有数据时显示不可用，不造假。

## 10. 历史归档和回测

归档服务：

```text
worldcup-history-archive.timer
```

数据库：

```text
/opt/worldcup-polymarket-dashboard/data/worldcup-history.sqlite
```

重要表：

```text
dashboard_runs
match_snapshots
market_snapshots
price_points
elite_trader_rankings
elite_position_snapshots
context_runs
context_match_snapshots
match_results
```

常用视图：

```text
v_moneyline_backtest
```

记录最终比分：

```bash
cd /opt/worldcup-polymarket-dashboard
npm run record:result -- --match MATCH_ID --home-goals 2 --away-goals 1 --source manual
```

## 11. 常用运维命令

登录服务器：

```bash
ssh -i <key.pem> ec2-user@54.154.222.197
```

查看服务：

```bash
systemctl status worldcup-dashboard --no-pager
systemctl is-active worldcup-dashboard
journalctl -u worldcup-dashboard -n 100 --no-pager
```

重启服务：

```bash
sudo systemctl restart worldcup-dashboard
```

健康检查：

```bash
curl http://127.0.0.1:4174/worldcup/api/health
curl http://54.154.222.197/worldcup/api/health
```

强制刷新 dashboard：

```bash
curl 'http://127.0.0.1:4174/worldcup/api/dashboard?force=1'
```

查看定时器：

```bash
systemctl list-timers --all --no-pager | grep worldcup
```

手工同步动态情报：

```bash
cd /opt/worldcup-polymarket-dashboard
npm run sync:context
```

手工归档快照：

```bash
cd /opt/worldcup-polymarket-dashboard
npm run archive:dashboard
```

## 12. 部署流程

本地验证：

```bash
node --check server.js
BASE_PATH=/worldcup PORT=4174 WORLDCUP_DISABLE_HISTORY=1 node server.js
```

部署到服务器：

```bash
rsync -az --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude data/worldcup-context.json \
  --exclude 'data/worldcup-history.sqlite*' \
  --exclude marketing \
  --exclude polymarket-shadow-staging \
  -e 'ssh -i <key.pem> -o StrictHostKeyChecking=no' \
  ./ ec2-user@54.154.222.197:/opt/worldcup-polymarket-dashboard/

ssh -i <key.pem> ec2-user@54.154.222.197 \
  'sudo systemctl restart worldcup-dashboard && systemctl is-active worldcup-dashboard'
```

部署后验证：

```bash
curl http://54.154.222.197/worldcup/api/health
curl 'http://54.154.222.197/worldcup/api/dashboard?force=1'
```

## 13. 回滚方式

服务器部署目录不保留 `.git`。回滚建议从本地操作：

```bash
git checkout <known-good-commit>
node --check server.js
rsync ... ./ ec2-user@54.154.222.197:/opt/worldcup-polymarket-dashboard/
ssh -i <key.pem> ec2-user@54.154.222.197 'sudo systemctl restart worldcup-dashboard'
```

当前已知可用提交：

```text
73bec81 Fetch Polymarket sports match markets
bbd8741 Clarify baseline prices and handicaps
5edfa1d Fix market curve rendering
e28485b Add fallback intelligence sync for match data
ec3e424 Fill rankings and merge auto baseline context
```

## 14. 已知限制

- 公开源不会总能给出官方首发、可靠伤停或详细战术信息。
- 未确认首发前，页面可以显示模型概率，但不能显示强信号。
- Polymarket sports 页面和 Gamma API 的市场覆盖不完全一致，所以后端同时抓 event endpoint 和 sports page payload。
- 让球盘口必须严格按盘口线匹配；`-0.5` 和 `-1.5` 不是同一个盘。
- `dashboard?force=1` 会拉多个外部源，可能超过 30 秒；慢不等于无数据。
- API key、私钥、本地 Codex 配置、OpenAI auth 文件不得写入仓库。

## 15. 快速判断原则

当用户问“谁会赢”时：

1. 先看模型概率，不要先看盘口。
2. 再看 Polymarket 当前价格。
3. 再看 edge。
4. 最后看数据完整度、首发、伤停、高手持仓和盘口曲线。

回答要区分：

```text
谁更可能赢
哪个价格更有空间
当前能不能给强建议
还缺什么数据
```

例如：

```text
美国更可能赢，但美国胜当前价格偏贵；巴拉圭胜可能有一点价格空间，但阵容未确认，只能观察。
```
