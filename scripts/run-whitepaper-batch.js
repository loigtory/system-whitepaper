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
const { NODES, readPipelineStateSafe } = require("./pipeline-state");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_BATCH_CONCURRENCY = 4;
const DEFAULT_BATCH_RETRIES = 0;
const NODE_ORDER = NODES.map((node) => node.id);
const FULL_WHITEPAPER_NODES = [
  "sync",
  "session",
  "collect",
  "inspect",
  "validate-write",
  "db-profile",
  "db-model",
  "truth-universe",
  "truth-claims",
  "build-spec",
  "compose-guide",
  "draft",
  "summary",
  "narrative",
  "fact-check",
  "quality",
  "truth-readiness",
];

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

const FAILURE_CATEGORIES = {
  "config-or-secret": {
    recoverable: false,
    label: "配置或密钥问题",
    action: "修复 config/systems.local.yaml 或 secrets 后重新运行。",
  },
  "auth-or-session": {
    recoverable: true,
    label: "登录会话问题",
    action: "刷新会话或 Cookie 后可从 session 节点继续。",
  },
  "evidence-collection": {
    recoverable: true,
    label: "页面取证问题",
    action: "可从失败的取证节点继续；若重复失败，检查测试环境页面可达性。",
  },
  "database-profile": {
    recoverable: false,
    label: "数据库画像问题",
    action: "修复私有数据库画像配置或连接器只读权限后重跑 truth 节点。",
  },
  "truth-model": {
    recoverable: false,
    label: "真相建模证据不足",
    action: "补足 UI/数据库证据后重建 function-universe 与 verified-claims。",
  },
  "narrative-generation": {
    recoverable: true,
    label: "写稿生成问题",
    action: "可从 narrative 节点继续；会消耗 Agent/模型额度。",
  },
  "quality-gate": {
    recoverable: true,
    label: "质量或真实度门禁未过",
    action: "优先查看 fact-check、quality、truth-readiness 报告，再进行定向补写。",
  },
  "process-exit": {
    recoverable: true,
    label: "子进程异常退出",
    action: "可从当前节点继续；若重复失败，检查日志中的运行时异常。",
  },
  "interrupted": {
    recoverable: true,
    label: "批量任务被中断",
    action: "可恢复运行，runner 会从失败节点继续。",
  },
  unknown: {
    recoverable: false,
    label: "未分类失败",
    action: "查看 per-system log 和 pipeline-state.json 后再决定是否重试。",
  },
};

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

function resolveBatchRetries(args = {}, config = {}) {
  const raw =
    args["batch-retries"] !== undefined
      ? args["batch-retries"]
      : config.runtime?.batchRetries !== undefined
        ? config.runtime.batchRetries
        : DEFAULT_BATCH_RETRIES;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Batch retries must be a non-negative number.");
  }
  return Math.floor(value);
}

function selectedBatchNodes(args = {}) {
  if (args.nodes) return splitCsv(args.nodes);
  if (args["with-whitepaper"] || args.withWhitepaper) return FULL_WHITEPAPER_NODES.slice();
  return [
    "sync",
    "session",
    "collect",
    "inspect",
    "validate-write",
    "build-spec",
    "compose-guide",
    "quality",
  ];
}

function buildRetryNodes(args = {}, currentNode) {
  const selected = selectedBatchNodes(args);
  if (!currentNode || !selected.includes(currentNode)) return normalizeNodes(selected);
  const startIndex = NODE_ORDER.indexOf(currentNode);
  const retryNodes = selected.filter((nodeId) => NODE_ORDER.indexOf(nodeId) >= startIndex);
  return normalizeNodes(retryNodes.length ? retryNodes : selected);
}

function isQuotaSensitiveRetry(nodes) {
  return splitCsv(nodes).includes("narrative");
}

