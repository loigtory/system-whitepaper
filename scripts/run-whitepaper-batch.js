#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const {
  normalizeAuthPaths,
  parseArgs,
  parseSystemsConfig,
  readOptionalJsonObject,
  resolveConfigRelativePath,
  safeFileToken,
  writeJson,
} = require("./system-whitepaper-lib");
const { readPipelineStateSafe } = require("./pipeline-state");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_BATCH_CONCURRENCY = 4;

const FORWARDED_BOOLEAN_FLAGS = [
  "with-whitepaper",
  "reset",
  "skip-session",
  "fast-collect",
  "init-only",
  "allow-draft",
  "dry-write-validation",
  "review-rerun",
];

const FORWARDED_VALUE_FLAGS = [
  "nodes",
  "provider",
  "model",
  "max-pages",
  "retries",
  "narrative-part",
  "part",
  "write-plan",
];

function nowIso(value) {
  return value || new Date().toISOString();
}

function splitCsv(value) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => splitCsv(item));
  }
  if (value === undefined || value === null || value === true || value === false) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeNodes(nodes) {
  return splitCsv(nodes).join(",");
}

function loadBatchConfig(configPath = "config/systems.local.yaml") {
  const resolvedConfigPath = path.resolve(String(configPath || "config/systems.local.yaml"));
  const configDir = path.dirname(resolvedConfigPath);
  const config = parseSystemsConfig(fs.readFileSync(resolvedConfigPath, "utf8"));
  normalizeAuthPaths(config, configDir);
  const outputRoot = resolveConfigRelativePath(configDir, config.runtime?.outputDir || "outputs");
  return {
    configPath: resolvedConfigPath,
    configDir,
    config,
    outputRoot,
    projectRoot: PROJECT_ROOT,
  };
}

function assertUniqueConfiguredSystems(systems = []) {
  const seen = new Set();
  for (const system of systems) {
    const code = String(system?.code || "").trim();
    if (!code) continue;
    if (seen.has(code)) {
      throw new Error(`Duplicate system code in config: ${code}`);
    }
    seen.add(code);
  }
}

function selectBatchSystems(config = {}, args = {}) {
  const systems = Array.isArray(config.systems) ? config.systems : [];
  assertUniqueConfiguredSystems(systems);
  const requested = splitCsv(args.systems !== undefined ? args.systems : args.system);
  if (!requested.length || requested.includes("*") || args.all) {
    return systems.filter((system) => String(system?.code || "").trim());
  }

  const byCode = new Map(systems.map((system) => [String(system.code || "").trim(), system]));
  const seen = new Set();
  const selected = [];
  for (const code of requested) {
    if (seen.has(code)) {
      throw new Error(`Duplicate system requested for batch run: ${code}`);
    }
    seen.add(code);
    const system = byCode.get(code);
    if (!system) throw new Error(`System not found in config: ${code}`);
    selected.push(system);
  }
  return selected;
}

function resolveBatchConcurrency(args = {}, config = {}) {
  const raw =
    args.concurrency !== undefined
      ? args.concurrency
      : config.runtime?.concurrency !== undefined
        ? config.runtime.concurrency
        : DEFAULT_BATCH_CONCURRENCY;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) {
    throw new Error("Batch concurrency must be a positive number.");
  }
  return Math.max(1, Math.floor(value));
}

function buildBatchChildArgs(args = {}, systemCode, configPath) {
  if (!systemCode) throw new Error("systemCode is required");
  const childArgs = [
    "scripts/run-whitepaper-pipeline.js",
    "--config",
    configPath || "config/systems.local.yaml",
    "--system",
    systemCode,
    "--no-batch-state",
  ];

  for (const flag of FORWARDED_BOOLEAN_FLAGS) {
    if (args[flag]) childArgs.push(`--${flag}`);
  }

  for (const flag of FORWARDED_VALUE_FLAGS) {
    const value = flag === "nodes" ? normalizeNodes(args[flag]) : args[flag];
    if (value === undefined || value === null || value === "" || value === true || value === false) {
      continue;
    }
    childArgs.push(`--${flag}`, String(value));
  }

  return childArgs;
}

