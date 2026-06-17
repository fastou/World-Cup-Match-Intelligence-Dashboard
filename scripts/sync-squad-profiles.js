const fs = require("fs/promises");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUTPUT_PATH = path.join(ROOT, "data", "squad-profiles.json");
const SQUAD_SOURCE_URL = "https://mikami3345.cloudfree.jp/WorldCup2026/WorldCupNations/all_squads-manual.json";
const TEAM_STATS_SOURCE_URL = "https://mikami3345.cloudfree.jp/WorldCup2026/WorldCupNations/English-ver/WorldCupNations-En.html";
const TRANSFERMARKT_WORLD_CUP_URL = "https://www.transfermarkt.com/world-cup/teilnehmer/pokalwettbewerb/FIWC";

const TEAM_COUNTRY_IDS = {
  MEX: "mexico",
  RSA: "south_africa",
  KOR: "south_korea",
  CZE: "czech_republic",
  CAN: "canada",
  BIH: "bosnia_and_herzegovina",
  USA: "united_states",
  PAR: "paraguay",
  QAT: "qatar",
  SUI: "switzerland",
  BRA: "brazil",
  MAR: "morocco",
  HAI: "haiti",
  SCO: "scotland",
  AUS: "australia",
  TUR: "turkey",
  GER: "germany",
  CUW: "curaao",
  NED: "netherlands",
  JPN: "japan",
  CIV: "ivory_coast",
  ECU: "ecuador",
  SWE: "sweden",
  TUN: "tunisia",
  ESP: "spain",
  CPV: "cape_verde",
  BEL: "belgium",
  EGY: "egypt",
  KSA: "saudi_arabia",
  URU: "uruguay",
  IRN: "iran",
  NZL: "new_zealand",
  FRA: "france",
  SEN: "senegal",
  IRQ: "iraq",
  NOR: "norway",
  ARG: "argentina",
  ALG: "algeria",
  AUT: "austria",
  JOR: "jordan",
  POR: "portugal",
  COD: "dr_congo",
  CRO: "croatia",
  ENG: "england",
  GHA: "ghana",
  PAN: "panama",
  COL: "colombia",
  UZB: "uzbekistan"
};

const TEAM_NAMES = {
  MEX: ["Mexico", "墨西哥"],
  RSA: ["South Africa", "南非"],
  KOR: ["South Korea", "韩国"],
  CZE: ["Czechia", "捷克"],
  CAN: ["Canada", "加拿大"],
  BIH: ["Bosnia-Herzegovina", "波黑"],
  USA: ["United States", "美国"],
  PAR: ["Paraguay", "巴拉圭"],
  QAT: ["Qatar", "卡塔尔"],
  SUI: ["Switzerland", "瑞士"],
  BRA: ["Brazil", "巴西"],
  MAR: ["Morocco", "摩洛哥"],
  HAI: ["Haiti", "海地"],
  SCO: ["Scotland", "苏格兰"],
  AUS: ["Australia", "澳大利亚"],
  TUR: ["Türkiye", "土耳其"],
  GER: ["Germany", "德国"],
  CUW: ["Curaçao", "库拉索"],
  NED: ["Netherlands", "荷兰"],
  JPN: ["Japan", "日本"],
  CIV: ["Ivory Coast", "科特迪瓦"],
  ECU: ["Ecuador", "厄瓜多尔"],
  SWE: ["Sweden", "瑞典"],
  TUN: ["Tunisia", "突尼斯"],
  ESP: ["Spain", "西班牙"],
  CPV: ["Cape Verde", "佛得角"],
  BEL: ["Belgium", "比利时"],
  EGY: ["Egypt", "埃及"],
  KSA: ["Saudi Arabia", "沙特阿拉伯"],
  URU: ["Uruguay", "乌拉圭"],
  IRN: ["Iran", "伊朗"],
  NZL: ["New Zealand", "新西兰"],
  FRA: ["France", "法国"],
  SEN: ["Senegal", "塞内加尔"],
  IRQ: ["Iraq", "伊拉克"],
  NOR: ["Norway", "挪威"],
  ARG: ["Argentina", "阿根廷"],
  ALG: ["Algeria", "阿尔及利亚"],
  AUT: ["Austria", "奥地利"],
  JOR: ["Jordan", "约旦"],
  POR: ["Portugal", "葡萄牙"],
  COD: ["Congo DR", "刚果（金）"],
  CRO: ["Croatia", "克罗地亚"],
  ENG: ["England", "英格兰"],
  GHA: ["Ghana", "加纳"],
  PAN: ["Panama", "巴拿马"],
  COL: ["Colombia", "哥伦比亚"],
  UZB: ["Uzbekistan", "乌兹别克斯坦"]
};

