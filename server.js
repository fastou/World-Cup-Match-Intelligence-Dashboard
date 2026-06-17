const http = require("http");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { recordDashboardSnapshot, ensureHistorySchema, historyDbPath, runSql } = require("./scripts/history-store");

const PORT = Number(process.env.PORT || 4173);
const BASE_PATH = normalizeBasePath(process.env.BASE_PATH || "");
const ROOT = __dirname;
const DATA_PATH = path.join(ROOT, "data", "worldcup-dashboard.json");
const FIFA_RANKINGS_PATH = path.join(ROOT, "data", "fifa-rankings.json");
const WORLD_CUP_RECORDS_PATH = path.join(ROOT, "data", "world-cup-records.json");
const SQUAD_PROFILES_PATH = path.join(ROOT, "data", "squad-profiles.json");
const RESEARCH_FRAMEWORK_PATH = path.join(ROOT, "data", "research-framework.json");
const CONTEXT_PATH = path.join(ROOT, "data", "worldcup-context.json");
const LIVE_CACHE_PATH = path.join(ROOT, "data", "worldcup-live-cache.json");
const H2H_OVERRIDES_PATH = path.join(ROOT, "data", "head-to-head-overrides.json");
const PUBLIC_DIR = path.join(ROOT, "public");
const ENV_PATH = process.env.WORLDCUP_ENV_PATH || "/etc/worldcup-dashboard.env";
const CACHE_TTL_MS = 5 * 60 * 1000;
const LIGHT_CACHE_TTL_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 6500;
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 30000);
const AI_TRADE_PLAN_TIMEOUT_MS = Number(process.env.AI_TRADE_PLAN_TIMEOUT_MS || 4000);
const AI_TRADE_PLAN_ENABLED = process.env.AI_TRADE_PLAN_ENABLED !== "0";
const PRICE_HISTORY_HOURS = 24;
const PRICE_HISTORY_FIDELITY_MINUTES = 15;
const POLYMARKET_MARKET_LIMIT = Number(process.env.POLYMARKET_MARKET_LIMIT || 140);
const POLYMARKET_HISTORY_TOKEN_LIMIT = Number(process.env.POLYMARKET_HISTORY_TOKEN_LIMIT || 240);
const POLYMARKET_HISTORY_BATCH_SIZE = 20;
const POLYMARKET_SPORTS_MARKET_LIMIT_PER_EVENT = 10;
const MATCH_WINDOW_DAYS = Number(process.env.MATCH_WINDOW_DAYS || 3);
const MATCH_HIDE_AFTER_HOURS = Number(process.env.MATCH_HIDE_AFTER_HOURS || 8);
const MATCH_LIVE_GRACE_HOURS = Number(process.env.MATCH_LIVE_GRACE_HOURS || 8);
const MATCH_SCHEDULE_LOOKBACK_DAYS = Number(process.env.MATCH_SCHEDULE_LOOKBACK_DAYS || 1);
const ESPN_WORLDCUP_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
const POLYMARKET_DATA_API_BASE = "https://data-api.polymarket.com";
const POLYMARKET_GAMMA_API_BASE = "https://gamma-api.polymarket.com";
const ELITE_LEADERBOARD_CACHE_TTL_MS = 15 * 60 * 1000;
const ELITE_TRADER_LIMIT = Number(process.env.ELITE_TRADER_LIMIT || 100);
const ELITE_TRADER_CANDIDATE_LIMIT = Number(process.env.ELITE_TRADER_CANDIDATE_LIMIT || Math.max(260, ELITE_TRADER_LIMIT * 2));
const ELITE_LEADERBOARD_PAGE_SIZE = 100;
const ELITE_CLOSED_POSITION_LIMIT = 160;
const ELITE_MARKET_POSITION_LIMIT = 100;
const TOP_HOLDER_LIMIT = Number(process.env.TOP_HOLDER_LIMIT || 50);
const ELITE_ACTIVITY_LIMIT = 300;
const USE_DEMO_POLYMARKET = process.env.DEMO_POLYMARKET === "1";
const DISABLE_HISTORY_RECORDING = process.env.WORLDCUP_DISABLE_HISTORY === "1";
const AUTO_BASELINE_DEFAULT_RATING = 68;
const AUTO_BASELINE_RATINGS = {
  ARG: 86,
  BRA: 85,
  ESP: 84,
  FRA: 84,
  ENG: 83,
  GER: 82,
  NED: 81,
  POR: 81,
  BEL: 80,
  URU: 79,
  CRO: 78,
  ITA: 78,
  USA: 76,
  MAR: 76,
  SUI: 76,
  JPN: 75,
  MEX: 76,
  IRN: 73,
  KOR: 72,
  CAN: 72,
  AUS: 71,
  ECU: 74,
  PAR: 71,
  CZE: 69,
  SWE: 72,
  SCO: 70,
  TUR: 73,
  QAT: 64,
  KSA: 66,
  EGY: 72,
  TUN: 69,
  CIV: 72,
  HAI: 58,
  BIH: 67,
  CPV: 63,
  CUW: 57,
  NZL: 61,
  RSA: 63
};

const VENUE_COORDINATES = {
  "BMO Field": { latitude: 43.6332, longitude: -79.4186, label: "BMO Field, Toronto" },
  "SoFi Stadium": { latitude: 33.9535, longitude: -118.3392, label: "SoFi Stadium, Inglewood" },
  "Levi's Stadium": { latitude: 37.403, longitude: -121.97, label: "Levi's Stadium, Santa Clara" },
  "MetLife Stadium": { latitude: 40.8135, longitude: -74.0745, label: "MetLife Stadium, East Rutherford" },
  "Gillette Stadium": { latitude: 42.0909, longitude: -71.2643, label: "Gillette Stadium, Foxborough" },
  "BC Place": { latitude: 49.2768, longitude: -123.1119, label: "BC Place, Vancouver" },
  "NRG Stadium": { latitude: 29.6847, longitude: -95.4107, label: "NRG Stadium, Houston" },
  "AT&T Stadium": { latitude: 32.7473, longitude: -97.0945, label: "AT&T Stadium, Arlington" },
  "Lincoln Financial Field": { latitude: 39.9008, longitude: -75.1675, label: "Lincoln Financial Field, Philadelphia" },
  "Estadio BBVA": { latitude: 25.6689, longitude: -100.2443, label: "Estadio BBVA, Guadalupe" },
  "Mercedes-Benz Stadium": { latitude: 33.7554, longitude: -84.4008, label: "Mercedes-Benz Stadium, Atlanta" },
  "Lumen Field": { latitude: 47.5952, longitude: -122.3316, label: "Lumen Field, Seattle" },
  "Hard Rock Stadium": { latitude: 25.958, longitude: -80.2389, label: "Hard Rock Stadium, Miami Gardens" },
  "Estadio Azteca": { latitude: 19.3029, longitude: -99.1505, label: "Estadio Azteca, Mexico City" }
};

let dashboardCache = null;
let dashboardCacheAt = 0;
let lightDashboardCache = null;
let lightDashboardCacheAt = 0;
let backgroundRefreshPromise = null;
let eliteLeaderboardCache = null;
let eliteLeaderboardCacheAt = 0;
let envFileCache = null;
let codexOpenAiConfigCache = null;

const TEAM_SEARCH_NAMES = {
  MEX: "Mexico",
  RSA: "South Africa",
  KOR: "South Korea",
  CZE: "Czechia",
  CAN: "Canada",
  BIH: "Bosnia-Herzegovina",
  USA: "United States",
  PAR: "Paraguay",
  QAT: "Qatar",
  SUI: "Switzerland",
  BRA: "Brazil",
  MAR: "Morocco",
  HAI: "Haiti",
  SCO: "Scotland",
  AUS: "Australia",
  TUR: "Türkiye",
  GER: "Germany",
  CUW: "Curaçao",
  NED: "Netherlands",
  JPN: "Japan",
  CIV: "Ivory Coast",
  ECU: "Ecuador",
  SWE: "Sweden",
  TUN: "Tunisia",
  ESP: "Spain",
  CPV: "Cape Verde",
  BEL: "Belgium",
  EGY: "Egypt",
  KSA: "Saudi Arabia",
  URU: "Uruguay",
  IRN: "Iran",
  NZL: "New Zealand",
  FRA: "France",
  SEN: "Senegal",
  IRQ: "Iraq",
  NOR: "Norway",
  ARG: "Argentina",
  ALG: "Algeria",
  AUT: "Austria",
  JOR: "Jordan",
  POR: "Portugal",
  COD: "Congo DR",
  CRO: "Croatia",
  ENG: "England",
  GHA: "Ghana",
  PAN: "Panama",
  COL: "Colombia",
  UZB: "Uzbekistan"
};

const TEAM_DISPLAY_NAMES_ZH = {
  MEX: "墨西哥",
  RSA: "南非",
  KOR: "韩国",
  CZE: "捷克",
  CAN: "加拿大",
  BIH: "波黑",
  USA: "美国",
  PAR: "巴拉圭",
  QAT: "卡塔尔",
  SUI: "瑞士",
  BRA: "巴西",
  MAR: "摩洛哥",
  HAI: "海地",
  SCO: "苏格兰",
  AUS: "澳大利亚",
  TUR: "土耳其",
  GER: "德国",
  CUW: "库拉索",
  NED: "荷兰",
  JPN: "日本",
  CIV: "科特迪瓦",
  ECU: "厄瓜多尔",
  SWE: "瑞典",
  TUN: "突尼斯",
  ESP: "西班牙",
  CPV: "佛得角",
  BEL: "比利时",
  EGY: "埃及",
  KSA: "沙特阿拉伯",
  URU: "乌拉圭",
  IRN: "伊朗",
  NZL: "新西兰",
  FRA: "法国",
  SEN: "塞内加尔",
  IRQ: "伊拉克",
  NOR: "挪威",
  ARG: "阿根廷",
  ALG: "阿尔及利亚",
  AUT: "奥地利",
  JOR: "约旦",
  POR: "葡萄牙",
  COD: "刚果（金）",
  CRO: "克罗地亚",
  ENG: "英格兰",
  GHA: "加纳",
  PAN: "巴拿马",
  COL: "哥伦比亚",
  UZB: "乌兹别克斯坦"
};

function teamDisplayName(code, fallback = "") {
  const normalized = String(code || "").toUpperCase();
  return TEAM_DISPLAY_NAMES_ZH[normalized] || TEAM_SEARCH_NAMES[normalized] || fallback || normalized;
}

const SOCCER_POSITION_KEYWORDS = [
  "soccer",
  "world cup",
  "fifa",
  "uefa",
  "champions league",
  "europa league",
  "ucl",
  "epl",
  "premier league",
  "la liga",
  "serie a",
  "bundesliga",
  "ligue 1",
  "mls",
  "concacaf",
  "copa",
  "arsenal",
  "chelsea",
  "liverpool",
  "manchester",
  "barcelona",
  "real madrid",
  "psg",
  "bayern",
  "inter milan",
  "juventus",
  "villarreal",
  "ajax",
  "mexico",
  "south africa",
  "south korea",
  "czech",
  "canada",
  "bosnia",
  "united states",
  "paraguay",
  "qatar",
  "switzerland",
  "brazil",
  "morocco",
  "haiti",
  "scotland",
  "australia",
  "turkiye",
  "türkiye",
  "germany",
  "curacao",
  "curaçao",
  "netherlands",
  "japan",
  "ivory coast",
  "ecuador",
  "sweden",
  "tunisia",
  "spain",
  "cape verde",
  "belgium",
  "egypt",
  "saudi arabia",
  "uruguay",
  "iran",
  "new zealand"
];

const WORLDCUP_MARKET_SEARCHES = [
  {
    label: "Mexico vs South Africa",
    q: "Mexico South Africa",
    teamNeedles: ["mexico", "south africa"]
  },
  {
    label: "South Korea vs Czechia",
    q: "South Korea Czechia",
    teamNeedles: ["south korea", "czech"]
  },
  {
    label: "World Cup",
    q: "World Cup",
    worldCupOnly: true
  }
];

const NON_SOCCER_POSITION_KEYWORDS = [
  "nfl",
  "nba",
  "mlb",
  "nhl",
  "ufc",
  "tennis",
  "baseball",
  "basketball",
  "hockey",
  "super bowl",
  "formula 1",
  "f1",
  "golf"
];

function normalizeBasePath(value) {
  if (!value || value === "/") return "";
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function jsonResponse(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

function textResponse(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store"
  });
  res.end(body);
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function readOptionalJson(filePath, fallback) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJsonAtomic(filePath, payload) {
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2));
  await fs.rename(tmpPath, filePath);
}

