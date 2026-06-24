const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const DEFAULT_DB_PATH = path.join(ROOT, "data", "worldcup-history.sqlite");
const SQLITE_EXEC_TIMEOUT_MS = Number(process.env.SQLITE_EXEC_TIMEOUT_MS || 12000);
let schemaReady = null;

function historyDbPath() {
  return process.env.WORLDCUP_HISTORY_DB || DEFAULT_DB_PATH;
}

function shanghaiIso(date = new Date()) {
  const shifted = new Date(date.getTime() + 8 * 3600000);
  return `${shifted.toISOString().slice(0, 19)}+08:00`;
}

function runSql(sql, params = [], fetch = "") {
  return runOperations([{ sql, params, fetch }]);
}

function runOperations(operations) {
  return new Promise((resolve, reject) => {
    const dbPath = historyDbPath();
    const child = spawn(process.env.PYTHON_BIN || "python3", [path.join(__dirname, "sqlite-exec.py"), dbPath], {
      stdio: ["pipe", "pipe", "pipe"]
    });
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`sqlite operation timeout after ${SQLITE_EXEC_TIMEOUT_MS}ms`));
    }, SQLITE_EXEC_TIMEOUT_MS);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `sqlite3 exited with code ${code}`));
    });

    child.stdin.end(JSON.stringify({ operations }));
  });
}

