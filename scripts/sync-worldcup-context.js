const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const { recordContextSnapshot } = require("./history-store");

const DASHBOARD_PATH = path.join(__dirname, "..", "data", "worldcup-dashboard.json");
const CONTEXT_PATH = path.join(__dirname, "..", "data", "worldcup-context.json");
const FIFA_RANKINGS_PATH = path.join(__dirname, "..", "data", "fifa-rankings.json");
const H2H_OVERRIDES_PATH = path.join(__dirname, "..", "data", "head-to-head-overrides.json");
const ENV_PATH = process.env.WORLDCUP_ENV_PATH || "/etc/worldcup-dashboard.env";
const CODEX_CONFIG_PATH = process.env.CODEX_CONFIG_PATH || path.join(os.homedir(), ".codex", "config.toml");
const CODEX_AUTH_PATH = process.env.CODEX_AUTH_PATH || path.join(os.homedir(), ".codex", "auth.json");
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 8000);
const MATCH_SYNC_TIMEOUT_MS = Number(process.env.MATCH_SYNC_TIMEOUT_MS || 120000);
const RUN_TIMEOUT_MS = Number(process.env.RUN_TIMEOUT_MS || 360000);
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 30000);
const MEDIA_OPENAI_TIMEOUT_MS = Number(process.env.MEDIA_OPENAI_TIMEOUT_MS || 30000);
const CONTEXT_ARCHIVE_TIMEOUT_MS = Number(process.env.CONTEXT_ARCHIVE_TIMEOUT_MS || 20000);
const WEATHER_REQUEST_SPACING_MS = 350;
const MATCH_WINDOW_DAYS = Number(process.env.MATCH_WINDOW_DAYS || 3);
const MATCH_HIDE_AFTER_HOURS = Number(process.env.MATCH_HIDE_AFTER_HOURS || 8);
const MATCH_SCHEDULE_LOOKBACK_DAYS = Number(process.env.MATCH_SCHEDULE_LOOKBACK_DAYS || 1);
const MATCH_LIVE_GRACE_HOURS = Number(process.env.MATCH_LIVE_GRACE_HOURS || 8);
const H2H_WINDOW_YEARS = Number(process.env.H2H_WINDOW_YEARS || 20);
const RECENT_FORM_LIMIT = Number(process.env.RECENT_FORM_LIMIT || 5);
const SOURCE_SYNC_CONCURRENCY = Number(process.env.SOURCE_SYNC_CONCURRENCY || 3);
const SOURCE_REQUEST_SPACING_MS = Number(process.env.SOURCE_REQUEST_SPACING_MS || 250);
const ESPN_WORLDCUP_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
const ESPN_ALL_SOCCER_TEAM_SCHEDULE = "https://site.api.espn.com/apis/site/v2/sports/soccer/all/teams";
const ESPN_SEARCH_API = "https://site.web.api.espn.com/apis/search/v2";
const GUARDIAN_SEARCH_API = "https://content.guardianapis.com/search";
const MEDIA_SCORE_PARSER_VERSION = "2026-07-11-strict-score-cue-v2";

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
  "Estadio Azteca": { latitude: 19.3029, longitude: -99.1505, label: "Estadio Azteca, Mexico City" },
  "墨西哥城": { latitude: 19.4326, longitude: -99.1332, label: "墨西哥城" },
  "瓜达拉哈拉/萨波潘": { latitude: 20.6597, longitude: -103.3496, label: "瓜达拉哈拉/萨波潘" },
  "待确认": null
};

const CITY_COORDINATES = {
  Toronto: VENUE_COORDINATES["BMO Field"],
  "Inglewood, California": VENUE_COORDINATES["SoFi Stadium"],
  "Santa Clara, California": VENUE_COORDINATES["Levi's Stadium"],
  "East Rutherford, New Jersey": VENUE_COORDINATES["MetLife Stadium"],
  "Foxborough, Massachusetts": VENUE_COORDINATES["Gillette Stadium"],
  Vancouver: VENUE_COORDINATES["BC Place"],
  "Houston, Texas": VENUE_COORDINATES["NRG Stadium"],
  "Arlington, Texas": VENUE_COORDINATES["AT&T Stadium"],
  "Philadelphia, Pennsylvania": VENUE_COORDINATES["Lincoln Financial Field"],
  Guadalupe: VENUE_COORDINATES["Estadio BBVA"],
  "Atlanta, Georgia": VENUE_COORDINATES["Mercedes-Benz Stadium"],
  "Seattle, Washington": VENUE_COORDINATES["Lumen Field"],
  "Miami Gardens, Florida": VENUE_COORDINATES["Hard Rock Stadium"]
};

