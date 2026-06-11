const { recordMatchResult, historyDbPath } = require("./history-store");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/record-match-result.js --match 2026-06-12-mex-rsa --home-goals 2 --away-goals 1 --source manual",
    "",
    "Required: --match, --home-goals, --away-goals"
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.match || args["home-goals"] === undefined || args["away-goals"] === undefined) {
    console.error(usage());
    process.exit(2);
  }

  const result = await recordMatchResult({
    matchId: args.match,
    homeGoals: Number(args["home-goals"]),
    awayGoals: Number(args["away-goals"]),
    status: args.status || "final",
    finishedAt: args["finished-at"] || null,
    source: args.source || "manual"
  });
  console.log(`Recorded result for ${result.matchId} into ${historyDbPath()} at ${result.updatedAt}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