function resolveBatchLogFile(outputRoot, systemCode) {
  const fileName = `${safeFileToken(systemCode) || "system"}.log`;
  return path.join(outputRoot, "_batch", "logs", fileName);
}

function createBatchState(systems = [], options = {}) {
  const timestamp = nowIso(options.now);
  const concurrency = Number(options.concurrency || DEFAULT_BATCH_CONCURRENCY);
  const logFileResolver =
    typeof options.logFileResolver === "function" ? options.logFileResolver : () => "";
  return recomputeBatchState(
    {
      batchId:
        options.batchId ||
        `batch-${timestamp.replace(/[^0-9A-Za-z]+/g, "").slice(0, 14) || Date.now()}`,
      mode: "batch",
      status: "pending",
      concurrency,
      currentSystemCode: "",
      total: systems.length,
      summary: {},
      systems: systems.map((system) => ({
        code: String(system.code || "").trim(),
        name: system.name || "",
        status: "pending",
        runStatus: "queued",
        currentPhase: "prepare",
        currentNode: "sync",
        pid: null,
        startedAt: "",
        finishedAt: "",
        exitCode: null,
        signal: "",
        logFile: logFileResolver(system),
        lastError: "",
        updatedAt: timestamp,
      })),
      startedAt: options.startedAt || "",
      finishedAt: "",
      updatedAt: timestamp,
    },
    { now: timestamp },
  );
}

function isCompleteSystemStatus(status) {
  return ["success", "review-pending", "finalized", "skipped"].includes(status);
}

function isFailedSystemStatus(status) {
  return ["failed", "paused"].includes(status);
}

function recomputeBatchState(state, options = {}) {
  const timestamp = nowIso(options.now);
  const next = {
    ...state,
    systems: Array.isArray(state.systems) ? state.systems.map((item) => ({ ...item })) : [],
  };
  const summary = {
    total: next.systems.length,
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    pending: 0,
    reviewPending: 0,
    finalized: 0,
    paused: 0,
    success: 0,
  };

  for (const item of next.systems) {
    if (item.runStatus === "queued") summary.queued += 1;
    if (item.runStatus === "running") summary.running += 1;
    if (item.runStatus === "completed") summary.completed += 1;
    if (item.runStatus === "failed") summary.failed += 1;
    if (item.status === "pending") summary.pending += 1;
    if (item.status === "review-pending") summary.reviewPending += 1;
    if (item.status === "finalized") summary.finalized += 1;
    if (item.status === "paused") summary.paused += 1;
    if (item.status === "success") summary.success += 1;
    if (isFailedSystemStatus(item.status) && item.runStatus !== "failed") {
      summary.failed += 1;
    }
  }

  const runningItem = next.systems.find((item) => item.runStatus === "running");
  const failedItem = next.systems.find(
    (item) => item.runStatus === "failed" || isFailedSystemStatus(item.status),
  );
  const queuedItem = next.systems.find((item) => item.runStatus === "queued");

  if (runningItem || (next.startedAt && queuedItem)) {
    next.status = "running";
  } else if (queuedItem) {
    next.status = "pending";
  } else if (failedItem) {
    next.status = "failed";
  } else {
    next.status = "success";
  }

  next.currentSystemCode = runningItem?.code || failedItem?.code || queuedItem?.code || "";
  next.summary = summary;
  next.total = summary.total;
  next.updatedAt = timestamp;
  if (next.startedAt && !runningItem && !queuedItem && !next.finishedAt) {
    next.finishedAt = timestamp;
  }
  return next;
}

function updateBatchSystem(state, systemCode, patch = {}, options = {}) {
  const timestamp = nowIso(options.now);
  const systems = (state.systems || []).map((item) =>
    item.code === systemCode
      ? {
          ...item,
          ...patch,
          updatedAt: patch.updatedAt || timestamp,
        }
      : item,
  );
  return recomputeBatchState({ ...state, systems }, { now: timestamp });
}