const TEAM_SEARCH_NAMES = {
  MEX: "Mexico",
  RSA: "South Africa",
  KOR: "South Korea",
  CZE: "Czech Republic",
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

const ESPN_TEAM_IDS = {
  ARG: "202",
  MEX: "203",
  CAN: "206",
  COL: "208",
  URU: "212",
  ENG: "448",
  CZE: "450",
  KOR: "451",
  BIH: "452",
  BEL: "459",
  NOR: "464",
  RSA: "467",
  IRN: "469",
  AUT: "474",
  SUI: "475",
  CRO: "477",
  SEN: "654",
  POR: "482",
  KSA: "655",
  ESP: "164",
  USA: "660",
  BRA: "205",
  FRA: "478",
  GER: "481",
  NED: "449",
  JPN: "627",
  MAR: "2869",
  AUS: "628",
  SCO: "580",
  TUR: "465",
  ECU: "209",
  SWE: "466",
  TUN: "659",
  CPV: "2597",
  EGY: "2620",
  NZL: "2666",
  IRQ: "4375",
  QAT: "4398",
  PAR: "210",
  HAI: "2654",
  CIV: "4789",
  CUW: "11678",
  ALG: "624",
  JOR: "2917",
  COD: "2850",
  GHA: "4469",
  PAN: "2659",
  UZB: "2570"
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

const ARTICLE_DOMAINS = [
  "fifa.com",
  "espn.com",
  "espn.co.uk",
  "si.com",
  "sportingnews.com",
  "sportsmole.co.uk",
  "rotowire.com",
  "covers.com",
  "theanalyst.com",
  "theguardian.com",
  "bbc.com",
  "bbc.co.uk",
  "talksport.com",
  "skysports.com",
  "sportskeeda.com",
  "worldsoccer.com",
  "soccerway.com",
  "worldfootball.net",
  "11v11.com",
  "transfermarkt.com",
  "fotmob.com",
  "101greatgoals.com",
  "futbolupdate.com",
  "goal.com",
  "cbssports.com",
  "reuters.com",
  "apnews.com",
  "nytimes.com",
  "theathletic.com",
  "washingtonpost.com",
  "houstonchronicle.com",
  "nbcsports.com",
  "aljazeera.com",
  "standard.co.uk",
  "independent.co.uk",
  "yahoo.com",
  "aol.com",
  "365scores.com"
];

const MEDIA_NEUTRAL_DOMAINS = [
  "fifa.com",
  "espn.com",
  "espn.co.uk",
  "theguardian.com",
  "bbc.com",
  "bbc.co.uk",
  "reuters.com",
  "apnews.com",
  "skysports.com",
  "theanalyst.com",
  "cbssports.com",
  "nytimes.com",
  "theathletic.com",
  "washingtonpost.com",
  "houstonchronicle.com",
  "nbcsports.com",
  "aljazeera.com",
  "independent.co.uk",
  "standard.co.uk"
];

const MEDIA_MARKET_DOMAINS = [
  "talksport.com",
  "sportsmole.co.uk",
  "covers.com",
  "sportskeeda.com",
  "sportingnews.com",
  "si.com",
  "rotowire.com",
  "goal.com",
  "101greatgoals.com"
];

const MEDIA_EXCLUDED_DOMAINS = [
  "duckduckgo.com",
  "r.jina.ai",
  "polymarket.com",
  "x.com",
  "twitter.com",
  "facebook.com",
  "reddit.com"
];

const MEDIA_SIGNAL_KEYWORDS = [
  "preview",
  "analysis",
  "tactics",
  "form",
  "fitness",
  "injury",
  "suspended",
  "team news",
  "lineup",
  "line-up",
  "pressing",
  "transition",
  "counter",
  "defence",
  "defense",
  "goalkeeper",
  "BTTS",
  "both teams to score",
  "over 2.5",
  "under 2.5",
  "predicted score",
  "score prediction",
  "prediction",
  "we say",
  "our prediction",
  "extra time",
  "penalties",
  "淘汰赛",
  "战术",
  "状态",
  "伤停",
  "首发",
  "防守",
  "门将"
];

const DIRECT_MATCH_SOURCES = {
  "2026-06-12-mex-rsa": [
    {
      name: "Sports Mole 赛前前瞻",
      url: "https://www.sportsmole.co.uk/football/mexico/world-cup-2026/preview/mexico-vs-south-africa-prediction-team-news-lineups_598869.html"
    },
    {
      name: "Sports Mole 伤停与预计首发",
      url: "https://www.sportsmole.co.uk/football/mexico/world-cup-2026/injury-news/team-news/mexico-vs-south-africa-injury-suspension-list-predicted-xis_598872.html"
    },
    {
      name: "ESPN 赛前信息",
      url: "https://www.espn.co.uk/espn/story/_/id/48998339/mexico-vs-south-africa-kick-team-news-how-watch-fifa-world-cup-opener"
    }
  ],
  "2026-06-12-kor-cze": [
    {
      name: "Covers 赛前赔率与预计阵容",
      url: "https://www.covers.com/world-cup/south-korea-vs-czechia-prediction-picks-odds-thursday-6-11-2026"
    },
    {
      name: "RotoWire 赛前前瞻",
      url: "https://www.rotowire.com/soccer/article/south-korea-vs-czechia-preview-prediction-lineups-odds-2026-world-cup-group-a-117538"
    },
    {
      name: "Al Jazeera 阵容前瞻",
      url: "https://www.aljazeera.com/sports/2026/6/11/south-korea-vs-czechia-world-cup-group-match-teams-start-and-lineups"
    },
    {
      name: "ESPN 赛前信息",
      url: "https://www.espn.co.uk/football/story/_/id/49009977/fifa-world-cup-2026-south-korea-vs-czechia-kickoff-how-watch-stats-team-news"
    }
  ]
};

let envFileCache = null;
let codexOpenAiConfigCache = null;
let weatherQueue = Promise.resolve();
const weatherCache = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

async function readEnvFile() {
  if (envFileCache) return envFileCache;
  const env = {};
  try {
    const raw = await fs.readFile(ENV_PATH, "utf8");
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
  } catch {
    // Optional file.
  }
  envFileCache = env;
  return env;
}

function tomlStringValue(raw, key) {
  const pattern = new RegExp(`^\\s*${key}\\s*=\\s*["']([^"']+)["']\\s*$`, "m");
  const match = String(raw || "").match(pattern);
  return match ? match[1] : "";
}

async function readCodexOpenAiConfig() {
  if (codexOpenAiConfigCache) return codexOpenAiConfigCache;
  const config = {};
  try {
    const rawConfig = await fs.readFile(CODEX_CONFIG_PATH, "utf8");
    config.model = tomlStringValue(rawConfig, "model") || "";
    config.baseUrl = tomlStringValue(rawConfig, "base_url") || "";
  } catch {
    // Optional Codex config.
  }
  try {
    const rawAuth = await fs.readFile(CODEX_AUTH_PATH, "utf8");
    const auth = JSON.parse(rawAuth);
    config.apiKey = auth.OPENAI_API_KEY || auth.openai_api_key || "";
  } catch {
    // Optional Codex auth.
  }
  codexOpenAiConfigCache = config;
  return config;
}

async function getOpenAiConfig() {
  const env = await readEnvFile();
  const codex = await readCodexOpenAiConfig();
  const config = {
    apiKey: process.env.OPENAI_API_KEY || env.OPENAI_API_KEY || codex.apiKey || "",
    model: process.env.OPENAI_MODEL || env.OPENAI_MODEL || codex.model || "gpt-4o-mini",
    baseUrl: (process.env.OPENAI_BASE_URL || env.OPENAI_BASE_URL || codex.baseUrl || "https://api.openai.com").replace(/\/+$/, "")
  };
  if (process.env.DEBUG_OPENAI_CONFIG === "1") {
    console.error(JSON.stringify({
      envPath: ENV_PATH,
      codexConfigPath: CODEX_CONFIG_PATH,
      codexAuthPath: CODEX_AUTH_PATH,
      hasProcessKey: Boolean(process.env.OPENAI_API_KEY),
      envKeys: Object.keys(env),
      hasCodexKey: Boolean(codex.apiKey),
      keyLen: config.apiKey.length,
      model: config.model,
      baseUrl: config.baseUrl
    }));
  }
  return config;
}

function shanghaiIso(now = new Date()) {
  const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return `${shifted.toISOString().slice(0, 19)}+08:00`;
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

async function readJson(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function timedFetchText(url, options = {}) {
  const timeoutMs = options.timeoutMs || FETCH_TIMEOUT_MS;
  const { timeoutMs: _timeoutMs, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        "accept": "text/html,application/json,text/plain,*/*",
        "user-agent": "worldcup-ai-analysis-platform/0.1",
        ...(fetchOptions.headers || {})
      }
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 120)}`);
    return { ok: true, latencyMs: Date.now() - startedAt, text, url };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: error.name === "AbortError" ? "timeout" : error.message,
      url
    };
  } finally {
    clearTimeout(timeout);
  }
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      setTimeout(() => resolve({ ok: false, error: `${label} timeout` }), ms);
    })
  ]);
}

async function timedFetchJson(url, options = {}) {
  const { timeoutMs, ...restOptions } = options;
  const result = await timedFetchText(url, {
    ...restOptions,
    timeoutMs,
    headers: {
      "accept": "application/json,text/plain,*/*",
      ...(restOptions.headers || {})
    }
  });
  if (!result.ok) return result;
  try {
    return { ...result, data: result.text ? JSON.parse(result.text) : null };
  } catch (error) {
    return { ok: false, latencyMs: result.latencyMs, error: `JSON parse failed: ${error.message}`, url };
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

function lookupVenueCoordinates(match) {
  const candidates = [
    match.venueInfo?.name,
    match.venue,
    match.venueInfo?.city,
    String(match.venue || "").split(",")[0]
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (VENUE_COORDINATES[candidate]) return VENUE_COORDINATES[candidate];
    if (CITY_COORDINATES[candidate]) return CITY_COORDINATES[candidate];
  }
  return null;
}

async function fetchScheduleWindow(now = new Date()) {
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
      error: result.error,
      matches: []
    };
  }
  const events = Array.isArray(result.data?.events) ? result.data.events : [];
  return {
    ok: true,
    source: "ESPN FIFA World Cup scoreboard",
    url,
    matches: events.map((event) => {
      const competition = event.competitions?.[0] || {};
      const competitors = Array.isArray(competition.competitors) ? competition.competitors : [];
      const home = competitors.find((item) => item.homeAway === "home") || competitors[0] || {};
      const away = competitors.find((item) => item.homeAway === "away") || competitors[1] || {};
      const venue = normalizedVenueInfo(competition.venue || event.venue || {});
      return {
        scheduleId: String(event.id || ""),
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
    })
  };
}

function scheduleMatchFromEvent(event) {
  const kickoffMs = dateMs(event.kickoffUtc);
  if (!kickoffMs || !shouldKeepScheduledMatch(event.kickoffUtc, event)) return null;
  if (event.completed || isFinishedStatus(event.status)) return null;
  const homeCode = String(event.home?.code || "").toUpperCase();
  const awayCode = String(event.away?.code || "").toUpperCase();
  return {
    id: `schedule-${event.scheduleId || scheduleEventKey(event)}`,
    autoBaseline: true,
    home: homeCode,
    away: awayCode,
    homeName: TEAM_DISPLAY_NAMES_ZH[homeCode] || event.home?.name || TEAM_SEARCH_NAMES[homeCode] || "TBD",
    awayName: TEAM_DISPLAY_NAMES_ZH[awayCode] || event.away?.name || TEAM_SEARCH_NAMES[awayCode] || "TBD",
    homeEnglishName: TEAM_SEARCH_NAMES[homeCode] || event.home?.name || "",
    awayEnglishName: TEAM_SEARCH_NAMES[awayCode] || event.away?.name || "",
    kickoffLocal: event.kickoffUtc,
    kickoffShanghai: new Date(kickoffMs).toISOString(),
    venue: venueLabel(event.venue),
    venueInfo: event.venue || {},
    model: {
      lambdaHome: 1.1,
      lambdaAway: 1.0,
      manualAdjustments: []
    }
  };
}

async function buildSyncMatches(dashboard) {
  const schedule = await fetchScheduleWindow();
  const staticMatches = (dashboard.matches || []).map((match) => {
    const homeTeam = dashboard.teams[match.home] || {};
    const awayTeam = dashboard.teams[match.away] || {};
    return {
      ...match,
      homeName: homeTeam.name || TEAM_SEARCH_NAMES[match.home] || match.home,
      awayName: awayTeam.name || TEAM_SEARCH_NAMES[match.away] || match.away
    };
  });
  const modeledKeys = new Set(staticMatches.map((match) => matchScheduleKey(TEAM_SEARCH_NAMES[match.home] || match.homeName, TEAM_SEARCH_NAMES[match.away] || match.awayName)));
  const scheduleMatches = (schedule.matches || [])
    .map(scheduleMatchFromEvent)
    .filter(Boolean)
    .filter((match) => !modeledKeys.has(matchScheduleKey(match.homeEnglishName || match.homeName, match.awayEnglishName || match.awayName)));
  return {
    schedule,
    matches: [...staticMatches, ...scheduleMatches]
  };
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function textFromHtml(html) {
  return stripHtml(html)
    .replace(/\*+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractRelevantSentences(text, needles, maxItems = 5) {
  const clean = stripHtml(text);
  if (!clean) return [];
  const sentences = clean
    .split(/(?<=[.!?。！？])\s+|\s{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
  const lowerNeedles = needles.map((needle) => needle.toLowerCase());
  const matches = sentences.filter((sentence) => {
    const lower = sentence.toLowerCase();
    return lowerNeedles.some((needle) => lower.includes(needle));
  });
  return matches.slice(0, maxItems).map((item) => item.slice(0, 220));
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeDuckDuckGoUrl(rawUrl) {
  try {
    const decoded = decodeHtmlEntities(decodeURIComponent(rawUrl));
    const parsed = new URL(decoded, "https://duckduckgo.com");
    const uddg = parsed.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : decoded;
  } catch {
    return "";
  }
}

function extractSearchLinks(text, limit = 4) {
  const links = [];
  const patterns = [
    /href="([^"]+)"/gi,
    /\]\((https?:\/\/[^)]+)\)/g,
    /(https?%3A%2F%2F[^&\s)"]+)/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const url = normalizeDuckDuckGoUrl(match[1]);
      if (!url || !/^https?:\/\//i.test(url)) continue;
      if (!ARTICLE_DOMAINS.some((domain) => url.includes(domain))) continue;
      if (links.includes(url)) continue;
      links.push(url);
      if (links.length >= limit) return links;
    }
  }

  return links;
}

function extractArticleLinks(text, limit = 6) {
  const links = [];
  const patterns = [
    /\]\((https?:\/\/[^)]+)\)/g,
    /href="([^"]+)"/gi,
    /(https?:\/\/[^\s)"'<]+)\b/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const url = normalizeDuckDuckGoUrl(match[1]);
      if (!url || !/^https?:\/\//i.test(url)) continue;
      const lower = url.toLowerCase();
      if (!ARTICLE_DOMAINS.some((domain) => lower.includes(domain))) continue;
      if (!/(lineup|line-up|predicted|team-news|injury|preview|xi|阵容)/i.test(url)) continue;
      if (links.includes(url)) continue;
      links.push(url);
      if (links.length >= limit) return links;
    }
  }

  return links;
}

function uniqueUrls(urls, limit) {
  const seen = new Set();
  const out = [];
  for (const raw of urls) {
    const url = normalizeDuckDuckGoUrl(raw);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (limit && out.length >= limit) break;
  }
  return out;
}

function clampValue(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(min, Math.min(max, numeric));
}

function hostnameFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function domainMatches(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function mediaSourceTier(url) {
  const hostname = hostnameFromUrl(url);
  if (!hostname) return "candidate";
  if (MEDIA_EXCLUDED_DOMAINS.some((domain) => domainMatches(hostname, domain))) return "excluded";
  if (MEDIA_NEUTRAL_DOMAINS.some((domain) => domainMatches(hostname, domain))) return "neutral";
  if (MEDIA_MARKET_DOMAINS.some((domain) => domainMatches(hostname, domain))) return "market-context";
  return "candidate";
}

function mediaTierWeight(tier) {
  if (tier === "neutral") return 3;
  if (tier === "candidate") return 2;
  if (tier === "market-context") return 1;
  return 0;
}

function mediaTitleFromText(text, fallback = "") {
  const head = String(text || "").slice(0, 900);
  const titleMatch = head.match(/(?:^|\n)\s*Title:\s*([^\n]+)/i);
  if (titleMatch) return titleMatch[1].replace(/\s+/g, " ").trim().slice(0, 140);
  const firstLine = head.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length >= 12);
  return (firstLine || fallback || "公开媒体来源").replace(/\s+/g, " ").trim().slice(0, 140);
}

function teamSearchNeedles(match) {
  return [
    match.homeName,
    match.awayName,
    match.homeEnglishName || TEAM_SEARCH_NAMES[match.home] || match.homeName,
    match.awayEnglishName || TEAM_SEARCH_NAMES[match.away] || match.awayName,
    TEAM_SEARCH_NAMES[match.home],
    TEAM_SEARCH_NAMES[match.away],
    match.home,
    match.away
  ].filter(Boolean);
}

function textMentionsMatchTeams(text, match) {
  const lower = String(text || "").toLowerCase();
  const homeNeedles = [match.homeName, match.homeEnglishName, TEAM_SEARCH_NAMES[match.home], match.home]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  const awayNeedles = [match.awayName, match.awayEnglishName, TEAM_SEARCH_NAMES[match.away], match.away]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  return homeNeedles.some((needle) => lower.includes(needle)) && awayNeedles.some((needle) => lower.includes(needle));
}

function teamAliasesForMatch(match, side) {
  return side === "home"
    ? [match.homeName, match.homeEnglishName, TEAM_SEARCH_NAMES[match.home], match.home]
    : [match.awayName, match.awayEnglishName, TEAM_SEARCH_NAMES[match.away], match.away];
}

function containsAnyAlias(text, aliases) {
  const lower = String(text || "").toLowerCase();
  return aliases.filter(Boolean).some((alias) => lower.includes(String(alias).toLowerCase()));
}

function mediaArticleMatchScore(match, { title = "", url = "", text = "" } = {}) {
  const homeAliases = teamAliasesForMatch(match, "home");
  const awayAliases = teamAliasesForMatch(match, "away");
  const titleUrl = `${title} ${url}`;
  const full = `${titleUrl} ${text}`;
  let score = 0;
  if (containsAnyAlias(titleUrl, homeAliases) && containsAnyAlias(titleUrl, awayAliases)) score += 10;
  if (containsAnyAlias(url, homeAliases) && containsAnyAlias(url, awayAliases)) score += 6;
  if (containsAnyAlias(full, homeAliases) && containsAnyAlias(full, awayAliases)) score += 2;
  if (/(preview|quarter-final|semi-final|world cup|team news|lineup|line-up|how to watch|v-|vs| v )/i.test(titleUrl)) score += 1;
  return score;
}

function rankMediaResultsByMatch(results, match, { limit = 4 } = {}) {
  const ranked = results
    .map((item) => ({
      item,
      score: mediaArticleMatchScore(match, {
        title: item.name || item.title || "",
        url: item.originalUrl || item.url || "",
        text: item.cleanText || item.text || ""
      })
    }))
    .filter((entry) => entry.score >= 2)
    .sort((a, b) => b.score - a.score);
  const hasFocused = ranked.some((entry) => entry.score >= 10);
  return ranked
    .filter((entry) => !hasFocused || entry.score >= 10)
    .slice(0, limit)
    .map((entry) => entry.item);
}

function buildMediaCandidates(match, preview) {
  const candidates = [];
  const seen = new Set();
  const needles = [...teamSearchNeedles(match), ...MEDIA_SIGNAL_KEYWORDS];
  const pushCandidate = ({ url, text, name = "", sourceType = "article", allowQueryMatch = false }) => {
    const originalUrl = url || "";
    const tier = mediaSourceTier(originalUrl);
    if (tier === "excluded") return;
    const cleanText = stripHtml(text || "");
    if (!cleanText || cleanText.length < 120) return;
    if (!allowQueryMatch && !textMentionsMatchTeams(`${name}\n${cleanText}`, match)) return;
    const key = originalUrl || `${sourceType}:${name}:${cleanText.slice(0, 80)}`;
    if (seen.has(key)) return;
    seen.add(key);
    const relevant = extractRelevantSentences(cleanText, needles, 5);
    const snippet = (relevant.length ? relevant.join(" ") : cleanText.slice(0, 520)).replace(/\s+/g, " ").trim();
    candidates.push({
      title: mediaTitleFromText(cleanText, name),
      url: originalUrl,
      domain: hostnameFromUrl(originalUrl),
      tier,
      sourceType,
      weight: mediaTierWeight(tier),
      snippet: snippet.slice(0, 760),
      fullText: cleanText.slice(0, 3600)
    });
  };

  for (const result of preview.direct?.results || []) {
    if (!result.ok) continue;
    pushCandidate({
      url: result.originalUrl || result.url,
      text: result.cleanText || result.text,
      name: result.name || "",
      sourceType: "direct"
    });
  }

  for (const result of preview.mediaDiscovery?.results || []) {
    if (!result.ok) continue;
    pushCandidate({
      url: result.originalUrl || result.url,
      text: result.cleanText || result.text,
      name: result.name || "",
      sourceType: result.sourceType || "direct-media"
    });
  }

  for (const article of preview.articles || []) {
    if (!article.ok) continue;
    pushCandidate({
      url: article.originalUrl || article.url,
      text: article.text,
      sourceType: "article"
    });
  }

  for (const search of preview.searches || []) {
    if (candidates.length >= 6) break;
    if (!search.ok) continue;
    const links = extractSearchLinks(search.text || "", 3).filter((url) => mediaSourceTier(url) !== "excluded");
    const queryMentionsTeams = textMentionsMatchTeams(search.queryText || "", match);
    pushCandidate({
      url: links[0] || "",
      text: `${search.queryText || ""}\n${search.text || ""}`,
      name: search.queryText || "公开搜索摘要",
      sourceType: "search-snippet",
      allowQueryMatch: queryMentionsTeams
    });
  }

  if (!candidates.length && Array.isArray(preview.snippets)) {
    const combined = preview.snippets.filter(Boolean).join(" ");
    if (combined.length >= 120) {
      pushCandidate({
        url: preview.url || "",
        text: `${match.homeName} vs ${match.awayName}\n${combined}`,
        name: `${match.homeName} vs ${match.awayName} 公开搜索摘要`,
        sourceType: "search-snippet",
        allowQueryMatch: true
      });
    }
  }

  return candidates
    .sort((a, b) => b.weight - a.weight || b.snippet.length - a.snippet.length)
    .slice(0, 8);
}

function readableProxyUrl(url) {
  return `https://r.jina.ai/http://${url.replace(/^https?:\/\//i, "")}`;
}

function isSearchProxyUrl(url) {
  const value = String(url || "").toLowerCase();
  return value.includes("duckduckgo.com") || value.includes("r.jina.ai/http://duckduckgo.com");
}

function isBlockedSearchText(text) {
  const lower = String(text || "").toLowerCase();
  return lower.includes("authenticationrequirederror")
    || lower.includes("you have been blocked")
    || lower.includes("status\":40103")
    || lower.includes("http 401:");
}

async function fetchReadableArticle(url) {
  const proxiedUrl = readableProxyUrl(url);
  const result = await withTimeout(timedFetchText(proxiedUrl), FETCH_TIMEOUT_MS + 1500, "article");
  if (!result.ok) return { ...result, originalUrl: url };
  return {
    ...result,
    originalUrl: url,
    text: stripHtml(result.text).slice(0, 7000)
  };
}

async function fetchDirectSources(match) {
  const sources = DIRECT_MATCH_SOURCES[match.id] || [];
  const results = await Promise.all(sources.map(async (source) => {
    const result = await withTimeout(timedFetchText(source.url, { timeoutMs: FETCH_TIMEOUT_MS + 4000 }), FETCH_TIMEOUT_MS + 5000, source.name);
    if (!result.ok) return { ...result, name: source.name, originalUrl: source.url, cleanText: "" };
    return {
      ...result,
      name: source.name,
      originalUrl: source.url,
      cleanText: textFromHtml(result.text).slice(0, 12000)
    };
  }));
  return {
    ok: results.some((result) => result.ok),
    results,
    text: results.filter((result) => result.ok).map((result) => `${result.name}: ${result.cleanText}`).join("\n")
  };
}

function matchEnglishNames(match) {
  return {
    home: match.homeEnglishName || TEAM_SEARCH_NAMES[match.home] || match.homeName,
    away: match.awayEnglishName || TEAM_SEARCH_NAMES[match.away] || match.awayName
  };
}

function publicMediaQuery(match) {
  const names = matchEnglishNames(match);
  return `${names.home} ${names.away} World Cup`;
}

function mediaDiscoveryResult({ name, originalUrl, cleanText, sourceType }) {
  return {
    ok: true,
    name,
    originalUrl,
    cleanText: textFromHtml(cleanText).slice(0, 12000),
    sourceType
  };
}

async function fetchGuardianMediaSources(match) {
  const query = publicMediaQuery(match);
  const params = new URLSearchParams({
    q: query,
    section: "football",
    "show-fields": "trailText,bodyText,standfirst",
    "order-by": "relevance",
    "page-size": "6",
    "api-key": process.env.GUARDIAN_API_KEY || "test"
  });
  const url = `${GUARDIAN_SEARCH_API}?${params.toString()}`;
  const result = await withTimeout(timedFetchJson(url, { timeoutMs: FETCH_TIMEOUT_MS + 2500 }), FETCH_TIMEOUT_MS + 3500, "guardian media");
  if (!result.ok) {
    return { ok: false, source: "Guardian Content API", url, error: result.error || "Guardian search failed", results: [], text: "" };
  }
  const rows = Array.isArray(result.data?.response?.results) ? result.data.response.results : [];
  const rawResults = rows.map((item) => {
    const fields = item.fields || {};
    const cleanText = [
      item.webTitle,
      fields.standfirst,
      fields.trailText,
      fields.bodyText
    ].filter(Boolean).join("\n");
    return mediaDiscoveryResult({
      name: `Guardian: ${item.webTitle || "World Cup preview"}`,
      originalUrl: item.webUrl,
      cleanText,
      sourceType: "guardian-api"
    });
  }).filter((item) => item.originalUrl && item.cleanText && textMentionsMatchTeams(`${item.name}\n${item.cleanText}`, match));
  const results = rankMediaResultsByMatch(rawResults, match, { limit: 3 });
  return {
    ok: results.length > 0,
    source: "Guardian Content API",
    url,
    error: results.length ? "" : "Guardian 未返回同时命中两队的文章",
    results,
    text: results.map((item) => `${item.name}: ${item.cleanText}`).join("\n")
  };
}

function flattenEspnSearchContents(results) {
  const contents = [];
  const visit = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (typeof node !== "object") return;
    if (node.type || node.headline || node.title || node.description) contents.push(node);
    if (Array.isArray(node.contents)) visit(node.contents);
    if (Array.isArray(node.children)) visit(node.children);
  };
  visit(results);
  return contents;
}

async function fetchEspnMediaSources(match) {
  const query = publicMediaQuery(match);
  const params = new URLSearchParams({ query, limit: "8" });
  const url = `${ESPN_SEARCH_API}?${params.toString()}`;
  const result = await withTimeout(timedFetchJson(url, { timeoutMs: FETCH_TIMEOUT_MS + 2500 }), FETCH_TIMEOUT_MS + 3500, "espn media");
  if (!result.ok) {
    return { ok: false, source: "ESPN Search API", url, error: result.error || "ESPN search failed", results: [], text: "" };
  }
  const contents = flattenEspnSearchContents(result.data?.results || []);
  const seen = new Set();
  const rawResults = [];
  for (const item of contents) {
    const originalUrl = item.link?.web || item.links?.web?.href || item.url || "";
    if (!originalUrl || seen.has(originalUrl)) continue;
    const cleanText = [
      item.headline,
      item.title,
      item.displayName,
      item.description,
      item.summary
    ].filter(Boolean).join("\n");
    if (!cleanText || !textMentionsMatchTeams(`${cleanText}\n${query}`, match)) continue;
    seen.add(originalUrl);
    rawResults.push(mediaDiscoveryResult({
      name: `ESPN: ${item.headline || item.title || "World Cup preview"}`,
      originalUrl,
      cleanText,
      sourceType: "espn-search-api"
    }));
  }
  const results = rankMediaResultsByMatch(rawResults, match, { limit: 4 });
  return {
    ok: results.length > 0,
    source: "ESPN Search API",
    url,
    error: results.length ? "" : "ESPN 未返回同时命中两队的文章",
    results,
    text: results.map((item) => `${item.name}: ${item.cleanText}`).join("\n")
  };
}

async function fetchMediaDiscoverySources(match) {
  const [guardian, espn] = await Promise.all([
    fetchGuardianMediaSources(match),
    fetchEspnMediaSources(match)
  ]);
  const results = rankMediaResultsByMatch([...(guardian.results || []), ...(espn.results || [])], match, { limit: 6 });
  return {
    ok: results.length > 0,
    source: "direct-media-discovery",
    results,
    providers: { guardian, espn },
    text: results.map((item) => `${item.name}: ${item.cleanText}`).join("\n"),
    errors: [guardian, espn].filter((item) => !item.ok).map((item) => `${item.source}: ${item.error}`).filter(Boolean)
  };
}

function looksLikeConfirmedLineup(text) {
  const lower = stripHtml(text).toLowerCase();
  return ["confirmed lineup", "confirmed line-up", "official lineup", "official line-up", "starting xi confirmed", "官方首发"].some((needle) => lower.includes(needle));
}

function isStrongInjurySnippet(snippet) {
  const lower = snippet.toLowerCase();
  const genericSearchNoise = [
    "duckduckgo",
    "url source",
    "markdown content",
    "preview lineups injuries",
    "prediction and lineups",
    "predictions and lineups",
    "query="
  ];
  if (genericSearchNoise.some((needle) => lower.includes(needle))) return false;
  return [
    "ruled out",
    "will miss",
    "misses out",
    "doubtful",
    "suspended",
    "injured",
    "injury doubt",
    "停赛",
    "缺阵",
    "伤缺",
    "受伤"
  ].some((needle) => lower.includes(needle));
}

function isUsableTeamNewsSnippet(snippet) {
  const lower = snippet.toLowerCase();
  const noise = [
    "duckduckgo",
    "url source",
    "markdown content",
    "preview lineups injuries",
    "query="
  ];
  if (noise.some((needle) => lower.includes(needle))) return false;
  return snippet.length >= 40;
}

function hasProjectedLineupText(text) {
  const lower = String(text || "").toLowerCase();
  return [
    "possible starting lineup",
    "possible starting lineups",
    "projected lineup",
    "projected lineups",
    "predicted xi",
    "predicted xis",
    "predicted lineup",
    "predicted lineups",
    "预计首发",
    "预测首发"
  ].some((needle) => lower.includes(needle));
}

function hasConfirmedLineupText(text) {
  const lower = String(text || "").toLowerCase();
  return [
    "confirmed lineup",
    "confirmed line-up",
    "official lineup",
    "official line-up",
    "starting xi confirmed",
    "starting xis",
    "today's starting xis",
    "官方首发"
  ].some((needle) => lower.includes(needle));
}

function hasUsableInjuryText(text) {
  const lower = String(text || "").toLowerCase();
  return [
    "no key injuries to report",
    "injury and suspension",
    "injury/suspension",
    "injury news",
    "suspension list",
    "ruled out",
    "will miss",
    "doubtful",
    "suspended",
    "伤停",
    "停赛",
    "缺阵"
  ].some((needle) => lower.includes(needle));
}

function isBadInjurySection(section) {
  const lower = String(section || "").toLowerCase();
  return !section || (
    lower.includes("premier league news") &&
    lower.includes("champions league") &&
    lower.includes("player stats")
  );
}

function cleanInjurySection(section) {
  const clean = String(section || "").replace(/\s+/g, " ").trim();
  if (isBadInjurySection(clean)) return "";
  const noKey = clean.match(/no key injuries to report[^.。]*(?:[.。]|$)/i);
  if (noKey) return noKey[0].trim();
  return clean.slice(0, 420);
}

function extractSection(text, patterns, maxLength = 700) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  const lower = clean.toLowerCase();
  for (const pattern of patterns) {
    const index = lower.indexOf(pattern.toLowerCase());
    if (index >= 0) return clean.slice(index, index + maxLength);
  }
  return "";
}