async function readOptionalText(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function readEnvFile() {
  if (envFileCache) return envFileCache;
  const env = {};
  const raw = await readOptionalText(ENV_PATH);
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  envFileCache = env;
  return env;
}

function parseTomlScalar(rawValue) {
  let value = String(rawValue || "").trim();
  const commentIndex = value.search(/\s#/);
  if (commentIndex >= 0) value = value.slice(0, commentIndex).trim();
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

function parseCodexConfigToml(raw) {
  const root = {};
  let currentSection = "";
  for (const line of String(raw || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      continue;
    }
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = parseTomlScalar(trimmed.slice(index + 1));
    const target = currentSection ? `${currentSection}.${key}` : key;
    root[target] = value;
  }
  return root;
}

async function readCodexOpenAiConfig() {
  if (codexOpenAiConfigCache) return codexOpenAiConfigCache;
  const home = os.homedir();
  const configPath = process.env.CODEX_CONFIG_PATH || path.join(home, ".codex", "config.toml");
  const authPath = process.env.CODEX_AUTH_PATH || path.join(home, ".codex", "auth.json");
  const config = parseCodexConfigToml(await readOptionalText(configPath));
  const auth = await readOptionalJson(authPath, {});
  const providerName = String(config.model_provider || "OpenAI");
  const providerPrefix = `model_providers.${providerName}.`;
  codexOpenAiConfigCache = {
    apiKey: auth.OPENAI_API_KEY || "",
    model: config.model || "",
    baseUrl: config[`${providerPrefix}base_url`] || "",
    wireApi: config[`${providerPrefix}wire_api`] || ""
  };
  return codexOpenAiConfigCache;
}

async function getOpenAiConfig() {
  const [env, codex] = await Promise.all([
    readEnvFile(),
    readCodexOpenAiConfig()
  ]);
  return {
    apiKey: process.env.OPENAI_API_KEY || env.OPENAI_API_KEY || codex.apiKey || "",
    model: process.env.OPENAI_MODEL || env.OPENAI_MODEL || codex.model || "gpt-4o-mini",
    baseUrl: (process.env.OPENAI_BASE_URL || env.OPENAI_BASE_URL || codex.baseUrl || "https://api.openai.com").replace(/\/+$/, ""),
    wireApi: process.env.OPENAI_WIRE_API || env.OPENAI_WIRE_API || codex.wireApi || "responses"
  };
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, override) {
  if (!isPlainObject(override)) return override === undefined ? base : override;
  const merged = { ...(isPlainObject(base) ? base : {}) };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = isPlainObject(value) ? deepMerge(merged[key], value) : value;
  }
  return merged;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundTo(value, digits = 2) {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

function hoursSince(iso, now = Date.now()) {
  if (!iso) return Infinity;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return Infinity;
  return Math.max(0, (now - ts) / 3600000);
}

function shanghaiDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}${parts.month}${parts.day}`;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

function dateMs(iso) {
  const ms = new Date(iso || "").getTime();
  return Number.isFinite(ms) ? ms : null;
}

function statusName(value) {
  return String(value || "").toLowerCase();
}

function isFinishedStatus(status) {
  const normalized = statusName(status);
  return normalized.includes("final")
    || normalized.includes("post")
    || normalized.includes("full_time")
    || normalized.includes("full-time")
    || normalized.includes("finished")
    || normalized.includes("complete");
}

function inUpcomingWindow(kickoffIso, nowMs = Date.now(), days = MATCH_WINDOW_DAYS) {
  const kickoffMs = dateMs(kickoffIso);
  if (!kickoffMs) return false;
  const hideAfterMs = MATCH_HIDE_AFTER_HOURS * 3600000;
  const windowEnd = nowMs + days * 86400000;
  return kickoffMs >= nowMs - hideAfterMs && kickoffMs <= windowEnd;
}

function inScheduleWindow(kickoffIso, nowMs = Date.now(), days = MATCH_WINDOW_DAYS, lookbackDays = MATCH_SCHEDULE_LOOKBACK_DAYS) {
  const kickoffMs = dateMs(kickoffIso);
  if (!kickoffMs) return false;
  const windowStart = nowMs - lookbackDays * 86400000;
  const windowEnd = nowMs + days * 86400000;
  return kickoffMs >= windowStart && kickoffMs <= windowEnd;
}

function shouldKeepScheduledMatch(kickoffIso, schedule = null, nowMs = Date.now()) {
  const kickoffMs = dateMs(kickoffIso);
  if (!kickoffMs) return false;
  if (schedule?.completed || isFinishedStatus(schedule?.status)) return false;
  if (!inScheduleWindow(kickoffIso, nowMs)) return false;
  if (kickoffMs >= nowMs - MATCH_HIDE_AFTER_HOURS * 3600000) return true;
  return Boolean(schedule) && kickoffMs >= nowMs - MATCH_LIVE_GRACE_HOURS * 3600000;
}

function hasRecordedFinal(matchId, finalResults) {
  return Boolean(finalResults && finalResults.has(matchId));
}

function poisson(lambda, goals) {
  let factorial = 1;
  for (let i = 2; i <= goals; i += 1) factorial *= i;
  return Math.exp(-lambda) * Math.pow(lambda, goals) / factorial;
}

function scoreModel(lambdaHome, lambdaAway) {
  const maxGoals = 10;
  let home = 0;
  let draw = 0;
  let away = 0;
  let under25 = 0;
  let btts = 0;
  const scores = [];

  for (let h = 0; h <= maxGoals; h += 1) {
    const ph = poisson(lambdaHome, h);
    for (let a = 0; a <= maxGoals; a += 1) {
      const p = ph * poisson(lambdaAway, a);
      if (h > a) home += p;
      else if (h === a) draw += p;
      else away += p;

      if (h + a < 3) under25 += p;
      if (h > 0 && a > 0) btts += p;
      scores.push({ homeGoals: h, awayGoals: a, score: `${h}-${a}`, probability: p });
    }
  }

  scores.sort((a, b) => b.probability - a.probability);
  return {
    home,
    draw,
    away,
    under25,
    over25: 1 - under25,
    btts,
    topScores: scores.slice(0, 6),
    topScoresFull: scores
  };
}

function handicapProbability(scores, homeLine, side) {
  let win = 0;
  let push = 0;
  let lose = 0;

  for (const score of scores) {
    const adjustedHome = score.homeGoals + homeLine;
    const diff = adjustedHome - score.awayGoals;
    const sideDiff = side === "home" ? diff : -diff;
    if (sideDiff > 0) win += score.probability;
    else if (sideDiff === 0) push += score.probability;
    else lose += score.probability;
  }

  return { win, push, lose };
}

function edge(modelProbability, marketPrice) {
  if (typeof marketPrice !== "number") return null;
  return modelProbability - marketPrice;
}

function fairBuyPrice(modelProbability, margin = 0.035) {
  return Math.max(0.01, Math.min(0.99, modelProbability - margin));
}

function oddsFromProbability(price) {
  if (typeof price !== "number" || price <= 0 || price >= 1) {
    return {
      decimal: null,
      hongKong: null,
      american: null
    };
  }
  const decimal = 1 / price;
  const hongKong = decimal - 1;
  const american = price >= 0.5
    ? -100 * price / (1 - price)
    : 100 * (1 - price) / price;
  return {
    decimal,
    hongKong,
    american
  };
}

function refreshRecommendationPricing(recommendation, match) {
  const livePrice = recommendation.chart?.currentPrice;
  if (typeof livePrice === "number") {
    recommendation.marketPrice = livePrice;
  }

  recommendation.edge = edge(recommendation.modelProbability, recommendation.marketPrice);
  recommendation.maxBuyPrice = fairBuyPrice(recommendation.modelProbability);
  recommendation.odds = oddsFromProbability(recommendation.marketPrice);
  recommendation.baseDecision = actionFor(recommendation.edge, recommendation.marketPrice);
  recommendation.decision = gatedAction(recommendation.baseDecision, recommendation, match);
  return recommendation;
}

function translateError(message) {
  if (!message) return "未知错误";
  if (message === "timeout") return "请求超时";
  if (message.includes("fetch failed")) return "网络请求失败";
  return message;
}

function actionFor(edgeValue, marketPrice) {
  if (edgeValue == null || typeof marketPrice !== "number") {
    return { action: "WAIT", label: "无实时价格", stake: "none" };
  }
  if (edgeValue >= 0.06) return { action: "BUY", label: "强正向信号", stake: "small-medium" };
  if (edgeValue >= 0.035) return { action: "BUY_SMALL", label: "正向信号", stake: "small" };
  if (edgeValue >= 0.015) return { action: "WATCH", label: "观察价格", stake: "none" };
  if (edgeValue <= -0.035) return { action: "AVOID_OR_SELL", label: "回避", stake: "none" };
  return { action: "NO_TRADE", label: "无明确信号", stake: "none" };
}

function gatedAction(baseDecision, row, match) {
  const gate = match.tradingGate || {};
  const reasons = [];
  const hasChart = row.chart && Array.isArray(row.chart.history) && row.chart.history.length >= 2;
  const hasPrice = typeof row.marketPrice === "number";

  if (!hasPrice) {
    return {
      action: "WAIT",
      label: "等待价格",
      stake: "none",
      gated: true,
      reasons: ["盘口价格缺失"]
    };
  }

  if (!gate.allowPriceAdvice) {
    return {
      action: "WATCH",
      label: match.manualMarkets?.sourceType === "auto-baseline" ? "基线观察" : "等待真实盘口",
      stake: "none",
      gated: true,
      reasons: [match.manualMarkets?.sourceType === "auto-baseline" ? "当前为本地参考价，不是真实盘口" : "真实盘口不可用"]
    };
  }

  if (!hasChart) reasons.push("实时曲线不足");
  if (!gate.allowStrongTrade) reasons.push(...(gate.reasons || []));

  if (gate.allowStrongTrade && hasChart) {
    return {
      ...baseDecision,
      gated: false,
      reasons: gate.reasons || []
    };
  }

  if (baseDecision.action === "AVOID_OR_SELL") {
    return {
      ...baseDecision,
      gated: true,
      label: "回避",
      reasons
    };
  }

  if (baseDecision.action === "WATCH" || baseDecision.action === "NO_TRADE" || baseDecision.action === "WAIT") {
    return {
      action: baseDecision.action,
      label: baseDecision.label,
      stake: "none",
      gated: true,
      reasons
    };
  }

  return {
    action: "WATCH",
    label: gate.mode === "baseline" ? "基线观察" : "低置信观察",
    stake: "none",
    gated: true,
    reasons
  };
}

function buildRecommendations(match, probabilities) {
  const markets = match.manualMarkets || {};
  const moneyline = markets.moneyline || {};
  const totals = markets.totals || {};
  const homeMarketAliases = marketTeamAliases(match, "home");
  const awayMarketAliases = marketTeamAliases(match, "away");
  const rows = [
    {
      key: "home",
      marketType: "moneyline",
      marketTypeLabel: "胜平负",
      name: `${match.homeName}胜`,
      aliases: [`${match.homeName}胜`, match.homeName, "home", ...homeMarketAliases],
      side: "YES",
      modelProbability: probabilities.home,
      marketPrice: moneyline.home
    },
    {
      key: "draw",
      marketType: "moneyline",
      marketTypeLabel: "胜平负",
      name: "平局",
      aliases: ["平局", "draw"],
      side: "YES",
      modelProbability: probabilities.draw,
      marketPrice: moneyline.draw
    },
    {
      key: "away",
      marketType: "moneyline",
      marketTypeLabel: "胜平负",
      name: `${match.awayName}胜`,
      aliases: [`${match.awayName}胜`, match.awayName, "away", ...awayMarketAliases],
      side: "YES",
      modelProbability: probabilities.away,
      marketPrice: moneyline.away
    },
    {
      key: "under25",
      marketType: "total",
      marketTypeLabel: "大小球",
      name: "小于 2.5 球",
      aliases: ["小于 2.5 球", "under", "under 2.5"],
      side: "YES",
      modelProbability: probabilities.under25,
      marketPrice: totals.under25
    },
    {
      key: "over25",
      marketType: "total",
      marketTypeLabel: "大小球",
      name: "大于 2.5 球",
      aliases: ["大于 2.5 球", "over", "over 2.5"],
      side: "YES",
      modelProbability: probabilities.over25,
      marketPrice: totals.over25
    }
  ];

  for (const handicap of markets.handicaps || []) {
    const home = handicapProbability(probabilities.topScoresFull, handicap.homeLine, "home");
    const away = handicapProbability(probabilities.topScoresFull, handicap.homeLine, "away");
    rows.push({
      key: `${handicap.id}-home`,
      marketType: "handicap",
      marketTypeLabel: "让球",
      handicap,
      name: formatHandicapName(match.homeName, handicap.homeLine),
      shortName: `${match.homeName} ${formatLine(handicap.homeLine)}`,
      aliases: handicapAliases(match, "home", handicap.homeLine),
      side: "YES",
      modelProbability: home.win,
      pushProbability: home.push,
      marketPrice: handicap.homePrice
    });
    rows.push({
      key: `${handicap.id}-away`,
      marketType: "handicap",
      marketTypeLabel: "让球",
      handicap,
      name: formatHandicapName(match.awayName, handicap.awayLine),
      shortName: `${match.awayName} ${formatLine(handicap.awayLine)}`,
      aliases: handicapAliases(match, "away", handicap.awayLine),
      side: "YES",
      modelProbability: away.win,
      pushProbability: away.push,
      marketPrice: handicap.awayPrice
    });
  }

  return rows
    .map((row) => {
      const edgeValue = edge(row.modelProbability, row.marketPrice);
      const baseDecision = actionFor(edgeValue, row.marketPrice);
      return {
        ...row,
        edge: edgeValue,
        maxBuyPrice: fairBuyPrice(row.modelProbability),
        odds: oddsFromProbability(row.marketPrice),
        baseDecision,
        decision: gatedAction(baseDecision, row, match)
      };
    })
    .sort((a, b) => (b.edge ?? -9) - (a.edge ?? -9));
}

function marketTeamAliases(match, side) {
  const code = side === "home" ? match.home : match.away;
  const displayName = side === "home" ? match.homeName : match.awayName;
  const englishName = side === "home" ? match.homeEnglishName : match.awayEnglishName;
  return [
    code,
    displayName,
    englishName,
    TEAM_SEARCH_NAMES[code],
    TEAM_DISPLAY_NAMES_ZH[code],
    ...teamNameVariants(code, displayName)
  ]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean)
    .filter((value, index, values) => values.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index);
}

function handicapAliases(match, side, line) {
  const displayName = side === "home" ? match.homeName : match.awayName;
  const formattedLine = formatLine(line);
  const aliases = [
    formatHandicapName(displayName, line),
    `${displayName} ${formattedLine}`,
    `${displayName}${formattedLine}`
  ];
  for (const teamAlias of marketTeamAliases(match, side)) {
    aliases.push(`${teamAlias} ${formattedLine}`, `${teamAlias}${formattedLine}`);
  }
  return [...new Set(aliases.filter(Boolean))];
}

function formatLine(value) {
  if (typeof value !== "number") return "";
  return value > 0 ? `+${value}` : `${value}`;
}

function formatHandicapName(teamName, line) {
  if (typeof line !== "number") return `${teamName} 让球`;
  const absLine = Math.abs(line);
  if (line < 0) return `${teamName} 让 ${absLine} 球`;
  if (line > 0) return `${teamName} 受让 ${absLine} 球`;
  return `${teamName} 平手盘`;
}

function contextForMatch(context, matchId) {
  return context && context.matches && context.matches[matchId] ? context.matches[matchId] : {};
}

function applyDynamicAdjustments(match) {
  const baseHome = Number(match.model.lambdaHome);
  const baseAway = Number(match.model.lambdaAway);
  const context = match.context || {};
  let lambdaHome = Number.isFinite(baseHome) ? baseHome : 1.1;
  let lambdaAway = Number.isFinite(baseAway) ? baseAway : 1.1;
  const modelImpacts = [];

  for (const impact of context.modelImpacts || []) {
    const homeDelta = Number(impact.homeXgDelta || 0);
    const awayDelta = Number(impact.awayXgDelta || 0);
    if (!homeDelta && !awayDelta) continue;
    lambdaHome += homeDelta;
    lambdaAway += awayDelta;
    modelImpacts.push({
      label: impact.label || "动态调整",
      homeXgDelta: homeDelta,
      awayXgDelta: awayDelta,
      reason: impact.reason || "",
      source: impact.source || "动态情报"
    });
  }

  lambdaHome = clamp(lambdaHome, 0.15, 4.5);
  lambdaAway = clamp(lambdaAway, 0.15, 4.5);

  return {
    base: { lambdaHome: baseHome, lambdaAway: baseAway },
    adjusted: { lambdaHome, lambdaAway },
    modelImpacts
  };
}

function freshnessStatus(updatedAt, maxFreshHours) {
  if (!updatedAt) return "missing";
  return hoursSince(updatedAt) <= maxFreshHours ? "synced" : "stale";
}

function sourcedFreshnessStatus(source, fallbackUpdatedAt, maxFreshHours) {
  if (source?.status && ["queried-unconfirmed", "baseline", "rule-fallback", "coordinate-ready", "queried-low-signal"].includes(source.status)) {
    return "queried";
  }
  if (source && source.ok === false) return "missing";
  return freshnessStatus(source?.updatedAt || fallbackUpdatedAt, maxFreshHours);
}

function componentStatus(label, status, detail = "") {
  return { label, status, detail };
}

function buildCompleteness(match, polymarket) {
  const context = match.context || {};
  const lineups = context.lineups || {};
  const sources = context.sources || {};
  const sourceUpdatedAt = context.updatedAt;
  const marketUpdatedAt = match.manualMarkets && match.manualMarkets.lastUpdated;
  const hasRealMarket = match.manualMarkets?.sourceType !== "auto-baseline";
  const polymarketChartCount = (match.recommendations || []).filter((rec) => rec.chart?.source === "Polymarket" && Array.isArray(rec.chart.history) && rec.chart.history.length >= 2).length;
  const livePriceCount = (match.recommendations || []).filter((rec) => rec.chart?.source === "Polymarket" && typeof rec.chart.currentPrice === "number").length;
  const lineupStatus = lineups.status === "confirmed" ? "synced" : lineups.status === "projected" ? "stale" : lineups.queried || sources.lineups?.status === "queried-unconfirmed" ? "queried" : "missing";
  const injuryStatus = sourcedFreshnessStatus(sources.injuries, sourceUpdatedAt, 36);
  const newsStatus = sourcedFreshnessStatus(sources.teamNews, sourceUpdatedAt, 24);
  const weatherStatus = sources.weather?.status === "coordinate-ready" ? "queried" : sources.weather?.ok === false ? "missing" : freshnessStatus(context.weather?.updatedAt || sources.weather?.updatedAt, 12);
  const marketStatus = hasRealMarket || livePriceCount > 0 ? freshnessStatus(marketUpdatedAt || new Date().toISOString(), 6) : "missing";
  const polymarketStatus = polymarket && polymarket.ok && polymarketChartCount > 0 ? "synced" : polymarketChartCount > 0 ? "stale" : "missing";
  const aiStatus = sources.aiAnalysis?.status === "rule-fallback" || context.aiAnalysis?.fallback ? "queried" : sources.aiAnalysis?.ok === false ? "missing" : freshnessStatus(sources.aiAnalysis?.updatedAt || context.aiAnalysis?.updatedAt, 6);

  const components = [
    componentStatus("阵容", lineupStatus, lineups.statusLabel || "等待官方首发或可靠预计阵容"),
    componentStatus("伤停", injuryStatus, context.injurySummary || "等待公开伤停源更新"),
    componentStatus("球队新闻", newsStatus, context.teamNewsSummary || "等待公开球队新闻"),
    componentStatus("天气", weatherStatus, context.weather?.summary || "等待球场天气"),
    componentStatus("AI综合", aiStatus, context.aiAnalysis?.summary || sources.aiAnalysis?.error || "等待 OpenAI 综合分析"),
    componentStatus("盘口", marketStatus, match.manualMarkets?.source || "盘口快照缺失"),
    componentStatus("Polymarket曲线", polymarketStatus, polymarketChartCount ? `${polymarketChartCount} 条 Polymarket 曲线可用` : "未匹配到 Polymarket 实时曲线")
  ];

  const scoreByStatus = { synced: 1, stale: 0.5, queried: 0.35, missing: 0 };
  const score = components.reduce((sum, item) => sum + scoreByStatus[item.status], 0) / components.length;
  const missingCritical = components
    .filter((item) => ["阵容", "伤停", "Polymarket曲线"].includes(item.label) && item.status !== "synced")
    .map((item) => `${item.label}${item.status === "missing" ? "缺失" : item.status === "queried" ? "已查询但未确认" : "未完全确认"}`);
  const mode = lineups.status === "confirmed" && score >= 0.78
    ? "post_lineup"
    : score >= 0.66 && lineupStatus !== "missing"
      ? "dynamic"
      : "baseline";
  const modeLabel = {
    baseline: "基线预测，仅供观察",
    dynamic: "动态预测，首发未完全确认",
    post_lineup: "首发后预测"
  }[mode];
  const confidence = score >= 0.78 ? "high" : score >= 0.55 ? "medium" : "low";

  return {
    score,
    percent: Math.round(score * 100),
    confidence,
    mode,
    modeLabel,
    components,
    missingCritical
  };
}

function buildTradingGate(completeness) {
  const reasons = [];
  if (completeness.mode === "baseline") reasons.push("动态情报不足");
  if (completeness.missingCritical.length) reasons.push(...completeness.missingCritical);
  const marketComponent = completeness.components.find((item) => item.label === "盘口");

  return {
    mode: completeness.mode,
    allowPriceAdvice: marketComponent?.status !== "missing",
    allowSmallTrade: completeness.mode !== "baseline" && completeness.confidence !== "low",
    allowStrongTrade: completeness.mode === "post_lineup" && completeness.confidence === "high" && completeness.missingCritical.length === 0,
    reasons
  };
}

function marketBelongsToMatch(market, homeAliases, awayAliases, homeCode = "", awayCode = "") {
  const text = [
    market.question,
    market.slug,
    market.eventTitle,
    market.eventSlug
  ].filter(Boolean).join(" ").toLowerCase();
  const codeNeedle = `${String(homeCode || "").toLowerCase()}-${String(awayCode || "").toLowerCase()}`;
  if (codeNeedle !== "-" && text.includes(codeNeedle)) return true;
  return homeAliases.some((alias) => text.includes(alias)) && awayAliases.some((alias) => text.includes(alias));
}

function probabilityRows(match) {
  const recommendationsByKey = new Map((match.recommendations || []).map((rec) => [rec.key, rec]));
  return [
    {
      key: "home",
      label: `${match.homeName}胜`,
      probability: match.probabilities.home,
      marketPrice: match.manualMarkets?.moneyline?.home
    },
    {
      key: "draw",
      label: "平局",
      probability: match.probabilities.draw,
      marketPrice: match.manualMarkets?.moneyline?.draw
    },
    {
      key: "away",
      label: `${match.awayName}胜`,
      probability: match.probabilities.away,
      marketPrice: match.manualMarkets?.moneyline?.away
    }
  ].map((row) => ({
    ...row,
    marketPrice: recommendationsByKey.get(row.key)?.chart?.currentPrice ?? recommendationsByKey.get(row.key)?.marketPrice ?? row.marketPrice,
    marketSource: recommendationsByKey.get(row.key)?.chart?.source || "",
    edge: edge(row.probability, recommendationsByKey.get(row.key)?.chart?.currentPrice ?? recommendationsByKey.get(row.key)?.marketPrice ?? row.marketPrice)
  }));
}

function buildAiPrediction(match) {
  const rows = probabilityRows(match).sort((a, b) => b.probability - a.probability);
  const top = rows[0];
  const runnerUp = rows[1];
  const topRecommendation = (match.recommendations || []).find((rec) => rec.key === top.key);
  const positiveEdges = (match.recommendations || [])
    .filter((rec) => typeof rec.edge === "number" && rec.edge > 0)
    .slice(0, 3);
  const eliteRows = (match.recommendations || [])
    .filter((rec) => rec.eliteSummary?.count > 0)
    .map((rec) => ({
      name: rec.name,
      count: rec.eliteSummary.count,
      totalCurrentValue: rec.eliteSummary.totalCurrentValue,
      totalBought: rec.eliteSummary.totalBought,
      topTrader: rec.eliteSummary.topTrader
    }));
  const context = match.context || {};
  const riskFlags = Array.isArray(context.riskFlags) ? context.riskFlags : [];
  const reasons = [];

  reasons.push(`动态模型给出 ${top.label} ${(top.probability * 100).toFixed(1)}%，领先 ${runnerUp.label} ${((top.probability - runnerUp.probability) * 100).toFixed(1)} 个百分点。`);
  if (topRecommendation && typeof topRecommendation.edge === "number") {
    reasons.push(`对应盘口 edge 为 ${(topRecommendation.edge * 100).toFixed(1)}%，当前动作：${topRecommendation.decision?.label || "观察"}。`);
  }
  if (context.aiAnalysis?.summary) {
    reasons.push(context.aiAnalysis.summary);
  }
  if (eliteRows.length) {
    const eliteText = eliteRows.slice(0, 2).map((row) => `${row.name} 有 ${row.count} 个高手持仓，当前约 ${Math.round(row.totalCurrentValue).toLocaleString()} 美元`).join("；");
    reasons.push(`高手持仓信号：${eliteText}。`);
  }

  const lineupConfirmed = context.lineups?.status === "confirmed";
  const confidence = lineupConfirmed && match.completeness?.confidence === "high"
    ? "high"
    : match.completeness?.confidence === "low"
      ? "low"
      : "medium";
  const tradeLabel = topRecommendation?.decision?.label || "观察";
  const restrictions = match.tradingGate?.reasons?.length
    ? match.tradingGate.reasons
    : [];

  return {
    label: top.label,
    key: top.key,
    probability: top.probability,
    margin: top.probability - runnerUp.probability,
    confidence,
    tradeLabel,
    priceAdviceAllowed: Boolean(match.tradingGate?.allowPriceAdvice),
    strongTradeAllowed: Boolean(match.tradingGate?.allowStrongTrade),
    restrictions,
    rows: probabilityRows(match),
    bestEdges: positiveEdges.map((rec) => ({
      name: rec.name,
      marketTypeLabel: rec.marketTypeLabel,
      edge: rec.edge,
      modelProbability: rec.modelProbability,
      marketPrice: rec.marketPrice,
      decisionLabel: rec.decision?.label || ""
    })),
    eliteSignals: eliteRows,
    reasons: reasons.slice(0, 5),
    riskFlags: riskFlags.slice(0, 5),
    updatedAt: context.aiAnalysis?.updatedAt || context.updatedAt || new Date().toISOString()
  };
}

function formatPercent(value, digits = 1) {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "-";
}

function formatCents(value) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value * 100)}¢` : "-";
}

function recommendationMarketPriority(rec) {
  if (rec.marketType === "total") return 3;
  if (rec.marketType === "handicap") return 2;
  if (rec.marketType === "moneyline" && rec.key === "draw") return 1;
  return 0;
}

function tradableRecommendationScore(rec) {
  const edgeValue = typeof rec.edge === "number" ? rec.edge : -9;
  const holderBoost = Math.min(0.025, ((rec.eliteSummary?.count || 0) * 0.008) + ((rec.holderSummary?.eliteCount || 0) * 0.004));
  return edgeValue + holderBoost + recommendationMarketPriority(rec) * 0.003;
}

function isActionableRecommendation(rec) {
  if (typeof rec.marketPrice !== "number" || typeof rec.modelProbability !== "number") return false;
  if (rec.decision?.action === "AVOID_OR_SELL") return false;
  if (rec.edge == null || rec.edge <= 0) return false;
  return true;
}

function isPrimaryTradeCandidate(match, rec) {
  if (!isActionableRecommendation(rec)) return false;
  if (rec.marketType !== "moneyline") return true;
  if (rec.key === "draw") return false;
  const topWinKey = match.probabilities?.home >= match.probabilities?.away ? "home" : "away";
  return Boolean(
    match.tradingGate?.allowStrongTrade
    && rec.key === topWinKey
    && rec.modelProbability >= 0.48
    && rec.edge >= 0.035
  );
}

function sortedPrimaryRecommendations(match) {
  return [...(match.recommendations || [])]
    .filter((rec) => isPrimaryTradeCandidate(match, rec))
    .sort((a, b) => tradableRecommendationScore(b) - tradableRecommendationScore(a));
}

function sortedActionableRecommendations(match) {
  return [...(match.recommendations || [])]
    .filter(isActionableRecommendation)
    .sort((a, b) => tradableRecommendationScore(b) - tradableRecommendationScore(a));
}

function topRiskNotes(match, primary) {
  const notes = [];
  const restrictions = match.tradingGate?.reasons || [];
  if (restrictions.length) notes.push(`限制：${restrictions.join("、")}。`);
  if (match.autoBaseline) notes.push("本场仍有自动基线成分，盘口结论要按小仓/观察处理。");
  if (primary?.decision?.reasons?.length) notes.push(`降级原因：${primary.decision.reasons.join("、")}。`);
  const contextRisks = Array.isArray(match.context?.riskFlags) ? match.context.riskFlags : [];
  notes.push(...contextRisks.slice(0, 2));
  if (!notes.length) notes.push("按价格纪律执行；超过建议价不追。");
  return [...new Set(notes)].slice(0, 4);
}

function buildRuleTradePlan(match) {
  const primaryCandidates = sortedPrimaryRecommendations(match);
  const actionable = sortedActionableRecommendations(match);
  const avoidRows = [...(match.recommendations || [])]
    .filter((rec) => rec.decision?.action === "AVOID_OR_SELL" || (typeof rec.edge === "number" && rec.edge < -0.035))
    .sort((a, b) => (a.edge || 0) - (b.edge || 0));
  const primary = primaryCandidates[0] || null;
  const secondary = actionable.filter((rec) => rec !== primary).slice(0, 3);
  const headline = primary
    ? `${primary.name}，${formatCents(primary.marketPrice)} 附近只做${match.tradingGate?.allowStrongTrade ? "按计划" : "小仓/观察"}。`
    : "没有达到价格纪律的正向盘口，先观察。";
  const confidence = match.tradingGate?.allowStrongTrade
    ? "high"
    : match.completeness?.confidence === "low" || !primary
      ? "low"
      : "medium";
  const action = primary
    ? primary.decision?.gated
      ? "watch"
      : primary.decision?.action === "BUY" || primary.decision?.action === "BUY_SMALL"
        ? "buy"
        : "watch"
    : "avoid";
  const stake = primary
    ? match.tradingGate?.allowStrongTrade
      ? primary.decision?.stake || "small"
      : "small-watch"
    : "none";
  const entryText = primary
    ? primary.decision?.gated
      ? primary.decision?.reasons?.some((reason) => /本地参考价|不是真实盘口|真实盘口不可用|盘口价格缺失/.test(String(reason)))
        ? `当前价格只作参考；等真实盘口/曲线可用后，参考上限 ${formatCents(primary.maxBuyPrice)}，超过不追。`
        : `理想 ${formatCents(Math.min(primary.marketPrice, primary.maxBuyPrice || primary.marketPrice))} 以下；参考上限 ${formatCents(primary.maxBuyPrice)}，超过 ${formatCents(Math.max(primary.marketPrice + 0.04, primary.maxBuyPrice || primary.marketPrice))} 不追。`
      : `建议买价不高于 ${formatCents(primary.maxBuyPrice)}；超过就等待回落。`
    : "无建议买价。";

  return {
    ok: true,
    source: "rule",
    updatedAt: new Date().toISOString(),
    title: primary ? "AI 操作摘要" : "AI 观察摘要",
    action,
    confidence,
    stake,
    primary: primary ? {
      key: primary.key,
      name: primary.name,
      marketTypeLabel: primary.marketTypeLabel,
      marketPrice: primary.marketPrice,
      modelProbability: primary.modelProbability,
      edge: primary.edge,
      maxBuyPrice: primary.maxBuyPrice,
      decisionLabel: primary.decision?.label || "观察",
      source: primary.chart?.source || match.manualMarkets?.source || ""
    } : null,
    secondary: secondary.map((rec) => ({
      key: rec.key,
      name: rec.name,
      marketTypeLabel: rec.marketTypeLabel,
      marketPrice: rec.marketPrice,
      modelProbability: rec.modelProbability,
      edge: rec.edge,
      maxBuyPrice: rec.maxBuyPrice,
      decisionLabel: rec.decision?.label || "观察"
    })),
    avoid: avoidRows.slice(0, 2).map((rec) => ({
      key: rec.key,
      name: rec.name,
      marketPrice: rec.marketPrice,
      modelProbability: rec.modelProbability,
      edge: rec.edge,
      reason: rec.decision?.label || "回避"
    })),
    summary: headline,
    entryText,
    rationale: primary ? [
      `模型概率 ${formatPercent(primary.modelProbability)}，当前价格 ${formatCents(primary.marketPrice)}，edge ${formatPercent(primary.edge)}。`,
      primary.holderSummary?.count ? `该盘口公开持仓 ${primary.holderSummary.count} 人，Top holder ${primary.holderSummary.topHolder || "-"}。` : "",
      primary.eliteSummary?.count ? `足球 Top100 命中 ${primary.eliteSummary.count} 人，当前价值约 ${Math.round(primary.eliteSummary.totalCurrentValue || 0).toLocaleString()} 美元。` : ""
    ].filter(Boolean) : ["当前没有非胜平负盘口达到价格纪律；胜平负长赔只作为激进观察，不做首选。"],
    riskNotes: topRiskNotes(match, primary),
    disclaimer: "研究辅助，不自动下单；首发、伤停、盘口跳动后需要重新评估。"
  };
}

function safeJsonFromText(text) {
  const value = String(text || "").trim();
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      try {
        return JSON.parse(fenced[1]);
      } catch {
        return null;
      }
    }
    const objectMatch = value.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function extractOpenAiText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const parts = [];
  for (const item of data?.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") parts.push(content.text);
    }
  }
  if (typeof data?.choices?.[0]?.message?.content === "string") parts.push(data.choices[0].message.content);
  return parts.join("\n");
}

