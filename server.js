const http = require("http");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { recordDashboardSnapshot, recordMatchResult, recordLiveMatchSnapshot, ensureHistorySchema, historyDbPath, runSql } = require("./scripts/history-store");

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
const OPPORTUNITY_CACHE_PATH = path.join(ROOT, "data", "worldcup-opportunity-cache.json");
const ELITE_ACCOUNT_CACHE_PATH = path.join(ROOT, "data", "worldcup-elite-account-cache.json");
const BETTINGEXPERT_CACHE_PATH = path.join(ROOT, "data", "worldcup-bettingexpert-cache.json");
const H2H_OVERRIDES_PATH = path.join(ROOT, "data", "head-to-head-overrides.json");
const PUBLIC_DIR = path.join(ROOT, "public");
const ENV_PATH = process.env.WORLDCUP_ENV_PATH || "/etc/worldcup-dashboard.env";
const CACHE_TTL_MS = 5 * 60 * 1000;
const LIGHT_CACHE_TTL_MS = 60 * 1000;
const LIGHT_CACHE_STABILITY_MAX_AGE_MS = Number(process.env.LIGHT_CACHE_STABILITY_MAX_AGE_MS || 30 * 60 * 1000);
const FETCH_TIMEOUT_MS = 6500;
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 30000);
const AI_TRADE_PLAN_TIMEOUT_MS = Number(process.env.AI_TRADE_PLAN_TIMEOUT_MS || 4000);
const AI_TRADE_PLAN_ENABLED = process.env.AI_TRADE_PLAN_ENABLED !== "0";
const OPPORTUNITY_REFRESH_MS = Number(process.env.OPPORTUNITY_REFRESH_MS || 60 * 60 * 1000);
const OPPORTUNITY_AI_TIMEOUT_MS = Number(process.env.OPPORTUNITY_AI_TIMEOUT_MS || 25000);
const OPPORTUNITY_PRICE_CHECK_TIMEOUT_MS = Number(process.env.OPPORTUNITY_PRICE_CHECK_TIMEOUT_MS || 18000);
const OPPORTUNITY_MAX_ITEMS = Number(process.env.OPPORTUNITY_MAX_ITEMS || 8);
const OPPORTUNITY_OBSERVATION_MAX_ITEMS = Number(process.env.OPPORTUNITY_OBSERVATION_MAX_ITEMS || 10);
const OPPORTUNITY_REVIEW_LIMIT = Number(process.env.OPPORTUNITY_REVIEW_LIMIT || 40);
const OPPORTUNITY_REVIEW_SCHEMA_CHECK = process.env.OPPORTUNITY_REVIEW_SCHEMA_CHECK === "1";
const LIVE_MATCH_FETCH_TIMEOUT_MS = Number(process.env.LIVE_MATCH_FETCH_TIMEOUT_MS || 5500);
const LIVE_MARKET_REFRESH_TIMEOUT_MS = Number(process.env.LIVE_MARKET_REFRESH_TIMEOUT_MS || 8500);
const LIVE_MATCH_PERSIST_ENABLED = process.env.LIVE_MATCH_PERSIST_ENABLED !== "0";
const ESPN_WORLDCUP_SUMMARY = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary";
const PRICE_HISTORY_HOURS = 24;
const PRICE_HISTORY_FIDELITY_MINUTES = 15;
const POLYMARKET_MARKET_LIMIT = Number(process.env.POLYMARKET_MARKET_LIMIT || 360);
const POLYMARKET_HISTORY_TOKEN_LIMIT = Number(process.env.POLYMARKET_HISTORY_TOKEN_LIMIT || Math.max(360, POLYMARKET_MARKET_LIMIT * 2));
const POLYMARKET_HISTORY_BATCH_SIZE = 20;
const POLYMARKET_SPORTS_MARKET_LIMIT_PER_EVENT = 80;
const MATCH_WINDOW_DAYS = Number(process.env.MATCH_WINDOW_DAYS || 3);
const MATCH_HIDE_AFTER_HOURS = Number(process.env.MATCH_HIDE_AFTER_HOURS || 8);
const MATCH_LIVE_GRACE_HOURS = Number(process.env.MATCH_LIVE_GRACE_HOURS || 8);
const MATCH_SCHEDULE_LOOKBACK_DAYS = Number(process.env.MATCH_SCHEDULE_LOOKBACK_DAYS || 1);
const ESPN_WORLDCUP_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
const POLYMARKET_DATA_API_BASE = "https://data-api.polymarket.com";
const POLYMARKET_GAMMA_API_BASE = "https://gamma-api.polymarket.com";
const BETTINGEXPERT_BASE = "https://www.bettingexpert.com";
const BETTINGEXPERT_FETCH_TIMEOUT_MS = Number(process.env.BETTINGEXPERT_FETCH_TIMEOUT_MS || 5500);
const BETTINGEXPERT_MATCH_LIMIT = Number(process.env.BETTINGEXPERT_MATCH_LIMIT || 16);
const BETTINGEXPERT_TIPSTER_LIMIT = Number(process.env.BETTINGEXPERT_TIPSTER_LIMIT || 20);
const BETTINGEXPERT_CACHE_MAX_AGE_MS = Number(process.env.BETTINGEXPERT_CACHE_MAX_AGE_MS || 48 * 60 * 60 * 1000);
const ELITE_LEADERBOARD_CACHE_TTL_MS = Number(process.env.ELITE_LEADERBOARD_CACHE_TTL_MS || 24 * 60 * 60 * 1000);
const ELITE_TRADER_LIMIT = Number(process.env.ELITE_TRADER_LIMIT || 10);
const ELITE_MIN_WORLD_CUP_SAMPLE = Number(process.env.ELITE_MIN_WORLD_CUP_SAMPLE || 2);
const ELITE_MIN_WORLD_CUP_WIN_RATE = Number(process.env.ELITE_MIN_WORLD_CUP_WIN_RATE || 0.5);
const ELITE_MIN_WORLD_CUP_PNL = Number(process.env.ELITE_MIN_WORLD_CUP_PNL || 0);
const ELITE_DIRECTIONAL_MIN_PURITY = Number(process.env.ELITE_DIRECTIONAL_MIN_PURITY || 0.72);
const ELITE_HEDGE_MIN_SECONDARY_VALUE = Number(process.env.ELITE_HEDGE_MIN_SECONDARY_VALUE || 25);
const ELITE_TRADER_CANDIDATE_LIMIT = Number(process.env.ELITE_TRADER_CANDIDATE_LIMIT || Math.max(260, ELITE_TRADER_LIMIT * 2));
const ELITE_LEADERBOARD_PAGE_SIZE = 100;
const ELITE_CLOSED_POSITION_LIMIT = Number(process.env.ELITE_CLOSED_POSITION_LIMIT || 80);
const ELITE_CLOSED_POSITION_PAGE_SIZE = Number(process.env.ELITE_CLOSED_POSITION_PAGE_SIZE || 40);
const ELITE_CLOSED_POSITION_PAGES = Number(process.env.ELITE_CLOSED_POSITION_PAGES || 2);
const ELITE_CLOSED_POSITION_TIMEOUT_MS = Number(process.env.ELITE_CLOSED_POSITION_TIMEOUT_MS || 18000);
const ELITE_CLOSED_POSITION_DEEP_TIMEOUT_MS = Number(process.env.ELITE_CLOSED_POSITION_DEEP_TIMEOUT_MS || 30000);
const ELITE_MARKET_POSITION_LIMIT = 100;
const TOP_HOLDER_LIMIT = Number(process.env.TOP_HOLDER_LIMIT || 50);
const ELITE_MARKET_HOLDER_CANDIDATE_LIMIT = Number(process.env.ELITE_MARKET_HOLDER_CANDIDATE_LIMIT || 180);
const ELITE_ACCOUNT_HISTORY_CANDIDATE_LIMIT = Number(process.env.ELITE_ACCOUNT_HISTORY_CANDIDATE_LIMIT || 12);
const ELITE_ACCOUNT_HISTORY_CACHE_TTL_MS = Number(process.env.ELITE_ACCOUNT_HISTORY_CACHE_TTL_MS || 12 * 60 * 60 * 1000);
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
let opportunityCache = null;
let opportunityRefreshPromise = null;
let eliteLeaderboardCache = null;
let eliteLeaderboardCacheAt = 0;
let eliteAccountHistoryCache = null;
let bettingExpertCache = null;
let bettingExpertCacheDirty = false;
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

const TEAM_CONFEDERATIONS = {
  ALG: "CAF",
  CIV: "CAF",
  COD: "CAF",
  CPV: "CAF",
  EGY: "CAF",
  GHA: "CAF",
  HAI: "CONCACAF",
  MAR: "CAF",
  RSA: "CAF",
  SEN: "CAF",
  TUN: "CAF",
  CUW: "CONCACAF",
  CAN: "CONCACAF",
  MEX: "CONCACAF",
  PAN: "CONCACAF",
  USA: "CONCACAF",
  ARG: "CONMEBOL",
  BRA: "CONMEBOL",
  COL: "CONMEBOL",
  ECU: "CONMEBOL",
  PAR: "CONMEBOL",
  URU: "CONMEBOL",
  AUS: "AFC",
  IRN: "AFC",
  IRQ: "AFC",
  JOR: "AFC",
  JPN: "AFC",
  KOR: "AFC",
  KSA: "AFC",
  NZL: "OFC",
  QAT: "AFC",
  UZB: "AFC",
  AUT: "UEFA",
  BEL: "UEFA",
  BIH: "UEFA",
  CRO: "UEFA",
  CZE: "UEFA",
  ENG: "UEFA",
  ESP: "UEFA",
  FRA: "UEFA",
  GER: "UEFA",
  NED: "UEFA",
  NOR: "UEFA",
  POR: "UEFA",
  SCO: "UEFA",
  SUI: "UEFA",
  SWE: "UEFA",
  TUR: "UEFA"
};

const CONFEDERATION_LABELS_ZH = {
  AFC: "亚洲球队",
  CAF: "非洲球队",
  CONCACAF: "中北美球队",
  CONMEBOL: "南美球队",
  OFC: "大洋洲球队",
  UEFA: "欧洲球队"
};

function teamDisplayName(code, fallback = "") {
  const normalized = String(code || "").toUpperCase();
  return TEAM_DISPLAY_NAMES_ZH[normalized] || TEAM_SEARCH_NAMES[normalized] || fallback || normalized;
}

const SOCCER_POSITION_KEYWORDS = [
  "soccer",
  "world cup",
  "world-cup",
  "fifwc",
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
  "new zealand",
  "austria",
  "jordan",
  "iraq",
  "norway",
  "algeria",
  "france",
  "portugal",
  "dr congo",
  "congo",
  "uzbekistan",
  "colombia"
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

const POLYMARKET_EVENT_SLUG_OVERRIDES = {
  "BRA-HAI": ["fifwc-bra-hai-2026-06-19"]
};

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
  const body = JSON.stringify(payload);
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
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tmpPath, JSON.stringify(payload));
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

function numberOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
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