function cleanLineupSection(section) {
  return String(section || "")
    .replace(/Featured Betting Offer[\s\S]*/i, "")
    .replace(/Title: .*$/i, "")
    .replace(/Warning: .*$/i, "")
    .replace(/GET IT HERE[\s\S]*/i, "")
    .replace(/\*\*/g, "")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 520);
}

function stopLineupIndex(after) {
  const lower = String(after || "").toLowerCase();
  const stops = [
    /\n\s*(?:\*\*)?(?:[a-z][a-z\s.'()-]{1,45})\s+(?:xi|starting xi|predicted xi|possible starting lineup|projected lineup|predicted lineup)(?:\*\*)?\s*:/i,
    /\n\s*more about\b/i,
    /\n\s*read more\b/i,
    /\n\s*related articles\b/i,
    /\n\s*featured betting offer\b/i,
    /\n\s*we say\b/i,
    /\n\s*title:/i,
    /\n\s*warning:/i,
    /\n\s*###\s+/i,
    /\n\s*##\s+/i
  ];
  let end = after.length;
  for (const stop of stops) {
    const match = stop.exec(lower);
    if (match && match.index > 12) end = Math.min(end, match.index);
  }
  return end;
}

function cleanupPlayerName(value) {
  return String(value || "")
    .replace(/\[[^\]]+\]\([^)]*\)/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\([^)]*(?:injury|suspension|doubt|captain|goalkeeper|defender|midfielder|forward)[^)]*\)/gi, " ")
    .replace(/\b(?:gk|df|mf|fw|substitutes?|subs?|coach|manager|captain)\b:?/gi, " ")
    .replace(/^[\s*#\-–—:]+|[\s*#\-–—:.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function playerListFromText(value) {
  const cleaned = String(value || "")
    .replace(/\*\*/g, "")
    .replace(/\r/g, "\n")
    .replace(/\s+\|\s+/g, ", ")
    .replace(/\s+(?:and|&)\s+/gi, ", ");
  return cleaned
    .split(/[,;、\n]+/)
    .map(cleanupPlayerName)
    .filter((item) => item && item.length <= 42)
    .filter((item) => !/^(?:more about|read more|prediction|team news|injury|lineup|line-up|formation)$/i.test(item))
    .slice(0, 11);
}

function extractLabeledLineup(sourceText, labels) {
  const text = String(sourceText || "").replace(/\r/g, "\n");
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*:`, "i");
    const match = pattern.exec(text);
    if (!match) continue;
    const after = text.slice(match.index + match[0].length);
    const section = after.slice(0, stopLineupIndex(after));
    const players = playerListFromText(section);
    if (players.length >= 7) {
      return {
        note: cleanLineupSection(`${label}: ${players.join(", ")}`),
        xi: players
      };
    }
  }
  return null;
}

function extractTeamLineupNote(sourceText, teamName, teamCode) {
  const englishName = TEAM_SEARCH_NAMES[teamCode] || teamName;
  const labeled = extractLabeledLineup(sourceText, [
    `${englishName} XI`,
    `${teamName} XI`,
    `${englishName} starting XI`,
    `${teamName} starting XI`,
    `${englishName} predicted XI`,
    `${teamName} predicted XI`,
    `${englishName} possible starting lineup`,
    `${englishName} projected lineup`,
    `${englishName} predicted lineup`,
    `${teamName} possible starting lineup`,
    `${teamName} projected lineup`,
    `${teamName} predicted lineup`
  ]);
  if (labeled) return labeled.note;
  const clean = String(sourceText || "").replace(/\s+/g, " ");
  const patterns = [
    `${englishName} possible starting lineup:`,
    `${englishName} projected lineup:`,
    `${englishName} predicted lineup:`,
    `${englishName} probable lineup:`,
    `${englishName} predicted xi:`,
    `${englishName} xi:`,
    `${teamName} possible starting lineup:`
  ];
  const lower = clean.toLowerCase();
  for (const pattern of patterns) {
    const index = lower.indexOf(pattern.toLowerCase());
    if (index < 0) continue;
    let end = clean.length;
    const after = lower.slice(index + pattern.length);
    const stops = [
      " mexico possible starting lineup:",
      " south africa possible starting lineup:",
      " south korea possible starting lineup:",
      " czech republic possible starting lineup:",
      " czechia possible starting lineup:",
      " mexico projected lineup:",
      " south africa projected lineup:",
      " south korea projected lineup:",
      " czech republic projected lineup:",
      " czechia projected lineup:",
      " possible starting lineup:",
      " projected lineup:",
      " predicted lineup:",
      " predicted xi:",
      " featured betting offer",
      " we say:",
      " title:",
      " warning:"
    ];
    for (const stop of stops) {
      const stopIndex = after.indexOf(stop);
      if (stopIndex > 20) end = Math.min(end, index + pattern.length + stopIndex);
    }
    return cleanLineupSection(clean.slice(index, end));
  }
  return "";
}

function playerListFromNote(note) {
  const after = String(note || "").split(":").slice(1).join(":");
  if (!after) return [];
  return playerListFromText(after);
}

function summarizeNews(snippets, fallback) {
  if (!snippets.length) return fallback;
  return snippets.join(" / ").slice(0, 420);
}

function teamLabel(match, side) {
  const code = side === "home" ? match.home : match.away;
  const zhName = side === "home" ? match.homeName : match.awayName;
  const enName = side === "home" ? match.homeEnglishName : match.awayEnglishName;
  return `${zhName || TEAM_DISPLAY_NAMES_ZH[code] || code}（${enName || TEAM_SEARCH_NAMES[code] || code}）`;
}

function teamDisplayName(code, fallback = "") {
  const normalized = String(code || "").toUpperCase();
  return TEAM_DISPLAY_NAMES_ZH[normalized] || TEAM_SEARCH_NAMES[normalized] || fallback || normalized;
}

function rankingRecord(fifaRankings, code) {
  const normalized = String(code || "").toUpperCase();
  const rank = Number(fifaRankings?.rankings?.[normalized]);
  return Number.isFinite(rank) && rank > 0 ? rank : null;
}

function baselineRecentForm(match, side, fifaRankings, snippets = []) {
  const code = side === "home" ? match.home : match.away;
  const rank = rankingRecord(fifaRankings, code);
  const name = teamLabel(match, side);
  const notes = [];
  if (rank) notes.push(`${name} FIFA 排名第 ${rank}，作为长期实力基线输入。`);
  notes.push("已检索公开赛前信息；未抓到稳定可核验的近五场战绩接口时，不把近期状态强行加权。");
  const teamNeedles = [
    side === "home" ? match.homeName : match.awayName,
    side === "home" ? match.homeEnglishName : match.awayEnglishName
  ].filter(Boolean).map((item) => String(item).toLowerCase());
  const relevant = snippets.find((snippet) => {
    const lower = snippet.toLowerCase();
    return teamNeedles.some((needle) => lower.includes(needle)) && !isStrongInjurySnippet(snippet);
  });
  if (relevant) notes.push(`公开源摘要：${relevant.slice(0, 160)}`);
  return notes.slice(0, 3);
}

function scoreValue(score) {
  if (score && typeof score === "object") {
    const value = Number(score.value ?? score.displayValue);
    return Number.isFinite(value) ? value : null;
  }
  const value = Number(score);
  return Number.isFinite(value) ? value : null;
}

function resultFromGoals(goalsFor, goalsAgainst) {
  if (!Number.isFinite(goalsFor) || !Number.isFinite(goalsAgainst)) return "unknown";
  if (goalsFor > goalsAgainst) return "W";
  if (goalsFor < goalsAgainst) return "L";
  return "D";
}

function summarizeFormResults(matches) {
  const summary = {
    matches: matches.length,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0
  };
  for (const match of matches) {
    if (match.result === "W") summary.wins += 1;
    else if (match.result === "D") summary.draws += 1;
    else if (match.result === "L") summary.losses += 1;
    if (Number.isFinite(match.goalsFor)) summary.goalsFor += match.goalsFor;
    if (Number.isFinite(match.goalsAgainst)) summary.goalsAgainst += match.goalsAgainst;
  }
  return summary;
}

function normalizeTeamScheduleEvent(event, teamCode) {
  const competition = event.competitions?.[0] || {};
  const competitors = Array.isArray(competition.competitors) ? competition.competitors : [];
  const team = competitors.find((item) => String(item.team?.abbreviation || "").toUpperCase() === teamCode);
  if (!team) return null;
  const opponent = competitors.find((item) => item !== team);
  if (!opponent) return null;
  const goalsFor = scoreValue(team.score);
  const goalsAgainst = scoreValue(opponent.score);
  if (!Number.isFinite(goalsFor) || !Number.isFinite(goalsAgainst)) return null;
  const status = competition.status?.type || event.status?.type || {};
  if (!status.completed && !isFinishedStatus(status.name || status.state || status.description)) return null;
  const teamSlug = encodeURIComponent(TEAM_SEARCH_NAMES[teamCode] || teamCode);
  return {
    date: String(event.date || "").slice(0, 10),
    competition: event.league?.shortName || event.league?.name || event.season?.displayName || "Match",
    opponent: teamDisplayName(opponent.team?.abbreviation, opponent.team?.displayName || ""),
    opponentCode: String(opponent.team?.abbreviation || "").toUpperCase(),
    venueSide: team.homeAway === "home" ? "home" : team.homeAway === "away" ? "away" : "neutral",
    goalsFor,
    goalsAgainst,
    score: `${goalsFor}-${goalsAgainst}`,
    result: resultFromGoals(goalsFor, goalsAgainst),
    eventId: String(event.id || ""),
    source: "ESPN all soccer team schedule",
    sourceUrl: `https://www.espn.com/soccer/team/results/_/id/${ESPN_TEAM_IDS[teamCode] || ""}/${teamSlug}`
  };
}