const POSITION_GROUPS = {
  Goalkeeper: "GK",
  GK: "GK",
  "Centre-Back": "DF",
  "Left-Back": "DF",
  "Right-Back": "DF",
  DF: "DF",
  "Defensive Midfield": "MF",
  "Central Midfield": "MF",
  "Attacking Midfield": "MF",
  "Right Midfield": "MF",
  "Left Midfield": "MF",
  MF: "MF",
  "Right Winger": "FW",
  "Left Winger": "FW",
  "Centre-Forward": "FW",
  "Second Striker": "FW",
  FW: "FW"
};

const UEFA_TIER_MAP = {
  "bayern munich": 1,
  "real madrid": 1,
  "paris saint-germain": 1,
  "liverpool fc": 1,
  "inter milan": 1,
  "internazionale": 1,
  "manchester city": 1,
  "arsenal fc": 1,
  "fc barcelona": 1,
  "bayer 04 leverkusen": 1,
  "bayer leverkusen": 1,
  "atlético de madrid": 1,
  "atlético madrid": 1,
  "borussia dortmund": 1,
  "chelsea fc": 1,
  "chelsea": 1,
  "as roma": 2,
  roma: 2,
  "sl benfica": 2,
  "sporting cp": 2,
  "atalanta bc": 2,
  "eintracht frankfurt": 2,
  "tottenham hotspur": 2,
  "aston villa": 2,
  "fc porto": 2,
  porto: 2,
  "manchester united": 2,
  "acf fiorentina": 2,
  "club brugge kv": 2,
  "real betis balompié": 2,
  "real betis": 2,
  "juventus fc": 3,
  "psv eindhoven": 3,
  "feyenoord rotterdam": 3,
  "west ham united": 3,
  "losc lille": 3,
  "ac milan": 3,
  milan: 3,
  "olympique lyon": 3,
  "fk bodø/glimt": 3,
  "sc braga": 3,
  "ssc napoli": 3,
  "az alkmaar": 3,
  az: 3,
  "olympiacos piraeus": 3,
  "rb leipzig": 4,
  "rangers fc": 4,
  "villarreal cf": 4,
  "ss lazio": 4,
  "ajax amsterdam": 4,
  fenerbahce: 4,
  "fenerbahçe": 4,
  "real sociedad": 4,
  "sc freiburg": 4,
  "as monaco": 4,
  "fc copenhagen": 4,
  "olympique marseille": 4,
  marseille: 4,
  "shakhtar donetsk": 4
};

