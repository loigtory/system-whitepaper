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

const REPAIR_NODE_ORDER = NODES.map((node) => node.id).filter((nodeId) => nodeId !== "review");
const REPAIR_NODE_ALLOWLIST = new Set(REPAIR_NODE_ORDER);
const DEFAULT_MAX_ITEMS = 20;

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

function appendLog(filePath, chunk) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, chunk, "utf8");
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
  buildRepairRunPlan,
  normalizeRepairNodes,
  readRepairQueue,
  renderRepairRunPlanMarkdown,
  resolveRepairQueuePath,
  runRepairQueue,
  validateRepairItem,
  writeRepairRunPlan,
  writeRepairRunState,
};