const recentFormCache = new Map();

async function fetchTeamRecentForm(teamCode, previous = null, limit = RECENT_FORM_LIMIT) {
  const normalized = String(teamCode || "").toUpperCase();
  const teamId = ESPN_TEAM_IDS[normalized];
  const nowIso = shanghaiIso();
  if (!teamId) {
    return {
      ok: false,
      status: "missing-team-id",
      teamCode: normalized,
      updatedAt: nowIso,
      source: "ESPN all soccer team schedule",
      sourceUrl: "",
      error: "ESPN 队伍 ID 映射缺失",
      matches: [],
      summary: summarizeFormResults([])
    };
  }
  if (recentFormCache.has(teamId)) return recentFormCache.get(teamId);
  const url = `${ESPN_ALL_SOCCER_TEAM_SCHEDULE}/${teamId}/schedule`;
  const payloadPromise = withTimeout(timedFetchJson(url, { timeoutMs: FETCH_TIMEOUT_MS + 2500 }), FETCH_TIMEOUT_MS + 3500, "team recent form").then((result) => {
    if (!result.ok) {
      if (previous?.ok && Array.isArray(previous.matches) && previous.matches.length) {
        return {
          ...previous,
          stale: true,
          lastError: result.error || "team recent form failed",
          updatedAt: previous.updatedAt || nowIso
        };
      }
      return {
        ok: false,
        status: "source-unavailable",
        teamCode: normalized,
        updatedAt: nowIso,
        source: "ESPN all soccer team schedule",
        sourceUrl: url,
        error: result.error || "team recent form failed",
        matches: [],
        summary: summarizeFormResults([])
      };
    }
    const nowMs = Date.now();
    const matches = (Array.isArray(result.data?.events) ? result.data.events : [])
      .filter((event) => {
        const ms = dateMs(event.date);
        return ms && ms <= nowMs;
      })
      .sort((a, b) => (dateMs(b.date) || 0) - (dateMs(a.date) || 0))
      .map((event) => normalizeTeamScheduleEvent(event, normalized))
      .filter(Boolean)
      .slice(0, limit);
    return {
      ok: matches.length > 0,
      status: matches.length ? "synced" : "empty",
      teamCode: normalized,
      teamName: teamDisplayName(normalized),
      updatedAt: nowIso,
      source: "ESPN all soccer team schedule",
      sourceUrl: url,
      error: matches.length ? "" : "未返回已完赛赛果",
      summary: summarizeFormResults(matches),
      matches
    };
  });
  recentFormCache.set(teamId, payloadPromise);
  return payloadPromise;
}

function formTextFromRecord(record, fallbackNotes = []) {
  if (record?.ok && Array.isArray(record.matches) && record.matches.length) {
    const summary = record.summary || summarizeFormResults(record.matches);
    const latest = record.matches.slice(0, 3).map((match) => {
      const resultLabel = match.result === "W" ? "胜" : match.result === "D" ? "平" : match.result === "L" ? "负" : "未知";
      return `${match.date} ${resultLabel} ${match.opponent} ${match.score}`;
    });
    return [
      `近 ${summary.matches} 场：${summary.wins}胜${summary.draws}平${summary.losses}负，进 ${summary.goalsFor} / 失 ${summary.goalsAgainst}。`,
      ...latest
    ].slice(0, 4);
  }
  return fallbackNotes;
}

function nonWaitingItems(items) {
  return Array.isArray(items) ? items.filter((item) => item && !/等待|未同步/.test(String(item))) : [];
}

function baselineTacticalMatchup(match, fifaRankings, aiAnalysis) {
  if (aiAnalysis.ok && aiAnalysis.tacticalMatchup) return aiAnalysis.tacticalMatchup;
  const homeRank = rankingRecord(fifaRankings, match.home);
  const awayRank = rankingRecord(fifaRankings, match.away);
  const rankingText = homeRank && awayRank
    ? `FIFA 排名差：${teamLabel(match, "home")}第 ${homeRank}，${teamLabel(match, "away")}第 ${awayRank}。`
    : "FIFA 排名只作为长期实力基线。";
  return `${rankingText} 当前未抓到可核验首发和细化战术 preview，模型只按长期强度、赛程场地和天气做低置信对位，不额外加入阵型/球员 matchup。`;
}

function baselineLineupNote(match, side, aiAnalysis, previousNote) {
  const aiNote = side === "home" ? aiAnalysis.homeNotes : aiAnalysis.awayNotes;
  if (aiAnalysis.ok && aiNote) return aiNote;
  if (previousNote && !/等待/.test(previousNote)) return previousNote;
  return `${teamLabel(match, side)} 已进入自动检索；未发现官方首发或可靠预计 XI，不生成球员名单。`;
}

function baselineTeamNewsSummary(match, preview, aiAnalysis, teamNewsSnippets) {
  if (aiAnalysis.ok && aiAnalysis.summary) return aiAnalysis.summary;
  if (teamNewsSnippets.length) return summarizeNews(teamNewsSnippets, "");
  const sourceCount = (preview.searches || []).filter((item) => item.ok).length
    + (preview.articles || []).filter((item) => item.ok).length
    + (preview.direct?.results || []).filter((item) => item.ok).length;
  return `已完成 ${sourceCount} 个公开入口检索；未提取到足够可核验球队新闻，当前只作为低置信基线。`;
}

function baselineInjurySummary(preview, aiAnalysis, injurySnippets, directInjurySection) {
  if (aiAnalysis.ok && aiAnalysis.injurySummary) return aiAnalysis.injurySummary;
  const cleanDirect = cleanInjurySection(directInjurySection);
  if (cleanDirect) return cleanDirect;
  if (injurySnippets.length) return summarizeNews(injurySnippets, "");
  const sourceCount = (preview.searches || []).filter((item) => item.ok).length
    + (preview.articles || []).filter((item) => item.ok).length
    + (preview.direct?.results || []).filter((item) => item.ok).length;
  return `已查询 ${sourceCount} 个公开入口，未发现可确认重大伤停；赛前官方名单公布前仍按低置信处理。`;
}

function baselineAiAnalysis(match, preview, weather, fifaRankings, aiAnalysis) {
  if (aiAnalysis.ok) return aiAnalysis;
  const sourceCount = (preview.searches || []).filter((item) => item.ok).length
    + (preview.articles || []).filter((item) => item.ok).length
    + (preview.direct?.results || []).filter((item) => item.ok).length;
  const homeRank = rankingRecord(fifaRankings, match.home);
  const awayRank = rankingRecord(fifaRankings, match.away);
  const rankingText = homeRank && awayRank ? `排名基线 ${match.homeName} ${homeRank} / ${match.awayName} ${awayRank}` : "排名基线部分可用";
  return {
    ok: true,
    fallback: true,
    updatedAt: shanghaiIso(),
    model: "rule-based-public-source-fallback",
    summary: `AI接口本轮不可用或未返回结构化结果；系统已用公开源检索、${rankingText}、天气和基线 xG 生成低置信综合。公开入口 ${sourceCount} 个，${weather.ok ? "天气已同步" : "天气未同步"}。`,
    injurySummary: "",
    lineupStatus: "unavailable",
    lineupConfidence: "low",
    homeNotes: "",
    awayNotes: "",
    tacticalMatchup: "",
    riskFlags: ["AI结构化综合降级为规则兜底", "首发未确认"],
    modelImpacts: []
  };
}

function safeJsonFromText(text) {
  if (!text) return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function extractOpenAiText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  const parts = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n");
}

function clampDelta(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(-0.12, Math.min(0.12, numeric));
}

function normalizeAiAnalysis(raw, config) {
  if (!raw || typeof raw !== "object") return null;
  const impacts = Array.isArray(raw.modelImpacts) ? raw.modelImpacts : [];
  return {
    ok: true,
    updatedAt: shanghaiIso(),
    model: config.model,
    summary: String(raw.summary || "").slice(0, 360),
    injurySummary: String(raw.injurySummary || "").slice(0, 300),
    lineupStatus: ["unavailable", "projected", "confirmed"].includes(raw.lineupStatus) ? raw.lineupStatus : "unavailable",
    lineupConfidence: ["low", "medium", "high"].includes(raw.lineupConfidence) ? raw.lineupConfidence : "low",
    homeNotes: String(raw.homeNotes || "").slice(0, 240),
    awayNotes: String(raw.awayNotes || "").slice(0, 240),
    recentForm: {
      home: Array.isArray(raw.recentForm?.home) ? raw.recentForm.home.map((item) => String(item).slice(0, 180)).slice(0, 3) : [],
      away: Array.isArray(raw.recentForm?.away) ? raw.recentForm.away.map((item) => String(item).slice(0, 180)).slice(0, 3) : []
    },
    tacticalMatchup: String(raw.tacticalMatchup || "").slice(0, 360),
    riskFlags: Array.isArray(raw.riskFlags) ? raw.riskFlags.map((item) => String(item).slice(0, 120)).slice(0, 5) : [],
    modelImpacts: impacts.map((impact) => ({
      label: String(impact.label || "AI 情报调整").slice(0, 80),
      homeXgDelta: clampDelta(impact.homeXgDelta),
      awayXgDelta: clampDelta(impact.awayXgDelta),
      reason: String(impact.reason || "").slice(0, 200),
      source: "OpenAI 综合分析"
    })).filter((impact) => impact.homeXgDelta || impact.awayXgDelta)
  };
}

function isDuplicateBaselineImpact(match, impact) {
  const label = String(impact.label || "").toLowerCase();
  const reason = String(impact.reason || "").toLowerCase();
  const text = `${label} ${reason}`;
  if (["降雨", "天气", "湿度", "weather", "rain", "humidity"].some((needle) => text.includes(needle))) {
    return true;
  }
  const baseline = (match.model?.manualAdjustments || [])
    .map((item) => `${item.label || ""} ${item.impact || ""}`.toLowerCase());
  return baseline.some((item) => {
    if (!item) return false;
    return (
      (item.includes("主场") && (text.includes("主场") || text.includes("海拔"))) ||
      (item.includes("海拔") && text.includes("海拔")) ||
      (item.includes("揭幕") && text.includes("揭幕"))
    );
  });
}

function filteredAiImpacts(match, aiAnalysis) {
  if (!aiAnalysis.ok || !Array.isArray(aiAnalysis.modelImpacts)) return [];
  return aiAnalysis.modelImpacts
    .filter((impact) => !isDuplicateBaselineImpact(match, impact))
    .slice(0, 3);
}