function shanghaiDateDashed(date = new Date()) {
  const key = shanghaiDateKey(date);
  return key ? `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}` : "";
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

function isInProgressStatus(status) {
  const normalized = statusName(status);
  return normalized.includes("in_progress")
    || normalized.includes("in-progress")
    || normalized.includes("live")
    || normalized.includes("first_half")
    || normalized.includes("first-half")
    || normalized.includes("second_half")
    || normalized.includes("second-half")
    || normalized.includes("extra_time")
    || normalized.includes("extra-time")
    || normalized.includes("halftime")
    || normalized.includes("half-time");
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
  return Boolean(finalResults && matchIdAliases(matchId).some((alias) => finalResults.has(alias)));
}

function poisson(lambda, goals) {
  let factorial = 1;
  for (let i = 2; i <= goals; i += 1) factorial *= i;
  return Math.exp(-lambda) * Math.pow(lambda, goals) / factorial;
}

function calibratedBttsProbability(rawBtts, lambdaHome, lambdaAway) {
  const minLambda = Math.min(lambdaHome, lambdaAway);
  const maxLambda = Math.max(lambdaHome, lambdaAway);
  const balance = maxLambda > 0 ? minLambda / maxLambda : 0;
  const bothCanScoreBoost = clamp((minLambda - 0.72) * 0.11, 0, 0.055);
  const balanceBoost = clamp((balance - 0.62) * 0.09, 0, 0.045);
  const lowTempoPenalty = lambdaHome + lambdaAway < 1.95 ? 0.025 : 0;
  const mismatchPenalty = balance < 0.5 ? 0.04 : 0;
  const recentCalibration = 0.035;
  return clamp(rawBtts + recentCalibration + bothCanScoreBoost + balanceBoost - lowTempoPenalty - mismatchPenalty, 0.18, 0.62);
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
  const calibratedBtts = calibratedBttsProbability(btts, lambdaHome, lambdaAway);
  return {
    home,
    draw,
    away,
    under25,
    over25: 1 - under25,
    btts: calibratedBtts,
    rawBtts: btts,
    topScores: scores.slice(0, 6),
    topScoresFull: scores
  };
}

function normalizeProbabilityTriplet(values) {
  const home = Math.max(0.01, Number(values.home) || 0.01);
  const draw = Math.max(0.01, Number(values.draw) || 0.01);
  const away = Math.max(0.01, Number(values.away) || 0.01);
  const total = home + draw + away;
  return {
    home: home / total,
    draw: draw / total,
    away: away / total
  };
}

function recalculateScoreSummaries(probabilities) {
  const scores = [...(probabilities.topScoresFull || [])].sort((a, b) => b.probability - a.probability);
  return {
    ...probabilities,
    topScoresFull: scores,
    topScores: scores.slice(0, 6)
  };
}

function confederationForTeam(code) {
  return TEAM_CONFEDERATIONS[String(code || "").toUpperCase()] || "OTHER";
}

function confederationLabel(code) {
  return CONFEDERATION_LABELS_ZH[code] || code || "未知地区";
}

function rankingNumber(code, fifaRankings) {
  const rank = Number(fifaRankings?.rankings?.[String(code || "").toUpperCase()]);
  return Number.isFinite(rank) && rank > 0 ? rank : null;
}

function uniqueCompletedScheduleMatches(schedule) {
  const seen = new Set();
  return (schedule?.matches || [])
    .filter((event) => event.completed || isFinishedStatus(event.status))
    .filter((event) => Number.isFinite(Number(event.homeScore)) && Number.isFinite(Number(event.awayScore)))
    .filter((event) => {
      const key = String(event.scheduleId || scheduleEventKey(event));
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildTournamentTrend(schedule, fifaRankings, now = new Date()) {
  const completed = uniqueCompletedScheduleMatches(schedule);
  const stats = {
    matches: completed.length,
    btts: 0,
    over25: 0,
    draws: 0,
    underdogGoalMatches: 0,
    favoriteCleanSheets: 0,
    favoriteWins: 0,
    rankedMatches: 0,
    confederations: {}
  };

  const teamResults = {};
  const addTeamResult = (code, goalsFor, goalsAgainst, opponentCode, rankGapSigned) => {
    const confed = confederationForTeam(code);
    if (!stats.confederations[confed]) {
      stats.confederations[confed] = {
        code: confed,
        label: confederationLabel(confed),
        teams: new Set(),
        matches: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        bttsMatches: 0,
        over25Matches: 0,
        underdogMatches: 0,
        underdogGoals: 0,
        underdogResults: 0
      };
    }
    const bucket = stats.confederations[confed];
    bucket.teams.add(code);
    bucket.matches += 1;
    bucket.goalsFor += goalsFor;
    bucket.goalsAgainst += goalsAgainst;
    if (goalsFor > goalsAgainst) bucket.wins += 1;
    else if (goalsFor === goalsAgainst) bucket.draws += 1;
    else bucket.losses += 1;
    if (goalsFor > 0 && goalsAgainst > 0) bucket.bttsMatches += 1;
    if (goalsFor + goalsAgainst > 2.5) bucket.over25Matches += 1;
    if (rankGapSigned > 0) {
      bucket.underdogMatches += 1;
      if (goalsFor > 0) bucket.underdogGoals += 1;
      if (goalsFor >= goalsAgainst) bucket.underdogResults += 1;
    }
    if (!teamResults[code]) {
      teamResults[code] = {
        code,
        confederation: confed,
        matches: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        bttsMatches: 0,
        over25Matches: 0
      };
    }
    teamResults[code].matches += 1;
    teamResults[code].goalsFor += goalsFor;
    teamResults[code].goalsAgainst += goalsAgainst;
    if (goalsFor > 0 && goalsAgainst > 0) teamResults[code].bttsMatches += 1;
    if (goalsFor + goalsAgainst > 2.5) teamResults[code].over25Matches += 1;
  };

  for (const event of completed) {
    const home = eventTeamCode(event, "home");
    const away = eventTeamCode(event, "away");
    const homeGoals = Number(event.homeScore);
    const awayGoals = Number(event.awayScore);
    const total = homeGoals + awayGoals;
    const homeRank = rankingNumber(home, fifaRankings);
    const awayRank = rankingNumber(away, fifaRankings);
    const hasRanks = Boolean(homeRank && awayRank);
    if (homeGoals > 0 && awayGoals > 0) stats.btts += 1;
    if (total > 2.5) stats.over25 += 1;
    if (homeGoals === awayGoals) stats.draws += 1;
    if (hasRanks) {
      stats.rankedMatches += 1;
      const homeFavored = homeRank < awayRank;
      const favoriteGoals = homeFavored ? homeGoals : awayGoals;
      const underdogGoals = homeFavored ? awayGoals : homeGoals;
      if (underdogGoals > 0) stats.underdogGoalMatches += 1;
      if (underdogGoals === 0) stats.favoriteCleanSheets += 1;
      if (favoriteGoals > underdogGoals) stats.favoriteWins += 1;
    }
    addTeamResult(home, homeGoals, awayGoals, away, hasRanks ? homeRank - awayRank : 0);
    addTeamResult(away, awayGoals, homeGoals, home, hasRanks ? awayRank - homeRank : 0);
  }

  const sampleWeight = clamp(stats.matches / 24, 0, 1);
  const bttsRate = stats.matches ? stats.btts / stats.matches : null;
  const over25Rate = stats.matches ? stats.over25 / stats.matches : null;
  const drawRate = stats.matches ? stats.draws / stats.matches : null;
  const underdogGoalRate = stats.rankedMatches ? stats.underdogGoalMatches / stats.rankedMatches : null;
  const favoriteCleanSheetRate = stats.rankedMatches ? stats.favoriteCleanSheets / stats.rankedMatches : null;
  const favoriteWinRate = stats.rankedMatches ? stats.favoriteWins / stats.rankedMatches : null;
  const signals = [];
  const adjustments = {
    bttsDelta: 0,
    over25Delta: 0,
    under25Delta: 0,
    drawDelta: 0,
    underdogWinDelta: 0,
    underdogHandicapDelta: 0
  };

  if (stats.matches >= 6 && bttsRate > 0.58) {
    adjustments.bttsDelta = clamp((bttsRate - 0.5) * 0.22 * sampleWeight, 0.01, 0.055);
    signals.push({
      id: "btts-hot",
      label: "双方进球偏热",
      strength: "medium",
      text: `本届已完赛 ${stats.matches} 场里 BTTS ${stats.btts} 场（${formatPercent(bttsRate)}），弱队并非只挨打。`,
      appliesTo: ["btts", "over25"]
    });
  }
  if (stats.matches >= 6 && over25Rate > 0.54) {
    adjustments.over25Delta = clamp((over25Rate - 0.5) * 0.16 * sampleWeight, 0.006, 0.04);
    adjustments.under25Delta = -adjustments.over25Delta;
    signals.push({
      id: "goal-tempo-hot",
      label: "进球环境偏开放",
      strength: "medium",
      text: `大 2.5 已出 ${stats.over25}/${stats.matches}（${formatPercent(over25Rate)}），小球信号需要降权。`,
      appliesTo: ["total"]
    });
  }
  if (stats.rankedMatches >= 6 && underdogGoalRate > 0.55) {
    adjustments.underdogWinDelta = clamp((underdogGoalRate - 0.5) * 0.08 * sampleWeight, 0.004, 0.03);
    adjustments.underdogHandicapDelta = clamp((underdogGoalRate - 0.5) * 0.12 * sampleWeight, 0.006, 0.04);
    signals.push({
      id: "underdog-scoring",
      label: "弱队进球能力被低估",
      strength: "medium",
      text: `有排名样本里弱队进球 ${stats.underdogGoalMatches}/${stats.rankedMatches}（${formatPercent(underdogGoalRate)}），强队零封假设要打折。`,
      appliesTo: ["btts", "handicap", "favorite-moneyline"]
    });
  }
  if (stats.matches >= 6 && drawRate > 0.28) {
    adjustments.drawDelta = clamp((drawRate - 0.25) * 0.08 * sampleWeight, 0.003, 0.025);
    signals.push({
      id: "draw-resistance",
      label: "平局阻力偏高",
      strength: "low",
      text: `平局 ${stats.draws}/${stats.matches}（${formatPercent(drawRate)}），领先方优势不能过度外推。`,
      appliesTo: ["draw", "handicap"]
    });
  }

  const confederations = Object.values(stats.confederations).map((bucket) => {
    const matches = bucket.matches || 0;
    return {
      code: bucket.code,
      label: bucket.label,
      teams: [...bucket.teams],
      matches,
      wins: bucket.wins,
      draws: bucket.draws,
      losses: bucket.losses,
      pointsPerMatch: matches ? roundTo((bucket.wins * 3 + bucket.draws) / matches, 2) : null,
      goalsForPerMatch: matches ? roundTo(bucket.goalsFor / matches, 2) : null,
      goalsAgainstPerMatch: matches ? roundTo(bucket.goalsAgainst / matches, 2) : null,
      bttsRate: matches ? bucket.bttsMatches / matches : null,
      over25Rate: matches ? bucket.over25Matches / matches : null,
      underdogGoalRate: bucket.underdogMatches ? bucket.underdogGoals / bucket.underdogMatches : null,
      underdogResultRate: bucket.underdogMatches ? bucket.underdogResults / bucket.underdogMatches : null
    };
  }).sort((a, b) => (b.pointsPerMatch || 0) - (a.pointsPerMatch || 0));

  for (const bucket of confederations) {
    if (bucket.code === "CAF" && bucket.matches >= 4 && ((bucket.bttsRate || 0) >= 0.55 || (bucket.underdogGoalRate || 0) >= 0.5)) {
      signals.push({
        id: "caf-athletic-resistance",
        label: "非洲球队抗预期",
        strength: "medium",
        text: `非洲球队本届 ${bucket.wins}-${bucket.draws}-${bucket.losses}，场均进 ${bucket.goalsForPerMatch} 球；数据支持“抗预期/不易被零封”，速度、身体和转换作为赛前重点复核项。`,
        appliesTo: ["CAF", "btts", "handicap"]
      });
      break;
    }
  }

  return {
    ok: stats.matches > 0,
    source: "ESPN FIFA World Cup scoreboard + 本地结果去重",
    updatedAt: new Date().toISOString(),
    sampleSize: stats.matches,
    sampleWeight: roundTo(sampleWeight, 3),
    rates: {
      btts: bttsRate,
      over25: over25Rate,
      under25: over25Rate == null ? null : 1 - over25Rate,
      draw: drawRate,
      underdogGoal: underdogGoalRate,
      favoriteCleanSheet: favoriteCleanSheetRate,
      favoriteWin: favoriteWinRate
    },
    adjustments,
    signals,
    confederations,
    completedMatches: completed.map((event) => ({
      scheduleId: event.scheduleId,
      kickoffUtc: event.kickoffUtc,
      home: eventTeamCode(event, "home"),
      away: eventTeamCode(event, "away"),
      homeName: eventTeamName(event, "home"),
      awayName: eventTeamName(event, "away"),
      score: `${event.homeScore}-${event.awayScore}`,
      btts: Number(event.homeScore) > 0 && Number(event.awayScore) > 0,
      over25: Number(event.homeScore) + Number(event.awayScore) > 2.5
    })),
    summary: stats.matches
      ? `本届已完赛 ${stats.matches} 场：BTTS ${stats.btts}/${stats.matches}，大 2.5 ${stats.over25}/${stats.matches}，平局 ${stats.draws}/${stats.matches}。`
      : "本届已完赛样本不足，暂不启用趋势修正。"
  };
}

function teamTrendProfile(code, tournamentTrend) {
  const normalized = String(code || "").toUpperCase();
  const confed = confederationForTeam(normalized);
  const confedProfile = (tournamentTrend?.confederations || []).find((item) => item.code === confed);
  return {
    code: normalized,
    confederation: confed,
    confederationLabel: confederationLabel(confed),
    confederationProfile: confedProfile || null
  };
}

function probabilityShift(value, delta) {
  return clamp((Number(value) || 0) + (Number(delta) || 0), 0.03, 0.97);
}

function applyTournamentTrendToMatch(match, tournamentTrend, fifaRankings = {}) {
  if (!tournamentTrend?.ok || !match?.probabilities) {
    match.tournamentTrend = {
      applied: false,
      sampleSize: tournamentTrend?.sampleSize || 0,
      notes: ["本届样本不足，暂不做趋势修正。"]
    };
    return match;
  }

  const trend = tournamentTrend;
  const homeRank = rankingNumber(match.home, fifaRankings);
  const awayRank = rankingNumber(match.away, fifaRankings);
  const homeConfed = confederationForTeam(match.home);
  const awayConfed = confederationForTeam(match.away);
  const sampleWeight = Number(trend.sampleWeight) || 0;
  const deltas = {
    btts: 0,
    over25: 0,
    under25: 0,
    home: 0,
    draw: 0,
    away: 0
  };
  const notes = [];

  if (trend.adjustments?.bttsDelta) {
    deltas.btts += trend.adjustments.bttsDelta;
    notes.push(`BTTS 赛会热度 +${formatPercent(trend.adjustments.bttsDelta)}。`);
  }
  if (trend.adjustments?.over25Delta) {
    deltas.over25 += trend.adjustments.over25Delta;
    deltas.under25 -= trend.adjustments.over25Delta;
    notes.push(`本届进球节奏偏开放，小球概率下修 ${formatPercent(trend.adjustments.over25Delta)}。`);
  }
  if (trend.adjustments?.drawDelta) {
    deltas.draw += trend.adjustments.drawDelta;
    notes.push(`平局阻力趋势 +${formatPercent(trend.adjustments.drawDelta)}。`);
  }

  if (homeRank && awayRank && trend.adjustments?.underdogWinDelta) {
    const homeUnderdog = homeRank > awayRank;
    const underdogKey = homeUnderdog ? "home" : "away";
    const favoriteKey = homeUnderdog ? "away" : "home";
    deltas[underdogKey] += trend.adjustments.underdogWinDelta;
    deltas[favoriteKey] -= trend.adjustments.underdogWinDelta * 0.65;
    deltas.btts += Math.min(0.018, trend.adjustments.underdogWinDelta * 0.7);
    notes.push(`弱队进球趋势让 ${homeUnderdog ? match.homeName : match.awayName} 胜/受让侧小幅上修。`);
  }

  for (const side of ["home", "away"]) {
    const code = side === "home" ? match.home : match.away;
    const confed = side === "home" ? homeConfed : awayConfed;
    if (confed !== "CAF") continue;
    const profile = (trend.confederations || []).find((item) => item.code === "CAF");
    if (!profile || profile.matches < 4) continue;
    const otherRank = side === "home" ? awayRank : homeRank;
    const thisRank = side === "home" ? homeRank : awayRank;
    const isUnderdog = thisRank && otherRank ? thisRank > otherRank : false;
    const cafDelta = clamp(0.008 * sampleWeight + ((profile.underdogGoalRate || 0) - 0.45) * 0.025 * sampleWeight, 0.004, 0.02);
    deltas.btts += cafDelta;
    if (isUnderdog) {
      deltas[side] += cafDelta * 0.8;
      deltas[side === "home" ? "away" : "home"] -= cafDelta * 0.45;
    }
    notes.push(`${match[`${side}Name`]} 属于非洲样本组，本届非洲队进球/抗预期样本较强，速度、身体和转换作为重点复核项，零封假设降权。`);
  }

  const winTriplet = normalizeProbabilityTriplet({
    home: match.probabilities.home + deltas.home,
    draw: match.probabilities.draw + deltas.draw,
    away: match.probabilities.away + deltas.away
  });
  const over25 = probabilityShift(match.probabilities.over25, deltas.over25);
  const btts = probabilityShift(match.probabilities.btts, deltas.btts);
  match.probabilities = recalculateScoreSummaries({
    ...match.probabilities,
    ...winTriplet,
    over25,
    under25: 1 - over25,
    btts,
    trendAdjusted: true
  });
  match.tournamentTrend = {
    applied: notes.length > 0,
    sampleSize: trend.sampleSize,
    sampleWeight: trend.sampleWeight,
    rates: trend.rates,
    signals: (trend.signals || []).slice(0, 5),
    home: teamTrendProfile(match.home, trend),
    away: teamTrendProfile(match.away, trend),
    deltas: Object.fromEntries(Object.entries(deltas).map(([key, value]) => [key, roundTo(value, 4)])),
    notes: notes.length ? [...new Set(notes)].slice(0, 5) : ["本场没有明显赛会趋势修正。"],
    updatedAt: trend.updatedAt
  };
  match.dynamicModel = match.dynamicModel || {};
  match.dynamicModel.tournamentTrend = match.tournamentTrend;
  return match;
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

function handicapProbabilityFromProbabilities(probabilities, homeLine, side) {
  if (typeof homeLine !== "number") return handicapProbability(probabilities.topScoresFull || [], homeLine, side);
  if (homeLine === -0.5) {
    return side === "home"
      ? { win: probabilities.home, push: 0, lose: probabilities.draw + probabilities.away }
      : { win: probabilities.draw + probabilities.away, push: 0, lose: probabilities.home };
  }
  if (homeLine === 0.5) {
    return side === "home"
      ? { win: probabilities.home + probabilities.draw, push: 0, lose: probabilities.away }
      : { win: probabilities.away, push: 0, lose: probabilities.home + probabilities.draw };
  }
  if (homeLine === 0) {
    return side === "home"
      ? { win: probabilities.home, push: probabilities.draw, lose: probabilities.away }
      : { win: probabilities.away, push: probabilities.draw, lose: probabilities.home };
  }
  return handicapProbability(probabilities.topScoresFull || [], homeLine, side);
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
  if (edgeValue >= 0.085) return { action: "BUY", label: "强正向信号", stake: "small-medium" };
  if (edgeValue >= 0.06) return { action: "BUY_SMALL", label: "正向信号", stake: "small" };
  if (edgeValue >= 0.035) return { action: "WATCH", label: "观察价格", stake: "none" };
  if (edgeValue <= -0.035) return { action: "AVOID_OR_SELL", label: "回避", stake: "none" };
  return { action: "NO_TRADE", label: "无明确信号", stake: "none" };
}

function scoreProbability(match, score) {
  const item = (match?.probabilities?.topScoresFull || []).find((row) => row.score === score);
  return typeof item?.probability === "number" ? item.probability : 0;
}

function exactCleanSheetRisk(match, side) {
  const scores = match?.probabilities?.topScoresFull || [];
  return scores.reduce((sum, row) => {
    const homeGoals = Number(row.homeGoals);
    const awayGoals = Number(row.awayGoals);
    if (!Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) return sum;
    if (side === "home" && awayGoals === 0 && homeGoals > awayGoals) return sum + (row.probability || 0);
    if (side === "away" && homeGoals === 0 && awayGoals > homeGoals) return sum + (row.probability || 0);
    return sum;
  }, 0);
}

function lowScoreCleanSheetMass(match) {
  const scores = match?.probabilities?.topScoresFull || [];
  return scores.reduce((sum, row) => {
    const homeGoals = Number(row.homeGoals);
    const awayGoals = Number(row.awayGoals);
    if (!Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) return sum;
    const totalGoals = homeGoals + awayGoals;
    if (totalGoals <= 2 && (homeGoals === 0 || awayGoals === 0)) return sum + (row.probability || 0);
    return sum;
  }, 0);
}

function marketReviewAdjustments(match, rec) {
  const reasons = [];
  let edgePenalty = 0;
  let scorePenalty = 0;
  const favoriteKey = match?.probabilities?.home >= match?.probabilities?.away ? "home" : "away";
  const favoriteSide = favoriteKey;
  const favoriteCleanSheet = exactCleanSheetRisk(match, favoriteSide);
  const under25 = match?.probabilities?.under25 || 0;
  const btts = match?.probabilities?.btts || 0;

  if (rec.marketType === "btts" && rec.key === "bttsYes") {
    const oneNilRisk = scoreProbability(match, "1-0") + scoreProbability(match, "0-1");
    const nilNilRisk = scoreProbability(match, "0-0");
    const cleanLowScoreMass = lowScoreCleanSheetMass(match);
    if (under25 >= 0.58 && btts <= 0.61) {
      edgePenalty += 0.035;
      scorePenalty += 0.06;
      reasons.push("BTTS 与小球结构冲突：小于2.5偏高，实际更像1-0/1-1/0-0分布。");
    }
    if (favoriteCleanSheet >= 0.18 || oneNilRisk + nilNilRisk >= 0.28) {
      edgePenalty += 0.025;
      scorePenalty += 0.045;
      reasons.push("强队零封/1-0风险偏高，BTTS 不作为主推荐。");
    }
    if (cleanLowScoreMass >= 0.42 && under25 >= 0.57) {
      edgePenalty += 0.035;
      scorePenalty += 0.07;
      reasons.push("复盘规则：低比分零封路径占比过高，弱队进球不能仅凭反击想象加仓。");
    }
    if (favoriteCleanSheet >= 0.24 && rec.modelProbability < 0.58) {
      edgePenalty += 0.025;
      scorePenalty += 0.055;
      reasons.push("强队控场型优势明显，领先后更可能守住零封而不是互捅。");
    }
  }

  if (rec.marketType === "handicap" && rec.handicap) {
    const isAwayPlus = rec.key.endsWith("-away") && rec.handicap.awayLine > 0;
    const isHomePlus = rec.key.endsWith("-home") && rec.handicap.homeLine > 0;
    if ((isAwayPlus || isHomePlus) && Math.abs((isAwayPlus ? rec.handicap.awayLine : rec.handicap.homeLine) - 0.5) < 0.001) {
      const plusSide = isAwayPlus ? "away" : "home";
      const oppositeOneNil = plusSide === "away" ? scoreProbability(match, "1-0") : scoreProbability(match, "0-1");
      if (oppositeOneNil >= 0.11 || favoriteCleanSheet >= 0.18) {
        edgePenalty += 0.03;
        scorePenalty += 0.055;
        reasons.push("受让0.5存在强队一球小胜风险，低 edge 不再主推。");
      }
    }
  }

  if (rec.marketType === "moneyline" && rec.key !== favoriteKey && rec.key !== "draw") {
    if (rec.edge < 0.09) {
      edgePenalty += 0.025;
      scorePenalty += 0.045;
      reasons.push("冷门胜平负 edge 不足，优先降级为观察。");
    }
  }

  if (rec.marketType === "total" && rec.key === "under25") {
    const lowScoreMass = ["0-0", "1-0", "0-1", "1-1", "2-0", "0-2"].reduce((sum, score) => sum + scoreProbability(match, score), 0);
    if (lowScoreMass >= 0.58 && under25 >= 0.58) {
      scorePenalty -= 0.015;
      reasons.push("低比分集中度支持小球，但仍需防红牌/早球打穿。");
    }
  }

  if (rec.edge > 0 && rec.edge < 0.06) {
    scorePenalty += 0.025;
    reasons.push("edge 低于6%，只允许观察，不进主买。");
  }

  return {
    edgePenalty,
    scorePenalty,
    reasons: [...new Set(reasons)].slice(0, 4),
    conflict: reasons.length > 0
  };
}

function applyReviewDiscipline(rec, match) {
  const adjustment = marketReviewAdjustments(match, rec);
  const disciplinedEdge = typeof rec.edge === "number" ? rec.edge - adjustment.edgePenalty : rec.edge;
  rec.reviewDiscipline = {
    edgePenalty: roundTo(adjustment.edgePenalty, 4),
    scorePenalty: roundTo(adjustment.scorePenalty, 4),
    reasons: adjustment.reasons
  };
  if (typeof disciplinedEdge === "number" && Number.isFinite(disciplinedEdge)) {
    rec.disciplinedEdge = disciplinedEdge;
  }
  if (!adjustment.reasons.length || !rec.decision || ["AVOID_OR_SELL", "WAIT"].includes(rec.decision.action)) {
    return rec;
  }
  if (rec.decision.action === "BUY" || rec.decision.action === "BUY_SMALL" || rec.decision.action === "WATCH") {
    if (disciplinedEdge < 0.06 || rec.decision.action === "WATCH") {
      rec.decision = {
        action: disciplinedEdge >= 0.035 ? "WATCH" : "NO_TRADE",
        label: disciplinedEdge >= 0.035 ? "复盘降级观察" : "复盘降级不买",
        stake: "none",
        gated: true,
        reasons: [...(rec.decision.reasons || []), ...adjustment.reasons].slice(0, 6)
      };
      rec.maxBuyPrice = fairBuyPrice(rec.modelProbability, adjustment.edgePenalty > 0 ? 0.06 : 0.04);
    }
  }
  return rec;
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
  const bttsMarkets = markets.btts || {};
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
    },
    {
      key: "bttsYes",
      marketType: "btts",
      marketTypeLabel: "双方进球",
      name: "两队都有进球",
      aliases: ["两队都有进球", "both teams to score", "both teams score", "btts", "yes"],
      side: "YES",
      modelProbability: probabilities.btts,
      marketPrice: bttsMarkets.yes
    },
    {
      key: "bttsNo",
      marketType: "btts",
      marketTypeLabel: "双方进球",
      name: "不是两队都有进球",
      aliases: ["不是两队都有进球", "both teams to score no", "both teams score no", "btts no", "no"],
      side: "NO",
      modelProbability: 1 - probabilities.btts,
      marketPrice: bttsMarkets.no
    }
  ];

  for (const handicap of markets.handicaps || []) {
    const home = handicapProbabilityFromProbabilities(probabilities, handicap.homeLine, "home");
    const away = handicapProbabilityFromProbabilities(probabilities, handicap.homeLine, "away");
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
    .map((row) => applyReviewDiscipline(row, match))
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

function teamRankLabel(team, fallbackCode = "") {
  const ranking = team?.worldRanking || {};
  if (!ranking.rank) return `${team?.name || fallbackCode || "-"} 排名待补充`;
  return `${team?.name || fallbackCode || "-"} FIFA 第 ${ranking.rank}`;
}

function aiPredictionFormEvidence(match, side) {
  const record = recentRecordForSide(match, side);
  const summary = record?.summary || {};
  const team = sideNameForResult(match, side);
  if (!summary.matches) return `${team} 近况样本未同步。`;
  return `${team} 近 ${summary.matches} 场 ${summary.wins || 0}胜${summary.draws || 0}平${summary.losses || 0}负，进 ${summary.goalsFor || 0} / 失 ${summary.goalsAgainst || 0}。`;
}

function aiPredictionWorldCupEvidence(team, name) {
  const record = team?.worldCupRecord;
  if (!record || record.ok === false) return `${name} 世界杯正赛历史待补充。`;
  const pieces = [];
  if (record.appearances != null) pieces.push(`参赛 ${record.appearances} 次`);
  if (record.matches != null && record.wins != null && record.draws != null && record.losses != null) {
    pieces.push(`${record.matches} 场 ${record.wins}胜${record.draws}平${record.losses}负`);
  }
  if (record.bestFinish) pieces.push(`最佳 ${record.bestFinish}`);
  return pieces.length ? `${name} 世界杯历史：${pieces.join("，")}。` : `${name} 世界杯正赛历史已同步。`;
}

function aiPredictionMarketRead(top, rows) {
  if (!top || typeof top.marketPrice !== "number") {
    return "对应胜平负实时价格缺失，盘口只作为概率展示，不给价格判断。";
  }
  if (typeof top.edge !== "number") {
    return `${top.label} 价格 ${formatPercent(top.marketPrice)}，edge 暂不可算。`;
  }
  if (top.edge >= 0.035) {
    return `市场价格支持模型方向：${top.label} 模型 ${formatPercent(top.probability)}，价格 ${formatPercent(top.marketPrice)}，edge ${formatPercent(top.edge)}。`;
  }
  if (top.edge > 0) {
    return `市场略低估模型方向，但优势很薄：${top.label} edge ${formatPercent(top.edge)}。`;
  }
  const betterRows = rows.filter((row) => typeof row.edge === "number" && row.edge > 0).sort((a, b) => b.edge - a.edge);
  if (betterRows.length) {
    const best = betterRows[0];
    return `模型最看好 ${top.label}，但当前价格不便宜（edge ${formatPercent(top.edge)}）；相对价格更友好的是 ${best.label}，edge ${formatPercent(best.edge)}。`;
  }
  return `模型最看好 ${top.label}，但当前胜平负价格没有明显正 edge。`;
}

function aiPredictionDataGaps(match) {
  const gaps = [];
  const context = match.context || {};
  if (context.lineups?.status !== "confirmed") gaps.push("官方首发未确认，阵容变化会影响最终概率。");
  const injuries = match.completeness?.components?.find((item) => item.label === "伤停");
  if (injuries && injuries.status !== "synced") gaps.push("伤停信息未完全确认。");
  const h2h = match.headToHead || context.headToHead;
  if (h2h?.sourceStatus && h2h.sourceStatus !== "synced" && h2h.sourceStatus !== "verified") {
    gaps.push("近四年交手未结构化为可审计比分，暂不加权。");
  }
  const liveMoneyline = (match.recommendations || []).filter((rec) => rec.marketType === "moneyline" && rec.chart?.source === "Polymarket").length;
  if (!liveMoneyline) gaps.push("胜平负 Polymarket 曲线未完整匹配。");
  return gaps.slice(0, 5);
}

function aiPredictionEvidence(match, top, rows) {
  const evidence = [];
  const drivers = [];
  const context = match.context || {};
  const homeRank = match.homeTeam?.worldRanking?.rank;
  const awayRank = match.awayTeam?.worldRanking?.rank;
  evidence.push({
    label: "长期实力",
    status: homeRank && awayRank ? "synced" : "partial",
    detail: `${teamRankLabel(match.homeTeam, match.home)}；${teamRankLabel(match.awayTeam, match.away)}。`
  });
  evidence.push({
    label: "近期战绩",
    status: match.recentFormRecords?.home?.summary?.matches && match.recentFormRecords?.away?.summary?.matches ? "synced" : "partial",
    detail: `${aiPredictionFormEvidence(match, "home")} ${aiPredictionFormEvidence(match, "away")}`
  });
  evidence.push({
    label: "世界杯履历",
    status: match.homeTeam?.worldCupRecord && match.awayTeam?.worldCupRecord ? "synced" : "partial",
    detail: `${aiPredictionWorldCupEvidence(match.homeTeam, match.homeName)} ${aiPredictionWorldCupEvidence(match.awayTeam, match.awayName)}`
  });
  if (match.humanMatchup?.summary) {
    evidence.push({
      label: "阵容与人性化对位",
      status: match.humanMatchup.ok ? "synced" : "partial",
      detail: match.humanMatchup.summary
    });
    const strongInsights = (match.humanMatchup.insights || [])
      .filter((item) => item.side && item.side !== "even")
      .slice(0, 2)
      .map((item) => `${item.label}：${item.zh || item.en}`);
    drivers.push(...strongInsights);
  }
  if (context.weather?.summary) {
    evidence.push({
      label: "天气/场地",
      status: "synced",
      detail: context.weather.summary
    });
  }
  if (match.tournamentTrend?.sampleSize) {
    const rates = match.tournamentTrend.rates || {};
    evidence.push({
      label: "本届赛会趋势",
      status: "synced",
      detail: `样本 ${match.tournamentTrend.sampleSize} 场：BTTS ${formatPercent(rates.btts)}，大 2.5 ${formatPercent(rates.over25)}，平局 ${formatPercent(rates.draw)}。`
    });
    if (match.tournamentTrend.notes?.length) drivers.push(`赛会趋势：${match.tournamentTrend.notes.slice(0, 2).join(" ")}`);
  }
  if (context.aiAnalysis?.modelImpacts?.length || match.dynamicModel?.modelImpacts?.length) {
    const impacts = [...(context.aiAnalysis?.modelImpacts || []), ...(match.dynamicModel?.modelImpacts || [])]
      .filter((impact) => impact?.label || impact?.reason)
      .slice(0, 3);
    drivers.push(...impacts.map((impact) => `${impact.label || "动态调整"}：${impact.reason || ""}`.trim()));
  }
  return {
    evidence: evidence.slice(0, 6),
    drivers: [...new Set(drivers.filter(Boolean))].slice(0, 5),
    marketRead: aiPredictionMarketRead(top, rows),
    dataGaps: aiPredictionDataGaps(match)
  };
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
  if (match.tournamentTrend?.applied && match.tournamentTrend.notes?.length) {
    reasons.push(`赛会趋势修正：${match.tournamentTrend.notes.slice(0, 2).join(" ")}`);
  }
  if (eliteRows.length) {
    const eliteText = eliteRows.slice(0, 2).map((row) => `${row.name} 有 ${row.count} 个高手持仓，当前约 ${Math.round(row.totalCurrentValue).toLocaleString()} 美元`).join("；");
    reasons.push(`高手持仓信号：${eliteText}。`);
  }
  const structured = aiPredictionEvidence(match, top, rows);

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
    evidence: structured.evidence,
    modelDrivers: structured.drivers,
    marketRead: structured.marketRead,
    dataGaps: structured.dataGaps,
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
  if (rec.marketType === "btts") return 2.6;
  if (rec.marketType === "handicap") return 2;
  if (rec.marketType === "moneyline" && rec.key === "draw") return 1;
  return 0;
}

function trendScoreBoost(match, rec) {
  if (!match?.tournamentTrend?.applied || !rec) return 0;
  const deltas = match.tournamentTrend.deltas || {};
  let boost = 0;
  if (rec.key === "bttsYes" && (deltas.btts || 0) > 0) boost += Math.min(0.018, (deltas.btts || 0) * 0.7);
  if (rec.key === "over25" && (deltas.over25 || 0) > 0) boost += Math.min(0.012, (deltas.over25 || 0) * 0.6);
  if (rec.key === "under25" && (deltas.under25 || 0) < 0) boost -= Math.min(0.018, Math.abs(deltas.under25 || 0) * 0.8);
  if (rec.marketType === "handicap" && typeof rec.handicap?.homeLine === "number") {
    const isAwayUnderdog = rec.key.endsWith("-away") && rec.handicap.awayLine > 0;
    const isHomeUnderdog = rec.key.endsWith("-home") && rec.handicap.homeLine > 0;
    if (isAwayUnderdog || isHomeUnderdog) boost += 0.008;
  }
  return boost;
}

function tradableRecommendationScore(rec, match = null) {
  const edgeValue = typeof rec.disciplinedEdge === "number"
    ? rec.disciplinedEdge
    : typeof rec.edge === "number"
      ? rec.edge
      : -9;
  const holderBoost = Math.min(0.025, ((rec.eliteSummary?.count || 0) * 0.008) + ((rec.holderSummary?.eliteCount || 0) * 0.004));
  const disciplinePenalty = rec.reviewDiscipline?.scorePenalty || 0;
  return edgeValue + holderBoost + recommendationMarketPriority(rec) * 0.003 + trendScoreBoost(match, rec) - disciplinePenalty;
}

function isActionableRecommendation(rec) {
  if (typeof rec.marketPrice !== "number" || typeof rec.modelProbability !== "number") return false;
  if (rec.decision?.action === "AVOID_OR_SELL") return false;
  if (rec.reviewDiscipline?.reasons?.some((reason) => /不作为主推荐|低 edge 不再主推|BTTS 与小球结构冲突/.test(String(reason)))) return false;
  const edgeValue = typeof rec.disciplinedEdge === "number" ? rec.disciplinedEdge : rec.edge;
  if (edgeValue == null || edgeValue <= 0) return false;
  return true;
}

function isPrimaryTradeCandidate(match, rec) {
  if (!isActionableRecommendation(rec)) return false;
  const edgeValue = typeof rec.disciplinedEdge === "number" ? rec.disciplinedEdge : rec.edge;
  if (edgeValue < 0.06) return false;
  if (rec.marketType !== "moneyline") return true;
  if (rec.key === "draw") return false;
  const topWinKey = match.probabilities?.home >= match.probabilities?.away ? "home" : "away";
  return Boolean(
    match.tradingGate?.allowStrongTrade
    && rec.key === topWinKey
    && rec.modelProbability >= 0.48
    && edgeValue >= 0.06
  );
}

function sortedPrimaryRecommendations(match) {
  return [...(match.recommendations || [])]
    .filter((rec) => isPrimaryTradeCandidate(match, rec))
    .sort((a, b) => tradableRecommendationScore(b, match) - tradableRecommendationScore(a, match));
}

function sortedActionableRecommendations(match) {
  return [...(match.recommendations || [])]
    .filter(isActionableRecommendation)
    .sort((a, b) => tradableRecommendationScore(b, match) - tradableRecommendationScore(a, match));
}

function topRiskNotes(match, primary) {
  const notes = [];
  const restrictions = match.tradingGate?.reasons || [];
  if (restrictions.length) notes.push(`限制：${restrictions.join("、")}。`);
  if (match.autoBaseline) notes.push("本场仍有自动基线成分，盘口结论要按小仓/观察处理。");
  if (primary?.decision?.reasons?.length) notes.push(`降级原因：${primary.decision.reasons.join("、")}。`);
  const contextRisks = Array.isArray(match.context?.riskFlags) ? match.context.riskFlags : [];
  notes.push(...contextRisks.slice(0, 2));
  if (match.tournamentTrend?.applied) {
    notes.push(`赛会趋势：${match.tournamentTrend.notes.slice(0, 2).join(" ")}`);
  }
  if (!notes.length) notes.push("按价格纪律执行；超过建议价不追。");
  return [...new Set(notes)].slice(0, 4);
}

function recommendationSourceText(rec) {
  return rec.chart?.source || rec.source || "";
}

function opportunityExpiryForMatch(match) {
  const kickoffMs = dateMs(match.kickoffShanghai || match.kickoffLocal);
  if (!kickoffMs) return new Date(Date.now() + OPPORTUNITY_REFRESH_MS).toISOString();
  return new Date(kickoffMs + 90 * 60 * 1000).toISOString();
}

function opportunityScanDate(matches, now = new Date()) {
  const today = shanghaiDateDashed(now);
  const futureMatches = (matches || [])
    .filter((match) => !isFinishedStatus(match.scheduleStatus))
    .filter((match) => {
      const kickoffMs = dateMs(match.kickoffShanghai || match.kickoffLocal);
      return kickoffMs && kickoffMs > Date.now() - MATCH_LIVE_GRACE_HOURS * 60 * 60 * 1000;
    })
    .sort((a, b) => (dateMs(a.kickoffShanghai) || 0) - (dateMs(b.kickoffShanghai) || 0));
  const todayMatches = futureMatches.filter((match) => shanghaiDateDashed(new Date(match.kickoffShanghai || match.kickoffLocal)) === today);
  if (todayMatches.length) return today;
  const next = futureMatches[0];
  return next ? shanghaiDateDashed(new Date(next.kickoffShanghai || next.kickoffLocal)) : today;
}

function livePolymarketRecommendations(match) {
  return (match?.recommendations || []).filter((rec) =>
    rec.chart?.source === "Polymarket" && Array.isArray(rec.chart.history) && rec.chart.history.length >= 2
  );
}

function matchShanghaiDateKey(matchRecord) {
  const kickoffMs = dateMs(matchRecord?.kickoffShanghai || matchRecord?.kickoffLocal);
  return kickoffMs ? shanghaiDateDashed(new Date(kickoffMs)) : "";
}

function focusMatchdayMatches(matches, nowMs = Date.now()) {
  const candidates = (matches || [])
    .filter((match) => !isFinishedStatus(match.scheduleStatus))
    .filter((match) => {
      const kickoffMs = dateMs(match.kickoffShanghai || match.kickoffLocal);
      return kickoffMs && kickoffMs > nowMs - MATCH_LIVE_GRACE_HOURS * 60 * 60 * 1000;
    })
    .sort((a, b) => (dateMs(a.kickoffShanghai || a.kickoffLocal) || 0) - (dateMs(b.kickoffShanghai || b.kickoffLocal) || 0));
  if (!candidates.length) return { matches: [], matchDate: "" };
  const inProgress = candidates.find((match) => isInProgressStatus(match.scheduleStatus));
  const matchDate = inProgress
    ? matchShanghaiDateKey(inProgress)
    : opportunityScanDate(candidates, new Date(nowMs));
  return {
    matchDate,
    matches: candidates.filter((match) => matchShanghaiDateKey(match) === matchDate)
  };
}

function opportunityCandidateRows(matches, scanDate, nowMs = Date.now()) {
  const rows = [];
  const windowEndMs = nowMs + MATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  for (const match of matches || []) {
    const kickoffMs = dateMs(match.kickoffShanghai || match.kickoffLocal);
    if (!kickoffMs) continue;
    if (kickoffMs > windowEndMs) continue;
    if (isFinishedStatus(match.scheduleStatus)) continue;
    if (kickoffMs < nowMs - MATCH_LIVE_GRACE_HOURS * 60 * 60 * 1000) continue;
    const matchScanDate = shanghaiDateDashed(new Date(match.kickoffShanghai || match.kickoffLocal));
    for (const rec of match.recommendations || []) {
      const hasLiveChart = rec.chart?.source === "Polymarket" && (rec.chart.history || []).length >= 2;
      const hasPrice = typeof rec.marketPrice === "number";
      const decisionAction = rec.decision?.action || "";
      const edgeValue = typeof rec.disciplinedEdge === "number" ? rec.disciplinedEdge : rec.edge;
      if (!hasPrice || typeof rec.edge !== "number") continue;
      if (!["BUY", "BUY_SMALL", "WATCH"].includes(decisionAction)) continue;
      if (edgeValue < 0.06) continue;
      if (!isPrimaryTradeCandidate(match, rec)) continue;
      if (!hasLiveChart && !match.tradingGate?.allowPriceAdvice) continue;
      rows.push({
        match,
        rec,
        hasLiveChart,
        matchScanDate,
        score: tradableRecommendationScore(rec, match)
          + (hasLiveChart ? 0.01 : 0)
          + (match.tradingGate?.allowStrongTrade ? 0.012 : 0)
          + (matchScanDate === scanDate ? 0.006 : 0)
      });
    }
  }
  return opportunitySortRows(rows, nowMs);
}

function normalizedMarketText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+\-.]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bettingExpertTipText(tip) {
  return normalizedMarketText([
    tip?.pick,
    tip?.description,
    typeof tip?.handicap === "number" ? String(tip.handicap) : ""
  ].filter(Boolean).join(" "));
}

function bettingExpertTeamAliases(match, side) {
  return marketTeamAliases(match, side)
    .map(normalizedMarketText)
    .filter((alias) => alias && alias.length > 1);
}

function bettingExpertTipHasTeam(tipText, aliases) {
  return (aliases || []).some((alias) => textContainsAlias(tipText, alias));
}

function bettingExpertLineMatches(rec, tipText, tip) {
  if (rec.marketType === "total") {
    const line = rec.key === "under25" || rec.key === "over25" ? 2.5 : null;
    if (line == null) return false;
    const lineText = String(line);
    const handicap = typeof tip?.handicap === "number" ? Math.abs(tip.handicap) : null;
    return tipText.includes(lineText) || handicap === line;
  }
  if (rec.marketType === "handicap") {
    const line = rec.key?.endsWith("-away") ? rec.handicap?.awayLine : rec.handicap?.homeLine;
    if (typeof line !== "number") return false;
    const handicap = typeof tip?.handicap === "number" ? tip.handicap : null;
    if (handicap != null && Math.abs(handicap - line) <= 0.01) return true;
    const signed = formatLine(line);
    return tipText.replace(/\s+/g, "").includes(signed.replace(/\s+/g, ""));
  }
  return true;
}

function bettingExpertTipMatchesRecommendation(tip, match, rec) {
  if (!tip || !match || !rec) return false;
  const tipText = bettingExpertTipText(tip);
  if (!tipText) return false;
  if (/\b(first|1st)\s+half\b/.test(tipText)) return false;
  if (rec.marketType === "btts") {
    const isBtts = tipText.includes("both teams to score")
      || tipText.includes("btts")
      || (tipText.includes("both teams") && tipText.includes("score"));
    if (!isBtts) return false;
    if (rec.key === "bttsYes") return /\byes\b/.test(tipText) || tipText.includes("both teams to score yes");
    if (rec.key === "bttsNo") return /\bno\b/.test(tipText) || tipText.includes("both teams to score no");
    return false;
  }
  if (rec.marketType === "total") {
    if (!bettingExpertLineMatches(rec, tipText, tip)) return false;
    if (rec.key === "over25") return /\bover\b/.test(tipText) || tipText.includes("o 2.5");
    if (rec.key === "under25") return /\bunder\b/.test(tipText) || tipText.includes("u 2.5");
    return false;
  }
  if (rec.marketType === "moneyline") {
    if (rec.key === "draw") return /\bdraw\b/.test(tipText) || /\bx\b/.test(tipText);
    const aliases = rec.key === "home" ? bettingExpertTeamAliases(match, "home") : bettingExpertTeamAliases(match, "away");
    const hasTeam = bettingExpertTipHasTeam(tipText, aliases);
    const hasLineToken = /(^|\s)[+-]\d/.test(tipText);
    return hasTeam && !(/\bah\b|handicap|over|under|btts|both teams/.test(tipText) || hasLineToken);
  }
  if (rec.marketType === "handicap") {
    const aliases = rec.key?.endsWith("-home") ? bettingExpertTeamAliases(match, "home") : bettingExpertTeamAliases(match, "away");
    const hasTeam = bettingExpertTipHasTeam(tipText, aliases);
    return hasTeam && bettingExpertLineMatches(rec, tipText, tip) && (/\bah\b|handicap|\+|-/.test(tipText) || typeof tip?.handicap === "number");
  }
  return false;
}

function bettingExpertSignalsForRecommendation(match, rec) {
  const source = match?.bettingExpert || {};
  const leaderboardTips = (source.topTipsters || []).map((tip) => ({
    ...tip,
    signalTier: "leaderboard",
    signalTierLabel: "BettingExpert 世界杯榜单命中"
  }));
  const publicTips = (source.publicTipsters || []).map((tip) => ({
    ...tip,
    signalTier: "public",
    signalTierLabel: tip.sourceTierLabel || "本场公开高分 tips"
  }));
  return [...leaderboardTips, ...publicTips]
    .filter((tip) => bettingExpertTipMatchesRecommendation(tip, match, rec))
    .sort((a, b) => {
      const tierDiff = (a.signalTier === "leaderboard" ? 0 : 1) - (b.signalTier === "leaderboard" ? 0 : 1);
      if (tierDiff) return tierDiff;
      return (b.rankingScore || 0) - (a.rankingScore || 0);
    })
    .slice(0, 3);
}

function opportunityObservationRows(matches, scanDate, nowMs = Date.now()) {
  const rows = [];
  const strictIds = new Set(opportunityCandidateRows(matches, scanDate, nowMs).map(opportunityRowId));
  const windowEndMs = nowMs + MATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  for (const match of matches || []) {
    const kickoffMs = dateMs(match.kickoffShanghai || match.kickoffLocal);
    if (!kickoffMs) continue;
    if (kickoffMs > windowEndMs) continue;
    if (isFinishedStatus(match.scheduleStatus)) continue;
    if (kickoffMs < nowMs - MATCH_LIVE_GRACE_HOURS * 60 * 60 * 1000) continue;
    const matchScanDate = shanghaiDateDashed(new Date(match.kickoffShanghai || match.kickoffLocal));
    for (const rec of match.recommendations || []) {
      const id = `${match?.id || ""}:${rec?.key || ""}:${rec?.marketType || ""}`;
      if (strictIds.has(id)) continue;
      const hasPrice = typeof rec.marketPrice === "number";
      const hasLiveChart = rec.chart?.source === "Polymarket" && (rec.chart.history || []).length >= 2;
      const edgeValue = typeof rec.disciplinedEdge === "number" ? rec.disciplinedEdge : rec.edge;
      const maxBuyPrice = typeof rec.maxBuyPrice === "number" ? rec.maxBuyPrice : null;
      const priceGap = hasPrice && maxBuyPrice != null ? maxBuyPrice - rec.marketPrice : null;
      const tipSignals = bettingExpertSignalsForRecommendation(match, rec);
      if (!hasPrice || typeof rec.edge !== "number") continue;
      const reasons = [];
      if (hasLiveChart) reasons.push("已匹配 Polymarket 实时曲线，可点击复核当前价。");
      if (priceGap != null && priceGap >= -0.04) reasons.push(`当前价距模型建议上限 ${formatPercent(priceGap)}，接近但未达严格买入纪律。`);
      if (typeof edgeValue === "number" && edgeValue >= 0.025) reasons.push(`纪律后 edge ${formatPercent(edgeValue)}，低于买入雷达阈值但值得观察。`);
      if (tipSignals.length) {
        const label = tipSignals.slice(0, 2).map((tip) => `${tip.userName || "-"}: ${tip.pick || "-"}`).join("；");
        reasons.push(`BettingExpert 公开信号：${label}。`);
      }
      const observationEligible = (
        (hasLiveChart && edgeValue >= -0.04)
        || (priceGap != null && priceGap >= -0.04 && edgeValue >= -0.04)
        || (tipSignals.length && edgeValue >= -0.08)
      );
      if (!observationEligible || !reasons.length) continue;
      const score = tradableRecommendationScore(rec, match)
        + (hasLiveChart ? 0.035 : 0)
        + Math.min(0.025, tipSignals.length * 0.012)
        + (priceGap != null ? clamp(priceGap, -0.04, 0.04) * 0.3 : 0)
        + (matchScanDate === scanDate ? 0.006 : 0);
      rows.push({
        match,
        rec,
        hasLiveChart,
        matchScanDate,
        score,
        observationReasons: reasons,
        tipSignals
      });
    }
  }
  return opportunitySortRows(rows, nowMs);
}

function opportunityRowId(row) {
  return `${row.match?.id || ""}:${row.rec?.key || ""}:${row.rec?.marketType || ""}`;
}

function opportunityTimePriority(row, nowMs = Date.now()) {
  const kickoffMs = dateMs(row?.match?.kickoffShanghai || row?.match?.kickoffLocal);
  if (!kickoffMs) return 0;
  if (isInProgressStatus(row?.match?.scheduleStatus)) return 5;
  const minutesToKickoff = (kickoffMs - nowMs) / 60000;
  if (minutesToKickoff <= 0 && minutesToKickoff >= -120) return 4;
  if (minutesToKickoff > 0 && minutesToKickoff <= 180) return 3;
  if (row?.matchScanDate === shanghaiDateDashed(new Date(nowMs))) return 2;
  if (minutesToKickoff > 0 && minutesToKickoff <= 24 * 60) return 1;
  return 0;
}

function opportunitySortRows(rows, nowMs = Date.now()) {
  return [...(rows || [])].sort((a, b) => {
    const timeDiff = opportunityTimePriority(b, nowMs) - opportunityTimePriority(a, nowMs);
    if (timeDiff) return timeDiff;
    const aKickoff = dateMs(a.match?.kickoffShanghai || a.match?.kickoffLocal) || Number.MAX_SAFE_INTEGER;
    const bKickoff = dateMs(b.match?.kickoffShanghai || b.match?.kickoffLocal) || Number.MAX_SAFE_INTEGER;
    const kickoffDiff = aKickoff - bKickoff;
    if (kickoffDiff) return kickoffDiff;
    return b.score - a.score;
  });
}

function diversifiedOpportunityRows(rows, limit = OPPORTUNITY_MAX_ITEMS, nowMs = Date.now()) {
  const sorted = opportunitySortRows(rows, nowMs);
  const selected = [];
  const used = new Set();
  const perMatch = new Map();
  let moneylineCount = 0;
  const moneylineCap = Math.max(2, Math.floor(limit * 0.35));

  const add = (row, options = {}) => {
    if (!row || selected.length >= limit) return false;
    const id = opportunityRowId(row);
    if (used.has(id)) return false;
    const matchId = row.match?.id || "";
    const matchCount = perMatch.get(matchId) || 0;
    if (matchCount >= 2) return false;
    const isMoneyline = row.rec?.marketType === "moneyline";
    if (isMoneyline && options.capMoneyline !== false && moneylineCount >= moneylineCap) return false;
    selected.push(row);
    used.add(id);
    perMatch.set(matchId, matchCount + 1);
    if (isMoneyline) moneylineCount += 1;
    return true;
  };

  const activeOrNearRows = sorted.filter((row) => opportunityTimePriority(row, nowMs) >= 3);
  for (const row of activeOrNearRows) add(row, { capMoneyline: false });
  for (const marketType of ["btts", "total", "handicap"]) {
    add(sorted.find((row) => row.hasLiveChart && row.rec?.marketType === marketType), { capMoneyline: false });
  }
  for (const row of sorted) {
    if (row.hasLiveChart && row.rec?.marketType !== "moneyline") add(row, { capMoneyline: false });
  }
  for (const row of sorted) {
    if (row.rec?.marketType !== "moneyline") add(row, { capMoneyline: false });
  }
  for (const row of sorted) add(row);
  for (const row of sorted) add(row, { capMoneyline: false });

  return selected;
}

function buildRuleOpportunity(row, index) {
  const { match, rec, hasLiveChart, score } = row;
  const expiresAt = opportunityExpiryForMatch(match);
  const confidence = match.tradingGate?.allowStrongTrade && hasLiveChart
    ? "high"
    : hasLiveChart
      ? "medium"
      : "low";
  const action = rec.decision?.action === "BUY" || rec.decision?.action === "BUY_SMALL" ? "watch" : "wait";
  const source = recommendationSourceText(rec);
  const reasons = [
    `模型概率 ${formatPercent(rec.modelProbability)}，当前价格 ${formatCents(rec.marketPrice)}，edge ${formatPercent(rec.edge)}。`,
    typeof rec.disciplinedEdge === "number" && rec.disciplinedEdge !== rec.edge ? `复盘纪律后 edge ${formatPercent(rec.disciplinedEdge)}。` : "",
    ...(rec.reviewDiscipline?.reasons || []),
    `建议价不高于 ${formatCents(rec.maxBuyPrice)}；超过上限不追。`,
    hasLiveChart ? "已匹配 Polymarket 实时历史曲线。" : "实时曲线不足，先观察价格。",
    rec.eliteSummary?.count ? `世界杯 Top10 公开持仓命中 ${rec.eliteSummary.count} 人。` : "",
    rec.holderSummary?.count ? `公开持仓 ${rec.holderSummary.count} 人，Top holder ${rec.holderSummary.topHolder || "-"}。` : ""
  ].filter(Boolean);
  return {
    id: `${match.id}:${rec.key}:${Math.round((rec.marketPrice || 0) * 1000)}:${index}`,
    matchId: match.id,
    matchName: `${match.homeName} vs ${match.awayName}`,
    kickoffShanghai: match.kickoffShanghai,
    marketKey: rec.key,
    marketType: rec.marketType,
    marketTypeLabel: rec.marketTypeLabel,
    name: rec.name,
    action,
    confidence,
    stake: match.tradingGate?.allowStrongTrade ? rec.decision?.stake || "small" : "small-watch",
    modelProbability: rec.modelProbability,
    marketPrice: rec.marketPrice,
    edge: rec.edge,
    maxBuyPrice: rec.maxBuyPrice,
    source,
    score: roundTo(score, 4),
    title: `${match.homeName} vs ${match.awayName} · ${rec.name}`,
    summary: `${rec.name} ${formatCents(rec.marketPrice)} 附近观察，建议价不高于 ${formatCents(rec.maxBuyPrice)}。`,
    entryText: `只在 ${formatCents(rec.maxBuyPrice)} 或以下考虑；首发/伤停/价格跳动后重新评估。`,
    reasons: reasons.slice(0, 5),
    risks: topRiskNotes(match, rec),
    expiresAt,
    createdAt: new Date().toISOString(),
    status: Date.parse(expiresAt) > Date.now() ? "active" : "expired"
  };
}

function buildObservationOpportunity(row, index) {
  const { match, rec, hasLiveChart, score, observationReasons = [], tipSignals = [] } = row;
  const expiresAt = opportunityExpiryForMatch(match);
  const edgeValue = typeof rec.disciplinedEdge === "number" ? rec.disciplinedEdge : rec.edge;
  const priceGap = typeof rec.maxBuyPrice === "number" && typeof rec.marketPrice === "number"
    ? rec.maxBuyPrice - rec.marketPrice
    : null;
  const source = [
    recommendationSourceText(rec),
    tipSignals.length ? "BettingExpert" : ""
  ].filter(Boolean).join(" + ") || recommendationSourceText(rec);
  const tipReason = tipSignals.length
    ? `公开用户信号：${tipSignals.slice(0, 2).map((tip) => `${tip.userName || "-"} ${tip.pick || "-"}`).join("；")}。`
    : "";
  const reasons = [
    ...observationReasons,
    `模型概率 ${formatPercent(rec.modelProbability)}，当前价格 ${formatCents(rec.marketPrice)}，edge ${formatPercent(rec.edge)}。`,
    typeof edgeValue === "number" && edgeValue !== rec.edge ? `复盘纪律后 edge ${formatPercent(edgeValue)}。` : "",
    priceGap != null ? `距离建议上限 ${formatPercent(priceGap)}；未达纪律时不追价。` : "",
    tipReason
  ].filter(Boolean);
  const action = edgeValue >= 0.025 && hasLiveChart ? "watch" : "wait";
  return {
    id: `${match.id}:${rec.key}:observation:${Math.round((rec.marketPrice || 0) * 1000)}:${index}`,
    tier: "observation",
    matchId: match.id,
    matchName: `${match.homeName} vs ${match.awayName}`,
    kickoffShanghai: match.kickoffShanghai,
    marketKey: rec.key,
    marketType: rec.marketType,
    marketTypeLabel: rec.marketTypeLabel,
    name: rec.name,
    action,
    confidence: hasLiveChart ? "medium" : "low",
    stake: "none",
    modelProbability: rec.modelProbability,
    marketPrice: rec.marketPrice,
    edge: rec.edge,
    disciplinedEdge: typeof edgeValue === "number" ? edgeValue : null,
    maxBuyPrice: rec.maxBuyPrice,
    source,
    score: roundTo(score, 4),
    title: `${match.homeName} vs ${match.awayName} · ${rec.name}`,
    summary: `${rec.name} 进入观察雷达；还没有达到严格买入纪律，点击复核当前价。`,
    entryText: "观察项不是买入提醒。只有实时价低于建议上限、首发/伤停没有反向变化，并且复核后 edge 仍足够时才重新考虑。",
    reasons: [...new Set(reasons)].slice(0, 5),
    risks: [
      "观察雷达只提示可复核信号，不代表可以买入。",
      ...topRiskNotes(match, rec)
    ].slice(0, 5),
    tipSignals: tipSignals.map((tip) => ({
      userName: tip.userName,
      profileUrl: tip.profileUrl,
      pick: tip.pick,
      odds: tip.odds,
      stake: tip.stake,
      rankingScore: tip.rankingScore,
      signalTier: tip.signalTier,
      signalTierLabel: tip.signalTierLabel
    })),
    expiresAt,
    createdAt: new Date().toISOString(),
    status: Date.parse(expiresAt) > Date.now() ? "active" : "expired"
  };
}

function currentOpportunityVerdict(rec, match) {
  const hasPrice = typeof rec.marketPrice === "number" && Number.isFinite(rec.marketPrice);
  const hasMax = typeof rec.maxBuyPrice === "number" && Number.isFinite(rec.maxBuyPrice);
  const hasLiveChart = rec.chart?.source === "Polymarket" && (rec.chart.history || []).length >= 2;
  if (!hasPrice) {
    return {
      action: "wait",
      label: "等待价格",
      canConsider: false,
      message: "当前没有可用实时价格，先不做价格判断。",
      reasons: ["盘口价格缺失"]
    };
  }
  if (!match.tradingGate?.allowPriceAdvice) {
    return {
      action: "wait",
      label: "等待真实盘口",
      canConsider: false,
      message: "真实盘口或 Polymarket 曲线不足，不能给价格建议。",
      reasons: match.tradingGate?.reasons || ["真实盘口不可用"]
    };
  }
  if (!hasLiveChart) {
    return {
      action: "watch",
      label: "观察",
      canConsider: false,
      message: `当前价 ${formatCents(rec.marketPrice)}，但实时曲线不足，先观察不追。`,
      reasons: ["实时曲线不足"]
    };
  }
  if (!hasMax) {
    return {
      action: "watch",
      label: "观察",
      canConsider: false,
      message: `当前价 ${formatCents(rec.marketPrice)}，缺少建议上限，先观察。`,
      reasons: ["建议价缺失"]
    };
  }
  const priceGap = rec.maxBuyPrice - rec.marketPrice;
  const edgeValue = typeof rec.disciplinedEdge === "number" ? rec.disciplinedEdge : rec.edge;
  if (rec.marketPrice <= rec.maxBuyPrice && edgeValue >= 0.06 && !rec.reviewDiscipline?.reasons?.length) {
    return {
      action: match.tradingGate?.allowStrongTrade ? "watch" : "watch",
      label: match.tradingGate?.allowStrongTrade ? "可按纪律观察" : "小仓观察",
      canConsider: true,
      message: `当前价 ${formatCents(rec.marketPrice)}，低于建议上限 ${formatCents(rec.maxBuyPrice)}，纪律后 edge ${formatPercent(edgeValue)}。`,
      reasons: [
        `价格空间 ${formatPercent(priceGap)}。`,
        ...(match.tradingGate?.allowStrongTrade ? ["数据闸门允许较高置信判断。"] : ["动态数据仍有限，只按小仓/观察处理。"])
      ]
    };
  }
  if (edgeValue >= 0.035) {
    return {
      action: "watch",
      label: "等回落",
      canConsider: false,
      message: `当前价 ${formatCents(rec.marketPrice)} 已高于建议上限 ${formatCents(rec.maxBuyPrice)}，不要追价。`,
      reasons: [
        `需要至少回落 ${formatPercent(Math.abs(priceGap))} 才重新考虑。`,
        ...(rec.reviewDiscipline?.reasons || [])
      ].slice(0, 4)
    };
  }
  return {
    action: edgeValue < -0.015 ? "avoid" : "wait",
    label: edgeValue < -0.015 ? "回避" : "等待",
    canConsider: false,
    message: `当前价 ${formatCents(rec.marketPrice)}，纪律后 edge ${formatPercent(edgeValue)}，没有达到进入纪律。`,
    reasons: edgeValue < -0.015
      ? ["模型价差转负，先回避。", ...(rec.reviewDiscipline?.reasons || [])].slice(0, 4)
      : ["价差不够，等待更好价格。", ...(rec.reviewDiscipline?.reasons || [])].slice(0, 4)
  };
}

function buildOpportunityPriceCheck(match, rec, request = {}) {
  const now = new Date().toISOString();
  const expiresAt = opportunityExpiryForMatch(match);
  const hasLiveChart = rec.chart?.source === "Polymarket" && (rec.chart.history || []).length >= 2;
  const verdict = currentOpportunityVerdict(rec, match);
  const source = recommendationSourceText(rec);
  const matchedRequestedPrice = typeof request.marketPrice === "number"
    ? Math.abs((rec.marketPrice || 0) - request.marketPrice)
    : null;
  return {
    ok: true,
    checkedAt: now,
    requested: {
      id: request.id || "",
      marketKey: request.marketKey || "",
      marketPrice: typeof request.marketPrice === "number" ? request.marketPrice : null,
      maxBuyPrice: typeof request.maxBuyPrice === "number" ? request.maxBuyPrice : null
    },
    matchId: match.id,
    matchName: `${match.homeName} vs ${match.awayName}`,
    kickoffShanghai: match.kickoffShanghai,
    marketKey: rec.key,
    marketType: rec.marketType,
    marketTypeLabel: rec.marketTypeLabel,
    name: rec.name,
    title: `${match.homeName} vs ${match.awayName} · ${rec.name}`,
    modelProbability: rec.modelProbability,
    marketPrice: rec.marketPrice,
    previousPrice: typeof request.marketPrice === "number" ? request.marketPrice : null,
    priceChange: typeof request.marketPrice === "number" && typeof rec.marketPrice === "number"
      ? roundTo(rec.marketPrice - request.marketPrice, 4)
      : null,
    edge: rec.edge,
    maxBuyPrice: rec.maxBuyPrice,
    source,
    hasLiveChart,
    chartPoints: rec.chart?.history?.length || 0,
    decisionLabel: rec.decision?.label || "",
    decisionAction: rec.decision?.action || "",
    verdict,
    summary: verdict.message,
    staleRequest: matchedRequestedPrice != null && matchedRequestedPrice >= 0.005,
    expiresAt,
    status: Date.parse(expiresAt) > Date.now() ? "active" : "expired",
    risks: topRiskNotes(match, rec).slice(0, 4)
  };
}

function eventStatusTypeFromSummary(summary) {
  return summary?.header?.competitions?.[0]?.status?.type || summary?.header?.status?.type || {};
}

function eventCompetitorsFromSummary(summary) {
  return summary?.header?.competitions?.[0]?.competitors || [];
}

function canonicalTeamValue(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function teamMatchNeedles(match, side) {
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
  ].filter(Boolean).map(canonicalTeamValue).filter(Boolean);
}

function summaryCompetitorForMatch(summary, match, side) {
  const competitors = eventCompetitorsFromSummary(summary);
  const needles = teamMatchNeedles(match, side);
  return competitors.find((competitor) => {
    const values = [
      competitor.team?.abbreviation,
      competitor.team?.displayName,
      competitor.team?.name,
      competitor.team?.shortDisplayName
    ].map(canonicalTeamValue).filter(Boolean);
    return values.some((value) => needles.includes(value) || needles.some((needle) => value.includes(needle) || needle.includes(value)));
  }) || null;
}

function boxscoreTeamForMatch(summary, match, side) {
  const teams = summary?.boxscore?.teams || [];
  const needles = teamMatchNeedles(match, side);
  return teams.find((team) => {
    const values = [
      team.team?.abbreviation,
      team.team?.displayName,
      team.team?.name,
      team.team?.shortDisplayName
    ].map(canonicalTeamValue).filter(Boolean);
    return values.some((value) => needles.includes(value) || needles.some((needle) => value.includes(needle) || needle.includes(value)));
  }) || null;
}

function statValue(boxTeam, names) {
  const stats = Array.isArray(boxTeam?.statistics) ? boxTeam.statistics : [];
  for (const name of names) {
    const row = stats.find((item) => item.name === name || item.abbreviation === name || item.label === name);
    if (!row) continue;
    const value = Number(row.value ?? row.displayValue);
    if (Number.isFinite(value)) return value;
    const parsed = Number(String(row.displayValue || "").replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function isActualNumber(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function normalizeLiveStats(summary, match) {
  const homeBox = boxscoreTeamForMatch(summary, match, "home");
  const awayBox = boxscoreTeamForMatch(summary, match, "away");
  const read = (team) => ({
    shots: statValue(team, ["totalShots"]),
    shotsOnTarget: statValue(team, ["shotsOnTarget"]),
    corners: statValue(team, ["wonCorners"]),
    possession: statValue(team, ["possessionPct"]),
    redCards: statValue(team, ["redCards"]),
    yellowCards: statValue(team, ["yellowCards"]),
    saves: statValue(team, ["saves"]),
    fouls: statValue(team, ["foulsCommitted"]),
    accuratePasses: statValue(team, ["accuratePasses"]),
    totalPasses: statValue(team, ["totalPasses"])
  });
  return {
    home: read(homeBox),
    away: read(awayBox),
    hasTeamStats: Boolean(homeBox && awayBox),
    sourceStatus: homeBox && awayBox ? "synced" : "score-only"
  };
}

function normalizeLiveEvent(summary, match) {
  const status = eventStatusTypeFromSummary(summary);
  const homeCompetitor = summaryCompetitorForMatch(summary, match, "home");
  const awayCompetitor = summaryCompetitorForMatch(summary, match, "away");
  const homeScore = Number(homeCompetitor?.score);
  const awayScore = Number(awayCompetitor?.score);
  return {
    source: "ESPN FIFA World Cup summary",
    sourceUrl: `${ESPN_WORLDCUP_SUMMARY}?event=${encodeURIComponent(match.scheduleId || "")}`,
    status: status.name || status.description || "",
    statusDetail: status.detail || status.shortDetail || status.description || "",
    state: status.state || "",
    completed: Boolean(status.completed) || isFinishedStatus(status.name || status.description || status.state),
    inProgress: isInProgressStatus(status.name || status.description || status.state),
    minute: status.shortDetail || status.detail || "",
    score: {
      home: Number.isFinite(homeScore) ? homeScore : null,
      away: Number.isFinite(awayScore) ? awayScore : null
    },
    stats: normalizeLiveStats(summary, match),
    venue: summary?.gameInfo?.venue?.fullName || summary?.header?.competitions?.[0]?.venue?.fullName || match.venue,
    lastUpdated: new Date().toISOString()
  };
}

function elapsedMinuteFromLive(live, match) {
  if (live && !live.inProgress && !live.completed) return 0;
  const detail = String(live?.minute || live?.statusDetail || "");
  const parsed = Number(detail.match(/(\d{1,3})/)?.[1]);
  if (Number.isFinite(parsed)) return clamp(parsed, 0, 130);
  if (live?.completed) return 90;
  const kickoffMs = dateMs(match?.kickoffShanghai || match?.kickoffLocal);
  if (!kickoffMs) return 0;
  return clamp(Math.floor((Date.now() - kickoffMs) / 60000), 0, 130);
}

function hasUsefulLiveStats(stats) {
  return Boolean(stats?.hasTeamStats)
    && [stats.home?.shots, stats.away?.shots, stats.home?.shotsOnTarget, stats.away?.shotsOnTarget].some(isActualNumber);
}

function statDiff(homeValue, awayValue) {
  if (!isActualNumber(homeValue) || !isActualNumber(awayValue)) return 0;
  const home = Number(homeValue);
  const away = Number(awayValue);
  return home - away;
}

function liveMomentumScore(live) {
  const stats = live?.stats || {};
  if (!hasUsefulLiveStats(stats)) return { home: 0, away: 0, notes: ["现场技术统计未同步，只使用比分时间模型。"] };
  const shotDiff = statDiff(stats.home.shots, stats.away.shots);
  const sotDiff = statDiff(stats.home.shotsOnTarget, stats.away.shotsOnTarget);
  const cornerDiff = statDiff(stats.home.corners, stats.away.corners);
  const possessionDiff = statDiff(stats.home.possession, stats.away.possession);
  const redCardDiff = statDiff(stats.home.redCards, stats.away.redCards);
  const raw = shotDiff * 0.012 + sotDiff * 0.026 + cornerDiff * 0.008 + possessionDiff * 0.0015 - redCardDiff * 0.08;
  const home = clamp(raw, -0.18, 0.18);
  const notes = [
    `射门 ${stats.home.shots ?? "-"}-${stats.away.shots ?? "-"}，射正 ${stats.home.shotsOnTarget ?? "-"}-${stats.away.shotsOnTarget ?? "-"}。`,
    `角球 ${stats.home.corners ?? "-"}-${stats.away.corners ?? "-"}，控球 ${stats.home.possession ?? "-"}%-${stats.away.possession ?? "-"}%。`,
    redCardDiff ? `红牌差 ${stats.home.redCards ?? 0}-${stats.away.redCards ?? 0}，模型对少打一方降权。` : ""
  ].filter(Boolean);
  return {
    home,
    away: -home,
    notes
  };
}

function applyLiveTripletShift(base, shifts) {
  return normalizeProbabilityTriplet({
    home: base.home + (shifts.home || 0),
    draw: base.draw + (shifts.draw || 0),
    away: base.away + (shifts.away || 0)
  });
}

function liveProbabilityModel(match, live) {
  const base = match.probabilities || { home: 0.33, draw: 0.34, away: 0.33, over25: 0.5, under25: 0.5, btts: 0.5 };
  const elapsed = elapsedMinuteFromLive(live, match);
  const remaining = clamp((90 - Math.min(elapsed, 90)) / 90, 0, 1);
  const homeScore = Number(live?.score?.home);
  const awayScore = Number(live?.score?.away);
  const hasScore = Number.isFinite(homeScore) && Number.isFinite(awayScore);
  const goalDiff = hasScore ? homeScore - awayScore : 0;
  const totalGoals = hasScore ? homeScore + awayScore : 0;
  const momentum = liveMomentumScore(live);
  const statsReady = hasUsefulLiveStats(live?.stats);
  const shifts = { home: 0, draw: 0, away: 0 };
  const notes = [];

  if (hasScore) {
    const scoreWeight = clamp((1 - remaining) * 0.62 + Math.min(Math.abs(goalDiff), 3) * 0.09, 0.08, 0.78);
    if (goalDiff > 0) {
      shifts.home += scoreWeight;
      shifts.draw -= scoreWeight * 0.45;
      shifts.away -= scoreWeight * 0.55;
      notes.push(`${elapsed || "进行中"}' ${match.homeName} 领先 ${goalDiff} 球，胜平负向领先方修正。`);
    } else if (goalDiff < 0) {
      shifts.away += scoreWeight;
      shifts.draw -= scoreWeight * 0.45;
      shifts.home -= scoreWeight * 0.55;
      notes.push(`${elapsed || "进行中"}' ${match.awayName} 领先 ${Math.abs(goalDiff)} 球，胜平负向领先方修正。`);
    } else if (elapsed >= 55) {
      const drawBoost = clamp((elapsed - 50) / 45 * 0.2, 0.02, 0.2);
      shifts.draw += drawBoost;
      shifts.home -= drawBoost / 2;
      shifts.away -= drawBoost / 2;
      notes.push(`${elapsed}' 仍为平局，平局权重上修。`);
    }
  }

  shifts.home += momentum.home * clamp(0.55 + remaining * 0.45, 0.45, 1);
  shifts.away += momentum.away * clamp(0.55 + remaining * 0.45, 0.45, 1);
  notes.push(...momentum.notes);

  const triplet = applyLiveTripletShift(base, shifts);
  const tempo = statsReady
    ? clamp(((Number(live.stats.home.shots) || 0) + (Number(live.stats.away.shots) || 0)) / Math.max(1, elapsed || 1), 0, 0.42)
    : 0;
  const sotTempo = statsReady
    ? clamp(((Number(live.stats.home.shotsOnTarget) || 0) + (Number(live.stats.away.shotsOnTarget) || 0)) / Math.max(1, elapsed || 1), 0, 0.16)
    : 0;
  let over25 = typeof base.over25 === "number" ? base.over25 : 0.5;
  if (hasScore) {
    if (totalGoals >= 3) over25 = 0.99;
    else if (totalGoals === 2) over25 = clamp(0.34 + remaining * 0.52 + tempo * 0.55 + sotTempo * 1.3, 0.08, 0.92);
    else if (totalGoals === 1) over25 = clamp(0.14 + remaining * 0.47 + tempo * 0.5 + sotTempo * 1.1, 0.05, 0.76);
    else over25 = clamp(remaining * 0.34 + tempo * 0.45 + sotTempo * 1.0, 0.03, 0.58);
  }
  let btts = typeof base.btts === "number" ? base.btts : 0.5;
  if (hasScore) {
    if (homeScore > 0 && awayScore > 0) btts = 0.99;
    else {
      const nilSide = homeScore === 0 ? "home" : "away";
      const nilStats = live.stats?.[nilSide] || {};
      const nilSot = Number(nilStats.shotsOnTarget);
      const nilShots = Number(nilStats.shots);
      const chaseBoost = Math.abs(goalDiff) >= 1 && remaining > 0.15 ? 0.07 : 0;
      btts = clamp(0.08 + remaining * 0.42 + (Number.isFinite(nilShots) ? nilShots * 0.012 : 0) + (Number.isFinite(nilSot) ? nilSot * 0.055 : 0) + chaseBoost, 0.02, 0.82);
      if (statsReady && (nilSot || 0) === 0 && elapsed >= 55) {
        btts = Math.max(0.02, btts - 0.12);
        notes.push(`未进球一方 ${elapsed}' 后仍 0 射正，BTTS Yes 降权。`);
      }
    }
  }

  return {
    ...triplet,
    over25,
    under25: 1 - over25,
    btts,
    elapsedMinute: elapsed,
    scoreKnown: hasScore,
    statsReady,
    notes: [...new Set(notes)].slice(0, 6)
  };
}

function liveProbabilityForRecommendation(rec, liveModel) {
  if (rec.key === "home") return liveModel.home;
  if (rec.key === "draw") return liveModel.draw;
  if (rec.key === "away") return liveModel.away;
  if (rec.key === "over25") return liveModel.over25;
  if (rec.key === "under25") return liveModel.under25;
  if (rec.key === "bttsYes") return liveModel.btts;
  if (rec.key === "bttsNo") return 1 - liveModel.btts;
  if (rec.marketType === "handicap") {
    const base = Number(rec.modelProbability);
    const teamShift = rec.key.endsWith("-home") ? liveModel.home - (rec._baseHome || 0) : liveModel.away - (rec._baseAway || 0);
    return clamp((Number.isFinite(base) ? base : 0.5) + teamShift * 0.75, 0.01, 0.99);
  }
  return rec.modelProbability;
}

function parseExactScoreFromRecommendation(rec) {
  const text = `${rec?.key || ""} ${rec?.name || ""} ${rec?.marketTypeLabel || ""} ${rec?.chart?.marketQuestion || ""} ${rec?.chart?.marketSlug || ""}`.toLowerCase();
  const match = text.match(/(?:^|[^0-9])(\d{1,2})\s*[-:]\s*(\d{1,2})(?:[^0-9]|$)/);
  if (!match) return null;
  if (!/correct|score|比分|球胆|\bcs\b|exact/.test(text)) return null;
  return {
    homeGoals: Number(match[1]),
    awayGoals: Number(match[2])
  };
}

function parseTotalLineFromRecommendation(rec) {
  const key = String(rec?.key || "").toLowerCase();
  if (key === "over25") return { side: "over", line: 2.5 };
  if (key === "under25") return { side: "under", line: 2.5 };
  const text = `${rec?.key || ""} ${rec?.name || ""} ${rec?.marketTypeLabel || ""} ${rec?.chart?.marketQuestion || ""} ${rec?.chart?.marketSlug || ""}`.toLowerCase();
  const match = text.match(/(?:over|under|\bo\b|\bu\b|大于|小于)\s*([0-9]+(?:\.[0-9]+)?)/);
  if (!match) return null;
  const marker = match[0].replace(match[1], "");
  const side = /under|\bu\b|小于/.test(marker) ? "under" : /over|\bo\b|大于/.test(marker) ? "over" : null;
  const line = Number(match[1]);
  if (!side || !Number.isFinite(line)) return null;
  return { side, line };
}

function impossibleByCurrentScore(rec, live) {
  const homeScore = Number(live?.score?.home);
  const awayScore = Number(live?.score?.away);
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return null;
  const totalGoals = homeScore + awayScore;
  const totalLine = parseTotalLineFromRecommendation(rec);
  if (totalLine?.side === "under" && totalGoals > totalLine.line) {
    return {
      impossible: true,
      reason: `当前比分 ${homeScore}-${awayScore} 已经超过 ${totalLine.line} 球，小于${totalLine.line}已不可能。`
    };
  }
  if (totalLine?.side === "over" && totalGoals > totalLine.line) {
    return {
      impossible: true,
      resolved: true,
      reason: `当前比分 ${homeScore}-${awayScore} 已经超过 ${totalLine.line} 球，大于${totalLine.line}已穿线；这不是新的实时买点，应改看更高进球线或其他盘口。`
    };
  }
  if (rec.key === "bttsNo" && homeScore > 0 && awayScore > 0) {
    return {
      impossible: true,
      reason: `当前比分 ${homeScore}-${awayScore} 两队都已进球，BTTS No 已不可能。`
    };
  }
  if (rec.key === "bttsYes" && homeScore > 0 && awayScore > 0) {
    return {
      impossible: true,
      resolved: true,
      reason: `当前比分 ${homeScore}-${awayScore} 两队都已进球，BTTS Yes 已满足；这不是新的实时买点。`
    };
  }
  const exact = parseExactScoreFromRecommendation(rec);
  if (exact && (homeScore > exact.homeGoals || awayScore > exact.awayGoals)) {
    return {
      impossible: true,
      reason: `当前比分 ${homeScore}-${awayScore} 已经超过 ${exact.homeGoals}-${exact.awayGoals}，该球胆/正确比分已不可能。`
    };
  }
  if (exact && live?.completed && (homeScore !== exact.homeGoals || awayScore !== exact.awayGoals)) {
    return {
      impossible: true,
      reason: `全场比分 ${homeScore}-${awayScore} 不等于 ${exact.homeGoals}-${exact.awayGoals}，该正确比分未命中。`
    };
  }
  return null;
}

function longTailByCurrentScore(rec, live, liveProbability) {
  const homeScore = Number(live?.score?.home);
  const awayScore = Number(live?.score?.away);
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return null;
  if (rec.marketType !== "moneyline") return null;
  const elapsed = elapsedMinuteFromLive(live, null);
  const goalDiff = homeScore - awayScore;
  const probability = Number(liveProbability);
  const price = Number(rec.marketPrice);
  const isTinyProbability = Number.isFinite(probability) && probability < 0.02;
  const isPennyMarket = Number.isFinite(price) && price <= 0.01;
  const isLargeLead = Math.abs(goalDiff) >= 3 || (Math.abs(goalDiff) >= 2 && elapsed >= 65);
  const trailingSide = goalDiff > 0 ? "away" : goalDiff < 0 ? "home" : "";
  const isTrailingWin = rec.key === trailingSide;
  const isLateDrawLongTail = rec.key === "draw" && goalDiff !== 0 && isLargeLead;
  if ((isTrailingWin || isLateDrawLongTail) && isLargeLead && (isTinyProbability || isPennyMarket)) {
    return {
      longTail: true,
      reason: `当前比分 ${homeScore}-${awayScore} 已形成 ${Math.abs(goalDiff)} 球差，${rec.name} 只剩极低概率长尾；不把接近 0¢ 的彩票盘当实时买点。`
    };
  }
  return null;
}

function liveActionFor(edgeValue, rec, dataQuality, impossible = null) {
  if (impossible?.impossible) return { action: "avoid", label: impossible.resolved ? "已穿线不追" : "已不可能", canConsider: false };
  if (impossible?.longTail) return { action: "avoid", label: "长尾不追", canConsider: false };
  if (typeof rec.marketPrice !== "number") return { action: "wait", label: "等待价格", canConsider: false };
  if (dataQuality.status === "post") return { action: "avoid", label: "已完赛复盘", canConsider: false };
  if (dataQuality.status === "missing" || dataQuality.status === "pre") return { action: "wait", label: "等待现场数据", canConsider: false };
  if (dataQuality.status === "score-only") return { action: edgeValue >= 0.07 ? "watch" : "wait", label: "比分模型观察", canConsider: false };
  if (edgeValue >= 0.09) return { action: "watch", label: "可按纪律观察", canConsider: true };
  if (edgeValue >= 0.055) return { action: "watch", label: "小仓观察", canConsider: true };
  if (edgeValue <= -0.035) return { action: "avoid", label: "回避", canConsider: false };
  return { action: "wait", label: "等待更好价格", canConsider: false };
}

function liveReviewRisk(rec, liveEdge) {
  const reason = rec?.reviewDiscipline?.reasons?.[0] || "";
  if (!reason) return "";
  if (/edge|低于\d|主买|价格|盘口/.test(reason)) return "";
  return reason;
}

function buildLiveRecommendations(match, live, liveModel, dataQuality) {
  if (dataQuality.status === "pre" || dataQuality.status === "missing") return [];
  const baseHome = Number(match.probabilities?.home) || 0;
  const baseAway = Number(match.probabilities?.away) || 0;
  return (match.recommendations || [])
    .map((rec) => {
      const decoratedRec = { ...rec, _baseHome: baseHome, _baseAway: baseAway };
      const impossible = impossibleByCurrentScore(rec, live);
      const liveProbability = liveProbabilityForRecommendation(decoratedRec, liveModel);
      const longTail = impossible || longTailByCurrentScore(rec, live, liveProbability);
      const effectiveProbability = longTail?.impossible ? 0 : liveProbability;
      const liveEdge = edge(effectiveProbability, rec.marketPrice);
      const maxBuyPrice = longTail?.impossible || longTail?.longTail ? 0 : fairBuyPrice(effectiveProbability, dataQuality.status === "synced" ? 0.04 : 0.06);
      const hasLiveMarket = rec.chart?.source === "Polymarket" && typeof rec.chart.currentPrice === "number";
      const action = !longTail?.impossible && !longTail?.longTail && !hasLiveMarket
        ? { action: "wait", label: "等待实时盘口", canConsider: false }
        : liveActionFor(liveEdge, rec, dataQuality, longTail);
      const risks = [
        longTail?.reason || "",
        dataQuality.status !== "synced" ? "现场技术统计不足，不能强推荐。" : "",
        !hasLiveMarket ? "当前盘口不是 Polymarket 实时价，价格建议降级。" : "",
        live.completed ? "比赛已结束或进入赛后状态，只用于复盘，不建议入场。" : "",
        liveReviewRisk(rec, liveEdge)
      ].filter(Boolean);
      return {
        key: rec.key,
        marketType: rec.marketType,
        marketTypeLabel: rec.marketTypeLabel,
        name: rec.name,
        liveProbability: effectiveProbability,
        rawLiveProbability: liveProbability,
        baseProbability: rec.modelProbability,
        marketPrice: rec.marketPrice,
        edge: liveEdge,
        maxBuyPrice,
        action: live.completed ? "avoid" : action.action,
        label: live.completed && !longTail?.impossible ? "已完赛复盘" : action.label,
        canConsider: !longTail?.impossible && !longTail?.longTail && !live.completed && Boolean(action.canConsider) && hasLiveMarket && dataQuality.status === "synced",
        hasLiveMarket,
        excluded: Boolean(longTail?.impossible || longTail?.longTail),
        excludedReason: longTail?.reason || "",
        longTail: Boolean(longTail?.longTail),
        source: rec.chart?.source || "",
        chart: rec.chart ? {
          source: rec.chart.source,
          currentPrice: rec.chart.currentPrice,
          marketQuestion: rec.chart.marketQuestion,
          marketSlug: rec.chart.marketSlug
        } : null,
        risks
      };
    })
    .filter((rec) => typeof rec.liveProbability === "number" && typeof rec.marketPrice === "number")
    .sort((a, b) => {
      const actionScore = Number(b.canConsider) - Number(a.canConsider);
      if (actionScore) return actionScore;
      const liveMarketScore = Number(b.hasLiveMarket) - Number(a.hasLiveMarket);
      if (liveMarketScore) return liveMarketScore;
      const excludedScore = Number(a.excluded) - Number(b.excluded);
      if (excludedScore) return excludedScore;
      return (b.edge ?? -9) - (a.edge ?? -9);
    })
    .slice(0, 8);
}

function buildLiveDataQuality(live) {
  if (!live) return { status: "missing", label: "现场源不可用", reasons: ["ESPN summary 未返回。"] };
  if (live.completed) return { status: "post", label: "已完赛", reasons: ["比赛已结束，实时买点只用于复盘。"] };
  if (!live.inProgress) return { status: "pre", label: "未开赛", reasons: ["比赛尚未进入 live 状态，实时买点等待开赛后刷新。"] };
  if (hasUsefulLiveStats(live.stats)) return { status: "synced", label: "现场统计已同步", reasons: ["比分、射门、射正、角球和控球可用。"] };
  if (live.score?.home != null && live.score?.away != null) return { status: "score-only", label: "仅比分可用", reasons: ["现场技术统计未同步，推荐降级。"] };
  return { status: "missing", label: "现场数据缺失", reasons: ["比分和技术统计均不可用。"] };
}

function buildLiveRecommendationSummary(match, live, recommendations, dataQuality, liveModel) {
  if (dataQuality.status === "pre") {
    return {
      action: "wait",
      title: "等待开赛后实时复核",
      summary: "比赛尚未进入 live 状态；开赛后会用比分、射门、射正、角球、控球和当前价重新排序盘口。",
      reasons: dataQuality.reasons || []
    };
  }
  if (dataQuality.status === "missing") {
    return {
      action: "wait",
      title: "等待现场数据",
      summary: "实时源暂未返回可用比分或技术统计；不显示入场建议。",
      reasons: dataQuality.reasons || []
    };
  }
  const top = recommendations?.[0];
  if (!top) {
    return {
      action: "wait",
      title: "等待实时数据",
      summary: "当前没有可用价格或现场统计，先不做实时买点判断。",
      reasons: dataQuality.reasons || []
    };
  }
  const actionable = recommendations.find((rec) => rec.canConsider);
  if (!actionable) {
    const livePriced = recommendations.filter((rec) => rec.hasLiveMarket && !rec.excluded);
    const snapshotCount = recommendations.filter((rec) => !rec.hasLiveMarket && !rec.excluded).length;
    const bestLive = [...livePriced].sort((a, b) => (b.edge ?? -9) - (a.edge ?? -9))[0];
    const summary = livePriced.length
      ? `实时盘已匹配 ${livePriced.length} 个，但当前最高 edge ${formatPercent(bestLive?.edge)} 未达到入场条件；${snapshotCount ? "让球/BTTS/大小球仍在等待 Polymarket 实时价。" : "暂不追价。"}`
      : `当前没有匹配到可用 Polymarket 实时价；${snapshotCount ? "下方本地盘口只作比分模型参考，不作为买点。" : "先等待盘口刷新。"}`;
    return {
      action: "wait",
      title: "当前没有实时买点",
      summary,
      reasons: [
        ...(liveModel.notes || []).slice(0, 3),
        ...recommendations.flatMap((rec) => rec.risks || []).slice(0, 3)
      ].filter(Boolean).filter((reason, index, list) => list.indexOf(reason) === index).slice(0, 5)
    };
  }
  const actionableTop = actionable;
  const priceText = formatCents(actionableTop.marketPrice);
  const maxText = formatCents(actionableTop.maxBuyPrice);
  const action = actionableTop.canConsider ? "watch" : actionableTop.action || "wait";
  const titlePrefix = actionableTop.canConsider
    ? "实时首选观察"
    : actionableTop.excluded
      ? actionableTop.label
      : actionableTop.action === "wait"
        ? "等待实时盘口"
        : "实时观察";
  return {
    action,
    title: `${titlePrefix}：${actionableTop.name}`,
    summary: `${actionableTop.name} 当前 ${priceText}，实时模型 ${formatPercent(actionableTop.liveProbability)}，edge ${formatPercent(actionableTop.edge)}，建议上限 ${maxText}。`,
    reasons: [
      ...(liveModel.notes || []).slice(0, 3),
      ...(actionableTop.risks || []).slice(0, 2)
    ].filter(Boolean).slice(0, 5)
  };
}

function dashboardMatchByIdOrSchedule(dashboard, matchId) {
  const aliases = matchIdAliases(matchId);
  return (dashboard?.matches || []).find((match) =>
    aliases.includes(match.id)
    || aliases.includes(match.scheduleId)
    || matchIdAliases(match.scheduleId).some((alias) => aliases.includes(alias))
  ) || null;
}

function scheduleEventFromMatch(match) {
  if (!match) return null;
  return {
    scheduleId: match.scheduleId || String(match.id || "").match(/^schedule-(\d+)$/)?.[1] || "",
    kickoffUtc: match.kickoffShanghai || match.kickoffLocal || "",
    status: match.scheduleStatus || "",
    completed: isFinishedStatus(match.scheduleStatus),
    home: {
      code: match.home,
      name: match.homeEnglishName || TEAM_SEARCH_NAMES[match.home] || match.homeName
    },
    away: {
      code: match.away,
      name: match.awayEnglishName || TEAM_SEARCH_NAMES[match.away] || match.awayName
    }
  };
}

async function refreshMatchMarketsForLive(match, live, force = false) {
  const shouldRefresh = live?.inProgress || live?.completed;
  if (!shouldRefresh) {
    return {
      ok: false,
      skipped: true,
      source: "cached-dashboard",
      reason: "比赛未进入实时状态，沿用缓存盘口。"
    };
  }
  const scheduleEvent = scheduleEventFromMatch(match);
  if (!scheduleEvent?.scheduleId) {
    return {
      ok: false,
      skipped: true,
      source: "cached-dashboard",
      reason: "缺少 ESPN schedule id，无法定向刷新盘口。"
    };
  }
  const result = await withTimeout(fetchPolymarket({ matches: [scheduleEvent] }), LIVE_MARKET_REFRESH_TIMEOUT_MS, "live market refresh");
  if (!result?.ok) {
    return {
      ok: false,
      source: "Polymarket 实时市场 API",
      error: translateError(result?.error || "实时盘口刷新失败")
    };
  }
  attachMarketCharts([match], result);
  return {
    ok: true,
    source: result.source || "Polymarket 实时市场 API",
    marketCount: Array.isArray(result.markets) ? result.markets.length : 0,
    refreshedAt: new Date().toISOString()
  };
}

async function buildLiveMatchInsight(matchId, { force = false, persist = true } = {}) {
  let dashboard = await getPersistedLightCache();
  if (!dashboard?.matches?.length) {
    dashboard = await buildDashboard({
      force: false,
      recordHistory: false,
      includeElite: false,
      includeOpenAi: false,
      light: true,
      background: true
    });
  } else if (force || payloadCacheAgeMs(dashboard) > LIGHT_CACHE_TTL_MS) {
    scheduleBackgroundLightRefresh();
  }
  const match = dashboardMatchByIdOrSchedule(dashboard, matchId);
  if (!match) {
    return {
      ok: false,
      error: "未找到这场比赛",
      matchId
    };
  }
  const scheduleId = match.scheduleId || String(match.id || matchId || "").match(/^schedule-(\d+)$/)?.[1] || "";
  if (!scheduleId) {
    return {
      ok: false,
      error: "这场比赛缺少 ESPN schedule id，无法查询实时 summary。",
      matchId: match.id
    };
  }
  match.scheduleId = scheduleId;
  const url = `${ESPN_WORLDCUP_SUMMARY}?event=${encodeURIComponent(scheduleId)}`;
  const summaryResult = await timedFetchJson(url, { timeoutMs: LIVE_MATCH_FETCH_TIMEOUT_MS });
  if (!summaryResult.ok) {
    return {
      ok: false,
      matchId: match.id,
      scheduleId: match.scheduleId,
      source: "ESPN FIFA World Cup summary",
      error: translateError(summaryResult.error),
      capturedAt: new Date().toISOString()
    };
  }
  const live = normalizeLiveEvent(summaryResult.data, match);
  const dataQuality = buildLiveDataQuality(live);
  const marketRefresh = await refreshMatchMarketsForLive(match, live, force);
  const liveModel = liveProbabilityModel(match, live);
  const recommendations = buildLiveRecommendations(match, live, liveModel, dataQuality);
  const payload = {
    ok: true,
    matchId: match.id,
    scheduleId: match.scheduleId,
    matchName: `${match.homeName} vs ${match.awayName}`,
    homeName: match.homeName,
    awayName: match.awayName,
    kickoffShanghai: match.kickoffShanghai,
    source: live.source,
    capturedAt: new Date().toISOString(),
    dataQuality,
    marketRefresh,
    live,
    liveModel,
    recommendations,
    marketCatalog: match.marketCatalog,
    recommendationSummary: buildLiveRecommendationSummary(match, live, recommendations, dataQuality, liveModel),
    disclaimer: "实时买点是研究辅助，不自动下单；数据不足、价格缺失或比赛已结束时必须降级。"
  };
  if (persist && LIVE_MATCH_PERSIST_ENABLED) {
    recordLiveMatchSnapshot(payload).catch((error) => {
      console.error(`Failed to record live match snapshot: ${error.message}`);
    });
  }
  return payload;
}

async function checkOpportunityCurrentPrice(params = {}) {
  const matchId = String(params.matchId || "").trim();
  const marketKey = String(params.marketKey || "").trim();
  if (!matchId || !marketKey) {
    return {
      ok: false,
      error: "missing_match_or_market",
      message: "缺少比赛或盘口标识。"
    };
  }
  const dashboard = await withTimeout(buildDashboard({
    force: true,
    recordHistory: false,
    includeElite: false,
    includeOpenAi: false,
    light: true
  }), OPPORTUNITY_PRICE_CHECK_TIMEOUT_MS, "opportunity price check");
  if (!dashboard.ok && dashboard.error) return dashboard;
  const match = (dashboard.matches || []).find((item) => item.id === matchId);
  if (!match) {
    return {
      ok: false,
      error: "match_not_found",
      message: "当前三天窗口里没有找到这场比赛，可能已经结束或被隐藏。"
    };
  }
  const rec = (match.recommendations || []).find((item) => item.key === marketKey);
  if (!rec) {
    return {
      ok: false,
      error: "market_not_found",
      message: "没有找到这条提醒对应的盘口。"
    };
  }
  return buildOpportunityPriceCheck(match, rec, params);
}

function normalizeAiOpportunity(raw, fallback, model) {
  if (!raw || typeof raw !== "object") return fallback;
  return {
    ...fallback,
    source: fallback.source || "Polymarket",
    aiSource: "openai",
    model,
    action: ["watch", "wait", "avoid"].includes(raw.action) ? raw.action : fallback.action,
    confidence: ["low", "medium", "high"].includes(raw.confidence) ? raw.confidence : fallback.confidence,
    title: String(raw.title || fallback.title || "").slice(0, 100),
    summary: String(raw.summary || fallback.summary || "").slice(0, 240),
    entryText: String(raw.entryText || fallback.entryText || "").slice(0, 200),
    reasons: Array.isArray(raw.reasons)
      ? raw.reasons.map((item) => String(item).slice(0, 180)).filter(Boolean).slice(0, 5)
      : fallback.reasons,
    risks: Array.isArray(raw.risks)
      ? raw.risks.map((item) => String(item).slice(0, 180)).filter(Boolean).slice(0, 5)
      : fallback.risks
  };
}

async function enhanceOpportunitiesWithAi(opportunities, matches) {
  if (!AI_TRADE_PLAN_ENABLED || !opportunities.length) return opportunities;
  const config = await getOpenAiConfig();
  if (!config.apiKey) return opportunities;
  const byId = new Map(opportunities.map((item) => [item.id, item]));
  const matchById = new Map((matches || []).map((match) => [match.id, match]));
  const prompt = {
    task: "为世界杯机会雷达生成中文提醒。只基于给定模型、盘口、曲线、数据完整度和持仓信息；这是研究提醒，不是自动下单，不承诺收益。",
    output: "返回 JSON：{opportunities:[{id,title,action,confidence,summary,entryText,reasons:[...],risks:[...]}]}",
    rules: [
      "action 只能是 watch/wait/avoid；不要写强买入、重仓、梭哈、稳赚。",
      "如果数据闸门限制或曲线不足，必须写观察/等待。",
      "如果 reviewDiscipline.reasons 不为空，必须说明降级原因，不能把它写成主买。",
      "BTTS 与小球冲突时，不要同时推荐；低比分集中时优先小球或等待。",
      "受让0.5遇到强队1-0风险时，只能观察或等待更好价格。",
      "entryText 必须给价格纪律：不高于建议价，超过等待。",
      "理由只引用输入里的数字和事实，不要编造首发、伤停或外部消息。",
      "每条 summary 保持一行短结论。"
    ],
    opportunities: opportunities.map((item) => {
      const match = matchById.get(item.matchId) || {};
      return {
        id: item.id,
        matchup: item.matchName,
        kickoffShanghai: item.kickoffShanghai,
        market: item.name,
        marketType: item.marketTypeLabel,
        modelProbability: item.modelProbability,
        marketPrice: item.marketPrice,
        edge: item.edge,
        disciplinedEdge: match.recommendations?.find((rec) => rec.key === item.marketKey)?.disciplinedEdge,
        maxBuyPrice: item.maxBuyPrice,
        source: item.source,
        confidence: item.confidence,
        tradingGate: match.tradingGate,
        aiPrediction: match.aiPrediction,
        topScores: (match.probabilities?.topScores || []).slice(0, 4),
        contextRisks: match.context?.riskFlags || [],
        reviewDiscipline: match.recommendations?.find((rec) => rec.key === item.marketKey)?.reviewDiscipline,
        reasons: item.reasons,
        risks: item.risks
      };
    })
  };
  const result = await withTimeout(timedFetchJson(openAiEndpoint(config), {
    method: "POST",
    timeoutMs: OPPORTUNITY_AI_TIMEOUT_MS,
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
          content: "你只输出 JSON，不输出 Markdown。你是谨慎的足球研究提醒助手。"
        },
        {
          role: "user",
          content: JSON.stringify(prompt)
        }
      ]
    })
  }), OPPORTUNITY_AI_TIMEOUT_MS + 500, "AI opportunity scan");
  if (!result.ok) {
    console.error(`AI opportunity scan unavailable: ${result.error}`);
    return opportunities;
  }
  const parsed = safeJsonFromText(extractOpenAiText(result.data));
  const aiItems = Array.isArray(parsed?.opportunities) ? parsed.opportunities : [];
  for (const item of aiItems) {
    const id = String(item.id || "");
    if (!byId.has(id)) continue;
    byId.set(id, normalizeAiOpportunity(item, byId.get(id), config.model));
  }
  return opportunities.map((item) => byId.get(item.id) || item);
}

async function buildOpportunityRadar({ force = false } = {}) {
  const now = Date.now();
  if (!force && opportunityCache && now - (Date.parse(opportunityCache.meta?.generatedAt || "") || 0) < OPPORTUNITY_REFRESH_MS) {
    return opportunityCache;
  }
  if (!force) {
    const persisted = await readOptionalJson(OPPORTUNITY_CACHE_PATH, null);
    const generatedAt = Date.parse(persisted?.meta?.generatedAt || "") || 0;
    if (persisted?.meta && now - generatedAt < OPPORTUNITY_REFRESH_MS) {
      opportunityCache = persisted;
      return opportunityCache;
    }
  }
  const dashboard = await buildDashboard({
    force,
    recordHistory: false,
    includeElite: true,
    includeOpenAi: false,
    light: true
  });
  const focus = focusMatchdayMatches(dashboard.matches || [], now);
  const radarMatches = focus.matches.length ? focus.matches : dashboard.matches || [];
  const scanDate = focus.matchDate || opportunityScanDate(radarMatches);
  const candidateRows = opportunityCandidateRows(radarMatches, scanDate, now);
  const candidates = diversifiedOpportunityRows(candidateRows, OPPORTUNITY_MAX_ITEMS, now);
  const ruleItems = candidates.map(buildRuleOpportunity);
  const items = await enhanceOpportunitiesWithAi(ruleItems, radarMatches);
  const activeItems = items
    .filter((item) => Date.parse(item.expiresAt || "") > Date.now())
    .slice(0, OPPORTUNITY_MAX_ITEMS);
  const observationRows = opportunityObservationRows(radarMatches, scanDate, now);
  const observationCandidates = diversifiedOpportunityRows(observationRows, OPPORTUNITY_OBSERVATION_MAX_ITEMS, now);
  const observations = observationCandidates.map(buildObservationOpportunity)
    .filter((item) => Date.parse(item.expiresAt || "") > Date.now())
    .slice(0, OPPORTUNITY_OBSERVATION_MAX_ITEMS);
  const payload = {
    meta: {
      ok: true,
      generatedAt: new Date().toISOString(),
      refreshMs: OPPORTUNITY_REFRESH_MS,
      scanDate,
      scanWindowDays: MATCH_WINDOW_DAYS,
      focusMatchDate: focus.matchDate || "",
      focusMarketDate: focus.matchDate || "",
      focusMatchCount: radarMatches.length,
      candidateCount: candidateRows.length,
      observationCandidateCount: observationRows.length,
      observationCount: observations.length,
      nextRefreshAt: new Date(Date.now() + OPPORTUNITY_REFRESH_MS).toISOString(),
      source: "AI opportunity radar",
      disclaimer: "研究辅助提醒，不自动下单，不承诺收益；观察雷达不是买入指令。"
    },
    items: activeItems,
    observations
  };
  opportunityCache = payload;
  writeJsonAtomic(OPPORTUNITY_CACHE_PATH, payload).catch((error) => {
    console.error(`Failed to persist opportunity cache: ${error.message}`);
  });
  return payload;
}

async function getOpportunityCache() {
  if (opportunityCache) return opportunityCache;
  const persisted = await readOptionalJson(OPPORTUNITY_CACHE_PATH, null);
  if (persisted?.meta) opportunityCache = persisted;
  return opportunityCache;
}

function pendingOpportunityPayload() {
  return {
    meta: {
      ok: true,
      generatedAt: new Date().toISOString(),
      refreshMs: OPPORTUNITY_REFRESH_MS,
      scanDate: shanghaiDateDashed(),
      nextRefreshAt: new Date(Date.now() + OPPORTUNITY_REFRESH_MS).toISOString(),
      source: "AI opportunity radar",
      backgroundRefresh: true,
      disclaimer: "研究辅助提醒，不自动下单，不承诺收益。",
      status: "scanning"
    },
    items: []
  };
}

function scheduleOpportunityRefresh({ force = true } = {}) {
  if (opportunityRefreshPromise) return opportunityRefreshPromise;
  opportunityRefreshPromise = buildOpportunityRadar({ force: true })
    .catch((error) => {
      console.error(`Opportunity radar refresh failed: ${error.message}`);
    })
    .finally(() => {
      opportunityRefreshPromise = null;
    });
  return opportunityRefreshPromise;
}

function eliteMonitorRankScore(trader) {
  const sample = Number(trader.worldCupSettledPositions || trader.soccerSettledPositions || 0);
  const winRate = Number(trader.worldCupWinRateEstimate ?? trader.winRateEstimate ?? 0);
  const pnl = Number(trader.worldCupPnl || trader.soccerPnl || 0);
  const sampleWeight = Math.min(1, sample / 20);
  const pnlWeight = Math.log10(Math.max(1, pnl)) / 10;
  return winRate * 0.62 + sampleWeight * 0.24 + Math.max(0, pnlWeight) * 0.14;
}

function worldCupEliteStatus(trader) {
  const sample = Number(trader.worldCupSettledPositions || 0);
  const winRate = Number(trader.worldCupWinRateEstimate ?? 0);
  const pnl = Number(trader.worldCupPnl || 0);
  if (sample < ELITE_MIN_WORLD_CUP_SAMPLE) {
    return {
      tier: "watchlist",
      label: "样本不足",
      reason: `世界杯已结算样本 ${sample}/${ELITE_MIN_WORLD_CUP_SAMPLE}`
    };
  }
  if (pnl <= ELITE_MIN_WORLD_CUP_PNL) {
    return {
      tier: "watchlist",
      label: "负收益观察",
      reason: `世界杯PNL ${Math.round(pnl).toLocaleString()}，未超过 0`
    };
  }
  if (winRate < ELITE_MIN_WORLD_CUP_WIN_RATE) {
    return {
      tier: "watchlist",
      label: "胜率不足",
      reason: `世界杯胜率 ${Math.round(winRate * 1000) / 10}% < ${Math.round(ELITE_MIN_WORLD_CUP_WIN_RATE * 100)}%`
    };
  }
  if (trader.traderStyle === "hedged") {
    return {
      tier: "watchlist",
      label: "对冲/套利型观察",
      reason: trader.traderStyleReason || "当前持仓出现互斥方向组合，不作为可跟方向信号"
    };
  }
  return {
    tier: "elite",
    label: "世界杯高手",
    reason: `世界杯样本 ${sample}，胜率 ${Math.round(winRate * 1000) / 10}%，PNL ${Math.round(pnl).toLocaleString()}`
  };
}

function attachWorldCupEliteStatus(trader) {
  const status = worldCupEliteStatus(trader);
  return {
    ...trader,
    worldCupEliteTier: status.tier,
    worldCupEliteLabel: status.label,
    worldCupEliteReason: status.reason
  };
}

function isWorldCupEliteTrader(trader) {
  return trader?.worldCupEliteTier === "elite" || worldCupEliteStatus(trader).tier === "elite";
}

function analyzeDirectionalProfile(positions = []) {
  const groups = new Map();
  for (const position of positions || []) {
    const groupKey = position.matchId && position.marketType
      ? `${position.matchId}:${position.marketType}`
      : `${position.matchId || ""}:${position.marketType || ""}:${position.conditionId || ""}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        matchId: position.matchId || "",
        marketType: position.marketType || "",
        conditionIds: new Set(),
        marketName: position.marketName || "",
        outcomes: new Map(),
        totalValue: 0
      });
    }
    const group = groups.get(groupKey);
    group.conditionIds.add(position.conditionId || "");
    const outcome = String(position.recommendationKey || position.outcome || "unknown");
    const value = Number(position.currentValue || 0);
    group.outcomes.set(outcome, (group.outcomes.get(outcome) || 0) + value);
    group.totalValue += value;
  }

  let hedgedMarkets = 0;
  let totalGroupedValue = 0;
  let maxGroupValue = 0;
  let worstPurity = 1;
  const examples = [];
  for (const group of groups.values()) {
    const values = [...group.outcomes.values()].filter((value) => value > 0.01).sort((a, b) => b - a);
    if (!values.length) continue;
    totalGroupedValue += group.totalValue;
    maxGroupValue = Math.max(maxGroupValue, group.totalValue);
    const top = values[0] || 0;
    const second = values[1] || 0;
    const purity = group.totalValue > 0 ? top / group.totalValue : 1;
    worstPurity = Math.min(worstPurity, purity);
    if (values.length >= 2 && second >= ELITE_HEDGE_MIN_SECONDARY_VALUE && purity < ELITE_DIRECTIONAL_MIN_PURITY) {
      hedgedMarkets += 1;
      examples.push(`${group.marketName || group.marketType || "盘口"} 多方向持仓，主方向占比 ${Math.round(purity * 100)}%`);
    }
  }
  const directionalPurity = totalGroupedValue > 0 ? Math.max(0, Math.min(1, worstPurity)) : 1;
  const maxConcentration = totalGroupedValue > 0 ? maxGroupValue / totalGroupedValue : 1;
  const isHedged = hedgedMarkets > 0;
  return {
    type: isHedged ? "hedged" : "directional",
    label: isHedged ? "对冲/套利型观察" : "方向型账号",
    directionalPurity,
    hedgedMarkets,
    maxConcentration,
    reason: isHedged
      ? examples.slice(0, 2).join("；")
      : `当前持仓方向纯度 ${Math.round(directionalPurity * 100)}%`,
    examples: examples.slice(0, 3)
  };
}

function attachDirectionalProfile(trader) {
  const profile = analyzeDirectionalProfile(trader.currentPositionMix || []);
  return {
    ...trader,
    directionalProfile: profile,
    traderStyle: profile.type,
    traderStyleLabel: profile.label,
    traderStyleReason: profile.reason,
    directionalPurity: profile.directionalPurity
  };
}

function collectEliteActivePositions(matches = []) {
  const byWallet = new Map();
  for (const match of matches || []) {
    for (const rec of match.recommendations || []) {
      for (const signal of [...(rec.eliteSignals || []), ...(rec.watchlistSignals || [])]) {
        const key = walletKey(signal.proxyWallet);
        if (!key) continue;
        const list = byWallet.get(key) || [];
        list.push({
          matchId: match.id,
          matchName: `${match.homeName} vs ${match.awayName}`,
          kickoffShanghai: match.kickoffShanghai,
          marketKey: rec.key,
          marketType: rec.marketType,
          marketTypeLabel: rec.marketTypeLabel,
          marketName: rec.name,
          outcome: signal.outcome || rec.name,
          profileUrl: signal.profileUrl || polymarketProfileUrl(signal.proxyWallet),
          size: signal.size,
          currentValue: signal.currentValue,
          totalBought: signal.totalBought,
          avgPrice: signal.avgPrice,
          currPrice: signal.currPrice,
          recentBuy: signal.recentBuy || null,
          modelProbability: rec.modelProbability,
          marketPrice: rec.marketPrice,
          edge: rec.edge,
          decisionLabel: rec.decision?.label || "",
          source: rec.chart?.source || ""
        });
        byWallet.set(key, list);
      }
    }
  }
  return byWallet;
}

function buildEliteMonitorPayload(eliteTraders, matches, { source = "dashboard" } = {}) {
  const activeByWallet = collectEliteActivePositions(matches);
  const normalizeMonitorTrader = (trader) => {
      const activePositions = activeByWallet.get(walletKey(trader.proxyWallet)) || [];
      return {
        soccerRank: trader.soccerRank,
        worldCupRank: trader.worldCupRank || trader.soccerRank,
        userName: trader.userName,
        proxyWallet: trader.proxyWallet,
        profileUrl: trader.profileUrl || polymarketProfileUrl(trader.proxyWallet || trader.userName),
        verifiedBadge: trader.verifiedBadge,
        worldCupWinRateEstimate: trader.worldCupWinRateEstimate ?? trader.winRateEstimate,
        worldCupPnl: trader.worldCupPnl ?? 0,
        worldCupVolume: trader.worldCupVolume ?? 0,
        worldCupSettledPositions: trader.worldCupSettledPositions ?? 0,
        worldCupWins: trader.worldCupWins ?? 0,
        worldCupLosses: trader.worldCupLosses ?? 0,
        worldCupPushes: trader.worldCupPushes ?? 0,
        worldCupEliteTier: trader.worldCupEliteTier || worldCupEliteStatus(trader).tier,
        worldCupEliteLabel: trader.worldCupEliteLabel || worldCupEliteStatus(trader).label,
        worldCupEliteReason: trader.worldCupEliteReason || worldCupEliteStatus(trader).reason,
        traderStyle: trader.traderStyle || "directional",
        traderStyleLabel: trader.traderStyleLabel || "方向型账号",
        traderStyleReason: trader.traderStyleReason || "",
        directionalPurity: trader.directionalPurity ?? null,
        directionalProfile: trader.directionalProfile || null,
        worldCupHistoryStatus: trader.worldCupHistoryStatus || "empty",
        worldCupHistoryError: trader.worldCupHistoryError || "",
        worldCupHistoryFetchedAt: trader.worldCupHistoryFetchedAt || trader.closedPositionsFetchedAt || "",
        worldCupHistoryCacheHit: Boolean(trader.worldCupHistoryCacheHit),
        worldCupHistoryStale: Boolean(trader.worldCupHistoryStale),
        closedPositionStatus: trader.closedPositionStatus || "",
        closedPositionError: trader.closedPositionError || "",
        closedPositionPartial: Boolean(trader.closedPositionPartial),
        closedPositionCacheHit: Boolean(trader.closedPositionCacheHit),
        closedPositionStale: Boolean(trader.closedPositionStale),
        closedPositionsChecked: trader.closedPositionsChecked ?? 0,
        winRateEstimate: trader.winRateEstimate,
        soccerPnl: trader.soccerPnl,
        soccerVolume: trader.soccerVolume,
        soccerSettledPositions: trader.soccerSettledPositions,
        soccerWins: trader.soccerWins,
        soccerLosses: trader.soccerLosses,
        soccerPushes: trader.soccerPushes,
        overallPnl: trader.overallPnl,
        worldCupSampleTitles: trader.worldCupSampleTitles || trader.sampleTitles || [],
        sampleTitles: trader.sampleTitles || [],
        activePositions,
        activePositionCount: activePositions.length,
        activeCurrentValue: activePositions.reduce((sum, item) => sum + Number(item.currentValue || 0), 0),
        score: roundTo(eliteMonitorRankScore(trader), 4)
      };
    };
  const eliteTradersOnly = (eliteTraders?.traders || []).map(normalizeMonitorTrader);
  const watchlist = (eliteTraders?.watchlist || []).map(normalizeMonitorTrader);
  const traders = eliteTradersOnly
    .sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (Math.abs(scoreDiff) > 0.0001) return scoreDiff;
      const pnlDiff = (b.worldCupPnl || 0) - (a.worldCupPnl || 0);
      if (Math.abs(pnlDiff) > 1) return pnlDiff;
      const worldCupSampleDiff = (b.worldCupSettledPositions || 0) - (a.worldCupSettledPositions || 0);
      if (worldCupSampleDiff) return worldCupSampleDiff;
      const winRateDiff = (b.worldCupWinRateEstimate ?? b.winRateEstimate ?? 0) - (a.worldCupWinRateEstimate ?? a.winRateEstimate ?? 0);
      if (Math.abs(winRateDiff) > 0.0001) return winRateDiff;
      return (b.activeCurrentValue || 0) - (a.activeCurrentValue || 0);
    });
  const watchlistSorted = watchlist
    .sort((a, b) => {
      const valueDiff = (b.activeCurrentValue || 0) - (a.activeCurrentValue || 0);
      if (Math.abs(valueDiff) > 1) return valueDiff;
      const activeDiff = b.activePositionCount - a.activePositionCount;
      if (activeDiff) return activeDiff;
      const pnlDiff = (b.worldCupPnl || 0) - (a.worldCupPnl || 0);
      if (Math.abs(pnlDiff) > 1) return pnlDiff;
      return (b.worldCupWinRateEstimate ?? 0) - (a.worldCupWinRateEstimate ?? 0);
    });
  const allMonitorTraders = [...traders, ...watchlistSorted];
  return {
    ok: Boolean(eliteTraders?.ok) || allMonitorTraders.length > 0,
    source: eliteTraders?.source || "Polymarket Data API",
    updatedAt: eliteTraders?.updatedAt || new Date().toISOString(),
    cacheTtlSeconds: eliteTraders?.cacheTtlSeconds || Math.round(ELITE_LEADERBOARD_CACHE_TTL_MS / 1000),
    cacheHit: Boolean(eliteTraders?.cacheHit),
    sourceMode: source,
    rankingBasis: `世界杯高手榜只收可审计正样本账号：样本 >= ${ELITE_MIN_WORLD_CUP_SAMPLE}、胜率 >= ${Math.round(ELITE_MIN_WORLD_CUP_WIN_RATE * 100)}%、世界杯PNL > ${ELITE_MIN_WORLD_CUP_PNL}；低胜率或负收益大户只作为当前持仓观察。`,
    candidateCount: eliteTraders?.candidateCount || 0,
    checkedCandidateCount: eliteTraders?.checkedCandidateCount || eliteTraders?.candidateCount || 0,
    marketPositions: eliteTraders?.marketPositions || null,
    totals: {
      traders: traders.length,
      watchlist: watchlistSorted.length,
      activeTraders: allMonitorTraders.filter((trader) => trader.activePositionCount > 0).length,
      activePositions: allMonitorTraders.reduce((sum, trader) => sum + trader.activePositionCount, 0),
      activeCurrentValue: allMonitorTraders.reduce((sum, trader) => sum + trader.activeCurrentValue, 0)
    },
    traders: traders.slice(0, ELITE_TRADER_LIMIT),
    watchlist: watchlistSorted.slice(0, ELITE_TRADER_LIMIT),
    error: eliteTraders?.error
  };
}

async function buildEliteMonitor({ force = false } = {}) {
  if (!force && dashboardCache?.eliteTraders?.traders?.length) {
    return buildEliteMonitorPayload(dashboardCache.eliteTraders, dashboardCache.matches || [], { source: "dashboard-cache" });
  }
  const dashboard = await buildDashboard({
    force,
    recordHistory: false,
    includeElite: true,
    includeOpenAi: false,
    light: false
  });
  return buildEliteMonitorPayload(dashboard.eliteTraders || {}, dashboard.matches || [], { source: "live-dashboard" });
}

function parseSnapshotPayload(raw, fallback = {}) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function handicapLineFromKey(key) {
  const match = String(key || "").match(/^h([+-]?\d+(?:_\d+)?)-(home|away)$/);
  if (!match) return null;
  return Number(match[1].replace("_", "."));
}

function settleRecommendationFromResult(rec, result) {
  const homeGoals = Number(result.homeGoals);
  const awayGoals = Number(result.awayGoals);
  if (!Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) {
    return {
      status: "pending",
      label: "待比分",
      outcomeText: "没有最终比分，暂不结算。"
    };
  }
  if (rec.marketType === "moneyline") {
    const won = rec.key === result.resultKey;
    return {
      status: won ? "hit" : "miss",
      label: won ? "命中" : "未命中",
      outcomeText: `赛果 ${homeGoals}-${awayGoals}，胜平负结果为 ${result.resultLabel || result.resultKey}。`,
      profitPerShare: typeof rec.marketPrice === "number"
        ? (won ? 1 - rec.marketPrice : -rec.marketPrice)
        : null
    };
  }
  if (rec.marketType === "total") {
    const total = homeGoals + awayGoals;
    const won = rec.key === "under25" ? total < 2.5 : rec.key === "over25" ? total > 2.5 : null;
    if (won == null) {
      return { status: "pending", label: "待结算", outcomeText: "大小球盘口暂未识别。" };
    }
    return {
      status: won ? "hit" : "miss",
      label: won ? "命中" : "未命中",
      outcomeText: `总进球 ${total}，${rec.key === "under25" ? "小于 2.5" : "大于 2.5"} ${won ? "成立" : "未成立"}。`,
      profitPerShare: typeof rec.marketPrice === "number"
        ? (won ? 1 - rec.marketPrice : -rec.marketPrice)
        : null
    };
  }
  if (rec.marketType === "btts") {
    const bothScored = homeGoals > 0 && awayGoals > 0;
    const won = rec.key === "bttsYes" ? bothScored : rec.key === "bttsNo" ? !bothScored : null;
    if (won == null) {
      return { status: "pending", label: "待结算", outcomeText: "双方进球盘口暂未识别。" };
    }
    return {
      status: won ? "hit" : "miss",
      label: won ? "命中" : "未命中",
      outcomeText: `赛果 ${homeGoals}-${awayGoals}，两队${bothScored ? "都有进球" : "没有都进球"}。`,
      profitPerShare: typeof rec.marketPrice === "number"
        ? (won ? 1 - rec.marketPrice : -rec.marketPrice)
        : null
    };
  }
  if (rec.marketType === "handicap") {
    const line = Number(rec.payload?.handicap?.homeLine ?? handicapLineFromKey(rec.key));
    const side = String(rec.key || "").endsWith("-away") ? "away" : "home";
    if (!Number.isFinite(line)) {
      return { status: "pending", label: "待结算", outcomeText: "让球线未结构化，暂不结算。" };
    }
    const adjustedHome = homeGoals + line;
    const diff = adjustedHome - awayGoals;
    const sideDiff = side === "home" ? diff : -diff;
    const status = sideDiff > 0 ? "hit" : sideDiff === 0 ? "push" : "miss";
    return {
      status,
      label: status === "hit" ? "命中" : status === "push" ? "走水" : "未命中",
      outcomeText: `赛果 ${homeGoals}-${awayGoals}，${side === "home" ? "主队" : "客队"}让球结算为${status === "hit" ? "赢" : status === "push" ? "走水" : "输"}。`,
      profitPerShare: typeof rec.marketPrice === "number"
        ? (status === "hit" ? 1 - rec.marketPrice : status === "push" ? 0 : -rec.marketPrice)
        : null
    };
  }
  return {
    status: "pending",
    label: "待结算",
    outcomeText: "这个市场类型暂未纳入自动复盘结算。"
  };
}

function reviewReasonSummary(matchPayload, recPayload, settled) {
  const reasons = [];
  if (matchPayload?.aiPrediction?.reasons?.length) {
    reasons.push(...matchPayload.aiPrediction.reasons.slice(0, 2));
  }
  if (recPayload?.decision?.reasons?.length) {
    reasons.push(`当时限制：${recPayload.decision.reasons.slice(0, 3).join("、")}。`);
  } else if (recPayload?.decisionLabel) {
    reasons.push(`当时决策：${recPayload.decisionLabel}。`);
  }
  if (settled.status === "miss") {
    reasons.push(recPayload?.marketType === "btts"
      ? "复盘重点：BTTS 判断错误，优先检查弱队进球能力、强队零封能力、定位球/反击和临场进攻阵容。"
      : "复盘重点：模型方向与最终赛果不一致，优先检查首发、伤停、临场价格变化和强弱队低价价值判断。");
  } else if (settled.status === "hit") {
    reasons.push(recPayload?.marketType === "btts"
      ? "复盘重点：记录 BTTS 命中时双方 xG、近期进失球、定位球/反击证据和盘口价格。"
      : "复盘重点：记录命中时的数据完整度、盘口位置和曲线是否支持重复使用。");
  } else if (settled.status === "push") {
    reasons.push("复盘重点：让球走水说明方向未错但价格空间有限。");
  }
  return [...new Set(reasons.filter(Boolean))].slice(0, 5);
}

function compactReviewRecommendationPayload(payload = {}) {
  return {
    key: payload.key,
    marketType: payload.marketType,
    marketTypeLabel: payload.marketTypeLabel,
    name: payload.name,
    side: payload.side,
    handicap: payload.handicap || null,
    totalLine: payload.totalLine ?? null,
    odds: payload.odds || null,
    decision: payload.decision
      ? {
          action: payload.decision.action,
          label: payload.decision.label,
          stake: payload.decision.stake,
          gated: payload.decision.gated,
          reasons: (payload.decision.reasons || []).slice(0, 5)
        }
      : null,
    chart: payload.chart
      ? {
          source: payload.chart.source,
          marketId: payload.chart.marketId,
          conditionId: payload.chart.conditionId,
          tokenId: payload.chart.tokenId,
          marketQuestion: payload.chart.marketQuestion,
          label: payload.chart.label,
          currentPrice: payload.chart.currentPrice,
          historyPoints: Array.isArray(payload.chart.history) ? payload.chart.history.length : 0
        }
      : null,
    eliteSummary: payload.eliteSummary || null,
    holderSummary: payload.holderSummary || null
  };
}

function sqlString(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function resultReviewIdentity(result = {}) {
  const payload = parseSnapshotPayload(result.payload_json, {});
  return String(payload.scheduleId || canonicalMatchId(result.match_id) || result.match_id || "");
}

async function buildOpportunityReview({ limit = OPPORTUNITY_REVIEW_LIMIT } = {}) {
  const reviewStartedAt = Date.now();
  const reviewLog = (stage) => {
    if (process.env.OPPORTUNITY_REVIEW_DEBUG === "1") {
      console.log(`Opportunity review ${stage} +${Date.now() - reviewStartedAt}ms`);
    }
  };
  reviewLog("start");
  if (OPPORTUNITY_REVIEW_SCHEMA_CHECK) {
    try {
      await ensureHistorySchema();
    } catch (error) {
      console.error(`History schema check skipped for review: ${error.message}`);
    }
  }
  const safeLimit = Math.max(1, Math.min(120, Number(limit) || OPPORTUNITY_REVIEW_LIMIT));
  const sqlLimit = safeLimit * 3;
  const resultsOutput = await runSql(`
SELECT match_id, home_goals, away_goals, result_key, result_label, finished_at, updated_at, source, payload_json
FROM match_results
WHERE status = 'final'
ORDER BY COALESCE(finished_at, updated_at) DESC
LIMIT ${sqlLimit};
`, [], "all");
  const rawResults = JSON.parse(resultsOutput.trim().split("\n").filter(Boolean).pop() || "[]");
  reviewLog(`results ${rawResults.length}`);
  const results = [];
  const seenResultIds = new Set();
  for (const result of rawResults) {
    const canonical = resultReviewIdentity(result);
    if (!canonical || seenResultIds.has(canonical)) continue;
    seenResultIds.add(canonical);
    results.push(result);
    if (results.length >= safeLimit) break;
  }
  if (!results.length) {
    return {
      meta: {
        ok: true,
        generatedAt: new Date().toISOString(),
        source: "dashboard history backtest",
        limit: safeLimit,
        disclaimer: "复盘只比较历史预测与最终赛果，用于模型校准；不代表真实交易记录。"
      },
      totals: { matches: 0, hit: 0, miss: 0, push: 0, pending: 0 },
      items: []
    };
  }
  const resultByIdentity = new Map();
  for (const result of results) {
    const identity = resultReviewIdentity(result);
    resultByIdentity.set(identity, result);
  }
  const snapshotByResult = new Map();
  for (const result of results) {
    const identity = resultReviewIdentity(result);
    const aliases = matchIdAliases(result.match_id);
    const cutoffAt = result.finished_at || result.updated_at || new Date().toISOString();
    const snapshotOutput = await runSql(`
SELECT
  ms.snapshot_id,
  ms.match_id,
  ms.captured_at,
  ms.prediction_label,
  ms.prediction_key,
  ms.prediction_probability,
  ms.prediction_confidence,
  ms.trade_label,
  ms.ai_trade_action,
  ms.ai_trade_primary,
  ms.ai_trade_summary,
  ms.completeness_mode,
  ms.completeness_score,
  NULL AS match_payload_json,
  m.home_name,
  m.away_name,
  m.kickoff_shanghai
FROM match_snapshots ms
LEFT JOIN matches m ON m.match_id = ms.match_id
WHERE ms.match_id IN (?, ?, ?)
  AND ms.captured_at <= ?
ORDER BY ms.captured_at DESC
LIMIT 1;
`, [aliases[0] || "", aliases[1] || "", aliases[2] || "", cutoffAt], "one");
    const line = snapshotOutput.trim().split("\n").filter(Boolean).pop();
    const snapshot = line ? JSON.parse(line) : null;
    if (snapshot) {
      snapshot.result_identity = identity;
      snapshotByResult.set(identity, snapshot);
    }
  }
  const snapshots = [...snapshotByResult.values()];
  reviewLog(`snapshots ${snapshots.length}`);
  if (!snapshots.length) {
    return {
      meta: {
        ok: true,
        generatedAt: new Date().toISOString(),
        source: "dashboard history backtest",
        limit: safeLimit,
        disclaimer: "复盘只比较历史预测与最终赛果，用于模型校准；不代表真实交易记录。"
      },
      totals: { matches: 0, hit: 0, miss: 0, push: 0, pending: 0 },
      items: []
    };
  }
  const targetRows = snapshots.map((snapshot) => `(${sqlString(snapshot.snapshot_id)}, ${sqlString(snapshot.prediction_key || "")}, ${sqlString(snapshot.ai_trade_primary || "")})`);
  const marketsOutput = await runSql(`
WITH target(snapshot_id, prediction_key, primary_name) AS (
  VALUES ${targetRows.join(",")}
),
ranked_markets AS (
  SELECT
    mk.recommendation_key,
    mk.market_type,
    mk.market_name,
    mk.model_probability,
    mk.push_probability,
    mk.market_price,
    mk.market_source,
    mk.edge,
    mk.max_buy_price,
    mk.decision_label,
    mk.decision_action,
    mk.elite_count,
    mk.elite_current_value,
    NULL AS rec_payload_json,
    mk.snapshot_id,
    ROW_NUMBER() OVER (
      PARTITION BY mk.snapshot_id
      ORDER BY
        CASE
          WHEN mk.recommendation_key = target.prediction_key THEN 0
          WHEN mk.market_name = target.primary_name THEN 1
          WHEN mk.edge >= 0.025 THEN 2
          ELSE 3
        END,
        mk.edge DESC
    ) AS rn
  FROM market_snapshots mk
  JOIN target ON target.snapshot_id = mk.snapshot_id
  WHERE mk.recommendation_key = target.prediction_key
     OR mk.market_name = target.primary_name
     OR mk.edge >= 0.025
)
SELECT *
FROM ranked_markets
WHERE rn <= 8
ORDER BY snapshot_id, edge DESC;
`, [], "all");
  reviewLog("markets");
  const marketsBySnapshot = new Map();
  for (const market of JSON.parse(marketsOutput.trim().split("\n").filter(Boolean).pop() || "[]")) {
    const list = marketsBySnapshot.get(market.snapshot_id) || [];
    list.push(market);
    marketsBySnapshot.set(market.snapshot_id, list);
  }
  const rows = [];
  for (const result of results) {
    const snapshot = snapshotByResult.get(resultReviewIdentity(result));
    if (!snapshot) continue;
    const markets = marketsBySnapshot.get(snapshot.snapshot_id) || [];
    for (const market of markets.length ? markets : [{}]) {
      rows.push({
        ...snapshot,
        ...result,
        result_source: result.source,
        ...market
      });
    }
  }
  const byMatch = new Map();
  for (const row of rows) {
    if (!byMatch.has(row.match_id)) {
      const matchPayload = parseSnapshotPayload(row.match_payload_json, {});
      const result = {
        homeGoals: numberOrNull(row.home_goals),
        awayGoals: numberOrNull(row.away_goals),
        resultKey: row.result_key,
        resultLabel: row.result_label,
        finishedAt: row.finished_at,
        source: row.result_source
      };
      byMatch.set(row.match_id, {
        matchId: row.match_id,
        matchName: `${row.home_name || matchPayload.homeName || "Home"} vs ${row.away_name || matchPayload.awayName || "Away"}`,
        kickoffShanghai: row.kickoff_shanghai || matchPayload.kickoffShanghai,
        capturedAt: row.captured_at,
        result,
        prediction: {
          label: row.prediction_label,
          key: row.prediction_key,
          probability: numberOrNull(row.prediction_probability),
          confidence: row.prediction_confidence,
          tradeLabel: row.trade_label
        },
        aiTradePlan: {
          action: row.ai_trade_action,
          primary: row.ai_trade_primary,
          summary: row.ai_trade_summary
        },
        completeness: {
          mode: row.completeness_mode,
          score: numberOrNull(row.completeness_score)
        },
        items: []
      });
    }
    if (!row.recommendation_key) continue;
    const matchRecord = byMatch.get(row.match_id);
    const matchPayload = parseSnapshotPayload(row.match_payload_json, {});
    const recPayload = parseSnapshotPayload(row.rec_payload_json, {});
    if (!recPayload.decisionLabel && row.decision_label) recPayload.decisionLabel = row.decision_label;
    const rec = {
      key: row.recommendation_key,
      marketType: row.market_type,
      name: row.market_name,
      modelProbability: numberOrNull(row.model_probability),
      pushProbability: numberOrNull(row.push_probability),
      marketPrice: numberOrNull(row.market_price),
      marketSource: row.market_source,
      edge: numberOrNull(row.edge),
      maxBuyPrice: numberOrNull(row.max_buy_price),
      decisionLabel: row.decision_label,
      decisionAction: row.decision_action,
      eliteCount: numberOrNull(row.elite_count),
      eliteCurrentValue: numberOrNull(row.elite_current_value),
      payload: compactReviewRecommendationPayload(recPayload)
    };
    const settled = settleRecommendationFromResult(rec, matchRecord.result);
    matchRecord.items.push({
      ...rec,
      settled,
      reasons: reviewReasonSummary(matchPayload, recPayload, settled)
    });
  }
  const reviews = [...byMatch.values()].map((record) => {
    const primary = record.items.find((item) => item.key === record.prediction.key)
      || record.items.find((item) => item.name === record.aiTradePlan.primary)
      || record.items[0]
      || null;
    const statusCounts = record.items.reduce((acc, item) => {
      acc[item.settled.status] = (acc[item.settled.status] || 0) + 1;
      return acc;
    }, {});
    return {
      ...record,
      primary,
      statusCounts,
      reviewStatus: primary?.settled?.status || "pending",
      items: record.items.slice(0, 8)
    };
  });
  const totals = reviews.reduce((acc, review) => {
    acc.matches += 1;
    acc[review.reviewStatus] = (acc[review.reviewStatus] || 0) + 1;
    return acc;
  }, { matches: 0, hit: 0, miss: 0, push: 0, pending: 0 });
  return {
    meta: {
      ok: true,
      generatedAt: new Date().toISOString(),
      source: "dashboard history backtest",
      limit: safeLimit,
      disclaimer: "复盘只比较历史预测与最终赛果，用于模型校准；不代表真实交易记录。"
    },
    totals,
    items: reviews
  };
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
      `模型概率 ${formatPercent(primary.modelProbability)}，当前价格 ${formatCents(primary.marketPrice)}，edge ${formatPercent(primary.edge)}${typeof primary.disciplinedEdge === "number" && primary.disciplinedEdge !== primary.edge ? `，复盘纪律后 ${formatPercent(primary.disciplinedEdge)}` : ""}。`,
      ...(primary.reviewDiscipline?.reasons || []),
      match.tournamentTrend?.applied ? `本届趋势修正：${match.tournamentTrend.notes.slice(0, 2).join(" ")}` : "",
      primary.holderSummary?.count ? `该盘口公开持仓 ${primary.holderSummary.count} 人，Top holder ${primary.holderSummary.topHolder || "-"}。` : "",
      primary.eliteSummary?.count ? `世界杯 Top10 命中 ${primary.eliteSummary.count} 人，当前价值约 ${Math.round(primary.eliteSummary.totalCurrentValue || 0).toLocaleString()} 美元。` : ""
    ].filter(Boolean).slice(0, 5) : ["当前没有非胜平负盘口达到价格纪律；胜平负长赔只作为激进观察，不做首选。"],
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
      "复盘纪律原因不为空时，必须降级为 watch/wait，不要写首选买入。",
      "BTTS 与小于2.5同时看好时，只能二选一；若低比分集中，应优先小球而不是 BTTS。",
      "弱队 +0.5 如果存在强队1-0风险，只能观察，不能作为首选。",
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
          disciplinedEdge: rec.disciplinedEdge,
          maxBuyPrice: rec.maxBuyPrice,
          decision: rec.decisionLabel,
          reviewDiscipline: rec.reviewDiscipline
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
    task: "为世界杯看板生成每场比赛的中文'阵容与比赛证据复核'。只能基于给定的身高、GK/DF/MF/FW 综合分、俱乐部分层、近期比赛证据和已有限制说明，不要编造身价、扑救率、伤停或首发。",
    output: "返回 JSON：{reads:[{matchId,title,summary,notes:[...],limits:[...]}]}",
    rules: [
      "不要写下注、买入、赚钱、梭哈等交易动作。",
      "不要使用 proxy 这个词；说综合分、阵容层级、近期比赛证据即可。",
      "summary 用一两句话说明这场从身体、门将、后防、中场、锋线和真实战绩角度最值得复核什么。",
      "notes 给 2-4 条具体观察，例如连续零封、场均失球、对强队失球、连续进球、高空球、定位球、中场控制。",
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
      title: "阵容与比赛证据复核",
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

function finalResultFromScores(homeGoals, awayGoals, homeName, awayName) {
  const resultKey = homeGoals > awayGoals ? "home" : homeGoals === awayGoals ? "draw" : "away";
  const winner = resultKey === "home" ? homeName : resultKey === "away" ? awayName : "平局";
  return {
    resultKey,
    resultLabel: resultKey === "draw" ? "平局" : `${winner}胜`
  };
}

function modeledMatchIdForScheduleEvent(event, modeledMatches = []) {
  const eventKey = scheduleEventKey(event);
  const match = (modeledMatches || []).find((item) => {
    const key = matchScheduleKey(TEAM_SEARCH_NAMES[item.home] || item.homeName, TEAM_SEARCH_NAMES[item.away] || item.awayName);
    return key === eventKey;
  });
  return match?.id || "";
}

async function syncFinalResultsFromSchedule(schedule, modeledMatches = [], existingResults = new Map()) {
  const completed = (schedule.matches || [])
    .filter((event) => event.completed || isFinishedStatus(event.status))
    .filter((event) => Number.isFinite(Number(event.homeScore)) && Number.isFinite(Number(event.awayScore)));
  if (!completed.length) return { written: 0 };
  let written = 0;
  for (const event of completed) {
    const homeGoals = Number(event.homeScore);
    const awayGoals = Number(event.awayScore);
    const { resultKey, resultLabel } = finalResultFromScores(homeGoals, awayGoals, event.home?.name || "主队", event.away?.name || "客队");
    const modeledId = modeledMatchIdForScheduleEvent(event, modeledMatches);
    const matchId = modeledId || (event.scheduleId ? `schedule-${event.scheduleId}` : "");
    if (matchId) {
      if (matchIdAliases(matchId).some((alias) => existingResults.has(alias))) continue;
      const finishedAt = new Date().toISOString();
      await recordMatchResult({
        matchId,
        homeGoals,
        awayGoals,
        resultKey,
        resultLabel,
        status: "final",
        finishedAt,
        source: event.source || "ESPN FIFA World Cup scoreboard",
        scheduleId: event.scheduleId,
        kickoffUtc: event.kickoffUtc,
        homeName: event.home?.name,
        awayName: event.away?.name,
        statusDetail: event.statusDetail
      });
      existingResults.set(matchId, {
        match_id: matchId,
        home_goals: homeGoals,
        away_goals: awayGoals,
        result_key: resultKey,
        result_label: resultLabel,
        status: "final",
        finished_at: finishedAt
      });
      written += 1;
    }
  }
  return { written };
}

function canonicalMatchId(matchId) {
  return String(matchId || "").replace(/^schedule-/, "");
}

function matchIdAliases(matchId) {
  const raw = String(matchId || "");
  const canonical = canonicalMatchId(raw);
  return [...new Set([raw, canonical, canonical ? `schedule-${canonical}` : ""].filter(Boolean))];
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

function scheduleAutoBaselineFromEvent(event, modeledKeys, finalResults, polymarket, context, fifaRankings, worldCupRecords, squadProfiles, h2hOverrides, tournamentTrend, nowMs = Date.now()) {
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
    scheduleId: event.scheduleId || "",
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
  baseMatch.humanMatchup = buildHumanMatchup(baseMatch, fifaRankings);
  baseMatch.dynamicModel = applyDynamicAdjustments(baseMatch);
  baseMatch.probabilities = scoreModel(baseMatch.dynamicModel.adjusted.lambdaHome, baseMatch.dynamicModel.adjusted.lambdaAway);
  applyTournamentTrendToMatch(baseMatch, tournamentTrend, fifaRankings);
  baseMatch.manualMarkets = autoBaselineManualMarkets(baseMatch, baseMatch.probabilities);
  baseMatch.recommendations = [];
  baseMatch.completeness = buildCompleteness(baseMatch, polymarket);
  baseMatch.tradingGate = buildTradingGate(baseMatch.completeness);
  baseMatch.recommendations = buildRecommendations(baseMatch, baseMatch.probabilities);
  return baseMatch;
}

function filterAndAugmentMatches(matches, schedule, finalResults, polymarket, context, fifaRankings, worldCupRecords, squadProfiles, h2hOverrides, tournamentTrend) {
  const nowMs = Date.now();
  const scheduleByKey = new Map((schedule.matches || []).map((event) => [scheduleEventKey(event), event]));
  const visibleModeled = matches.filter((match) => isVisibleModeledMatch(match, scheduleByKey, finalResults, nowMs));
  for (const match of visibleModeled) {
    const scheduleEvent = scheduleByKey.get(matchScheduleKey(TEAM_SEARCH_NAMES[match.home] || match.homeName, TEAM_SEARCH_NAMES[match.away] || match.awayName));
    attachScheduleEventToMatch(match, scheduleEvent);
  }
  const modeledKeys = new Set(visibleModeled.map((match) => matchScheduleKey(TEAM_SEARCH_NAMES[match.home] || match.homeName, TEAM_SEARCH_NAMES[match.away] || match.awayName)));
  const autoBaseline = (schedule.matches || [])
    .map((event) => scheduleAutoBaselineFromEvent(event, modeledKeys, finalResults, polymarket, context, fifaRankings, worldCupRecords, squadProfiles, h2hOverrides, tournamentTrend, nowMs))
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

function attachScheduleEventToMatch(match, scheduleEvent) {
  if (!match || !scheduleEvent) return match;
  match.scheduleId = scheduleEvent.scheduleId || match.scheduleId || "";
  match.scheduleStatus = scheduleEvent.status || match.scheduleStatus || "";
  match.scheduleStatusDetail = scheduleEvent.statusDetail || match.scheduleStatusDetail || "";
  match.scheduleSource = scheduleEvent.source || match.scheduleSource || "";
  if (Number.isFinite(Number(scheduleEvent.homeScore))) match.scheduleHomeScore = Number(scheduleEvent.homeScore);
  if (Number.isFinite(Number(scheduleEvent.awayScore))) match.scheduleAwayScore = Number(scheduleEvent.awayScore);
  match.venueInfo = match.venueInfo || scheduleEvent.venue || {};
  return match;
}

function normalizeMatch(match, teams, context, polymarket, worldCupRecords, squadProfiles, fifaRankings = {}, tournamentTrend = null) {
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
    homeEnglishName: TEAM_SEARCH_NAMES[match.home] || homeTeam.englishName || homeTeam.name,
    awayEnglishName: TEAM_SEARCH_NAMES[match.away] || awayTeam.englishName || awayTeam.name,
    homeTeam,
    awayTeam,
    headToHead: matchContext.headToHead || mergedMatch.headToHead,
    recentFormRecords: matchContext.recentFormRecords || mergedMatch.recentFormRecords,
    probabilities,
    dynamicModel
  };
  enriched.humanMatchup = buildHumanMatchup(enriched, fifaRankings);
  applyTournamentTrendToMatch(enriched, tournamentTrend, fifaRankings);
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
    match.marketCatalog = buildMatchMarketCatalog(match, polymarket);
    for (const recommendation of match.recommendations) {
      const token = findChartToken(match, recommendation, tokenCatalog);
      if (token) {
        recommendation.chart = {
          source: "Polymarket",
          marketId: token.marketId,
          conditionId: token.conditionId,
          tokenId: token.tokenId,
          marketQuestion: token.marketQuestion,
          marketSlug: token.marketSlug,
          eventSlug: token.eventSlug,
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
      applyReviewDiscipline(recommendation, match);
    }
  }
}

function marketCatalogCategory(market) {
  const type = String(market?.sportsMarketType || "").toLowerCase();
  const text = `${market?.question || ""} ${market?.slug || ""}`.toLowerCase();
  if (/correct[-_\s]?score|exact[-_\s]?score|scorecast|比分|球胆/.test(text) || type.includes("correct_score")) {
    return { key: "correctScore", label: "球胆 / 正确比分", labelEn: "Correct Score" };
  }
  if (type.includes("first_half") || type.includes("second_half") || /\b1st half\b|\b2nd half\b|first-half|second-half|halftime|half-time/.test(text)) {
    return { key: "halves", label: "半场 / 上下半场", labelEn: "Halves" };
  }
  if (type.includes("team_total") || text.includes("team-total")) {
    return { key: "teamTotals", label: "球队进球数", labelEn: "Team Totals" };
  }
  if (type.includes("both_teams_to_score") || text.includes("btts") || text.includes("both teams to score")) {
    return { key: "btts", label: "双方进球", labelEn: "BTTS" };
  }
  if (type.includes("spread") || text.includes("spread-") || text.includes("spread:")) {
    return { key: "spreads", label: "让球 / 分差", labelEn: "Spreads" };
  }
  if (type.includes("total") || text.includes("-total-") || text.includes("o/u")) {
    return { key: "totals", label: "总进球", labelEn: "Totals" };
  }
  if (type.includes("moneyline") || /\bwin\b/.test(text) || text.includes("end in a draw")) {
    return { key: "moneyline", label: "胜平负", labelEn: "Result" };
  }
  return { key: "other", label: "其他盘口", labelEn: "Other" };
}

function marketCatalogSortScore(item) {
  const order = {
    moneyline: 0,
    spreads: 1,
    totals: 2,
    teamTotals: 3,
    btts: 4,
    halves: 5,
    correctScore: 6,
    other: 7
  };
  return (order[item.category] ?? 9) * 1000000000 - Number(item.volume || 0);
}

function buildMatchMarketCatalog(match, polymarket) {
  const markets = Array.isArray(polymarket?.markets) ? polymarket.markets : [];
  const homeAliases = teamNameVariants(match.home, match.homeName);
  const awayAliases = teamNameVariants(match.away, match.awayName);
  const expectedCategories = [
    { key: "correctScore", label: "球胆 / 正确比分", labelEn: "Correct Score" },
    { key: "halves", label: "半场 / 上下半场", labelEn: "Halves" },
    { key: "teamTotals", label: "球队进球数", labelEn: "Team Totals" },
    { key: "totals", label: "总进球", labelEn: "Totals" },
    { key: "spreads", label: "让球 / 分差", labelEn: "Spreads" },
    { key: "btts", label: "双方进球", labelEn: "BTTS" },
    { key: "moneyline", label: "胜平负", labelEn: "Result" },
    { key: "other", label: "其他盘口", labelEn: "Other" }
  ];
  const items = markets
    .filter((market) => {
      const text = `${market.question || ""} ${market.slug || ""} ${market.eventTitle || ""} ${market.eventSlug || ""}`.toLowerCase();
      return homeAliases.some((alias) => textContainsAlias(text, String(alias || "").toLowerCase().trim()))
        && awayAliases.some((alias) => textContainsAlias(text, String(alias || "").toLowerCase().trim()));
    })
    .map((market) => {
      const category = marketCatalogCategory(market);
      const outcomes = (market.tokens || []).map((token) => ({
        label: token.label || "",
        price: token.currentPrice,
        tokenId: token.tokenId || "",
        historyPoints: Array.isArray(token.history) ? token.history.length : 0
      }));
      return {
        marketId: market.id || "",
        conditionId: market.conditionId || "",
        question: market.question || "",
        slug: market.slug || "",
        eventSlug: market.eventSlug || "",
        sportsMarketType: market.sportsMarketType || "",
        category: category.key,
        categoryLabel: category.label,
        categoryLabelEn: category.labelEn,
        volume: Number(market.volume || 0),
        liquidity: Number(market.liquidity || 0),
        outcomes,
        hasHistory: outcomes.some((outcome) => outcome.historyPoints >= 2),
        source: "Polymarket"
      };
    })
    .sort((a, b) => marketCatalogSortScore(a) - marketCatalogSortScore(b));
  const byCategory = {};
  for (const item of items) {
    if (!byCategory[item.category]) {
      byCategory[item.category] = {
        key: item.category,
        label: item.categoryLabel,
        labelEn: item.categoryLabelEn,
        count: 0,
        markets: []
      };
    }
    byCategory[item.category].count += 1;
    byCategory[item.category].markets.push(item);
  }
  const categories = expectedCategories.map((expected) => {
    const group = byCategory[expected.key] || {
      key: expected.key,
      label: expected.label,
      labelEn: expected.labelEn,
      count: 0,
      markets: []
    };
    return {
      ...group,
      missing: !group.markets.length,
      markets: (group.markets || []).slice(0, 24)
    };
  }).filter((group) => group.key !== "other" || group.markets.length);
  return {
    source: polymarket?.source || "Polymarket 实时市场 API",
    ok: Boolean(polymarket?.ok),
    updatedAt: new Date().toISOString(),
    marketCount: items.length,
    categories
  };
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
      || homeAliases.some((alias) => textContainsAlias(text, alias))
      || awayAliases.some((alias) => textContainsAlias(text, alias))
      || aliases.some((alias) => alias && textContainsAlias(text, alias));
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
    return sameMatchTokens.find((token) => !isSpreadOrTotalToken(token) && aliasesMatchText(teamAliases, token.labelText))
      || sameMatchTokens.find((token) => {
        const text = `${token.marketQuestionText} ${token.labelText}`;
        return !isSpreadOrTotalToken(token) && teamAliases.some((team) => textContainsAlias(token.marketQuestionText, team)) && token.marketQuestionText.includes("win") && token.labelText.includes("yes");
      }) || null;
  }

  if (recommendation.marketType === "total") {
    const needle = recommendation.key === "under25" ? "under" : "over";
    return sameMatchTokens.find((token) => token.labelText.includes(needle))
      || sameMatchTokens.find((token) => `${token.marketText} ${token.labelText}`.includes(needle)) || null;
  }

  if (recommendation.marketType === "btts") {
    const outcomeNeedle = recommendation.key === "bttsYes" ? "yes" : "no";
    return sameMatchTokens.find((token) => {
      const text = `${token.marketQuestionText} ${token.marketSlug} ${token.labelText}`;
      const isBttsMarket = text.includes("both teams")
        || text.includes("both-teams")
        || text.includes("btts")
        || (text.includes("to score") && text.includes("score"));
      return isBttsMarket && token.labelText.includes(outcomeNeedle);
    }) || sameMatchTokens.find((token) => {
      const text = `${token.marketText} ${token.labelText}`;
      return text.includes("both teams to score") && token.labelText.includes(outcomeNeedle);
    }) || null;
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
    return textContainsAlias(normalizedText, normalizedAlias);
  });
}

function textContainsAlias(normalizedText, normalizedAlias) {
  if (!normalizedText || !normalizedAlias) return false;
  if (normalizedText === normalizedAlias) return true;
  if (normalizedAlias.length <= 3) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedAlias)}([^a-z0-9]|$)`, "i").test(normalizedText);
  }
  return normalizedText.includes(normalizedAlias);
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
  return homeAliases.some((alias) => textContainsAlias(text, String(alias || "").toLowerCase().trim()))
    && awayAliases.some((alias) => textContainsAlias(text, String(alias || "").toLowerCase().trim()));
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
    POR: ["portugal", "prt"],
    COD: ["congo dr", "dr congo", "congo", "drc", "cdr", "democratic republic of congo", "democratic republic congo", "刚果（金）", "刚果金"]
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

function lineStrengthScore(group, weights = {}) {
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

function matchupInsight({ key, label, labelEn, side, valueText, valueTextEn, zh, en, evidence = [], evidenceEn = [], confidence = "medium" }) {
  return { key, label, labelEn, side, valueText, valueTextEn, zh, en, evidence, evidenceEn, confidence };
}

function recentRecordForSide(match, side) {
  const records = match.recentFormRecords || match.context?.recentFormRecords || {};
  return records?.[side] || null;
}

function sideNameForResult(match, side) {
  return side === "home" ? match.homeName : match.awayName;
}

function opponentRankFromName(name) {
  const normalized = String(name || "").toLowerCase();
  for (const [code, english] of Object.entries(TEAM_SEARCH_NAMES)) {
    const zh = TEAM_DISPLAY_NAMES_ZH[code] || "";
    if (
      normalized === String(english).toLowerCase()
      || normalized === String(zh).toLowerCase()
      || normalized.includes(String(english).toLowerCase())
      || normalized.includes(String(zh).toLowerCase())
    ) {
      return code;
    }
  }
  return "";
}

function formEvidence(match, side, fifaRankings = {}) {
  const record = recentRecordForSide(match, side);
  const games = Array.isArray(record?.matches) ? record.matches.filter((item) => item && item.score) : [];
  if (!games.length) {
    return {
      ok: false,
      team: sideNameForResult(match, side),
      summary: "最近战绩样本未同步，无法提供连续零封/失球证据。",
      summaryEn: "Recent-results sample is unavailable, so clean-sheet and conceded-goal evidence is not available.",
      defensive: "最近战绩样本未同步。",
      defensiveEn: "Recent-results sample is unavailable.",
      attacking: "最近战绩样本未同步。",
      attackingEn: "Recent-results sample is unavailable.",
      strongOpponent: "对强队表现待补充。",
      strongOpponentEn: "Performance against strong opponents is pending."
    };
  }

  let cleanSheets = 0;
  let failedToScore = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  let scoredStreak = 0;
  let concededStreak = 0;
  const strongGames = [];

  games.forEach((game, index) => {
    const [gfRaw, gaRaw] = String(game.score || "").split("-").map((value) => Number(value.trim()));
    if (!Number.isFinite(gfRaw) || !Number.isFinite(gaRaw)) return;
    goalsFor += gfRaw;
    goalsAgainst += gaRaw;
    if (gaRaw === 0) cleanSheets += 1;
    if (gfRaw === 0) failedToScore += 1;
    if (index === scoredStreak && gfRaw > 0) scoredStreak += 1;
    if (index === concededStreak && gaRaw > 0) concededStreak += 1;
    const opponentCode = opponentRankFromName(game.opponent);
    const rank = rankingForTeam(opponentCode, fifaRankings).rank;
    if (rank && rank <= 30) {
      strongGames.push({
        opponent: game.opponent,
        rank,
        score: game.score,
        goalsAgainst: gaRaw,
        goalsFor: gfRaw,
        date: game.date
      });
    }
  });

  const count = games.length;
  const gaAvg = count ? roundTo(goalsAgainst / count, 2) : null;
  const gfAvg = count ? roundTo(goalsFor / count, 2) : null;
  const lowConcedeStrong = strongGames.filter((game) => game.goalsAgainst <= 1).length;
  const strongText = strongGames.length
    ? `对 FIFA 前30或同级可识别强队 ${strongGames.length} 场，其中 ${lowConcedeStrong} 场失球≤1。`
    : "最近样本中未识别到 FIFA 前30强队对手。";
  const strongTextEn = strongGames.length
    ? `${strongGames.length} recent game(s) against identifiable top-30-level opponents; ${lowConcedeStrong} allowed one goal or fewer.`
    : "No identifiable top-30 opponent appears in the recent sample.";

  const summaryCore = `近 ${count} 场 ${goalsFor}-${goalsAgainst}，场均进 ${gfAvg} / 失 ${gaAvg}，零封 ${cleanSheets} 场，被零封 ${failedToScore} 场`;
  const summaryCoreEn = `last ${count}: goals ${goalsFor}-${goalsAgainst}, ${gfAvg} scored and ${gaAvg} conceded per game, ${cleanSheets} clean sheet(s), ${failedToScore} scoreless game(s)`;
  return {
    ok: true,
    team: sideNameForResult(match, side),
    matches: count,
    cleanSheets,
    failedToScore,
    goalsFor,
    goalsAgainst,
    gfAvg,
    gaAvg,
    scoredStreak,
    concededStreak,
    strongGames,
    summaryCore,
    summaryCoreEn,
    summary: `${summaryCore}。`,
    summaryEn: `${summaryCoreEn}.`,
    defensive: `近 ${count} 场零封 ${cleanSheets} 场，场均失 ${gaAvg} 球${concededStreak ? `，最近连续 ${concededStreak} 场有失球` : ""}。${strongText}`,
    defensiveEn: `Last ${count}: ${cleanSheets} clean sheet(s), ${gaAvg} conceded per game${concededStreak ? `, conceded in ${concededStreak} straight` : ""}. ${strongTextEn}`,
    attacking: `近 ${count} 场场均进 ${gfAvg} 球，连续 ${scoredStreak} 场有进球，被零封 ${failedToScore} 场。`,
    attackingEn: `Last ${count}: ${gfAvg} scored per game, scored in ${scoredStreak} straight, ${failedToScore} scoreless game(s).`,
    strongOpponent: strongText,
    strongOpponentEn: strongTextEn
  };
}

function evidenceForSide(homeEvidence, awayEvidence, side, kind) {
  const selected = side === "away" ? awayEvidence : homeEvidence;
  const other = side === "away" ? homeEvidence : awayEvidence;
  if (kind === "attack") return [selected.attacking, other.defensive].filter(Boolean);
  if (kind === "defence" || kind === "goalkeeper") return [selected.defensive, other.attacking].filter(Boolean);
  if (kind === "midfield") return [selected.summary, selected.strongOpponent].filter(Boolean);
  return [selected.summary, other.summary].filter(Boolean);
}

function buildHumanMatchup(match, fifaRankings = {}) {
  const homeProfile = match.homeTeam?.squadProfile;
  const awayProfile = match.awayTeam?.squadProfile;
  if (!homeProfile?.ok || !awayProfile?.ok) {
    return {
      ok: false,
      status: "missing",
      updatedAt: new Date().toISOString(),
      source: homeProfile?.source || awayProfile?.source || "World Cup 2026 Team Stats",
      sourceUrl: homeProfile?.sourceUrl || awayProfile?.sourceUrl || "",
      summary: "阵容身高/分线数据缺失，暂不做身体和分线对位判断。",
      summaryEn: "Squad physical and line-profile data is missing; no matchup read is generated.",
      insights: [],
      limits: ["身价、扑救率、球员评分未接入；当前只使用公开阵容数据和近期比赛证据。"]
    };
  }

  const h = homeProfile.groups || {};
  const a = awayProfile.groups || {};
  const homeEvidence = formEvidence(match, "home", fifaRankings);
  const awayEvidence = formEvidence(match, "away", fifaRankings);
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
        : `${sideName} are about ${overallHeight.diff}cm taller on average; set pieces, second balls and aerial defending matter more.`,
      evidence: [homeEvidence.summary, awayEvidence.summary].filter(Boolean),
      evidenceEn: [homeEvidence.summaryEn, awayEvidence.summaryEn].filter(Boolean)
    }));
  }

  const gkScoreHome = lineStrengthScore(h.GK, { height: 0.35, caps: 0.3, tier: 0.35 });
  const gkScoreAway = lineStrengthScore(a.GK, { height: 0.35, caps: 0.3, tier: 0.35 });
  const gkAdv = lineupAdvantage(gkScoreHome, gkScoreAway, 8);
  insights.push(matchupInsight({
    key: "goalkeeper-analysis",
    label: "门将分析",
    labelEn: "Goalkeeper read",
    side: gkAdv.side,
    valueText: `${gkScoreHome ?? "-"} vs ${gkScoreAway ?? "-"}`,
    valueTextEn: `${gkScoreHome ?? "-"} vs ${gkScoreAway ?? "-"}`,
    zh: gkAdv.side === "even"
      ? "门将组综合分接近；需要结合近期零封和失球证据再判断。"
      : `${advantageTeamName(match, gkAdv.side)} 门将组在身高、国家队经验和俱乐部层级上更占优。`,
    en: gkAdv.side === "even"
      ? "Goalkeeper read is close; use clean-sheet and conceded-goal evidence before leaning either way."
      : `${advantageTeamName(match, gkAdv.side)} rate stronger by goalkeeper height, international experience and club level.`,
    evidence: evidenceForSide(homeEvidence, awayEvidence, gkAdv.side === "away" ? "away" : "home", "goalkeeper"),
    evidenceEn: evidenceForSide(homeEvidence, awayEvidence, gkAdv.side === "away" ? "away" : "home", "goalkeeper").map((_, index) => (gkAdv.side === "away" ? [awayEvidence.defensiveEn, homeEvidence.attackingEn] : [homeEvidence.defensiveEn, awayEvidence.attackingEn])[index]).filter(Boolean)
  }));

  const dfScoreHome = lineStrengthScore(h.DF, { height: 0.25, caps: 0.25, tier: 0.5 });
  const dfScoreAway = lineStrengthScore(a.DF, { height: 0.25, caps: 0.25, tier: 0.5 });
  const dfAdv = lineupAdvantage(dfScoreHome, dfScoreAway, 10);
  insights.push(matchupInsight({
    key: "defence-analysis",
    label: "后防分析",
    labelEn: "Defensive read",
    side: dfAdv.side,
    valueText: `${dfScoreHome ?? "-"} vs ${dfScoreAway ?? "-"}`,
    valueTextEn: `${dfScoreHome ?? "-"} vs ${dfScoreAway ?? "-"}`,
    zh: dfAdv.side === "even"
      ? "后防线综合分接近，更多要看临场站位、速度和个人失误。"
      : `${advantageTeamName(match, dfAdv.side)} 后防线俱乐部层级、经验和身高更强，理论上更能承受持续压迫。`,
    en: dfAdv.side === "even"
      ? "Defensive read is close; live shape, pace and errors matter more."
      : `${advantageTeamName(match, dfAdv.side)} rate stronger on defensive club level, experience and height.`,
    evidence: evidenceForSide(homeEvidence, awayEvidence, dfAdv.side === "away" ? "away" : "home", "defence"),
    evidenceEn: (dfAdv.side === "away" ? [awayEvidence.defensiveEn, homeEvidence.attackingEn] : [homeEvidence.defensiveEn, awayEvidence.attackingEn]).filter(Boolean)
  }));

  const mfScoreHome = lineStrengthScore(h.MF, { height: 0.12, caps: 0.28, tier: 0.6 });
  const mfScoreAway = lineStrengthScore(a.MF, { height: 0.12, caps: 0.28, tier: 0.6 });
  const mfAdv = lineupAdvantage(mfScoreHome, mfScoreAway, 10);
  insights.push(matchupInsight({
    key: "midfield-analysis",
    label: "中场分析",
    labelEn: "Midfield read",
    side: mfAdv.side,
    valueText: `${mfScoreHome ?? "-"} vs ${mfScoreAway ?? "-"}`,
    valueTextEn: `${mfScoreHome ?? "-"} vs ${mfScoreAway ?? "-"}`,
    zh: mfAdv.side === "even"
      ? "中场综合分接近；控球和推进优势需要结合首发与临场压迫强度再判断。"
      : `${advantageTeamName(match, mfAdv.side)} 中场俱乐部层级和国家队经验更强，控球、推进和反抢稳定性可能更好。`,
    en: mfAdv.side === "even"
      ? "Midfield read is close; possession and progression should be checked after lineups."
      : `${advantageTeamName(match, mfAdv.side)} have stronger midfield club level and international experience.`,
    evidence: evidenceForSide(homeEvidence, awayEvidence, mfAdv.side === "away" ? "away" : "home", "midfield"),
    evidenceEn: (mfAdv.side === "away" ? [awayEvidence.summaryEn, awayEvidence.strongOpponentEn] : [homeEvidence.summaryEn, homeEvidence.strongOpponentEn]).filter(Boolean)
  }));

  const fwScoreHome = lineStrengthScore(h.FW, { height: 0.15, caps: 0.25, tier: 0.6 });
  const fwScoreAway = lineStrengthScore(a.FW, { height: 0.15, caps: 0.25, tier: 0.6 });
  const fwAdv = lineupAdvantage(fwScoreHome, fwScoreAway, 10);
  insights.push(matchupInsight({
    key: "attack-analysis",
    label: "锋线分析",
    labelEn: "Attack read",
    side: fwAdv.side,
    valueText: `${fwScoreHome ?? "-"} vs ${fwScoreAway ?? "-"}`,
    valueTextEn: `${fwScoreHome ?? "-"} vs ${fwScoreAway ?? "-"}`,
    zh: fwAdv.side === "even"
      ? "锋线综合分接近；大小球要更多看节奏、双方防线和临场阵型。"
      : `${advantageTeamName(match, fwAdv.side)} 锋线俱乐部层级和经验更强，转化机会的理论质量更好。`,
    en: fwAdv.side === "even"
      ? "Attack read is close; totals need pace, defensive line and lineup context."
      : `${advantageTeamName(match, fwAdv.side)} have stronger attacking club level and experience.`,
    evidence: evidenceForSide(homeEvidence, awayEvidence, fwAdv.side === "away" ? "away" : "home", "attack"),
    evidenceEn: (fwAdv.side === "away" ? [awayEvidence.attackingEn, homeEvidence.defensiveEn] : [homeEvidence.attackingEn, awayEvidence.defensiveEn]).filter(Boolean)
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
      ? "高水平俱乐部球员占比接近；阵容层级没有拉开明显差距。"
      : `${advantageTeamName(match, tierAdv.side)} Tier 1/2 俱乐部球员占比更高，阵容层级更厚。`,
    en: tierAdv.side === "even"
      ? "Top club-tier share is close; squad level does not separate the teams much."
      : `${advantageTeamName(match, tierAdv.side)} have a higher Tier 1/2 club share and better squad depth.`,
    evidence: [homeEvidence.summary, awayEvidence.summary].filter(Boolean),
    evidenceEn: [homeEvidence.summaryEn, awayEvidence.summaryEn].filter(Boolean)
  }));

  const summaryInsights = insights
    .filter((item) => item.side && item.side !== "even" && item.side !== "none")
    .slice(0, 3)
    .map((item) => `${item.label}偏${advantageTeamName(match, item.side)}`);
  const homeSummaryText = homeEvidence.ok ? `${homeEvidence.team}：${homeEvidence.summaryCore}` : `${homeEvidence.team}：最近战绩待补`;
  const awaySummaryText = awayEvidence.ok ? `${awayEvidence.team}：${awayEvidence.summaryCore}` : `${awayEvidence.team}：最近战绩待补`;
  const summary = summaryInsights.length
    ? `分析重点：${summaryInsights.join("，")}。真实比赛证据：${homeSummaryText}；${awaySummaryText}。`
    : `分析重点：身体、门将、后防、中场、锋线没有明显单边碾压，临场阵容和节奏更关键。真实比赛证据：${homeSummaryText}；${awaySummaryText}。`;
  const summaryEn = summaryInsights.length
    ? `Human-check focus: ${summaryInsights.map((text) => text.replace("偏", " leans ")).join(", ")}. Match evidence: ${homeEvidence.team} ${homeEvidence.summaryEn}; ${awayEvidence.team} ${awayEvidence.summaryEn}.`
    : `Human-check focus: physical, GK, defensive, midfield and attacking reads do not show a clear one-sided gap; lineups and tempo matter more. Evidence: ${homeEvidence.summaryEn}; ${awayEvidence.summaryEn}.`;

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
    formEvidence: {
      home: homeEvidence,
      away: awayEvidence
    },
    limits: [
      "身价字段当前未接入可靠可抓取源；先用 Tier 1/2 俱乐部占比描述阵容层级。",
      "门将分析使用身高、国家队出场、俱乐部层级和近期失球/零封证据；不等同于扑救率。",
      "这些静态分析不会自动覆盖首发、伤停、天气和盘口曲线。"
    ],
    limitsEn: [
      "Market value is not connected to a reliably fetchable source yet; Tier 1/2 club share describes squad level.",
      "Goalkeeper read uses height, international caps, club level and recent conceded/clean-sheet evidence; it is not save percentage.",
      "These static reads do not override lineups, injuries, weather or market curves."
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
  const diff = clamp((homeRating - awayRating) / 20, -1.35, 1.35);
  return {
    lambdaHome: roundTo(clamp(1.2 + diff * 0.88, 0.35, 2.6), 2),
    lambdaAway: roundTo(clamp(1.02 - diff * 0.52, 0.3, 2.35), 2)
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

function impliedBttsFromModel(probabilities, margin = 0.04) {
  const yes = probabilities.btts || 0;
  return {
    yes: roundTo(clamp(yes * (1 - margin), 0.01, 0.98), 2),
    no: roundTo(clamp((1 - yes) * (1 - margin), 0.01, 0.98), 2)
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
  const btts = impliedBttsFromModel(probabilities);
  const homeLine = probabilities.home >= 0.57 ? -1.5 : probabilities.home <= 0.25 ? 1.5 : -0.5;
  const handicapPrices = impliedHandicapFromModel(probabilities, homeLine);
  const nowIso = new Date().toISOString();
  return {
    moneyline,
    totals,
    btts,
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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function timedFetchJsonWithRetry(url, options = {}, attempts = 2) {
  let lastResult = null;
  const totalAttempts = Math.max(1, attempts);
  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    const result = await timedFetchJson(url, options);
    if (result.ok) return { ...result, attempts: attempt };
    lastResult = result;
    if (attempt < totalAttempts) await wait(250 * attempt);
  }
  return {
    ...(lastResult || { ok: false, error: "unknown fetch failure" }),
    attempts: totalAttempts
  };
}

async function timedFetchText(url, options = {}) {
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
        "accept": "text/html,application/xhtml+xml,application/json,text/plain,*/*",
        "user-agent": "Mozilla/5.0 worldcup-polymarket-dashboard/0.1",
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
      const homeNeedle = teamNeedleGroup(event, "home");
      const awayNeedle = teamNeedleGroup(event, "away");
      return {
        label: `${homeName} vs ${awayName}`,
        q: `${homeName} ${awayName}`,
        teamNeedles: [homeNeedle, awayNeedle]
      };
    })
    .filter((search) => search.teamNeedles.every((needle) => needle.length));
  const combined = [...WORLDCUP_MARKET_SEARCHES, ...scheduleSearches];
  const seen = new Set();
  return combined.filter((search) => {
    const key = `${search.q}:${(search.teamNeedles || []).join("|")}:${search.worldCupOnly ? "worldcup" : ""}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function bettingExpertTeamSlug(value, teamCode = "") {
  const code = String(teamCode || "").toUpperCase();
  const overrides = {
    USA: "usa",
    KOR: "south-korea",
    TUR: "turkey",
    BIH: "bosnia-and-herzegovina",
    CIV: "ivory-coast",
    CPV: "cape-verde",
    CUW: "curacao",
    COD: "dr-congo",
    KSA: "saudi-arabia",
    NZL: "new-zealand",
    RSA: "south-africa"
  };
  const base = overrides[code] || value || TEAM_SEARCH_NAMES[code] || code;
  return String(base || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function bettingExpertMatchUrls(match) {
  const homeSlug = bettingExpertTeamSlug(match.homeEnglishName || match.homeName, match.home);
  const awaySlug = bettingExpertTeamSlug(match.awayEnglishName || match.awayName, match.away);
  if (!homeSlug || !awaySlug) return [];
  return [
    `${BETTINGEXPERT_BASE}/football/${homeSlug}-vs-${awaySlug}`,
    `${BETTINGEXPERT_BASE}/football/${awaySlug}-vs-${homeSlug}`
  ];
}

function decodeBettingExpertHtmlText(value) {
  return String(value || "")
    .replace(/\\u0026/g, "&")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, "\"")
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, "-")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function jsonStringValue(raw) {
  const value = String(raw || "");
  try {
    return JSON.parse(`"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`);
  } catch {
    return decodeBettingExpertHtmlText(value);
  }
}

function extractObjectAfter(text, startIndex) {
  const open = text.indexOf("{", startIndex);
  if (open < 0) return "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(open, index + 1);
    }
  }
  return "";
}

function parseBettingExpertTipObject(rawObject) {
  const tipId = rawObject.match(/"tipId":(\d+)/)?.[1] || "";
  const guid = rawObject.match(/"guid":"([^"]+)"/)?.[1] || "";
  const oneliner = jsonStringValue(rawObject.match(/"oneliner":"((?:\\.|[^"\\])*)"/)?.[1] || "");
  const descriptionRef = rawObject.match(/"description":"((?:\\.|[^"\\])*)"/)?.[1] || "";
  const createdDate = rawObject.match(/"created":\{"date":"([^"]+)"/)?.[1] || "";
  const timeAgo = jsonStringValue(rawObject.match(/"timeAgo":"((?:\\.|[^"\\])*)"/)?.[1] || "");
  const tournamentName = jsonStringValue(rawObject.match(/"template":\{"id":\d+,"name":"((?:\\.|[^"\\])*)"/)?.[1] || "");
  const stageName = jsonStringValue(rawObject.match(/"stage":\{"id":\d+,"name":"((?:\\.|[^"\\])*)"/)?.[1] || "");
  const matchTitle = jsonStringValue(rawObject.match(/"match":\{"title":"((?:\\.|[^"\\])*)"/)?.[1] || "");
  const betRaw = extractObjectAfter(rawObject, rawObject.indexOf('"bet":'));
  const userRaw = extractObjectAfter(rawObject, rawObject.indexOf('"user":'));
  if (!tipId || !oneliner || !userRaw) return null;

  const username = jsonStringValue(userRaw.match(/"username":"((?:\\.|[^"\\])*)"/)?.[1] || "");
  const userName = jsonStringValue(userRaw.match(/"name":"((?:\\.|[^"\\])*)"/)?.[1] || "") || username;
  const userGuid = userRaw.match(/"guid":"([^"]+)"/)?.[1] || "";
  const rating = numberOrNull(userRaw.match(/"rating":(-?\d+(?:\.\d+)?)/)?.[1]);
  const yieldValue = numberOrNull(userRaw.match(/"yield":(-?\d+(?:\.\d+)?)/)?.[1]);
  const profit = numberOrNull(userRaw.match(/"profit":(-?\d+(?:\.\d+)?)/)?.[1]);
  const stake = numberOrNull(betRaw.match(/"stake":(-?\d+(?:\.\d+)?)/)?.[1]);
  const odds = numberOrNull(betRaw.match(/"odds":(-?\d+(?:\.\d+)?)/)?.[1]);
  const handicap = numberOrNull(betRaw.match(/"handicap":(-?\d+(?:\.\d+)?)/)?.[1]);
  const outcomeId = betRaw.match(/"outcomeId":"?(\d+)/)?.[1] || "";
  const isWorldCup = /world cup/i.test(`${tournamentName} ${stageName} ${rawObject}`);

  return {
    tipId,
    guid,
    oneliner,
    description: descriptionRef && !descriptionRef.startsWith("$") ? jsonStringValue(descriptionRef) : "",
    createdAt: createdDate ? `${createdDate.replace(" ", "T").replace(/\.\d+$/, "")}Z` : "",
    timeAgo,
    matchTitle,
    tournamentName,
    stageName,
    isWorldCup,
    bet: {
      stake,
      odds,
      handicap,
      outcomeId
    },
    user: {
      guid: userGuid,
      username,
      name: userName,
      rating,
      yield: yieldValue,
      profit
    }
  };
}