async function ensureHistorySchema() {
  if (schemaReady) return schemaReady;
  schemaReady = ensureHistorySchemaNow().catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

async function ensureHistorySchemaNow() {
  await fs.mkdir(path.dirname(historyDbPath()), { recursive: true });
  await runOperations([{
    script: true,
    sql: `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS dashboard_runs (
  run_id TEXT PRIMARY KEY,
  generated_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'dashboard',
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
  match_id TEXT PRIMARY KEY,
  home_name TEXT,
  away_name TEXT,
  group_name TEXT,
  kickoff_shanghai TEXT,
  venue TEXT
);

CREATE TABLE IF NOT EXISTS match_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  prediction_label TEXT,
  prediction_key TEXT,
  prediction_probability REAL,
  prediction_confidence TEXT,
  trade_label TEXT,
  ai_trade_action TEXT,
  ai_trade_primary TEXT,
  ai_trade_summary TEXT,
  completeness_mode TEXT,
  completeness_score REAL,
  lambda_home REAL,
  lambda_away REAL,
  elite_active_positions INTEGER,
  elite_active_traders INTEGER,
  elite_current_value REAL,
  elite_total_bought REAL,
  group_situation_summary TEXT,
  group_situation_home_status TEXT,
  group_situation_away_status TEXT,
  group_situation_home_xg_delta REAL,
  group_situation_away_xg_delta REAL,
  payload_json TEXT NOT NULL,
  FOREIGN KEY(run_id) REFERENCES dashboard_runs(run_id)
);

CREATE TABLE IF NOT EXISTS market_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  recommendation_key TEXT NOT NULL,
  market_type TEXT,
  market_name TEXT,
  model_probability REAL,
  push_probability REAL,
  market_price REAL,
  market_source TEXT,
  edge REAL,
  max_buy_price REAL,
  odds_decimal REAL,
  odds_hong_kong REAL,
  odds_american REAL,
  decision_label TEXT,
  decision_action TEXT,
  elite_count INTEGER,
  elite_current_value REAL,
  elite_total_bought REAL,
  payload_json TEXT NOT NULL,
  FOREIGN KEY(snapshot_id) REFERENCES match_snapshots(snapshot_id)
);

CREATE TABLE IF NOT EXISTS price_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  recommendation_key TEXT NOT NULL,
  token_id TEXT,
  condition_id TEXT,
  source TEXT,
  point_time INTEGER,
  price REAL,
  UNIQUE(snapshot_id, recommendation_key, token_id, point_time, price)
);

CREATE TABLE IF NOT EXISTS elite_position_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  recommendation_key TEXT NOT NULL,
  proxy_wallet TEXT NOT NULL,
  user_name TEXT,
  trader_rank INTEGER,
  outcome TEXT,
  avg_price REAL,
  current_value REAL,
  total_bought REAL,
  size REAL,
  soccer_pnl REAL,
  win_rate_estimate REAL,
  soccer_settled_positions INTEGER,
  recent_buy_time TEXT,
  recent_buy_price REAL,
  recent_buy_amount REAL,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS top_holder_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  recommendation_key TEXT NOT NULL,
  proxy_wallet TEXT,
  user_name TEXT,
  holder_rank INTEGER,
  outcome TEXT,
  avg_price REAL,
  current_value REAL,
  total_bought REAL,
  size REAL,
  is_elite INTEGER,
  trader_rank INTEGER,
  soccer_pnl REAL,
  win_rate_estimate REAL,
  soccer_settled_positions INTEGER,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS head_to_head_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  window_years INTEGER,
  window_start TEXT,
  window_end TEXT,
  as_of TEXT,
  scope TEXT,
  matches INTEGER,
  home_wins INTEGER,
  draws INTEGER,
  away_wins INTEGER,
  home_goals INTEGER,
  away_goals INTEGER,
  source_status TEXT,
  impact TEXT,
  all_time_note TEXT,
  updated_at TEXT,
  payload_json TEXT NOT NULL,
  FOREIGN KEY(snapshot_id) REFERENCES match_snapshots(snapshot_id)
);

CREATE TABLE IF NOT EXISTS recent_form_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  side TEXT NOT NULL,
  team_code TEXT,
  team_name TEXT,
  source TEXT,
  source_url TEXT,
  status TEXT,
  updated_at TEXT,
  matches INTEGER,
  wins INTEGER,
  draws INTEGER,
  losses INTEGER,
  goals_for INTEGER,
  goals_against INTEGER,
  payload_json TEXT NOT NULL,
  FOREIGN KEY(snapshot_id) REFERENCES match_snapshots(snapshot_id)
);

CREATE TABLE IF NOT EXISTS world_cup_record_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  side TEXT NOT NULL,
  team_code TEXT,
  team_name TEXT,
  source TEXT,
  source_url TEXT,
  status TEXT,
  updated_at TEXT,
  as_of TEXT,
  appearances INTEGER,
  matches INTEGER,
  wins INTEGER,
  draws INTEGER,
  losses INTEGER,
  goals_for INTEGER,
  goals_against INTEGER,
  best_finish TEXT,
  titles INTEGER,
  payload_json TEXT NOT NULL,
  FOREIGN KEY(snapshot_id) REFERENCES match_snapshots(snapshot_id)
);

CREATE TABLE IF NOT EXISTS squad_profile_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  side TEXT NOT NULL,
  team_code TEXT,
  team_name TEXT,
  source TEXT,
  source_url TEXT,
  status TEXT,
  updated_at TEXT,
  avg_height_cm REAL,
  avg_age REAL,
  avg_caps REAL,
  top_tier_share REAL,
  gk_score REAL,
  df_score REAL,
  mf_score REAL,
  fw_score REAL,
  market_value_status TEXT,
  payload_json TEXT NOT NULL,
  FOREIGN KEY(snapshot_id) REFERENCES match_snapshots(snapshot_id)
);

CREATE TABLE IF NOT EXISTS human_matchup_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  source TEXT,
  source_url TEXT,
  status TEXT,
  updated_at TEXT,
  summary TEXT,
  ai_source TEXT,
  ai_summary TEXT,
  payload_json TEXT NOT NULL,
  FOREIGN KEY(snapshot_id) REFERENCES match_snapshots(snapshot_id)
);

CREATE TABLE IF NOT EXISTS polymarket_holder_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  condition_id TEXT,
  token_id TEXT,
  market_question TEXT,
  market_slug TEXT,
  token_label TEXT,
  proxy_wallet TEXT,
  user_name TEXT,
  holder_rank INTEGER,
  outcome TEXT,
  avg_price REAL,
  current_value REAL,
  total_bought REAL,
  size REAL,
  is_elite INTEGER,
  trader_rank INTEGER,
  soccer_pnl REAL,
  win_rate_estimate REAL,
  soccer_settled_positions INTEGER,
  payload_json TEXT NOT NULL,
  FOREIGN KEY(run_id) REFERENCES dashboard_runs(run_id)
);

CREATE TABLE IF NOT EXISTS elite_trader_rankings (
  run_id TEXT NOT NULL,
  proxy_wallet TEXT NOT NULL,
  user_name TEXT,
  soccer_rank INTEGER,
  soccer_pnl REAL,
  soccer_volume REAL,
  soccer_settled_positions INTEGER,
  soccer_wins INTEGER,
  soccer_losses INTEGER,
  soccer_pushes INTEGER,
  win_rate_estimate REAL,
  overall_pnl REAL,
  overall_volume REAL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY(run_id, proxy_wallet)
);

CREATE TABLE IF NOT EXISTS context_runs (
  run_id TEXT PRIMARY KEY,
  captured_at TEXT NOT NULL,
  ok INTEGER,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS context_match_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  updated_at TEXT,
  lineup_status TEXT,
  injury_summary TEXT,
  team_news_summary TEXT,
  weather_summary TEXT,
  ai_summary TEXT,
  payload_json TEXT NOT NULL,
  FOREIGN KEY(run_id) REFERENCES context_runs(run_id)
);

CREATE TABLE IF NOT EXISTS match_results (
  match_id TEXT PRIMARY KEY,
  home_goals INTEGER,
  away_goals INTEGER,
  result_key TEXT,
  result_label TEXT,
  status TEXT NOT NULL DEFAULT 'final',
  finished_at TEXT,
  source TEXT,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS live_match_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id TEXT NOT NULL,
  schedule_id TEXT,
  captured_at TEXT NOT NULL,
  source TEXT,
  status TEXT,
  minute TEXT,
  home_score INTEGER,
  away_score INTEGER,
  home_shots INTEGER,
  away_shots INTEGER,
  home_sot INTEGER,
  away_sot INTEGER,
  home_corners INTEGER,
  away_corners INTEGER,
  home_possession REAL,
  away_possession REAL,
  data_quality TEXT,
  recommendation_key TEXT,
  recommendation_label TEXT,
  recommendation_action TEXT,
  recommendation_edge REAL,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inplay_recommendation_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  live_snapshot_id INTEGER NOT NULL,
  match_id TEXT NOT NULL,
  recommendation_key TEXT NOT NULL,
  market_type TEXT,
  market_name TEXT,
  live_probability REAL,
  market_price REAL,
  edge REAL,
  max_buy_price REAL,
  action TEXT,
  label TEXT,
  payload_json TEXT NOT NULL,
  FOREIGN KEY(live_snapshot_id) REFERENCES live_match_snapshots(id)
);

CREATE INDEX IF NOT EXISTS idx_match_snapshots_match_time ON match_snapshots(match_id, captured_at);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_snapshot ON market_snapshots(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_match_key ON market_snapshots(match_id, recommendation_key);
CREATE INDEX IF NOT EXISTS idx_price_points_match_key ON price_points(match_id, recommendation_key, point_time);
CREATE INDEX IF NOT EXISTS idx_elite_positions_match_key ON elite_position_snapshots(match_id, recommendation_key);
CREATE INDEX IF NOT EXISTS idx_top_holders_match_key ON top_holder_snapshots(match_id, recommendation_key);
CREATE INDEX IF NOT EXISTS idx_h2h_match ON head_to_head_snapshots(match_id, window_start, window_end);
CREATE INDEX IF NOT EXISTS idx_recent_form_match ON recent_form_snapshots(match_id, side, updated_at);
CREATE INDEX IF NOT EXISTS idx_world_cup_record_match ON world_cup_record_snapshots(match_id, side, updated_at);
CREATE INDEX IF NOT EXISTS idx_squad_profile_match ON squad_profile_snapshots(match_id, side, updated_at);
CREATE INDEX IF NOT EXISTS idx_human_matchup_match ON human_matchup_snapshots(match_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_polymarket_holders_market ON polymarket_holder_snapshots(condition_id, token_id);
CREATE INDEX IF NOT EXISTS idx_results_updated ON match_results(updated_at);
CREATE INDEX IF NOT EXISTS idx_live_match_snapshots_match_time ON live_match_snapshots(match_id, captured_at);
CREATE INDEX IF NOT EXISTS idx_inplay_recommendations_match_key ON inplay_recommendation_snapshots(match_id, recommendation_key);

CREATE VIEW IF NOT EXISTS v_moneyline_backtest AS
SELECT
  ms.captured_at,
  mk.match_id,
  m.home_name,
  m.away_name,
  mk.recommendation_key,
  mk.market_name,
  mk.model_probability,
  mk.market_price,
  mk.edge,
  mk.decision_label,
  mk.market_source,
  r.result_key,
  r.home_goals,
  r.away_goals,
  CASE
    WHEN mk.market_type = 'moneyline' AND mk.recommendation_key = r.result_key THEN 1
    WHEN mk.market_type = 'moneyline' THEN 0
    ELSE NULL
  END AS settled_win,
  CASE
    WHEN mk.market_type = 'moneyline' AND mk.recommendation_key = r.result_key THEN 1 - mk.market_price
    WHEN mk.market_type = 'moneyline' THEN -mk.market_price
    ELSE NULL
  END AS profit_per_share,
  mk.payload_json
FROM market_snapshots mk
JOIN match_snapshots ms ON ms.snapshot_id = mk.snapshot_id
LEFT JOIN matches m ON m.match_id = mk.match_id
LEFT JOIN match_results r ON r.match_id = mk.match_id
WHERE mk.market_type = 'moneyline';
`
  }]);
  await ensureColumn("match_snapshots", "ai_trade_action", "TEXT");
  await ensureColumn("match_snapshots", "ai_trade_primary", "TEXT");
  await ensureColumn("match_snapshots", "ai_trade_summary", "TEXT");
  await ensureColumn("match_snapshots", "group_situation_summary", "TEXT");
  await ensureColumn("match_snapshots", "group_situation_home_status", "TEXT");
  await ensureColumn("match_snapshots", "group_situation_away_status", "TEXT");
  await ensureColumn("match_snapshots", "group_situation_home_xg_delta", "REAL");
  await ensureColumn("match_snapshots", "group_situation_away_xg_delta", "REAL");
}

function json(value) {
  return JSON.stringify(value ?? null);
}

async function ensureColumn(tableName, columnName, columnType) {
  const rows = JSON.parse(await runSql(`PRAGMA table_info(${tableName});`, [], "all") || "[]");
  if (rows.some((row) => row.name === columnName)) return;
  await runOperations([{
    sql: `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType};`
  }]);
}

function numberOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function textOrNull(value) {
  if (value === undefined || value === null) return null;
  return String(value);
}

function runId(prefix, date = new Date()) {
  return `${prefix}-${date.toISOString().replace(/[:.]/g, "-")}`;
}

async function recordDashboardSnapshot(payload, options = {}) {
  if (!payload || !Array.isArray(payload.matches)) return null;
  await ensureHistorySchema();
  const capturedAt = payload.meta?.generatedAt || new Date().toISOString();
  const id = options.runId || runId("dashboard", new Date(capturedAt));
  const operations = [{
    sql: "INSERT OR REPLACE INTO dashboard_runs (run_id, generated_at, source, payload_json) VALUES (?, ?, ?, ?);",
    params: [id, capturedAt, options.source || "dashboard", json(payload)]
  }];

  for (const match of payload.matches) {
    operations.push({
      sql: `
       INSERT OR REPLACE INTO matches
       (match_id, home_name, away_name, group_name, kickoff_shanghai, venue)
       VALUES (?, ?, ?, ?, ?, ?);`,
      params: [match.id, match.homeName, match.awayName, match.group, match.kickoffShanghai, match.venue]
    });

    const snapshotId = `${id}:${match.id}`;
    const groupSituation = match.groupSituation || {};
    const groupImpact = (groupSituation.modelImpacts || [])[0] || {};
    operations.push({
      sql: "DELETE FROM market_snapshots WHERE snapshot_id = ?;",
      params: [snapshotId]
    }, {
      sql: "DELETE FROM price_points WHERE snapshot_id = ?;",
      params: [snapshotId]
    }, {
      sql: "DELETE FROM elite_position_snapshots WHERE snapshot_id = ?;",
      params: [snapshotId]
    }, {
      sql: "DELETE FROM top_holder_snapshots WHERE snapshot_id = ?;",
      params: [snapshotId]
    }, {
      sql: "DELETE FROM head_to_head_snapshots WHERE snapshot_id = ?;",
      params: [snapshotId]
    }, {
      sql: "DELETE FROM recent_form_snapshots WHERE snapshot_id = ?;",
      params: [snapshotId]
    }, {
      sql: "DELETE FROM world_cup_record_snapshots WHERE snapshot_id = ?;",
      params: [snapshotId]
    }, {
      sql: "DELETE FROM squad_profile_snapshots WHERE snapshot_id = ?;",
      params: [snapshotId]
    }, {
      sql: "DELETE FROM human_matchup_snapshots WHERE snapshot_id = ?;",
      params: [snapshotId]
    }, {
      sql:
      `INSERT OR REPLACE INTO match_snapshots
       (snapshot_id, run_id, match_id, captured_at, prediction_label, prediction_key, prediction_probability,
        prediction_confidence, trade_label, ai_trade_action, ai_trade_primary, ai_trade_summary,
        completeness_mode, completeness_score, lambda_home, lambda_away,
        elite_active_positions, elite_active_traders, elite_current_value, elite_total_bought,
        group_situation_summary, group_situation_home_status, group_situation_away_status,
        group_situation_home_xg_delta, group_situation_away_xg_delta, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      params: [
        snapshotId,
        id,
        match.id,
        capturedAt,
        match.aiPrediction?.label,
        match.aiPrediction?.key,
        numberOrNull(match.aiPrediction?.probability),
        match.aiPrediction?.confidence,
        match.aiPrediction?.tradeLabel,
        textOrNull(match.aiTradePlan?.action),
        textOrNull(match.aiTradePlan?.primary?.name || match.aiTradePlan?.primaryName),
        textOrNull(match.aiTradePlan?.summary),
        match.completeness?.mode,
        numberOrNull(match.completeness?.score),
        numberOrNull(match.dynamicModel?.adjusted?.lambdaHome),
        numberOrNull(match.dynamicModel?.adjusted?.lambdaAway),
        numberOrNull(match.eliteSummary?.activePositions),
        numberOrNull(match.eliteSummary?.activeTraders),
        numberOrNull(match.eliteSummary?.totalCurrentValue),
        numberOrNull(match.eliteSummary?.totalBought),
        textOrNull(groupSituation.summary),
        textOrNull(groupSituation.home?.status),
        textOrNull(groupSituation.away?.status),
        numberOrNull(groupImpact.homeXgDelta),
        numberOrNull(groupImpact.awayXgDelta),
        json(match)
      ]
    });

    const h2h = match.headToHead || {};
    const h2hSummary = h2h.summary || {};
    operations.push({
      sql:
      `INSERT OR REPLACE INTO head_to_head_snapshots
       (snapshot_id, match_id, window_years, window_start, window_end, as_of, scope, matches,
        home_wins, draws, away_wins, home_goals, away_goals, source_status, impact,
        all_time_note, updated_at, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      params: [
        snapshotId,
        match.id,
        numberOrNull(h2h.windowYears),
        textOrNull(h2h.windowStart),
        textOrNull(h2h.windowEnd),
        textOrNull(h2h.asOf),
        textOrNull(h2h.scope),
        numberOrNull(h2hSummary.matches),
        numberOrNull(h2hSummary.homeWins),
        numberOrNull(h2hSummary.draws),
        numberOrNull(h2hSummary.awayWins),
        numberOrNull(h2hSummary.homeGoals),
        numberOrNull(h2hSummary.awayGoals),
        textOrNull(h2h.sourceStatus),
        textOrNull(h2h.impact),
        textOrNull(h2h.allTimeNote),
        textOrNull(h2h.updatedAt),
        json(h2h)
      ]
    });

    const recentFormRecords = match.recentFormRecords || match.context?.recentFormRecords || {};
    for (const side of ["home", "away"]) {
      const record = recentFormRecords[side] || {};
      const summary = record.summary || {};
      operations.push({
        sql:
        `INSERT INTO recent_form_snapshots
         (snapshot_id, match_id, side, team_code, team_name, source, source_url, status, updated_at,
          matches, wins, draws, losses, goals_for, goals_against, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        params: [
          snapshotId,
          match.id,
          side,
          textOrNull(record.teamCode || (side === "home" ? match.home : match.away)),
          textOrNull(record.teamName || (side === "home" ? match.homeName : match.awayName)),
          textOrNull(record.source),
          textOrNull(record.sourceUrl),
          textOrNull(record.status),
          textOrNull(record.updatedAt),
          numberOrNull(summary.matches),
          numberOrNull(summary.wins),
          numberOrNull(summary.draws),
          numberOrNull(summary.losses),
          numberOrNull(summary.goalsFor),
          numberOrNull(summary.goalsAgainst),
          json(record)
        ]
      });
    }

    for (const side of ["home", "away"]) {
      const team = side === "home" ? match.homeTeam : match.awayTeam;
      const record = team?.worldCupRecord || {};
      operations.push({
        sql:
        `INSERT INTO world_cup_record_snapshots
         (snapshot_id, match_id, side, team_code, team_name, source, source_url, status, updated_at, as_of,
          appearances, matches, wins, draws, losses, goals_for, goals_against, best_finish, titles, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        params: [
          snapshotId,
          match.id,
          side,
          textOrNull(record.teamCode || (side === "home" ? match.home : match.away)),
          textOrNull(record.teamZh || record.team || (side === "home" ? match.homeName : match.awayName)),
          textOrNull(record.source),
          textOrNull(record.sourceUrl),
          textOrNull(record.status),
          textOrNull(record.updatedAt),
          textOrNull(record.asOf),
          numberOrNull(record.appearances),
          numberOrNull(record.matches),
          numberOrNull(record.wins),
          numberOrNull(record.draws),
          numberOrNull(record.losses),
          numberOrNull(record.goalsFor),
          numberOrNull(record.goalsAgainst),
          textOrNull(record.bestFinish),
          numberOrNull(record.titles),
          json(record)
        ]
      });
    }

    for (const side of ["home", "away"]) {
      const team = side === "home" ? match.homeTeam : match.awayTeam;
      const profile = team?.squadProfile || {};
      const groups = profile.groups || {};
      const all = groups.all || {};
      const lineScore = (group, weights) => {
        if (!group || !group.players) return null;
        const height = Number(group.avgHeightCm);
        const caps = Number(group.avgCaps);
        const tier = Number(group.topTierShare);
        const heightScore = Number.isFinite(height) ? Math.max(0, Math.min(1, (height - 170) / 25)) : 0;
        const capsScore = Number.isFinite(caps) ? Math.max(0, Math.min(1, caps / 60)) : 0;
        const tierScore = Number.isFinite(tier) ? tier : 0;
        return Math.round(1000 * (heightScore * weights.height + capsScore * weights.caps + tierScore * weights.tier)) / 10;
      };
      operations.push({
        sql:
        `INSERT INTO squad_profile_snapshots
         (snapshot_id, match_id, side, team_code, team_name, source, source_url, status, updated_at,
          avg_height_cm, avg_age, avg_caps, top_tier_share, gk_score, df_score, mf_score, fw_score,
          market_value_status, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        params: [
          snapshotId,
          match.id,
          side,
          textOrNull(profile.teamCode || (side === "home" ? match.home : match.away)),
          textOrNull(profile.teamZh || profile.team || (side === "home" ? match.homeName : match.awayName)),
          textOrNull(profile.source),
          textOrNull(profile.sourceUrl),
          textOrNull(profile.status),
          textOrNull(profile.updatedAt),
          numberOrNull(all.avgHeightCm),
          numberOrNull(all.avgAge),
          numberOrNull(all.avgCaps),
          numberOrNull(all.topTierShare),
          numberOrNull(lineScore(groups.GK, { height: 0.35, caps: 0.3, tier: 0.35 })),
          numberOrNull(lineScore(groups.DF, { height: 0.25, caps: 0.25, tier: 0.5 })),
          numberOrNull(lineScore(groups.MF, { height: 0.12, caps: 0.28, tier: 0.6 })),
          numberOrNull(lineScore(groups.FW, { height: 0.15, caps: 0.25, tier: 0.6 })),
          textOrNull(profile.marketValue?.status),
          json(profile)
        ]
      });
    }

    const humanMatchup = match.humanMatchup || {};
    operations.push({
      sql:
      `INSERT OR REPLACE INTO human_matchup_snapshots
       (snapshot_id, match_id, source, source_url, status, updated_at, summary, ai_source, ai_summary, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      params: [
        snapshotId,
        match.id,
        textOrNull(humanMatchup.source),
        textOrNull(humanMatchup.sourceUrl),
        textOrNull(humanMatchup.status),
        textOrNull(humanMatchup.updatedAt),
        textOrNull(humanMatchup.summary),
        textOrNull(humanMatchup.aiRead?.source),
        textOrNull(humanMatchup.aiRead?.summary),
        json(humanMatchup)
      ]
    });

    for (const rec of match.recommendations || []) {
      pushMarketSnapshotOps(operations, snapshotId, match.id, rec);
    }
  }

  for (const trader of payload.eliteTraders?.traders || []) {
    operations.push({
      sql:
      `INSERT OR REPLACE INTO elite_trader_rankings
       (run_id, proxy_wallet, user_name, soccer_rank, soccer_pnl, soccer_volume, soccer_settled_positions,
        soccer_wins, soccer_losses, soccer_pushes, win_rate_estimate, overall_pnl, overall_volume, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      params: [
        id,
        trader.proxyWallet,
        trader.userName,
        numberOrNull(trader.soccerRank),
        numberOrNull(trader.soccerPnl),
        numberOrNull(trader.soccerVolume),
        numberOrNull(trader.soccerSettledPositions),
        numberOrNull(trader.soccerWins),
        numberOrNull(trader.soccerLosses),
        numberOrNull(trader.soccerPushes),
        numberOrNull(trader.winRateEstimate),
        numberOrNull(trader.overallPnl),
        numberOrNull(trader.overallVolume),
        json(trader)
      ]
    });
  }

  operations.push({
    sql: "DELETE FROM polymarket_holder_snapshots WHERE run_id = ?;",
    params: [id]
  });
  for (const market of payload.polymarket?.markets || []) {
    for (const token of market.tokens || []) {
      for (const holder of token.topHolders || []) {
        operations.push({
          sql:
          `INSERT INTO polymarket_holder_snapshots
           (run_id, condition_id, token_id, market_question, market_slug, token_label, proxy_wallet,
            user_name, holder_rank, outcome, avg_price, current_value, total_bought, size,
            is_elite, trader_rank, soccer_pnl, win_rate_estimate, soccer_settled_positions, payload_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          params: [
            id,
            market.conditionId || "",
            token.tokenId || "",
            market.question || "",
            market.slug || "",
            token.label || "",
            holder.proxyWallet || "",
            holder.userName || "",
            numberOrNull(holder.holderRank),
            holder.outcome || token.label || "",
            numberOrNull(holder.avgPrice),
            numberOrNull(holder.currentValue),
            numberOrNull(holder.totalBought),
            numberOrNull(holder.size),
            holder.isElite ? 1 : 0,
            numberOrNull(holder.traderRank),
            numberOrNull(holder.soccerPnl),
            numberOrNull(holder.winRateEstimate),
            numberOrNull(holder.soccerSettledPositions),
            json(holder)
          ]
        });
      }
    }
  }

  await runOperations(operations);
  return { runId: id, capturedAt };
}

function pushMarketSnapshotOps(operations, snapshotId, matchId, rec) {
  operations.push({
    sql:
    `INSERT INTO market_snapshots
     (snapshot_id, match_id, recommendation_key, market_type, market_name, model_probability, push_probability,
      market_price, market_source, edge, max_buy_price, odds_decimal, odds_hong_kong, odds_american,
      decision_label, decision_action, elite_count, elite_current_value, elite_total_bought, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    params: [
      snapshotId,
      matchId,
      rec.key,
      rec.marketType,
      rec.name,
      numberOrNull(rec.modelProbability),
      numberOrNull(rec.pushProbability),
      numberOrNull(rec.marketPrice),
      rec.chart?.source || "",
      numberOrNull(rec.edge),
      numberOrNull(rec.maxBuyPrice),
      numberOrNull(rec.odds?.decimal),
      numberOrNull(rec.odds?.hongKong),
      numberOrNull(rec.odds?.american),
      rec.decision?.label || "",
      rec.decision?.action || "",
      numberOrNull(rec.eliteSummary?.count),
      numberOrNull(rec.eliteSummary?.totalCurrentValue),
      numberOrNull(rec.eliteSummary?.totalBought),
      json(rec)
    ]
  });

  for (const point of rec.chart?.history || []) {
    operations.push({
      sql:
      `INSERT OR IGNORE INTO price_points
       (snapshot_id, match_id, recommendation_key, token_id, condition_id, source, point_time, price)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      params: [
        snapshotId,
        matchId,
        rec.key,
        rec.chart?.tokenId || "",
        rec.chart?.conditionId || "",
        rec.chart?.source || "",
        numberOrNull(point.t),
        numberOrNull(point.p)
      ]
    });
  }

  for (const signal of rec.eliteSignals || []) {
    operations.push({
      sql:
      `INSERT INTO elite_position_snapshots
       (snapshot_id, match_id, recommendation_key, proxy_wallet, user_name, trader_rank, outcome,
        avg_price, current_value, total_bought, size, soccer_pnl, win_rate_estimate,
        soccer_settled_positions, recent_buy_time, recent_buy_price, recent_buy_amount, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      params: [
        snapshotId,
        matchId,
        rec.key,
        signal.proxyWallet,
        signal.userName,
        numberOrNull(signal.traderRank),
        signal.outcome,
        numberOrNull(signal.avgPrice),
        numberOrNull(signal.currentValue),
        numberOrNull(signal.totalBought),
        numberOrNull(signal.size),
        numberOrNull(signal.soccerPnl),
        numberOrNull(signal.winRateEstimate),
        numberOrNull(signal.soccerSettledPositions),
        textOrNull(signal.recentBuy?.isoTime),
        numberOrNull(signal.recentBuy?.price),
        numberOrNull(signal.recentBuy?.usdcSize),
        json(signal)
      ]
    });
  }

  for (const holder of rec.topHolders || []) {
    operations.push({
      sql:
      `INSERT INTO top_holder_snapshots
       (snapshot_id, match_id, recommendation_key, proxy_wallet, user_name, holder_rank, outcome,
        avg_price, current_value, total_bought, size, is_elite, trader_rank, soccer_pnl,
        win_rate_estimate, soccer_settled_positions, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      params: [
        snapshotId,
        matchId,
        rec.key,
        holder.proxyWallet || "",
        holder.userName || "",
        numberOrNull(holder.holderRank),
        holder.outcome || "",
        numberOrNull(holder.avgPrice),
        numberOrNull(holder.currentValue),
        numberOrNull(holder.totalBought),
        numberOrNull(holder.size),
        holder.isElite ? 1 : 0,
        numberOrNull(holder.traderRank),
        numberOrNull(holder.soccerPnl),
        numberOrNull(holder.winRateEstimate),
        numberOrNull(holder.soccerSettledPositions),
        json(holder)
      ]
    });
  }
}

async function recordContextSnapshot(payload, options = {}) {
  if (!payload || !payload.matches) return null;
  await ensureHistorySchema();
  const capturedAt = payload.meta?.lastUpdated || shanghaiIso();
  const id = options.runId || runId("context", new Date());
  const operations = [{
    sql: "INSERT OR REPLACE INTO context_runs (run_id, captured_at, ok, payload_json) VALUES (?, ?, ?, ?);",
    params: [id, capturedAt, payload.meta?.ok === false ? 0 : 1, json(payload)]
  }, {
    sql: "DELETE FROM context_match_snapshots WHERE run_id = ?;",
    params: [id]
  }];

  for (const [matchId, context] of Object.entries(payload.matches || {})) {
    operations.push({
      sql:
      `INSERT INTO context_match_snapshots
       (run_id, match_id, updated_at, lineup_status, injury_summary, team_news_summary, weather_summary, ai_summary, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      params: [
        id,
        matchId,
        context.updatedAt || "",
        context.lineups?.status || "",
        context.injurySummary || "",
        context.teamNewsSummary || "",
        context.weather?.summary || context.weatherSummary || "",
        context.aiAnalysis?.summary || "",
        json(context)
      ]
    });
  }

  await runOperations(operations);
  return { runId: id, capturedAt };
}

async function recordMatchResult(result) {
  await ensureHistorySchema();
  const homeGoals = numberOrNull(result.homeGoals);
  const awayGoals = numberOrNull(result.awayGoals);
  const resultKey = result.resultKey || (
    homeGoals > awayGoals ? "home" : homeGoals === awayGoals ? "draw" : "away"
  );
  const resultLabel = result.resultLabel || ({
    home: "主胜",
    draw: "平局",
    away: "客胜"
  }[resultKey] || resultKey);
  const updatedAt = shanghaiIso();
  await runSql(
    `INSERT OR REPLACE INTO match_results
     (match_id, home_goals, away_goals, result_key, result_label, status, finished_at, source, payload_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      result.matchId,
      homeGoals,
      awayGoals,
      resultKey,
      resultLabel,
      result.status || "final",
      result.finishedAt || updatedAt,
      result.source || "manual",
      json(result),
      updatedAt
    ]
  );
  return { matchId: result.matchId, updatedAt };
}

async function recordLiveMatchSnapshot(payload) {
  if (!payload || !payload.matchId) return null;
  await ensureHistorySchema();
  const stats = payload.live?.stats || {};
  const summary = payload.recommendationSummary || {};
  const top = Array.isArray(payload.recommendations) ? payload.recommendations[0] : null;
  const operations = [{
    sql:
    `INSERT INTO live_match_snapshots
     (match_id, schedule_id, captured_at, source, status, minute, home_score, away_score,
      home_shots, away_shots, home_sot, away_sot, home_corners, away_corners,
      home_possession, away_possession, data_quality, recommendation_key, recommendation_label,
      recommendation_action, recommendation_edge, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    params: [
      payload.matchId,
      payload.scheduleId || "",
      payload.capturedAt || new Date().toISOString(),
      payload.source || payload.live?.source || "",
      payload.live?.status || "",
      payload.live?.minute || "",
      numberOrNull(payload.live?.score?.home),
      numberOrNull(payload.live?.score?.away),
      numberOrNull(stats.home?.shots),
      numberOrNull(stats.away?.shots),
      numberOrNull(stats.home?.shotsOnTarget),
      numberOrNull(stats.away?.shotsOnTarget),
      numberOrNull(stats.home?.corners),
      numberOrNull(stats.away?.corners),
      numberOrNull(stats.home?.possession),
      numberOrNull(stats.away?.possession),
      payload.dataQuality?.status || "",
      top?.key || "",
      top?.name || summary.title || "",
      top?.action || summary.action || "",
      numberOrNull(top?.edge),
      json(payload)
    ],
    fetch: "lastID"
  }];
  const output = await runOperations(operations);
  const line = output.trim().split("\n").filter(Boolean).pop();
  let liveSnapshotId = null;
  try {
    liveSnapshotId = line ? JSON.parse(line)?.lastID : null;
  } catch {
    liveSnapshotId = null;
  }
  if (!liveSnapshotId) return { liveSnapshotId: null };

  const recOps = [];
  for (const rec of payload.recommendations || []) {
    recOps.push({
      sql:
      `INSERT INTO inplay_recommendation_snapshots
       (live_snapshot_id, match_id, recommendation_key, market_type, market_name,
        live_probability, market_price, edge, max_buy_price, action, label, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      params: [
        liveSnapshotId,
        payload.matchId,
        rec.key,
        rec.marketType,
        rec.name,
        numberOrNull(rec.liveProbability),
        numberOrNull(rec.marketPrice),
        numberOrNull(rec.edge),
        numberOrNull(rec.maxBuyPrice),
        rec.action || "",
        rec.label || "",
        json(rec)
      ]
    });
  }
  if (recOps.length) await runOperations(recOps);
  return { liveSnapshotId };
}

module.exports = {
  ensureHistorySchema,
  recordDashboardSnapshot,
  recordContextSnapshot,
  recordMatchResult,
  recordLiveMatchSnapshot,
  historyDbPath,
  runSql,
  runOperations
};