async function fetchOpenAiAnalysis(match, preview, weather) {
  const config = await getOpenAiConfig();
  if (!config.apiKey) {
    return {
      ok: false,
      enabled: false,
      error: "OPENAI_API_KEY 未配置，AI 综合分析未启用。"
    };
  }

  const prompt = {
    task: "你是世界杯赛前情报分析员。只根据提供的公开抓取摘要、来源和天气，输出保守 JSON。不要编造球员名单、官方首发或确认伤停。",
    match: {
      id: match.id,
      home: match.homeName,
      away: match.awayName,
      kickoffShanghai: match.kickoffShanghai,
      venue: match.venue,
      baseXg: match.model
    },
    weather: weather.summary || "",
    sourceSnippets: (preview.snippets || []).slice(0, 6).map((snippet) => String(snippet).slice(0, 260)),
    articleLinks: preview.articleLinks || [],
    instructions: {
      lineupStatus: "只有来源明确说 official/confirmed lineup 才能写 confirmed；只有可靠文章给出 predicted/probable XI 才能写 projected；否则 unavailable。",
      xgDelta: "xG 调整必须保守，单项在 -0.12 到 +0.12 之间；没有可靠信息就给 0 或空数组。",
      outputJson: {
        summary: "中文，综合球队新闻和信息质量",
        injurySummary: "中文，明确哪些是确认、哪些是未确认",
        lineupStatus: "unavailable|projected|confirmed",
        lineupConfidence: "low|medium|high",
        homeNotes: "中文",
        awayNotes: "中文",
        recentForm: {
          home: ["中文，只写公开摘要中可支持的近况；没有就写低置信基线说明"],
          away: ["中文，只写公开摘要中可支持的近况；没有就写低置信基线说明"]
        },
        tacticalMatchup: "中文",
        riskFlags: ["中文风险点"],
        modelImpacts: [
          {
            label: "中文",
            homeXgDelta: 0,
            awayXgDelta: 0,
            reason: "中文"
          }
        ]
      }
    }
  };

  const responsesUrl = `${config.baseUrl}/v1/responses`;
  const result = await withTimeout(timedFetchJson(responsesUrl, {
    method: "POST",
    timeoutMs: OPENAI_TIMEOUT_MS,
    headers: {
      "authorization": `Bearer ${config.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      max_output_tokens: 700,
      reasoning: {
        effort: "none"
      },
      input: [
        {
          role: "system",
          content: "你只输出 JSON，不输出 Markdown。你必须保守，不能把搜索结果或传闻当成官方事实。"
        },
        {
          role: "user",
          content: JSON.stringify(prompt)
        }
      ]
    })
  }), OPENAI_TIMEOUT_MS, "openai analysis");

  if (!result.ok) {
    return {
      ok: false,
      enabled: true,
      error: result.error || "OpenAI analysis failed"
    };
  }

  const parsed = safeJsonFromText(extractOpenAiText(result.data));
  const normalized = normalizeAiAnalysis(parsed, config);
  if (!normalized) {
    return {
      ok: false,
      enabled: true,
      error: "OpenAI 返回无法解析为 JSON"
    };
  }
  return normalized;
}

function normalizeMediaConfidence(value, neutralSourceCount, sourceCount) {
  const normalized = String(value || "").toLowerCase();
  if (["low", "medium", "high"].includes(normalized)) {
    if (normalized === "high" && neutralSourceCount < 3) return "medium";
    return normalized;
  }
  if (neutralSourceCount >= 3) return "medium";
  if (sourceCount >= 3) return "medium";
  return "low";
}

function normalizeMediaImpacts(raw = {}) {
  return {
    homeXgDelta: clampValue(raw.homeXgDelta, -0.06, 0.06),
    awayXgDelta: clampValue(raw.awayXgDelta, -0.06, 0.06),
    bttsDelta: clampValue(raw.bttsDelta, -0.035, 0.035),
    over25Delta: clampValue(raw.over25Delta, -0.035, 0.035),
    drawDelta: clampValue(raw.drawDelta, -0.025, 0.025)
  };
}

function countMediaSources(candidates) {
  return {
    sourceCount: candidates.length,
    neutralSourceCount: candidates.filter((item) => item.tier === "neutral").length,
    marketSourceCount: candidates.filter((item) => item.tier === "market-context").length
  };
}

function mediaScoreRound(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const factor = 10 ** digits;
  return Math.round(numeric * factor) / factor;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scorePredictionAliases(match, side) {
  const raw = side === "home"
    ? [match.homeName, match.homeEnglishName, TEAM_SEARCH_NAMES[match.home], match.home]
    : [match.awayName, match.awayEnglishName, TEAM_SEARCH_NAMES[match.away], match.away];
  return raw
    .filter(Boolean)
    .map((item) => String(item).trim())
    .filter((item, index, list) => item && list.findIndex((value) => value.toLowerCase() === item.toLowerCase()) === index)
    .sort((a, b) => b.length - a.length);
}

function aliasRegex(aliases) {
  const escaped = aliases.map(escapeRegExp).filter(Boolean);
  if (!escaped.length) return null;
  return new RegExp(`(?:${escaped.join("|")})`, "i");
}

function textContainsAlias(text, aliases) {
  const lower = String(text || "").toLowerCase();
  return aliases.some((alias) => lower.includes(String(alias).toLowerCase()));
}

function firstAliasIndex(text, aliases) {
  const lower = String(text || "").toLowerCase();
  let index = -1;
  for (const alias of aliases) {
    const found = lower.indexOf(String(alias).toLowerCase());
    if (found >= 0 && (index < 0 || found < index)) index = found;
  }
  return index;
}

function scorePredictionCue(text) {
  return /predicted score|score prediction|prediction|we say|our prediction|forecast|forecasts|predict|predicts|预测比分|比分预测|推荐比分|预计比分|预测/i.test(String(text || ""));
}

function predictionChunks(text) {
  return stripHtml(text)
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?。！？])\s+|(?=\bWe say:)|(?=\bPrediction:)|(?=\bPredicted score:)|(?=\bScore prediction:)/i)
    .map((item) => item.trim())
    .filter((item) => item && /\d{1,2}\s*[-–]\s*\d{1,2}/.test(item))
    .slice(0, 28);
}

function inferScoreOrientation(chunk, scoreIndex, match, sourceHeader = "") {
  const homeAliases = scorePredictionAliases(match, "home");
  const awayAliases = scorePredictionAliases(match, "away");
  const before = chunk.slice(Math.max(0, scoreIndex - 120), scoreIndex);
  const after = chunk.slice(scoreIndex, Math.min(chunk.length, scoreIndex + 140));
  const chunkHasHome = textContainsAlias(chunk, homeAliases);
  const chunkHasAway = textContainsAlias(chunk, awayAliases);
  const beforeHome = textContainsAlias(before, homeAliases);
  const beforeAway = textContainsAlias(before, awayAliases);
  const afterHome = textContainsAlias(after, homeAliases);
  const afterAway = textContainsAlias(after, awayAliases);

  if (beforeHome && afterAway) return { orientation: "home-away", confidence: "high", reason: "team-score-team" };
  if (beforeAway && afterHome) return { orientation: "away-home", confidence: "high", reason: "team-score-team-reversed" };

  if (chunkHasHome && chunkHasAway) {
    const homeIndex = firstAliasIndex(chunk, homeAliases);
    const awayIndex = firstAliasIndex(chunk, awayAliases);
    if (homeIndex >= 0 && awayIndex >= 0 && homeIndex < awayIndex) {
      return { orientation: "home-away", confidence: "medium", reason: "team-order-in-sentence" };
    }
    if (homeIndex >= 0 && awayIndex >= 0 && awayIndex < homeIndex) {
      return { orientation: "away-home", confidence: "medium", reason: "team-order-in-sentence" };
    }
  }

  const headerHasHome = textContainsAlias(sourceHeader, homeAliases);
  const headerHasAway = textContainsAlias(sourceHeader, awayAliases);
  if (headerHasHome && headerHasAway && scorePredictionCue(chunk)) {
    const homeIndex = firstAliasIndex(sourceHeader, homeAliases);
    const awayIndex = firstAliasIndex(sourceHeader, awayAliases);
    return {
      orientation: homeIndex >= 0 && awayIndex >= 0 && awayIndex < homeIndex ? "away-home" : "home-away",
      confidence: "medium",
      reason: "source-title-order"
    };
  }

  return { orientation: "", confidence: "low", reason: "orientation-unresolved" };
}

function extractScorePredictionsFromCandidate(match, candidate) {
  const header = `${candidate.title || ""} ${candidate.url || ""}`;
  const fullText = `${candidate.title || ""}. ${candidate.fullText || candidate.snippet || ""}`;
  const chunks = predictionChunks(fullText);
  const predictions = [];
  const seen = new Set();

  for (const chunk of chunks) {
    if (!scorePredictionCue(chunk)) continue;
    const pattern = /(\d{1,2})\s*[-–]\s*(\d{1,2})/g;
    let matchScore;
    while ((matchScore = pattern.exec(chunk)) !== null) {
      const left = Number(matchScore[1]);
      const right = Number(matchScore[2]);
      if (!Number.isInteger(left) || !Number.isInteger(right)) continue;
      if (left < 0 || right < 0 || left > 9 || right > 9) continue;
      const orientation = inferScoreOrientation(chunk, matchScore.index, match, header);
      if (!orientation.orientation || orientation.confidence === "low") continue;
      const homeGoals = orientation.orientation === "away-home" ? right : left;
      const awayGoals = orientation.orientation === "away-home" ? left : right;
      const score = `${homeGoals}-${awayGoals}`;
      if (seen.has(score)) continue;
      seen.add(score);
      predictions.push({
        score,
        homeGoals,
        awayGoals,
        confidence: orientation.confidence,
        reason: orientation.reason,
        sourceTitle: candidate.title,
        sourceUrl: candidate.url,
        domain: candidate.domain,
        tier: candidate.tier,
        sourceType: candidate.sourceType,
        snippet: chunk.replace(/\s+/g, " ").slice(0, 260)
      });
    }
  }

  return predictions.slice(0, 2);
}

function mediaScoreOutcome(score) {
  const homeGoals = Number(score.homeGoals);
  const awayGoals = Number(score.awayGoals);
  if (homeGoals > awayGoals) return "home";
  if (homeGoals < awayGoals) return "away";
  return "draw";
}

function mediaScoreSourceWeight(prediction) {
  const tierWeight = prediction.tier === "neutral" ? 1.15 : prediction.tier === "market-context" ? 0.82 : 1;
  const confidenceWeight = prediction.confidence === "high" ? 1 : 0.84;
  return tierWeight * confidenceWeight;
}

function buildMediaScoreConsensus(match, candidates, previous = {}) {
  const predictions = [];
  const sourceSeen = new Set();
  for (const candidate of candidates) {
    const sourceKey = candidate.url || `${candidate.domain}:${candidate.title}`;
    if (sourceSeen.has(sourceKey)) continue;
    const extracted = extractScorePredictionsFromCandidate(match, candidate);
    if (!extracted.length) continue;
    sourceSeen.add(sourceKey);
    predictions.push(extracted[0]);
  }

  if (!predictions.length) {
    if (previous?.ok && previous.parserVersion === MEDIA_SCORE_PARSER_VERSION) {
      return {
        ...previous,
        status: "stale",
        stale: true,
        updatedAt: shanghaiIso(),
        summary: "本轮未抓到明确媒体预测比分，沿用上一版比分共识，仅作参考。",
        summaryEn: "No explicit media score predictions were found in this sync; using the previous score consensus as reference only."
      };
    }
    return {
      ok: false,
      status: "missing",
      updatedAt: shanghaiIso(),
      source: "媒体预测比分聚合",
      parserVersion: MEDIA_SCORE_PARSER_VERSION,
      summary: "暂未抓到多家媒体明确预测比分。",
      summaryEn: "No explicit multi-source media score prediction has been found yet.",
      sourceCount: 0,
      consensusScore: "",
      agreement: "none",
      scores: [],
      predictions: [],
      outcomeBreakdown: { home: 0, draw: 0, away: 0, btts: 0, over25: 0, under25: 0 }
    };
  }

  const scoreMap = new Map();
  const outcome = { home: 0, draw: 0, away: 0, btts: 0, over25: 0, under25: 0 };
  let totalWeight = 0;
  for (const prediction of predictions) {
    const weight = mediaScoreSourceWeight(prediction);
    totalWeight += weight;
    const existing = scoreMap.get(prediction.score) || {
      score: prediction.score,
      homeGoals: prediction.homeGoals,
      awayGoals: prediction.awayGoals,
      count: 0,
      weightedCount: 0,
      sources: []
    };
    existing.count += 1;
    existing.weightedCount += weight;
    existing.sources.push({
      title: prediction.sourceTitle,
      domain: prediction.domain,
      tier: prediction.tier,
      url: prediction.sourceUrl
    });
    scoreMap.set(prediction.score, existing);

    const side = mediaScoreOutcome(prediction);
    outcome[side] += weight;
    if (prediction.homeGoals > 0 && prediction.awayGoals > 0) outcome.btts += weight;
    if (prediction.homeGoals + prediction.awayGoals > 2.5) outcome.over25 += weight;
    else outcome.under25 += weight;
  }

  const scores = [...scoreMap.values()]
    .map((item) => ({
      ...item,
      weightedCount: mediaScoreRound(item.weightedCount, 2),
      share: totalWeight ? mediaScoreRound(item.weightedCount / totalWeight, 3) : 0,
      sources: item.sources.slice(0, 4)
    }))
    .sort((a, b) => b.weightedCount - a.weightedCount || b.count - a.count || a.score.localeCompare(b.score));
  const top = scores[0] || {};
  const normalizedOutcome = Object.fromEntries(Object.entries(outcome).map(([key, value]) => [
    key,
    totalWeight ? mediaScoreRound(value / totalWeight, 3) : 0
  ]));
  const agreement = predictions.length >= 3 && top.share >= 0.5
    ? "high"
    : predictions.length >= 2 && top.share >= 0.38
      ? "medium"
      : "low";
  const directionLabel = normalizedOutcome.home > normalizedOutcome.away && normalizedOutcome.home > normalizedOutcome.draw
    ? `${teamLabel(match, "home")}方向`
    : normalizedOutcome.away > normalizedOutcome.home && normalizedOutcome.away > normalizedOutcome.draw
      ? `${teamLabel(match, "away")}方向`
      : "平局/低比分方向";

  return {
    ok: true,
    status: predictions.length >= 2 ? "synced" : "partial",
    updatedAt: shanghaiIso(),
    source: "媒体预测比分聚合",
    parserVersion: MEDIA_SCORE_PARSER_VERSION,
    sourceCount: predictions.length,
    consensusScore: top.score || "",
    agreement,
    summary: `抓到 ${predictions.length} 家明确比分预测，最多指向 ${top.score || "无共识"}；整体偏 ${directionLabel}，仅作外部参考。`,
    summaryEn: `${predictions.length} explicit media score prediction(s) found; the top clustered score is ${top.score || "none"}. Use as external reference only.`,
    scores: scores.slice(0, 6),
    predictions: predictions.map((prediction) => ({
      score: prediction.score,
      homeGoals: prediction.homeGoals,
      awayGoals: prediction.awayGoals,
      confidence: prediction.confidence,
      sourceTitle: prediction.sourceTitle,
      sourceUrl: prediction.sourceUrl,
      domain: prediction.domain,
      tier: prediction.tier,
      sourceType: prediction.sourceType,
      snippet: prediction.snippet
    })).slice(0, 10),
    outcomeBreakdown: normalizedOutcome
  };
}

function normalizeMediaReferenceScores(raw = {}, previous = {}) {
  const sourceScores = Array.isArray(raw.scores)
    ? raw.scores
    : Array.isArray(raw.referenceScores)
      ? raw.referenceScores
      : Array.isArray(raw)
        ? raw
        : [];
  const scores = sourceScores.map((item) => {
    const scoreText = typeof item === "string" ? item : item.score;
    const matchScore = String(scoreText || "").match(/(\d{1,2})\s*[-–]\s*(\d{1,2})/);
    if (!matchScore) return null;
    const homeGoals = Number(matchScore[1]);
    const awayGoals = Number(matchScore[2]);
    if (!Number.isInteger(homeGoals) || !Number.isInteger(awayGoals) || homeGoals > 9 || awayGoals > 9) return null;
    return {
      score: `${homeGoals}-${awayGoals}`,
      homeGoals,
      awayGoals,
      tier: String(item.tier || item.role || "reference").slice(0, 40),
      rationale: String(item.rationale || item.reason || "").replace(/\s+/g, " ").trim().slice(0, 180),
      rationaleEn: String(item.rationaleEn || "").replace(/\s+/g, " ").trim().slice(0, 180)
    };
  }).filter(Boolean).slice(0, 5);

  const summary = String(raw.summary || raw.referenceScoreSummary || "").replace(/\s+/g, " ").trim().slice(0, 260);
  const summaryEn = String(raw.summaryEn || "").replace(/\s+/g, " ").trim().slice(0, 260);
  if (!scores.length) {
    if (previous?.ok && previous.status === "ai-inferred") {
      return {
        ...previous,
        status: "stale",
        stale: true,
        updatedAt: shanghaiIso(),
        summary: "本轮 AI 未输出媒体参考比分，沿用上一版，仅作参考。",
        summaryEn: "The AI did not produce inferred media reference scores in this sync; using the previous version as reference only."
      };
    }
    return {
      ok: false,
      status: "missing",
      updatedAt: shanghaiIso(),
      source: "AI媒体参考比分",
      summary: "暂无 AI 媒体参考比分。",
      summaryEn: "No AI-inferred media reference scores are available.",
      scores: []
    };
  }

  return {
    ok: true,
    status: "ai-inferred",
    updatedAt: shanghaiIso(),
    source: "AI媒体参考比分",
    summary: summary || `AI 基于已抓到的媒体摘要给出 ${scores.map((item) => item.score).join(" / ")} 作为参考比分；这不是媒体原文预测。`,
    summaryEn: summaryEn || `AI inferred ${scores.map((item) => item.score).join(" / ")} from the synced media summaries. This is not an explicit source prediction.`,
    scores
  };
}

function teamSentenceScore(text, aliases) {
  const positive = [
    "strong",
    "impressive",
    "dominant",
    "dangerous",
    "creative",
    "in form",
    "momentum",
    "control",
    "press",
    "threat",
    "edge",
    "favored",
    "favourite",
    "favorite",
    "状态好",
    "优势",
    "压制",
    "威胁",
    "创造"
  ];
  const negative = [
    "struggle",
    "inconsistent",
    "vulnerable",
    "fatigue",
    "injury",
    "injured",
    "suspended",
    "doubt",
    "concern",
    "flaw",
    "worry",
    "leaky",
    "conceded",
    "疲劳",
    "伤停",
    "停赛",
    "不稳定",
    "漏洞",
    "隐患"
  ];
  const cleanAliases = aliases.filter(Boolean).map((item) => String(item).toLowerCase());
  const sentences = stripHtml(text).split(/(?<=[.!?。！？])\s+|\s{2,}/).map((item) => item.trim()).filter(Boolean);
  let score = 0;
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (!cleanAliases.some((alias) => lower.includes(alias))) continue;
    if (positive.some((needle) => lower.includes(needle))) score += 1;
    if (negative.some((needle) => lower.includes(needle))) score -= 1;
  }
  return score;
}

function buildHeuristicMediaConsensus(match, candidates, previous = {}) {
  const scoreConsensus = buildMediaScoreConsensus(match, candidates, previous.scoreConsensus);
  const referenceScores = normalizeMediaReferenceScores({}, previous.referenceScores);
  if (!candidates.length) {
    if (previous?.ok) {
      return {
        ...previous,
        status: "stale",
        stale: true,
        lastError: "本轮未抓到可用媒体来源，沿用上一次媒体共识，仅作观察。",
        updatedAt: shanghaiIso()
      };
    }
    return {
      ok: false,
      status: "missing",
      updatedAt: shanghaiIso(),
      source: "媒体/专家赛前共识",
      summary: "未抓到足够可用的中立媒体或专家赛前信息。",
      confidence: "low",
      sourceCount: 0,
      neutralSourceCount: 0,
      marketSourceCount: 0,
      impacts: normalizeMediaImpacts({}),
      scoreConsensus,
      referenceScores,
      sources: [],
      notes: [],
      riskFlags: ["媒体共识未同步"]
    };
  }

  const text = candidates.map((item) => `${item.title}\n${item.snippet}`).join("\n").toLowerCase();
  const homeAliases = [match.homeName, match.homeEnglishName, TEAM_SEARCH_NAMES[match.home], match.home];
  const awayAliases = [match.awayName, match.awayEnglishName, TEAM_SEARCH_NAMES[match.away], match.away];
  const homeScore = teamSentenceScore(text, homeAliases);
  const awayScore = teamSentenceScore(text, awayAliases);
  const directionalDelta = clampValue((homeScore - awayScore) * 0.012, -0.04, 0.04);
  const impacts = {
    homeXgDelta: directionalDelta,
    awayXgDelta: -directionalDelta * 0.8,
    bttsDelta: 0,
    over25Delta: 0,
    drawDelta: 0
  };
  const notes = [];
  if (/both teams to score|btts|both sides.*score|both teams.*net|两队.*进球|双方.*进球/.test(text)) {
    impacts.bttsDelta += 0.02;
    notes.push("媒体摘要出现 BTTS/双方进球倾向。");
  }
  if (/over 2\.5|high-scoring|goals at both ends|open game|end-to-end|大于 2\.5|大球/.test(text)) {
    impacts.over25Delta += 0.018;
    notes.push("媒体摘要出现开放/大球倾向。");
  }
  if (/under 2\.5|low-scoring|tight|cagey|disciplined|organized|defensive|extra time|小于 2\.5|小球|防守|加时/.test(text)) {
    impacts.over25Delta -= 0.018;
    impacts.drawDelta += 0.008;
    notes.push("媒体摘要出现低比分/谨慎/防守倾向。");
  }
  if (/heat|humidity|travel|fatigue|酷热|高温|湿度|疲劳/.test(text)) {
    impacts.over25Delta -= 0.008;
    notes.push("媒体摘要提到体能或天气负担，降低节奏权重。");
  }

  const counts = countMediaSources(candidates);
  const directionText = directionalDelta > 0.01
    ? `${teamLabel(match, "home")}媒体语义略占优`
    : directionalDelta < -0.01
      ? `${teamLabel(match, "away")}媒体语义略占优`
      : "媒体方向没有明显单边倾斜";

  return {
    ok: true,
    status: counts.neutralSourceCount ? "rule-fallback" : "low-signal",
    updatedAt: shanghaiIso(),
    source: "媒体/专家赛前共识",
    model: "rule-based-media-filter",
    summary: `${directionText}；${notes[0] || "公开媒体只提供弱信号，暂不做大幅调整。"}`,
    confidence: normalizeMediaConfidence("low", counts.neutralSourceCount, counts.sourceCount),
    ...counts,
    impacts: normalizeMediaImpacts(impacts),
    scoreConsensus,
    referenceScores,
    sources: candidates.map((item) => ({
      title: item.title,
      url: item.url,
      domain: item.domain,
      tier: item.tier,
      sourceType: item.sourceType,
      snippet: item.snippet
    })),
    notes,
    riskFlags: ["规则兜底，不等同专家定论"]
  };
}

function normalizeMediaConsensus(raw, config, candidates, fallback) {
  if (!raw || typeof raw !== "object") return fallback;
  const counts = countMediaSources(candidates);
  const summary = String(raw.summary || fallback.summary || "").replace(/\s+/g, " ").trim().slice(0, 420);
  if (!summary) return fallback;
  const notes = Array.isArray(raw.notes) ? raw.notes : [];
  const riskFlags = Array.isArray(raw.riskFlags) ? raw.riskFlags : [];
  const scoreConsensus = fallback.scoreConsensus || buildMediaScoreConsensus({}, candidates);
  const referenceScores = normalizeMediaReferenceScores(raw.referenceScores || {
    summary: raw.referenceScoreSummary,
    summaryEn: raw.referenceScoreSummaryEn,
    scores: raw.mediaReferenceScores
  }, fallback.referenceScores);
  return {
    ok: true,
    status: counts.neutralSourceCount ? "synced" : "partial",
    updatedAt: shanghaiIso(),
    source: "媒体/专家赛前共识",
    model: config.model,
    summary,
    consensusLabel: String(raw.consensusLabel || fallback.consensusLabel || "").slice(0, 80),
    confidence: normalizeMediaConfidence(raw.confidence, counts.neutralSourceCount, counts.sourceCount),
    ...counts,
    impacts: normalizeMediaImpacts(raw.impacts || fallback.impacts || {}),
    scoreConsensus,
    referenceScores,
    sources: candidates.map((item) => ({
      title: item.title,
      url: item.url,
      domain: item.domain,
      tier: item.tier,
      sourceType: item.sourceType,
      stance: "",
      snippet: item.snippet
    })),
    notes: notes.map((item) => String(item).slice(0, 180)).slice(0, 5),
    riskFlags: riskFlags.map((item) => String(item).slice(0, 120)).slice(0, 5)
  };
}

async function fetchOpenAiMediaConsensus(match, preview, openAiConfig, previous = {}) {
  const candidates = buildMediaCandidates(match, preview);
  const fallback = buildHeuristicMediaConsensus(match, candidates, previous);
  const config = openAiConfig?.apiKey ? openAiConfig : await getOpenAiConfig();
  if (!config.apiKey || !candidates.length) return fallback;

  const prompt = {
    task: "你是世界杯赛前媒体信息过滤器。只根据给出的公开来源摘要，提炼中立媒体/专家共识，并输出保守 JSON。",
    sourcePolicy: [
      "中立媒体优先：Guardian/AP/Reuters/ESPN/BBC/Sky/The Analyst 等。",
      "投注技巧、赔率和博彩文章只能作为 market-context，不能当作中立专家结论。",
      "不能编造首发、伤停、战术、现场状态；没有明确来源就写低置信或不调整。",
      "如果来源没有明确写出预测比分，可以给 AI 媒体参考比分，但必须标明这是根据媒体摘要推导，不是媒体原文比分。",
      "调整必须进入同一套 xG/比分分布，幅度很小。"
    ],
    match: {
      id: match.id,
      home: match.homeName,
      away: match.awayName,
      kickoffShanghai: match.kickoffShanghai,
      venue: match.venue
    },
    sources: candidates.map((item) => ({
      title: item.title,
      domain: item.domain,
      tier: item.tier,
      url: item.url,
      snippet: item.snippet
    })),
    outputJson: {
      summary: "中文，一段话总结媒体共识与证据强弱",
      consensusLabel: "中文短标签，例如 偏向小球/BTTS偏热/强队优势但谨慎",
      confidence: "low|medium|high",
      impacts: {
        homeXgDelta: "number, -0.06 到 0.06",
        awayXgDelta: "number, -0.06 到 0.06",
        bttsDelta: "number, -0.035 到 0.035",
        over25Delta: "number, -0.035 到 0.035",
        drawDelta: "number, -0.025 到 0.025"
      },
      referenceScores: {
        summary: "中文一句话：基于媒体摘要推导的参考比分，并明确不是媒体原文预测",
        summaryEn: "English one sentence with the same caveat",
        scores: [
          {
            score: "例如 1-1",
            tier: "primary|cover|tail",
            rationale: "中文，为什么这个比分符合媒体摘要",
            rationaleEn: "English rationale"
          }
        ]
      },
      notes: ["中文证据点"],
      riskFlags: ["中文风险或缺口"]
    }
  };

  const responsesUrl = `${config.baseUrl}/v1/responses`;
  const result = await withTimeout(timedFetchJson(responsesUrl, {
    method: "POST",
    timeoutMs: MEDIA_OPENAI_TIMEOUT_MS,
    headers: {
      "authorization": `Bearer ${config.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      max_output_tokens: 980,
      reasoning: {
        effort: "none"
      },
      input: [
        {
          role: "system",
          content: "你只输出 JSON，不输出 Markdown。必须区分中立媒体与投注技巧，必须保守。"
        },
        {
          role: "user",
          content: JSON.stringify(prompt)
        }
      ]
    })
  }), MEDIA_OPENAI_TIMEOUT_MS, "openai media consensus");

  if (!result.ok) {
    return {
      ...fallback,
      status: fallback.ok ? fallback.status : "source-unavailable",
      lastError: result.error || "OpenAI media consensus failed"
    };
  }

  const parsed = safeJsonFromText(extractOpenAiText(result.data));
  return normalizeMediaConsensus(parsed, config, candidates, fallback);
}

