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
const TARGET_TRUTH_SCORE = 95;
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
const MAX_REPAIR_QUEUE_ITEMS = 20;
const REPAIR_QUEUE_NODE_ALLOWLIST = new Set(FULL_WHITEPAPER_NODES);

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

function compactItems(items, limit = 8) {
  return (Array.isArray(items) ? items : []).filter(Boolean).slice(0, limit);
}

function sanitizeDiagnosticItem(item = {}) {
  return {
    id: item.id || "",
    severity: item.severity || "",
    message: item.message || item.description || "",
    rerunNodes: compactItems(item.rerunNodes, 12),
    rewriteScope: item.rewriteScope || "",
    narrativePart: item.narrativePart || "",
    missingWritableClaimIds: compactItems(item.missingWritableClaimIds, 12),
  };
}

function mdCell(value) {
  return String(value === undefined || value === null || value === "" ? "-" : value)
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|");
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

function normalizeBooleanOption(value) {
  if (value === true) return true;
  if (value === false || value === undefined || value === null || value === "") return false;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function resolveRepairAllowAgentWriting(args = {}, config = {}) {
  if (args["repair-allow-agent-writing"] !== undefined) {
    return normalizeBooleanOption(args["repair-allow-agent-writing"]);
  }
  return normalizeBooleanOption(config.runtime?.repairAllowAgentWriting);
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
          blockers: compactItems(truth.blockers, 8).map(sanitizeDiagnosticItem),
          improvementActions: compactItems(truth.improvementActions, 8).map(sanitizeDiagnosticItem),
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

function buildSystemDiagnosis(item = {}) {
  const truth = item.truthReadiness || null;
  const coverage = item.writableClaimCoverage || null;
  const repair = item.coverageRepair || null;
  const failure = item.failure || null;
  const blockers = compactItems(truth?.blockers, 8);
  const actions = [];
  const gaps = [];
  const score = truth ? Number(truth.scorePercent || 0) : null;
  const missingWritableClaimCount = Number(coverage?.missingWritableClaimCount || 0);

  if (failure) {
    gaps.push({
      type: "pipeline-failure",
      severity: failure.recoverable ? "P1" : "P0",
      message: failure.label || failure.category || "Pipeline failed.",
    });
    actions.push({
      id: `failure.${failure.category || "unknown"}`,
      message: failure.action || failure.message || "Inspect per-system log and pipeline-state.json.",
      rerunNodes: compactItems(failure.retryPlan?.nodes ? splitCsv(failure.retryPlan.nodes) : [], 12),
      quotaImpact: failure.retryPlan?.quotaImpact || "",
      canRetry: Boolean(failure.retryPlan?.canRetry),
    });
  }

  if (!truth) {
    gaps.push({
      type: "truth-readiness-missing",
      severity: "P0",
      message: "truth-readiness-report.json is missing or invalid.",
    });
    actions.push({
      id: "truth-readiness.missing",
      message: "Run truth-readiness after evidence, claims, fact-check, and quality artifacts exist.",
      rerunNodes: ["truth-readiness"],
      quotaImpact: "low",
      canRetry: true,
    });
  } else {
    if (!truth.canSubmitReview || score < TARGET_TRUTH_SCORE) {
      gaps.push({
        type: "truth-score",
        severity: "P0",
        message: `Truth readiness is ${score}% and review requires ${TARGET_TRUTH_SCORE}%+.`,
      });
    }
    for (const blocker of blockers) {
      gaps.push({
        type: blocker.id || "truth-blocker",
        severity: blocker.severity || "P0",
        message: blocker.message || "Truth readiness blocker.",
      });
      actions.push({
        id: blocker.id || "truth-blocker",
        message: blocker.message || "Resolve truth readiness blocker.",
        rerunNodes: compactItems(blocker.rerunNodes, 12),
        rewriteScope: blocker.rewriteScope || "",
        narrativePart: blocker.narrativePart || "",
        missingWritableClaimIds: compactItems(blocker.missingWritableClaimIds, 12),
        quotaImpact: compactItems(blocker.rerunNodes).includes("narrative") ? "agent-writing" : "low",
        canRetry: compactItems(blocker.rerunNodes).length > 0,
      });
    }
    for (const action of compactItems(truth.improvementActions, 8)) {
      actions.push({
        id: action.id || "truth-improvement",
        message: action.message || "Apply truth readiness improvement action.",
        rerunNodes: compactItems(action.rerunNodes, 12),
        rewriteScope: action.rewriteScope || "",
        narrativePart: action.narrativePart || "",
        missingWritableClaimIds: compactItems(action.missingWritableClaimIds, 12),
        quotaImpact: compactItems(action.rerunNodes).includes("narrative") ? "agent-writing" : "low",
        canRetry: compactItems(action.rerunNodes).length > 0,
      });
    }
  }

  if (missingWritableClaimCount > 0) {
    gaps.push({
      type: "writable-claim-coverage",
      severity: "P0",
      message: `${missingWritableClaimCount} writable claim(s) are not covered by the pending-review narrative.`,
    });
    actions.push({
      id: "narrative.cover-missing-writable-claims",
      message: "Rerun function-section narrative with missing writable claim IDs.",
      rerunNodes: ["narrative", "fact-check", "quality", "truth-readiness"],
      narrativePart: repair?.narrativePart || "function-sections",
      missingWritableClaimIds: compactItems(coverage?.missingWritableClaimIds, 12),
      quotaImpact: "agent-writing",
      canRetry: true,
    });
  }

  if (repair?.status && repair.status !== "completed" && missingWritableClaimCount > 0) {
    gaps.push({
      type: "coverage-repair-incomplete",
      severity: "P1",
      message: `Coverage repair status is ${repair.status}.`,
    });
  }

  const canSubmitReview = Boolean(truth?.canSubmitReview) && score >= TARGET_TRUTH_SCORE;
  const ready = canSubmitReview && !failure && missingWritableClaimCount === 0;
  return {
    code: item.code || "",
    name: item.name || "",
    status: item.status || "",
    runStatus: item.runStatus || "",
    currentPhase: item.currentPhase || "",
    currentNode: item.currentNode || "",
    truthScorePercent: score,
    canSubmitReview,
    canFinalize: Boolean(truth?.canFinalize),
    missingWritableClaimCount,
    failureCategory: item.failureCategory || failure?.category || "",
    recoverable: Boolean(item.recoverable || failure?.recoverable),
    ready,
    gaps,
    actions,
    logFile: item.logFile || "",
  };
}

function summarizeDiagnosisSystems(systems = []) {
  const total = systems.length;
  const ready = systems.filter((item) => item.ready).length;
  const blocked = systems.filter((item) => !item.ready).length;
  const recoverable = systems.filter((item) => item.recoverable).length;
  const quotaSensitive = systems.filter((item) =>
    item.actions.some((action) => action.quotaImpact === "agent-writing"),
  ).length;
  const missingWritableClaims = systems.reduce(
    (sum, item) => sum + Number(item.missingWritableClaimCount || 0),
    0,
  );
  return {
    total,
    ready,
    blocked,
    recoverable,
    quotaSensitive,
    missingWritableClaims,
  };
}

function buildBatchDiagnosis(state = {}, options = {}) {
  const systems = (Array.isArray(state.systems) ? state.systems : []).map(buildSystemDiagnosis);
  const summary = summarizeDiagnosisSystems(systems);
  const diagnosis = {
    artifactType: "batch-diagnosis",
    version: 1,
    batchId: state.batchId || "",
    status: state.status || "",
    generatedAt: nowIso(options.now),
    targetTruthScorePercent: TARGET_TRUTH_SCORE,
    summary,
    failureSummary: state.failureSummary || summarizeBatchFailures(state.systems || []),
    systems,
  };
  return diagnosis;
}

function renderActionText(actions = []) {
  if (!actions.length) return "无";
  return actions
    .slice(0, 3)
    .map((action) => {
      const nodes = compactItems(action.rerunNodes, 8).join(",");
      const suffix = nodes ? `（重跑：${nodes}）` : "";
      return `${action.message || action.id || "处理诊断项"}${suffix}`;
    })
    .join("；");
}

function renderBatchDiagnosisMarkdown(diagnosis = {}) {
  const summary = diagnosis.summary || {};
  const rows = (diagnosis.systems || []).map((item) =>
    [
      mdCell(item.code),
      mdCell(item.name),
      mdCell(item.ready ? "是" : "否"),
      mdCell(item.truthScorePercent === null ? "缺失" : `${item.truthScorePercent}%`),
      mdCell(item.missingWritableClaimCount || 0),
      mdCell(item.failureCategory || "-"),
      mdCell(item.recoverable ? "是" : "否"),
      mdCell(renderActionText(item.actions)),
    ].join(" | "),
  );
  return [
    "# Batch Diagnosis",
    "",
    `- Generated: ${diagnosis.generatedAt || ""}`,
    `- Batch: ${diagnosis.batchId || ""}`,
    `- Status: ${diagnosis.status || ""}`,
    `- Target truth score: ${diagnosis.targetTruthScorePercent || TARGET_TRUTH_SCORE}%`,
    `- Ready: ${summary.ready || 0}/${summary.total || 0}`,
    `- Blocked: ${summary.blocked || 0}`,
    `- Recoverable: ${summary.recoverable || 0}`,
    `- Agent-writing quota sensitive: ${summary.quotaSensitive || 0}`,
    `- Missing writable claims: ${summary.missingWritableClaims || 0}`,
    "",
    "| System | Name | Ready | Truth | Missing writable claims | Failure | Recoverable | Next action |",
    "| --- | --- | --- | --- | ---: | --- | --- | --- |",
    rows.length ? rows.join("\n") : "| - | - | - | - | 0 | - | - | - |",
    "",
    "## Details",
    "",
    ...(diagnosis.systems || []).flatMap((item) => [
      `### ${item.code || "-"} ${item.name || ""}`.trim(),
      "",
      `- Status: ${item.status || "-"} / ${item.runStatus || "-"}`,
      `- Current node: ${item.currentPhase || "-"} / ${item.currentNode || "-"}`,
      `- Truth readiness: ${item.truthScorePercent === null ? "missing" : `${item.truthScorePercent}%`} / canSubmitReview=${item.canSubmitReview}`,
      `- Missing writable claims: ${item.missingWritableClaimCount || 0}`,
      `- Failure category: ${item.failureCategory || "-"}`,
      `- Log: ${item.logFile || "-"}`,
      "",
      item.gaps.length ? "**Gaps**" : "**Gaps**: none",
      ...item.gaps.map((gap) => `- [${gap.severity || "-"}] ${gap.type || "gap"}: ${gap.message || ""}`),
      "",
      item.actions.length ? "**Actions**" : "**Actions**: none",
      ...item.actions.map((action) => {
        const nodes = compactItems(action.rerunNodes, 12).join(",");
        const quota = action.quotaImpact ? ` quota=${action.quotaImpact}` : "";
        return `- ${action.id || "action"}: ${action.message || ""}${nodes ? ` rerun=${nodes}` : ""}${quota}`;
      }),
      "",
    ]),
  ].join("\n");
}

function writeBatchDiagnosis(outputRoot, state, options = {}) {
  const batchDir = path.join(outputRoot, "_batch");
  const diagnosis = buildBatchDiagnosis(state, options);
  const jsonPath = path.join(batchDir, "diagnosis.json");
  const markdownPath = path.join(batchDir, "diagnosis.md");
  writeJson(jsonPath, diagnosis);
  fs.writeFileSync(markdownPath, renderBatchDiagnosisMarkdown(diagnosis), "utf8");
  return {
    diagnosis,
    artifacts: {
      diagnosisJson: path.relative(batchDir, jsonPath).replace(/\\/g, "/"),
      diagnosisMarkdown: path.relative(batchDir, markdownPath).replace(/\\/g, "/"),
    },
  };
}

function normalizeRepairQueueNodes(nodes) {
  const selected = new Set(
    splitCsv(nodes).filter((nodeId) => REPAIR_QUEUE_NODE_ALLOWLIST.has(nodeId)),
  );
  return FULL_WHITEPAPER_NODES.filter((nodeId) => selected.has(nodeId));
}

function uniqueCompactItems(items = [], limit = 12) {
  const result = [];
  const seen = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const value = String(item || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
    if (result.length >= limit) break;
  }
  return result;
}

function resolveRepairPriority(gaps = []) {
  const severities = new Set((Array.isArray(gaps) ? gaps : []).map((gap) => gap.severity));
  if (severities.has("P0")) return "P0";
  if (severities.has("P1")) return "P1";
  return "P2";
}

function hasWritableClaimGap(system = {}) {
  if (Number(system.missingWritableClaimCount || 0) > 0) return true;
  return (Array.isArray(system.gaps) ? system.gaps : []).some((gap) =>
    /writable-claim|writable coverage|可写声明/i.test(`${gap.type || ""} ${gap.message || ""}`),
  );
}

function scoreRepairAction(action = {}, system = {}) {
  const nodes = normalizeRepairQueueNodes(action.rerunNodes);
  if (!nodes.length) return -100;
  const writableGap = hasWritableClaimGap(system);
  let score = action.canRetry ? 50 : 0;
  if (writableGap && nodes.includes("narrative")) score += 40;
  if (writableGap && compactItems(action.missingWritableClaimIds, 12).length) score += 35;
  if (/writable|coverage/i.test(action.id || "")) score += 15;
  if (action.rewriteScope || action.narrativePart) score += 10;
  if (nodes.includes("narrative")) score += 5;
  return score;
}

function selectRepairAction(system = {}) {
  const actions = Array.isArray(system.actions) ? system.actions : [];
  return (
    actions
      .filter((action) => normalizeRepairQueueNodes(action.rerunNodes).length)
      .sort((left, right) => scoreRepairAction(right, system) - scoreRepairAction(left, system))[0] ||
    actions[0] ||
    null
  );
}

function buildRepairQueueItem(system = {}, index = 0, options = {}) {
  const action = selectRepairAction(system);
  const actions = Array.isArray(system.actions) ? system.actions : [];
  const nodes = normalizeRepairQueueNodes(action?.rerunNodes || []);
  const nodesCsv = nodes.join(",");
  const requiresAgentWriting = action?.quotaImpact === "agent-writing" || nodes.includes("narrative");
  const allowAgentWriting = Boolean(options.allowAgentWriting);
  const missingWritableClaimIds = uniqueCompactItems(
    actions.flatMap((item) => item.missingWritableClaimIds || []),
    12,
  );
  const narrativePart =
    action?.narrativePart ||
    actions.find((item) => item.narrativePart)?.narrativePart ||
    (nodes.includes("narrative") && system.missingWritableClaimCount > 0 ? "function-sections" : "");
  const rewriteScope = action?.rewriteScope || actions.find((item) => item.rewriteScope)?.rewriteScope || "";
  const canRetry = Boolean(action?.canRetry);
  let blockedReason = "";
  if (!action) {
    blockedReason = "No retry action was generated by diagnosis.";
  } else if (!canRetry) {
    blockedReason = "Diagnosis action is not marked retryable.";
  } else if (!nodes.length) {
    blockedReason = "No allowed rerun nodes remain after safety filtering.";
  } else if (requiresAgentWriting && !allowAgentWriting) {
    blockedReason = "Requires Agent-writing quota; enable repairAllowAgentWriting before auto-running.";
  }
  const canAutoRun = Boolean(action && canRetry && nodes.length && !blockedReason);
  const gapReason =
    (Array.isArray(system.gaps) ? system.gaps : []).find((gap) => gap.severity === "P0")?.message ||
    (Array.isArray(system.gaps) ? system.gaps : [])[0]?.message ||
    action?.message ||
    "System is not ready for review.";
  const args = ["--systems", system.code || ""].filter(Boolean);
  if (nodesCsv) args.push("--nodes", nodesCsv);
  if (narrativePart) args.push("--narrative-part", narrativePart);
  return {
    id: `repair-${String(index + 1).padStart(2, "0")}-${safeFileToken(system.code || "system")}`,
    systemCode: system.code || "",
    systemName: system.name || "",
    priority: resolveRepairPriority(system.gaps),
    reason: gapReason,
    actionId: action?.id || "",
    actionMessage: action?.message || "",
    canAutoRun,
    blockedReason,
    reset: false,
    reviewRerun: false,
    nodes,
    nodesCsv,
    narrativePart,
    rewriteScope,
    missingWritableClaimIds,
    quotaImpact: requiresAgentWriting ? "agent-writing" : action?.quotaImpact || "low",
    requiresAgentWriting,
    command: {
      npmScript: "batch",
      args,
    },
  };
}

function buildBatchRepairQueue(diagnosisOrState = {}, options = {}) {
  const diagnosis =
    diagnosisOrState?.artifactType === "batch-diagnosis"
      ? diagnosisOrState
      : buildBatchDiagnosis(diagnosisOrState, options);
  const blockedSystems = (Array.isArray(diagnosis.systems) ? diagnosis.systems : [])
    .filter((system) => !system.ready)
    .sort((left, right) => {
      const priorityRank = { P0: 0, P1: 1, P2: 2 };
      const leftPriority = priorityRank[resolveRepairPriority(left.gaps)] ?? 3;
      const rightPriority = priorityRank[resolveRepairPriority(right.gaps)] ?? 3;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return Number(left.truthScorePercent ?? 0) - Number(right.truthScorePercent ?? 0);
    });
  const truncated = blockedSystems.length > MAX_REPAIR_QUEUE_ITEMS;
  const items = blockedSystems
    .slice(0, MAX_REPAIR_QUEUE_ITEMS)
    .map((system, index) => buildRepairQueueItem(system, index, options));
  const requiresAgentWriting = items.filter((item) => item.requiresAgentWriting).length;
  const autoRunnable = items.filter((item) => item.canAutoRun).length;
  return {
    artifactType: "batch-repair-queue",
    version: 1,
    batchId: diagnosis.batchId || "",
    status: diagnosis.status || "",
    generatedAt: nowIso(options.now),
    sourceDiagnosis: {
      generatedAt: diagnosis.generatedAt || "",
      targetTruthScorePercent: diagnosis.targetTruthScorePercent || TARGET_TRUTH_SCORE,
    },
    policy: {
      maxItems: MAX_REPAIR_QUEUE_ITEMS,
      reset: false,
      reviewNodeAllowed: false,
      allowAgentWriting: Boolean(options.allowAgentWriting),
      nodeAllowlist: FULL_WHITEPAPER_NODES.slice(),
    },
    summary: {
      total: items.length,
      autoRunnable,
      blocked: items.length - autoRunnable,
      requiresAgentWriting,
      lowQuota: items.length - requiresAgentWriting,
      truncated,
    },
    items,
  };
}

function renderBatchRepairQueueMarkdown(repairQueue = {}) {
  const summary = repairQueue.summary || {};
  const rows = (repairQueue.items || []).map((item) =>
    [
      mdCell(item.priority),
      mdCell(item.systemCode),
      mdCell(item.systemName),
      mdCell(item.canAutoRun ? "yes" : "no"),
      mdCell(item.quotaImpact || "-"),
      mdCell(item.nodesCsv || "-"),
      mdCell(item.reason || "-"),
      mdCell(item.blockedReason || "-"),
    ].join(" | "),
  );
  return [
    "# Batch Repair Queue",
    "",
    `- Generated: ${repairQueue.generatedAt || ""}`,
    `- Batch: ${repairQueue.batchId || ""}`,
    `- Status: ${repairQueue.status || ""}`,
    `- Auto-runnable: ${summary.autoRunnable || 0}/${summary.total || 0}`,
    `- Blocked: ${summary.blocked || 0}`,
    `- Requires Agent-writing quota: ${summary.requiresAgentWriting || 0}`,
    `- Truncated: ${summary.truncated ? "yes" : "no"}`,
    `- Policy: reset=false, reviewNodeAllowed=false, allowAgentWriting=${repairQueue.policy?.allowAgentWriting ? "true" : "false"}`,
    "",
    "| Priority | System | Name | Auto | Quota | Nodes | Reason | Blocked reason |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    rows.length ? rows.join("\n") : "| - | - | - | - | - | - | - | - |",
    "",
    "## Commands",
    "",
    ...(repairQueue.items || []).flatMap((item) => [
      `### ${item.systemCode || "-"} ${item.systemName || ""}`.trim(),
      "",
      `- Can auto-run: ${item.canAutoRun ? "yes" : "no"}`,
      `- Command: npm run ${item.command?.npmScript || "batch"} -- ${(item.command?.args || []).join(" ")}`,
      `- Reset: ${item.reset ? "true" : "false"}`,
      `- Narrative part: ${item.narrativePart || "-"}`,
      `- Missing writable claims: ${item.missingWritableClaimIds?.join(", ") || "-"}`,
      item.blockedReason ? `- Blocked reason: ${item.blockedReason}` : "",
      "",
    ]),
  ].join("\n");
}

function writeBatchRepairQueue(outputRoot, diagnosisOrState, options = {}) {
  const batchDir = path.join(outputRoot, "_batch");
  const repairQueue = buildBatchRepairQueue(diagnosisOrState, options);
  const jsonPath = path.join(batchDir, "repair-queue.json");
  const markdownPath = path.join(batchDir, "repair-queue.md");
  writeJson(jsonPath, repairQueue);
  fs.writeFileSync(markdownPath, renderBatchRepairQueueMarkdown(repairQueue), "utf8");
  return {
    repairQueue,
    artifacts: {
      repairQueueJson: path.relative(batchDir, jsonPath).replace(/\\/g, "/"),
      repairQueueMarkdown: path.relative(batchDir, markdownPath).replace(/\\/g, "/"),
    },
  };
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
  const repairAllowAgentWriting = resolveRepairAllowAgentWriting(args, context.config);
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
      repairAllowAgentWriting,
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
      const { diagnosis, artifacts } = writeBatchDiagnosis(context.outputRoot, state);
      const { repairQueue, artifacts: repairQueueArtifacts } = writeBatchRepairQueue(
        context.outputRoot,
        diagnosis,
        { allowAgentWriting: repairAllowAgentWriting },
      );
      state = {
        ...state,
        diagnosis: {
          summary: diagnosis.summary,
          artifacts,
          generatedAt: diagnosis.generatedAt,
        },
        repairQueue: {
          summary: repairQueue.summary,
          artifacts: repairQueueArtifacts,
          generatedAt: repairQueue.generatedAt,
        },
      };
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
        const { diagnosis, artifacts } = writeBatchDiagnosis(context.outputRoot, state);
        const { repairQueue, artifacts: repairQueueArtifacts } = writeBatchRepairQueue(
          context.outputRoot,
          diagnosis,
          { allowAgentWriting: repairAllowAgentWriting },
        );
        state = {
          ...state,
          diagnosis: {
            summary: diagnosis.summary,
            artifacts,
            generatedAt: diagnosis.generatedAt,
          },
          repairQueue: {
            summary: repairQueue.summary,
            artifacts: repairQueueArtifacts,
            generatedAt: repairQueue.generatedAt,
          },
        };
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
  buildBatchDiagnosis,
  buildBatchRepairQueue,
  buildBatchTruthSummary,
  buildRetryArgs,
  buildRetryNodes,
  classifyBatchFailure,
  createBatchState,
  loadBatchConfig,
  recomputeBatchState,
  refreshBatchStateFromDisk,
  renderBatchRepairQueueMarkdown,
  resolveBatchConcurrency,
  resolveBatchRetries,
  resolveRepairAllowAgentWriting,
  resolveBatchLogFile,
  runBatchPipeline,
  selectBatchSystems,
  summarizeBatchFailures,
  updateBatchSystem,
  renderBatchDiagnosisMarkdown,
  writeBatchDiagnosis,
  writeBatchRepairQueue,
  writeBatchRunState,
};
