const fs = require("fs/promises");
const path = require("path");
const { recordContextSnapshot } = require("./history-store");

const DASHBOARD_PATH = path.join(__dirname, "..", "data", "worldcup-dashboard.json");
const CONTEXT_PATH = path.join(__dirname, "..", "data", "worldcup-context.json");
const ENV_PATH = process.env.WORLDCUP_ENV_PATH || "/etc/worldcup-dashboard.env";
const FETCH_TIMEOUT_MS = 8000;
const MATCH_SYNC_TIMEOUT_MS = 50000;
const RUN_TIMEOUT_MS = 90000;
const OPENAI_TIMEOUT_MS = 30000;
const MATCH_WINDOW_DAYS = Number(process.env.MATCH_WINDOW_DAYS || 3);
const MATCH_HIDE_AFTER_HOURS = Number(process.env.MATCH_HIDE_AFTER_HOURS || 3);
const ESPN_WORLDCUP_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";

const VENUE_COORDINATES = {
  "墨西哥城": { latitude: 19.4326, longitude: -99.1332, label: "墨西哥城" },
  "瓜达拉哈拉/萨波潘": { latitude: 20.6597, longitude: -103.3496, label: "瓜达拉哈拉/萨波潘" },
  "待确认": null
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
  NZL: "New Zealand"
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
  NZL: "新西兰"
};