function searchQueries(match) {
  const homeEn = match.homeEnglishName || TEAM_SEARCH_NAMES[match.home] || match.homeName;
  const awayEn = match.awayEnglishName || TEAM_SEARCH_NAMES[match.away] || match.awayName;
  return [
    `${homeEn} vs ${awayEn} World Cup preview team news lineups injuries`,
    `${homeEn} vs ${awayEn} World Cup neutral preview tactical analysis form expert`,
    `${homeEn} XI vs ${awayEn} predicted lineup confirmed team news injury latest World Cup`,
    `${awayEn} XI vs ${homeEn} predicted lineup confirmed team news injury latest World Cup`,
    `${homeEn} ${awayEn} head to head recent form`,
    `${homeEn} ${awayEn} H2H results last meetings football`,
    `${match.homeName} ${match.awayName} 世界杯 伤停 首发 阵容`
  ];
}

async function fetchSearchPreview(match) {
  const [direct, mediaDiscovery] = await Promise.all([
    fetchDirectSources(match),
    fetchMediaDiscoverySources(match)
  ]);
  const queries = searchQueries(match);
  const searches = [];
  for (const queryText of queries) {
    if (searches.length) await sleep(SOURCE_REQUEST_SPACING_MS);
    const query = encodeURIComponent(queryText);
    const url = `https://r.jina.ai/http://duckduckgo.com/html/?q=${query}`;
    const result = await withTimeout(timedFetchText(url), FETCH_TIMEOUT_MS + 1500, "search preview");
    searches.push(isBlockedSearchText(result.text)
      ? { ...result, ok: false, error: "search proxy blocked by upstream source", queryText }
      : { ...result, queryText });
  }

  const okSearches = searches.filter((result) => result.ok);
  const combinedText = okSearches.map((result) => result.text).join("\n");
  if (!okSearches.length && !direct.ok && !mediaDiscovery.ok) {
    return {
      ok: false,
      url: searches[0]?.url || "",
      error: [
        ...searches.map((result) => result.error).filter(Boolean),
        ...(mediaDiscovery.errors || [])
      ].join("; ") || "search failed",
      direct,
      mediaDiscovery,
      searches
    };
  }

  const links = extractSearchLinks(combinedText, 8);
  const firstArticles = [];
  for (const link of links.slice(0, 6)) {
    if (firstArticles.length) await sleep(SOURCE_REQUEST_SPACING_MS);
    firstArticles.push(await fetchReadableArticle(link));
  }
  const firstArticleText = firstArticles.filter((article) => article.ok).map((article) => article.text).join("\n");
  const expandedLinks = uniqueUrls([
    ...links,
    ...extractArticleLinks(`${direct.text || ""}\n${mediaDiscovery.text || ""}\n${combinedText}\n${firstArticleText}`, 10)
  ], 12);
  const extraLinks = expandedLinks.filter((url) => !links.includes(url)).slice(0, 4);
  const extraArticles = [];
  for (const link of extraLinks) {
    if (extraArticles.length) await sleep(SOURCE_REQUEST_SPACING_MS);
    extraArticles.push(await fetchReadableArticle(link));
  }
  const articles = [...firstArticles, ...extraArticles];
  const okArticles = articles.filter((article) => article.ok);
  const articleText = okArticles.map((article) => article.text).join("\n");
  const text = `${direct.text || ""}\n${mediaDiscovery.text || ""}\n${combinedText}\n${articleText}`;

  return {
    ok: true,
    url: direct.results?.find((result) => result.ok)?.originalUrl
      || mediaDiscovery.results?.find((result) => result.ok)?.originalUrl
      || okSearches[0]?.url
      || "",
    direct,
    mediaDiscovery,
    searches,
    articles,
    articleLinks: expandedLinks,
    snippets: extractRelevantSentences(text, [
      match.homeName,
      match.awayName,
      match.homeEnglishName || TEAM_SEARCH_NAMES[match.home] || match.homeName,
      match.awayEnglishName || TEAM_SEARCH_NAMES[match.away] || match.awayName,
      "lineup",
      "line-up",
      "injury",
      "suspended",
      "team news",
      "preview",
      "starting",
      "head-to-head",
      "head to head",
      "h2h",
      "past meetings",
      "previous meetings",
      "last meeting",
      "historical meetings",
      "交手",
      "历史交锋"
    ], 10),
    text
  };
}

