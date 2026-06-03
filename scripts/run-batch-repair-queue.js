#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const {
  parseArgs,
  readOptionalJsonObject,
  safeFileToken,
  writeJson,
} = require("./system-whitepaper-lib");
const { NODES } = require("./pipeline-state");
const { loadBatchConfig, resolveBatchConcurrency } = require("./run-whitepaper-batch");
const { runBatchAcceptance } = require("./check-batch-acceptance");
const { runDeliveryReadiness } = require("./check-delivery-readiness");

const REPAIR_NODE_ORDER = NODES.map((node) => node.id).filter((nodeId) => nodeId !== "review");
const REPAIR_NODE_ALLOWLIST = new Set(REPAIR_NODE_ORDER);
const DEFAULT_MAX_ITEMS = 20;
const TARGET_TRUTH_SCORE = 95;
const DEFAULT_FOLLOW_UP_CONCURRENCY = 4;

function nowIso(value) {
  return value || new Date().toISOString();
}

function splitCsv(value) {
  if (Array.isArray(value)) return value.flatMap((item) => splitCsv(item));
  if (value === undefined || value === null || value === true || value === false) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeBooleanOption(value) {
  if (value === true) return true;
  if (value === false || value === undefined || value === null || value === "") return false;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function normalizeRepairNodes(value) {
  const selected = new Set(splitCsv(value).filter((nodeId) => REPAIR_NODE_ALLOWLIST.has(nodeId)));
  return REPAIR_NODE_ORDER.filter((nodeId) => selected.has(nodeId));
}

function uniqueStrings(values = []) {
  const result = [];
  const seen = new Set();
  for (const item of Array.isArray(values) ? values : []) {
    const value = String(item || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function mdCell(value) {
  const text = value === undefined || value === null || value === "" ? "-" : String(value);
  return text.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}

function shellArg(value) {
  const text = String(value ?? "");
  if (!text) return "\"\"";
  return /^[A-Za-z0-9_.,:=/@\\-]+$/.test(text) ? text : `"${text.replace(/"/g, "\\\"")}"`;
}

function buildNpmPreview(npmScript, args = []) {
  return `npm run ${npmScript}${args.length ? ` -- ${args.map(shellArg).join(" ")}` : ""}`;
}

function resolveRepairQueuePath(context = {}, args = {}) {
  if (args.queue) return path.resolve(String(args.queue));
  return path.join(context.outputRoot || "outputs", "_batch", "repair-queue.json");
}

function readRepairQueue(filePath) {
  const queue = readOptionalJsonObject(filePath);
  if (!queue) throw new Error(`repair-queue.json is missing or malformed: ${filePath}`);
  if (queue.artifactType && queue.artifactType !== "batch-repair-queue") {
    throw new Error(`Unsupported repair queue artifactType: ${queue.artifactType}`);
  }
  return queue;
}

function isAgentWritingItem(item = {}, nodes = []) {
  return (
    item.requiresAgentWriting === true ||
    item.quotaImpact === "agent-writing" ||
    nodes.includes("narrative")
  );
}

function createSkippedItem(item = {}, reason, detail = "") {
  return {
    id: item.id || "",
    systemCode: item.systemCode || "",
    reason,
    detail,
  };
}

function validateRepairItem(item = {}, options = {}) {
  const rawNodes = splitCsv(item.nodes && item.nodes.length ? item.nodes : item.nodesCsv);
  const nodes = normalizeRepairNodes(rawNodes);
  const systemCode = String(item.systemCode || "").trim();
  if (!systemCode) return { ok: false, nodes, reason: "missing-system-code" };
  if (options.systems && !options.systems.has(systemCode)) {
    return { ok: false, nodes, reason: "system-filtered" };
  }
  if (item.blockedReason) return { ok: false, nodes, reason: "blocked", detail: item.blockedReason };
  if (item.canAutoRun !== true) return { ok: false, nodes, reason: "not-auto-runnable" };
  if (item.reset === true) return { ok: false, nodes, reason: "reset-not-allowed" };
  if (item.reviewRerun === true) return { ok: false, nodes, reason: "review-rerun-not-allowed" };
  if (!rawNodes.length) return { ok: false, nodes, reason: "missing-nodes" };
  if (nodes.length !== rawNodes.length) return { ok: false, nodes, reason: "disallowed-node" };
  if (!nodes.length) return { ok: false, nodes, reason: "missing-allowed-nodes" };
  if (isAgentWritingItem(item, nodes) && !options.allowAgentWriting) {
    return { ok: false, nodes, reason: "agent-writing-not-allowed" };
  }
  return { ok: true, nodes, systemCode };
}

function buildRepairBatchArgs(group = {}, options = {}) {
  const args = [
    "scripts/run-whitepaper-batch.js",
    "--config",
    options.configPath || "config/systems.local.yaml",
    "--systems",
    group.systems.join(","),
    "--nodes",
    group.nodesCsv,
    "--concurrency",
    String(options.concurrency || 4),
  ];
  if (group.narrativePart) args.push("--narrative-part", group.narrativePart);
  if (options.provider) args.push("--provider", options.provider);
  if (options.model) args.push("--model", options.model);
  if (options.batchRetries !== undefined && options.batchRetries !== null && options.batchRetries !== "") {
    args.push("--batch-retries", String(options.batchRetries));
  }
  if (options.allowAgentWriting) args.push("--repair-allow-agent-writing");
  return args;
}

function buildRepairRunPlan(repairQueue = {}, options = {}) {
  const maxItems = Math.max(1, Math.floor(Number(options.maxItems || DEFAULT_MAX_ITEMS)));
  const selectedSystems = splitCsv(options.systems).length ? new Set(splitCsv(options.systems)) : null;
  const seenSystems = new Set();
  const skipped = [];
  const runnable = [];
  const items = Array.isArray(repairQueue.items) ? repairQueue.items : [];

  for (const item of items.slice(0, maxItems)) {
    const validation = validateRepairItem(item, {
      allowAgentWriting: Boolean(options.allowAgentWriting),
      systems: selectedSystems,
    });
    if (!validation.ok) {
      if (validation.reason !== "system-filtered") {
        skipped.push(createSkippedItem(item, validation.reason, validation.detail || ""));
      }
      continue;
    }
    if (seenSystems.has(validation.systemCode)) {
      skipped.push(createSkippedItem(item, "duplicate-system", "Only the first repair item per system is run."));
      continue;
    }
    seenSystems.add(validation.systemCode);
    runnable.push({
      ...item,
      systemCode: validation.systemCode,
      nodes: validation.nodes,
      nodesCsv: validation.nodes.join(","),
      narrativePart: item.narrativePart || "",
      requiresAgentWriting: isAgentWritingItem(item, validation.nodes),
    });
  }

  const groupsByKey = new Map();
  for (const item of runnable) {
    const key = [item.nodesCsv, item.narrativePart || "", item.requiresAgentWriting ? "agent" : "low"].join("|");
    if (!groupsByKey.has(key)) {
      groupsByKey.set(key, {
        id: `repair-group-${String(groupsByKey.size + 1).padStart(2, "0")}`,
        systems: [],
        nodes: item.nodes,
        nodesCsv: item.nodesCsv,
        narrativePart: item.narrativePart || "",
        itemIds: [],
        requiresAgentWriting: item.requiresAgentWriting,
      });
    }
    const group = groupsByKey.get(key);
    group.systems.push(item.systemCode);
    group.itemIds.push(item.id || "");
  }

  const groups = [...groupsByKey.values()].map((group) => ({
    ...group,
    systems: uniqueStrings(group.systems),
    itemIds: uniqueStrings(group.itemIds),
  }));
  for (const group of groups) {
    group.command = {
      script: "scripts/run-whitepaper-batch.js",
      args: buildRepairBatchArgs(group, options),
    };
  }

  return {
    artifactType: "batch-repair-run-plan",
    version: 1,
    generatedAt: nowIso(options.now),
    sourceQueue: {
      batchId: repairQueue.batchId || "",
      generatedAt: repairQueue.generatedAt || "",
      totalItems: items.length,
    },
    policy: {
      reset: false,
      reviewNodeAllowed: false,
      allowAgentWriting: Boolean(options.allowAgentWriting),
      maxItems,
      concurrency: Number(options.concurrency || 4),
    },
    summary: {
      queueItems: items.length,
      runnableItems: runnable.length,
      runnableGroups: groups.length,
      skipped: skipped.length,
      requiresAgentWriting: runnable.filter((item) => item.requiresAgentWriting).length,
      lowQuota: runnable.filter((item) => !item.requiresAgentWriting).length,
    },
    groups,
    skipped,
  };
}

function renderRepairRunPlanMarkdown(plan = {}) {
  const summary = plan.summary || {};
  const groupRows = (plan.groups || []).map((group) =>
    [
      group.id || "-",
      group.systems?.join(",") || "-",
      group.nodesCsv || "-",
      group.narrativePart || "-",
      group.requiresAgentWriting ? "agent-writing" : "low",
    ].join(" | "),
  );
  const skippedRows = (plan.skipped || []).map((item) =>
    [item.systemCode || "-", item.id || "-", item.reason || "-", item.detail || "-"].join(" | "),
  );
  return [
    "# Batch Repair Run Plan",
    "",
    `- Generated: ${plan.generatedAt || ""}`,
    `- Queue batch: ${plan.sourceQueue?.batchId || ""}`,
    `- Runnable items: ${summary.runnableItems || 0}/${summary.queueItems || 0}`,
    `- Runnable groups: ${summary.runnableGroups || 0}`,
    `- Skipped: ${summary.skipped || 0}`,
    `- Requires Agent-writing quota: ${summary.requiresAgentWriting || 0}`,
    `- Policy: reset=false, reviewNodeAllowed=false, allowAgentWriting=${plan.policy?.allowAgentWriting ? "true" : "false"}`,
    "",
    "| Group | Systems | Nodes | Narrative part | Quota |",
    "| --- | --- | --- | --- | --- |",
    groupRows.length ? groupRows.join("\n") : "| - | - | - | - | - |",
    "",
    "## Skipped",
    "",
    "| System | Item | Reason | Detail |",
    "| --- | --- | --- | --- |",
    skippedRows.length ? skippedRows.join("\n") : "| - | - | - | - |",
    "",
  ].join("\n");
}

function writeRepairRunPlan(outputRoot, plan) {
  const batchDir = path.join(outputRoot, "_batch");
  const jsonPath = path.join(batchDir, "repair-run-plan.json");
  const markdownPath = path.join(batchDir, "repair-run-plan.md");
  writeJson(jsonPath, plan);
  fs.writeFileSync(markdownPath, renderRepairRunPlanMarkdown(plan), "utf8");
  return {
    planJson: path.relative(batchDir, jsonPath).replace(/\\/g, "/"),
    planMarkdown: path.relative(batchDir, markdownPath).replace(/\\/g, "/"),
  };
}

function writeRepairRunState(outputRoot, state) {
  const filePath = path.join(outputRoot, "_batch", "repair-run-state.json");
  writeJson(filePath, state);
  return filePath;
}

function readBatchArtifact(outputRoot, fileName) {
  return readOptionalJsonObject(path.join(outputRoot, "_batch", fileName));
}

function summarizeClosureDiagnosis(diagnosis = null) {
  const summary = diagnosis?.summary || {};
  const systems = Array.isArray(diagnosis?.systems) ? diagnosis.systems : [];
  const total = Number(summary.total || systems.length || 0);
  const ready = Number(summary.ready || systems.filter((item) => item.ready).length || 0);
  const blocked = Number(summary.blocked || Math.max(0, total - ready));
  const belowTarget = systems.filter((item) => {
    if (item.truthScorePercent === null || item.truthScorePercent === undefined) return true;
    return Number(item.truthScorePercent || 0) < TARGET_TRUTH_SCORE || !item.canSubmitReview;
  }).length;
  const minTruthScore = systems.reduce((min, item) => {
    if (item.truthScorePercent === null || item.truthScorePercent === undefined) return min;
    const score = Number(item.truthScorePercent || 0);
    return min === null ? score : Math.min(min, score);
  }, null);
  return {
    total,
    ready,
    blocked,
    belowTarget,
    missingWritableClaims: Number(summary.missingWritableClaims || 0),
    minTruthScore,
  };
}

function summarizeClosureRepairQueue(repairQueue = null) {
  const summary = repairQueue?.summary || {};
  return {
    total: Number(summary.total || 0),
    autoRunnable: Number(summary.autoRunnable || 0),
    blocked: Number(summary.blocked || 0),
    requiresAgentWriting: Number(summary.requiresAgentWriting || 0),
  };
}

function buildRepairClosureReport(state = {}, options = {}) {
  const outputRoot = options.outputRoot || "";
  const diagnosis = options.diagnosis || (outputRoot ? readBatchArtifact(outputRoot, "diagnosis.json") : null);
  const repairQueue = options.repairQueue || (outputRoot ? readBatchArtifact(outputRoot, "repair-queue.json") : null);
  const diagnosisSummary = summarizeClosureDiagnosis(diagnosis);
  const repairQueueSummary = summarizeClosureRepairQueue(repairQueue);
  const failedGroups = (Array.isArray(state.groups) ? state.groups : []).filter((group) => group.status === "failed");
  const pendingGroups = (Array.isArray(state.groups) ? state.groups : []).filter((group) => group.status === "pending");
  const diagnosisAvailable = Boolean(diagnosis);
  const repairQueueAvailable = Boolean(repairQueue);
  const canSubmitAll =
    diagnosisAvailable &&
    diagnosisSummary.total > 0 &&
    diagnosisSummary.ready === diagnosisSummary.total &&
    diagnosisSummary.blocked === 0 &&
    diagnosisSummary.belowTarget === 0 &&
    diagnosisSummary.missingWritableClaims === 0;
  const repairQueueEmpty = repairQueueAvailable && repairQueueSummary.total === 0;
  const passed = canSubmitAll && repairQueueEmpty && failedGroups.length === 0 && pendingGroups.length === 0;
  const blockers = [];
  if (!diagnosisAvailable) blockers.push("batch diagnosis is missing after repair run");
  if (!repairQueueAvailable) blockers.push("batch repair queue is missing after repair run");
  if (failedGroups.length) blockers.push(`${failedGroups.length} repair group(s) failed`);
  if (pendingGroups.length) blockers.push(`${pendingGroups.length} repair group(s) were not executed`);
  if (diagnosisSummary.blocked > 0) blockers.push(`${diagnosisSummary.blocked} system(s) remain blocked`);
  if (diagnosisSummary.belowTarget > 0) blockers.push(`${diagnosisSummary.belowTarget} system(s) remain below ${TARGET_TRUTH_SCORE}% truth readiness`);
  if (diagnosisSummary.missingWritableClaims > 0) {
    blockers.push(`${diagnosisSummary.missingWritableClaims} writable claim(s) remain uncovered`);
  }
  if (repairQueueSummary.total > 0) blockers.push(`${repairQueueSummary.total} repair queue item(s) remain`);
  return {
    artifactType: "batch-repair-closure",
    version: 1,
    generatedAt: nowIso(options.now),
    status: passed ? "passed" : "blocked",
    targetTruthScorePercent: TARGET_TRUTH_SCORE,
    canSubmitAll,
    repairQueueEmpty,
    runStatus: state.status || "",
    runStartedAt: state.startedAt || "",
    runFinishedAt: state.finishedAt || "",
    diagnosisAvailable,
    repairQueueAvailable,
    diagnosis: {
      generatedAt: diagnosis?.generatedAt || "",
      summary: diagnosisSummary,
    },
    repairQueue: {
      generatedAt: repairQueue?.generatedAt || "",
      summary: repairQueueSummary,
    },
    failedGroups: failedGroups.map((group) => ({
      id: group.id || "",
      systems: group.systems || [],
      nodesCsv: group.nodesCsv || "",
      exitCode: group.exitCode,
      signal: group.signal || "",
      error: group.error || "",
      logFile: group.logFile || "",
    })),
    pendingGroups: pendingGroups.map((group) => ({
      id: group.id || "",
      systems: group.systems || [],
      nodesCsv: group.nodesCsv || "",
    })),
    blockers,
  };
}

function renderRepairClosureMarkdown(closure = {}) {
  const diagnosis = closure.diagnosis?.summary || {};
  const repairQueue = closure.repairQueue?.summary || {};
  const failedRows = (closure.failedGroups || []).map((group) =>
    [
      group.id || "-",
      (group.systems || []).join(",") || "-",
      group.nodesCsv || "-",
      group.exitCode ?? "-",
      group.signal || "-",
      group.error || "-",
      group.logFile || "-",
    ].join(" | "),
  );
  return [
    "# Batch Repair Closure",
    "",
    `- Generated: ${closure.generatedAt || ""}`,
    `- Status: ${closure.status || ""}`,
    `- Run status: ${closure.runStatus || ""}`,
    `- Target truth score: ${closure.targetTruthScorePercent || TARGET_TRUTH_SCORE}%`,
    `- Can submit all: ${closure.canSubmitAll ? "yes" : "no"}`,
    `- Repair queue empty: ${closure.repairQueueEmpty ? "yes" : "no"}`,
    `- Ready systems: ${diagnosis.ready || 0}/${diagnosis.total || 0}`,
    `- Blocked systems: ${diagnosis.blocked || 0}`,
    `- Below target: ${diagnosis.belowTarget || 0}`,
    `- Missing writable claims: ${diagnosis.missingWritableClaims || 0}`,
    `- Remaining repair items: ${repairQueue.total || 0}`,
    "",
    "## Blockers",
    "",
    ...(closure.blockers?.length ? closure.blockers.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Failed Groups",
    "",
    "| Group | Systems | Nodes | Exit | Signal | Error | Log |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    failedRows.length ? failedRows.join("\n") : "| - | - | - | - | - | - | - |",
    "",
  ].join("\n");
}

function writeRepairClosure(outputRoot, state, options = {}) {
  const batchDir = path.join(outputRoot, "_batch");
  const closure = buildRepairClosureReport(state, { ...options, outputRoot });
  const jsonPath = path.join(batchDir, "repair-closure.json");
  const markdownPath = path.join(batchDir, "repair-closure.md");
  writeJson(jsonPath, closure);
  fs.writeFileSync(markdownPath, renderRepairClosureMarkdown(closure), "utf8");
  return {
    closure,
    artifacts: {
      closureJson: path.relative(batchDir, jsonPath).replace(/\\/g, "/"),
      closureMarkdown: path.relative(batchDir, markdownPath).replace(/\\/g, "/"),
    },
  };
}

function createFollowUpCommand(id, purpose, npmScript, args = [], options = {}) {
  const requiresAgentWriting = Boolean(options.requiresAgentWriting);
  const canAutoRun = Boolean(options.canAutoRun) && !requiresAgentWriting;
  return {
    id,
    purpose,
    quotaImpact: options.quotaImpact || (requiresAgentWriting ? "agent-writing" : "low"),
    canAutoRun,
    canRunWithoutAgentWriting: canAutoRun,
    requiresAgentWriting,
    requiresExplicitQuotaApproval: requiresAgentWriting,
    systems: uniqueStrings(options.systems || []),
    nodesCsv: options.nodesCsv || "",
    narrativePart: options.narrativePart || "",
    source: options.source || "",
    command: {
      npmScript,
      args,
      preview: buildNpmPreview(npmScript, args),
    },
  };
}

function classifyRepairQueueItems(items = []) {
  const lowQuotaItems = [];
  const agentWritingItems = [];
  const blockedItems = [];
  for (const item of Array.isArray(items) ? items : []) {
    const lowValidation = validateRepairItem(item, { allowAgentWriting: false });
    if (lowValidation.ok) {
      lowQuotaItems.push({ item, validation: lowValidation });
      continue;
    }
    const agentValidation = validateRepairItem(item, { allowAgentWriting: true });
    if (agentValidation.ok && isAgentWritingItem(item, agentValidation.nodes)) {
      agentWritingItems.push({ item, validation: agentValidation });
      continue;
    }
    blockedItems.push({
      item,
      reason: lowValidation.reason || agentValidation.reason || "blocked",
      detail: lowValidation.detail || agentValidation.detail || item.blockedReason || "",
    });
  }
  return { lowQuotaItems, agentWritingItems, blockedItems };
}

function buildRepairQueueFollowUpCommand(id, purpose, classifiedItems = [], options = {}) {
  const systems = uniqueStrings(classifiedItems.map(({ validation }) => validation.systemCode));
  if (!systems.length) return null;
  const args = ["--systems", systems.join(",")];
  if (options.requiresAgentWriting) args.unshift("--allow-agent-writing");
  if (options.provider) args.push("--provider", options.provider);
  if (options.model) args.push("--model", options.model);
  if (options.batchRetries !== undefined && options.batchRetries !== null && options.batchRetries !== "") {
    args.push("--batch-retries", String(options.batchRetries));
  }
  return createFollowUpCommand(id, purpose, "repair:batch", args, {
    canAutoRun: true,
    requiresAgentWriting: Boolean(options.requiresAgentWriting),
    systems,
    source: "repair-queue",
  });
}

function buildGroupFollowUpCommand(group = {}, source, options = {}) {
  const systems = uniqueStrings(group.systems || []);
  const nodesCsv = String(group.nodesCsv || "").trim();
  if (!systems.length || !nodesCsv) return null;
  const args = [
    "--systems",
    systems.join(","),
    "--nodes",
    nodesCsv,
    "--concurrency",
    String(options.concurrency || DEFAULT_FOLLOW_UP_CONCURRENCY),
  ];
  if (group.narrativePart) args.push("--narrative-part", group.narrativePart);
  if (options.provider) args.push("--provider", options.provider);
  if (options.model) args.push("--model", options.model);
  if (options.batchRetries !== undefined && options.batchRetries !== null && options.batchRetries !== "") {
    args.push("--batch-retries", String(options.batchRetries));
  }
  return createFollowUpCommand(
    `${source}-${group.id || systems.join("-")}`,
    source === "failed-group" ? "Retry failed repair group directly." : "Run pending repair group directly.",
    "batch",
    args,
    {
      canAutoRun: true,
      requiresAgentWriting: Boolean(group.requiresAgentWriting || nodesCsv.split(",").includes("narrative")),
      systems,
      nodesCsv,
      narrativePart: group.narrativePart || "",
      source,
    },
  );
}

function buildDiagnosisFollowUpCommands(diagnosis = null, options = {}) {
  const commands = [];
  const systems = Array.isArray(diagnosis?.systems) ? diagnosis.systems : [];
  for (const system of systems.filter((item) => !item.ready)) {
    const action = (Array.isArray(system.actions) ? system.actions : []).find(
      (item) => item.canRetry && Array.isArray(item.rerunNodes) && item.rerunNodes.length,
    );
    if (!action) continue;
    const nodes = normalizeRepairNodes(action.rerunNodes);
    if (!nodes.length) continue;
    const args = [
      "--systems",
      system.code,
      "--nodes",
      nodes.join(","),
      "--concurrency",
      String(options.concurrency || DEFAULT_FOLLOW_UP_CONCURRENCY),
    ];
    if (action.narrativePart) args.push("--narrative-part", action.narrativePart);
    if (options.provider) args.push("--provider", options.provider);
    if (options.model) args.push("--model", options.model);
    commands.push(
      createFollowUpCommand(
        `diagnosis-${safeFileToken(system.code)}-${safeFileToken(action.id || "action")}`,
        action.message || "Run diagnosis-derived repair action.",
        "batch",
        args,
        {
          canAutoRun: true,
          requiresAgentWriting: action.quotaImpact === "agent-writing" || nodes.includes("narrative"),
          systems: [system.code],
          nodesCsv: nodes.join(","),
          narrativePart: action.narrativePart || "",
          source: "diagnosis",
        },
      ),
    );
  }
  return commands;
}

function summarizeFollowUpStatus(closure, commands = [], blockedQueueItems = []) {
  if (closure?.status === "passed") {
    return {
      status: "complete",
      nextBestAction: "No repair follow-up is required; the batch is ready for review submission.",
    };
  }
  const lowQuotaCommands = commands.filter((item) => item.canRunWithoutAgentWriting).length;
  const agentWritingCommands = commands.filter((item) => item.requiresAgentWriting).length;
  if (lowQuotaCommands > 0) {
    return {
      status: "ready-to-run",
      nextBestAction: "Run the first low-quota follow-up command, then rerun repair closure.",
    };
  }
  if (agentWritingCommands > 0) {
    return {
      status: "needs-agent-writing",
      nextBestAction: "Run an agent-writing follow-up command only when quota policy permits it.",
    };
  }
  if (blockedQueueItems.length > 0) {
    return {
      status: "blocked",
      nextBestAction: "Inspect blocked repair queue items and their blockedReason values.",
    };
  }
  return {
    status: "blocked",
    nextBestAction: "Inspect closure blockers, diagnosis, and per-system artifacts before rerunning.",
  };
}

function buildRepairFollowUpPlan(state = {}, options = {}) {
  const outputRoot = options.outputRoot || "";
  const diagnosis = options.diagnosis || (outputRoot ? readBatchArtifact(outputRoot, "diagnosis.json") : null);
  const repairQueue = options.repairQueue || (outputRoot ? readBatchArtifact(outputRoot, "repair-queue.json") : null);
  const closure = options.closure || buildRepairClosureReport(state, { ...options, diagnosis, repairQueue });
  const queueItems = Array.isArray(repairQueue?.items) ? repairQueue.items : [];
  const { lowQuotaItems, agentWritingItems, blockedItems } = classifyRepairQueueItems(queueItems);
  const failedGroups = (Array.isArray(state.groups) ? state.groups : []).filter((group) => group.status === "failed");
  const pendingGroups = (Array.isArray(state.groups) ? state.groups : []).filter((group) => group.status === "pending");
  const commands = [];

  const failedGroupCommands = failedGroups
    .map((group) => buildGroupFollowUpCommand(group, "failed-group", options))
    .filter(Boolean);
  const pendingGroupCommands = pendingGroups
    .map((group) => buildGroupFollowUpCommand(group, "pending-group", options))
    .filter(Boolean);
  commands.push(...failedGroupCommands, ...pendingGroupCommands);

  const lowQuotaCommand = buildRepairQueueFollowUpCommand(
    "repair-remaining-low-quota",
    "Run remaining low-quota repair queue items.",
    lowQuotaItems,
    options,
  );
  if (lowQuotaCommand) commands.push(lowQuotaCommand);

  const agentWritingCommand = buildRepairQueueFollowUpCommand(
    "repair-remaining-agent-writing",
    "Run remaining repair queue items that require Agent-writing quota.",
    agentWritingItems,
    { ...options, requiresAgentWriting: true },
  );
  if (agentWritingCommand) commands.push(agentWritingCommand);

  if (!commands.length && diagnosis) {
    commands.push(...buildDiagnosisFollowUpCommands(diagnosis, options));
  }

  const status = summarizeFollowUpStatus(closure, commands, blockedItems);
  const blockerDetails = [
    ...(Array.isArray(closure.blockers) ? closure.blockers : []),
    ...blockedItems.map(({ item, reason, detail }) =>
      `${item.systemCode || "-"} repair item blocked: ${reason}${detail ? ` (${detail})` : ""}`,
    ),
  ];
  return {
    artifactType: "batch-repair-follow-up-plan",
    version: 1,
    generatedAt: nowIso(options.now),
    status: status.status,
    nextBestAction: status.nextBestAction,
    source: {
      closureStatus: closure.status || "",
      runStatus: state.status || "",
      diagnosisGeneratedAt: diagnosis?.generatedAt || "",
      repairQueueGeneratedAt: repairQueue?.generatedAt || "",
    },
    policy: {
      reset: false,
      reviewNodeAllowed: false,
      agentWritingRequiresFlag: true,
    },
    summary: {
      commands: commands.length,
      lowQuotaCommands: commands.filter((item) => item.canRunWithoutAgentWriting).length,
      agentWritingCommands: commands.filter((item) => item.requiresAgentWriting).length,
      failedGroups: failedGroups.length,
      pendingGroups: pendingGroups.length,
      remainingQueueItems: queueItems.length,
      lowQuotaQueueItems: lowQuotaItems.length,
      agentWritingQueueItems: agentWritingItems.length,
      blockedQueueItems: blockedItems.length,
    },
    commands,
    queueItems: queueItems.map((item) => ({
      id: item.id || "",
      systemCode: item.systemCode || "",
      systemName: item.systemName || "",
      priority: item.priority || "",
      canAutoRun: Boolean(item.canAutoRun),
      quotaImpact: item.quotaImpact || "",
      nodesCsv: item.nodesCsv || normalizeRepairNodes(item.nodes || []).join(","),
      narrativePart: item.narrativePart || "",
      reason: item.reason || "",
      blockedReason: item.blockedReason || "",
    })),
    blockedQueueItems: blockedItems.map(({ item, reason, detail }) => ({
      id: item.id || "",
      systemCode: item.systemCode || "",
      reason,
      detail,
      blockedReason: item.blockedReason || "",
    })),
    blockers: uniqueStrings(blockerDetails),
  };
}

function renderRepairFollowUpPlanMarkdown(plan = {}) {
  const summary = plan.summary || {};
  const commandRows = (plan.commands || []).map((item) =>
    [
      mdCell(item.id),
      mdCell(item.canRunWithoutAgentWriting ? "yes" : "no"),
      mdCell(item.requiresAgentWriting ? "yes" : "no"),
      mdCell((item.systems || []).join(",")),
      mdCell(item.nodesCsv || "-"),
      mdCell(item.command?.preview || "-"),
      mdCell(item.purpose || "-"),
    ].join(" | "),
  );
  const queueRows = (plan.queueItems || []).map((item) =>
    [
      mdCell(item.priority),
      mdCell(item.systemCode),
      mdCell(item.canAutoRun ? "yes" : "no"),
      mdCell(item.quotaImpact || "-"),
      mdCell(item.nodesCsv || "-"),
      mdCell(item.reason || "-"),
      mdCell(item.blockedReason || "-"),
    ].join(" | "),
  );
  return [
    "# Batch Repair Follow-up Plan",
    "",
    `- Generated: ${plan.generatedAt || ""}`,
    `- Status: ${plan.status || ""}`,
    `- Next best action: ${plan.nextBestAction || ""}`,
    `- Commands: ${summary.commands || 0}`,
    `- Low-quota commands: ${summary.lowQuotaCommands || 0}`,
    `- Agent-writing commands: ${summary.agentWritingCommands || 0}`,
    `- Remaining queue items: ${summary.remainingQueueItems || 0}`,
    `- Blocked queue items: ${summary.blockedQueueItems || 0}`,
    "",
    "## Commands",
    "",
    "| ID | Safe without Agent writing | Agent writing | Systems | Nodes | Command | Purpose |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    commandRows.length ? commandRows.join("\n") : "| - | - | - | - | - | - | - |",
    "",
    "## Remaining Queue Items",
    "",
    "| Priority | System | Auto | Quota | Nodes | Reason | Blocked reason |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    queueRows.length ? queueRows.join("\n") : "| - | - | - | - | - | - | - |",
    "",
    "## Blockers",
    "",
    ...(plan.blockers?.length ? plan.blockers.map((item) => `- ${item}`) : ["- none"]),
    "",
  ].join("\n");
}

function writeRepairFollowUpPlan(outputRoot, state, options = {}) {
  const batchDir = path.join(outputRoot, "_batch");
  const followUpPlan = buildRepairFollowUpPlan(state, { ...options, outputRoot });
  const jsonPath = path.join(batchDir, "repair-follow-up-plan.json");
  const markdownPath = path.join(batchDir, "repair-follow-up-plan.md");
  writeJson(jsonPath, followUpPlan);
  fs.writeFileSync(markdownPath, renderRepairFollowUpPlanMarkdown(followUpPlan), "utf8");
  return {
    followUpPlan,
    artifacts: {
      followUpJson: path.relative(batchDir, jsonPath).replace(/\\/g, "/"),
      followUpMarkdown: path.relative(batchDir, markdownPath).replace(/\\/g, "/"),
    },
  };
}

function writeRepairTerminalArtifacts(outputRoot, state, options = {}) {
  const { closure, artifacts: closureArtifacts } = writeRepairClosure(outputRoot, state, options);
  const { followUpPlan, artifacts: followUpArtifacts } = writeRepairFollowUpPlan(outputRoot, state, {
    ...options,
    closure,
  });
  return {
    ...state,
    closure: {
      status: closure.status,
      canSubmitAll: closure.canSubmitAll,
      repairQueueEmpty: closure.repairQueueEmpty,
      blockers: closure.blockers,
      artifacts: closureArtifacts,
      generatedAt: closure.generatedAt,
      followUp: {
        status: followUpPlan.status,
        nextBestAction: followUpPlan.nextBestAction,
        artifacts: followUpArtifacts,
        commandCount: followUpPlan.summary.commands,
      },
    },
    followUpPlan: {
      status: followUpPlan.status,
      nextBestAction: followUpPlan.nextBestAction,
      summary: followUpPlan.summary,
      artifacts: followUpArtifacts,
      generatedAt: followUpPlan.generatedAt,
    },
    updatedAt: new Date().toISOString(),
  };
}

function appendLog(filePath, chunk) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, chunk, "utf8");
}

function writeRepairAcceptance(context, args = {}) {
  return runBatchAcceptance({
    args,
    context,
  }).state;
}

function writeRepairTerminalChecks(context, args = {}) {
  const acceptance = runBatchAcceptance({
    args,
    context,
  });
  const delivery = runDeliveryReadiness({
    args,
    acceptanceResult: acceptance,
    outputRoot: context.outputRoot,
  });
  return {
    acceptance: acceptance.state,
    deliveryReadiness: delivery.state,
  };
}

function waitForChild(child, logFile) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    child.stdout?.on?.("data", (chunk) => appendLog(logFile, chunk));
    child.stderr?.on?.("data", (chunk) => appendLog(logFile, chunk));
    child.on?.("error", (error) => {
      appendLog(logFile, `\nspawn-error: ${error.message}\n`);
      finish({ exitCode: null, signal: "", error: error.message });
    });
    child.on?.("close", (exitCode, signal) => {
      finish({ exitCode, signal: signal || "", error: "" });
    });
  });
}

async function runRepairQueue(options = {}) {
  const args = options.args || parseArgs(process.argv.slice(2));
  const context = loadBatchConfig(args.config || options.configPath);
  const concurrency = resolveBatchConcurrency(args, context.config);
  const allowAgentWriting = normalizeBooleanOption(args["allow-agent-writing"]);
  const queuePath = resolveRepairQueuePath(context, args);
  const queue = options.repairQueue || readRepairQueue(queuePath);
  const plan = buildRepairRunPlan(queue, {
    allowAgentWriting,
    systems: args.systems || args.system || "",
    maxItems: args["max-items"] || DEFAULT_MAX_ITEMS,
    concurrency,
    configPath: context.configPath,
    provider: args.provider || "",
    model: args.model || "",
    batchRetries: args["batch-retries"],
  });
  const planArtifacts = writeRepairRunPlan(context.outputRoot, plan);
  const startedAt = new Date().toISOString();
  let state = {
    artifactType: "batch-repair-run-state",
    version: 1,
    status: args["dry-run"] ? "dry-run" : "running",
    startedAt,
    finishedAt: "",
    queuePath,
    plan: {
      summary: plan.summary,
      artifacts: planArtifacts,
    },
    groups: plan.groups.map((group) => ({
      id: group.id,
      systems: group.systems,
      nodesCsv: group.nodesCsv,
      narrativePart: group.narrativePart,
      requiresAgentWriting: group.requiresAgentWriting,
      status: "pending",
      exitCode: null,
      signal: "",
      logFile: "",
      startedAt: "",
      finishedAt: "",
    })),
    skipped: plan.skipped,
    updatedAt: startedAt,
  };
  writeRepairRunState(context.outputRoot, state);

  if (args["dry-run"] || !plan.groups.length) {
    state = {
      ...state,
      status: args["dry-run"] ? "dry-run" : "skipped",
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state = writeRepairTerminalArtifacts(context.outputRoot, state, {
      provider: args.provider || "",
      model: args.model || "",
      batchRetries: args["batch-retries"],
      concurrency,
    });
    const terminalChecks = writeRepairTerminalChecks(context, args);
    state.acceptance = terminalChecks.acceptance;
    state.deliveryReadiness = terminalChecks.deliveryReadiness;
    writeRepairRunState(context.outputRoot, state);
    return state;
  }

  const spawnImpl = typeof options.spawn === "function" ? options.spawn : spawn;
  const continueOnError = normalizeBooleanOption(args["continue-on-error"]);
  const runId = startedAt.replace(/[^0-9A-Za-z]+/g, "").slice(0, 14) || Date.now();
  for (const group of plan.groups) {
    const index = state.groups.findIndex((item) => item.id === group.id);
    const logFile = path.join(
      context.outputRoot,
      "_batch",
      "logs",
      `repair-queue-${runId}-${safeFileToken(group.id)}.log`,
    );
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.writeFileSync(
      logFile,
      [
        "# system-whitepaper repair queue log",
        `group=${group.id}`,
        `systems=${group.systems.join(",")}`,
        `nodes=${group.nodesCsv}`,
        `startedAt=${new Date().toISOString()}`,
        "",
      ].join("\n"),
      "utf8",
    );
    state.groups[index] = {
      ...state.groups[index],
      status: "running",
      logFile,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.updatedAt = new Date().toISOString();
    writeRepairRunState(context.outputRoot, state);

    const child = spawnImpl(process.execPath, group.command.args, {
      cwd: context.projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const result = await waitForChild(child, logFile);
    const failed = result.exitCode !== 0 || result.signal || result.error;
    state.groups[index] = {
      ...state.groups[index],
      status: failed ? "failed" : "success",
      exitCode: result.exitCode,
      signal: result.signal || "",
      error: result.error || "",
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.updatedAt = new Date().toISOString();
    writeRepairRunState(context.outputRoot, state);
    if (failed && !continueOnError) break;
  }

  const failedCount = state.groups.filter((group) => group.status === "failed").length;
  const pendingCount = state.groups.filter((group) => group.status === "pending").length;
  state = {
    ...state,
    status: failedCount ? "failed" : pendingCount ? "partial" : "success",
    finishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state = writeRepairTerminalArtifacts(context.outputRoot, state, {
    provider: args.provider || "",
    model: args.model || "",
    batchRetries: args["batch-retries"],
    concurrency,
  });
  const terminalChecks = writeRepairTerminalChecks(context, args);
  state.acceptance = terminalChecks.acceptance;
  state.deliveryReadiness = terminalChecks.deliveryReadiness;
  writeRepairRunState(context.outputRoot, state);
  return state;
}

async function main() {
  const state = await runRepairQueue();
  console.log(
    `Repair queue finished: status=${state.status}, groups=${state.groups.length}, skipped=${state.skipped.length}`,
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
  buildRepairBatchArgs,
  buildRepairClosureReport,
  buildRepairFollowUpPlan,
  buildRepairRunPlan,
  normalizeRepairNodes,
  readRepairQueue,
  renderRepairClosureMarkdown,
  renderRepairFollowUpPlanMarkdown,
  renderRepairRunPlanMarkdown,
  resolveRepairQueuePath,
  runRepairQueue,
  validateRepairItem,
  writeRepairAcceptance,
  writeRepairTerminalChecks,
  writeRepairClosure,
  writeRepairFollowUpPlan,
  writeRepairRunPlan,
  writeRepairRunState,
};
