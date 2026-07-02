const { recordDashboardSnapshot, historyDbPath } = require("./history-store");

const DASHBOARD_URL = process.env.WORLDCUP_DASHBOARD_URL || "http://127.0.0.1:4174/worldcup/api/dashboard?light=1&skipHistory=1";
const REQUEST_TIMEOUT_MS = Number(process.env.WORLDCUP_ARCHIVE_TIMEOUT_MS || 180000);

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "worldcup-history-archiver/0.1"
      }
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 160)}`);
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const dashboard = await fetchJson(DASHBOARD_URL);
  const result = await recordDashboardSnapshot(dashboard, { source: "timer" });
  console.log(`Archived dashboard run ${result.runId} into ${historyDbPath()}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