async function fetchWeather(match) {
  const venue = lookupVenueCoordinates(match);
  if (!venue) {
    return {
      ok: false,
      updatedAt: shanghaiIso(),
      error: `没有 ${match.venue} 的坐标配置`,
      summary: `${match.venue || "场馆"} 坐标未配置，天气不参与模型调整。`
    };
  }

  const date = new Date(match.kickoffLocal || match.kickoffShanghai);
  const datePart = Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${venue.latitude}&longitude=${venue.longitude}&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,wind_speed_10m&start_date=${datePart}&end_date=${datePart}&timezone=auto`;
  if (weatherCache.has(url)) return weatherCache.get(url);
  const result = await enqueueWeatherFetch(url);
  if (!result.ok) {
    const failed = {
      ...result,
      summary: "天气源请求失败，暂不调整总进球。"
    };
    weatherCache.set(url, failed);
    return failed;
  }

  const hourly = result.data && result.data.hourly ? result.data.hourly : {};
  const times = hourly.time || [];
  if (!times.length) {
    return {
      ok: false,
      url,
      error: "天气 API 没有返回小时数据",
      summary: "天气源没有小时数据，暂不调整总进球。"
    };
  }

  const targetTs = date.getTime();
  let bestIndex = 0;
  let bestDiff = Infinity;
  times.forEach((time, index) => {
    const ts = new Date(time).getTime();
    const diff = Math.abs(ts - targetTs);
    if (Number.isFinite(diff) && diff < bestDiff) {
      bestDiff = diff;
      bestIndex = index;
    }
  });

  const temperature = hourly.temperature_2m?.[bestIndex];
  const humidity = hourly.relative_humidity_2m?.[bestIndex];
  const rain = hourly.precipitation_probability?.[bestIndex];
  const wind = hourly.wind_speed_10m?.[bestIndex];
  const parts = [];
  if (typeof temperature === "number") parts.push(`${Math.round(temperature)}C`);
  if (typeof humidity === "number") parts.push(`湿度 ${Math.round(humidity)}%`);
  if (typeof rain === "number") parts.push(`降雨 ${Math.round(rain)}%`);
  if (typeof wind === "number") parts.push(`风速 ${Math.round(wind)} km/h`);

  const impacts = [];
  if (typeof rain === "number" && rain >= 55) {
    impacts.push({
      label: "降雨概率偏高",
      homeXgDelta: -0.03,
      awayXgDelta: -0.03,
      reason: "湿滑场地可能降低射门质量和传控稳定性。",
      source: "Open-Meteo"
    });
  }
  if (typeof temperature === "number" && temperature >= 30) {
    impacts.push({
      label: "高温体能影响",
      homeXgDelta: -0.02,
      awayXgDelta: -0.02,
      reason: "高温可能压低比赛节奏。",
      source: "Open-Meteo"
    });
  }

  const payload = {
    ok: true,
    url,
    updatedAt: shanghaiIso(),
    summary: `${venue.label} 开赛附近天气：${parts.join("，") || "数据不足"}。`,
    impacts
  };
  weatherCache.set(url, payload);
  return payload;
}

function enqueueWeatherFetch(url) {
  const request = weatherQueue.then(async () => {
    await sleep(WEATHER_REQUEST_SPACING_MS);
    let result = await withTimeout(timedFetchJson(url), FETCH_TIMEOUT_MS + 1500, "weather");
    if (!result.ok && /429|too many concurrent|too many requests/i.test(String(result.error || ""))) {
      await sleep(1200);
      result = await withTimeout(timedFetchJson(url), FETCH_TIMEOUT_MS + 1500, "weather retry");
    }
    return result;
  });
  weatherQueue = request.catch(() => null);
  return request;
}

function h2hPairKeys(match) {
  const home = String(match.home || "").toUpperCase();
  const away = String(match.away || "").toUpperCase();
  const sorted = [home, away].sort().join("-");
  return [`${home}-${away}`, `${away}-${home}`, sorted].filter(Boolean);
}

function findHeadToHeadOverride(match, h2hOverrides = {}) {
  const pairs = h2hOverrides?.pairs || {};
  for (const key of h2hPairKeys(match)) {
    if (pairs[key]) return pairs[key];
  }
  return null;
}

function h2hTeamName(code) {
  const normalized = String(code || "").toUpperCase();
  return TEAM_DISPLAY_NAMES_ZH[normalized] || TEAM_SEARCH_NAMES[normalized] || normalized;
}

function h2hDateMs(date) {
  const ms = new Date(`${date || ""}T12:00:00Z`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function h2hWindow(match) {
  const kickoff = new Date(match.kickoffShanghai || match.kickoffLocal || Date.now());
  const kickoffMs = Number.isFinite(kickoff.getTime()) ? kickoff.getTime() : Date.now();
  const windowEnd = new Date(kickoffMs);
  const windowStart = new Date(kickoffMs);
  windowStart.setUTCFullYear(windowStart.getUTCFullYear() - H2H_WINDOW_YEARS);
  return {
    startMs: windowStart.getTime(),
    endMs: kickoffMs,
    windowStart: windowStart.toISOString().slice(0, 10),
    windowEnd: windowEnd.toISOString().slice(0, 10),
    asOf: new Date(kickoffMs - 1000).toISOString()
  };
}

function h2hMeetingGoalsFor(meeting, code) {
  const normalized = String(code || "").toUpperCase();
  if (String(meeting.home || "").toUpperCase() === normalized) return Number(meeting.homeGoals);
  if (String(meeting.away || "").toUpperCase() === normalized) return Number(meeting.awayGoals);
  return null;
}

function formatH2hMeeting(meeting) {
  return `${meeting.date}: ${h2hTeamName(meeting.home)} ${meeting.homeGoals}-${meeting.awayGoals} ${h2hTeamName(meeting.away)} (${meeting.competition || "match"})`;
}

function uniqueH2hSources(sources) {
  const seen = new Set();
  return sources.filter((source) => {
    const key = `${source.url || ""}|${source.name || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeH2hWindowText(text) {
  if (!text) return text;
  return String(text)
    .replace(/赛前四年正式 A 级国际赛和友谊赛/g, `赛前${H2H_WINDOW_YEARS}年正式 A 级国际赛和友谊赛`)
    .replace(/近四年无直接交手样本/g, `近${H2H_WINDOW_YEARS}年窗口按可审计比分重新筛选`)
    .replace(/近四年没有可确认直接交手/g, `近${H2H_WINDOW_YEARS}年窗口按可审计比分重新筛选`)
    .replace(/近四年没有可确认交手/g, `近${H2H_WINDOW_YEARS}年窗口按可审计比分重新筛选`)
    .replace(/模型窗口内只使用 2023 这场/g, `近${H2H_WINDOW_YEARS}年窗口内纳入 2023 这场`)
    .replace(/模型窗口内只使用 2025-11-15 美国 2-1 巴拉圭/g, `近${H2H_WINDOW_YEARS}年窗口内纳入 2016、2018、2025 这三场可核验交手`)
    .replace(/模型窗口内只使用 2022 这场/g, `近${H2H_WINDOW_YEARS}年窗口内纳入 2018、2022 这两场`);
}

function buildVerifiedHeadToHeadContext(match, override, fifaRankings) {
  const nowIso = shanghaiIso();
  const window = h2hWindow(match);
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
    const homeGoals = h2hMeetingGoalsFor(meeting, match.home);
    const awayGoals = h2hMeetingGoalsFor(meeting, match.away);
    if (!Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) return;
    summary.homeGoals += homeGoals;
    summary.awayGoals += awayGoals;
    if (homeGoals > awayGoals) summary.homeWins += 1;
    else if (homeGoals < awayGoals) summary.awayWins += 1;
    else summary.draws += 1;
  });

  const homeRank = rankingRecord(fifaRankings, match.home);
  const awayRank = rankingRecord(fifaRankings, match.away);
  const rankingText = homeRank && awayRank ? `长期实力基线：${match.homeName} FIFA 第 ${homeRank}，${match.awayName} FIFA 第 ${awayRank}。` : "长期实力基线部分可用。";
  const allTimeNote = override.allTimeNote || (allMeetings.length
    ? `公开可核验历史交手：${allMeetings.slice(0, 3).map(formatH2hMeeting).join("；")}。`
    : "公开源未记录可结构化历史交手；不把未知交手当成 0 场。");
  const sources = uniqueH2hSources([
    ...(Array.isArray(override.sources) ? override.sources : []),
    ...allMeetings.map((meeting) => ({
      name: meeting.source || "结构化 H2H 来源",
      url: meeting.sourceUrl || "",
      status: "verified"
    }))
  ]).map((source) => ({
    ...source,
    status: source.status || "verified"
  }));

  return {
    windowYears: H2H_WINDOW_YEARS,
    windowStart: window.windowStart,
    windowEnd: window.windowEnd,
    asOf: window.asOf,
    scope: normalizeH2hWindowText(override.scope) || `赛前${H2H_WINDOW_YEARS}年正式 A 级国际赛和友谊赛`,
    summary,
    latestMeetings: recentMeetings.slice(0, 5).map((meeting) => ({
      date: meeting.date,
      competition: meeting.competition || "",
      home: h2hTeamName(meeting.home),
      away: h2hTeamName(meeting.away),
      score: `${meeting.homeGoals}-${meeting.awayGoals}`,
      source: meeting.source || ""
    })),
    allTimeNote: normalizeH2hWindowText(allTimeNote),
    impact: summary.matches > 0
      ? `${rankingText} 近${H2H_WINDOW_YEARS}年有 ${summary.matches} 场直接交手；样本很小，只做低权重复核，不单独大幅调整模型。`
      : `${rankingText} 近${H2H_WINDOW_YEARS}年无可确认直接交手，模型不对胜平负、让球盘或大小球做交手加权。`,
    sourceStatus: summary.matches > 0 ? "verified-structured" : "verified-no-pre-match-meetings",
    sources,
    updatedAt: nowIso
  };
}

function isVerifiedHeadToHead(headToHead) {
  return Boolean(
    headToHead
    && /^verified/i.test(String(headToHead.sourceStatus || ""))
    && headToHead.summary
    && headToHead.summary.matches !== null
    && headToHead.summary.matches !== undefined
  );
}

function buildHeadToHeadContext(match, preview, fifaRankings, h2hOverrides = {}, previousHeadToHead = null) {
  const nowIso = shanghaiIso();
  const override = findHeadToHeadOverride(match, h2hOverrides);
  if (override) return buildVerifiedHeadToHeadContext(match, override, fifaRankings);
  if (isVerifiedHeadToHead(previousHeadToHead)) return previousHeadToHead;

  const window = h2hWindow(match);
  const articleLinks = Array.isArray(preview.articleLinks) ? preview.articleLinks : [];
  const previewSourceUrl = preview.url && !isSearchProxyUrl(preview.url) ? preview.url : "";
  const homeRank = rankingRecord(fifaRankings, match.home);
  const awayRank = rankingRecord(fifaRankings, match.away);
  const rankingText = homeRank && awayRank ? `长期实力基线：${match.homeName} FIFA 第 ${homeRank}，${match.awayName} FIFA 第 ${awayRank}。` : "长期实力基线部分可用。";
  return {
    windowYears: H2H_WINDOW_YEARS,
    windowStart: window.windowStart,
    windowEnd: window.windowEnd,
    asOf: window.asOf,
    scope: `近${H2H_WINDOW_YEARS}年公开交手检索`,
    summary: {
      matches: null,
      homeWins: null,
      draws: null,
      awayWins: null,
      homeGoals: null,
      awayGoals: null
    },
    latestMeetings: [],
    allTimeNote: "已查询公开源，但本轮未抓到可审计比分；标记为待核验，不把未知交手当成 0 场。",
    impact: `${rankingText} 近${H2H_WINDOW_YEARS}年交手待核验前不调整模型，只作为赛前复核项。`,
    sourceStatus: "queried-pending-verification",
    sources: [
      {
        name: previewSourceUrl ? "公开检索/可读文章" : "公开 H2H 检索",
        url: previewSourceUrl,
        status: preview.ok ? "queried" : "failed",
        detail: preview.ok ? "已查询，未完全结构化" : preview.error || "查询失败"
      },
      ...articleLinks.slice(0, 3).map((url) => ({
        name: "候选 H2H/赛前文章",
        url,
        status: "candidate"
      }))
    ],
    updatedAt: nowIso
  };
}