function openAiEndpoint(config) {
  if (/\/v1\/responses$/.test(config.baseUrl)) return config.baseUrl;
  if (/\/v1$/.test(config.baseUrl)) return `${config.baseUrl}/responses`;
  return `${config.baseUrl}/v1/responses`;
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      setTimeout(() => resolve({ ok: false, error: `${label || "operation"} timeout` }), ms);
    })
  ]);
}

function normalizeAiTradePlan(raw, fallback) {
  if (!raw || typeof raw !== "object") return fallback;
  const primaryName = String(raw.primaryName || raw.primary?.name || fallback.primary?.name || "").slice(0, 80);
  return {
    ...fallback,
    source: "openai",
    model: String(raw.model || fallback.model || "").slice(0, 80),
    title: String(raw.title || fallback.title || "AI 操作摘要").slice(0, 40),
    action: ["buy", "watch", "avoid", "wait"].includes(raw.action) ? raw.action : fallback.action,
    confidence: ["low", "medium", "high"].includes(raw.confidence) ? raw.confidence : fallback.confidence,
    stake: String(raw.stake || fallback.stake || "small-watch").slice(0, 40),
    summary: String(raw.summary || fallback.summary || "").slice(0, 220),
    entryText: String(raw.entryText || fallback.entryText || "").slice(0, 180),
    primaryName: primaryName || undefined,
    rationale: Array.isArray(raw.rationale)
      ? raw.rationale.map((item) => String(item).slice(0, 160)).filter(Boolean).slice(0, 4)
      : fallback.rationale,
    riskNotes: Array.isArray(raw.riskNotes)
      ? raw.riskNotes.map((item) => String(item).slice(0, 160)).filter(Boolean).slice(0, 4)
      : fallback.riskNotes,
    disclaimer: fallback.disclaimer,
    updatedAt: new Date().toISOString()
  };
}

async function fetchAiTradePlans(matches) {
  if (!AI_TRADE_PLAN_ENABLED || !matches?.length) return new Map();
  const config = await getOpenAiConfig();
  if (!config.apiKey) return new Map();
  const fallbackById = new Map(matches.map((match) => [match.id, match.aiTradePlan]));
  const prompt = {
    task: "为世界杯比赛看板生成每场比赛的中文操作摘要。只根据给定结构化模型、盘口、持仓、动态情报状态输出，不要编造新数据，不要承诺收益，不要自动下单。",
    output: "返回 JSON：{plans:[{matchId,title,action,confidence,stake,summary,entryText,rationale:[...],riskNotes:[...]}]}",
    rules: [
      "action 只能是 buy/watch/avoid/wait。",
      "首发未确认或强交易不允许时，不要写重仓、强买入、梭哈等表达。",
      "胜平负长赔冷门和平局不能作为首选；除非该方向是模型最高概率、概率至少48%、且强交易闸门打开，否则只能写激进小注/观察。首选优先让球或大小球。",
      "如果没有实时价格或曲线，写等待/观察，不给硬价格。",
      "summary 要像给人看的短结论，例如：首选小于2.5球，49¢附近可观察，小仓，不追高。",
      "entryText 必须包含明确价格纪律或等待条件。"
    ],
    matches: matches.map((match) => ({
      matchId: match.id,
      matchup: `${match.homeName} vs ${match.awayName}`,
      kickoffShanghai: match.kickoffShanghai,
      mode: match.completeness?.modeLabel,
      confidence: match.completeness?.confidence,
      tradingGate: match.tradingGate,
      aiPrediction: {
        label: match.aiPrediction?.label,
        probability: match.aiPrediction?.probability,
        tradeLabel: match.aiPrediction?.tradeLabel,
        restrictions: match.aiPrediction?.restrictions
      },
      topScores: (match.probabilities?.topScores || []).slice(0, 5),
      candidates: (match.aiTradePlan?.primary ? [match.aiTradePlan.primary, ...(match.aiTradePlan.secondary || [])] : [])
        .map((rec) => ({
          name: rec.name,
          type: rec.marketTypeLabel,
          modelProbability: rec.modelProbability,
          marketPrice: rec.marketPrice,
          edge: rec.edge,
          maxBuyPrice: rec.maxBuyPrice,
          decision: rec.decisionLabel
        })),
      avoid: match.aiTradePlan?.avoid || [],
      context: {
        aiSummary: match.context?.aiAnalysis?.summary,
        riskFlags: match.context?.riskFlags,
        recentForm: match.context?.recentForm,
        weather: match.context?.weather?.summary
      }
    }))
  };

  const result = await withTimeout(timedFetchJson(openAiEndpoint(config), {
    method: "POST",
    timeoutMs: AI_TRADE_PLAN_TIMEOUT_MS,
    headers: {
      "authorization": `Bearer ${config.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      max_output_tokens: 1600,
      reasoning: { effort: "none" },
      input: [
        {
          role: "system",
          content: "你只输出 JSON，不输出 Markdown。你是保守的赛事研究助手，只能做决策辅助，不能承诺收益或自动下单。"
        },
        {
          role: "user",
          content: JSON.stringify(prompt)
        }
      ]
    })
  }), AI_TRADE_PLAN_TIMEOUT_MS + 500, "AI trade plan");
  if (!result.ok) {
    console.error(`AI trade plan unavailable: ${result.error}`);
    return new Map();
  }
  const parsed = safeJsonFromText(extractOpenAiText(result.data));
  const plans = Array.isArray(parsed?.plans) ? parsed.plans : [];
  const out = new Map();
  for (const plan of plans) {
    const matchId = String(plan.matchId || "");
    if (!fallbackById.has(matchId)) continue;
    out.set(matchId, normalizeAiTradePlan({ ...plan, model: config.model }, fallbackById.get(matchId)));
  }
  return out;
}

function normalizeAiHumanRead(raw, fallback) {
  if (!raw || typeof raw !== "object") return fallback;
  return {
    ...fallback,
    source: "openai",
    title: String(raw.title || fallback.title || "人类对位复核").slice(0, 40),
    summary: String(raw.summary || fallback.summary || "").slice(0, 260),
    notes: Array.isArray(raw.notes)
      ? raw.notes.map((item) => String(item).slice(0, 180)).filter(Boolean).slice(0, 5)
      : fallback.notes,
    limits: Array.isArray(raw.limits)
      ? raw.limits.map((item) => String(item).slice(0, 180)).filter(Boolean).slice(0, 4)
      : fallback.limits,
    updatedAt: new Date().toISOString()
  };
}

async function fetchAiHumanReads(matches) {
  if (!AI_TRADE_PLAN_ENABLED || !matches?.length) return new Map();
  const config = await getOpenAiConfig();
  if (!config.apiKey) return new Map();
  const fallbackById = new Map(matches.map((match) => [match.id, match.humanMatchup?.aiRead]));
  const prompt = {
    task: "为世界杯看板生成每场比赛的中文'人类对位复核'。只能基于给定的身高、GK/DF/MF/FW proxy、俱乐部分层和已有限制说明，不要编造身价、扑救率、伤停或首发。",
    output: "返回 JSON：{reads:[{matchId,title,summary,notes:[...],limits:[...]}]}",
    rules: [
      "不要写下注、买入、赚钱、梭哈等交易动作。",
      "如果某项只是 proxy，必须说清楚是 proxy，不是官方能力评分。",
      "summary 用一两句话说明这场从身体、门将、后防、中场、锋线角度最值得复核什么。",
      "notes 给 2-4 条具体观察，例如高空球、定位球、中场控制、锋线转化、门将身高/经验。",
      "缺失身价时明确说身价未接入，不要猜身价。"
    ],
    matches: matches.map((match) => ({
      matchId: match.id,
      matchup: `${match.homeName} vs ${match.awayName}`,
      summary: match.humanMatchup?.summary,
      insights: (match.humanMatchup?.insights || []).map((item) => ({
        label: item.label,
        side: item.side,
        value: item.valueText,
        text: item.zh
      })),
      homeProfile: {
        team: match.homeName,
        groups: match.homeTeam?.squadProfile?.groups,
        marketValue: match.homeTeam?.squadProfile?.marketValue
      },
      awayProfile: {
        team: match.awayName,
        groups: match.awayTeam?.squadProfile?.groups,
        marketValue: match.awayTeam?.squadProfile?.marketValue
      },
      limits: match.humanMatchup?.limits
    }))
  };

  const result = await withTimeout(timedFetchJson(openAiEndpoint(config), {
    method: "POST",
    timeoutMs: AI_TRADE_PLAN_TIMEOUT_MS,
    headers: {
      "authorization": `Bearer ${config.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      max_output_tokens: 1800,
      reasoning: { effort: "none" },
      input: [
        {
          role: "system",
          content: "你只输出 JSON，不输出 Markdown。你是谨慎的足球研究助手，只能基于给定结构化数据做对位复核，不能编造数据。"
        },
        {
          role: "user",
          content: JSON.stringify(prompt)
        }
      ]
    })
  }), AI_TRADE_PLAN_TIMEOUT_MS + 500, "AI human matchup");
  if (!result.ok) {
    console.error(`AI human matchup unavailable: ${result.error}`);
    return new Map();
  }
  const parsed = safeJsonFromText(extractOpenAiText(result.data));
  const reads = Array.isArray(parsed?.reads) ? parsed.reads : [];
  const out = new Map();
  for (const read of reads) {
    const matchId = String(read.matchId || "");
    if (!fallbackById.has(matchId)) continue;
    out.set(matchId, normalizeAiHumanRead(read, fallbackById.get(matchId) || {}));
  }
  return out;
}

async function attachAiPredictions(matches, { useOpenAi = true } = {}) {
  for (const match of matches || []) {
    match.aiPrediction = buildAiPrediction(match);
    match.aiTradePlan = buildRuleTradePlan(match);
    match.humanMatchup = match.humanMatchup || buildHumanMatchup(match);
    match.humanMatchup.aiRead = {
      source: "rule",
      title: "人类对位复核",
      summary: match.humanMatchup.summary,
      notes: (match.humanMatchup.insights || []).slice(0, 4).map((item) => item.zh).filter(Boolean),
      limits: match.humanMatchup.limits || [],
      updatedAt: new Date().toISOString()
    };
  }
  if (!useOpenAi) return;
  try {
    const aiPlans = await fetchAiTradePlans(matches || []);
    for (const match of matches || []) {
      if (aiPlans.has(match.id)) match.aiTradePlan = aiPlans.get(match.id);
    }
  } catch (error) {
    console.error(`Failed to attach AI trade plans: ${error.message}`);
  }
  try {
    const aiReads = await fetchAiHumanReads(matches || []);
    for (const match of matches || []) {
      if (aiReads.has(match.id)) match.humanMatchup.aiRead = aiReads.get(match.id);
    }
  } catch (error) {
    console.error(`Failed to attach AI human matchup reads: ${error.message}`);
  }
}

async function fetchFinalResults() {
  try {
    await ensureHistorySchema();
    const raw = await runSql("SELECT match_id, home_goals, away_goals, status, finished_at, result_key, result_label FROM match_results WHERE status = 'final';", [], "all");
    return new Map((JSON.parse(raw || "[]") || []).map((row) => [row.match_id, row]));
  } catch (error) {
    console.error(`Failed to read match results: ${error.message}`);
    return new Map();
  }
}

function matchScheduleKey(homeName, awayName) {
  const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  return [normalize(homeName), normalize(awayName)].sort().join(":");
}

function scheduleEventKey(event) {
  return matchScheduleKey(event.home?.name || event.homeName, event.away?.name || event.awayName);
}

function normalizedVenueInfo(rawVenue = {}) {
  const address = rawVenue.address || {};
  return {
    id: String(rawVenue.id || ""),
    name: rawVenue.fullName || rawVenue.name || "",
    city: address.city || "",
    country: address.country || ""
  };
}

function venueLabel(venueInfo = {}) {
  return [venueInfo.name, venueInfo.city, venueInfo.country].filter(Boolean).join(", ") || "待确认";
}

function isVisibleModeledMatch(match, scheduleByKey, finalResults, nowMs = Date.now()) {
  if (hasRecordedFinal(match.id, finalResults)) return false;
  const schedule = scheduleByKey.get(matchScheduleKey(TEAM_SEARCH_NAMES[match.home] || match.homeName, TEAM_SEARCH_NAMES[match.away] || match.awayName));
  if (schedule?.completed || isFinishedStatus(schedule?.status)) return false;
  return shouldKeepScheduledMatch(match.kickoffShanghai, schedule, nowMs);
}

function h2hPairKeys(home, away) {
  const homeCode = String(home || "").toUpperCase();
  const awayCode = String(away || "").toUpperCase();
  return [`${homeCode}-${awayCode}`, `${awayCode}-${homeCode}`, [homeCode, awayCode].sort().join("-")].filter(Boolean);
}

function findH2hOverride(home, away, h2hOverrides = {}) {
  const pairs = h2hOverrides?.pairs || {};
  for (const key of h2hPairKeys(home, away)) {
    if (pairs[key]) return pairs[key];
  }
  return null;
}

