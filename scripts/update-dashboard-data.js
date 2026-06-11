const fs = require("fs/promises");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "data", "worldcup-dashboard.json");

function todayShanghaiIso() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(now).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`;
}

function daysBetweenShanghai(dateIso, now = new Date()) {
  const target = new Date(dateIso);
  const targetDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(target);
  const nowDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
  const targetMidnight = new Date(`${targetDay}T00:00:00+08:00`);
  const nowMidnight = new Date(`${nowDay}T00:00:00+08:00`);
  return Math.round((targetMidnight - nowMidnight) / 86400000);
}

async function main() {
  const raw = await fs.readFile(DATA_PATH, "utf8");
  const data = JSON.parse(raw);
  const nowIso = todayShanghaiIso();

  data.meta.lastManualUpdate = nowIso;
  data.meta.notes = "由本地更新脚本刷新。接入实时数据源后，盘口和动态信息会被实时数据覆盖。";

  for (const match of data.matches) {
    const days = daysBetweenShanghai(match.kickoffShanghai);
    if (days > 1) {
      match.dynamic.status = "后续比赛；等待临近赛前信息";
    } else if (days === 1) {
      match.dynamic.status = "明天比赛；重点监控伤病和预计首发";
    } else if (days === 0) {
      match.dynamic.status = "比赛日；发布强信号前必须确认首发";
    } else {
      match.dynamic.status = "已开赛或已结束；需要更新赛果和赛后模型";
    }
    match.dynamic.lastChecked = nowIso;
    match.manualMarkets.lastUpdated = nowIso;
  }

  await fs.writeFile(DATA_PATH, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Updated dashboard data at ${nowIso}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