function uniqueBettingExpertTips(tips) {
  const seen = new Set();
  const unique = [];
  for (const tip of tips || []) {
    const key = `${tip.tipId}:${tip.user?.guid || tip.user?.username || ""}:${tip.oneliner}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(tip);
  }
  return unique;
}

function parseCompactNumber(value) {
  const cleaned = String(value || "").replace(/,/g, "").trim();
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function parseBettingExpertWorldCupLeaderboard(html) {
  const decoded = decodeBettingExpertHtmlText(html)
    .replace(/<!-- -->/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");
  const start = decoded.indexOf("Top World Cup tipster");
  if (start < 0) return [];
  const end = decoded.indexOf("Latest World Cup tips", start);
  const section = decoded.slice(start, end > start ? end : start + 50000);
  const plainSection = section
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const rows = [];

  const topTextMatch = plainSection.match(/Top World Cup tipster\s+([\d,.]+)\s+Tips\s+([\d,.]+)%\s+Yield\s+([A-Za-z0-9_.-]+)\s+\+?([\d,.]+)\s+Profit\s+([\d,.]+)%\s+Win rate/i);
  if (topTextMatch) {
    rows.push({
      rank: 1,
      userName: decodeBettingExpertHtmlText(topTextMatch[3]).trim(),
      profileUrl: `${BETTINGEXPERT_BASE}/user/profile/${encodeURIComponent(topTextMatch[3])}`,
      tips: parseCompactNumber(topTextMatch[1]),
      yield: parseCompactNumber(topTextMatch[2]),
      profit: parseCompactNumber(topTextMatch[4]),
      winRate: parseCompactNumber(topTextMatch[5]) != null ? parseCompactNumber(topTextMatch[5]) / 100 : null
    });
  }

  const rowRegex = /<span[^>]*>(\d+)<\/span>[\s\S]{0,5000}?<a href="\/user\/profile\/([^"]+)"[\s\S]{0,1200}?<span[^>]*>([^<]+)<\/span>[\s\S]{0,1800}?<span[^>]*>([\d,.]+)<\/span>\s*<span[^>]*>Tips<\/span>[\s\S]{0,800}?<span[^>]*>\+?([\d,.]+)<\/span>\s*<span[^>]*>Profit<\/span>/gi;
  let match;
  while ((match = rowRegex.exec(section)) !== null) {
    const rank = Number(match[1]);
    const userName = decodeBettingExpertHtmlText(match[3]).trim();
    if (!rank || !userName || rows.some((row) => row.userName.toLowerCase() === userName.toLowerCase())) continue;
    rows.push({
      rank,
      userName,
      profileUrl: `${BETTINGEXPERT_BASE}/user/profile/${encodeURIComponent(match[2])}`,
      tips: parseCompactNumber(match[4]),
      yield: null,
      profit: parseCompactNumber(match[5]),
      winRate: null
    });
  }

  return rows
    .sort((a, b) => a.rank - b.rank)
    .slice(0, BETTINGEXPERT_TIPSTER_LIMIT);
}

function parseBettingExpertTips(html) {
  const decoded = decodeBettingExpertHtmlText(html).replace(/\$undefined/g, "null");
  const tips = [];
  let cursor = 0;
  while (cursor < decoded.length) {
    const tipIndex = decoded.indexOf('"tipId":', cursor);
    if (tipIndex < 0) break;
    const objectStart = decoded.lastIndexOf("{", tipIndex);
    if (objectStart < 0) {
      cursor = tipIndex + 8;
      continue;
    }
    const rawObject = extractObjectAfter(decoded, objectStart);
    if (!rawObject) {
      cursor = tipIndex + 8;
      continue;
    }
    const tip = parseBettingExpertTipObject(rawObject);
    if (tip?.isWorldCup) tips.push(tip);
    cursor = objectStart + rawObject.length;
  }
  return uniqueBettingExpertTips(tips);
}

function bettingExpertTipsterScore(tip) {
  const profit = typeof tip.user?.profit === "number" ? tip.user.profit : 0;
  const yieldValue = typeof tip.user?.yield === "number" ? tip.user.yield : 0;
  const rating = typeof tip.user?.rating === "number" ? tip.user.rating : 0;
  const stake = typeof tip.bet?.stake === "number" ? tip.bet.stake : 0;
  return (profit / 100000) + (yieldValue / 8) + (rating / 10) + Math.min(stake, 10) / 100;
}

function bettingExpertCacheKey(url) {
  return String(url || "")
    .replace(/^https?:\/\/www\.bettingexpert\.com/i, "")
    .replace(/[?#].*$/, "")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
}

function isFreshBettingExpertCacheEntry(entry) {
  const updatedAt = Date.parse(entry?.updatedAt || "");
  return Number.isFinite(updatedAt) && Date.now() - updatedAt <= BETTINGEXPERT_CACHE_MAX_AGE_MS;
}

async function loadBettingExpertCache() {
  if (bettingExpertCache) return bettingExpertCache;
  bettingExpertCache = await readOptionalJson(BETTINGEXPERT_CACHE_PATH, {
    updatedAt: "",
    leaderboard: null,
    matches: {}
  });
  if (!bettingExpertCache || typeof bettingExpertCache !== "object") {
    bettingExpertCache = { updatedAt: "", leaderboard: null, matches: {} };
  }
  if (!bettingExpertCache.matches || typeof bettingExpertCache.matches !== "object") {
    bettingExpertCache.matches = {};
  }
  return bettingExpertCache;
}

async function saveBettingExpertCache() {
  if (!bettingExpertCache) return;
  bettingExpertCache.updatedAt = new Date().toISOString();
  await writeJsonAtomic(BETTINGEXPERT_CACHE_PATH, bettingExpertCache);
  bettingExpertCacheDirty = false;
}

function cachedBettingExpertLeaderboard(cache) {
  const entry = cache?.leaderboard;
  if (!entry?.rows?.length || !isFreshBettingExpertCacheEntry(entry)) return null;
  return {
    ...entry,
    ok: true,
    cached: true,
    cacheHit: true,
    rowCount: entry.rowCount || entry.rows.length,
    error: undefined
  };
}

function cachedBettingExpertMatch(cache, url) {
  const key = bettingExpertCacheKey(url);
  const entry = cache?.matches?.[key];
  if (!entry?.tips?.length || !isFreshBettingExpertCacheEntry(entry)) return null;
  return {
    ...entry,
    ok: true,
    cached: true,
    cacheHit: true
  };
}

function updateBettingExpertMatchCache(cache, url, tips, source = {}) {
  if (!cache || !url || !Array.isArray(tips) || !tips.length) return;
  const key = bettingExpertCacheKey(url);
  cache.matches[key] = {
    ok: true,
    source: "BettingExpert",
    url,
    updatedAt: new Date().toISOString(),
    latencyMs: source.latencyMs,
    totalTips: tips.length,
    tips
  };
  bettingExpertCacheDirty = true;
}

function mergeBettingExpertLeaderboardRows(currentRows, cachedRows) {
  const byUser = new Map();
  for (const row of cachedRows || []) {
    const key = String(row.userName || "").toLowerCase();
    if (!key) continue;
    byUser.set(key, row);
  }
  for (const row of currentRows || []) {
    const key = String(row.userName || "").toLowerCase();
    if (!key) continue;
    byUser.set(key, {
      ...(byUser.get(key) || {}),
      ...row
    });
  }
  return Array.from(byUser.values())
    .sort((a, b) => (a.rank || 9999) - (b.rank || 9999))
    .slice(0, BETTINGEXPERT_TIPSTER_LIMIT);
}

function normalizeBettingExpertTip(tip, rank) {
  const leaderboard = tip.leaderboard || null;
  return {
    rank: leaderboard?.rank || rank,
    userName: tip.user?.name || tip.user?.username || "-",
    userGuid: tip.user?.guid || "",
    profileUrl: leaderboard?.profileUrl || (tip.user?.username ? `${BETTINGEXPERT_BASE}/user/profile/${encodeURIComponent(tip.user.username)}` : ""),
    worldCupWinRate: leaderboard?.winRate ?? null,
    worldCupSample: leaderboard?.tips ?? null,
    worldCupLeaderboardRank: leaderboard?.rank || null,
    publicRating: tip.user?.rating,
    publicYield: leaderboard?.yield ?? tip.user?.yield,
    publicProfit: leaderboard?.profit ?? tip.user?.profit,
    rankingScore: roundTo(bettingExpertTipsterScore(tip), 4),
    pick: tip.oneliner,
    odds: tip.bet?.odds,
    stake: tip.bet?.stake,
    handicap: tip.bet?.handicap,
    postedAt: tip.createdAt,
    timeAgo: tip.timeAgo,
    bookmakerOutcomeId: tip.bet?.outcomeId,
    description: tip.description,
    matchTitle: tip.matchTitle
  };
}

function normalizeBettingExpertOpenTip(tip, rank) {
  return {
    rank,
    userName: tip.user?.name || tip.user?.username || "-",
    userGuid: tip.user?.guid || "",
    profileUrl: tip.user?.username ? `${BETTINGEXPERT_BASE}/user/profile/${encodeURIComponent(tip.user.username)}` : "",
    publicRating: tip.user?.rating,
    publicYield: tip.user?.yield,
    publicProfit: tip.user?.profit,
    rankingScore: roundTo(bettingExpertTipsterScore(tip), 4),
    pick: tip.oneliner,
    odds: tip.bet?.odds,
    stake: tip.bet?.stake,
    handicap: tip.bet?.handicap,
    postedAt: tip.createdAt,
    timeAgo: tip.timeAgo,
    bookmakerOutcomeId: tip.bet?.outcomeId,
    description: tip.description,
    matchTitle: tip.matchTitle,
    sourceTier: "match-public-tip",
    sourceTierLabel: "本场公开 tips 高分观察",
    sourceTierLabelEn: "High-scoring public match tip"
  };
}

function rankBettingExpertOpenTips(tips, limit = BETTINGEXPERT_TIPSTER_LIMIT) {
  return (tips || [])
    .filter((tip) => tip?.user?.username && tip?.oneliner)
    .sort((a, b) => bettingExpertTipsterScore(b) - bettingExpertTipsterScore(a))
    .slice(0, limit)
    .map((tip, index) => normalizeBettingExpertOpenTip(tip, index + 1));
}

async function fetchBettingExpertLeaderboard(cache = null) {
  const url = `${BETTINGEXPERT_BASE}/football/international/world-cup`;
  const result = await timedFetchText(url, { timeoutMs: BETTINGEXPERT_FETCH_TIMEOUT_MS });
  if (!result.ok || result.text.includes('id="__next_error__"')) {
    const cached = cachedBettingExpertLeaderboard(cache);
    if (cached) {
      return {
        ...cached,
        error: result.error ? `live fetch failed; using cached leaderboard: ${result.error}` : "live fetch failed; using cached leaderboard"
      };
    }
    return {
      ok: false,
      source: "BettingExpert",
      sourceUrl: url,
      updatedAt: new Date().toISOString(),
      error: result.error || "BettingExpert World Cup leaderboard unavailable",
      rows: []
    };
  }
  const rows = parseBettingExpertWorldCupLeaderboard(result.text);
  const cached = cachedBettingExpertLeaderboard(cache);
  const mergedRows = cached ? mergeBettingExpertLeaderboardRows(rows, cached.rows) : rows;
  if (mergedRows.length && cache) {
    cache.leaderboard = {
      ok: true,
      source: "BettingExpert",
      sourceUrl: url,
      updatedAt: new Date().toISOString(),
      latencyMs: result.latencyMs,
      rows: mergedRows,
      rowCount: mergedRows.length
    };
    bettingExpertCacheDirty = true;
  }
  if (!mergedRows.length) {
    if (cached) {
      return {
        ...cached,
        error: "No live World Cup leaderboard rows parsed; using cached leaderboard"
      };
    }
  }
  return {
    ok: mergedRows.length > 0,
    source: "BettingExpert",
    sourceUrl: url,
    updatedAt: new Date().toISOString(),
    latencyMs: result.latencyMs,
    rows: mergedRows,
    rowCount: mergedRows.length,
    mergedCache: Boolean(cached && mergedRows.length > rows.length),
    error: mergedRows.length ? undefined : "No public World Cup leaderboard rows parsed"
  };
}

async function fetchBettingExpertForMatch(match, leaderboard = null, cache = null) {
  const urls = bettingExpertMatchUrls(match);
  if (!urls.length) {
    return {
      ok: false,
      status: "unavailable",
      source: "BettingExpert",
      error: "missing-team-slug",
      url: "",
      updatedAt: new Date().toISOString(),
      topTipsters: []
    };
  }
  const leaderboardRows = Array.isArray(leaderboard?.rows) ? leaderboard.rows : [];
  const leaderboardByUser = new Map(leaderboardRows.map((row) => [String(row.userName || "").toLowerCase(), row]));
  let lastError = "";
  let selectedUrl = urls[0];
  let selectedResult = null;
  let selectedTips = [];
  let usedCachedMatch = false;
  for (const url of urls) {
    let result = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      result = await timedFetchText(url, { timeoutMs: BETTINGEXPERT_FETCH_TIMEOUT_MS });
      if (!result.ok) {
        lastError = result.error || "fetch failed";
      } else if (result.text.includes('id="__next_error__"')) {
        lastError = "BettingExpert page returned app error";
      } else {
        break;
      }
      if (attempt < 2) await wait(250);
    }
    if (!result?.ok || result.text.includes('id="__next_error__"')) {
      const cached = cachedBettingExpertMatch(cache, url);
      if (cached?.tips?.length) {
        selectedUrl = url;
        selectedResult = cached;
        selectedTips = cached.tips;
        usedCachedMatch = true;
        break;
      }
      continue;
    }
    const tips = parseBettingExpertTips(result.text);
    if (tips.length && cache) {
      updateBettingExpertMatchCache(cache, url, tips, result);
    }
    selectedUrl = url;
    selectedResult = result;
    selectedTips = tips;
    usedCachedMatch = false;
    break;
  }
  if (selectedResult) {
    const tips = selectedTips;
    const matchedTips = leaderboardRows.length
      ? tips
        .map((tip) => ({
          ...tip,
          leaderboard: leaderboardByUser.get(String(tip.user?.username || tip.user?.name || "").toLowerCase()) || null
        }))
        .filter((tip) => tip.leaderboard)
      : [];
    const topTipsters = matchedTips
      .filter((tip) => tip?.user?.username && tip?.oneliner)
      .sort((a, b) => (a.leaderboard?.rank || 999) - (b.leaderboard?.rank || 999))
      .slice(0, BETTINGEXPERT_TIPSTER_LIMIT)
      .map((tip, index) => normalizeBettingExpertTip(tip, index + 1));
    const publicTipsters = topTipsters.length ? [] : rankBettingExpertOpenTips(tips, Math.min(8, BETTINGEXPERT_TIPSTER_LIMIT));
    return {
      ok: true,
      status: leaderboardRows.length ? (topTipsters.length ? "synced" : "no-leaderboard-hit") : "leaderboard-unavailable",
      source: "BettingExpert",
      sourceUrl: selectedUrl,
      url: selectedUrl,
      updatedAt: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      latencyMs: selectedResult.latencyMs,
      cached: Boolean(usedCachedMatch || leaderboard?.cached),
      totalTips: tips.length,
      leaderboardCount: leaderboardRows.length,
      matchedTipCount: topTipsters.length,
      publicTipCount: tips.length,
      publicTipsters,
      rankingBasis: "Matched only public BettingExpert World Cup leaderboard users against this match page's public tips. If no leaderboard user matches, public match tips are shown separately as high-scoring observations, not verified win-rate elites.",
      rankingBasisZh: "优先匹配 BettingExpert 世界杯榜单公开用户与本场公开 tips；若榜单用户未命中，则单独显示本场公开 tips 的高分观察，不把它们当成已验证胜率高手。",
      topTipsters
    };
  }
  return {
    ok: false,
    status: "unavailable",
    source: "BettingExpert",
    sourceUrl: urls[0],
    url: urls[0],
    updatedAt: new Date().toISOString(),
    error: lastError || "BettingExpert source unavailable",
    rankingBasis: "BettingExpert source unavailable; no tipster rows were inferred.",
    rankingBasisZh: "BettingExpert 数据源不可用；未推断任何用户判断。",
    topTipsters: []
  };
}

async function attachBettingExpertSignals(matches, { enabled = true } = {}) {
  const targetMatches = (matches || []).slice(0, BETTINGEXPERT_MATCH_LIMIT);
  if (!enabled || !targetMatches.length) {
    for (const match of matches || []) {
      match.bettingExpert = {
        ok: false,
        status: "disabled",
        source: "BettingExpert",
        updatedAt: new Date().toISOString(),
        topTipsters: []
      };
    }
    return {
      ok: false,
      source: "BettingExpert",
      lastUpdated: new Date().toISOString(),
      error: enabled ? "no matches" : "disabled",
      matchedTipCount: 0
    };
  }
  const cache = await loadBettingExpertCache();
  const leaderboard = await fetchBettingExpertLeaderboard(cache);
  const rows = await mapLimit(targetMatches, 2, (match) => fetchBettingExpertForMatch(match, leaderboard, cache));
  let matchedTipCount = 0;
  let publicTipCount = 0;
  for (let index = 0; index < targetMatches.length; index += 1) {
    targetMatches[index].bettingExpert = rows[index];
    matchedTipCount += rows[index]?.matchedTipCount || 0;
    publicTipCount += rows[index]?.publicTipCount || rows[index]?.totalTips || 0;
  }
  if (bettingExpertCacheDirty) {
    try {
      await saveBettingExpertCache();
    } catch (error) {
      console.error(`Failed to persist BettingExpert cache: ${error.message}`);
    }
  }
  for (const match of (matches || []).slice(BETTINGEXPERT_MATCH_LIMIT)) {
    match.bettingExpert = {
      ok: false,
      status: "skipped-limit",
      source: "BettingExpert",
      updatedAt: new Date().toISOString(),
      error: `skipped after ${BETTINGEXPERT_MATCH_LIMIT} matches to keep dashboard refresh bounded`,
      topTipsters: []
    };
  }
  const okCount = rows.filter((row) => row?.ok).length;
  return {
    ok: okCount > 0,
    source: "BettingExpert",
    lastUpdated: new Date().toISOString(),
    matchedTipCount,
    matchCount: rows.length,
    okMatchCount: okCount,
    leaderboard,
    leaderboardCount: leaderboard.rowCount || 0,
    publicTipCount,
    error: okCount ? undefined : (rows.find((row) => row?.error)?.error || "BettingExpert unavailable"),
    detail: `${okCount}/${rows.length} matches synced · ${leaderboard.rowCount || 0} public World Cup leaderboard users · ${matchedTipCount} matched leaderboard tips · ${publicTipCount} public match tips`
  };
}

function teamNeedleGroup(event, side) {
  const code = eventTeamCode(event, side);
  const searchName = eventTeamSearchName(event, side);
  return [
    searchName,
    event?.[side]?.name,
    ...teamNameVariants(code, searchName),
    ...polymarketTeamSlugCandidates(code)
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase().trim())
    .filter((value) => value && value !== "tbd")
    .filter((value, index, values) => values.indexOf(value) === index);
}

function buildPolymarketEventSlugSearches(schedule = null) {
  const searches = [];
  for (const event of schedule?.matches || []) {
    if (event.completed || isFinishedStatus(event.status)) continue;
    const homeCodeRaw = eventTeamCode(event, "home");
    const awayCodeRaw = eventTeamCode(event, "away");
    const homeCodes = polymarketTeamSlugCandidates(eventTeamCode(event, "home"));
    const awayCodes = polymarketTeamSlugCandidates(eventTeamCode(event, "away"));
    if (!homeCodes.length || !awayCodes.length) continue;
    const overrideKey = `${homeCodeRaw}-${awayCodeRaw}`;
    const reverseOverrideKey = `${awayCodeRaw}-${homeCodeRaw}`;
    for (const slug of [
      ...(POLYMARKET_EVENT_SLUG_OVERRIDES[overrideKey] || []),
      ...(POLYMARKET_EVENT_SLUG_OVERRIDES[reverseOverrideKey] || [])
    ]) {
      searches.push({
        label: `${eventTeamSearchName(event, "home")} vs ${eventTeamSearchName(event, "away")} override`,
        slug,
        teamNeedles: [
          eventTeamSearchName(event, "home").toLowerCase(),
          eventTeamSearchName(event, "away").toLowerCase()
        ]
      });
    }
    for (const dateKey of polymarketDateCandidates(event.kickoffUtc)) {
      for (const homeCode of homeCodes) {
        for (const awayCode of awayCodes) {
          searches.push({
            label: `${eventTeamSearchName(event, "home")} vs ${eventTeamSearchName(event, "away")} (${dateKey})`,
            slug: `fifwc-${homeCode}-${awayCode}-${dateKey}`,
            teamNeedles: [
              eventTeamSearchName(event, "home").toLowerCase(),
              eventTeamSearchName(event, "away").toLowerCase()
            ]
          });
          searches.push({
            label: `${eventTeamSearchName(event, "home")} vs ${eventTeamSearchName(event, "away")} more markets (${dateKey})`,
            slug: `fifwc-${homeCode}-${awayCode}-${dateKey}-more-markets`,
            teamNeedles: [
              eventTeamSearchName(event, "home").toLowerCase(),
              eventTeamSearchName(event, "away").toLowerCase()
            ],
            moreMarkets: true
          });
          searches.push({
            label: `${eventTeamSearchName(event, "away")} vs ${eventTeamSearchName(event, "home")} (${dateKey})`,
            slug: `fifwc-${awayCode}-${homeCode}-${dateKey}`,
            teamNeedles: [
              eventTeamSearchName(event, "away").toLowerCase(),
              eventTeamSearchName(event, "home").toLowerCase()
            ]
          });
          searches.push({
            label: `${eventTeamSearchName(event, "away")} vs ${eventTeamSearchName(event, "home")} more markets (${dateKey})`,
            slug: `fifwc-${awayCode}-${homeCode}-${dateKey}-more-markets`,
            teamNeedles: [
              eventTeamSearchName(event, "away").toLowerCase(),
              eventTeamSearchName(event, "home").toLowerCase()
            ],
            moreMarkets: true
          });
        }
      }
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
  return polymarketTeamSlugCandidates(code)[0] || "";
}

function polymarketTeamSlugCandidates(code) {
  const overrides = {
    BRA: ["bra", "br", "brazil"],
    CPV: ["cvi", "cpv"],
    HAI: ["hai", "hti", "haiti"],
    POR: ["prt", "por"],
    COD: ["cdr", "cod", "drc", "cgo"],
    KOR: ["kr", "kor"]
  };
  const normalized = String(code || "").trim().toUpperCase();
  const values = overrides[normalized] || [normalized.toLowerCase()];
  return values.filter(Boolean).filter((value) => value !== "tbd");
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
  const sportsPageSearches = eventSlugSearches.filter((search) => !search.moreMarkets);
  const [eventSlugResults, sportsPageResults, searchResults] = await Promise.all([
    Promise.all(eventSlugSearches.map((search) => fetchPolymarketEventSlug(search))),
    Promise.all(sportsPageSearches.map((search) => fetchPolymarketSportsPageMarkets(search))),
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
  const slugPattern = new RegExp(`\\\"slug\\\":\\\"${escapeRegExp(eventSlug)}(?:\\\"|-[^\\\"]+\\\")`, "g");
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
    if (!isSupportedSportsPageMarketSlug(slug)) return null;
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

function isSupportedSportsPageMarketSlug(slug) {
  const value = String(slug || "");
  return /^fifwc-[a-z0-9-]+-\d{4}-\d{2}-\d{2}(?:-[a-z0-9-]+)?$/.test(value);
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeScoreboardEvents(data) {
  const events = Array.isArray(data?.events) ? data.events : [];
  return events.map((event) => {
    const competition = event.competitions?.[0] || {};
    const competitors = Array.isArray(competition.competitors) ? competition.competitors : [];
    const home = competitors.find((item) => item.homeAway === "home") || competitors[0] || {};
    const away = competitors.find((item) => item.homeAway === "away") || competitors[1] || {};
    const venue = normalizedVenueInfo(competition.venue || event.venue || {});
    const homeScore = Number(home.score);
    const awayScore = Number(away.score);
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
      homeScore: Number.isFinite(homeScore) ? homeScore : null,
      awayScore: Number.isFinite(awayScore) ? awayScore : null,
      venue,
      source: "ESPN FIFA World Cup scoreboard"
    };
  });
}

async function fetchScheduleRange(startKey, endKey, label = "ESPN FIFA World Cup scoreboard") {
  const startedAt = Date.now();
  const url = `${ESPN_WORLDCUP_SCOREBOARD}?dates=${startKey}-${endKey}`;
  const result = await timedFetchJson(url);
  if (!result.ok) {
    return {
      ok: false,
      source: label,
      url,
      lastUpdated: new Date().toISOString(),
      latencyMs: result.latencyMs,
      error: translateError(result.error),
      matches: []
    };
  }
  return {
    ok: true,
    source: label,
    url,
    lastUpdated: new Date().toISOString(),
    latencyMs: Date.now() - startedAt,
    matches: normalizeScoreboardEvents(result.data)
  };
}

async function fetchScheduleWindow(now = new Date()) {
  const dates = [];
  for (let offset = -MATCH_SCHEDULE_LOOKBACK_DAYS; offset <= MATCH_WINDOW_DAYS; offset += 1) {
    dates.push(shanghaiDateKey(addDays(now, offset)));
  }
  const schedule = await fetchScheduleRange(dates[0], dates[dates.length - 1], "ESPN FIFA World Cup scoreboard");
  return {
    ...schedule,
    windowDays: MATCH_WINDOW_DAYS,
  };
}

async function fetchTournamentTrendSchedule(now = new Date()) {
  const start = process.env.TOURNAMENT_TREND_START_DATE || "20260611";
  const end = shanghaiDateKey(addDays(now, MATCH_WINDOW_DAYS));
  return fetchScheduleRange(start, end, "ESPN FIFA World Cup scoreboard · tournament trend range");
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
    return search.teamNeedles.every((needle) => needleMatchesText(needle, text));
  }
  if (search.worldCupOnly) {
    return (text.includes("world cup") || text.includes("fifa")) && (text.includes("soccer") || text.includes("fifa") || text.includes("world-cup"));
  }
  return true;
}

function needleMatchesText(needle, text) {
  if (Array.isArray(needle)) {
    return needle.some((item) => needleMatchesText(item, text));
  }
  const value = String(needle || "").toLowerCase().trim();
  return Boolean(value) && text.includes(value);
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
    sportsMarketType: market.sportsMarketType || market.marketType || "",
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

function polymarketProfileUrl(value) {
  const profile = String(value || "").trim();
  return profile ? `https://polymarket.com/profile/${encodeURIComponent(profile)}` : "";
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

function isWorldCupPosition(position) {
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
  return text.includes("fifwc")
    || text.includes("world cup")
    || text.includes("world-cup")
    || text.includes("fifa world cup");
}

function isWorldCupOrSoccerMarketText(text) {
  const normalized = String(text || "").toLowerCase();
  if (!normalized) return false;
  if (NON_SOCCER_POSITION_KEYWORDS.some((keyword) => normalized.includes(keyword))) return false;
  return normalized.includes("world cup")
    || normalized.includes("world-cup")
    || normalized.includes("fifwc")
    || normalized.includes("fifa")
    || normalized.includes("soccer")
    || normalized.includes("football")
    || SOCCER_POSITION_KEYWORDS.some((keyword) => normalized.includes(keyword));
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

function summarizeSoccerPerformance(entry, closedPositions, fetchReport = null) {
  const uniqueClosedPositions = uniquePositions(closedPositions);
  const soccerPositions = uniqueClosedPositions.filter(isSoccerPosition);
  const worldCupPositions = uniqueClosedPositions.filter(isWorldCupPosition);
  const wins = soccerPositions.filter((position) => Number(position.realizedPnl || 0) > 0).length;
  const losses = soccerPositions.filter((position) => Number(position.realizedPnl || 0) < 0).length;
  const pushes = soccerPositions.length - wins - losses;
  const soccerPnl = soccerPositions.reduce((sum, position) => sum + Number(position.realizedPnl || 0), 0);
  const soccerVolume = soccerPositions.reduce((sum, position) => sum + Number(position.totalBought || 0), 0);
  const winRate = soccerPositions.length ? wins / soccerPositions.length : null;
  const worldCupWins = worldCupPositions.filter((position) => Number(position.realizedPnl || 0) > 0).length;
  const worldCupLosses = worldCupPositions.filter((position) => Number(position.realizedPnl || 0) < 0).length;
  const worldCupPushes = worldCupPositions.length - worldCupWins - worldCupLosses;
  const worldCupPnl = worldCupPositions.reduce((sum, position) => sum + Number(position.realizedPnl || 0), 0);
  const worldCupVolume = worldCupPositions.reduce((sum, position) => sum + Number(position.totalBought || 0), 0);
  const worldCupWinRate = worldCupPositions.length ? worldCupWins / worldCupPositions.length : null;
  const fetchOk = !fetchReport || fetchReport.ok;
  const worldCupHistoryStatus = fetchOk
    ? (worldCupPositions.length ? "ok" : "empty")
    : "error";

  return {
    rank: Number(entry.rank || 0) || null,
    userName: entry.userName || entry.name || walletKey(entry.proxyWallet).slice(0, 10),
    proxyWallet: entry.proxyWallet,
    profileUrl: polymarketProfileUrl(entry.proxyWallet || entry.userName || entry.name),
    xUsername: entry.xUsername || "",
    verifiedBadge: Boolean(entry.verifiedBadge || entry.verified),
    profileImage: entry.profileImage || "",
    overallPnl: Number(entry.pnl || 0),
    overallVolume: Number(entry.vol || entry.volume || 0),
    closedPositionStatus: fetchOk ? "ok" : "error",
    closedPositionError: fetchReport?.error || "",
    closedPositionPartial: Boolean(fetchReport?.partial),
    closedPositionCacheHit: Boolean(fetchReport?.cacheHit),
    closedPositionStale: Boolean(fetchReport?.stale),
    closedPositionsChecked: uniqueClosedPositions.length,
    closedPositionsFetchedAt: fetchReport?.fetchedAt || new Date().toISOString(),
    worldCupHistoryStatus,
    worldCupHistoryError: fetchOk ? "" : (fetchReport?.error || "账户历史仓位抓取失败"),
    worldCupHistoryFetchedAt: fetchReport?.fetchedAt || new Date().toISOString(),
    worldCupHistoryCacheHit: Boolean(fetchReport?.cacheHit),
    worldCupHistoryStale: Boolean(fetchReport?.stale),
    worldCupPnl,
    worldCupVolume,
    worldCupSettledPositions: worldCupPositions.length,
    worldCupWins,
    worldCupLosses,
    worldCupPushes,
    worldCupWinRateEstimate: worldCupWinRate,
    soccerPnl,
    soccerVolume,
    soccerSettledPositions: soccerPositions.length,
    soccerWins: wins,
    soccerLosses: losses,
    soccerPushes: pushes,
    winRateEstimate: winRate,
    worldCupSampleTitles: worldCupPositions.slice(0, 3).map((position) => position.title).filter(Boolean),
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

function closedPositionUrls(wallet, { deep = false } = {}) {
  const limit = deep
    ? Math.max(20, ELITE_CLOSED_POSITION_PAGE_SIZE)
    : Math.max(20, Math.floor(ELITE_CLOSED_POSITION_LIMIT / 2));
  const pages = deep ? Math.max(1, ELITE_CLOSED_POSITION_PAGES) : 1;
  const urls = [];
  for (let page = 0; page < pages; page += 1) {
    urls.push(`${POLYMARKET_DATA_API_BASE}/closed-positions?${new URLSearchParams({
      user: wallet,
      limit: String(limit),
      offset: String(page * limit),
      sortBy: "TIMESTAMP"
    }).toString()}`);
  }
  if (!deep) {
    urls.push(`${POLYMARKET_DATA_API_BASE}/closed-positions?${new URLSearchParams({
      user: wallet,
      limit: String(limit),
      offset: "0",
      sortBy: "REALIZEDPNL",
      sortDirection: "DESC"
    }).toString()}`);
  }
  return [...new Set(urls)];
}

function briefAccountFetchError(error) {
  const text = translateError(error || "unknown fetch failure");
  if (text.includes("HTTP 429") || text.includes("Error 1015")) {
    return "Polymarket data-api 限流 429/1015";
  }
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

async function loadEliteAccountHistoryCache() {
  if (eliteAccountHistoryCache) return eliteAccountHistoryCache;
  eliteAccountHistoryCache = await readOptionalJson(ELITE_ACCOUNT_CACHE_PATH, { accounts: {} });
  if (!eliteAccountHistoryCache || typeof eliteAccountHistoryCache !== "object") eliteAccountHistoryCache = { accounts: {} };
  if (!eliteAccountHistoryCache.accounts || typeof eliteAccountHistoryCache.accounts !== "object") eliteAccountHistoryCache.accounts = {};
  return eliteAccountHistoryCache;
}

async function persistEliteAccountHistoryCache() {
  if (!eliteAccountHistoryCache) return;
  await writeJsonAtomic(ELITE_ACCOUNT_CACHE_PATH, {
    ...eliteAccountHistoryCache,
    updatedAt: new Date().toISOString()
  });
}

function accountHistoryCacheEntry(wallet) {
  if (!eliteAccountHistoryCache?.accounts) return null;
  const entry = eliteAccountHistoryCache.accounts[walletKey(wallet)];
  const fetchedAtMs = Date.parse(entry?.fetchedAt || "") || 0;
  if (!entry || !fetchedAtMs) return null;
  return entry;
}

function cachedClosedPositionReport(wallet) {
  const entry = accountHistoryCacheEntry(wallet);
  if (!entry) return null;
  const fetchedAtMs = Date.parse(entry.fetchedAt || "") || 0;
  const ageMs = Date.now() - fetchedAtMs;
  if (ageMs > ELITE_ACCOUNT_HISTORY_CACHE_TTL_MS) return null;
  return {
    ok: true,
    partial: Boolean(entry.partial),
    cacheHit: true,
    fetchedAt: entry.fetchedAt,
    positions: uniquePositions(entry.positions || []),
    checkedUrls: entry.checkedUrls || 0,
    successfulUrls: entry.successfulUrls || 0,
    failedUrls: entry.failedUrls || 0,
    error: ""
  };
}

function staleClosedPositionReport(wallet, error) {
  const entry = accountHistoryCacheEntry(wallet);
  if (!entry) return null;
  return {
    ok: true,
    partial: true,
    cacheHit: true,
    stale: true,
    fetchedAt: entry.fetchedAt,
    positions: uniquePositions(entry.positions || []),
    checkedUrls: entry.checkedUrls || 0,
    successfulUrls: entry.successfulUrls || 0,
    failedUrls: entry.failedUrls || 0,
    error
  };
}

async function fetchClosedPositionReportForTrader(wallet, { deep = false, useCache = true } = {}) {
  const fetchedAt = new Date().toISOString();
  const normalizedWallet = walletKey(wallet);
  if (!normalizedWallet) {
    return {
      ok: false,
      partial: false,
      fetchedAt,
      positions: [],
      error: "missing wallet"
    };
  }
  if (useCache) {
    await loadEliteAccountHistoryCache();
    const cached = cachedClosedPositionReport(normalizedWallet);
    if (cached) return cached;
  }
  const urls = closedPositionUrls(normalizedWallet, { deep });
  const timeoutMs = deep ? ELITE_CLOSED_POSITION_DEEP_TIMEOUT_MS : ELITE_CLOSED_POSITION_TIMEOUT_MS;
  const results = await mapLimit(urls, 1, (url) => timedFetchJsonWithRetry(url, { timeoutMs }, deep ? 2 : 1));
  const successful = results.filter((result) => result.ok && Array.isArray(result.data));
  const failed = results.filter((result) => !result.ok);
  const positions = uniquePositions(successful.flatMap((result) => result.data || []));
  const error = failed.length
    ? failed
      .slice(0, 3)
      .map((result) => briefAccountFetchError(result.error || "unknown fetch failure"))
      .join("; ")
    : "";
  if (successful.length) {
    await loadEliteAccountHistoryCache();
    eliteAccountHistoryCache.accounts[normalizedWallet] = {
      fetchedAt,
      partial: successful.length > 0 && failed.length > 0,
      positions,
      checkedUrls: urls.length,
      successfulUrls: successful.length,
      failedUrls: failed.length
    };
    persistEliteAccountHistoryCache().catch((cacheError) => {
      console.error(`Failed to persist elite account history cache: ${cacheError.message}`);
    });
  }
  if (!successful.length) {
    const stale = useCache ? staleClosedPositionReport(normalizedWallet, error) : null;
    if (stale) return stale;
  }
  return {
    ok: successful.length > 0,
    partial: successful.length > 0 && failed.length > 0,
    fetchedAt,
    positions,
    checkedUrls: urls.length,
    successfulUrls: successful.length,
    failedUrls: failed.length,
    error
  };
}

async function fetchClosedPositionsForTrader(wallet, options = {}) {
  const report = await fetchClosedPositionReportForTrader(wallet, options);
  return report.positions;
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
        timePeriod: "WEEK",
        orderBy: "pnl"
      }
    ];
    const fallbackCandidateLimit = Math.min(ELITE_TRADER_CANDIDATE_LIMIT, 40);
    const pages = await Promise.all(discoverySources.map((source) => fetchLeaderboardPages(source, Math.ceil(fallbackCandidateLimit / discoverySources.length))));
    const candidates = uniqueLeaderboardEntries(pages.flat()).slice(0, fallbackCandidateLimit);
    const historyCandidates = candidates.slice(0, Math.min(ELITE_ACCOUNT_HISTORY_CANDIDATE_LIMIT, candidates.length));
    const summaries = await mapLimit(historyCandidates, 1, async (entry) => {
      const closedReport = await fetchClosedPositionReportForTrader(entry.proxyWallet, { useCache: !force });
      return summarizeSoccerPerformance(entry, closedReport.positions, closedReport);
    });
    const ranked = summaries
      .filter((trader) => trader.worldCupSettledPositions > 0)
      .sort((a, b) => {
        const pnlDiff = b.worldCupPnl - a.worldCupPnl;
        if (Math.abs(pnlDiff) > 1) return pnlDiff;
        const sampleDiff = b.worldCupSettledPositions - a.worldCupSettledPositions;
        if (sampleDiff) return sampleDiff;
        return (b.worldCupWinRateEstimate ?? 0) - (a.worldCupWinRateEstimate ?? 0);
      })
      .slice(0, ELITE_TRADER_LIMIT)
      .map((trader, index) => ({
        ...trader,
        soccerRank: index + 1,
        worldCupRank: index + 1
      }));

    const payload = {
      source: "Polymarket Data API",
      ok: ranked.length > 0,
      updatedAt: new Date().toISOString(),
      cacheTtlSeconds: Math.round(ELITE_LEADERBOARD_CACHE_TTL_MS / 1000),
      candidateCount: candidates.length,
      checkedCandidateCount: historyCandidates.length,
      rankingBasis: "SPORTS 表现候选账号 + 世界杯已结算样本过滤；胜率=盈利世界杯样本数/抓取到的世界杯已结算样本数",
      limit: ELITE_TRADER_LIMIT,
      traders: ranked
    };
    if (!ranked.length) payload.error = "SPORTS 榜单暂未筛到可审计的世界杯已结算样本";
    if (payload.ok) {
      eliteLeaderboardCache = payload;
      eliteLeaderboardCacheAt = now;
    }
    return payload;
  } catch (error) {
    return {
      source: "Polymarket Data API",
      ok: false,
      updatedAt: new Date().toISOString(),
      error: translateError(error.message),
      rankingBasis: "SPORTS 表现候选账号 + 世界杯已结算样本过滤",
      traders: []
    };
  }
}

function marketHolderCandidateEntries(marketPositionResults, catalog = [], polymarket = {}) {
  const marketMeta = new Map();
  const conditionMeta = new Map();
  for (const item of catalog || []) {
    marketMeta.set(item.conditionId, [
      item.marketName,
      item.marketType,
      item.chartQuestion,
      item.chartLabel
    ].filter(Boolean).join(" "));
    conditionMeta.set(item.conditionId, {
      matchId: item.matchId,
      recommendationKey: item.recommendationKey,
      marketType: item.marketType,
      marketName: item.marketName,
      chartQuestion: item.chartQuestion
    });
  }
  for (const market of polymarket?.markets || []) {
    marketMeta.set(market.conditionId, [
      market.question,
      market.slug,
      market.eventTitle,
      market.eventSlug
    ].filter(Boolean).join(" "));
  }

  const byWallet = new Map();
  for (const result of marketPositionResults || []) {
    const metaText = marketMeta.get(result.conditionId) || "";
    if (!isWorldCupOrSoccerMarketText(metaText)) continue;
    const meta = conditionMeta.get(result.conditionId) || {};
    for (const positions of Object.values(result.positionsByToken || {})) {
      for (const position of positions || []) {
        const wallet = walletKey(position.proxyWallet || position.owner || position.address);
        if (!wallet) continue;
        const size = Number(position.size || position.shares || position.balance || 0);
        const currentValue = Number(position.currentValue || 0);
        if (size <= 0.000001 && currentValue <= 0.01) continue;
        const current = byWallet.get(wallet) || {
          proxyWallet: position.proxyWallet || position.owner || position.address,
          userName: displayUserName(position),
          pnl: 0,
          vol: 0,
          currentValue: 0,
          source: "current-world-cup-holders",
          holderSamples: 0,
          currentPositionMix: []
        };
        current.currentValue += currentValue;
        current.vol += Number(position.totalBought || currentValue || size || 0);
        current.holderSamples += 1;
        current.currentPositionMix.push({
          conditionId: result.conditionId,
          matchId: meta.matchId || "",
          marketType: meta.marketType || "",
          recommendationKey: meta.recommendationKey || "",
          marketName: meta.marketName || meta.chartQuestion || metaText,
          outcome: position.outcome || "",
          size,
          currentValue,
          totalBought: Number(position.totalBought || currentValue || size || 0)
        });
        byWallet.set(wallet, current);
      }
    }
  }
  return [...byWallet.values()]
    .sort((a, b) => b.currentValue - a.currentValue)
    .slice(0, ELITE_MARKET_HOLDER_CANDIDATE_LIMIT);
}

async function buildEliteLeaderboardFromMarketHolders(marketPositionResults, catalog, polymarket, { force = false } = {}) {
  const now = Date.now();
  if (!force && eliteLeaderboardCache && eliteLeaderboardCache.sourceFallback === "current-world-cup-holders" && now - eliteLeaderboardCacheAt < ELITE_LEADERBOARD_CACHE_TTL_MS) {
    return {
      ...eliteLeaderboardCache,
      cacheHit: true
    };
  }
  const candidates = marketHolderCandidateEntries(marketPositionResults, catalog, polymarket);
  if (!candidates.length) {
    return {
      source: "Polymarket Data API",
      ok: false,
      updatedAt: new Date().toISOString(),
      error: "未从当前世界杯盘口持仓中找到可反查账号",
      rankingBasis: "当前世界杯盘口公开持仓者 + 世界杯已结算样本/当前持仓过滤",
      candidateCount: 0,
      limit: ELITE_TRADER_LIMIT,
      traders: []
    };
  }

  const historyCandidates = candidates.slice(0, ELITE_ACCOUNT_HISTORY_CANDIDATE_LIMIT);
  const summaries = await mapLimit(historyCandidates, 1, async (entry) => {
    const closedReport = await fetchClosedPositionReportForTrader(entry.proxyWallet, { deep: true, useCache: !force });
    return {
      ...summarizeSoccerPerformance(entry, closedReport.positions, closedReport),
      currentHolderValue: entry.currentValue,
      holderSamples: entry.holderSamples
    };
  });
  const classified = summaries
    .filter((trader) => trader.worldCupSettledPositions > 0 || Number(trader.currentHolderValue || 0) > 0)
    .map(attachDirectionalProfile)
    .map(attachWorldCupEliteStatus);
  const ranked = classified
    .filter(isWorldCupEliteTrader)
    .sort((a, b) => {
      const pnlDiff = b.worldCupPnl - a.worldCupPnl;
      if (Math.abs(pnlDiff) > 1) return pnlDiff;
      const sampleDiff = b.worldCupSettledPositions - a.worldCupSettledPositions;
      if (sampleDiff) return sampleDiff;
      const winRateDiff = (b.worldCupWinRateEstimate ?? 0) - (a.worldCupWinRateEstimate ?? 0);
      if (Math.abs(winRateDiff) > 0.0001) return winRateDiff;
      return (b.soccerPnl || 0) - (a.soccerPnl || 0);
    })
    .slice(0, ELITE_TRADER_LIMIT)
    .map((trader, index) => ({
      ...trader,
      soccerRank: index + 1,
      worldCupRank: index + 1
    }));
  const watchlist = classified
    .filter((trader) => !isWorldCupEliteTrader(trader))
    .sort((a, b) => {
      const holderDiff = (b.currentHolderValue || 0) - (a.currentHolderValue || 0);
      if (Math.abs(holderDiff) > 1) return holderDiff;
      const pnlDiff = (b.worldCupPnl || 0) - (a.worldCupPnl || 0);
      if (Math.abs(pnlDiff) > 1) return pnlDiff;
      const winRateDiff = (b.worldCupWinRateEstimate ?? 0) - (a.worldCupWinRateEstimate ?? 0);
      if (Math.abs(winRateDiff) > 0.0001) return winRateDiff;
      return (b.worldCupSettledPositions || 0) - (a.worldCupSettledPositions || 0);
    })
    .slice(0, ELITE_TRADER_LIMIT)
    .map((trader, index) => ({
      ...trader,
      soccerRank: ranked.length + index + 1,
      worldCupRank: ranked.length + index + 1
    }));
  const payload = {
    source: "Polymarket Data API",
    ok: ranked.length > 0 || (watchlist || []).length > 0,
    updatedAt: new Date().toISOString(),
    cacheTtlSeconds: Math.round(ELITE_LEADERBOARD_CACHE_TTL_MS / 1000),
    candidateCount: candidates.length,
    checkedCandidateCount: historyCandidates.length,
    rankingBasis: `世界杯高手榜只收正样本账号：样本 >= ${ELITE_MIN_WORLD_CUP_SAMPLE}、胜率 >= ${Math.round(ELITE_MIN_WORLD_CUP_WIN_RATE * 100)}%、世界杯PNL > ${ELITE_MIN_WORLD_CUP_PNL}；不达标的大户放入当前持仓观察。`,
    limit: ELITE_TRADER_LIMIT,
    traders: ranked,
    watchlist,
    sourceFallback: "current-world-cup-holders"
  };
  if (!ranked.length) payload.error = "当前盘口持仓者里暂未筛到可审计的世界杯账号";
  if (payload.ok) {
    eliteLeaderboardCache = payload;
    eliteLeaderboardCacheAt = Date.now();
  }
  return payload;
}

function rankWorldCupTraders(traders, limit = ELITE_TRADER_LIMIT) {
  return (traders || [])
    .map(attachDirectionalProfile)
    .map(attachWorldCupEliteStatus)
    .filter(isWorldCupEliteTrader)
    .sort((a, b) => {
      const pnlDiff = (b.worldCupPnl || 0) - (a.worldCupPnl || 0);
      if (Math.abs(pnlDiff) > 1) return pnlDiff;
      const sampleDiff = (b.worldCupSettledPositions || 0) - (a.worldCupSettledPositions || 0);
      if (sampleDiff) return sampleDiff;
      const winRateDiff = (b.worldCupWinRateEstimate ?? 0) - (a.worldCupWinRateEstimate ?? 0);
      if (Math.abs(winRateDiff) > 0.0001) return winRateDiff;
      return (b.soccerPnl || 0) - (a.soccerPnl || 0);
    })
    .slice(0, limit)
    .map((trader, index) => ({
      ...trader,
      soccerRank: index + 1,
      worldCupRank: index + 1
    }));
}

function rankWorldCupWatchlist(traders, limit = ELITE_TRADER_LIMIT) {
  return (traders || [])
    .map(attachDirectionalProfile)
    .map(attachWorldCupEliteStatus)
    .filter((trader) => !isWorldCupEliteTrader(trader) && (trader.worldCupSettledPositions > 0 || Number(trader.currentHolderValue || 0) > 0))
    .sort((a, b) => {
      const holderDiff = (b.currentHolderValue || 0) - (a.currentHolderValue || 0);
      if (Math.abs(holderDiff) > 1) return holderDiff;
      const pnlDiff = (b.worldCupPnl || 0) - (a.worldCupPnl || 0);
      if (Math.abs(pnlDiff) > 1) return pnlDiff;
      const winRateDiff = (b.worldCupWinRateEstimate ?? 0) - (a.worldCupWinRateEstimate ?? 0);
      if (Math.abs(winRateDiff) > 0.0001) return winRateDiff;
      return (b.worldCupSettledPositions || 0) - (a.worldCupSettledPositions || 0);
    })
    .slice(0, limit)
    .map((trader, index) => ({
      ...trader,
      soccerRank: index + 1,
      worldCupRank: index + 1
    }));
}

function mergeWorldCupLeaderboards(primary = {}, holders = {}) {
  const byWallet = new Map();
  for (const trader of [...(primary.traders || []), ...(holders.traders || [])]) {
    const key = walletKey(trader.proxyWallet);
    if (!key) continue;
    const current = byWallet.get(key) || {};
    byWallet.set(key, {
      ...current,
      ...trader,
      currentHolderValue: Math.max(Number(current.currentHolderValue || 0), Number(trader.currentHolderValue || 0)),
      holderSamples: Math.max(Number(current.holderSamples || 0), Number(trader.holderSamples || 0))
    });
  }
  const mergedTraders = [...byWallet.values()];
  const ranked = rankWorldCupTraders(mergedTraders);
  const watchlist = rankWorldCupWatchlist(mergedTraders);
  return {
    ...primary,
    ok: ranked.length > 0 || watchlist.length > 0,
    updatedAt: new Date().toISOString(),
    candidateCount: Math.max(Number(primary.candidateCount || 0), Number(holders.candidateCount || 0)),
    rankingBasis: `世界杯高手榜只收正样本账号：样本 >= ${ELITE_MIN_WORLD_CUP_SAMPLE}、胜率 >= ${Math.round(ELITE_MIN_WORLD_CUP_WIN_RATE * 100)}%、世界杯PNL > ${ELITE_MIN_WORLD_CUP_PNL}；低胜率或负收益大户只作为当前持仓观察。`,
    sourceFallback: holders.sourceFallback || primary.sourceFallback,
    traders: ranked,
    watchlist,
    error: ranked.length ? undefined : (holders.error || primary.error)
  };
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
    worldCupRank: trader.worldCupRank || trader.soccerRank,
    userName: trader.userName,
    proxyWallet: trader.proxyWallet,
    profileUrl: trader.profileUrl || polymarketProfileUrl(trader.proxyWallet || trader.userName),
    verifiedBadge: trader.verifiedBadge,
    worldCupWinRateEstimate: trader.worldCupWinRateEstimate,
    worldCupPnl: trader.worldCupPnl,
    worldCupSettledPositions: trader.worldCupSettledPositions,
    worldCupEliteTier: trader.worldCupEliteTier,
    worldCupEliteLabel: trader.worldCupEliteLabel,
    worldCupEliteReason: trader.worldCupEliteReason,
    traderStyle: trader.traderStyle,
    traderStyleLabel: trader.traderStyleLabel,
    traderStyleReason: trader.traderStyleReason,
    directionalPurity: trader.directionalPurity,
    worldCupHistoryStatus: trader.worldCupHistoryStatus,
    worldCupHistoryError: trader.worldCupHistoryError,
    worldCupHistoryFetchedAt: trader.worldCupHistoryFetchedAt,
    worldCupHistoryCacheHit: trader.worldCupHistoryCacheHit,
    worldCupHistoryStale: trader.worldCupHistoryStale,
    closedPositionsChecked: trader.closedPositionsChecked,
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
    profileUrl: trader?.profileUrl || polymarketProfileUrl(position.proxyWallet || position.owner || position.address || position.userName),
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
    worldCupRank: trader?.worldCupRank || trader?.soccerRank || null,
    worldCupWinRateEstimate: trader?.worldCupWinRateEstimate ?? null,
    worldCupPnl: trader?.worldCupPnl ?? null,
    worldCupSettledPositions: trader?.worldCupSettledPositions ?? null,
    worldCupEliteTier: trader?.worldCupEliteTier || "",
    worldCupEliteLabel: trader?.worldCupEliteLabel || "",
    worldCupEliteReason: trader?.worldCupEliteReason || "",
    traderStyle: trader?.traderStyle || "",
    traderStyleLabel: trader?.traderStyleLabel || "",
    traderStyleReason: trader?.traderStyleReason || "",
    directionalPurity: trader?.directionalPurity ?? null,
    worldCupHistoryStatus: trader?.worldCupHistoryStatus || "",
    worldCupHistoryError: trader?.worldCupHistoryError || "",
    worldCupHistoryFetchedAt: trader?.worldCupHistoryFetchedAt || "",
    worldCupHistoryCacheHit: Boolean(trader?.worldCupHistoryCacheHit),
    worldCupHistoryStale: Boolean(trader?.worldCupHistoryStale),
    closedPositionsChecked: trader?.closedPositionsChecked ?? null,
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

function emptyEliteLeaderboard(reason = "轻量实时模式跳过世界杯 Top10 持仓深挖") {
  return {
    source: "Polymarket Data API",
    ok: false,
    updatedAt: new Date().toISOString(),
    skipped: true,
    error: reason,
    rankingBasis: "SPORTS 表现候选账号 + 世界杯已结算样本过滤",
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

function attachEmptyEliteSignals(matches, polymarket, reason = "轻量实时模式跳过世界杯 Top10 持仓深挖") {
  for (const match of matches || []) {
    for (const recommendation of match.recommendations || []) {
      recommendation.eliteSignals = [];
      recommendation.watchlistSignals = [];
      recommendation.eliteSummary = {
        count: 0,
        totalCurrentValue: 0,
        totalBought: 0,
        topTrader: ""
      };
      recommendation.watchlistSummary = {
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
  if (!enabled) return attachEmptyEliteSignals(matches, polymarket, "轻量实时模式跳过世界杯 Top10 持仓深挖");
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
  let leaderboard = emptyEliteLeaderboard("等待当前世界杯盘口持仓账号同步");
  if (marketPositionResults.length) {
    const holderLeaderboard = await buildEliteLeaderboardFromMarketHolders(marketPositionResults, catalog, polymarket, { force });
    if ((holderLeaderboard.traders || []).length || (holderLeaderboard.watchlist || []).length) {
      leaderboard = holderLeaderboard;
      eliteLeaderboardCache = leaderboard;
      eliteLeaderboardCacheAt = Date.now();
    }
  }
  if (!(leaderboard.traders || []).length && !(leaderboard.watchlist || []).length) {
    leaderboard = await fetchEliteLeaderboard({ force });
  }
  const traderMap = new Map((leaderboard.traders || []).map((trader) => [walletKey(trader.proxyWallet), trader]));
  const watchlistMap = new Map((leaderboard.watchlist || []).map((trader) => [walletKey(trader.proxyWallet), trader]));
  const signalMap = new Map();
  const watchlistSignalMap = new Map();
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

    const watchlistPositions = tokenPositions
      .map((position) => {
        const trader = watchlistMap.get(walletKey(position.proxyWallet));
        const normalized = trader ? normalizeEliteMarketPosition(position, trader) : null;
        return normalized ? {
          ...normalized,
          asset: position.asset || position.token || item.tokenId,
          conditionId: item.conditionId
        } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.currentValue - a.currentValue);
    watchlistSignalMap.set(`${item.matchId}:${item.recommendationKey}`, watchlistPositions);
  }

  const allSignals = [...signalMap.values()].flat();
  const allWatchlistSignals = [...watchlistSignalMap.values()].flat();
  const enrichedSignals = await enrichSignalsWithActivity(allSignals);
  const enrichedWatchlistSignals = await enrichSignalsWithActivity(allWatchlistSignals);
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
  const enrichedWatchlistQueues = new Map();
  for (const signal of enrichedWatchlistSignals) {
    const key = `${signal.conditionId}:${signal.asset}:${walletKey(signal.proxyWallet)}:${signal.outcome}`;
    if (!enrichedWatchlistQueues.has(key)) enrichedWatchlistQueues.set(key, []);
    enrichedWatchlistQueues.get(key).push(signal);
  }
  for (const [mapKey, signals] of watchlistSignalMap.entries()) {
    watchlistSignalMap.set(mapKey, signals.map((signal) => {
      const key = `${signal.conditionId}:${signal.asset}:${walletKey(signal.proxyWallet)}:${signal.outcome}`;
      return (enrichedWatchlistQueues.get(key) || []).shift() || signal;
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
      const watchlistSignals = watchlistSignalMap.get(`${match.id}:${recommendation.key}`) || [];
      const topHolders = holderMap.get(`${match.id}:${recommendation.key}`) || [];
      recommendation.eliteSignals = signals;
      recommendation.watchlistSignals = watchlistSignals;
      recommendation.eliteSummary = {
        count: signals.length,
        totalCurrentValue: signals.reduce((sum, signal) => sum + signal.currentValue, 0),
        totalBought: signals.reduce((sum, signal) => sum + signal.totalBought, 0),
        topTrader: signals[0]?.userName || ""
      };
      recommendation.watchlistSummary = {
        count: watchlistSignals.length,
        totalCurrentValue: watchlistSignals.reduce((sum, signal) => sum + signal.currentValue, 0),
        totalBought: watchlistSignals.reduce((sum, signal) => sum + signal.totalBought, 0),
        topTrader: watchlistSignals[0]?.userName || ""
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

function livePolymarketChartCount(payload) {
  let count = 0;
  for (const match of payload?.matches || []) {
    for (const recommendation of match.recommendations || []) {
      if (recommendation.chart?.source !== "Polymarket") continue;
      if ((recommendation.chart.history || []).length >= 2) count += 1;
    }
  }
  return count;
}

function payloadCacheAgeMs(payload) {
  const generatedAt = Date.parse(payload?.meta?.generatedAt || "");
  return Number.isFinite(generatedAt) ? Math.max(0, Date.now() - generatedAt) : Infinity;
}

function shouldKeepExistingLightCache(nextPayload, previousPayload) {
  if (!previousPayload?.matches?.length || !nextPayload?.matches?.length) return false;
  if (payloadCacheAgeMs(previousPayload) > LIGHT_CACHE_STABILITY_MAX_AGE_MS) return false;
  const previousCount = livePolymarketChartCount(previousPayload);
  const nextCount = livePolymarketChartCount(nextPayload);
  if (previousCount < 3) return false;
  return nextCount < Math.max(1, Math.floor(previousCount * 0.6));
}

function buildPolymarketSourceSummary(polymarket) {
  return {
    source: polymarket?.source || "Polymarket 实时市场 API",
    ok: Boolean(polymarket?.ok),
    latencyMs: polymarket?.latencyMs,
    marketCount: Array.isArray(polymarket?.markets) ? polymarket.markets.length : 0,
    historySource: polymarket?.historySource ? {
      source: polymarket.historySource.source,
      ok: polymarket.historySource.ok,
      partial: polymarket.historySource.partial,
      error: polymarket.historySource.error,
      requestedTokens: polymarket.historySource.requestedTokens,
      returnedTokens: polymarket.historySource.returnedTokens,
      batchCount: polymarket.historySource.batchCount,
      fidelityMinutes: polymarket.historySource.fidelityMinutes
    } : undefined,
    error: polymarket?.error
  };
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
      recommendation.watchlistSignals = cachedRec.watchlistSignals || [];
      recommendation.eliteSummary = cachedRec.eliteSummary || recommendation.eliteSummary;
      recommendation.watchlistSummary = cachedRec.watchlistSummary || recommendation.watchlistSummary;
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
  const [schedule, trendSchedule, initialFinalResults] = await Promise.all([
    fetchScheduleWindow(),
    fetchTournamentTrendSchedule(),
    fetchFinalResults()
  ]);
  let finalResults = initialFinalResults;
  const trendSourceSchedule = trendSchedule.ok ? trendSchedule : schedule;
  const tournamentTrend = buildTournamentTrend(trendSourceSchedule, fifaRankings);
  const polymarket = await fetchPolymarket(schedule);
  const preliminaryWorldCupRecords = applyRecordedWorldCupResults(worldCupRecords, local.matches, schedule.matches || [], finalResults);
  const allModeledMatches = local.matches.map((match) => normalizeMatch(match, local.teams, context, polymarket, preliminaryWorldCupRecords, squadProfiles, fifaRankings, tournamentTrend));
  if (!DISABLE_HISTORY_RECORDING && trendSourceSchedule.ok) {
    try {
      await syncFinalResultsFromSchedule(trendSourceSchedule, allModeledMatches, finalResults);
    } catch (error) {
      console.error(`Failed to sync final results from schedule: ${error.message}`);
    }
  }
  const effectiveWorldCupRecords = applyRecordedWorldCupResults(worldCupRecords, local.matches, trendSourceSchedule.matches || schedule.matches || [], finalResults);
  const { matches, visibility } = filterAndAugmentMatches(allModeledMatches, schedule, finalResults, polymarket, context, fifaRankings, effectiveWorldCupRecords, squadProfiles, h2hOverrides, tournamentTrend);
  attachMarketCharts(matches, polymarket);
  const bettingExpert = await attachBettingExpertSignals(matches, { enabled: true });
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
        source: "阵容与比赛证据",
        ok: squadProfiles.ok !== false,
        lastUpdated: squadProfiles.updatedAt || "",
        error: squadProfiles.error,
        detail: `${Object.keys(squadProfiles.teams || {}).length} 队 · 身高/年龄/出场/俱乐部分层/近期战绩证据`
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
        source: "本届赛会趋势",
        ok: tournamentTrend.ok,
        lastUpdated: tournamentTrend.updatedAt || "",
        error: trendSchedule.ok ? undefined : trendSchedule.error,
        detail: tournamentTrend.summary
      },
      {
        source: "世界杯账号监控",
        ok: eliteTraders.ok,
        lastUpdated: eliteTraders.updatedAt || "",
        error: eliteTraders.error || eliteTraders.marketPositions?.error,
        detail: eliteTraders.rankingBasis
      },
      {
        source: "BettingExpert 用户判断",
        ok: bettingExpert.ok,
        lastUpdated: bettingExpert.lastUpdated || "",
        error: bettingExpert.error,
        detail: bettingExpert.detail || "按单场页面公开 tips 排序，不伪造缺失胜率。"
      },
      buildPolymarketSourceSummary(polymarket)
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
    tournamentTrend,
    schedule,
    matches,
    bettingExpert,
    eliteTraders,
    polymarket
  };

  if (light) {
    const previousLightCache = lightDashboardCache || await readOptionalJson(LIVE_CACHE_PATH, null);
    if (shouldKeepExistingLightCache(payload, previousLightCache)) {
      payload.meta.cacheQualityHold = {
        keptPrevious: true,
        reason: "polymarket-chart-drop",
        previousLiveCharts: livePolymarketChartCount(previousLightCache),
        nextLiveCharts: livePolymarketChartCount(payload),
        previousGeneratedAt: previousLightCache.meta?.generatedAt || ""
      };
      lightDashboardCache = {
        ...previousLightCache,
        meta: {
          ...(previousLightCache.meta || {}),
          cacheQualityHold: payload.meta.cacheQualityHold,
          backgroundRefresh: Boolean(backgroundRefreshPromise)
        }
      };
      lightDashboardCacheAt = Date.parse(previousLightCache.meta?.generatedAt || "") || Date.now();
    } else {
      lightDashboardCache = payload;
      lightDashboardCacheAt = Date.now();
      writeJsonAtomic(LIVE_CACHE_PATH, payload).catch((error) => {
        console.error(`Failed to persist live dashboard cache: ${error.message}`);
      });
    }
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
      if (light && !force) {
        const cached = await getPersistedLightCache();
        if (cached) {
          const generatedAt = Date.parse(cached.meta?.generatedAt || "") || 0;
          const staleMs = Date.now() - generatedAt;
          if (staleMs > LIGHT_CACHE_TTL_MS) scheduleBackgroundLightRefresh();
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
    if (pathname === "/api/opportunities") {
      const force = url.searchParams.get("force") === "1";
      let payload = await getOpportunityCache();
      if (force) {
        try {
          payload = await scheduleOpportunityRefresh({ force: true });
        } catch (error) {
          console.error(`Forced opportunity refresh failed: ${error.message}`);
        }
      } else if (!payload) {
        scheduleOpportunityRefresh({ force: true });
      }
      if (!payload) payload = pendingOpportunityPayload();
      const generatedAt = Date.parse(payload.meta?.generatedAt || "") || 0;
      const staleMs = Date.now() - generatedAt;
      if (!force && staleMs > OPPORTUNITY_REFRESH_MS) scheduleOpportunityRefresh();
      jsonResponse(res, 200, {
        ...payload,
        meta: {
          ...(payload.meta || {}),
          backgroundRefresh: Boolean(opportunityRefreshPromise),
          cacheAgeSeconds: generatedAt ? Math.max(0, Math.round(staleMs / 1000)) : null
        }
      });
      return;
    }
    if (pathname === "/api/opportunities/check") {
      const marketPriceParam = url.searchParams.get("marketPrice");
      const maxBuyPriceParam = url.searchParams.get("maxBuyPrice");
      const payload = await checkOpportunityCurrentPrice({
        id: url.searchParams.get("id") || "",
        matchId: url.searchParams.get("matchId") || "",
        marketKey: url.searchParams.get("marketKey") || "",
        marketPrice: marketPriceParam != null && Number.isFinite(Number(marketPriceParam))
          ? Number(marketPriceParam)
          : null,
        maxBuyPrice: maxBuyPriceParam != null && Number.isFinite(Number(maxBuyPriceParam))
          ? Number(maxBuyPriceParam)
          : null
      });
      jsonResponse(res, payload.ok === false ? 422 : 200, payload);
      return;
    }
    if (pathname === "/api/opportunities/review") {
      const limitParam = Number(url.searchParams.get("limit"));
      const payload = await buildOpportunityReview({
        limit: Number.isFinite(limitParam) ? limitParam : OPPORTUNITY_REVIEW_LIMIT
      });
      jsonResponse(res, 200, payload);
      return;
    }
    if (pathname === "/api/opportunities/elites") {
      const force = url.searchParams.get("force") === "1";
      const payload = await buildEliteMonitor({ force });
      jsonResponse(res, 200, payload);
      return;
    }
    if (pathname === "/api/live/match") {
      const force = url.searchParams.get("force") === "1";
      const persist = url.searchParams.get("persist") !== "0";
      const matchId = url.searchParams.get("matchId") || url.searchParams.get("id") || "";
      const payload = await buildLiveMatchInsight(matchId, { force, persist });
      jsonResponse(res, payload.ok === false ? 422 : 200, payload);
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

setTimeout(scheduleOpportunityRefresh, 60 * 1000);
setInterval(scheduleOpportunityRefresh, OPPORTUNITY_REFRESH_MS);

function stripBasePath(pathname) {
  if (!BASE_PATH) return pathname;
  if (pathname === BASE_PATH) return "/";
  if (pathname.startsWith(`${BASE_PATH}/`)) return pathname.slice(BASE_PATH.length);
  return pathname;
}