function previousRecentFormRecord(previous, side) {
  const record = previous.recentFormRecords?.[side];
  return record && typeof record === "object" ? record : null;
}

async function buildMatchContext(match, preview, weather, aiAnalysis, openAiConfig, fifaRankings = {}, previous = {}, h2hOverrides = {}) {
  const nowIso = shanghaiIso();
  const aiWithFallback = baselineAiAnalysis(match, preview, weather, fifaRankings, aiAnalysis);
  const effectiveAiAnalysis = aiWithFallback.ok ? aiWithFallback : previous.aiAnalysis?.ok ? {
    ...previous.aiAnalysis,
    stale: true,
    lastError: aiAnalysis.error || "本轮 AI 综合失败，保留上一次成功分析。"
  } : aiWithFallback;
  const snippets = preview.ok ? preview.snippets || [] : [];
  const sourceText = preview.text || "";
  const directSourceNames = (preview.direct?.results || []).filter((result) => result.ok).map((result) => result.name);
  const confirmedLineupText = hasConfirmedLineupText(sourceText);
  const projectedLineupText = hasProjectedLineupText(sourceText);
  const hasLineupSearchLead = snippets.some((snippet) => /projected|probable|predicted|预计|lineup/i.test(snippet)) || projectedLineupText;
  const injurySnippets = snippets.filter(isStrongInjurySnippet);
  const teamNewsSnippets = snippets.filter((snippet) => isUsableTeamNewsSnippet(snippet) && !isStrongInjurySnippet(snippet));
  const directInjurySection = extractSection(sourceText, ["no key injuries to report", "injury and suspension", "injury news", "team news"], 850);
  const directTeamNewsSection = extractSection(sourceText, ["team news", "possible starting lineup", "projected lineup", "predicted xi"], 850);
  const homeLineupNote = extractTeamLineupNote(sourceText, match.homeName, match.home);
  const awayLineupNote = extractTeamLineupNote(sourceText, match.awayName, match.away);
  const homeXi = playerListFromNote(homeLineupNote);
  const awayXi = playerListFromNote(awayLineupNote);
  const hasBothXi = homeXi.length >= 7 && awayXi.length >= 7;
  const confirmedLineup = confirmedLineupText && hasBothXi;
  const projectedLineup = !confirmedLineup && (
    hasBothXi
    || projectedLineupText
    || (effectiveAiAnalysis.ok && effectiveAiAnalysis.lineupStatus === "projected" && effectiveAiAnalysis.lineupConfidence !== "low")
  );
  const injurySummary = baselineInjurySummary(preview, effectiveAiAnalysis, injurySnippets, directInjurySection);
  const teamNewsSummary = directTeamNewsSection || baselineTeamNewsSummary(match, preview, effectiveAiAnalysis, teamNewsSnippets);
  const fallbackRecentForm = {
    home: effectiveAiAnalysis.recentForm?.home?.length
      ? effectiveAiAnalysis.recentForm.home
      : nonWaitingItems(previous.recentForm?.home).length
        ? nonWaitingItems(previous.recentForm.home)
        : baselineRecentForm(match, "home", fifaRankings, snippets),
    away: effectiveAiAnalysis.recentForm?.away?.length
      ? effectiveAiAnalysis.recentForm.away
      : nonWaitingItems(previous.recentForm?.away).length
        ? nonWaitingItems(previous.recentForm.away)
        : baselineRecentForm(match, "away", fifaRankings, snippets)
  };
  const [homeRecentFormRecord, awayRecentFormRecord] = await Promise.all([
    fetchTeamRecentForm(match.home, previousRecentFormRecord(previous, "home")),
    fetchTeamRecentForm(match.away, previousRecentFormRecord(previous, "away"))
  ]);
  const recentForm = {
    home: formTextFromRecord(homeRecentFormRecord, fallbackRecentForm.home),
    away: formTextFromRecord(awayRecentFormRecord, fallbackRecentForm.away)
  };
  const recentFormRecords = {
    home: homeRecentFormRecord,
    away: awayRecentFormRecord
  };
  const tacticalMatchup = baselineTacticalMatchup(match, fifaRankings, effectiveAiAnalysis);
  const mediaConsensus = await fetchOpenAiMediaConsensus(match, preview, openAiConfig, previous.mediaConsensus);

  const lineups = {
    status: confirmedLineup ? "confirmed" : projectedLineup ? "projected" : "unavailable",
    queried: Boolean(preview.ok || effectiveAiAnalysis.ok),
    statusLabel: confirmedLineup
      ? "公开源出现官方/确认首发字样，仍需人工核对官方比赛中心"
      : projectedLineup
        ? `媒体预计阵容已同步，来源：${directSourceNames.join("、") || "公开前瞻"}；不是官方首发`
        : "官方首发未同步，预计阵容不可作为强信号依据",
    home: {
      formation: previous.lineups?.home?.formation || "待确认",
      xi: homeXi,
      notes: homeLineupNote || baselineLineupNote(match, "home", effectiveAiAnalysis, previous.lineups?.home?.notes)
    },
    away: {
      formation: previous.lineups?.away?.formation || "待确认",
      xi: awayXi,
      notes: awayLineupNote || baselineLineupNote(match, "away", effectiveAiAnalysis, previous.lineups?.away?.notes)
    }
  };

  const modelImpacts = [
    ...(Array.isArray(weather.impacts) ? weather.impacts : []),
    ...filteredAiImpacts(match, effectiveAiAnalysis)
  ];

  return {
    updatedAt: nowIso,
    lineups,
    injurySummary,
    teamNewsSummary,
    recentForm,
    recentFormRecords,
    tacticalMatchup,
    riskFlags: effectiveAiAnalysis.ok ? effectiveAiAnalysis.riskFlags : [],
    aiAnalysis: effectiveAiAnalysis,
    mediaConsensus,
    headToHead: buildHeadToHeadContext(match, preview, fifaRankings, h2hOverrides, match.headToHead || previous.headToHead),
    weather: {
      summary: weather.summary || "天气源未同步，暂不调整总进球。",
      updatedAt: weather.updatedAt || null
    },
    modelImpacts,
    sources: {
      lineups: {
        ok: Boolean(confirmedLineup || projectedLineup || preview.ok || effectiveAiAnalysis.ok),
        status: confirmedLineup ? "confirmed" : projectedLineup ? "projected" : "queried-unconfirmed",
        confidence: confirmedLineup ? "high" : projectedLineup ? "medium" : "low",
        updatedAt: preview.ok || effectiveAiAnalysis.ok ? nowIso : null,
        url: preview.url || "",
        error: confirmedLineup ? "" : projectedLineup ? "媒体预计阵容，不是官方首发" : hasLineupSearchLead ? "仅搜索结果线索，未抓到可核验首发页面" : preview.ok ? "未发现可核验首发页面" : preview.error || "未同步"
      },
      injuries: {
        ok: Boolean(preview.ok || effectiveAiAnalysis.ok),
        status: (preview.ok && (injurySnippets.length > 0 || hasUsableInjuryText(sourceText))) || Boolean(effectiveAiAnalysis.injurySummary) ? "verified-or-summarized" : "queried-unconfirmed",
        confidence: (preview.ok && (injurySnippets.length > 0 || hasUsableInjuryText(sourceText))) || Boolean(effectiveAiAnalysis.injurySummary) ? "medium" : "low",
        updatedAt: preview.ok || effectiveAiAnalysis.ok ? nowIso : null,
        url: preview.url || "",
        error: (preview.ok && (injurySnippets.length || hasUsableInjuryText(sourceText))) || (effectiveAiAnalysis.ok && effectiveAiAnalysis.injurySummary) ? "" : "已查询，未发现可确认伤停信息"
      },
      teamNews: {
        ok: Boolean(preview.ok || effectiveAiAnalysis.ok),
        status: (preview.ok && (teamNewsSnippets.length > 0 || Boolean(directTeamNewsSection))) || Boolean(effectiveAiAnalysis.summary) ? "summarized" : "queried-low-signal",
        confidence: (preview.ok && (teamNewsSnippets.length || directTeamNewsSection)) || Boolean(effectiveAiAnalysis.summary) ? "medium" : "low",
        updatedAt: preview.ok || effectiveAiAnalysis.ok ? nowIso : null,
        url: preview.url || "",
        error: (preview.ok && (teamNewsSnippets.length || directTeamNewsSection)) || (effectiveAiAnalysis.ok && effectiveAiAnalysis.summary) ? "" : "已查询，未发现足够球队新闻"
      },
      recentForm: {
        ok: Boolean(homeRecentFormRecord.ok || awayRecentFormRecord.ok),
        status: homeRecentFormRecord.ok && awayRecentFormRecord.ok ? "synced" : "partial",
        confidence: homeRecentFormRecord.ok && awayRecentFormRecord.ok ? "medium" : "low",
        updatedAt: nowIso,
        url: [homeRecentFormRecord.sourceUrl, awayRecentFormRecord.sourceUrl].filter(Boolean).join(" | "),
        error: [homeRecentFormRecord.error, awayRecentFormRecord.error].filter(Boolean).join("；")
      },
      weather: {
        ok: Boolean(weather.ok),
        status: weather.ok ? "synced" : "source-unavailable",
        confidence: weather.ok ? "medium" : "low",
        updatedAt: weather.updatedAt || null,
        url: weather.url || "",
        error: weather.ok ? "" : weather.error || "未同步"
      },
      aiAnalysis: {
        ok: Boolean(effectiveAiAnalysis.ok),
        status: effectiveAiAnalysis.fallback ? "rule-fallback" : effectiveAiAnalysis.ok ? "synced" : "source-unavailable",
        confidence: effectiveAiAnalysis.fallback ? "low" : effectiveAiAnalysis.ok ? "medium" : "low",
        updatedAt: effectiveAiAnalysis.updatedAt || null,
        url: `${openAiConfig.baseUrl}/v1/responses`,
        error: effectiveAiAnalysis.fallback ? "AI接口不可用，使用公开源/规则低置信兜底" : effectiveAiAnalysis.ok ? (effectiveAiAnalysis.stale ? effectiveAiAnalysis.lastError || "" : "") : aiAnalysis.error || "AI 综合分析未启用"
      },
      mediaConsensus: {
        ok: Boolean(mediaConsensus.ok),
        status: mediaConsensus.status || (mediaConsensus.ok ? "synced" : "missing"),
        confidence: mediaConsensus.confidence || "low",
        updatedAt: mediaConsensus.updatedAt || null,
        url: (mediaConsensus.sources || []).map((item) => item.url).filter(Boolean).slice(0, 3).join(" | "),
        error: mediaConsensus.ok ? (mediaConsensus.lastError || "") : mediaConsensus.summary || "媒体共识未同步"
      }
    }
  };
}

async function main() {
  const dashboard = await readJson(DASHBOARD_PATH);
  const previous = await readJson(CONTEXT_PATH, { meta: {}, matches: {} });
  const fifaRankings = await readJson(FIFA_RANKINGS_PATH, {});
  const h2hOverrides = await readJson(H2H_OVERRIDES_PATH, { pairs: {} });

  const runTimeout = setTimeout(() => {
    console.error(`Context sync exceeded ${RUN_TIMEOUT_MS}ms`);
    process.exit(2);
  }, RUN_TIMEOUT_MS);

  const syncPlan = await buildSyncMatches(dashboard);
  const matchEntries = await mapLimit(syncPlan.matches, SOURCE_SYNC_CONCURRENCY, (match) => withTimeout((async () => {
    const [preview, weather] = await Promise.all([
      fetchSearchPreview(match),
      fetchWeather(match)
    ]);
    const openAiConfig = await getOpenAiConfig();
    const aiAnalysis = await fetchOpenAiAnalysis(match, preview, weather);
    return [match.id, await buildMatchContext(match, preview, weather, aiAnalysis, openAiConfig, fifaRankings, previous.matches?.[match.id] || {}, h2hOverrides)];
  })(), MATCH_SYNC_TIMEOUT_MS, `match ${match.id}`).then((result) => {
    if (Array.isArray(result)) return result;
    return [match.id, {
      ...(previous.matches?.[match.id] || {}),
      updatedAt: shanghaiIso(),
      sources: {
        ...(previous.matches?.[match.id]?.sources || {}),
        sync: {
          ok: false,
          updatedAt: shanghaiIso(),
          url: "",
          error: result.error || "match sync timeout"
        }
      }
    }];
  }));
  const matches = Object.fromEntries(matchEntries);

  const payload = {
    meta: {
      ok: true,
      source: "公开情报同步快照",
      lastUpdated: shanghaiIso(),
      notes: "公开抓取结果。缺失或低置信字段不会伪造成事实。",
      schedule: {
        ok: syncPlan.schedule.ok,
        source: syncPlan.schedule.source,
        url: syncPlan.schedule.url,
        error: syncPlan.schedule.error || "",
        matchesInWindow: syncPlan.matches.length
      }
    },
    matches
  };

  await fs.writeFile(CONTEXT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  clearTimeout(runTimeout);
  const archiveResult = await withTimeout(
    recordContextSnapshot(payload).then(() => ({ ok: true })),
    CONTEXT_ARCHIVE_TIMEOUT_MS,
    "context archive"
  );
  if (!archiveResult.ok) {
    console.warn(`Context archive skipped: ${archiveResult.error || "timeout"}`);
  }
  console.log(`Synced worldcup context for ${Object.keys(matches).length} matches at ${payload.meta.lastUpdated}`);
}

main().catch(async (error) => {
  const previous = await readJson(CONTEXT_PATH, { meta: {}, matches: {} });
  const failed = {
    ...previous,
    meta: {
      ...(previous.meta || {}),
      ok: false,
      lastUpdated: shanghaiIso(),
      error: error.message
    }
  };
  await fs.writeFile(CONTEXT_PATH, `${JSON.stringify(failed, null, 2)}\n`);
  await recordContextSnapshot(failed);
  console.error(error);
  process.exit(1);
});