function buildRetryArgs(args = {}, currentNode) {
  const nextArgs = { ...args };
  delete nextArgs.reset;
  delete nextArgs["batch-retries"];
  nextArgs.nodes = buildRetryNodes(args, currentNode);
  return nextArgs;
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

function classifyBatchFailure(item = {}, pipelineState = null, options = {}) {
  const currentNode = pipelineState?.currentNode || item.currentNode || "";
  const currentPhase = pipelineState?.currentPhase || item.currentPhase || "";
  const currentNodeState = pipelineState?.nodes?.[currentNode] || {};
  const message = String(
    options.message || currentNodeState.lastError || item.lastError || "",
  ).trim();
  const lower = message.toLowerCase();
  let category = "unknown";

  if (item.signal || /interrupted|sigint|sigterm|paused/.test(lower)) {
    category = "interrupted";
  } else if (
    currentNode === "session" ||
    /login|session|unauthorized|forbidden|401|403|cookie expired/.test(lower)
  ) {
    category = "auth-or-session";
  } else if (/config|systems\.local|secret|token|auth\.json|cookie file|not found in config/.test(lower)) {
    category = "config-or-secret";
  } else if (["collect", "inspect", "validate-write"].includes(currentNode)) {
    category = "evidence-collection";
  } else if (["db-profile", "db-model"].includes(currentNode)) {
    category = "database-profile";
  } else if (["truth-universe", "truth-claims"].includes(currentNode)) {
    category = "truth-model";
  } else if (currentNode === "narrative") {
    category = "narrative-generation";
  } else if (["fact-check", "quality", "truth-readiness"].includes(currentNode)) {
    category = "quality-gate";
  } else if (item.exitCode !== null && item.exitCode !== undefined) {
    category = "process-exit";
  }

  const meta = FAILURE_CATEGORIES[category] || FAILURE_CATEGORIES.unknown;
  const retryNodes = meta.recoverable ? buildRetryNodes(options.args || {}, currentNode) : "";
  return {
    category,
    label: meta.label,
    recoverable: Boolean(meta.recoverable),
    currentPhase,
    currentNode,
    message,
    action: meta.action,
    retryPlan: {
      canRetry: Boolean(meta.recoverable),
      nodes: retryNodes,
      reset: false,
      quotaImpact: retryNodes && isQuotaSensitiveRetry(retryNodes) ? "agent-writing" : "low",
      reason: meta.action,
    },
  };
}

function summarizeBatchFailures(systems = []) {
  const counts = {};
  let recoverable = 0;
  let quotaSensitive = 0;
  for (const item of systems) {
    const category = item.failureCategory || item.failure?.category;
    if (!category) continue;
    counts[category] = (counts[category] || 0) + 1;
    if (item.recoverable || item.failure?.recoverable) recoverable += 1;
    if (item.retryPlan?.quotaImpact === "agent-writing" || item.failure?.retryPlan?.quotaImpact === "agent-writing") {
      quotaSensitive += 1;
    }
  }
  return { counts, recoverable, quotaSensitive };
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
  next.failureSummary = summarizeBatchFailures(next.systems);
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

function applyPipelineSnapshot(item, pipelineState, options = {}) {
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
  if (isFailedSystemStatus(next.status) || next.runStatus === "failed") {
    const failure = classifyBatchFailure(next, pipelineState, options);
    next.failure = failure;
    next.failureCategory = failure.category;
    next.recoverable = failure.recoverable;
    next.retryPlan = failure.retryPlan;
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
    const next = applyPipelineSnapshot(item, readPipelineStateSafe(statePath, { persist: true }), {
      args: options.args || state.args || {},
    });
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
  const batchRetries = resolveBatchRetries(args, context.config);
  const spawnImpl = typeof options.spawn === "function" ? options.spawn : spawn;
  fs.mkdirSync(path.join(context.outputRoot, "_batch", "logs"), { recursive: true });

  let state = createBatchState(systems, {
    concurrency,
    startedAt: new Date().toISOString(),
    logFileResolver: (system) => resolveBatchLogFile(context.outputRoot, system.code),
  });
  state = {
    ...state,
    args: {
      nodes: args.nodes || "",
      withWhitepaper: Boolean(args["with-whitepaper"]),
      "with-whitepaper": Boolean(args["with-whitepaper"]),
      provider: args.provider || "",
      batchRetries,
    },
    batchRetries,
  };
  state = recomputeBatchState(state);
  writeBatchRunState(context.outputRoot, state);

  const queue = state.systems.map((item) => item.code);
  const attempts = new Map(state.systems.map((item) => [item.code, 0]));
  const children = new Map();
  let active = 0;
  let resolved = false;
  let refreshTimer = null;

  return new Promise((resolve) => {
    const finishIfDone = () => {
      if (resolved) return;
      if (queue.length || active) return;
      resolved = true;
      if (refreshTimer) clearInterval(refreshTimer);
      state = refreshBatchStateFromDisk(state, context.outputRoot, { args });
      state = recomputeBatchState(state);
      writeBatchRunState(context.outputRoot, state);
      resolve(state);
    };

    const startNext = () => {
      while (active < concurrency && queue.length) {
        const systemCode = queue.shift();
        const item = state.systems.find((entry) => entry.code === systemCode);
        const logFile = item?.logFile || resolveBatchLogFile(context.outputRoot, systemCode);
        const attempt = (attempts.get(systemCode) || 0) + 1;
        attempts.set(systemCode, attempt);
        const childArgsSource = attempt > 1 ? buildRetryArgs(args, item?.currentNode) : args;
        if (attempt === 1) {
          fs.writeFileSync(
            logFile,
            [`# system-whitepaper batch log`, `system=${systemCode}`, `startedAt=${new Date().toISOString()}`, ""].join("\n"),
            "utf8",
          );
        } else {
          appendLog(
            logFile,
            [
              "",
              `# retry attempt ${attempt}`,
              `startedAt=${new Date().toISOString()}`,
              `nodes=${normalizeNodes(childArgsSource.nodes) || "-"}`,
              "",
            ].join("\n"),
          );
        }
        const childArgs = buildBatchChildArgs(childArgsSource, systemCode, context.configPath);
        const child = spawnImpl(process.execPath, childArgs, {
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
          attempts: attempt,
          retryPlan: null,
          failure: null,
          failureCategory: "",
          recoverable: false,
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
          state = refreshBatchStateFromDisk(state, context.outputRoot, { args });
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
          const lastError = failed
            ? current.lastError || `Pipeline exited with code ${exitCode ?? "null"}${signal ? ` signal ${signal}` : ""}`
            : current.lastError || "";
          const failure = failed
            ? classifyBatchFailure(
                { ...current, exitCode, signal: signal || "", lastError },
                readPipelineStateSafe(path.join(context.outputRoot, systemCode, "pipeline-state.json"), {
                  persist: true,
                }),
                { args },
              )
            : null;
          const shouldRetry =
            failed &&
            failure?.recoverable &&
            attempt <= batchRetries &&
            !children.has(systemCode);
          state = updateBatchSystem(state, systemCode, {
            status: shouldRetry ? "pending" : finalStatus,
            runStatus: shouldRetry ? "queued" : failed ? "failed" : "completed",
            exitCode,
            signal: signal || "",
            finishedAt: new Date().toISOString(),
            lastError,
            attempts: attempt,
            failure,
            failureCategory: failure?.category || "",
            recoverable: Boolean(failure?.recoverable),
            retryPlan: failure?.retryPlan || null,
          });
          if (shouldRetry) {
            queue.push(systemCode);
          }
          writeBatchRunState(context.outputRoot, state);
          startNext();
          finishIfDone();
        });
      }
      finishIfDone();
    };

    refreshTimer = setInterval(() => {
      if (resolved) {
        clearInterval(refreshTimer);
        return;
      }
      state = refreshBatchStateFromDisk(state, context.outputRoot, { args });
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
  DEFAULT_BATCH_RETRIES,
  buildBatchChildArgs,
  buildBatchTruthSummary,
  buildRetryArgs,
  buildRetryNodes,
  classifyBatchFailure,
  createBatchState,
  loadBatchConfig,
  recomputeBatchState,
  refreshBatchStateFromDisk,
  resolveBatchConcurrency,
  resolveBatchRetries,
  resolveBatchLogFile,
  runBatchPipeline,
  selectBatchSystems,
  summarizeBatchFailures,
  updateBatchSystem,
  writeBatchRunState,
};
