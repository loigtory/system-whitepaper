#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");

function normalizePath(filePath) {
  return String(filePath || "").trim().replace(/\\/g, "/");
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function splitChangedFiles(value) {
  return unique(
    String(value || "")
      .split(/[\r\n,;]+/)
      .map(normalizePath)
      .filter(Boolean),
  );
}

function runGit(args) {
  const safeDir = REPO_ROOT.replace(/\\/g, "/");
  const result = spawnSync(
    "git",
    ["-c", `safe.directory=${safeDir}`, "-c", "core.quotepath=false", ...args],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      shell: false,
      maxBuffer: 1024 * 1024 * 8,
    },
  );
  return {
    code: result.status == null ? 1 : result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || (result.error && result.error.message) || "",
  };
}

function detectChangedFiles(options = {}) {
  const fromEnv = splitChangedFiles(process.env.QUALITY_GATE_CHANGED_FILES);
  if (fromEnv.length) return { files: fromEnv, source: "QUALITY_GATE_CHANGED_FILES" };

  const base = options.base || process.env.QUALITY_GATE_BASE || "HEAD";
  const files = [];
  const results = [];
  for (const args of [
    ["diff", "--name-only", base],
    ["diff", "--cached", "--name-only"],
    ["ls-files", "--others", "--exclude-standard"],
  ]) {
    const result = runGit(args);
    results.push(result);
    if (result.code === 0) files.push(...result.stdout.split(/\r?\n/));
  }
  if (!results.some((item) => item.code === 0)) {
    const reason = results.map((item) => item.stderr || item.stdout).find(Boolean) || "git failed";
    throw new Error(`Unable to detect changed files: ${reason}`);
  }
  return {
    files: unique(files.map(normalizePath).filter(Boolean)),
    source: `git diff ${base} + staged + untracked`,
  };
}

function classifyGateImpact(files = []) {
  const normalized = files.map(normalizePath).filter(Boolean);
  const impact = {
    docsOnly: normalized.length > 0,
    hasBehavior: false,
    hasCore: false,
    hasFull: false,
    reasons: [],
  };
  if (!normalized.length) {
    impact.docsOnly = false;
    impact.reasons.push("no-changes");
    return impact;
  }

  for (const file of normalized) {
    const lower = file.toLowerCase();
    const isDoc =
      lower.endsWith(".md") ||
      lower.startsWith("docs/") ||
      lower === "readme.md" ||
      lower === "agents.md";
    if (!isDoc) impact.docsOnly = false;

    if (
      lower === "package.json" ||
      lower.startsWith(".agents/") ||
      lower.startsWith(".quality-gate/") ||
      lower.startsWith("scripts/system-whitepaper-lib.js") ||
      lower.startsWith("scripts/operation-spec/") ||
      lower.endsWith("system-whitepaper.test.js")
    ) {
      impact.hasBehavior = true;
      impact.hasCore = true;
      impact.reasons.push("core-source");
    }

    if (
      lower.startsWith("scripts/collect-evidence.js") ||
      lower.startsWith("scripts/refresh-huntian-cookie.js") ||
      lower.startsWith("scripts/collect-database-profile.js") ||
      lower.startsWith("scripts/build-database-model.js") ||
      lower.startsWith("scripts/check-truth-readiness.js") ||
      lower.startsWith("scripts/check-batch-acceptance.js") ||
      lower.startsWith("scripts/check-delivery-readiness.js") ||
      lower.startsWith("scripts/check-real-run-readiness.js") ||
      lower.startsWith("scripts/run-whitepaper-pipeline.js") ||
      lower.startsWith("scripts/run-whitepaper-batch.js") ||
      lower.startsWith("scripts/run-review-decision.js") ||
      lower.startsWith("scripts/validate-write.js")
    ) {
      impact.hasBehavior = true;
      impact.hasFull = true;
      impact.reasons.push("real-run-or-readiness");
    }

    if (!isDoc && lower.startsWith("scripts/")) {
      impact.hasBehavior = true;
      impact.hasCore = true;
      impact.reasons.push("script-change");
    }
  }

  if (impact.docsOnly) impact.reasons.push("docs-only");
  impact.reasons = unique(impact.reasons);
  return impact;
}

function selectGateLevel(impact = {}) {
  if (impact.hasFull) return "full";
  if (impact.hasCore || impact.hasBehavior) return "core";
  return "quick";
}

function buildGateCommand(level) {
  return ["npm", "run", `test:gate:${level || "quick"}`];
}

function parseArgs(argv = []) {
  const args = { dryRun: false, base: "", level: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--base") args.base = argv[++index] || "";
    else if (arg.startsWith("--base=")) args.base = arg.slice("--base=".length);
    else if (arg === "--level") args.level = argv[++index] || "";
    else if (arg.startsWith("--level=")) args.level = arg.slice("--level=".length);
  }
  return args;
}

function runAutoGate(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const changed = detectChangedFiles({ base: args.base });
  const impact = classifyGateImpact(changed.files);
  const level = args.level || selectGateLevel(impact);
  const command = buildGateCommand(level);
  console.log(`[quality-gate-auto] source=${changed.source}`);
  console.log(`[quality-gate-auto] changed=${changed.files.length}`);
  console.log(`[quality-gate-auto] level=${level}`);
  console.log(`[quality-gate-auto] reasons=${impact.reasons.join(",") || "none"}`);
  if (args.dryRun) {
    console.log(`[quality-gate-auto] command=${command.join(" ")}`);
    return { status: "planned", level, command, changed, impact };
  }
  const result = spawnSync(command[0], command.slice(1), {
    cwd: REPO_ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  const code = result.status == null ? 1 : result.status;
  return { status: code === 0 ? "pass" : "fail", code, level, command, changed, impact };
}

if (require.main === module) {
  try {
    const result = runAutoGate();
    process.exit(result.code || 0);
  } catch (error) {
    console.error(`[quality-gate-auto] failed: ${error && error.message ? error.message : error}`);
    process.exit(1);
  }
} else {
  module.exports = {
    buildGateCommand,
    classifyGateImpact,
    detectChangedFiles,
    runAutoGate,
    selectGateLevel,
  };
}