function applyPipelineSnapshot(item, pipelineState) {
  if (!pipelineState) return item;
  const currentNode = pipelineState.nodes?.[pipelineState.currentNode] || {};
  const next = {
    ...item,
    status: pipelineState.overallStatus || item.status,
    currentPhase: pipelineState.currentPhase || item.currentPhase,
    currentNode: pipelineState.currentNode || item.currentNode,
    lastError: currentNode.lastError || item.lastError || "",
    updatedAt: pipelineState.updatedAt || item.updatedAt,
  };
  if (item.runStatus !== "running") {
    if (isFailedSystemStatus(next.status)) next.runStatus = "failed";
    else if (isCompleteSystemStatus(next.status)) next.runStatus = "completed";
  }
  return next;
}

function buildBatchTruthSummary(systemOutput) {
  const truth = readOptionalJsonObject(path.join(systemOutput, "truth-readiness-report.json"));
  const factCheck = readOptionalJsonObject(path.join(systemOutput, "fact-check-report.json"));
  const repair = readOptionalJsonObject(path.join(systemOutput, "coverage-repair-plan.json"));
  const factMetrics = truth?.gates?.factCheck?.metrics || factCheck?.metrics || {};
  return {
    truthReadiness: truth
      ? {
          scorePercent: Number(truth.scorePercent || 0),
          canSubmitReview: Boolean(truth.canSubmitReview),
          canFinalize: Boolean(truth.canFinalize),
          blockerCount: Array.isArray(truth.blockers) ? truth.blockers.length : 0,
          generatedAt: truth.generatedAt || "",
        }
      : null,
    writableClaimCoverage: factCheck || truth?.gates?.factCheck
      ? {
          ratio: Number(factMetrics.writableClaimCoverageRatio || 0),
          minRatio: Number(factMetrics.minWritableClaimCoverage || 0),
          missingWritableClaimCount: Number(factMetrics.missingWritableClaimCount || 0),
          missingWritableClaimIds: Array.isArray(factCheck?.missingWritableClaimIds)
            ? factCheck.missingWritableClaimIds.slice(0, 12)
            : Array.isArray(truth?.gates?.factCheck?.missingWritableClaimIds)
              ? truth.gates.factCheck.missingWritableClaimIds.slice(0, 12)
              : [],
        }
      : null,
    coverageRepair: repair
      ? {
          status: repair.status || "",
          narrativePart: repair.narrativePart || "",
          targetModules: Array.isArray(repair.targetModules) ? repair.targetModules.slice(0, 12) : [],
          missingWritableClaimCount: Array.isArray(repair.missingWritableClaimIds)
            ? repair.missingWritableClaimIds.length
            : 0,
          error: repair.error || "",
        }
      : null,
  };
}

function applySystemArtifactSummary(item, outputRoot) {
  const systemOutput = path.join(outputRoot, item.code);
  return {
    ...item,
    ...buildBatchTruthSummary(systemOutput),
  };
}

function refreshBatchStateFromDisk(state, outputRoot, options = {}) {
  const systems = (state.systems || []).map((item) => {
    const statePath = path.join(outputRoot, item.code, "pipeline-state.json");
    const next = applyPipelineSnapshot(item, readPipelineStateSafe(statePath, { persist: true }));
    return applySystemArtifactSummary(next, outputRoot);
  });
  return recomputeBatchState({ ...state, systems }, options);
}

function writeBatchRunState(outputRoot, state) {
  const batchPath = path.join(outputRoot, "_batch", "run-state.json");
  writeJson(batchPath, state);
  return batchPath;
}

function appendLog(filePath, chunk) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, chunk, "utf8");
}

