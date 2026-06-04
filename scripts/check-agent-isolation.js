#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
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
  runAgentIsolationCheck,
  scopeContains,
  scopeOverlaps,
  validateAgentIsolationPlan,
};
