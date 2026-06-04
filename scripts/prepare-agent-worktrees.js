#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { parseArgs, writeJson } = require("./system-whitepaper-lib");
const { DEFAULT_PLAN_PATH, parseGitWorktreeList, validateAgentIsolationPlan } = require("./check-agent-isolation");

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function asBooleanFlag(value) {
  return value === true || value === "true" || value === "1" || value === "yes";
}

function normalizeBranchName(value) {
  return String(value || "")
    .trim()
    .replace(/^refs\/heads\//, "");
}

function normalizePathText(value) {
  return String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/");
}

function normalizeWorktreePath(value) {
  const normalized = normalizePathText(value);
  if (!normalized) return "";
  return path.resolve(normalized).replace(/\\/g, "/").toLowerCase();
}

function normalizeScopePath(value) {
  const raw = normalizePathText(value).replace(/^\.\//, "");
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function compactItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function issue(id, message, extra = {}) {
  return {
    id,
    severity: extra.severity || "P0",
    workerId: extra.workerId || "",
    message,
  };
}

function runGitCommand(args = [], options = {}) {
  if (typeof options.git === "function") {
    return String(options.git(args, { cwd: options.cwd || process.cwd() }) || "");
  }
  return execFileSync("git", args, {
    cwd: options.cwd || process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function branchExists(branch, options = {}) {
  if (!branch) return false;
  if (typeof options.branchExists === "function") return Boolean(options.branchExists(branch));
  try {
    runGitCommand(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], options);
    return true;
  } catch {
    return false;
  }
}

function pathExists(targetPath, options = {}) {
  if (typeof options.pathExists === "function") return Boolean(options.pathExists(targetPath));
  return fs.existsSync(targetPath);
}

function mkdir(targetPath, options = {}) {
  if (!targetPath) return;
  if (typeof options.mkdir === "function") {
    options.mkdir(targetPath);
    return;
  }
  fs.mkdirSync(targetPath, { recursive: true });
}

function readPlan(planPath) {
  const resolved = path.resolve(String(planPath || DEFAULT_PLAN_PATH));
  const plan = JSON.parse(fs.readFileSync(resolved, "utf8"));
  return { plan, resolved };
}

function commandRecord(workerId, tool, args, note = "") {
  return {
    workerId,
    tool,
    args,
    note,
  };
}

function mkdirRecord(workerId, targetPath, note = "") {
  return {
    workerId,
    tool: "mkdir",
    path: targetPath,
    note,
  };
}

function resolveWorkerDirs(worktree, worker = {}) {
  const dirs = [];
  const outputDir = normalizeScopePath(worker.outputDir || "");
  const handoffReport = normalizeScopePath(worker.handoffReport || worker.reportPath || "");
  if (outputDir) dirs.push(path.resolve(worktree, outputDir));
  if (handoffReport) dirs.push(path.dirname(path.resolve(worktree, handoffReport)));
  return [...new Set(dirs.map((item) => path.resolve(item)))];
}

function buildAgentWorktreePreparation(plan = {}, options = {}) {
  const apply = asBooleanFlag(options.apply);
  const requireCleanCoordinator =
    asBooleanFlag(options.requireCleanCoordinator) || (apply && !asBooleanFlag(options.allowDirtyCoordinator));
  const validation = validateAgentIsolationPlan(plan, {
    expectedWorkers: options.expectedWorkers,
    coordinatorWorktree: options.coordinatorWorktree,
    requireCleanCoordinator,
    git: options.git,
  });
  const violations = [...validation.violations];
  const warnings = [...validation.warnings];
  const commands = [];
  const skipped = [];
  const baseRef = String(options.baseRef || "HEAD").trim() || "HEAD";

  if (!validation.ok) {
    return {
      artifactType: "agent-worktree-preparation-report",
      version: 1,
      ok: false,
      apply,
      baseRef,
      commands,
      skipped,
      violations,
      warnings,
      validation,
    };
  }

  let worktreeEntries = [];
  try {
    worktreeEntries = parseGitWorktreeList(runGitCommand(["worktree", "list", "--porcelain"], options));
  } catch (error) {
    violations.push(issue("git.worktree-list-failed", `Unable to inspect git worktrees: ${error.message}`));
  }
  const worktreeByPath = new Map(worktreeEntries.map((entry) => [entry.worktree, entry]));
  const branchOwners = new Map();
  for (const entry of worktreeEntries) {
    const branch = normalizeBranchName(entry.branch || "");
    if (branch) branchOwners.set(branch, entry.worktree);
  }

  const workers = Array.isArray(plan.workers) ? plan.workers : [];
  workers.forEach((worker, index) => {
    if (!isPlainObject(worker)) return;
    const workerId = String(worker.id || worker.name || `worker-${index + 1}`).trim();
    const readOnly = worker.readOnly === true || String(worker.mode || "").toLowerCase() === "read-only";
    const worktree = path.resolve(String(worker.worktree || ""));
    const normalizedWorktree = normalizeWorktreePath(worktree);
    const branch = normalizeBranchName(worker.branch || "");
    const registered = worktreeByPath.get(normalizedWorktree);

    if (registered) {
      skipped.push({ workerId, reason: "worktree already registered", worktree });
      for (const dir of resolveWorkerDirs(worktree, worker)) {
        commands.push(mkdirRecord(workerId, dir, "ensure worker output/handoff directory"));
      }
      return;
    }

    if (pathExists(worktree, options)) {
      violations.push(issue("worker.worktree-path-exists", `Worker worktree path exists but is not registered: ${worktree}.`, { workerId }));
      return;
    }

    if (readOnly) {
      commands.push(commandRecord(workerId, "git", ["worktree", "add", "--detach", worktree, baseRef], "create read-only worker worktree"));
      return;
    }

    const checkedOutAt = branchOwners.get(branch);
    if (checkedOutAt && checkedOutAt !== normalizedWorktree) {
      violations.push(issue("worker.branch-already-checked-out", `Worker branch is already checked out at ${checkedOutAt}.`, { workerId }));
      return;
    }

    if (branchExists(branch, options)) {
      commands.push(commandRecord(workerId, "git", ["worktree", "add", worktree, branch], "create writable worker worktree from existing branch"));
    } else {
      commands.push(commandRecord(workerId, "git", ["worktree", "add", "-b", branch, worktree, baseRef], "create writable worker worktree and branch"));
    }
    for (const dir of resolveWorkerDirs(worktree, worker)) {
      commands.push(mkdirRecord(workerId, dir, "ensure worker output/handoff directory"));
    }
  });

  return {
    artifactType: "agent-worktree-preparation-report",
    version: 1,
    ok: violations.length === 0,
    apply,
    baseRef,
    checkedAt: new Date().toISOString(),
    commands,
    skipped,
    violations,
    warnings,
    validation,
    summary: {
      workers: workers.length,
      commands: commands.length,
      gitCommands: commands.filter((item) => item.tool === "git").length,
      mkdirCommands: commands.filter((item) => item.tool === "mkdir").length,
      skipped: skipped.length,
    },
  };
}

function applyAgentWorktreePreparation(report = {}, options = {}) {
  if (!report.ok) {
    throw new Error("Cannot apply a blocked agent worktree preparation report.");
  }
  const applied = [];
  for (const command of Array.isArray(report.commands) ? report.commands : []) {
    if (command.tool === "git") {
      runGitCommand(command.args, options);
      applied.push(command);
    } else if (command.tool === "mkdir") {
      mkdir(command.path, options);
      applied.push(command);
    }
  }
  return applied;
}

function formatCommand(command = {}) {
  if (command.tool === "mkdir") return `mkdir ${command.path}`;
  return `${command.tool} ${compactItems(command.args).join(" ")}`;
}

function runAgentWorktreePreparation(args = {}, options = {}) {
  const { plan, resolved } = options.plan ? { plan: options.plan, resolved: args.plan || DEFAULT_PLAN_PATH } : readPlan(args.plan || DEFAULT_PLAN_PATH);
  const report = buildAgentWorktreePreparation(plan, {
    apply: args.apply,
    allowDirtyCoordinator: args["allow-dirty-coordinator"],
    baseRef: args["base-ref"],
    coordinatorWorktree: args["coordinator-worktree"],
    expectedWorkers: args["expected-workers"],
    git: options.git,
    branchExists: options.branchExists,
    pathExists: options.pathExists,
  });
  report.planPath = resolved;

  if (report.ok && asBooleanFlag(args.apply)) {
    report.applied = applyAgentWorktreePreparation(report, options);
  }
  if (args.report && args.report !== true) {
    writeJson(path.resolve(String(args.report)), report);
  }
  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`Agent worktree preparation ${report.ok ? "ready" : "blocked"}: ${resolved}\n`);
    process.stdout.write(`Mode: ${asBooleanFlag(args.apply) ? "apply" : "dry-run"}, baseRef: ${report.baseRef}\n`);
    for (const command of report.commands || []) {
      process.stdout.write(`- [${command.workerId}] ${formatCommand(command)}\n`);
    }
    for (const item of report.skipped || []) {
      process.stdout.write(`- [${item.workerId}] skipped: ${item.reason}\n`);
    }
    for (const item of report.violations || []) {
      process.stdout.write(`- [${item.id}] ${item.workerId ? `${item.workerId}: ` : ""}${item.message}\n`);
    }
    if (report.ok && !asBooleanFlag(args.apply)) {
      process.stdout.write("Dry run only. Re-run with --apply to create worktrees.\n");
    }
  }
  return report;
}

if (require.main === module) {
  try {
    const report = runAgentWorktreePreparation(parseArgs(process.argv.slice(2)));
    process.exitCode = report.ok ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  applyAgentWorktreePreparation,
  buildAgentWorktreePreparation,
  runAgentWorktreePreparation,
};