async function runBatchPipeline(options = {}) {
  const args = options.args || parseArgs(process.argv.slice(2));
  const context = loadBatchConfig(args.config || options.configPath);
  const systems = selectBatchSystems(context.config, args);
  if (!systems.length) throw new Error("No systems selected for batch run.");
  const concurrency = resolveBatchConcurrency(args, context.config);
  fs.mkdirSync(path.join(context.outputRoot, "_batch", "logs"), { recursive: true });

  let state = createBatchState(systems, {
    concurrency,
    startedAt: new Date().toISOString(),
    logFileResolver: (system) => resolveBatchLogFile(context.outputRoot, system.code),
  });
  state = recomputeBatchState(state);
  writeBatchRunState(context.outputRoot, state);

  const queue = state.systems.map((item) => item.code);
  const children = new Map();
  let active = 0;
  let resolved = false;

  return new Promise((resolve) => {
    const finishIfDone = () => {
      if (resolved) return;
      if (queue.length || active) return;
      resolved = true;
      state = refreshBatchStateFromDisk(state, context.outputRoot);
      state = recomputeBatchState(state);
      writeBatchRunState(context.outputRoot, state);
      resolve(state);
    };

    const startNext = () => {
      while (active < concurrency && queue.length) {
        const systemCode = queue.shift();
        const item = state.systems.find((entry) => entry.code === systemCode);
        const logFile = item?.logFile || resolveBatchLogFile(context.outputRoot, systemCode);
        fs.writeFileSync(
          logFile,
          [`# system-whitepaper batch log`, `system=${systemCode}`, `startedAt=${new Date().toISOString()}`, ""].join("\n"),
          "utf8",
        );
        const childArgs = buildBatchChildArgs(args, systemCode, context.configPath);
        const child = spawn(process.execPath, childArgs, {
          cwd: context.projectRoot,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        });
        active += 1;
        children.set(systemCode, child);
        state = updateBatchSystem(state, systemCode, {
          status: "running",
          runStatus: "running",
          pid: child.pid || null,
          startedAt: new Date().toISOString(),
          finishedAt: "",
          exitCode: null,
          signal: "",
          logFile,
          lastError: "",
        });
        writeBatchRunState(context.outputRoot, state);

        child.stdout.on("data", (chunk) => appendLog(logFile, chunk));
        child.stderr.on("data", (chunk) => appendLog(logFile, chunk));
        child.on("error", (error) => {
          appendLog(logFile, `\nspawn-error: ${error.message}\n`);
        });
        child.on("close", (exitCode, signal) => {
          active -= 1;
          children.delete(systemCode);
          state = refreshBatchStateFromDisk(state, context.outputRoot);
          const current = state.systems.find((entry) => entry.code === systemCode) || {};
          const failed = exitCode !== 0 || signal || isFailedSystemStatus(current.status);
          const finalStatus =
            failed
              ? current.status && current.status !== "running"
                ? current.status
                : "failed"
              : current.status && current.status !== "running" && current.status !== "pending"
                ? current.status
                : "success";
          state = updateBatchSystem(state, systemCode, {
            status: finalStatus,
            runStatus: failed ? "failed" : "completed",
            exitCode,
            signal: signal || "",
            finishedAt: new Date().toISOString(),
            lastError: failed
              ? current.lastError || `Pipeline exited with code ${exitCode ?? "null"}${signal ? ` signal ${signal}` : ""}`
              : current.lastError || "",
          });
          writeBatchRunState(context.outputRoot, state);
          startNext();
          finishIfDone();
        });
      }
      finishIfDone();
    };

    const refreshTimer = setInterval(() => {
      if (resolved) {
        clearInterval(refreshTimer);
        return;
      }
      state = refreshBatchStateFromDisk(state, context.outputRoot);
      writeBatchRunState(context.outputRoot, state);
    }, 2000);

    for (const signal of ["SIGINT", "SIGTERM"]) {
      process.once(signal, () => {
        for (const child of children.values()) {
          try {
            child.kill(signal);
          } catch {
            // Best-effort shutdown.
          }
        }
        state = recomputeBatchState(
          {
            ...state,
            systems: state.systems.map((item) =>
              item.runStatus === "running"
                ? { ...item, runStatus: "failed", status: "paused", lastError: `Interrupted by ${signal}` }
                : item,
            ),
          },
        );
        writeBatchRunState(context.outputRoot, state);
        process.exit(130);
      });
    }

    startNext();
  });
}

async function main() {
  const state = await runBatchPipeline();
  console.log(
    `Batch finished: status=${state.status}, total=${state.summary.total}, failed=${state.summary.failed}`,
  );
  if (state.status === "failed") process.exitCode = 2;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_BATCH_CONCURRENCY,
  buildBatchChildArgs,
  buildBatchTruthSummary,
  createBatchState,
  loadBatchConfig,
  recomputeBatchState,
  refreshBatchStateFromDisk,
  resolveBatchConcurrency,
  resolveBatchLogFile,
  runBatchPipeline,
  selectBatchSystems,
  updateBatchSystem,
  writeBatchRunState,
};