function h2hDateMs(date) {
  const ms = new Date(`${date || ""}T12:00:00Z`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function h2hWindow(kickoffIso) {
  const kickoff = new Date(kickoffIso || Date.now());
  const kickoffMs = Number.isFinite(kickoff.getTime()) ? kickoff.getTime() : Date.now();
  const windowEnd = new Date(kickoffMs);
  const windowStart = new Date(kickoffMs);
  windowStart.setUTCFullYear(windowStart.getUTCFullYear() - 4);
  return {
    startMs: windowStart.getTime(),
    endMs: kickoffMs,
    windowStart: windowStart.toISOString().slice(0, 10),
    windowEnd: windowEnd.toISOString().slice(0, 10),
    asOf: new Date(kickoffMs - 1000).toISOString()
  };
}

function h2hTeamName(code) {
  const normalized = String(code || "").toUpperCase();
  return TEAM_DISPLAY_NAMES_ZH[normalized] || TEAM_SEARCH_NAMES[normalized] || normalized;
}

function h2hMeetingGoalsFor(meeting, code) {
  const normalized = String(code || "").toUpperCase();
  if (String(meeting.home || "").toUpperCase() === normalized) return Number(meeting.homeGoals);
  if (String(meeting.away || "").toUpperCase() === normalized) return Number(meeting.awayGoals);
  return null;
}

function uniqueSources(sources) {
  const seen = new Set();
  return sources.filter((source) => {
    const key = `${source.url || ""}|${source.name || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function h2hFromOverride(event, h2hOverrides, fifaRankings) {
  const home = eventTeamCode(event, "home");
  const away = eventTeamCode(event, "away");
  const override = findH2hOverride(home, away, h2hOverrides);
  if (!override) return null;

  const window = h2hWindow(event.kickoffUtc);
  const allMeetings = (Array.isArray(override.meetings) ? override.meetings : [])
    .filter((meeting) => h2hDateMs(meeting.date) !== null)
    .sort((a, b) => h2hDateMs(b.date) - h2hDateMs(a.date));
  const recentMeetings = allMeetings.filter((meeting) => {
    const ms = h2hDateMs(meeting.date);
    return ms >= window.startMs && ms < window.endMs;
  });
  const summary = {
    matches: recentMeetings.length,
    homeWins: 0,
    draws: 0,
    awayWins: 0,
    homeGoals: 0,
    awayGoals: 0
  };
  recentMeetings.forEach((meeting) => {
    const homeGoals = h2hMeetingGoalsFor(meeting, home);
    const awayGoals = h2hMeetingGoalsFor(meeting, away);
    if (!Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) return;
    summary.homeGoals += homeGoals;
    summary.awayGoals += awayGoals;
    if (homeGoals > awayGoals) summary.homeWins += 1;
    else if (homeGoals < awayGoals) summary.awayWins += 1;
    else summary.draws += 1;
  });
  const homeRank = rankingForTeam(home, fifaRankings).rank;
  const awayRank = rankingForTeam(away, fifaRankings).rank;
  const rankingText = homeRank && awayRank
    ? `长期实力基线：${eventTeamName(event, "home")} FIFA 第 ${homeRank}，${eventTeamName(event, "away")} FIFA 第 ${awayRank}。`
    : "长期实力基线部分可用。";
  const sources = uniqueSources([
    ...(Array.isArray(override.sources) ? override.sources : []),
    ...allMeetings.map((meeting) => ({
      name: meeting.source || "结构化 H2H 来源",
      url: meeting.sourceUrl || "",
      status: "verified"
    }))
  ]).map((source) => ({ ...source, status: source.status || "verified" }));

  return {
    windowYears: 4,
    windowStart: window.windowStart,
    windowEnd: window.windowEnd,
    asOf: window.asOf,
    scope: override.scope || "赛前四年正式 A 级国际赛和友谊赛",
    summary,
    latestMeetings: recentMeetings.slice(0, 5).map((meeting) => ({
      date: meeting.date,
      competition: meeting.competition || "",
      home: h2hTeamName(meeting.home),
      away: h2hTeamName(meeting.away),
      score: `${meeting.homeGoals}-${meeting.awayGoals}`,
      source: meeting.source || ""
    })),
    allTimeNote: override.allTimeNote || "已读取结构化 H2H 来源；未记录历史交手时不把未知当成 0 场。",
    impact: summary.matches > 0
      ? `${rankingText} 近四年有 ${summary.matches} 场直接交手；样本很小，只做低权重复核，不单独大幅调整模型。`
      : `${rankingText} 近四年无可确认直接交手，模型不对胜平负、让球盘或大小球做交手加权。`,
    sourceStatus: summary.matches > 0 ? "verified-structured" : "verified-no-pre-match-meetings",
    sources,
    updatedAt: new Date().toISOString()
  };
}

function scheduleAutoBaselineFromEvent(event, modeledKeys, finalResults, polymarket, context, fifaRankings, worldCupRecords, squadProfiles, h2hOverrides, nowMs = Date.now()) {
  const kickoffMs = dateMs(event.kickoffUtc);
  if (!kickoffMs || !shouldKeepScheduledMatch(event.kickoffUtc, event, nowMs)) return null;
  if (event.completed || isFinishedStatus(event.status)) return null;
  const key = scheduleEventKey(event);
  if (modeledKeys.has(key)) return null;
  if (hasRecordedFinal(event.scheduleId, finalResults)) return null;

  const homeTeam = scheduleTeamRecord(event.home, fifaRankings, worldCupRecords, squadProfiles);
  const awayTeam = scheduleTeamRecord(event.away, fifaRankings, worldCupRecords, squadProfiles);
  const { lambdaHome, lambdaAway } = autoBaselineLambda(homeTeam.rating, awayTeam.rating);
  const id = `schedule-${event.scheduleId || key}`;
  const syncedContext = contextForMatch(context, id);
  const mergedContext = deepMerge(scheduleAutoBaselineContext(event, fifaRankings), syncedContext);
  const fallbackHeadToHead = h2hFromOverride(event, h2hOverrides, fifaRankings);
  const venue = venueLabel(event.venue);
  const baseMatch = {
    id,
    autoBaseline: true,
    scheduleStatus: event.status || "STATUS_SCHEDULED",
    scheduleStatusDetail: event.statusDetail || "Scheduled",
    scheduleSource: event.source,
    homeName: eventTeamName(event, "home"),
    awayName: eventTeamName(event, "away"),
    homeEnglishName: eventTeamSearchName(event, "home"),
    awayEnglishName: eventTeamSearchName(event, "away"),
    home: eventTeamCode(event, "home"),
    away: eventTeamCode(event, "away"),
    homeTeam,
    awayTeam,
    recentFormRecords: mergedContext.recentFormRecords,
    group: "待确认",
    venue,
    venueInfo: event.venue || {},
    matchday: "-",
    kickoffLocal: event.kickoffUtc,
    kickoffShanghai: new Date(kickoffMs).toISOString(),
    model: {
      lambdaHome,
      lambdaAway,
      manualAdjustments: [
        {
          label: "赛程自动基线",
          impact: "用保守球队评分生成初始 xG；待静态研究、动态情报和盘口映射补齐后替换。"
        }
      ]
    },
    dynamic: {
      status: "赛程自动基线；已纳入公开源检索，未确认动态事实按低置信处理。",
      injurySummary: "已查询公开源，未确认重大伤停前不开放强信号。",
      weatherSummary: venue && event.venue?.name && VENUE_COORDINATES[event.venue.name]
        ? `${VENUE_COORDINATES[event.venue.name].label} 场馆坐标已配置，等待天气同步。`
        : "天气未同步时不调整总进球。",
      lineupConfidence: "低",
      lastChecked: new Date().toISOString()
    },
    headToHead: syncedContext.headToHead || fallbackHeadToHead || {
      windowYears: 4,
      windowStart: String(new Date(event.kickoffUtc).getUTCFullYear() - 4),
      windowEnd: String(new Date(event.kickoffUtc).getUTCFullYear()),
      scope: "近四年公开交手检索",
      summary: {
        matches: null,
        homeWins: null,
        draws: null,
        awayWins: null,
        homeGoals: null,
        awayGoals: null
      },
      latestMeetings: [],
      allTimeNote: "赛程自动基线已纳入 H2H 同步队列；未解析成可审计比分前不做数值加权。",
      impact: "交手资料待核验，模型不做交手加权。",
      sourceStatus: "queued",
      sources: [
        {
          name: "公开 H2H 检索",
          url: "",
          status: "queued"
        }
      ],
      updatedAt: new Date().toISOString()
    },
    context: mergedContext
  };
  baseMatch.humanMatchup = buildHumanMatchup(baseMatch);
  baseMatch.dynamicModel = applyDynamicAdjustments(baseMatch);
  baseMatch.probabilities = scoreModel(baseMatch.dynamicModel.adjusted.lambdaHome, baseMatch.dynamicModel.adjusted.lambdaAway);
  baseMatch.manualMarkets = autoBaselineManualMarkets(baseMatch, baseMatch.probabilities);
  baseMatch.recommendations = [];
  baseMatch.completeness = buildCompleteness(baseMatch, polymarket);
  baseMatch.tradingGate = buildTradingGate(baseMatch.completeness);
  baseMatch.recommendations = buildRecommendations(baseMatch, baseMatch.probabilities);
  return baseMatch;
}

function filterAndAugmentMatches(matches, schedule, finalResults, polymarket, context, fifaRankings, worldCupRecords, squadProfiles, h2hOverrides) {
  const nowMs = Date.now();
  const scheduleByKey = new Map((schedule.matches || []).map((event) => [scheduleEventKey(event), event]));
  const visibleModeled = matches.filter((match) => isVisibleModeledMatch(match, scheduleByKey, finalResults, nowMs));
  const modeledKeys = new Set(visibleModeled.map((match) => matchScheduleKey(TEAM_SEARCH_NAMES[match.home] || match.homeName, TEAM_SEARCH_NAMES[match.away] || match.awayName)));
  const autoBaseline = (schedule.matches || [])
    .map((event) => scheduleAutoBaselineFromEvent(event, modeledKeys, finalResults, polymarket, context, fifaRankings, worldCupRecords, squadProfiles, h2hOverrides, nowMs))
    .filter(Boolean);
  const combined = [...visibleModeled, ...autoBaseline]
    .sort((a, b) => (dateMs(a.kickoffShanghai) || 0) - (dateMs(b.kickoffShanghai) || 0));

  return {
    matches: combined,
    visibility: {
      windowDays: MATCH_WINDOW_DAYS,
      hideAfterHours: MATCH_HIDE_AFTER_HOURS,
      liveGraceHours: MATCH_LIVE_GRACE_HOURS,
      scheduleLookbackDays: MATCH_SCHEDULE_LOOKBACK_DAYS,
      modeledTotal: matches.length,
      modeledVisible: visibleModeled.length,
      autoBaseline: autoBaseline.length,
      hiddenModeled: matches.length - visibleModeled.length,
      completedResults: finalResults.size,
      source: schedule.source,
      ok: schedule.ok,
      error: schedule.error,
      lastUpdated: schedule.lastUpdated
    }
  };
}

function normalizeMatch(match, teams, context, polymarket, worldCupRecords, squadProfiles) {
  const homeTeam = attachStaticProfiles(teams[match.home], match.home, worldCupRecords, squadProfiles);
  const awayTeam = attachStaticProfiles(teams[match.away], match.away, worldCupRecords, squadProfiles);
  const matchContext = contextForMatch(context, match.id);
  const mergedMatch = deepMerge(match, { context: matchContext });
  const dynamicModel = applyDynamicAdjustments(mergedMatch);
  const probabilities = scoreModel(dynamicModel.adjusted.lambdaHome, dynamicModel.adjusted.lambdaAway);
  const enriched = {
    ...mergedMatch,
    homeName: homeTeam.name,
    awayName: awayTeam.name,
    homeTeam,
    awayTeam,
    headToHead: matchContext.headToHead || mergedMatch.headToHead,
    recentFormRecords: matchContext.recentFormRecords || mergedMatch.recentFormRecords,
    probabilities,
    dynamicModel
  };
  enriched.humanMatchup = buildHumanMatchup(enriched);
  const withInitialRecommendations = {
    ...enriched,
    recommendations: []
  };
  withInitialRecommendations.completeness = buildCompleteness(withInitialRecommendations, polymarket);
  withInitialRecommendations.tradingGate = buildTradingGate(withInitialRecommendations.completeness);
  return {
    ...withInitialRecommendations,
    recommendations: buildRecommendations(withInitialRecommendations, probabilities)
  };
}

function attachMarketCharts(matches, polymarket) {
  const tokenCatalog = buildTokenCatalog(polymarket);
  const now = Math.floor(Date.now() / 1000);
  for (const match of matches) {
    for (const recommendation of match.recommendations) {
      const token = findChartToken(match, recommendation, tokenCatalog);
      if (token) {
        recommendation.chart = {
          source: "Polymarket",
          marketId: token.marketId,
          conditionId: token.conditionId,
          tokenId: token.tokenId,
          marketQuestion: token.marketQuestion,
          label: token.label,
          currentPrice: token.currentPrice,
          history: token.history || []
        };
      } else {
        const localHistory = localHistoryForRecommendation(match, recommendation);
        recommendation.chart = {
          source: "本地盘口快照",
          marketQuestion: "本地盘口基线",
          label: recommendation.name,
          currentPrice: recommendation.marketPrice,
          history: localHistory.length >= 2 ? localHistory : [],
          status: localHistory.length >= 2 ? "local-history" : "price-only"
        };
      }
    }
    match.completeness = buildCompleteness(match, polymarket);
    match.tradingGate = buildTradingGate(match.completeness);
    for (const recommendation of match.recommendations) {
      refreshRecommendationPricing(recommendation, match);
    }
    match.completeness = buildCompleteness(match, polymarket);
    match.tradingGate = buildTradingGate(match.completeness);
    for (const recommendation of match.recommendations) {
      recommendation.decision = gatedAction(recommendation.baseDecision, recommendation, match);
    }
  }
}

function localHistoryForRecommendation(match, recommendation) {
  const history = match.manualMarkets && match.manualMarkets.history ? match.manualMarkets.history : {};
  const raw = history[recommendation.key] || [];
  return raw
    .map((point) => ({
      t: typeof point.t === "number" ? point.t : Math.floor(new Date(point.t).getTime() / 1000),
      p: Number(point.p)
    }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.p));
}

function buildTokenCatalog(polymarket) {
  if (!polymarket || !Array.isArray(polymarket.markets)) return [];
  return polymarket.markets.flatMap((market) => (market.tokens || []).map((token) => ({
    marketId: market.id || "",
    conditionId: market.conditionId || "",
    marketQuestion: market.question || "",
    marketSlug: market.slug || "",
    marketQuestionText: `${market.question || ""}`.toLowerCase(),
    marketCoreText: `${market.question || ""} ${market.slug || ""}`.toLowerCase(),
    eventTitle: market.eventTitle || "",
    eventSlug: market.eventSlug || "",
    marketText: `${market.question || ""} ${market.slug || ""} ${market.eventTitle || ""} ${market.eventSlug || ""}`.toLowerCase(),
    label: token.label || "",
    labelText: String(token.label || "").toLowerCase(),
    tokenId: token.tokenId || "",
    currentPrice: token.currentPrice,
    history: token.history || []
  })));
}

function findChartToken(match, recommendation, tokens) {
  const homeAliases = teamNameVariants(match.home, match.homeName);
  const awayAliases = teamNameVariants(match.away, match.awayName);
  const aliases = (recommendation.aliases || []).map((alias) => String(alias).toLowerCase());
  const sameMatchTokens = tokens.filter((token) => tokenBelongsToMatch(token, homeAliases, awayAliases));
  const matchTokens = tokens.filter((token) => {
    const text = token.marketText;
    return tokenBelongsToMatch(token, homeAliases, awayAliases)
      || homeAliases.some((alias) => text.includes(alias))
      || awayAliases.some((alias) => text.includes(alias))
      || aliases.some((alias) => alias && text.includes(alias));
  });

  if (!matchTokens.length) return null;

  if (recommendation.marketType === "moneyline") {
    if (recommendation.key === "draw") {
      return sameMatchTokens.find((token) => {
        const text = `${token.marketText} ${token.labelText}`;
        return !isSpreadOrTotalToken(token) && (text.includes("draw") || text.includes("平")) && token.labelText.includes("yes");
      }) || sameMatchTokens.find((token) => !isSpreadOrTotalToken(token) && (token.labelText.includes("draw") || token.labelText.includes("平"))) || null;
    }
    const teamAliases = recommendation.key === "home" ? homeAliases : awayAliases;
    return sameMatchTokens.find((token) => {
      const text = `${token.marketQuestionText} ${token.labelText}`;
      return !isSpreadOrTotalToken(token) && teamAliases.some((team) => token.marketQuestionText.includes(team)) && token.marketQuestionText.includes("win") && token.labelText.includes("yes");
    }) || sameMatchTokens.find((token) => !isSpreadOrTotalToken(token) && aliasesMatchText(teamAliases, token.labelText)) || null;
  }

  if (recommendation.marketType === "total") {
    const needle = recommendation.key === "under25" ? "under" : "over";
    return sameMatchTokens.find((token) => token.labelText.includes(needle))
      || sameMatchTokens.find((token) => `${token.marketText} ${token.labelText}`.includes(needle)) || null;
  }

  if (recommendation.marketType === "handicap") {
    const lineAliases = aliases.map((alias) => alias.replace(/\s+/g, ""));
    const teamAliases = recommendation.key.endsWith("-home") ? homeAliases : awayAliases;
    return sameMatchTokens.find((token) => {
      const compactText = `${token.marketText} ${token.labelText}`.replace(/\s+/g, "");
      return lineAliases.some((alias) => alias && compactText.includes(alias));
    }) || sameMatchTokens.find((token) => {
      const text = `${token.marketText} ${token.labelText}`;
      return aliasesMatchText(teamAliases, text) && lineMatchesText(recommendation.handicap, recommendation.key, text);
    }) || null;
  }

  return null;
}

function aliasesMatchText(aliases, text) {
  const normalizedText = String(text || "").toLowerCase();
  return (aliases || []).some((alias) => {
    const normalizedAlias = String(alias || "").toLowerCase().trim();
    if (!normalizedAlias) return false;
    return normalizedText === normalizedAlias || normalizedText.includes(normalizedAlias);
  });
}

function lineMatchesText(handicap, recommendationKey, text) {
  if (!handicap) return false;
  const line = recommendationKey.endsWith("-away") ? handicap.awayLine : handicap.homeLine;
  if (typeof line !== "number") return false;
  const normalizedText = String(text || "").toLowerCase().replace(/\s+/g, "");
  const signed = formatLine(line);
  const unsigned = String(Math.abs(line));
  const variants = [
    signed,
    signed.replace("+", "plus"),
    signed.replace("-", "minus"),
    line < 0 ? `-${unsigned}` : `+${unsigned}`
  ].map((value) => String(value).toLowerCase().replace(/\s+/g, ""));
  return variants.some((variant) => variant && normalizedText.includes(variant));
}

function isSpreadOrTotalToken(token) {
  const text = `${token?.marketText || ""} ${token?.marketQuestionText || ""} ${token?.marketSlug || ""}`;
  return text.includes("spread") || text.includes("o/u") || text.includes("-total-") || text.includes("-spread-");
}

function tokenBelongsToMatch(token, homeAliases, awayAliases) {
  const text = token.marketText;
  return homeAliases.some((alias) => text.includes(alias)) && awayAliases.some((alias) => text.includes(alias));
}

function teamNameVariants(teamCode, displayName) {
  const base = [
    teamCode,
    displayName,
    TEAM_SEARCH_NAMES[teamCode]
  ].filter(Boolean).map((item) => String(item).toLowerCase());
  const extra = {
    MEX: ["mexico"],
    RSA: ["south africa"],
    KOR: ["south korea", "korea"],
    CZE: ["czechia", "czech republic", "czech"],
    USA: ["united states", "usa", "usmnt"],
    BIH: ["bosnia-herzegovina", "bosnia and herzegovina", "bosnia"],
    SUI: ["switzerland", "swiss"],
    TUR: ["turkiye", "türkiye", "turkey"],
    CUW: ["curacao", "curaçao"],
    CIV: ["ivory coast", "cote d'ivoire", "côte d'ivoire"],
    KSA: ["saudi arabia", "saudi"],
    CPV: ["cape verde", "cabo verde", "cvi"],
    NED: ["netherlands", "holland"],
    GER: ["germany"],
    BRA: ["brazil"],
    MAR: ["morocco"],
    CAN: ["canada"],
    PAR: ["paraguay"],
    QAT: ["qatar"],
    HAI: ["haiti"],
    SCO: ["scotland"],
    AUS: ["australia"],
    JPN: ["japan"],
    ECU: ["ecuador"],
    SWE: ["sweden"],
    TUN: ["tunisia"],
    ESP: ["spain"],
    BEL: ["belgium"],
    EGY: ["egypt"],
    URU: ["uruguay"],
    IRN: ["iran"],
    NZL: ["new zealand"],
    COD: ["congo dr", "dr congo", "congo", "drc", "democratic republic of congo"]
  }[teamCode] || [];
  return [...new Set([...base, ...extra].filter(Boolean))];
}

function eventTeamName(event, side) {
  const code = eventTeamCode(event, side);
  return TEAM_DISPLAY_NAMES_ZH[code] || event?.[side]?.name || "TBD";
}

function eventTeamSearchName(event, side) {
  const code = eventTeamCode(event, side);
  return TEAM_SEARCH_NAMES[code] || event?.[side]?.name || "TBD";
}

function eventTeamCode(event, side) {
  return String(event?.[side]?.code || "").toUpperCase();
}

function teamRatingForScheduleTeam(team) {
  const code = String(team?.code || "").toUpperCase();
  return AUTO_BASELINE_RATINGS[code] || AUTO_BASELINE_DEFAULT_RATING;
}

function rankingForTeam(code, fifaRankings) {
  const normalizedCode = String(code || "").toUpperCase();
  const rank = Number(fifaRankings?.rankings?.[normalizedCode]);
  if (Number.isFinite(rank) && rank > 0) {
    return {
      rank,
      status: "synced",
      source: fifaRankings.source || "FIFA/Coca-Cola Men's World Ranking",
      sourceUrl: fifaRankings.sourceUrl || "https://inside.fifa.com/fifa-world-ranking/men",
      updatedAt: fifaRankings.updatedAt || "",
      nextUpdateAt: fifaRankings.nextUpdateAt || "",
      note: fifaRankings.notes || ""
    };
  }
  return {
    rank: null,
    status: "missing",
    source: fifaRankings?.source || "FIFA/Coca-Cola Men's World Ranking",
    sourceUrl: fifaRankings?.sourceUrl || "https://inside.fifa.com/fifa-world-ranking/men",
    updatedAt: fifaRankings?.updatedAt || "",
    nextUpdateAt: fifaRankings?.nextUpdateAt || "",
    note: "排名快照未覆盖该队，请刷新 data/fifa-rankings.json。"
  };
}

function worldCupRecordForTeam(code, worldCupRecords) {
  const normalizedCode = String(code || "").toUpperCase();
  const record = worldCupRecords?.records?.[normalizedCode];
  const base = {
    teamCode: normalizedCode,
    source: worldCupRecords?.source || "Wikipedia - National team appearances in the FIFA World Cup",
    sourceUrl: worldCupRecords?.sourceUrl || "https://en.wikipedia.org/wiki/National_team_appearances_in_the_FIFA_World_Cup",
    updatedAt: worldCupRecords?.updatedAt || "",
    asOf: worldCupRecords?.asOf || "",
    asOfZh: worldCupRecords?.asOfZh || "",
    notes: worldCupRecords?.notes || "",
    notesZh: worldCupRecords?.notesZh || ""
  };
  if (!record) {
    return {
      ...base,
      ok: false,
      status: "missing",
      error: "世界杯历史战绩快照未覆盖该队。"
    };
  }
  return {
    ...base,
    ...record,
    ok: true,
    status: "verified-snapshot"
  };
}

function attachWorldCupRecord(team, code, worldCupRecords) {
  return {
    ...(team || {}),
    worldCupRecord: worldCupRecordForTeam(code, worldCupRecords)
  };
}

function squadProfileForTeam(code, squadProfiles) {
  const normalizedCode = String(code || "").toUpperCase();
  const profile = squadProfiles?.teams?.[normalizedCode];
  const base = {
    teamCode: normalizedCode,
    source: squadProfiles?.source || "World Cup 2026 Team Stats: Age, Height & Club Tiers by Country",
    sourceUrl: squadProfiles?.sourceUrl || "",
    rawSquadsUrl: squadProfiles?.rawSquadsUrl || "",
    updatedAt: squadProfiles?.updatedAt || "",
    methodology: squadProfiles?.methodology || "",
    methodologyZh: squadProfiles?.methodologyZh || ""
  };
  if (!profile) {
    return {
      ...base,
      ok: false,
      status: "missing",
      error: "阵容身高/分线 profile 快照未覆盖该队。"
    };
  }
  return {
    ...base,
    ...profile,
    ok: profile.ok !== false,
    status: profile.status || "synced"
  };
}

function attachStaticProfiles(team, code, worldCupRecords, squadProfiles) {
  return {
    ...(team || {}),
    worldCupRecord: worldCupRecordForTeam(code, worldCupRecords),
    squadProfile: squadProfileForTeam(code, squadProfiles)
  };
}

function safeNum(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function topTierShare(group) {
  const value = safeNum(group?.topTierShare);
  return value === null ? 0 : value;
}

function avgCaps(group) {
  const value = safeNum(group?.avgCaps);
  return value === null ? 0 : value;
}

function avgHeight(group) {
  const value = safeNum(group?.avgHeightCm);
  return value === null ? 0 : value;
}

function proxyLineScore(group, weights = {}) {
  if (!group || !group.players) return null;
  const height = avgHeight(group);
  const caps = avgCaps(group);
  const tier = topTierShare(group);
  const heightScore = clamp((height - 170) / 25, 0, 1);
  const capsScore = clamp(caps / 60, 0, 1);
  return roundTo(100 * (
    heightScore * (weights.height ?? 0.25)
    + capsScore * (weights.caps ?? 0.25)
    + tier * (weights.tier ?? 0.5)
  ), 1);
}

function lineupAdvantage(homeValue, awayValue, threshold, higherIsBetter = true) {
  if (homeValue === null || awayValue === null) return { side: "none", diff: null };
  const diff = higherIsBetter ? homeValue - awayValue : awayValue - homeValue;
  if (Math.abs(diff) < threshold) return { side: "even", diff: roundTo(diff, 1) };
  return { side: diff > 0 ? "home" : "away", diff: roundTo(Math.abs(diff), 1) };
}

function advantageTeamName(match, side) {
  if (side === "home") return match.homeName;
  if (side === "away") return match.awayName;
  return "";
}

function matchupInsight({ key, label, labelEn, side, valueText, valueTextEn, zh, en, confidence = "medium" }) {
  return { key, label, labelEn, side, valueText, valueTextEn, zh, en, confidence };
}

function buildHumanMatchup(match) {
  const homeProfile = match.homeTeam?.squadProfile;
  const awayProfile = match.awayTeam?.squadProfile;
  if (!homeProfile?.ok || !awayProfile?.ok) {
    return {
      ok: false,
      status: "missing",
      updatedAt: new Date().toISOString(),
      source: homeProfile?.source || awayProfile?.source || "World Cup 2026 Team Stats",
      sourceUrl: homeProfile?.sourceUrl || awayProfile?.sourceUrl || "",
      summary: "阵容身高/分线 profile 缺失，暂不做身体和分线对位判断。",
      summaryEn: "Squad physical and line-profile data is missing; no matchup read is generated.",
      insights: [],
      limits: ["身价、扑救率、球员评分未接入；当前只使用公开阵容 proxy。"]
    };
  }

  const h = homeProfile.groups || {};
  const a = awayProfile.groups || {};
  const insights = [];
  const overallHeight = lineupAdvantage(avgHeight(h.all), avgHeight(a.all), 2);
  if (overallHeight.side !== "none") {
    const sideName = advantageTeamName(match, overallHeight.side);
    insights.push(matchupInsight({
      key: "overall-height",
      label: "整体身高",
      labelEn: "Overall height",
      side: overallHeight.side,
      valueText: `${avgHeight(h.all) || "-"}cm vs ${avgHeight(a.all) || "-"}cm`,
      valueTextEn: `${avgHeight(h.all) || "-"}cm vs ${avgHeight(a.all) || "-"}cm`,
      zh: overallHeight.side === "even"
        ? "两队整体平均身高接近，身体对抗不构成明显单边优势。"
        : `${sideName} 平均身高高出约 ${overallHeight.diff}cm，定位球、二点球和高空防守要重点看。`,
      en: overallHeight.side === "even"
        ? "Overall average height is close; physical size is not a clear one-sided edge."
        : `${sideName} are about ${overallHeight.diff}cm taller on average; set pieces, second balls and aerial defending matter more.`
    }));
  }

  const gkScoreHome = proxyLineScore(h.GK, { height: 0.35, caps: 0.3, tier: 0.35 });
  const gkScoreAway = proxyLineScore(a.GK, { height: 0.35, caps: 0.3, tier: 0.35 });
  const gkAdv = lineupAdvantage(gkScoreHome, gkScoreAway, 8);
  insights.push(matchupInsight({
    key: "goalkeeper-proxy",
    label: "门将 proxy",
    labelEn: "Goalkeeper proxy",
    side: gkAdv.side,
    valueText: `${gkScoreHome ?? "-"} vs ${gkScoreAway ?? "-"}`,
    valueTextEn: `${gkScoreHome ?? "-"} vs ${gkScoreAway ?? "-"}`,
    zh: gkAdv.side === "even"
      ? "门将组 proxy 接近；不能仅凭门将维度偏向一边。"
      : `${advantageTeamName(match, gkAdv.side)} 门将组在身高、出场经验或俱乐部分层 proxy 上更占优。`,
    en: gkAdv.side === "even"
      ? "Goalkeeper proxy is close; do not lean on this dimension alone."
      : `${advantageTeamName(match, gkAdv.side)} have the stronger goalkeeper proxy from height, caps or club tier.`
  }));

  const dfScoreHome = proxyLineScore(h.DF, { height: 0.25, caps: 0.25, tier: 0.5 });
  const dfScoreAway = proxyLineScore(a.DF, { height: 0.25, caps: 0.25, tier: 0.5 });
  const dfAdv = lineupAdvantage(dfScoreHome, dfScoreAway, 10);
  insights.push(matchupInsight({
    key: "defence-proxy",
    label: "后防 proxy",
    labelEn: "Defensive line proxy",
    side: dfAdv.side,
    valueText: `${dfScoreHome ?? "-"} vs ${dfScoreAway ?? "-"}`,
    valueTextEn: `${dfScoreHome ?? "-"} vs ${dfScoreAway ?? "-"}`,
    zh: dfAdv.side === "even"
      ? "后防线 proxy 接近，更多要看临场站位、速度和个人失误。"
      : `${advantageTeamName(match, dfAdv.side)} 后防线俱乐部分层/经验/身高 proxy 更强，理论上更能承受持续压迫。`,
    en: dfAdv.side === "even"
      ? "Defensive-line proxy is close; live shape, pace and errors matter more."
      : `${advantageTeamName(match, dfAdv.side)} rate stronger on defensive club-tier, experience and height proxy.`
  }));

  const mfScoreHome = proxyLineScore(h.MF, { height: 0.12, caps: 0.28, tier: 0.6 });
  const mfScoreAway = proxyLineScore(a.MF, { height: 0.12, caps: 0.28, tier: 0.6 });
  const mfAdv = lineupAdvantage(mfScoreHome, mfScoreAway, 10);
  insights.push(matchupInsight({
    key: "midfield-proxy",
    label: "中场 proxy",
    labelEn: "Midfield proxy",
    side: mfAdv.side,
    valueText: `${mfScoreHome ?? "-"} vs ${mfScoreAway ?? "-"}`,
    valueTextEn: `${mfScoreHome ?? "-"} vs ${mfScoreAway ?? "-"}`,
    zh: mfAdv.side === "even"
      ? "中场 proxy 接近；控球和推进优势需要结合首发与临场压迫强度再判断。"
      : `${advantageTeamName(match, mfAdv.side)} 中场俱乐部分层/国家队经验 proxy 更强，控球、推进和反抢稳定性可能更好。`,
    en: mfAdv.side === "even"
      ? "Midfield proxy is close; possession and progression should be checked after lineups."
      : `${advantageTeamName(match, mfAdv.side)} have the stronger midfield proxy for club tier and international experience.`
  }));

  const fwScoreHome = proxyLineScore(h.FW, { height: 0.15, caps: 0.25, tier: 0.6 });
  const fwScoreAway = proxyLineScore(a.FW, { height: 0.15, caps: 0.25, tier: 0.6 });
  const fwAdv = lineupAdvantage(fwScoreHome, fwScoreAway, 10);
  insights.push(matchupInsight({
    key: "attack-proxy",
    label: "锋线 proxy",
    labelEn: "Attack proxy",
    side: fwAdv.side,
    valueText: `${fwScoreHome ?? "-"} vs ${fwScoreAway ?? "-"}`,
    valueTextEn: `${fwScoreHome ?? "-"} vs ${fwScoreAway ?? "-"}`,
    zh: fwAdv.side === "even"
      ? "锋线 proxy 接近；大小球要更多看节奏、双方防线和临场阵型。"
      : `${advantageTeamName(match, fwAdv.side)} 锋线俱乐部分层/经验 proxy 更强，转化机会的理论质量更好。`,
    en: fwAdv.side === "even"
      ? "Attack proxy is close; totals need pace, defensive line and lineup context."
      : `${advantageTeamName(match, fwAdv.side)} have a stronger attack proxy for club tier and experience.`
  }));

  const topTierHome = topTierShare(h.all);
  const topTierAway = topTierShare(a.all);
  const tierAdv = lineupAdvantage(topTierHome, topTierAway, 0.12);
  insights.push(matchupInsight({
    key: "club-tier-depth",
    label: "高水平俱乐部占比",
    labelEn: "Top club-tier share",
    side: tierAdv.side,
    valueText: `${roundTo(topTierHome * 100, 1)}% vs ${roundTo(topTierAway * 100, 1)}%`,
    valueTextEn: `${roundTo(topTierHome * 100, 1)}% vs ${roundTo(topTierAway * 100, 1)}%`,
    zh: tierAdv.side === "even"
      ? "高水平俱乐部球员占比接近；不能用阵容身价 proxy 拉开明显差距。"
      : `${advantageTeamName(match, tierAdv.side)} Tier 1/2 俱乐部球员占比更高，可作为身价不可用时的阵容质量 proxy。`,
    en: tierAdv.side === "even"
      ? "Top club-tier share is close; squad-value proxy does not separate the teams much."
      : `${advantageTeamName(match, tierAdv.side)} have a higher Tier 1/2 club share, a proxy while market value is unavailable.`
  }));

  const summaryInsights = insights
    .filter((item) => item.side && item.side !== "even" && item.side !== "none")
    .slice(0, 3)
    .map((item) => `${item.label}偏${advantageTeamName(match, item.side)}`);
  const summary = summaryInsights.length
    ? `人类复核重点：${summaryInsights.join("，")}。这些是阵容 proxy，不替代首发、伤停和真实比赛状态。`
    : "人类复核重点：身体、门将、后防、中场、锋线 proxy 没有明显单边碾压，临场阵容和节奏更关键。";
  const summaryEn = summaryInsights.length
    ? `Human-check focus: ${summaryInsights.map((text) => text.replace("偏", " leans ")).join(", ")}. These are squad proxies, not replacements for lineups, injuries or live state.`
    : "Human-check focus: physical, GK, defensive, midfield and attacking proxies do not show a clear one-sided gap; lineups and tempo matter more.";

  return {
    ok: true,
    status: "synced",
    updatedAt: new Date().toISOString(),
    source: homeProfile.source,
    sourceUrl: homeProfile.sourceUrl,
    rawSquadsUrl: homeProfile.rawSquadsUrl,
    summary,
    summaryEn,
    methodology: homeProfile.methodology,
    methodologyZh: homeProfile.methodologyZh,
    insights,
    limits: [
      "身价字段当前未接入可靠可抓取源；用 Tier 1/2 俱乐部占比作临时 proxy。",
      "门将强弱暂用身高、国家队出场和俱乐部分层 proxy；不等同于扑救率或真实状态。",
      "这些静态对位不会自动覆盖首发、伤停、天气和盘口曲线。"
    ],
    limitsEn: [
      "Market value is not connected to a reliably fetchable source yet; Tier 1/2 club share is used as a proxy.",
      "Goalkeeper strength uses height, international caps and club tier proxy; it is not save percentage or current form.",
      "These static matchups do not override lineups, injuries, weather or market curves."
    ]
  };
}

function cloneWorldCupRecords(worldCupRecords) {
  return {
    ...(worldCupRecords || {}),
    records: Object.fromEntries(Object.entries(worldCupRecords?.records || {}).map(([code, record]) => [code, { ...record }]))
  };
}

function addWorldCupResultToRecord(record, goalsFor, goalsAgainst) {
  if (!record || !Number.isFinite(goalsFor) || !Number.isFinite(goalsAgainst)) return;
  record.matches = Number(record.matches || 0) + 1;
  record.wins = Number(record.wins || 0) + (goalsFor > goalsAgainst ? 1 : 0);
  record.draws = Number(record.draws || 0) + (goalsFor === goalsAgainst ? 1 : 0);
  record.losses = Number(record.losses || 0) + (goalsFor < goalsAgainst ? 1 : 0);
  record.goalsFor = Number(record.goalsFor || 0) + goalsFor;
  record.goalsAgainst = Number(record.goalsAgainst || 0) + goalsAgainst;
}

function applyRecordedWorldCupResults(worldCupRecords, modeledMatches, scheduleMatches, finalResults) {
  const enriched = cloneWorldCupRecords(worldCupRecords);
  const records = enriched.records || {};
  const matchById = new Map();
  for (const match of modeledMatches || []) {
    matchById.set(match.id, {
      home: String(match.home || "").toUpperCase(),
      away: String(match.away || "").toUpperCase()
    });
  }
  for (const event of scheduleMatches || []) {
    const id = `schedule-${event.scheduleId || scheduleEventKey(event)}`;
    matchById.set(id, {
      home: eventTeamCode(event, "home"),
      away: eventTeamCode(event, "away")
    });
    if (event.scheduleId) {
      matchById.set(event.scheduleId, {
        home: eventTeamCode(event, "home"),
        away: eventTeamCode(event, "away")
      });
    }
  }

  let applied = 0;
  const appearanceAddedTeams = new Set();
  for (const [matchId, result] of finalResults || []) {
    const teams = matchById.get(matchId);
    const homeGoals = result?.home_goals === null || result?.home_goals === undefined ? NaN : Number(result.home_goals);
    const awayGoals = result?.away_goals === null || result?.away_goals === undefined ? NaN : Number(result.away_goals);
    if (!teams?.home || !teams?.away || !Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) continue;
    if (!records[teams.home]) continue;
    if (!records[teams.away]) continue;
    for (const code of [teams.home, teams.away]) {
      if (!appearanceAddedTeams.has(code)) {
        records[code].appearances = Number(records[code].appearances || 0) + 1;
        appearanceAddedTeams.add(code);
      }
    }
    addWorldCupResultToRecord(records[teams.home], homeGoals, awayGoals);
    addWorldCupResultToRecord(records[teams.away], awayGoals, homeGoals);
    applied += 1;
  }
  if (applied > 0) {
    enriched.asOf = `${enriched.asOf || "Historical snapshot"}; plus ${applied} recorded 2026 final result${applied === 1 ? "" : "s"} from local history.`;
    enriched.asOfZh = `${enriched.asOfZh || "历史快照"}；已叠加本地结果库记录的 ${applied} 场 2026 已完赛结果。`;
    enriched.appliedFinalResults = applied;
  }
  return enriched;
}

function rankBand(rank) {
  if (!rank) return "排名快照未覆盖，使用默认自动评分";
  if (rank <= 10) return "世界前十级别";
  if (rank <= 25) return "世界杯强队/淘汰赛候选级别";
  if (rank <= 50) return "中上游竞争力";
  if (rank <= 80) return "下半区竞争力";
  return "低排名队，模型降低基线强度";
}

function scheduleTeamRecord(team, fifaRankings, worldCupRecords, squadProfiles) {
  const code = String(team?.code || "").toUpperCase();
  const name = TEAM_DISPLAY_NAMES_ZH[code] || team?.name || "TBD";
  const rating = teamRatingForScheduleTeam(team);
  const worldRanking = rankingForTeam(code, fifaRankings);
  const worldCupRecord = worldCupRecordForTeam(code, worldCupRecords);
  const squadProfile = squadProfileForTeam(code, squadProfiles);
  return {
    name,
    englishName: TEAM_SEARCH_NAMES[code] || team?.name || "",
    group: "待确认",
    rating,
    style: worldRanking.rank
      ? `赛程源自动纳入；${rankBand(worldRanking.rank)}。`
      : "赛程源自动纳入；排名快照未覆盖时使用默认保守评分。",
    staticSignals: [
      `自动基线评分：${rating}`,
      worldRanking.rank ? `FIFA 世界排名第 ${worldRanking.rank}（${worldRanking.updatedAt || "快照"}）` : worldRanking.note,
      `静态强度标签：${rankBand(worldRanking.rank)}`
    ],
    watchItems: [
      "赛前持续复核官方/可靠阵容",
      "伤停和球队新闻以公开同步结果为准",
      "公开盘口和 Polymarket 市场未匹配时不提供价格建议"
    ],
    worldRanking,
    worldCupRecord,
    squadProfile,
    code
  };
}

function autoBaselineLambda(homeRating, awayRating) {
  const diff = clamp((homeRating - awayRating) / 20, -1.1, 1.1);
  return {
    lambdaHome: roundTo(clamp(1.18 + diff * 0.3, 0.55, 2.25), 2),
    lambdaAway: roundTo(clamp(1.02 - diff * 0.24, 0.45, 2.05), 2)
  };
}

function impliedMoneylineFromModel(probabilities, margin = 0.04) {
  const keys = ["home", "draw", "away"];
  const raw = keys.map((key) => Math.max(0.01, probabilities[key] || 0));
  const total = raw.reduce((sum, value) => sum + value, 0) || 1;
  return Object.fromEntries(keys.map((key, index) => [
    key,
    roundTo(clamp((raw[index] / total) * (1 - margin), 0.01, 0.98), 2)
  ]));
}

function impliedTotalsFromModel(probabilities, margin = 0.04) {
  return {
    under25: roundTo(clamp((probabilities.under25 || 0) * (1 - margin), 0.01, 0.98), 2),
    over25: roundTo(clamp((probabilities.over25 || 0) * (1 - margin), 0.01, 0.98), 2)
  };
}

function impliedHandicapFromModel(probabilities, homeLine, margin = 0.04) {
  const home = handicapProbability(probabilities.topScoresFull || [], homeLine, "home");
  const away = handicapProbability(probabilities.topScoresFull || [], homeLine, "away");
  const homePrice = clamp(home.win * (1 - margin), 0.01, 0.98);
  const awayPrice = clamp(away.win * (1 - margin), 0.01, 0.98);
  return {
    homePrice: roundTo(homePrice, 2),
    awayPrice: roundTo(awayPrice, 2)
  };
}

function autoBaselineManualMarkets(match, probabilities) {
  const moneyline = impliedMoneylineFromModel(probabilities);
  const totals = impliedTotalsFromModel(probabilities);
  const homeLine = probabilities.home >= 0.57 ? -1.5 : probabilities.home <= 0.25 ? 1.5 : -0.5;
  const handicapPrices = impliedHandicapFromModel(probabilities, homeLine);
  const nowIso = new Date().toISOString();
  return {
    moneyline,
    totals,
    handicaps: [
      {
        id: `${match.id}-auto-handicap`,
        homeLine,
        awayLine: -homeLine,
        homePrice: handicapPrices.homePrice,
        awayPrice: handicapPrices.awayPrice,
        source: "自动基线参考价；不是实时盘口。"
      }
    ],
    history: {},
    source: "赛程自动基线参考价；缺少真实盘口和 Polymarket 映射时仅用于概率展示，不给价格建议。",
    sourceType: "auto-baseline",
    lastUpdated: nowIso
  };
}

function contextRecentForm(event, side, ranking) {
  const name = eventTeamName(event, side);
  const rank = ranking?.rank;
  return [
    rank ? `${name} FIFA 排名第 ${rank}，作为长期实力基线输入。` : `${name} 排名快照未覆盖，使用保守自动评分。`,
    "公开近况同步未完成时，不把未知近五场战绩强行加权。"
  ];
}

function emptyRecentFormRecord(event, side, ranking) {
  const code = eventTeamCode(event, side);
  return {
    ok: false,
    status: "queued",
    teamCode: code,
    teamName: teamDisplayName(code, eventTeamName(event, side)),
    updatedAt: new Date().toISOString(),
    source: "ESPN all soccer team schedule",
    sourceUrl: "",
    error: ranking?.rank ? "等待公开赛果同步" : "等待公开赛果同步；排名快照也未覆盖",
    summary: {
      matches: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0
    },
    matches: []
  };
}

function contextTacticalMatchup(event, homeRanking, awayRanking) {
  const homeName = eventTeamName(event, "home");
  const awayName = eventTeamName(event, "away");
  const rankingText = homeRanking?.rank && awayRanking?.rank
    ? `${homeName} FIFA 第 ${homeRanking.rank}，${awayName} FIFA 第 ${awayRanking.rank}`
    : "双方排名基线部分可用";
  return `${rankingText}；官方首发/可靠预计 XI 未确认前，只按长期强度、赛程场馆和天气做低置信对位。`;
}

function scheduleAutoBaselineContext(event, fifaRankings = {}) {
  const nowIso = new Date().toISOString();
  const homeRanking = rankingForTeam(eventTeamCode(event, "home"), fifaRankings);
  const awayRanking = rankingForTeam(eventTeamCode(event, "away"), fifaRankings);
  return {
    updatedAt: nowIso,
    lineups: {
      status: "unavailable",
      queried: true,
      statusLabel: "已纳入公开源自动检索；官方首发未确认时不生成强信号",
      home: {
        formation: "待确认",
        xi: [],
        notes: `${eventTeamName(event, "home")} 已进入自动检索；未发现官方首发或可靠预计 XI，不生成球员名单。`
      },
      away: {
        formation: "待确认",
        xi: [],
        notes: `${eventTeamName(event, "away")} 已进入自动检索；未发现官方首发或可靠预计 XI，不生成球员名单。`
      }
    },
    injurySummary: "已进入公开伤停检索；未抓到可确认重大伤停前按低置信处理，不允许强信号。",
    teamNewsSummary: "赛程、球队排名和场馆已同步；球队新闻等待公开源/AI综合补充，当前按低置信基线。",
    recentForm: {
      home: contextRecentForm(event, "home", homeRanking),
      away: contextRecentForm(event, "away", awayRanking)
    },
    recentFormRecords: {
      home: emptyRecentFormRecord(event, "home", homeRanking),
      away: emptyRecentFormRecord(event, "away", awayRanking)
    },
    tacticalMatchup: contextTacticalMatchup(event, homeRanking, awayRanking),
    riskFlags: ["自动基线缺少动态情报", "缺少真实盘口映射"],
    aiAnalysis: {
      ok: true,
      fallback: true,
      updatedAt: nowIso,
      model: "rule-based-public-source-fallback",
      summary: "自动基线已用赛程、排名和场馆生成低置信综合；等待公开源/AI同步进一步细化。",
      riskFlags: ["首发未确认", "真实盘口/Polymarket 映射可能缺失"],
      modelImpacts: []
    },
    weather: {
      summary: event.venue?.name && VENUE_COORDINATES[event.venue.name]
        ? `${VENUE_COORDINATES[event.venue.name].label} 场馆坐标已配置，等待天气同步写入。`
        : "场馆坐标未配置，天气不参与模型调整。",
      updatedAt: null
    },
    modelImpacts: [],
    sources: {
      lineups: { ok: true, status: "queried-unconfirmed", confidence: "low", updatedAt: nowIso, url: "", error: "已查询，未发现可核验首发页面" },
      injuries: { ok: true, status: "queried-unconfirmed", confidence: "low", updatedAt: nowIso, url: "", error: "已查询，未发现可确认伤停信息" },
      teamNews: { ok: true, status: "baseline", confidence: "low", updatedAt: nowIso, url: "", error: "使用赛程/排名基线，等待更多新闻摘要" },
      weather: { ok: Boolean(event.venue?.name && VENUE_COORDINATES[event.venue.name]), status: event.venue?.name && VENUE_COORDINATES[event.venue.name] ? "coordinate-ready" : "source-unavailable", confidence: "low", updatedAt: null, url: "", error: event.venue?.name && VENUE_COORDINATES[event.venue.name] ? "等待天气同步写入" : "场馆坐标未配置" },
      aiAnalysis: { ok: true, status: "rule-fallback", confidence: "low", updatedAt: nowIso, url: "", error: "规则低置信兜底" },
      schedule: {
        ok: true,
        updatedAt: nowIso,
        url: "",
        error: "",
        source: event.source || "赛程源"
      }
    }
  };
}

async function timedFetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs || FETCH_TIMEOUT_MS);
  const { timeoutMs: _timeoutMs, ...fetchOptions } = options;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        "accept": "application/json,text/plain,*/*",
        "user-agent": "worldcup-polymarket-dashboard/0.1",
        ...(fetchOptions.headers || {})
      }
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 140)}`);
    }
    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
      data: text ? JSON.parse(text) : null
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: error.name === "AbortError" ? "timeout" : error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function timedFetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "accept": "text/html,application/xhtml+xml,application/json,text/plain,*/*",
        "user-agent": "Mozilla/5.0 worldcup-polymarket-dashboard/0.1",
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 140)}`);
    }
    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
      text
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: error.name === "AbortError" ? "timeout" : error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildPolymarketSearches(schedule = null) {
  const scheduleSearches = (schedule?.matches || [])
    .filter((event) => !event.completed && !isFinishedStatus(event.status))
    .map((event) => {
      const homeName = eventTeamSearchName(event, "home");
      const awayName = eventTeamSearchName(event, "away");
      const homeNeedle = homeName.toLowerCase();
      const awayNeedle = awayName.toLowerCase();
      return {
        label: `${homeName} vs ${awayName}`,
        q: `${homeName} ${awayName}`,
        teamNeedles: [homeNeedle, awayNeedle]
      };
    })
    .filter((search) => search.teamNeedles.every((needle) => needle && needle !== "tbd"));
  const combined = [...WORLDCUP_MARKET_SEARCHES, ...scheduleSearches];
  const seen = new Set();
  return combined.filter((search) => {
    const key = `${search.q}:${(search.teamNeedles || []).join("|")}:${search.worldCupOnly ? "worldcup" : ""}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildPolymarketEventSlugSearches(schedule = null) {
  const searches = [];
  for (const event of schedule?.matches || []) {
    if (event.completed || isFinishedStatus(event.status)) continue;
    const homeCode = polymarketTeamSlug(eventTeamCode(event, "home"));
    const awayCode = polymarketTeamSlug(eventTeamCode(event, "away"));
    if (!homeCode || !awayCode || homeCode === "tbd" || awayCode === "tbd") continue;
    for (const dateKey of polymarketDateCandidates(event.kickoffUtc)) {
      searches.push({
        label: `${eventTeamSearchName(event, "home")} vs ${eventTeamSearchName(event, "away")} (${dateKey})`,
        slug: `fifwc-${homeCode}-${awayCode}-${dateKey}`,
        teamNeedles: [
          eventTeamSearchName(event, "home").toLowerCase(),
          eventTeamSearchName(event, "away").toLowerCase()
        ]
      });
      searches.push({
        label: `${eventTeamSearchName(event, "away")} vs ${eventTeamSearchName(event, "home")} (${dateKey})`,
        slug: `fifwc-${awayCode}-${homeCode}-${dateKey}`,
        teamNeedles: [
          eventTeamSearchName(event, "away").toLowerCase(),
          eventTeamSearchName(event, "home").toLowerCase()
        ]
      });
    }
  }
  const seen = new Set();
  return searches.filter((search) => {
    if (seen.has(search.slug)) return false;
    seen.add(search.slug);
    return true;
  });
}

function polymarketTeamSlug(code) {
  const overrides = {
    CPV: "cvi"
  };
  const normalized = String(code || "").trim().toUpperCase();
  return overrides[normalized] || normalized.toLowerCase();
}

function polymarketDateCandidates(kickoffUtc) {
  const date = new Date(kickoffUtc || "");
  if (Number.isNaN(date.getTime())) return [];
  return [
    dateKeyUtc(addDays(date, -1)),
    dateKeyUtc(date),
    dateKeyUtc(addDays(date, 1))
  ].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index);
}