const ARTICLE_DOMAINS = [
  "fifa.com",
  "espn.com",
  "si.com",
  "sportingnews.com",
  "sportsmole.co.uk",
  "101greatgoals.com",
  "futbolupdate.com",
  "goal.com",
  "cbssports.com",
  "reuters.com",
  "apnews.com"
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

async function getOpenAiConfig() {
  const env = await readEnvFile();
  const config = {
    apiKey: process.env.OPENAI_API_KEY || env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || env.OPENAI_MODEL || "gpt-4o-mini",
    baseUrl: (process.env.OPENAI_BASE_URL || env.OPENAI_BASE_URL || "https://api.openai.com").replace(/\/+$/, "")
  };
  if (process.env.DEBUG_OPENAI_CONFIG === "1") {
    console.error(JSON.stringify({
      envPath: ENV_PATH,
      hasProcessKey: Boolean(process.env.OPENAI_API_KEY),
      envKeys: Object.keys(env),
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

async function fetchScheduleWindow(now = new Date()) {
  const dates = [];
  for (let offset = 0; offset <= MATCH_WINDOW_DAYS; offset += 1) {
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
        }
      };
    })
  };
}

function scheduleMatchFromEvent(event) {
  const kickoffMs = dateMs(event.kickoffUtc);
  if (!kickoffMs || !inUpcomingWindow(event.kickoffUtc)) return null;
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
    venue: "待确认",
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

function readableProxyUrl(url) {
  return `https://r.jina.ai/http://${url.replace(/^https?:\/\//i, "")}`;
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

function extractTeamLineupNote(sourceText, teamName, teamCode) {
  const englishName = TEAM_SEARCH_NAMES[teamCode] || teamName;
  const clean = String(sourceText || "").replace(/\s+/g, " ");
  const patterns = [
    `${englishName} possible starting lineup:`,
    `${englishName} projected lineup:`,
    `${englishName} predicted lineup:`,
    `${englishName} predicted xi:`,
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
  return after
    .split(/[;,]/)
    .map((item) => item.trim())
    .map((item) => item.replace(/\b(Mexico|South Africa|South Korea|Czech Republic|Czechia)\b.*$/i, "").trim())
    .filter(Boolean)
    .slice(0, 11);
}

function summarizeNews(snippets, fallback) {
  if (!snippets.length) return fallback;
  return snippets.join(" / ").slice(0, 420);
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

function searchQueries(match) {
  const homeEn = match.homeEnglishName || TEAM_SEARCH_NAMES[match.home] || match.homeName;
  const awayEn = match.awayEnglishName || TEAM_SEARCH_NAMES[match.away] || match.awayName;
  return [
    `${homeEn} vs ${awayEn} World Cup preview team news lineups injuries`,
    `${homeEn} ${awayEn} predicted lineups injury news World Cup`,
    `${match.homeName} ${match.awayName} 世界杯 伤停 首发 阵容`
  ];
}

async function fetchSearchPreview(match) {
  const direct = await fetchDirectSources(match);
  const searches = await Promise.all(searchQueries(match).map(async (queryText) => {
    const query = encodeURIComponent(queryText);
    const url = `https://r.jina.ai/http://duckduckgo.com/html/?q=${query}`;
    const result = await withTimeout(timedFetchText(url), FETCH_TIMEOUT_MS + 1500, "search preview");
    return { ...result, queryText };
  }));

  const okSearches = searches.filter((result) => result.ok);
  const combinedText = okSearches.map((result) => result.text).join("\n");
  if (!okSearches.length && !direct.ok) {
    return {
      ok: false,
      url: searches[0]?.url || "",
      error: searches.map((result) => result.error).filter(Boolean).join("; ") || "search failed",
      direct,
      searches
    };
  }

  const links = extractSearchLinks(combinedText, 4);
  const articles = await Promise.all(links.map(fetchReadableArticle));
  const okArticles = articles.filter((article) => article.ok);
  const articleText = okArticles.map((article) => article.text).join("\n");
  const text = `${direct.text || ""}\n${combinedText}\n${articleText}`;

  return {
    ok: true,
    url: direct.results?.find((result) => result.ok)?.originalUrl || okSearches[0]?.url || "",
    direct,
    searches,
    articles,
    articleLinks: links,
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
      "starting"
    ], 10),
    text
  };
}

async function fetchWeather(match) {
  const venue = VENUE_COORDINATES[match.venue];
  if (!venue) {
    return {
      ok: false,
      error: `没有 ${match.venue} 的坐标配置`,
      summary: "天气源未配置，暂不调整总进球。"
    };
  }

  const date = new Date(match.kickoffLocal || match.kickoffShanghai);
  const datePart = Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${venue.latitude}&longitude=${venue.longitude}&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,wind_speed_10m&start_date=${datePart}&end_date=${datePart}&timezone=auto`;
  const result = await withTimeout(timedFetchJson(url), FETCH_TIMEOUT_MS + 1500, "weather");
  if (!result.ok) {
    return {
      ...result,
      summary: "天气源请求失败，暂不调整总进球。"
    };
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

  return {
    ok: true,
    url,
    updatedAt: shanghaiIso(),
    summary: `${venue.label} 开赛附近天气：${parts.join("，") || "数据不足"}。`,
    impacts
  };
}

function buildMatchContext(match, preview, weather, aiAnalysis, openAiConfig, previous = {}) {
  const nowIso = shanghaiIso();
  const effectiveAiAnalysis = aiAnalysis.ok ? aiAnalysis : previous.aiAnalysis?.ok ? {
    ...previous.aiAnalysis,
    stale: true,
    lastError: aiAnalysis.error || "本轮 AI 综合失败，保留上一次成功分析。"
  } : aiAnalysis;
  const snippets = preview.ok ? preview.snippets || [] : [];
  const sourceText = preview.text || "";
  const directSourceNames = (preview.direct?.results || []).filter((result) => result.ok).map((result) => result.name);
  const confirmedLineup = hasConfirmedLineupText(sourceText);
  const projectedLineup = !confirmedLineup && (hasProjectedLineupText(sourceText) || (effectiveAiAnalysis.ok && effectiveAiAnalysis.lineupStatus === "projected" && effectiveAiAnalysis.lineupConfidence !== "low"));
  const hasLineupSearchLead = snippets.some((snippet) => /projected|probable|predicted|预计|lineup/i.test(snippet)) || projectedLineup;
  const injurySnippets = snippets.filter(isStrongInjurySnippet);
  const teamNewsSnippets = snippets.filter((snippet) => isUsableTeamNewsSnippet(snippet) && !isStrongInjurySnippet(snippet));
  const directInjurySection = extractSection(sourceText, ["no key injuries to report", "injury and suspension", "injury news", "team news"], 850);
  const directTeamNewsSection = extractSection(sourceText, ["team news", "possible starting lineup", "projected lineup", "predicted xi"], 850);
  const homeLineupNote = extractTeamLineupNote(sourceText, match.homeName, match.home);
  const awayLineupNote = extractTeamLineupNote(sourceText, match.awayName, match.away);
  const injurySummary = effectiveAiAnalysis.ok && effectiveAiAnalysis.injurySummary
    ? effectiveAiAnalysis.injurySummary
    : cleanInjurySection(directInjurySection) || summarizeNews(injurySnippets, "公开伤停源未发现可确认信息；发布强信号前仍需人工核对。");
  const teamNewsSummary = effectiveAiAnalysis.ok && effectiveAiAnalysis.summary
    ? effectiveAiAnalysis.summary
    : directTeamNewsSection || summarizeNews(teamNewsSnippets, "公开球队新闻源暂未提供足够可用信息。");

  const lineups = {
    status: confirmedLineup ? "confirmed" : projectedLineup ? "projected" : "unavailable",
    statusLabel: confirmedLineup
      ? "公开源出现官方/确认首发字样，仍需人工核对官方比赛中心"
      : projectedLineup
        ? `媒体预计阵容已同步，来源：${directSourceNames.join("、") || "公开前瞻"}；不是官方首发`
        : "官方首发未同步，预计阵容不可作为强信号依据",
    home: {
      formation: previous.lineups?.home?.formation || "待确认",
      xi: playerListFromNote(homeLineupNote),
      notes: homeLineupNote || (effectiveAiAnalysis.ok && effectiveAiAnalysis.homeNotes ? effectiveAiAnalysis.homeNotes : previous.lineups?.home?.notes || "等待官方比赛中心或可靠赛前源更新。")
    },
    away: {
      formation: previous.lineups?.away?.formation || "待确认",
      xi: playerListFromNote(awayLineupNote),
      notes: awayLineupNote || (effectiveAiAnalysis.ok && effectiveAiAnalysis.awayNotes ? effectiveAiAnalysis.awayNotes : previous.lineups?.away?.notes || "等待官方比赛中心或可靠赛前源更新。")
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
    recentForm: {
      home: previous.recentForm?.home || ["等待公开近期状态源更新"],
      away: previous.recentForm?.away || ["等待公开近期状态源更新"]
    },
    tacticalMatchup: effectiveAiAnalysis.ok && effectiveAiAnalysis.tacticalMatchup ? effectiveAiAnalysis.tacticalMatchup : previous.tacticalMatchup || "等待赛前 preview 和阵容信息后评估战术对位。",
    riskFlags: effectiveAiAnalysis.ok ? effectiveAiAnalysis.riskFlags : [],
    aiAnalysis: effectiveAiAnalysis,
    weather: {
      summary: weather.summary || "天气源未同步，暂不调整总进球。",
      updatedAt: weather.updatedAt || null
    },
    modelImpacts,
    sources: {
      lineups: {
        ok: confirmedLineup || projectedLineup,
        updatedAt: preview.ok ? nowIso : null,
        url: preview.url || "",
        error: confirmedLineup ? "" : projectedLineup ? "媒体预计阵容，不是官方首发" : hasLineupSearchLead ? "仅搜索结果线索，未抓到可核验首发页面" : preview.ok ? "未发现可核验首发页面" : preview.error || "未同步"
      },
      injuries: {
        ok: (preview.ok && (injurySnippets.length > 0 || hasUsableInjuryText(sourceText))) || Boolean(effectiveAiAnalysis.ok && effectiveAiAnalysis.injurySummary),
        updatedAt: preview.ok || effectiveAiAnalysis.ok ? nowIso : null,
        url: preview.url || "",
        error: (preview.ok && (injurySnippets.length || hasUsableInjuryText(sourceText))) || (effectiveAiAnalysis.ok && effectiveAiAnalysis.injurySummary) ? "" : "未发现可确认伤停信息"
      },
      teamNews: {
        ok: (preview.ok && (teamNewsSnippets.length > 0 || Boolean(directTeamNewsSection))) || Boolean(effectiveAiAnalysis.ok && effectiveAiAnalysis.summary),
        updatedAt: preview.ok || effectiveAiAnalysis.ok ? nowIso : null,
        url: preview.url || "",
        error: (preview.ok && (teamNewsSnippets.length || directTeamNewsSection)) || (effectiveAiAnalysis.ok && effectiveAiAnalysis.summary) ? "" : "未发现足够球队新闻"
      },
      weather: {
        ok: Boolean(weather.ok),
        updatedAt: weather.updatedAt || null,
        url: weather.url || "",
        error: weather.ok ? "" : weather.error || "未同步"
      },
      aiAnalysis: {
        ok: Boolean(effectiveAiAnalysis.ok),
        updatedAt: effectiveAiAnalysis.updatedAt || null,
        url: `${openAiConfig.baseUrl}/v1/responses`,
        error: effectiveAiAnalysis.ok ? (effectiveAiAnalysis.stale ? effectiveAiAnalysis.lastError || "" : "") : aiAnalysis.error || "AI 综合分析未启用"
      }
    }
  };
}

async function main() {
  const dashboard = await readJson(DASHBOARD_PATH);
  const previous = await readJson(CONTEXT_PATH, { meta: {}, matches: {} });

  const runTimeout = setTimeout(() => {
    console.error(`Context sync exceeded ${RUN_TIMEOUT_MS}ms`);
    process.exit(2);
  }, RUN_TIMEOUT_MS);

  const syncPlan = await buildSyncMatches(dashboard);
  const matchEntries = await Promise.all(syncPlan.matches.map((match) => withTimeout((async () => {
    const [preview, weather] = await Promise.all([
      fetchSearchPreview(match),
      fetchWeather(match)
    ]);
    const openAiConfig = await getOpenAiConfig();
    const aiAnalysis = await fetchOpenAiAnalysis(match, preview, weather);
    return [match.id, buildMatchContext(match, preview, weather, aiAnalysis, openAiConfig, previous.matches?.[match.id] || {})];
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
  })));
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
  await recordContextSnapshot(payload);
  clearTimeout(runTimeout);
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