function parseNumber(value) {
  const cleaned = String(value || "").replace(/[^\d.-]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function parseHeightCm(value) {
  const raw = String(value || "").replace("m", "").replace(",", ".").trim();
  const meters = Number(raw);
  if (!Number.isFinite(meters) || meters <= 0) return null;
  return Math.round(meters * 1000) / 10;
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function positionGroup(position) {
  return POSITION_GROUPS[position] || "OTHER";
}

function clubTier(club) {
  const key = String(club || "").trim().toLowerCase();
  return UEFA_TIER_MAP[key] || 5;
}

function summarizePlayers(players) {
  const tierCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const heights = [];
  const ages = [];
  const caps = [];
  const enriched = players.map((player) => {
    const tier = clubTier(player.club);
    tierCounts[tier] += 1;
    const heightCm = parseHeightCm(player.height);
    const age = parseNumber(player.age);
    const capCount = parseNumber(player.caps);
    if (heightCm) heights.push(heightCm);
    if (age) ages.push(age);
    if (capCount !== null) caps.push(capCount);
    return {
      name: player.name,
      position: player.position,
      group: positionGroup(player.position),
      club: player.club,
      heightCm,
      age,
      caps: capCount,
      tier
    };
  });

  const avg = (items) => items.length ? items.reduce((sum, value) => sum + value, 0) / items.length : null;
  const topTierCount = tierCounts[1] + tierCounts[2];
  const sortedNotables = [...enriched]
    .sort((a, b) => (a.tier - b.tier) || ((b.caps || 0) - (a.caps || 0)))
    .slice(0, 5)
    .map((player) => ({
      name: player.name,
      position: player.position,
      club: player.club,
      tier: player.tier,
      caps: player.caps,
      heightCm: player.heightCm
    }));

  return {
    players: players.length,
    avgAge: round(avg(ages), 1),
    avgHeightCm: round(avg(heights), 1),
    avgCaps: round(avg(caps), 1),
    heightCount: heights.length,
    capsCount: caps.length,
    tierCounts,
    topTierCount,
    topTierShare: players.length ? round(topTierCount / players.length, 3) : null,
    notablePlayers: sortedNotables
  };
}

function buildProfile(code, countryId, players) {
  const [team, teamZh] = TEAM_NAMES[code] || [code, code];
  const groups = {
    all: summarizePlayers(players),
    GK: summarizePlayers(players.filter((player) => positionGroup(player.position) === "GK")),
    DF: summarizePlayers(players.filter((player) => positionGroup(player.position) === "DF")),
    MF: summarizePlayers(players.filter((player) => positionGroup(player.position) === "MF")),
    FW: summarizePlayers(players.filter((player) => positionGroup(player.position) === "FW"))
  };
  return {
    ok: players.length > 0,
    status: players.length > 0 ? "synced" : "missing",
    teamCode: code,
    countryId,
    team,
    teamZh,
    source: "World Cup 2026 Team Stats / squad profile",
    sourceUrl: TEAM_STATS_SOURCE_URL,
    rawSquadsUrl: SQUAD_SOURCE_URL,
    updatedAt: new Date().toISOString(),
    methodology: "Player position, age, height, caps and club are pulled from a public squad dataset. Club tier is a proxy based on UEFA five-year club coefficient bands used by the source page. Market value is not inferred when Transfermarkt is unreachable.",
    methodologyZh: "球员位置、年龄、身高、国家队出场和俱乐部来自公开阵容数据；俱乐部分层按源页面采用的 UEFA 五年俱乐部积分区间做 proxy。Transfermarkt 不可访问时不推断身价。",
    groups,
    marketValue: {
      status: "unavailable",
      source: "Transfermarkt",
      sourceUrl: TRANSFERMARKT_WORLD_CUP_URL,
      note: "Transfermarkt team market value page is protected by human verification from this environment; value data is not fabricated.",
      noteZh: "当前环境访问 Transfermarkt 球队身价页会触发人机验证，因此不伪造身价；暂用俱乐部分层 proxy 辅助判断。"
    }
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "WorldCupMatchIntelligenceDashboard/0.1 (+https://github.com/fastou/World-Cup-Match-Intelligence-Dashboard)"
    }
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function main() {
  const rawSquads = await fetchJson(SQUAD_SOURCE_URL);
  const teams = {};
  const missing = [];
  for (const [code, countryId] of Object.entries(TEAM_COUNTRY_IDS)) {
    const players = Array.isArray(rawSquads[countryId]) ? rawSquads[countryId] : [];
    if (!players.length) missing.push(code);
    teams[code] = buildProfile(code, countryId, players);
  }

  const payload = {
    ok: missing.length === 0,
    source: "World Cup 2026 Team Stats: Age, Height & Club Tiers by Country",
    sourceUrl: TEAM_STATS_SOURCE_URL,
    rawSquadsUrl: SQUAD_SOURCE_URL,
    updatedAt: new Date().toISOString(),
    teamCount: Object.keys(teams).length,
    missing,
    methodology: "Public squad dataset with player position, age, height, caps and club. Club tier counts are used as an auditable proxy for squad quality by line; market value is left unavailable when a reliable public source cannot be fetched.",
    methodologyZh: "公开阵容数据包含球员位置、年龄、身高、出场和俱乐部；按位置统计身高、经验和俱乐部分层，作为可审计的阵容质量 proxy。可靠身价源不可抓取时，身价字段保持不可用。",
    teams
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${OUTPUT_PATH} (${Object.keys(teams).length} teams, missing ${missing.length})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