function dateKeyUtc(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

async function fetchPolymarket(schedule = null) {
  if (USE_DEMO_POLYMARKET) return demoPolymarket();

  const searches = buildPolymarketSearches(schedule);
  const eventSlugSearches = buildPolymarketEventSlugSearches(schedule);
  const [eventSlugResults, sportsPageResults, searchResults] = await Promise.all([
    Promise.all(eventSlugSearches.map((search) => fetchPolymarketEventSlug(search))),
    Promise.all(eventSlugSearches.map((search) => fetchPolymarketSportsPageMarkets(search))),
    Promise.all(searches.map((search) => fetchPolymarketSearch(search)))
  ]);
  const prioritizedResults = [
    ...eventSlugResults,
    ...sportsPageResults,
    ...searchResults.filter((result) => !result.worldCupOnly),
    ...searchResults.filter((result) => result.worldCupOnly)
  ];
  const results = prioritizedResults;
  const firstOk = results.find((result) => result.ok);
  if (!firstOk) {
    const firstError = results.find((result) => result.error);
    return {
      source: "Polymarket 实时市场 API",
      ok: false,
      error: translateError(firstError?.error || "没有可用搜索结果"),
      latencyMs: results.reduce((sum, result) => sum + (result.latencyMs || 0), 0),
      markets: []
    };
  }

  const markets = uniqueMarkets(results.flatMap((result) => result.markets || []));
  const normalizedMarkets = markets
    .slice(0, POLYMARKET_MARKET_LIMIT)
    .map(normalizePolymarketMarket);
  const tokenIds = [...new Set(normalizedMarkets
    .flatMap((market) => market.tokens.map((token) => token.tokenId))
    .filter(Boolean))]
    .slice(0, POLYMARKET_HISTORY_TOKEN_LIMIT);
  const history = tokenIds.length ? await fetchPriceHistory(tokenIds) : emptyHistory("没有可用 token_id");

  for (const market of normalizedMarkets) {
    for (const token of market.tokens) {
      token.history = history.history[token.tokenId] || [];
    }
  }

  return {
    source: "Polymarket 实时市场 API",
    ok: true,
    latencyMs: results.reduce((sum, result) => sum + (result.latencyMs || 0), 0),
    searches: results.map((result) => ({
      label: result.label,
      slug: result.slug,
      ok: result.ok,
      eventCount: result.eventCount || 0,
      marketCount: (result.markets || []).length,
      error: result.error
    })),
    historySource: history,
    markets: normalizedMarkets
  };
}

async function fetchPolymarketEventSlug(search) {
  const url = `${POLYMARKET_GAMMA_API_BASE}/events/slug/${encodeURIComponent(search.slug)}`;
  const result = await timedFetchJson(url);
  if (!result.ok) {
    return {
      label: search.label,
      slug: search.slug,
      ok: false,
      latencyMs: result.latencyMs,
      error: translateError(result.error),
      markets: []
    };
  }
  const event = result.data && !Array.isArray(result.data) ? result.data : null;
  const markets = event && Array.isArray(event.markets)
    ? event.markets.map((market) => ({
      ...market,
      eventTitle: event.title,
      eventSlug: event.slug
    })).filter(isWorldCupSoccerMarket)
    : [];
  return {
    label: search.label,
    slug: search.slug,
    ok: true,
    latencyMs: result.latencyMs,
    eventCount: event ? 1 : 0,
    markets
  };
}

async function fetchPolymarketSportsPageMarkets(search) {
  const url = `https://polymarket.com/sports/world-cup/${encodeURIComponent(search.slug)}`;
  const result = await timedFetchText(url);
  if (!result.ok) {
    return {
      label: `${search.label} sports page`,
      slug: search.slug,
      ok: false,
      latencyMs: result.latencyMs,
      error: translateError(result.error),
      markets: []
    };
  }
  const markets = extractSportsPageMarkets(result.text, search.slug)
    .filter(isWorldCupSoccerMarket)
    .slice(0, POLYMARKET_SPORTS_MARKET_LIMIT_PER_EVENT);
  return {
    label: `${search.label} sports page`,
    slug: search.slug,
    ok: true,
    latencyMs: result.latencyMs,
    eventCount: markets.length ? 1 : 0,
    marketCount: markets.length,
    markets
  };
}

function extractSportsPageMarkets(html, eventSlug) {
  const text = String(html || "");
  if (!text || !eventSlug) return [];
  const marketObjects = [];
  const slugPattern = new RegExp(`\\\"slug\\\":\\\"${escapeRegExp(eventSlug)}-(?:total-2pt5|spread-(?:home|away)-1pt5)\\\"`, "g");
  for (const match of text.matchAll(slugPattern)) {
    const start = findEmbeddedMarketStart(text, match.index || 0);
    if (start < 0) continue;
    const objectText = closeJsonObject(text.slice(start));
    const parsed = parseEmbeddedMarketObject(objectText);
    if (parsed) marketObjects.push(parsed);
  }
  return uniqueMarkets(marketObjects.map((market) => ({
    ...market,
    eventTitle: market.eventTitle || market.events?.[0]?.title || "",
    eventSlug: market.eventSlug || eventSlug
  })));
}

function findEmbeddedMarketStart(text, index) {
  const prefix = text.slice(Math.max(0, index - 5000), index);
  const localIndex = prefix.lastIndexOf("{\"id\":\"");
  return localIndex < 0 ? -1 : Math.max(0, index - 5000) + localIndex;
}

function closeJsonObject(text) {
  const raw = String(text || "");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return raw.slice(0, index + 1);
    }
  }
  return raw;
}

