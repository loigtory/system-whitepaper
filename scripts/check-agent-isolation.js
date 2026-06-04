#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { parseArgs, writeJson } = require("./system-whitepaper-lib");

const DEFAULT_PLAN_PATH = ".agents/4-agent-plan.json";
const DEFAULT_COORDINATOR_OWNED_PATHS = [
  "SKILL.md",
  "package.json",
  "scripts/check-agent-isolation.js",
  "scripts/system-whitepaper.test.js",
  "outputs/_batch/",
];

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function issue(id, message, extra = {}) {
  return {
    id,
    severity: extra.severity || "P0",
    workerId: extra.workerId || "",
    message,
  };
}

function compactItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function unique(items) {
  return [...new Set(compactItems(items))];
}

function asBooleanFlag(value) {
  return value === true || value === "true" || value === "1" || value === "yes";
}

function normalizePathText(value) {
  return String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/");
}

function normalizeScopePath(value) {
  const raw = normalizePathText(value).replace(/^\.\//, "");
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function normalizeWorktreePath(value) {
  const normalized = normalizePathText(value);
  if (!normalized) return "";
  return path.resolve(normalized).replace(/\\/g, "/").toLowerCase();
}

function pathIsUnsafeRelative(value) {
  const normalized = normalizeScopePath(value);
  if (!normalized) return true;
  if (path.isAbsolute(normalized)) return true;
  return normalized.split("/").some((part) => part === ".." || part === ".git");
}

function scopeOverlaps(left, right) {
  const a = normalizeScopePath(left);
  const b = normalizeScopePath(right);
  if (!a || !b) return false;
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function scopeContains(parent, child) {
  const a = normalizeScopePath(parent);
  const b = normalizeScopePath(child);
  if (!a || !b) return false;
  return a === b || b.startsWith(`${a}/`);
}

function normalizeBranchName(value) {
  return String(value || "")
    .trim()
    .replace(/^refs\/heads\//, "");
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

function parseGitWorktreeList(output = "") {
  const entries = [];
  let current = null;
  for (const line of String(output || "").split(/\r?\n/)) {
    if (!line.trim()) {
      if (current) entries.push(current);
      current = null;
      continue;
    }
    const [key, ...rest] = line.split(" ");
    const value = rest.join(" ");
    if (key === "worktree") {
      if (current) entries.push(current);
      current = { worktree: normalizeWorktreePath(value), branch: "", head: "" };
    } else if (current && key === "branch") {
      current.branch = normalizeBranchName(value);
    } else if (current && key === "HEAD") {
      current.head = value;
    } else if (current && key === "detached") {
      current.detached = true;
    }
  }
  if (current) entries.push(current);
  return entries;
}

function parseGitStatusPaths(output = "") {
  return unique(
    String(output || "")
      .split(/\r?\n/)
      .map((line) => {
        if (!line.trim()) return "";
        const raw = line.length > 3 ? line.slice(3).trim() : "";
        const renamed = raw.includes(" -> ") ? raw.split(" -> ").pop() : raw;
        return normalizeScopePath(renamed.replace(/^"|"$/g, ""));
      }),
  );
}

function fileExists(filePath, options = {}) {
  if (typeof options.fileExists === "function") return Boolean(options.fileExists(filePath));
  return fs.existsSync(filePath);
}

function readTextFile(filePath, options = {}) {
  if (typeof options.readTextFile === "function") return String(options.readTextFile(filePath) || "");
  return fs.readFileSync(filePath, "utf8");
}

function pathAllowedByScopes(filePath, scopes = []) {
  return scopes.some((scope) => scopeContains(scope, filePath));
}

function validateActualAgentIsolation(plan, options = {}) {
  const violations = [];
  const warnings = [];
  const verifyWorktrees = asBooleanFlag(options.verifyWorktrees);
  const requireHandoffs = asBooleanFlag(options.requireHandoffs);
  const requireCleanCoordinator = asBooleanFlag(options.requireCleanCoordinator);
  if (!verifyWorktrees && !requireHandoffs && !requireCleanCoordinator) {
    return {
      violations,
      warnings,
      summary: {
        actualWorktreesChecked: 0,
        handoffReportsChecked: 0,
        changedFilesChecked: 0,
        coordinatorChangedFiles: 0,
      },
    };
  }

  const coordinator = isPlainObject(plan.coordinator) ? plan.coordinator : {};
  const coordinatorWorktree = normalizeWorktreePath(
    coordinator.worktree || options.coordinatorWorktree || process.cwd(),
  );
  const coordinatorBranch = normalizeBranchName(coordinator.branch || "");
  const workers = Array.isArray(plan.workers) ? plan.workers : [];
  let worktreeEntries = [];
  let actualWorktreesChecked = 0;
  let handoffReportsChecked = 0;
  let changedFilesChecked = 0;
  let coordinatorChangedFiles = 0;

  if (verifyWorktrees || requireCleanCoordinator) {
    try {
      worktreeEntries = parseGitWorktreeList(runGitCommand(["worktree", "list", "--porcelain"], options));
    } catch (error) {
      violations.push(issue("git.worktree-list-failed", `Unable to inspect git worktrees: ${error.message}`));
      worktreeEntries = [];
    }
  }
  const worktreeByPath = new Map(worktreeEntries.map((entry) => [entry.worktree, entry]));

  if (requireCleanCoordinator && coordinatorWorktree) {
    try {
      const coordinatorStatus = parseGitStatusPaths(
        runGitCommand(["-C", coordinatorWorktree, "status", "--short"], options),
      );
      coordinatorChangedFiles = coordinatorStatus.length;
      if (coordinatorStatus.length) {
        violations.push(
          issue("coordinator.worktree-dirty", "Coordinator worktree has uncommitted changes before worker merge.", {
            severity: "P1",
          }),
        );
      }
    } catch (error) {
      violations.push(issue("coordinator.status-failed", `Unable to inspect coordinator status: ${error.message}`));
    }
  }

  workers.forEach((worker, index) => {
    if (!isPlainObject(worker)) return;
    const id = String(worker.id || worker.name || `worker-${index + 1}`).trim();
    const readOnly = worker.readOnly === true || String(worker.mode || "").toLowerCase() === "read-only";
    const worktree = normalizeWorktreePath(worker.worktree);
    const branch = normalizeBranchName(worker.branch || "");
    const outputDir = normalizeScopePath(worker.outputDir || "");
    const handoffReport = normalizeScopePath(worker.handoffReport || worker.reportPath || "");
    const writeScope = unique(worker.writeScope || worker.ownedPaths || []);

    if (verifyWorktrees && worktree) {
      actualWorktreesChecked += 1;
      const entry = worktreeByPath.get(worktree);
      if (!entry) {
        violations.push(issue("worker.worktree-not-registered", "Worker worktree is not registered in git worktree list.", { workerId: id }));
      } else if (!readOnly && branch && entry.branch && normalizeBranchName(entry.branch) !== branch) {
        violations.push(
          issue("worker.branch-actual-mismatch", `Worker worktree branch is ${entry.branch}, expected ${branch}.`, {
            workerId: id,
          }),
        );
      } else if (!readOnly && branch && !entry.branch) {
        violations.push(issue("worker.branch-detached", "Writable worker worktree must not be detached.", { workerId: id }));
      }

      if (!readOnly) {
        let changedFiles = [];
        try {
          changedFiles = parseGitStatusPaths(runGitCommand(["-C", worktree, "status", "--short"], options));
        } catch (error) {
          violations.push(issue("worker.status-failed", `Unable to inspect worker status: ${error.message}`, { workerId: id }));
        }
        changedFilesChecked += changedFiles.length;
        for (const filePath of changedFiles) {
          if (outputDir && scopeContains(outputDir, filePath)) continue;
          if (!pathAllowedByScopes(filePath, writeScope)) {
            violations.push(
              issue("worker.diff-out-of-scope", `Worker changed file outside writeScope: ${filePath}.`, { workerId: id }),
            );
          }
        }
      }
    }

    if (requireHandoffs && !readOnly) {
      if (!worktree || !handoffReport) return;
      handoffReportsChecked += 1;
      const reportPath = path.resolve(worktree, handoffReport);
      if (!fileExists(reportPath, options)) {
        violations.push(issue("worker.handoff-missing-actual", `Worker handoffReport does not exist: ${handoffReport}.`, { workerId: id }));
        return;
      }
      let handoff = {};
      try {
        handoff = JSON.parse(readTextFile(reportPath, options));
      } catch (error) {
        violations.push(issue("worker.handoff-invalid-json", `Worker handoffReport is not valid JSON: ${error.message}`, { workerId: id }));
        return;
      }
      const handoffWorkerId = String(handoff.workerId || handoff.id || "").trim();
      if (handoffWorkerId && handoffWorkerId !== id) {
        violations.push(issue("worker.handoff-id-mismatch", `handoffReport workerId is ${handoffWorkerId}, expected ${id}.`, { workerId: id }));
      }
      const declaredChangedFiles = unique(handoff.changedFiles || handoff.filesChanged || []);
      for (const filePath of declaredChangedFiles) {
        if (outputDir && scopeContains(outputDir, filePath)) continue;
        if (!pathAllowedByScopes(filePath, writeScope)) {
          violations.push(
            issue("worker.handoff-file-out-of-scope", `handoffReport lists file outside writeScope: ${filePath}.`, {
              workerId: id,
            }),
          );
        }
      }
      const tests = Array.isArray(handoff.tests) ? handoff.tests : [];
      if (!tests.length) {
        warnings.push(issue("worker.handoff-tests-missing", "handoffReport does not list worker-run tests.", { workerId: id, severity: "P2" }));
      }
    }
  });

  return {
    violations,
    warnings,
    summary: {
      actualWorktreesChecked,
      handoffReportsChecked,
      changedFilesChecked,
      coordinatorChangedFiles,
    },
  };
}

function validateAgentIsolationPlan(plan, options = {}) {
  const violations = [];
  const warnings = [];
  if (!isPlainObject(plan)) {
    return {
      artifactType: "agent-isolation-report",
      version: 1,
      ok: false,
      violations: [issue("plan.invalid", "Agent isolation plan must be a JSON object.")],
      warnings,
      summary: { workers: 0, writableWorkers: 0, readOnlyWorkers: 0 },
    };
  }

  if (plan.artifactType && plan.artifactType !== "agent-isolation-plan") {
    violations.push(issue("plan.artifact-type", "artifactType must be agent-isolation-plan when present."));
  }

  const coordinator = isPlainObject(plan.coordinator) ? plan.coordinator : {};
  if (!String(coordinator.id || "").trim()) {
    violations.push(issue("coordinator.id-missing", "Coordinator id is required."));
  }

  const coordinatorWorktree = normalizeWorktreePath(
    coordinator.worktree || options.coordinatorWorktree || process.cwd(),
  );
  const coordinatorBranch = String(coordinator.branch || "").trim();
  if (!coordinatorBranch) {
    violations.push(issue("coordinator.branch-missing", "Coordinator branch is required."));
  }
  const mergePolicy = isPlainObject(plan.mergePolicy)
    ? plan.mergePolicy
    : isPlainObject(coordinator.mergePolicy)
      ? coordinator.mergePolicy
      : {};
  if (!isPlainObject(plan.mergePolicy) && !isPlainObject(coordinator.mergePolicy)) {
    violations.push(issue("merge.policy-missing", "Agent isolation plan must declare a coordinator merge policy."));
  }
  if (mergePolicy.coordinatorOnlyMerge !== true) {
    violations.push(issue("merge.coordinator-only", "Only the coordinator may review, stage, merge, or commit worker results."));
  }
  if (mergePolicy.reviewRequired !== true) {
    violations.push(issue("merge.review-required", "Coordinator review is required before merging worker results."));
  }
  const coordinatorOwnedPaths = unique([
    ...DEFAULT_COORDINATOR_OWNED_PATHS,
    ...compactItems(plan.coordinatorOwnedPaths),
  ]);
  const workers = Array.isArray(plan.workers) ? plan.workers : [];
  const expectedWorkers =
    options.expectedWorkers !== undefined
      ? Number(options.expectedWorkers)
      : plan.expectedWorkers !== undefined
        ? Number(plan.expectedWorkers)
        : 4;

  if (Number.isFinite(expectedWorkers) && expectedWorkers > 0 && workers.length !== expectedWorkers) {
    violations.push(issue("workers.count", `Expected ${expectedWorkers} worker agents, found ${workers.length}.`));
  }

  const seenIds = new Set();
  const worktreeOwners = new Map();
  const branchOwners = new Map();
  const outputOwners = new Map();
  const handoffOwners = new Map();
  const worktreeScopes = [];
  const outputScopes = [];
  const handoffScopes = [];
  const writableScopes = [];
  let writableWorkers = 0;
  let readOnlyWorkers = 0;
  let handoffReports = 0;

  workers.forEach((worker, index) => {
    if (!isPlainObject(worker)) {
      violations.push(issue("worker.invalid", `Worker at index ${index} must be a JSON object.`));
      return;
    }

    const id = String(worker.id || worker.name || `worker-${index + 1}`).trim();
    const readOnly = worker.readOnly === true || String(worker.mode || "").toLowerCase() === "read-only";
    const worktree = normalizeWorktreePath(worker.worktree);
    const branch = String(worker.branch || "").trim();
    const outputDir = normalizeScopePath(worker.outputDir || "");
    const handoffReport = normalizeScopePath(worker.handoffReport || worker.reportPath || "");
    const writeScope = unique(worker.writeScope || worker.ownedPaths || []);

    if (!id) {
      violations.push(issue("worker.id-missing", `Worker at index ${index} requires an id.`));
    } else if (seenIds.has(id)) {
      violations.push(issue("worker.id-duplicate", `Worker id is duplicated: ${id}.`, { workerId: id }));
    }
    seenIds.add(id);

    if (!worktree) {
      violations.push(issue("worker.worktree-missing", "Worker worktree is required.", { workerId: id }));
    } else if (scopeOverlaps(worktree, coordinatorWorktree)) {
      violations.push(issue("worker.worktree-main", "Worker must not use the coordinator worktree or a nested path.", { workerId: id }));
    }
    if (worktree) {
      const owner = worktreeOwners.get(worktree);
      if (owner) {
        violations.push(issue("worker.worktree-duplicate", `Workers share the same worktree: ${owner}, ${id}.`, { workerId: id }));
      } else {
        for (const prior of worktreeScopes) {
          if (scopeOverlaps(worktree, prior.worktree)) {
            violations.push(issue("worker.worktree-overlap", `Worker worktree overlaps ${prior.workerId}: ${worktree} <-> ${prior.worktree}.`, { workerId: id }));
          }
        }
        worktreeOwners.set(worktree, id);
      }
      worktreeScopes.push({ workerId: id, worktree });
    }

    if (readOnly) {
      readOnlyWorkers += 1;
      if (writeScope.length) {
        violations.push(issue("worker.read-only-write-scope", "Read-only worker must not declare writeScope.", { workerId: id }));
      }
      return;
    }

    writableWorkers += 1;
    if (!branch) {
      violations.push(issue("worker.branch-missing", "Writable worker branch is required.", { workerId: id }));
    } else {
      if (coordinatorBranch && branch === coordinatorBranch) {
        violations.push(issue("worker.branch-main", "Writable worker branch must differ from the coordinator branch.", { workerId: id }));
      }
      const owner = branchOwners.get(branch);
      if (owner) {
        violations.push(issue("worker.branch-duplicate", `Writable workers share the same branch: ${owner}, ${id}.`, { workerId: id }));
      } else {
        branchOwners.set(branch, id);
      }
    }

    if (!outputDir) {
      violations.push(issue("worker.output-missing", "Writable worker outputDir is required.", { workerId: id }));
    } else {
      if (pathIsUnsafeRelative(outputDir)) {
        violations.push(issue("worker.output-unsafe", "Worker outputDir must be a safe relative path.", { workerId: id }));
      }
      for (const ownedPath of coordinatorOwnedPaths) {
        if (scopeOverlaps(outputDir, ownedPath)) {
          violations.push(issue("worker.output-coordinator-owned", `Worker outputDir overlaps coordinator-owned path: ${ownedPath}.`, { workerId: id }));
        }
      }
      const owner = outputOwners.get(outputDir);
      if (owner) {
        violations.push(issue("worker.output-duplicate", `Writable workers share the same outputDir: ${owner}, ${id}.`, { workerId: id }));
      } else {
        for (const prior of outputScopes) {
          if (scopeOverlaps(outputDir, prior.outputDir)) {
            violations.push(issue("worker.output-overlap", `Worker outputDir overlaps ${prior.workerId}: ${outputDir} <-> ${prior.outputDir}.`, { workerId: id }));
          }
        }
        outputOwners.set(outputDir, id);
      }
      outputScopes.push({ workerId: id, outputDir });
    }

    if (!handoffReport) {
      violations.push(issue("worker.handoff-missing", "Writable worker handoffReport is required.", { workerId: id }));
    } else {
      handoffReports += 1;
      if (pathIsUnsafeRelative(handoffReport)) {
        violations.push(issue("worker.handoff-unsafe", "Worker handoffReport must be a safe relative path.", { workerId: id }));
      }
      const owner = handoffOwners.get(handoffReport);
      if (owner) {
        violations.push(issue("worker.handoff-duplicate", `Writable workers share the same handoffReport: ${owner}, ${id}.`, { workerId: id }));
      } else {
        for (const prior of handoffScopes) {
          if (scopeOverlaps(handoffReport, prior.handoffReport)) {
            violations.push(issue("worker.handoff-overlap", `Worker handoffReport overlaps ${prior.workerId}: ${handoffReport} <-> ${prior.handoffReport}.`, { workerId: id }));
          }
        }
        handoffOwners.set(handoffReport, id);
      }
      handoffScopes.push({ workerId: id, handoffReport });
      if (outputDir && (!scopeContains(outputDir, handoffReport) || handoffReport === outputDir)) {
        violations.push(issue("worker.handoff-output-mismatch", "Worker handoffReport must live inside its outputDir.", { workerId: id }));
      }
      for (const ownedPath of coordinatorOwnedPaths) {
        if (scopeOverlaps(handoffReport, ownedPath)) {
          violations.push(issue("worker.handoff-coordinator-owned", `Worker handoffReport overlaps coordinator-owned path: ${ownedPath}.`, { workerId: id }));
        }
      }
    }

    if (!writeScope.length) {
      violations.push(issue("worker.write-scope-missing", "Writable worker writeScope is required.", { workerId: id }));
    }
    for (const scope of writeScope) {
      if (pathIsUnsafeRelative(scope)) {
        violations.push(issue("worker.write-scope-unsafe", `Unsafe writeScope path: ${scope}.`, { workerId: id }));
        continue;
      }
      for (const ownedPath of coordinatorOwnedPaths) {
        if (scopeOverlaps(scope, ownedPath)) {
          violations.push(issue("worker.coordinator-owned-scope", `Worker writeScope overlaps coordinator-owned path: ${ownedPath}.`, { workerId: id }));
        }
      }
      for (const prior of writableScopes) {
        if (scopeOverlaps(scope, prior.scope)) {
          violations.push(issue("worker.write-scope-overlap", `Worker writeScope overlaps ${prior.workerId}: ${scope} <-> ${prior.scope}.`, { workerId: id }));
        }
      }
      writableScopes.push({ workerId: id, scope: normalizeScopePath(scope) });
    }
  });

  if (writableWorkers <= 0) {
    warnings.push(issue("workers.no-writable", "No writable workers are assigned.", { severity: "P2" }));
  }

  const actual = validateActualAgentIsolation(plan, options);
  violations.push(...actual.violations);
  warnings.push(...actual.warnings);

  return {
    artifactType: "agent-isolation-report",
    version: 1,
    ok: violations.length === 0,
    checkedAt: new Date().toISOString(),
    summary: {
      workers: workers.length,
      writableWorkers,
      readOnlyWorkers,
      expectedWorkers: Number.isFinite(expectedWorkers) ? expectedWorkers : null,
      coordinatorOwnedPaths: coordinatorOwnedPaths.length,
      handoffReports,
      writeScopes: writableScopes.length,
      actualWorktreesChecked: actual.summary.actualWorktreesChecked,
      actualHandoffReportsChecked: actual.summary.handoffReportsChecked,
      actualChangedFilesChecked: actual.summary.changedFilesChecked,
      coordinatorChangedFiles: actual.summary.coordinatorChangedFiles,
    },
    workerIds: workers.map((worker, index) => String(worker?.id || worker?.name || `worker-${index + 1}`)),
    violations,
    warnings,
  };
}

function loadPlan(planPath) {
  const resolved = path.resolve(String(planPath || DEFAULT_PLAN_PATH));
  if (!fs.existsSync(resolved)) {
    throw new Error(`Agent isolation plan not found: ${resolved}`);
  }
  const plan = JSON.parse(fs.readFileSync(resolved, "utf8"));
  return { plan, resolved };
}

function runAgentIsolationCheck(args = {}) {
  const { plan, resolved } = loadPlan(args.plan || DEFAULT_PLAN_PATH);
  const report = validateAgentIsolationPlan(plan, {
    expectedWorkers: args["expected-workers"],
    coordinatorWorktree: args["coordinator-worktree"],
    verifyWorktrees: args["verify-worktrees"],
    requireHandoffs: args["require-handoffs"],
    requireCleanCoordinator: args["require-clean-coordinator"],
  });

  if (args.report && args.report !== true) {
    writeJson(path.resolve(String(args.report)), report);
  }
  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`Agent isolation ${report.ok ? "passed" : "blocked"}: ${resolved}\n`);
    process.stdout.write(
      `Workers ${report.summary.workers}/${report.summary.expectedWorkers || "-"}, writable ${report.summary.writableWorkers}, read-only ${report.summary.readOnlyWorkers}\n`,
    );
    for (const item of report.violations) {
      process.stdout.write(`- [${item.id}] ${item.workerId ? `${item.workerId}: ` : ""}${item.message}\n`);
    }
  }
  return report;
}

if (require.main === module) {
  try {
    const report = runAgentIsolationCheck(parseArgs(process.argv.slice(2)));
    process.exitCode = report.ok ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_COORDINATOR_OWNED_PATHS,
  DEFAULT_PLAN_PATH,
  parseGitStatusPaths,
  parseGitWorktreeList,
  runAgentIsolationCheck,
  scopeContains,
  scopeOverlaps,
  validateAgentIsolationPlan,
};
