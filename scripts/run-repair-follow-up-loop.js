#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { spawn } = require("node:child_process");
const {
  parseArgs,
  readOptionalJsonObject,
  safeFileToken,
  writeJson,
} = require("./system-whitepaper-lib");
const { loadBatchConfig, resolveBatchConcurrency } = require("./run-whitepaper-batch");

const DEFAULT_MAX_ROUNDS = 3;
const SAFE_REPAIR_VALUE_FLAGS = new Set([
  "--systems",
  "--system",
  "--max-items",
  "--provider",
  "--model",
  "--batch-retries",
]);
const DROPPED_REPAIR_VALUE_FLAGS = new Set(["--config", "--queue"]);
const DROPPED_REPAIR_BOOLEAN_FLAGS = new Set([
  "--allow-agent-writing",
  "--dry-run",
  "--continue-on-error",
  "--repair-allow-agent-writing",
  "--reset",
  "--review-rerun",
]);

function nowIso(value) {
  return value || new Date().toISOString();
}

function normalizeBooleanOption(value) {
  if (value === true) return true;
  if (value === false || value === undefined || value === null || value === "") return false;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function normalizePositiveInteger(value, fallback) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function resolveFollowUpPath(context = {}, args = {}) {
  if (args.plan) {
    const planPath = String(args.plan);
    return path.isAbsolute(planPath) ? planPath : path.resolve(context.projectRoot || process.cwd(), planPath);
  }
  return path.join(context.outputRoot || "outputs", "_batch", "repair-follow-up-plan.json");
}

function readFollowUpPlan(filePath) {
  const plan = readOptionalJsonObject(filePath);
  if (!plan) throw new Error(`repair-follow-up-plan.json is missing or malformed: ${filePath}`);
  if (plan.artifactType && plan.artifactType !== "batch-repair-follow-up-plan") {
    throw new Error(`Unsupported follow-up artifactType: ${plan.artifactType}`);
  }
  return plan;
}

function createLoopSkippedCommand(command = {}, reason) {
  return {
    id: command.id || "",
    reason,
    npmScript: command.command?.npmScript || "",
    args: Array.isArray(command.command?.args) ? command.command.args : [],
  };
}

function selectNextFollowUpCommand(plan = {}) {
  const commands = Array.isArray(plan.commands) ? plan.commands : [];
  const skipped = [];
  for (const command of commands) {
    if (!command?.command || typeof command.command !== "object") {
      skipped.push(createLoopSkippedCommand(command, "missing-command"));
      continue;
    }
    if (command.command.npmScript !== "repair:batch") {
      skipped.push(createLoopSkippedCommand(command, "unsupported-npm-script"));
      continue;
    }
    if (command.requiresAgentWriting || command.requiresExplicitQuotaApproval) {
      skipped.push(createLoopSkippedCommand(command, "agent-writing-not-allowed"));
      continue;
    }
    if (!command.canRunWithoutAgentWriting || command.canAutoRun !== true) {
      skipped.push(createLoopSkippedCommand(command, "not-low-quota-auto-runnable"));
      continue;
    }
    return { command, skipped };
  }
  return { command: null, skipped };
}

function buildRepairBatchChildArgs(command = {}, options = {}) {
  const rawArgs = Array.isArray(command.command?.args) ? command.command.args : [];
  const args = [
    "scripts/run-batch-repair-queue.js",
    "--config",
    options.configPath || "config/systems.local.yaml",
    "--concurrency",
    String(options.concurrency || 4),
  ];
  for (let index = 0; index < rawArgs.length; index += 1) {
    const value = String(rawArgs[index] || "");
    if (!value) continue;
    if (SAFE_REPAIR_VALUE_FLAGS.has(value)) {
      const next = rawArgs[index + 1];
      if (next !== undefined && next !== null && !String(next).startsWith("--")) {
        args.push(value, String(next));
        index += 1;
      }
      continue;
    }
    if (DROPPED_REPAIR_VALUE_FLAGS.has(value)) {
      index += 1;
      continue;
    }
    if (DROPPED_REPAIR_BOOLEAN_FLAGS.has(value)) continue;
    if (value.startsWith("--")) {
      if (rawArgs[index + 1] !== undefined && !String(rawArgs[index + 1]).startsWith("--")) {
        index += 1;
      }
      continue;
    }
  }
  if (options.provider && !args.includes("--provider")) args.push("--provider", options.provider);
  if (options.model && !args.includes("--model")) args.push("--model", options.model);
  if (
    options.batchRetries !== undefined &&
    options.batchRetries !== null &&
    options.batchRetries !== "" &&
    !args.includes("--batch-retries")
  ) {
    args.push("--batch-retries", String(options.batchRetries));
  }
  return args;
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

function writeFollowUpLoopState(outputRoot, state) {
  const filePath = path.join(outputRoot, "_batch", "repair-follow-up-loop-state.json");
  writeJson(filePath, state);
  return filePath;
}

function summarizeLoopStatus(plan = {}, rounds = [], options = {}) {
  if (plan.status === "complete") return { status: "complete", reason: "follow-up plan is complete" };
  if (plan.source?.closureStatus === "passed") return { status: "complete", reason: "repair closure passed" };
  if (plan.status === "needs-agent-writing") return { status: "needs-agent-writing", reason: "agent-writing quota approval is required" };
  if (plan.status === "blocked") return { status: "blocked", reason: "follow-up plan is blocked" };
  if (rounds.some((round) => round.status === "failed")) return { status: "failed", reason: "a follow-up command failed" };
  if (rounds.length >= options.maxRounds) return { status: "max-rounds", reason: "maximum follow-up rounds reached" };
  return { status: "ready", reason: "low-quota follow-up is available" };
}

async function runRepairFollowUpLoop(options = {}) {
  const args = options.args || parseArgs(process.argv.slice(2));
  const context = loadBatchConfig(args.config || options.configPath);
  const concurrency = resolveBatchConcurrency(args, context.config);
  const maxRounds = normalizePositiveInteger(args["max-rounds"], DEFAULT_MAX_ROUNDS);
  const planPath = resolveFollowUpPath(context, args);
  const spawnImpl = typeof options.spawn === "function" ? options.spawn : spawn;
  const runId = nowIso(options.now).replace(/[^0-9A-Za-z]+/g, "").slice(0, 14) || Date.now();
  let plan = options.followUpPlan || readFollowUpPlan(planPath);
  let state = {
    artifactType: "batch-repair-follow-up-loop-state",
    version: 1,
    status: "running",
    startedAt: nowIso(options.now),
    finishedAt: "",
    planPath,
    maxRounds,
    policy: {
      agentWritingAllowed: false,
      supportedNpmScripts: ["repair:batch"],
    },
    rounds: [],
    skipped: [],
    finalPlan: {
      status: plan.status || "",
      nextBestAction: plan.nextBestAction || "",
      summary: plan.summary || {},
    },
    updatedAt: nowIso(options.now),
  };
  writeFollowUpLoopState(context.outputRoot, state);

  for (let roundIndex = 0; roundIndex < maxRounds; roundIndex += 1) {
    const terminal = summarizeLoopStatus(plan, state.rounds, { maxRounds });
    if (terminal.status !== "ready") {
      state.status = terminal.status;
      state.reason = terminal.reason;
      break;
    }
    const { command, skipped } = selectNextFollowUpCommand(plan);
    state.skipped.push(...skipped);
    if (!command) {
      state.status = "blocked";
      state.reason = "no low-quota auto-runnable follow-up command is available";
      break;
    }
    const childArgs = buildRepairBatchChildArgs(command, {
      configPath: context.configPath,
      concurrency,
      provider: args.provider || "",
      model: args.model || "",
      batchRetries: args["batch-retries"],
    });
    const logFile = path.join(
      context.outputRoot,
      "_batch",
      "logs",
      `repair-follow-up-${runId}-${String(roundIndex + 1).padStart(2, "0")}-${safeFileToken(command.id)}.log`,
    );
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.writeFileSync(
      logFile,
      [
        "# system-whitepaper repair follow-up loop log",
        `round=${roundIndex + 1}`,
        `command=${command.id || ""}`,
        `startedAt=${new Date().toISOString()}`,
        "",
      ].join("\n"),
      "utf8",
    );
    const round = {
      index: roundIndex + 1,
      commandId: command.id || "",
      npmScript: command.command.npmScript,
      args: childArgs,
      status: normalizeBooleanOption(args["dry-run"]) ? "dry-run" : "running",
      logFile,
      startedAt: new Date().toISOString(),
      finishedAt: "",
      exitCode: null,
      signal: "",
      error: "",
    };
    state.rounds.push(round);
    state.updatedAt = new Date().toISOString();
    writeFollowUpLoopState(context.outputRoot, state);

    if (normalizeBooleanOption(args["dry-run"])) {
      round.finishedAt = new Date().toISOString();
      state.status = "dry-run";
      state.reason = "dry-run stops before executing the selected follow-up command";
      state.updatedAt = new Date().toISOString();
      writeFollowUpLoopState(context.outputRoot, state);
      break;
    }

    const child = spawnImpl(process.execPath, childArgs, {
      cwd: context.projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const result = await waitForChild(child, logFile);
    const failed = result.exitCode !== 0 || result.signal || result.error;
    round.status = failed ? "failed" : "success";
    round.exitCode = result.exitCode;
    round.signal = result.signal || "";
    round.error = result.error || "";
    round.finishedAt = new Date().toISOString();
    state.updatedAt = new Date().toISOString();
    writeFollowUpLoopState(context.outputRoot, state);
    if (failed) {
      state.status = "failed";
      state.reason = "a follow-up command failed";
      break;
    }
    plan = readFollowUpPlan(planPath);
    state.finalPlan = {
      status: plan.status || "",
      nextBestAction: plan.nextBestAction || "",
      summary: plan.summary || {},
    };
    state.updatedAt = new Date().toISOString();
    writeFollowUpLoopState(context.outputRoot, state);
  }

  if (state.status === "running") {
    const terminal = summarizeLoopStatus(plan, state.rounds, { maxRounds });
    state.status = terminal.status;
    state.reason = terminal.reason;
  }
  state.finishedAt = new Date().toISOString();
  state.finalPlan = {
    status: plan.status || "",
    nextBestAction: plan.nextBestAction || "",
    summary: plan.summary || {},
  };
  state.updatedAt = new Date().toISOString();
  writeFollowUpLoopState(context.outputRoot, state);
  return state;
}

async function main() {
  const state = await runRepairFollowUpLoop();
  console.log(
    `Repair follow-up loop finished: status=${state.status}, rounds=${state.rounds.length}, reason=${state.reason || ""}`,
  );
  if (["failed", "blocked"].includes(state.status)) process.exitCode = 2;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  buildRepairBatchChildArgs,
  readFollowUpPlan,
  resolveFollowUpPath,
  runRepairFollowUpLoop,
  selectNextFollowUpCommand,
  summarizeLoopStatus,
  writeFollowUpLoopState,
};