function parseEmbeddedMarketObject(text) {
  try {
    const market = JSON.parse(text);
    if (!market || typeof market !== "object") return null;
    const slug = String(market.slug || "");
    if (!slug.includes("-total-2pt5") && !slug.includes("-spread-home-1pt5") && !slug.includes("-spread-away-1pt5")) return null;
    const outcomes = parseJsonField(market.outcomes);
    const outcomePrices = parseJsonField(market.outcomePrices);
    const clobTokenIds = parseJsonField(market.clobTokenIds);
    if (!Array.isArray(outcomes) || !Array.isArray(outcomePrices) || !Array.isArray(clobTokenIds) || clobTokenIds.length < 2) return null;
    return {
      id: market.id,
      question: market.question,
      conditionId: market.conditionId,
      slug: market.slug,
      resolutionSource: market.resolutionSource,
      endDate: market.endDate,
      liquidity: market.liquidity,
      volume: market.volume,
      outcomes,
      outcomePrices,
      clobTokenIds,
      eventTitle: market.events?.[0]?.title || "",
      eventSlug: ""
    };
  } catch {
    return null;
  }
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fetchScheduleWindow(now = new Date()) {
  const startedAt = Date.now();
  const dates = [];
  for (let offset = -MATCH_SCHEDULE_LOOKBACK_DAYS; offset <= MATCH_WINDOW_DAYS; offset += 1) {
    dates.push(shanghaiDateKey(addDays(now, offset)));
  }
  const url = `${ESPN_WORLDCUP_SCOREBOARD}?dates=${dates[0]}-${dates[dates.length - 1]}`;
  const result = await timedFetchJson(url);
  if (!result.ok) {
    return {
      ok: false,
      source: "ESPN FIFA World Cup scoreboard",
      url,
      lastUpdated: new Date().toISOString(),
      latencyMs: result.latencyMs,
      error: translateError(result.error),
      matches: []
    };
  }

  const events = Array.isArray(result.data?.events) ? result.data.events : [];
  const matches = events.map((event) => {
    const competition = event.competitions?.[0] || {};
    const competitors = Array.isArray(competition.competitors) ? competition.competitors : [];
    const home = competitors.find((item) => item.homeAway === "home") || competitors[0] || {};
    const away = competitors.find((item) => item.homeAway === "away") || competitors[1] || {};
    const venue = normalizedVenueInfo(competition.venue || event.venue || {});
    return {
      scheduleId: String(event.id || ""),
      name: event.name || event.shortName || "",
      kickoffUtc: event.date || competition.date || "",
      status: event.status?.type?.name || "",
      statusDetail: event.status?.type?.shortDetail || event.status?.type?.detail || "",
      completed: Boolean(event.status?.type?.completed) || isFinishedStatus(event.status?.type?.name),
      home: {
        code: home.team?.abbreviation || "",
        name: home.team?.displayName || home.team?.name || ""
      },
      away: {
        code: away.team?.abbreviation || "",
        name: away.team?.displayName || away.team?.name || ""
      },
      venue,
      source: "ESPN FIFA World Cup scoreboard"
    };
  });

  return {
    ok: true,
    source: "ESPN FIFA World Cup scoreboard",
    url,
    lastUpdated: new Date().toISOString(),
    latencyMs: Date.now() - startedAt,
    windowDays: MATCH_WINDOW_DAYS,
    matches
  };
}

async function fetchPolymarketSearch(search) {
  const query = encodeURIComponent(search.q);
  const url = `${POLYMARKET_GAMMA_API_BASE}/public-search?q=${query}&limit_per_type=10&events_status=active`;
  const result = await timedFetchJson(url);
  if (!result.ok) {
    return {
      label: search.label,
      worldCupOnly: Boolean(search.worldCupOnly),
      ok: false,
      latencyMs: result.latencyMs,
      error: translateError(result.error),
      markets: []
    };
  }

  const events = Array.isArray(result.data?.events) ? result.data.events : [];
  const selectedEvents = events.filter((event) => isRelevantPolymarketEvent(event, search));
  const markets = selectedEvents
    .flatMap((event) => Array.isArray(event.markets) ? event.markets.map((market) => ({
      ...market,
      eventTitle: event.title,
      eventSlug: event.slug
    })) : [])
    .filter(isWorldCupSoccerMarket);

  return {
    label: search.label,
    worldCupOnly: Boolean(search.worldCupOnly),
    ok: true,
    latencyMs: result.latencyMs,
    eventCount: selectedEvents.length,
    markets
  };
}

function uniqueMarkets(markets) {
  const byId = new Map();
  for (const market of markets || []) {
    const key = String(market.conditionId || market.id || market.slug || "");
    if (!key || byId.has(key)) continue;
    byId.set(key, market);
  }
  return [...byId.values()];
}

function isRelevantPolymarketEvent(event, search) {
  const text = [
    event.title,
    event.slug,
    event.description,
    event.seriesSlug,
    ...(Array.isArray(event.tags) ? event.tags.map((tag) => tag.slug || tag.label || tag) : [])
  ].filter(Boolean).join(" ").toLowerCase();
  if (!text) return false;
  if (NON_SOCCER_POSITION_KEYWORDS.some((keyword) => text.includes(keyword))) return false;
  if (search.teamNeedles) {
    return search.teamNeedles.every((needle) => text.includes(needle));
  }
  if (search.worldCupOnly) {
    return (text.includes("world cup") || text.includes("fifa")) && (text.includes("soccer") || text.includes("fifa") || text.includes("world-cup"));
  }
  return true;
}

function isWorldCupSoccerMarket(market) {
  const text = [
    market.question,
    market.title,
    market.slug,
    market.description,
    market.category,
    market.subCategory,
    market.eventTitle,
    market.eventSlug,
    market.sportsMarketType
  ].filter(Boolean).join(" ").toLowerCase();
  const positive = [
    "world cup",
    "fifa",
    "soccer",
    "football",
    ...Object.values(TEAM_SEARCH_NAMES).map((name) => String(name).toLowerCase()),
    "mexico",
    "south africa",
    "south korea",
    "czech",
    "spain",
    "france",
    "england",
    "brazil",
    "argentina",
    "portugal",
    "germany",
    "netherlands",
    "italy"
  ];
  const negative = [
    "gta",
    "rihanna",
    "album",
    "super bowl",
    "nba",
    "nfl",
    "bitcoin",
    "ethereum",
    "crypto"
  ];
  return positive.some((word) => text.includes(word)) && !negative.some((word) => text.includes(word));
}

function demoPolymarket() {
  const now = Math.floor(Date.now() / 1000);
  const series = (base, drift = 0) => Array.from({ length: 48 }, (_, index) => {
    const wave = Math.sin(index / 5) * 0.018 + Math.cos(index / 9) * 0.012;
    const p = Math.max(0.02, Math.min(0.98, base + wave + drift * index));
    return { t: now - (47 - index) * 30 * 60, p };
  });

  return {
    source: "Polymarket 实时市场 API（演示数据）",
    ok: true,
    latencyMs: 0,
    demo: true,
    historySource: {
      source: "本地演示曲线",
      ok: true,
      fidelityMinutes: 30
    },
    markets: [
      {
        id: "demo-mex-rsa",
        question: "演示：墨西哥 vs 南非，谁会获胜？",
        slug: "demo-mexico-south-africa",
        volume: 125000,
        liquidity: 21000,
        tokens: [
          { tokenId: "demo-mex", label: "墨西哥胜", currentPrice: 0.68, history: series(0.66, 0.0002) },
          { tokenId: "demo-rsa", label: "南非胜", currentPrice: 0.11, history: series(0.13, -0.0001) }
        ]
      },
      {
        id: "demo-kor-cze",
        question: "演示：韩国 vs 捷克，谁会获胜？",
        slug: "demo-korea-czechia",
        volume: 76000,
        liquidity: 16500,
        tokens: [
          { tokenId: "demo-kor", label: "韩国胜", currentPrice: 0.37, history: series(0.35, 0.00025) },
          { tokenId: "demo-cze", label: "捷克胜", currentPrice: 0.36, history: series(0.38, -0.0002) }
        ]
      }
    ]
  };
}

function normalizePolymarketMarket(market) {
  const outcomes = parseJsonField(market.outcomes) || [];
  const outcomePrices = parseJsonField(market.outcomePrices) || [];
  const clobTokenIds = parseJsonField(market.clobTokenIds) || [];
  const tokens = clobTokenIds.map((tokenId, index) => ({
    tokenId,
    label: outcomes[index] || `结果 ${index + 1}`,
    currentPrice: numericOrNull(outcomePrices[index]),
    history: []
  }));

  return {
    id: market.id,
    conditionId: market.conditionId,
    question: market.question,
    slug: market.slug,
    eventTitle: market.eventTitle,
    eventSlug: market.eventSlug,
    volume: Number(market.volume || 0),
    liquidity: Number(market.liquidity || 0),
    tokens
  };
}

function numericOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function emptyHistory(error) {
  return {
    source: "Polymarket 批量价格历史 API",
    ok: false,
    error,
    history: {}
  };
}

async function fetchPriceHistory(tokenIds) {
  const uniqueTokenIds = [...new Set(tokenIds)].filter(Boolean);
  if (!uniqueTokenIds.length) return emptyHistory("没有可用 token_id");
  const batches = [];
  for (let index = 0; index < uniqueTokenIds.length; index += POLYMARKET_HISTORY_BATCH_SIZE) {
    batches.push(uniqueTokenIds.slice(index, index + POLYMARKET_HISTORY_BATCH_SIZE));
  }
  const batchResults = await Promise.all(batches.map((batch) => fetchPriceHistoryBatch(batch)));
  const history = {};
  for (const result of batchResults) {
    Object.assign(history, result.history || {});
  }
  const failures = batchResults.filter((result) => !result.ok);
  return {
    source: "Polymarket 批量价格历史 API",
    ok: failures.length === 0,
    partial: failures.length > 0 && failures.length < batchResults.length,
    error: failures.map((result) => result.error).filter(Boolean).join("; "),
    latencyMs: batchResults.reduce((sum, result) => sum + (result.latencyMs || 0), 0),
    startTs: batchResults.find((result) => result.startTs)?.startTs || null,
    endTs: batchResults.find((result) => result.endTs)?.endTs || null,
    fidelityMinutes: PRICE_HISTORY_FIDELITY_MINUTES,
    requestedTokens: uniqueTokenIds.length,
    returnedTokens: Object.keys(history).length,
    batchCount: batches.length,
    history
  };
}

async function fetchPriceHistoryBatch(tokenIds) {
  const endTs = Math.floor(Date.now() / 1000);
  const startTs = endTs - PRICE_HISTORY_HOURS * 60 * 60;
  const result = await timedFetchJson("https://clob.polymarket.com/batch-prices-history", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      markets: tokenIds,
      start_ts: startTs,
      end_ts: endTs,
      fidelity: PRICE_HISTORY_FIDELITY_MINUTES
    })
  });

  if (!result.ok) {
    return {
      source: "Polymarket 批量价格历史 API",
      ok: false,
      error: translateError(result.error),
      latencyMs: result.latencyMs,
      history: {}
    };
  }

  const rawHistory = result.data && typeof result.data.history === "object" ? result.data.history : {};
  const history = {};
  for (const [tokenId, points] of Object.entries(rawHistory)) {
    history[tokenId] = Array.isArray(points)
      ? points
          .map((point) => ({
            t: Number(point.t),
            p: Number(point.p)
          }))
          .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.p))
      : [];
  }

  return {
    source: "Polymarket 批量价格历史 API",
    ok: true,
    latencyMs: result.latencyMs,
    startTs,
    endTs,
    fidelityMinutes: PRICE_HISTORY_FIDELITY_MINUTES,
    requestedTokens: tokenIds.length,
    returnedTokens: Object.keys(history).length,
    history
  };
}

