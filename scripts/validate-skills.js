const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const skillFiles = [
  ".agents/skills/world-cup-match-intelligence/SKILL.md",
  ".claude/skills/world-cup-match-intelligence/SKILL.md"
];

const requiredProjectPaths = [
  "server.js",
  "public/index.html",
  "data/worldcup-dashboard.json",
  "data/research-framework.json",
  "scripts/sync-worldcup-context.js",
  "scripts/archive-dashboard.js",
  "scripts/record-match-result.js",
  "scripts/history-store.js",
  "deploy"
];

const requiredBodyPatterns = [
  ["workflow section", /## Workflow/],
  ["data quality section", /## Data Quality Logic/],
  ["public source section", /## Public Source Sync/],
  ["market intelligence section", /## Polymarket And Account Intelligence/],
  ["history section", /## History And Backtesting/],
  ["validation commands", /## Validation Commands/],
  ["no fabrication rule", /Do not fabricate/],
  ["financial advice guardrail", /financial advice/],
  ["bilingual UI rule", /bilingual|Chinese and English/i]
];

function parseSkill(filePath) {
  const absolutePath = path.join(ROOT, filePath);
  const text = fs.readFileSync(absolutePath, "utf8");
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`${filePath}: missing YAML frontmatter`);

  const metadata = {};
  for (const line of match[1].split(/\n/)) {
    const index = line.indexOf(":");
    if (index === -1) continue;
    metadata[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }

  return { text, metadata, body: match[2] };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

function main() {
  const parsed = [];

  for (const skillFile of skillFiles) {
    assert(fs.existsSync(path.join(ROOT, skillFile)), `${skillFile} exists`);
    const skill = parseSkill(skillFile);
    parsed.push({ file: skillFile, ...skill });

    const expectedName = path.basename(path.dirname(skillFile));
    assert(Boolean(skill.metadata.name), `${skillFile} has name`);
    assert(Boolean(skill.metadata.description), `${skillFile} has description`);
    assert(skill.metadata.name === expectedName, `${skillFile} name matches directory`);
    assert(/football match intelligence workflows/i.test(skill.metadata.description), `${skillFile} description targets reusable match intelligence workflows`);
    assert(/reference World Cup dashboard implementation/i.test(skill.metadata.description), `${skillFile} description mentions the reference dashboard`);
    assert(skill.body.split(/\n/).length <= 220, `${skillFile} remains concise enough for skill loading`);

    for (const [label, pattern] of requiredBodyPatterns) {
      assert(pattern.test(skill.body), `${skillFile} includes ${label}`);
    }
  }

  for (const projectPath of requiredProjectPaths) {
    assert(fs.existsSync(path.join(ROOT, projectPath)), `${projectPath} exists`);
  }

  assert(parsed[0].text === parsed[1].text, "Codex and Claude skill files are identical");
}

try {
  main();
} catch (error) {
  console.error(`FAIL ${error.message}`);
  process.exit(1);
}
