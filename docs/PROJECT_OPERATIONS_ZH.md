# 世界杯 AI 分析平台：项目说明与后续查看手册

最后更新：2026-07-04 Asia/Shanghai  
生产服务器：`38.180.28.12`  
线上地址：[http://38.180.28.12/worldcup/](http://38.180.28.12/worldcup/)

这份文档是给自己后续查看和运维用的。它说明这个项目做了什么、数据从哪里来、模型怎么判断、页面怎么看、部署在哪里、出问题怎么查。本文不记录服务器密码、API key、私钥，也不包含自动下单逻辑。

## 1. 项目定位

中文名：`世界杯 AI分析平台`  
英文名：`World Cup Match Intelligence Dashboard`

这个项目是一个世界杯比赛情报与公开市场监控平台。它把赛程、球队资料、动态情报、天气、公开盘口、Polymarket 实时盘、正确比分/球胆、公开持仓、高手账号、机会雷达和赛后复盘放在一个页面里。

边界要记住：

- 这是研究、监控、复盘工具。
- 不自动下单，不托管资金，不保证盈利。
- 缺失的数据必须明确显示缺失、待核验或低置信，不能编造首发、伤停、盘口、比分或账号收益。
- 模型概率和市场价格必须分开。盘口可以用于 edge 和价格纪律，但不能直接变成 AI 概率。

## 2. 当前线上入口

主要入口：

```text
WorldCup Dashboard: http://38.180.28.12/worldcup/
Health API:         http://38.180.28.12/worldcup/api/health
Dashboard API:      http://38.180.28.12/worldcup/api/dashboard
强制刷新:           http://38.180.28.12/worldcup/api/dashboard?force=1
```

同一服务器还有其他项目入口：

```text
Polymarket Shadow:  http://38.180.28.12/
Polymarket Profile: http://38.180.28.12/polymarket-profile/?v=pool5-events-1
Research Control:   http://38.180.28.12/research-control/
Mangowm API:        https://38.180.28.12/docs
```

旧服务器 `54.154.222.197` 只作为备份参考，不再作为生产环境。没有明确要求时，不要再操作旧服务器。

## 3. 服务器部署形态

生产目录：

```text
/opt/worldcup-polymarket-dashboard
```

Node 服务：

```text
systemd service: worldcup-dashboard.service
PORT: 4174
BASE_PATH: /worldcup
Local URL: http://127.0.0.1:4174/worldcup/
Public URL: http://38.180.28.12/worldcup/
```

定时任务：

```text
worldcup-context-sync.timer
  每 15 分钟左右同步公开动态情报、天气、球队上下文、可选 AI 综合。

worldcup-history-archive.timer
  每 15 分钟左右归档 dashboard 快照、模型概率、盘口价格、持仓和机会雷达。
```

常用线上检查：

```bash
systemctl is-active worldcup-dashboard.service
systemctl is-active worldcup-context-sync.timer
systemctl is-active worldcup-history-archive.timer
curl http://127.0.0.1:4174/worldcup/api/health
```

## 4. 代码结构

核心文件：

```text
server.js
  主服务。负责 API 路由、赛程合并、Polymarket 抓取、模型计算、机会雷达、实时买点、高手账号、历史归档入口。

public/index.html
  单页前端。负责比赛 tab、语言切换、综合预测、实时买点、球胆路径、盘口曲线、静态/动态/高手/榜单/复盘展示。

data/worldcup-dashboard.json
  本地种子数据和部分手工基线。运行时可能会被脚本更新，一般不要随便提交运行中产生的变化。

data/fifa-rankings.json
  FIFA 排名快照，用于静态球队强度。

data/research-framework.json
  研究框架结构化维度。

data/head-to-head-overrides.json
  已核验的历史交手数据覆盖。

data/worldcup-context.json
  运行时生成的动态上下文，Git 忽略。

scripts/sync-worldcup-context.js
  同步公开上下文：阵容、伤停、天气、新闻、近期状态、战术、AI 综合等。

scripts/sync-squad-profiles.js
  同步球队阵容身高、年龄、位置结构等静态画像。

scripts/archive-dashboard.js
  把当前 dashboard 快照写入 SQLite。

scripts/history-store.js
  SQLite 表结构、迁移和写入逻辑。

scripts/record-match-result.js
  记录最终比分，用于回测和复盘。

deploy/
  systemd、nginx、安装示例。

.agents/skills/world-cup-match-intelligence/SKILL.md
.claude/skills/world-cup-match-intelligence/SKILL.md
  Codex 和 Claude Code 的项目技能说明。
```

运行数据不要提交：

```text
data/worldcup-context.json
data/worldcup-history.sqlite
data/worldcup-history.sqlite-shm
data/worldcup-history.sqlite-wal
*.env
本地凭证、API key、auth 文件
```

## 5. 页面主要板块

每场比赛用 tab 切换，不垂直堆很多场。当前页面的核心顺序是：

```text
实时买点
建议
静态
比赛情报
高手
榜单
动态
盘口
```

重点板块：

- `实时买点`：开赛后根据比分、分钟、射门、射正、角球、控球、当前盘口重新判断。
- `实时球胆观察 / 过程交易`：正确比分/球胆的过程交易管理。
- `建议`：赛前和赛中综合建议，显示模型概率、参考价、edge、限制原因。
- `静态`：世界排名、世界杯历史、近况、20 年内交手、阵容身高/年龄/位置结构等。
- `比赛情报`：阵容、伤停、球队新闻、天气、战术对位、AI 综合。
- `高手`：Polymarket 世界杯公开账号监控、持仓、样本、PnL、胜率。
- `榜单`：BettingExpert 等公开 tipster 来源，只有抓到公开判断才显示。
- `盘口`：Polymarket 实时盘、曲线、更多盘口，完整盘口默认折叠。

## 6. 数据流

一次 dashboard 刷新大致走这条链：

```text
本地种子数据
  -> ESPN/FIFA 赛程和状态
  -> data/worldcup-context.json 动态上下文
  -> Polymarket 事件、sports 页面、CLOB 曲线、holder/account 数据
  -> 统一模型计算
  -> edge/价格纪律/数据质量门槛
  -> 前端页面
  -> SQLite 历史归档
```

主要公开源：

```text
ESPN/FIFA: 赛程、比分、现场 summary、技术统计、场地
Open-Meteo: 天气
FIFA ranking snapshot: 世界排名
公开新闻/预览源: 阵容、伤停、球队新闻、战术
Polymarket Gamma / sports page / CLOB: 盘口、价格、曲线、正确比分、持仓
BettingExpert: 公开 tipster 判断
```

如果公开源没有给出可靠数据，页面必须显示：

```text
缺失
待核验
公开源不可用
低置信基线
```

不能为了页面好看而填假数据。

## 7. 模型核心逻辑

模型不是简单看盘口。核心分三层：

### 7.1 静态层

- 长期球队强度
- FIFA 世界排名
- 当前世界杯表现
- 世界杯历史战绩
- 近 20 年历史交手
- 近期比赛状态
- 阵容身高、年龄、位置结构
- 休息时间、赛程压力

### 7.2 动态层

- 首发/预计首发
- 伤停停赛
- 球队新闻
- 天气和场地
- 战术对位
- 当前小组/淘汰赛形势
- 是否必须争胜、是否需要大比分、是否可能保守控节奏

### 7.3 市场层

- Polymarket 胜平负
- 让球
- 大小球
- 双方进球 BTTS
- Team to Advance 晋级盘
- Correct Score / Exact Score 球胆
- Top holders 和世界赛账号持仓

市场层用于：

```text
edge = modelProbability - marketPrice
价格是否偏贵
价格是否低于建议上限
市场曲线是否剧烈变化
公开持仓是否值得观察
```

市场层不能直接覆盖模型概率。

## 8. xG 和比分分布

综合预测用的是统一比分分布逻辑：

```text
lambdaHome / lambdaAway
  -> Poisson score grid
  -> 胜平负
  -> 大小球
  -> BTTS
  -> 正确比分概率
  -> 让球概率
```

重要原则：

- 不能出现“主比分明显小球，但大球概率很高”这种割裂。
- BTTS、大小球、比分推荐必须来自同一个比分分布。
- 盘口只做轻校准，不能把市场价当模型。

## 9. 小组赛和淘汰赛差异

小组赛末轮会额外看：

- 当前积分
- 排名
- 净胜球
- 是否必须赢
- 平局是否有价值
- 是否需要大比分
- 小组第一/第二对淘汰赛路径的影响
- 是否可能轮换或控节奏

淘汰赛会额外看：

- 90 分钟胜平负和 `Team to Advance` 必须分开
- 90 分钟平局/加时/点球路径要提高权重
- 强队控制比赛不等于 90 分钟一定赢
- 晋级概率 = 90 分钟赢 + 平局后的加时/点球拆分
- 淘汰赛经验、世界杯历史、门将/点球证据只能在有结构化数据时低权重使用

## 10. 实时买点逻辑

开赛后，页面会拉 ESPN summary：

```text
比分
分钟
射门
射正
角球
控球
红黄牌
门将扑救
```

再结合 Polymarket 当前价重新算：

```text
实时胜平负
实时让球
实时大小球
实时 BTTS
实时晋级
实时正确比分路径
```

关键 gate：

- 已穿线的盘口不追。例如 3 球后不能再买大 2.5 当新买点。
- 已不可能的盘口直接标记不可能。
- 大比分落后方胜/平的极低概率长尾不当买点。
- 80 分钟附近还要净胜 2 球以上的深让球要降级。
- 盘口不是 Polymarket 实时价时，不给买入式建议。

## 11. 球胆 / 正确比分过程交易

这是最近新增的重点功能。

以前页面只会说哪个比分有 edge。现在改成“路径交易管理”：

```text
当前比分 -> 目标比分
还差几球
剩余多少分钟
剩余进球 xG
5 分钟无进球概率
10 分钟无进球概率
下一球会增强还是杀死该比分
如果已持有，卖多少、留多少
如果未持有，是否还能新买/补仓
相邻比分轮动
止盈、止损、对冲、禁止条件
```

例子：当前 `2-0`，你持有 `2-0 / 2-1 / 3-0 / 3-1`。

页面会区分：

- `2-0`：当前目标已到，持有的是“后面不再进球”的时间衰减价值。不是新买点，核心是卖多少、留多少。
- `2-1`：需要客队下一球，主队下一球会杀死。
- `3-0`：需要主队下一球，客队下一球会杀死。
- `3-1`：双方都还要进球，路径更长。

页面会给出：

```text
卖出比例
保留比例
补仓上限
相邻比分公允价
当前价
edge
下一球冲击
```

大比分领先后，模型还会加入“领先方节奏管理”：

- 55 分钟后领先 2 球以上，默认降低领先方继续进球强度。
- 如果射门/射正仍然强压制，则只轻微降权。
- 如果落后一方 0 射正，追回路径降权。
- 门将扑救很多时，射门转化率降权。

赛前不会显示实时球胆过程交易卡，避免把空比分误当 `0-0`。

## 12. 机会雷达

机会雷达用于按当前比赛日扫描可观察机会。

它会看：

- 模型概率
- 当前市场价格
- edge
- 最大建议买入价
- 数据质量
- Polymarket 是否有真实曲线
- BTTS / 大小球 / 让球 / 胜平负 / 球胆的分散性
- 复盘纪律
- 机会过期时间

点击提醒卡片时，应该重新刷新当前价格再判断是否还能买。过时机会会自动降级或消失。

机会雷达还有复盘 tab，用来记录：

```text
当时预测
当时价格
最终结果
为什么猜错
下一版如何调整
```

## 13. 高手账号和公开持仓

项目做了两类账号数据：

### 13.1 世界杯账号监控

优先找当前世界杯市场里的公开账号，再用公开 closed positions 计算：

```text
世界杯样本数
胜 / 负 / Push
胜率
Realized PnL
当前持仓
当前价值
账户页面链接
```

只有满足样本、PnL、胜率等阈值的，才算可观察的 World Cup Top 账号。

### 13.2 当前盘口持仓

每个盘口会显示：

```text
Top holders
持仓份额
方向
是否命中世界赛账号
买入价格/时间，如果公开数据能拿到
```

重要限制：

- 同一个账号如果同时买互斥方向，可能是套利/做市/对冲，不能当方向性高手跟单。
- 当前大户不等于高手。
- 数据抓取失败不能显示 0 胜率或 0 PnL 当结论，必须显示 fetch failed / partial / cached。

## 14. BettingExpert 和外部 tipster

页面会尝试抓 BettingExpert 等公开 tipster 判断。

逻辑：

```text
先找公开排行榜或高表现用户
再匹配当前比赛页面的公开 tips
只显示真实抓到的判断
不把普通用户强行填成 Top20
```

例子：

```text
Japan -1.00 (AH)
```

意思是亚洲让球，日本让 1 球。日本赢 2 球以上全赢，赢 1 球走水，平/输则输。

## 15. 历史库和复盘

数据库：

```text
/opt/worldcup-polymarket-dashboard/data/worldcup-history.sqlite
```

重要表：

```text
dashboard_runs
match_snapshots
market_snapshots
inplay_recommendation_snapshots
opportunity_radar_runs
opportunity_radar_items
elite_trader_rankings
elite_position_snapshots
top_holder_snapshots
context_runs
context_match_snapshots
match_results
```

现在实时球胆路径也会写入 `inplay_recommendation_snapshots`，方便以后复盘：

```text
当时比分
目标比分
模型概率
当前价
edge
卖出/保留/补仓建议
相邻比分轮动
最终结果
```

历史库默认不再保存完整巨型 payload、所有曲线点和全局 holder 池，避免数据库无限膨胀。需要短期诊断时才打开：

```bash
WORLDCUP_ARCHIVE_FULL_PAYLOADS=1
WORLDCUP_ARCHIVE_PRICE_POINTS=1
WORLDCUP_ARCHIVE_GLOBAL_HOLDERS=1
```

用完要关闭并压缩/清理。

## 16. 常用命令

本地运行：

```bash
cd /Users/apple/Project/polymarket
npm start
```

本地按 `/worldcup` 路径运行：

```bash
BASE_PATH=/worldcup PORT=4174 npm start
```

本地验证：

```bash
node -c server.js
node -c scripts/history-store.js
npm run validate:skills
```

服务器检查：

```bash
ssh root@38.180.28.12
cd /opt/worldcup-polymarket-dashboard
systemctl status worldcup-dashboard.service --no-pager
journalctl -u worldcup-dashboard.service -n 100 --no-pager
curl http://127.0.0.1:4174/worldcup/api/health
```

强制刷新：

```bash
curl 'http://127.0.0.1:4174/worldcup/api/dashboard?force=1'
```

同步上下文：

```bash
cd /opt/worldcup-polymarket-dashboard
npm run sync:context
```

归档快照：

```bash
cd /opt/worldcup-polymarket-dashboard
npm run archive:dashboard
```

记录赛果：

```bash
cd /opt/worldcup-polymarket-dashboard
npm run record:result -- --match MATCH_ID --home-goals 2 --away-goals 1 --source manual
```

查看定时器：

```bash
systemctl list-timers --all --no-pager | grep worldcup
```

## 17. 部署流程

当前做法通常是本地改完后上传改动文件到服务器：

```bash
scp server.js root@38.180.28.12:/opt/worldcup-polymarket-dashboard/server.js
scp public/index.html root@38.180.28.12:/opt/worldcup-polymarket-dashboard/public/index.html
scp scripts/history-store.js root@38.180.28.12:/opt/worldcup-polymarket-dashboard/scripts/history-store.js
```

然后在服务器：

```bash
cd /opt/worldcup-polymarket-dashboard
node -c server.js
systemctl restart worldcup-dashboard.service
systemctl is-active worldcup-dashboard.service
curl http://127.0.0.1:4174/worldcup/api/health
```

如果涉及归档逻辑，也检查：

```bash
node -c scripts/history-store.js
systemctl is-active worldcup-history-archive.timer
```

改完后，本地要提交并推送：

```bash
git status --short --branch
git add <changed-code-files>
git commit -m "<message>"
git push origin main
```

不要提交运行数据和密钥。

## 18. 排查常见问题

### 页面没有实时曲线

可能原因：

- Polymarket 当前比赛 slug 未匹配。
- 当前比赛有盘口，但 API 返回在 `more-markets` 或 sports page payload，不在主 event。
- 市场是正确比分/半场/角球等衍生盘口，默认折叠了完整清单。
- 外部 API 超时或被限流。

检查：

```bash
curl 'http://127.0.0.1:4174/worldcup/api/dashboard?force=1'
journalctl -u worldcup-dashboard.service -n 100 --no-pager
```

### 阵容、伤停、新闻缺失

不是一定没有公开信息，可能是：

- 当前抓取源没覆盖。
- 源页面结构变了。
- 同步脚本超时。
- AI 综合没有成功运行。

处理：

```bash
npm run sync:context
查看 data/worldcup-context.json 中对应 match 的 source status
```

### 赛前实时球胆不显示

这是正常的。实时球胆过程交易只在比赛进入 live 后显示。赛前看 `建议` 和普通 `球胆推荐`。

### 比赛结束后还显示

检查 `match_results` 是否记录、ESPN 状态是否 completed、dashboard match window 是否还保留 live grace。

### 数据库变大

检查是否开启了完整 payload 或全量 price points：

```bash
du -h data/worldcup-history.sqlite*
```

默认应该是结构化轻量归档。

## 19. Git 和仓库纪律

可以提交：

```text
server.js
public/index.html
scripts/*.js
data/*.json 中的静态/种子/框架数据
docs/*.md
deploy/*.service / *.timer / nginx 示例
skill 文件
```

不要提交：

```text
data/worldcup-context.json
data/worldcup-history.sqlite*
API key
服务器密码
本地模型配置和 auth 文件
marketing 私人宣传草稿
运行日志
缓存目录
```

当前本地常见未跟踪目录：

```text
polymarket-shadow-staging/
tennis-polymarket-dashboard/
```

它们不是这个 WorldCup dashboard 的提交对象，除非明确要处理那些项目。

## 20. 后续优化方向

值得继续做的方向：

- 更可靠的官方首发源和伤停源。
- 更细的现场数据：危险进攻、xG、传中、禁区触球、换人。
- 球胆过程交易加入用户手动输入成本/份额，计算真实 green book。
- 盘口推荐和最终赛果自动复盘报告。
- 高手账号剔除套利/做市行为的规则继续强化。
- 小组/淘汰赛动机模型继续校准。
- 用历史库回测 BTTS、大小球、球胆路径交易的真实表现。

## 21. 快速阅读顺序

以后自己看项目，建议按这个顺序：

1. 打开线上页面：[http://38.180.28.12/worldcup/](http://38.180.28.12/worldcup/)
2. 看每场 `实时买点`，确认是否 live。
3. 看 `建议`，确认模型概率、价格、edge、限制原因。
4. 看 `静态` 和 `比赛情报`，确认排名、近况、历史交手、阵容、伤停。
5. 看 `盘口`，确认 Polymarket 曲线和正确比分盘口。
6. 看 `高手`，但只把它当辅助，不盲跟。
7. 赛后看 `机会雷达 -> 复盘`，总结模型错在哪里。