function parseJsonField(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function walletKey(value) {
  return String(value || "").trim().toLowerCase();
}

function isSoccerPosition(position) {
  const text = [
    position.title,
    position.slug,
    position.eventSlug,
    position.icon,
    position.outcome,
    position.oppositeOutcome
  ].filter(Boolean).join(" ").toLowerCase();
  if (!text) return false;
  if (NON_SOCCER_POSITION_KEYWORDS.some((keyword) => text.includes(keyword))) return false;
  return SOCCER_POSITION_KEYWORDS.some((keyword) => text.includes(keyword));
}

function uniquePositions(positions) {
  const seen = new Set();
  const unique = [];
  for (const position of positions || []) {
    const key = [
      position.proxyWallet,
      position.asset,
      position.conditionId,
      position.timestamp,
      position.outcome
    ].join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(position);
  }
  return unique;
}

function uniqueLeaderboardEntries(entries) {
  const byWallet = new Map();
  for (const entry of entries || []) {
    const key = walletKey(entry.proxyWallet);
    if (!key) continue;
    const current = byWallet.get(key);
    if (!current || Number(entry.pnl || 0) > Number(current.pnl || 0)) {
      byWallet.set(key, entry);
    }
  }
  return [...byWallet.values()];
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function summarizeSoccerPerformance(entry, closedPositions) {
  const soccerPositions = uniquePositions(closedPositions).filter(isSoccerPosition);
  const wins = soccerPositions.filter((position) => Number(position.realizedPnl || 0) > 0).length;
  const losses = soccerPositions.filter((position) => Number(position.realizedPnl || 0) < 0).length;
  const pushes = soccerPositions.length - wins - losses;
  const soccerPnl = soccerPositions.reduce((sum, position) => sum + Number(position.realizedPnl || 0), 0);
  const soccerVolume = soccerPositions.reduce((sum, position) => sum + Number(position.totalBought || 0), 0);
  const winRate = soccerPositions.length ? wins / soccerPositions.length : null;

  return {
    rank: Number(entry.rank || 0) || null,
    userName: entry.userName || entry.name || walletKey(entry.proxyWallet).slice(0, 10),
    proxyWallet: entry.proxyWallet,
    xUsername: entry.xUsername || "",
    verifiedBadge: Boolean(entry.verifiedBadge || entry.verified),
    profileImage: entry.profileImage || "",
    overallPnl: Number(entry.pnl || 0),
    overallVolume: Number(entry.vol || entry.volume || 0),
    soccerPnl,
    soccerVolume,
    soccerSettledPositions: soccerPositions.length,
    soccerWins: wins,
    soccerLosses: losses,
    soccerPushes: pushes,
    winRateEstimate: winRate,
    sampleTitles: soccerPositions.slice(0, 3).map((position) => position.title).filter(Boolean)
  };
}

async function fetchLeaderboardPage(params) {
  const search = new URLSearchParams(params);
  const result = await timedFetchJson(`${POLYMARKET_DATA_API_BASE}/v1/leaderboard?${search.toString()}`);
  if (!result.ok) throw new Error(result.error || "leaderboard failed");
  return Array.isArray(result.data) ? result.data : [];
}

async function safeFetchLeaderboardPage(params) {
  try {
    return await fetchLeaderboardPage(params);
  } catch {
    return [];
  }
}

async function fetchLeaderboardPages(source, maxRows) {
  const rows = [];
  for (let offset = 0; rows.length < maxRows; offset += ELITE_LEADERBOARD_PAGE_SIZE) {
    const page = await safeFetchLeaderboardPage({
      ...source,
      limit: String(Math.min(ELITE_LEADERBOARD_PAGE_SIZE, maxRows - rows.length)),
      offset: String(offset)
    });
    if (!page.length) break;
    rows.push(...page);
    if (page.length < ELITE_LEADERBOARD_PAGE_SIZE) break;
  }
  return rows;
}

async function fetchClosedPositionsForTrader(wallet) {
  const common = {
    user: wallet,
    limit: String(Math.max(20, Math.floor(ELITE_CLOSED_POSITION_LIMIT / 2)))
  };
  const urls = [
    `${POLYMARKET_DATA_API_BASE}/closed-positions?${new URLSearchParams({
      ...common,
      sortBy: "REALIZEDPNL",
      sortDirection: "DESC"
    }).toString()}`,
    `${POLYMARKET_DATA_API_BASE}/closed-positions?${new URLSearchParams({
      ...common,
      sortBy: "TIMESTAMP"
    }).toString()}`
  ];
  const results = await Promise.all(urls.map((url) => timedFetchJson(url)));
  return uniquePositions(results.flatMap((result) => result.ok && Array.isArray(result.data) ? result.data : []));
}

async function fetchTraderActivity(wallet) {
  const search = new URLSearchParams({
    user: wallet,
    limit: String(ELITE_ACTIVITY_LIMIT),
    type: "TRADE"
  });
  const result = await timedFetchJson(`${POLYMARKET_DATA_API_BASE}/activity?${search.toString()}`);
  if (!result.ok || !Array.isArray(result.data)) return [];
  return result.data;
}

function findRecentBuyActivity(activities, position) {
  const asset = String(position.asset || "");
  const conditionId = String(position.conditionId || "");
  const outcome = String(position.outcome || "").toLowerCase();
  const matches = (activities || [])
    .filter((activity) => {
      if (String(activity.side || "").toUpperCase() !== "BUY") return false;
      if (asset && String(activity.asset || "") === asset) return true;
      if (conditionId && String(activity.conditionId || "") === conditionId && outcome && String(activity.outcome || "").toLowerCase() === outcome) return true;
      return false;
    })
    .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
  const latest = matches[0];
  if (!latest) return null;
  return {
    timestamp: Number(latest.timestamp || 0) || null,
    isoTime: latest.timestamp ? new Date(Number(latest.timestamp) * 1000).toISOString() : null,
    price: numericOrNull(latest.price),
    size: Number(latest.size || 0),
    usdcSize: Number(latest.usdcSize || 0),
    side: latest.side || "",
    outcome: latest.outcome || "",
    title: latest.title || "",
    slug: latest.slug || "",
    transactionHash: latest.transactionHash || ""
  };
}

async function fetchEliteLeaderboard({ force = false } = {}) {
  const now = Date.now();
  if (!force && eliteLeaderboardCache && now - eliteLeaderboardCacheAt < ELITE_LEADERBOARD_CACHE_TTL_MS) {
    return {
      ...eliteLeaderboardCache,
      cacheHit: true
    };
  }

  try {
    const discoverySources = [
      {
        category: "sports",
        timePeriod: "ALL",
        orderBy: "pnl"
      },
      {
        category: "sports",
        timePeriod: "MONTH",
        orderBy: "pnl"
      },
      {
        category: "sports",
        timePeriod: "ALL",
        orderBy: "vol"
      },
      {
        category: "sports",
        timePeriod: "WEEK",
        orderBy: "pnl"
      }
    ];
    const pages = await Promise.all(discoverySources.map((source) => fetchLeaderboardPages(source, Math.ceil(ELITE_TRADER_CANDIDATE_LIMIT / 2))));
    const candidates = uniqueLeaderboardEntries(pages.flat()).slice(0, ELITE_TRADER_CANDIDATE_LIMIT);
    const summaries = await mapLimit(candidates, 10, async (entry) => {
      const closedPositions = await fetchClosedPositionsForTrader(entry.proxyWallet);
      return summarizeSoccerPerformance(entry, closedPositions);
    });
    const ranked = summaries
      .filter((trader) => trader.soccerSettledPositions > 0)
      .sort((a, b) => {
        const pnlDiff = b.soccerPnl - a.soccerPnl;
        if (Math.abs(pnlDiff) > 1) return pnlDiff;
        return (b.winRateEstimate ?? 0) - (a.winRateEstimate ?? 0);
      })
      .slice(0, ELITE_TRADER_LIMIT)
      .map((trader, index) => ({
        ...trader,
        soccerRank: index + 1
      }));

    const payload = {
      source: "Polymarket Data API",
      ok: true,
      updatedAt: new Date().toISOString(),
      cacheTtlSeconds: Math.round(ELITE_LEADERBOARD_CACHE_TTL_MS / 1000),
      candidateCount: candidates.length,
      rankingBasis: "SPORTS 表现候选账号 + 足球已结算样本过滤；胜率=盈利足球样本数/抓取到的足球已结算样本数",
      limit: ELITE_TRADER_LIMIT,
      traders: ranked
    };
    eliteLeaderboardCache = payload;
    eliteLeaderboardCacheAt = now;
    return payload;
  } catch (error) {
    return {
      source: "Polymarket Data API",
      ok: false,
      updatedAt: new Date().toISOString(),
      error: translateError(error.message),
      rankingBasis: "SPORTS 表现候选账号 + 足球已结算样本过滤",
      traders: []
    };
  }
}

function recommendationMarketCatalog(matches) {
  const rows = [];
  for (const match of matches || []) {
    for (const recommendation of match.recommendations || []) {
      const chart = recommendation.chart || {};
      if (!chart.conditionId || !chart.tokenId) continue;
      rows.push({
        matchId: match.id,
        recommendationKey: recommendation.key,
        conditionId: chart.conditionId,
        tokenId: chart.tokenId,
        marketName: recommendation.name,
        marketType: recommendation.marketType,
        chartQuestion: chart.marketQuestion,
        chartLabel: chart.label
      });
    }
  }
  return rows;
}

async function fetchMarketPositions(conditionId) {
  const search = new URLSearchParams({
    market: conditionId,
    limit: String(ELITE_MARKET_POSITION_LIMIT)
  });
  const result = await timedFetchJson(`${POLYMARKET_DATA_API_BASE}/v1/market-positions?${search.toString()}`);
  if (!result.ok) {
    return {
      conditionId,
      ok: false,
      error: translateError(result.error),
      positionsByToken: {}
    };
  }
  const positionsByToken = {};
  for (const tokenBucket of Array.isArray(result.data) ? result.data : []) {
    const token = String(tokenBucket.token || "");
    positionsByToken[token] = Array.isArray(tokenBucket.positions) ? tokenBucket.positions : [];
  }
  return {
    conditionId,
    ok: true,
    positionsByToken
  };
}

function normalizeEliteMarketPosition(position, trader) {
  const size = Number(position.size || 0);
  const currentValue = Number(position.currentValue || 0);
  if (size <= 0.000001 && currentValue <= 0.01) return null;
  return {
    traderRank: trader.soccerRank,
    userName: trader.userName,
    proxyWallet: trader.proxyWallet,
    verifiedBadge: trader.verifiedBadge,
    winRateEstimate: trader.winRateEstimate,
    soccerPnl: trader.soccerPnl,
    soccerSettledPositions: trader.soccerSettledPositions,
    overallPnl: trader.overallPnl,
    outcome: position.outcome || "",
    avgPrice: numericOrNull(position.avgPrice),
    size,
    currentValue,
    totalBought: Number(position.totalBought || 0),
    cashPnl: Number(position.cashPnl || 0),
    totalPnl: Number(position.totalPnl || position.realizedPnl || 0),
    currPrice: numericOrNull(position.currPrice),
    recentBuy: null
  };
}

function displayUserName(position) {
  return position.userName
    || position.name
    || position.username
    || position.pseudonym
    || shortWalletServer(position.proxyWallet || position.owner || position.address || "");
}

function shortWalletServer(value) {
  const wallet = String(value || "");
  return wallet.length > 12 ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : wallet;
}

function normalizeTopHolderPosition(position, trader = null) {
  const size = Number(position.size || position.shares || position.balance || 0);
  const currentValue = Number(position.currentValue || 0);
  if (size <= 0.000001 && currentValue <= 0.01) return null;
  return {
    userName: trader?.userName || displayUserName(position),
    proxyWallet: position.proxyWallet || position.owner || position.address || "",
    outcome: position.outcome || "",
    avgPrice: numericOrNull(position.avgPrice),
    size,
    currentValue,
    totalBought: Number(position.totalBought || 0),
    cashPnl: Number(position.cashPnl || 0),
    totalPnl: Number(position.totalPnl || position.realizedPnl || 0),
    currPrice: numericOrNull(position.currPrice),
    isElite: Boolean(trader),
    traderRank: trader?.soccerRank || null,
    winRateEstimate: trader?.winRateEstimate ?? null,
    soccerPnl: trader?.soccerPnl ?? null,
    soccerSettledPositions: trader?.soccerSettledPositions ?? null
  };
}

function normalizeTopHoldersForToken(positions, traderMap = new Map()) {
  return (positions || [])
    .map((position) => normalizeTopHolderPosition(position, traderMap.get(walletKey(position.proxyWallet))))
    .filter(Boolean)
    .sort((a, b) => {
      const sizeDiff = b.size - a.size;
      if (Math.abs(sizeDiff) > 0.000001) return sizeDiff;
      return b.currentValue - a.currentValue;
    })
    .slice(0, TOP_HOLDER_LIMIT)
    .map((holder, index) => ({
      ...holder,
      holderRank: index + 1
    }));
}

async function enrichSignalsWithActivity(signals) {
  const wallets = [...new Set((signals || []).map((signal) => walletKey(signal.proxyWallet)).filter(Boolean))];
  if (!wallets.length) return signals;
  const activityEntries = await mapLimit(wallets, 5, async (wallet) => [wallet, await fetchTraderActivity(wallet)]);
  const activityMap = new Map(activityEntries);
  return signals.map((signal) => ({
    ...signal,
    recentBuy: findRecentBuyActivity(activityMap.get(walletKey(signal.proxyWallet)) || [], {
      asset: signal.asset,
      conditionId: signal.conditionId,
      outcome: signal.outcome
    })
  }));
}

function emptyEliteLeaderboard(reason = "轻量实时模式跳过 Top100 持仓深挖") {
  return {
    source: "Polymarket Data API",
    ok: false,
    updatedAt: new Date().toISOString(),
    skipped: true,
    error: reason,
    rankingBasis: "SPORTS 表现候选账号 + 足球已结算样本过滤",
    traders: [],
    marketPositions: {
      ok: false,
      source: "Polymarket Data API /v1/market-positions",
      updatedAt: new Date().toISOString(),
      skipped: true,
      conditionsChecked: 0,
      tokensWithElitePositions: 0,
      error: reason
    }
  };
}

function attachEmptyEliteSignals(matches, polymarket, reason = "轻量实时模式跳过 Top100 持仓深挖") {
  for (const match of matches || []) {
    for (const recommendation of match.recommendations || []) {
      recommendation.eliteSignals = [];
      recommendation.eliteSummary = {
        count: 0,
        totalCurrentValue: 0,
        totalBought: 0,
        topTrader: ""
      };
      recommendation.topHolders = [];
      recommendation.holderSummary = {
        count: 0,
        totalShares: 0,
        totalCurrentValue: 0,
        eliteCount: 0,
        topHolder: ""
      };
      if (recommendation.chart) recommendation.chart.topHolders = [];
    }
    match.eliteSummary = {
      activePositions: 0,
      activeTraders: 0,
      totalCurrentValue: 0,
      totalBought: 0,
      topHolderPositions: 0,
      topHolderAccounts: 0,
      topHolderShares: 0,
      updatedAt: new Date().toISOString(),
      source: "Polymarket Data API /v1/market-positions",
      skipped: true,
      reason
    };
  }
  for (const market of polymarket?.markets || []) {
    for (const token of market.tokens || []) {
      token.topHolders = [];
      token.holderSummary = {
        count: 0,
        totalShares: 0,
        totalCurrentValue: 0,
        eliteCount: 0,
        topHolder: ""
      };
    }
  }
  return emptyEliteLeaderboard(reason);
}

async function attachEliteSignals(matches, polymarket, { force = false, enabled = true } = {}) {
  if (!enabled) return attachEmptyEliteSignals(matches, polymarket, "轻量实时模式跳过 Top100 持仓深挖");
  const leaderboard = await fetchEliteLeaderboard({ force });
  const traderMap = new Map((leaderboard.traders || []).map((trader) => [walletKey(trader.proxyWallet), trader]));
  const catalog = recommendationMarketCatalog(matches);
  const marketPoolConditionIds = (polymarket?.markets || []).map((market) => market.conditionId).filter(Boolean);
  const conditionIds = [...new Set([...catalog.map((item) => item.conditionId), ...marketPoolConditionIds].filter(Boolean))];
  let marketPositionResults = [];
  let marketError = "";

  if (conditionIds.length) {
    marketPositionResults = await mapLimit(conditionIds, 4, (conditionId) => fetchMarketPositions(conditionId));
    marketError = marketPositionResults.find((item) => !item.ok)?.error || "";
  }

  const positionsByCondition = new Map(marketPositionResults.map((item) => [item.conditionId, item]));
  const signalMap = new Map();
  const holderMap = new Map();
  for (const item of catalog) {
    const marketPositions = positionsByCondition.get(item.conditionId);
    const tokenPositions = marketPositions?.positionsByToken?.[String(item.tokenId)] || [];
    const topHolders = normalizeTopHoldersForToken(tokenPositions, traderMap);
    holderMap.set(`${item.matchId}:${item.recommendationKey}`, topHolders);

    const elitePositions = tokenPositions
      .map((position) => {
        const trader = traderMap.get(walletKey(position.proxyWallet));
        const normalized = trader ? normalizeEliteMarketPosition(position, trader) : null;
        return normalized ? {
          ...normalized,
          asset: position.asset || position.token || item.tokenId,
          conditionId: item.conditionId
        } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.currentValue - a.currentValue);
    signalMap.set(`${item.matchId}:${item.recommendationKey}`, elitePositions);
  }

  const allSignals = [...signalMap.values()].flat();
  const enrichedSignals = await enrichSignalsWithActivity(allSignals);
  const enrichedQueues = new Map();
  for (const signal of enrichedSignals) {
    const key = `${signal.conditionId}:${signal.asset}:${walletKey(signal.proxyWallet)}:${signal.outcome}`;
    if (!enrichedQueues.has(key)) enrichedQueues.set(key, []);
    enrichedQueues.get(key).push(signal);
  }
  for (const [mapKey, signals] of signalMap.entries()) {
    signalMap.set(mapKey, signals.map((signal) => {
      const key = `${signal.conditionId}:${signal.asset}:${walletKey(signal.proxyWallet)}:${signal.outcome}`;
      return (enrichedQueues.get(key) || []).shift() || signal;
    }));
  }

  let tokensWithElitePositions = 0;
  for (const match of matches || []) {
    let matchCount = 0;
    let matchCurrentValue = 0;
    let matchTotalBought = 0;
    const activeTraderWallets = new Set();
    const activeHolderWallets = new Set();
    let matchHolderCount = 0;
    let matchHolderShares = 0;
    for (const recommendation of match.recommendations || []) {
      const signals = signalMap.get(`${match.id}:${recommendation.key}`) || [];
      const topHolders = holderMap.get(`${match.id}:${recommendation.key}`) || [];
      recommendation.eliteSignals = signals;
      recommendation.eliteSummary = {
        count: signals.length,
        totalCurrentValue: signals.reduce((sum, signal) => sum + signal.currentValue, 0),
        totalBought: signals.reduce((sum, signal) => sum + signal.totalBought, 0),
        topTrader: signals[0]?.userName || ""
      };
      recommendation.topHolders = topHolders;
      recommendation.holderSummary = {
        count: topHolders.length,
        totalShares: topHolders.reduce((sum, holder) => sum + holder.size, 0),
        totalCurrentValue: topHolders.reduce((sum, holder) => sum + holder.currentValue, 0),
        eliteCount: topHolders.filter((holder) => holder.isElite).length,
        topHolder: topHolders[0]?.userName || ""
      };
      if (signals.length) tokensWithElitePositions += 1;
      matchCount += signals.length;
      matchCurrentValue += recommendation.eliteSummary.totalCurrentValue;
      matchTotalBought += recommendation.eliteSummary.totalBought;
      signals.forEach((signal) => activeTraderWallets.add(walletKey(signal.proxyWallet)));
      matchHolderCount += topHolders.length;
      matchHolderShares += recommendation.holderSummary.totalShares;
      topHolders.forEach((holder) => activeHolderWallets.add(walletKey(holder.proxyWallet)));
    }
    match.eliteSummary = {
      activePositions: matchCount,
      activeTraders: activeTraderWallets.size,
      totalCurrentValue: matchCurrentValue,
      totalBought: matchTotalBought,
      topHolderPositions: matchHolderCount,
      topHolderAccounts: activeHolderWallets.size,
      topHolderShares: matchHolderShares,
      updatedAt: new Date().toISOString(),
      source: "Polymarket Data API /v1/market-positions"
    };
  }

  const positionsByTokenKey = new Map();
  for (const item of marketPositionResults) {
    for (const [tokenId, positions] of Object.entries(item.positionsByToken || {})) {
      positionsByTokenKey.set(`${item.conditionId}:${tokenId}`, positions);
    }
  }
  for (const match of matches || []) {
    for (const recommendation of match.recommendations || []) {
      if (!recommendation.chart?.conditionId || !recommendation.chart?.tokenId) continue;
      const holders = holderMap.get(`${match.id}:${recommendation.key}`) || normalizeTopHoldersForToken(
        positionsByTokenKey.get(`${recommendation.chart.conditionId}:${recommendation.chart.tokenId}`) || [],
        traderMap
      );
      recommendation.chart.topHolders = holders;
    }
  }
  for (const market of polymarket?.markets || []) {
    const marketPositions = positionsByCondition.get(market.conditionId);
    for (const token of market.tokens || []) {
      const tokenPositions = marketPositions?.positionsByToken?.[String(token.tokenId)] || [];
      token.topHolders = normalizeTopHoldersForToken(tokenPositions, traderMap);
      token.holderSummary = {
        count: token.topHolders.length,
        totalShares: token.topHolders.reduce((sum, holder) => sum + holder.size, 0),
        totalCurrentValue: token.topHolders.reduce((sum, holder) => sum + holder.currentValue, 0),
        eliteCount: token.topHolders.filter((holder) => holder.isElite).length,
        topHolder: token.topHolders[0]?.userName || ""
      };
    }
  }

  return {
    ...leaderboard,
    marketPositions: {
      ok: leaderboard.ok && (!conditionIds.length || !marketError),
      source: "Polymarket Data API /v1/market-positions",
      updatedAt: new Date().toISOString(),
      conditionsChecked: conditionIds.length,
      tokensWithElitePositions,
      error: marketError || undefined
    }
  };
}

function scheduleBackgroundDashboardRefresh() {
  if (backgroundRefreshPromise) return;
  backgroundRefreshPromise = buildDashboard({
    force: true,
    recordHistory: false,
    includeElite: true,
    includeOpenAi: true,
    light: false,
    background: true
  }).catch((error) => {
    console.error(`Background dashboard refresh failed: ${error.message}`);
  }).finally(() => {
    backgroundRefreshPromise = null;
  });
}

function scheduleBackgroundLightRefresh() {
  if (backgroundRefreshPromise) return;
  backgroundRefreshPromise = buildDashboard({
    force: true,
    recordHistory: false,
    includeElite: false,
    includeOpenAi: false,
    light: true,
    background: true
  }).catch((error) => {
    console.error(`Background light dashboard refresh failed: ${error.message}`);
  }).finally(() => {
    backgroundRefreshPromise = null;
  });
}

async function getPersistedLightCache() {
  if (lightDashboardCache) return lightDashboardCache;
  const cached = await readOptionalJson(LIVE_CACHE_PATH, null);
  if (!cached?.matches?.length) return null;
  lightDashboardCache = cached;
  lightDashboardCacheAt = Date.parse(cached.meta?.generatedAt || "") || Date.now();
  return lightDashboardCache;
}

function mergeCachedEliteSignals(matches, polymarket, cachedPayload) {
  if (!cachedPayload?.matches?.length) return null;
  const cachedMatches = new Map((cachedPayload.matches || []).map((match) => [match.id, match]));
  for (const match of matches || []) {
    const cachedMatch = cachedMatches.get(match.id);
    if (!cachedMatch) continue;
    if (cachedMatch.eliteSummary) {
      match.eliteSummary = {
        ...cachedMatch.eliteSummary,
        cacheHit: true
      };
    }
    const cachedRecommendations = new Map((cachedMatch.recommendations || []).map((rec) => [rec.key, rec]));
    for (const recommendation of match.recommendations || []) {
      const cachedRec = cachedRecommendations.get(recommendation.key);
      if (!cachedRec) continue;
      recommendation.eliteSignals = cachedRec.eliteSignals || [];
      recommendation.eliteSummary = cachedRec.eliteSummary || recommendation.eliteSummary;
      recommendation.topHolders = cachedRec.topHolders || [];
      recommendation.holderSummary = cachedRec.holderSummary || recommendation.holderSummary;
      if (recommendation.chart && cachedRec.chart?.topHolders) {
        recommendation.chart.topHolders = cachedRec.chart.topHolders;
      }
    }
  }

  const cachedTokens = new Map();
  for (const market of cachedPayload.polymarket?.markets || []) {
    for (const token of market.tokens || []) {
      if (!market.conditionId || !token.tokenId) continue;
      cachedTokens.set(`${market.conditionId}:${token.tokenId}`, token);
    }
  }
  for (const market of polymarket?.markets || []) {
    for (const token of market.tokens || []) {
      const cachedToken = cachedTokens.get(`${market.conditionId}:${token.tokenId}`);
      if (!cachedToken) continue;
      token.topHolders = cachedToken.topHolders || [];
      token.holderSummary = cachedToken.holderSummary || token.holderSummary;
    }
  }

  return cachedPayload.eliteTraders
    ? {
      ...cachedPayload.eliteTraders,
      cacheHit: true,
      updatedAt: cachedPayload.eliteTraders.updatedAt || cachedPayload.meta?.generatedAt || new Date().toISOString()
    }
    : null;
}

async function buildDashboard({
  force = false,
  recordHistory = true,
  includeElite = true,
  includeOpenAi = true,
  light = false,
  background = false
} = {}) {
  const now = Date.now();
  if (light && !force && lightDashboardCache && now - lightDashboardCacheAt < LIGHT_CACHE_TTL_MS) {
    return lightDashboardCache;
  }
  if (!light && !force && dashboardCache && now - dashboardCacheAt < CACHE_TTL_MS) {
    return dashboardCache;
  }

  const local = await readJson(DATA_PATH);
  const fifaRankings = await readOptionalJson(FIFA_RANKINGS_PATH, {
    source: "FIFA/Coca-Cola Men's World Ranking",
    sourceUrl: "https://inside.fifa.com/fifa-world-ranking/men",
    updatedAt: "",
    nextUpdateAt: "",
    rankings: {},
    ok: false,
    error: "data/fifa-rankings.json 缺失或未初始化"
  });
  const worldCupRecords = await readOptionalJson(WORLD_CUP_RECORDS_PATH, {
    source: "Wikipedia - National team appearances in the FIFA World Cup",
    sourceUrl: "https://en.wikipedia.org/wiki/National_team_appearances_in_the_FIFA_World_Cup",
    updatedAt: "",
    asOf: "",
    records: {},
    ok: false,
    error: "data/world-cup-records.json 缺失或未初始化"
  });
  const squadProfiles = await readOptionalJson(SQUAD_PROFILES_PATH, {
    source: "World Cup 2026 Team Stats: Age, Height & Club Tiers by Country",
    sourceUrl: "https://mikami3345.cloudfree.jp/WorldCup2026/WorldCupNations/English-ver/WorldCupNations-En.html",
    rawSquadsUrl: "https://mikami3345.cloudfree.jp/WorldCup2026/WorldCupNations/all_squads-manual.json",
    updatedAt: "",
    teams: {},
    ok: false,
    error: "data/squad-profiles.json 缺失或未初始化；请运行 npm run sync:squad-profiles"
  });
  const researchFramework = await readOptionalJson(RESEARCH_FRAMEWORK_PATH, {
    ok: false,
    dimensions: [],
    tradingRules: []
  });
  const h2hOverrides = await readOptionalJson(H2H_OVERRIDES_PATH, { pairs: {} });
  const context = await readOptionalJson(CONTEXT_PATH, {
    meta: {
      ok: false,
      lastUpdated: null,
      source: "动态情报快照",
      error: "data/worldcup-context.json 不存在；请运行 npm run sync:context"
    },
    matches: {}
  });
  const [schedule, finalResults] = await Promise.all([
    fetchScheduleWindow(),
    fetchFinalResults()
  ]);
  const effectiveWorldCupRecords = applyRecordedWorldCupResults(worldCupRecords, local.matches, schedule.matches || [], finalResults);
  const polymarket = await fetchPolymarket(schedule);
  const allModeledMatches = local.matches.map((match) => normalizeMatch(match, local.teams, context, polymarket, effectiveWorldCupRecords, squadProfiles));
  const { matches, visibility } = filterAndAugmentMatches(allModeledMatches, schedule, finalResults, polymarket, context, fifaRankings, effectiveWorldCupRecords, squadProfiles, h2hOverrides);
  attachMarketCharts(matches, polymarket);
  let eliteTraders = await attachEliteSignals(matches, polymarket, { force, enabled: includeElite });
  if (!includeElite) {
    eliteTraders = mergeCachedEliteSignals(matches, polymarket, dashboardCache) || eliteTraders;
  }
  await attachAiPredictions(matches, { useOpenAi: includeOpenAi });
  const payload = {
    meta: {
      ...local.meta,
      generatedAt: new Date().toISOString(),
      cacheTtlSeconds: Math.round(CACHE_TTL_MS / 1000),
      lightMode: Boolean(light),
      backgroundRefresh: Boolean(backgroundRefreshPromise),
      matchWindow: visibility
    },
    sources: [
      {
        source: "本地研究基线",
        ok: true,
        lastUpdated: local.meta.lastManualUpdate
      },
      {
        source: "研究框架",
        ok: researchFramework.ok !== false,
        lastUpdated: researchFramework.updatedAt || researchFramework.version || "",
        error: researchFramework.ok === false ? "research-framework.json 缺失或未初始化" : undefined
      },
      {
        source: "FIFA 世界排名",
        ok: fifaRankings.ok !== false,
        lastUpdated: fifaRankings.updatedAt || "",
        error: fifaRankings.error,
        detail: `${Object.keys(fifaRankings.rankings || {}).length} 队排名快照 · 下一次官方更新 ${fifaRankings.nextUpdateAt || "待确认"}`
      },
      {
        source: "世界杯历史战绩",
        ok: effectiveWorldCupRecords.ok !== false,
        lastUpdated: effectiveWorldCupRecords.updatedAt || "",
        error: effectiveWorldCupRecords.error,
        detail: `${Object.keys(effectiveWorldCupRecords.records || {}).length} 队世界杯正赛历史快照${effectiveWorldCupRecords.appliedFinalResults ? ` · 已叠加 ${effectiveWorldCupRecords.appliedFinalResults} 场本地完赛结果` : ""}`
      },
      {
        source: "阵容身体与分线 profile",
        ok: squadProfiles.ok !== false,
        lastUpdated: squadProfiles.updatedAt || "",
        error: squadProfiles.error,
        detail: `${Object.keys(squadProfiles.teams || {}).length} 队 · 身高/年龄/出场/俱乐部分层 proxy`
      },
      {
        source: "动态情报快照",
        ok: context.meta?.ok !== false,
        lastUpdated: context.meta?.lastUpdated || "",
        error: context.meta?.error
      },
      {
        source: "三天赛程窗口",
        ok: schedule.ok,
        lastUpdated: schedule.lastUpdated || "",
        error: schedule.error,
        detail: `${visibility.modeledVisible} 场完整模型 · ${visibility.autoBaseline} 场自动基线 · ${visibility.hiddenModeled} 场已隐藏`
      },
      {
        source: "足球高手账户",
        ok: eliteTraders.ok,
        lastUpdated: eliteTraders.updatedAt || "",
        error: eliteTraders.error || eliteTraders.marketPositions?.error,
        detail: eliteTraders.rankingBasis
      },
      polymarket
    ],
    teams: local.teams,
    fifaRankings: {
      source: fifaRankings.source,
      sourceUrl: fifaRankings.sourceUrl,
      updatedAt: fifaRankings.updatedAt,
      nextUpdateAt: fifaRankings.nextUpdateAt,
      count: Object.keys(fifaRankings.rankings || {}).length
    },
    worldCupRecords: {
      source: effectiveWorldCupRecords.source,
      sourceUrl: effectiveWorldCupRecords.sourceUrl,
      updatedAt: effectiveWorldCupRecords.updatedAt,
      asOf: effectiveWorldCupRecords.asOf,
      asOfZh: effectiveWorldCupRecords.asOfZh,
      appliedFinalResults: effectiveWorldCupRecords.appliedFinalResults || 0,
      count: Object.keys(effectiveWorldCupRecords.records || {}).length
    },
    squadProfiles: {
      source: squadProfiles.source,
      sourceUrl: squadProfiles.sourceUrl,
      rawSquadsUrl: squadProfiles.rawSquadsUrl,
      updatedAt: squadProfiles.updatedAt,
      count: Object.keys(squadProfiles.teams || {}).length,
      methodology: squadProfiles.methodology,
      methodologyZh: squadProfiles.methodologyZh
    },
    researchFramework,
    contextMeta: context.meta || {},
    schedule,
    matches,
    eliteTraders,
    polymarket
  };

  if (light) {
    lightDashboardCache = payload;
    lightDashboardCacheAt = Date.now();
    writeJsonAtomic(LIVE_CACHE_PATH, payload).catch((error) => {
      console.error(`Failed to persist live dashboard cache: ${error.message}`);
    });
    if (!background && (!dashboardCache || Date.now() - dashboardCacheAt >= CACHE_TTL_MS)) {
      scheduleBackgroundDashboardRefresh();
    }
  } else {
    const completedAt = Date.now();
    dashboardCache = payload;
    dashboardCacheAt = completedAt;
    if (!lightDashboardCache || lightDashboardCacheAt <= now) {
      lightDashboardCache = payload;
      lightDashboardCacheAt = completedAt;
    }
  }
  if (!DISABLE_HISTORY_RECORDING && recordHistory) {
    recordDashboardSnapshot(payload, { source: "api" }).catch((error) => {
      console.error(`Failed to record dashboard history: ${error.message}`);
    });
  }
  return payload;
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = stripBasePath(url.pathname);
  pathname = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    textResponse(res, 403, "Forbidden");
    return;
  }

  try {
    const body = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    const contentType = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8"
    }[ext] || "application/octet-stream";
    res.writeHead(200, {
      "content-type": contentType,
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0"
    });
    res.end(body);
  } catch (error) {
    textResponse(res, 404, "Not found");
  }
}

async function buildHistorySummary() {
  await ensureHistorySchema();
  const output = await runSql(`
SELECT json_object(
  'dbPath', ?,
  'dashboardRuns', (SELECT count(*) FROM dashboard_runs),
  'matchSnapshots', (SELECT count(*) FROM match_snapshots),
  'marketSnapshots', (SELECT count(*) FROM market_snapshots),
  'pricePoints', (SELECT count(*) FROM price_points),
  'elitePositionSnapshots', (SELECT count(*) FROM elite_position_snapshots),
  'eliteTraderRankings', (SELECT count(*) FROM elite_trader_rankings),
  'contextRuns', (SELECT count(*) FROM context_runs),
  'matchResults', (SELECT count(*) FROM match_results),
  'latestDashboardRun', (SELECT max(generated_at) FROM dashboard_runs),
  'latestContextRun', (SELECT max(captured_at) FROM context_runs)
 ) AS summary;
`, [historyDbPath()], "one");
  const line = output.trim().split("\n").filter(Boolean).pop();
  const row = line ? JSON.parse(line) : null;
  return row?.summary ? JSON.parse(row.summary) : { dbPath: historyDbPath() };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = stripBasePath(url.pathname);
    if (pathname === "/api/dashboard") {
      const force = url.searchParams.get("force") === "1";
      const light = url.searchParams.get("light") === "1";
      const recordHistory = url.searchParams.get("skipHistory") !== "1";
      if (light) {
        const cached = await getPersistedLightCache();
        if (cached) {
          const generatedAt = Date.parse(cached.meta?.generatedAt || "") || 0;
          const staleMs = Date.now() - generatedAt;
          if (force || staleMs > LIGHT_CACHE_TTL_MS) scheduleBackgroundLightRefresh();
          jsonResponse(res, 200, {
            ...cached,
            meta: {
              ...(cached.meta || {}),
              servedFromCache: true,
              backgroundRefresh: Boolean(backgroundRefreshPromise),
              cacheAgeSeconds: generatedAt ? Math.max(0, Math.round(staleMs / 1000)) : null
            }
          });
          return;
        }
      }
      jsonResponse(res, 200, await buildDashboard({
        force,
        recordHistory: recordHistory && !light,
        includeElite: !light,
        includeOpenAi: !light,
        light
      }));
      return;
    }
    if (pathname === "/api/health") {
      jsonResponse(res, 200, { ok: true, now: new Date().toISOString() });
      return;
    }
    if (pathname === "/api/history/summary") {
      jsonResponse(res, 200, { ok: true, history: await buildHistorySummary() });
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    jsonResponse(res, 500, { ok: false, error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`World Cup Polymarket dashboard running at http://localhost:${PORT}${BASE_PATH || "/"}`);
});

function stripBasePath(pathname) {
  if (!BASE_PATH) return pathname;
  if (pathname === BASE_PATH) return "/";
  if (pathname.startsWith(`${BASE_PATH}/`)) return pathname.slice(BASE_PATH.length);
  return pathname;
}
