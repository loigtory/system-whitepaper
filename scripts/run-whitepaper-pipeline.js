#!/usr/bin/env node

require("./narrative/ensure-dispose-symbols").ensureDisposeSymbols();

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  normalizeAuthPaths,
  parseArgs,
  parseSystemsConfig,
  resolveConfigRelativePath,
  resolveCollectProfileOptions,
} = require("./system-whitepaper-lib");
const { verifyExistingHuntianSession } = require("./refresh-huntian-cookie");
const {
  NODES,
  createPipelineState,
  readPipelineState,
  runNodeWithRetry,
  updateNodeStatus,
  writePipelineState,
} = require("./pipeline-state");
const { runPhase3b } = require("./narrative/phase3b");
const { resolveNarrativeProvider } = require("./narrative/resolve-provider");
const { runWriteValidation } = require("./validate-write");

function runNodeScript(args, options = {}) {
  const spawnOptions = {
    cwd: options.cwd || process.cwd(),
    encoding: "utf8",
    stdio: options.stdio || "pipe",
  };
  if (options.timeoutMs) {
    spawnOptions.timeout = options.timeoutMs;
  }
  const result = spawnSync(process.execPath, args, spawnOptions);
  if (result.error) {
    throw new Error(
      `Command timed out after ${options.timeoutMs}ms: node ${args.join(" ")}\n${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      [
        `Command failed: node ${args.join(" ")}`,
        result.stdout && `stdout: ${result.stdout.trim()}`,
        result.stderr && `stderr: ${result.stderr.trim()}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function loadSystem(configPath, systemCode) {
  const config = parseSystemsConfig(fs.readFileSync(configPath, "utf8"));
  const configDir = path.dirname(path.resolve(configPath));
  normalizeAuthPaths(config, configDir);
  const system = config.systems.find((item) => item.code === systemCode);
  if (!system) throw new Error(`System not found in config: ${systemCode}`);
  const outputRoot = resolveConfigRelativePath(configDir, config.runtime?.outputDir || "outputs");
  const systemOutput = path.join(outputRoot, system.code);
  return {
    config,
    configPath: path.resolve(configPath),
    system,
    outputRoot,
    systemOutput,
    projectRoot: path.resolve(configDir, ".."),
  };
}

function selectedNodes(args) {
  if (args.nodes) {
    return String(args.nodes)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (args["with-whitepaper"]) {
    return [
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
  }
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

function resolvePipelineCollectProfile(context) {
  const { args, config, system } = context;
  return resolveCollectProfileOptions(config, system, {
    fastCollect: args["fast-collect"],
  });
}

function databaseProfileEnabled(system = {}) {
  return Boolean(system.databaseProfile?.enabled);
}

function buildCollectNodeArgs(context) {
  const { args, configPath } = context;
  const profile = resolvePipelineCollectProfile(context);
  const collectArgs = [
    "scripts/collect-evidence.js",
    "--config",
    configPath,
    "--system",
    context.system.code,
    "--max-pages",
    String(args["max-pages"] || profile.maxPages),
  ];
  if (profile.fastCollect) collectArgs.push("--fast-collect");
  if (!args.reset) collectArgs.push("--resume");
  if (args["init-only"]) collectArgs.push("--init-only");
  return collectArgs;
}

function resolveNodeMaxAttempts(nodeId, args = {}) {
  if (args.retries !== undefined) return Number(args.retries);
  return nodeId === "narrative" ? 1 : 3;
}

function ensureState(systemOutput, system, forceNew) {
  const statePath = path.join(systemOutput, "pipeline-state.json");
  const existing = forceNew ? null : readPipelineState(statePath, { persist: true });
  return {
    statePath,
    state: existing || createPipelineState(system),
  };
}

function writeBatchState(outputRoot, state, options = {}) {
  if (options.disabled) return;
  const batchPath = path.join(outputRoot, "_batch", "run-state.json");
  fs.mkdirSync(path.dirname(batchPath), { recursive: true });
  fs.writeFileSync(
    batchPath,
    JSON.stringify(
      {
        batchId: "local",
        status: state.overallStatus,
        currentSystemCode: state.code,
        systems: [
          {
            code: state.code,
            status: state.overallStatus,
            currentNode: state.currentNode,
            currentPhase: state.currentPhase,
          },
        ],
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function runPipelineNode(nodeId, context) {
  const { args, config, configPath, system, systemOutput, projectRoot } = context;
  if (nodeId === "sync") {
    return { skipped: true, reason: "config already loaded" };
  }
  if (nodeId === "session") {
    if (args["skip-session"]) return { skipped: true, reason: "skip-session" };
    const quick = await verifyExistingHuntianSession(config);
    if (quick.valid) {
      return { quick: true, mode: "http-verify" };
    }
    return runNodeScript(
      [
        "scripts/refresh-huntian-cookie.js",
        "--config",
        configPath,
        "--system",
        system.code,
        "--session-only",
      ],
      { cwd: projectRoot, timeoutMs: 120000 },
    );
  }
  if (nodeId === "collect") {
    return runNodeScript(buildCollectNodeArgs({ args, configPath, system }));
  }
  if (nodeId === "inspect") {
    const profile = resolvePipelineCollectProfile(context);
    if (profile.skipSeparateInspect) {
      return { skipped: true, reason: "fast-collect: inspect merged into collect" };
    }
    const inspectArgs = [
      "scripts/collect-evidence.js",
      "--config",
      configPath,
      "--system",
      system.code,
      "--inspect-only",
      "--max-pages",
      String(args["max-pages"] || profile.maxPages),
    ];
    if (profile.fastCollect) inspectArgs.push("--fast-collect");
    return runNodeScript(inspectArgs);
  }
  if (nodeId === "validate-write") {
    const evidencePath = path.join(systemOutput, "evidence.json");
    const planPath = path.join(systemOutput, "write-validation-plan.json");
    if (!args["write-plan"] && fs.existsSync(evidencePath) && !fs.existsSync(planPath)) {
      const { generateWriteValidationPlan } = require("./generate-write-validation-plan");
      generateWriteValidationPlan({
        input: evidencePath,
        outputPath: planPath,
        systemCode: system.code,
      });
    }
    const result = await runWriteValidation({
      systemCode: system.code,
      systemOutput,
      config,
      system,
      configPath,
      execute: args["dry-write-validation"] !== true,
      args,
    });
    return result.status === "skipped" ? { skipped: true, reason: result.reason } : result;
  }
  if (nodeId === "db-profile") {
    if (!databaseProfileEnabled(system)) {
      return { skipped: true, reason: "databaseProfile.disabled" };
    }
    return runNodeScript(
      [
        "scripts/collect-database-profile.js",
        "--config",
        configPath,
        "--system",
        system.code,
      ],
      { cwd: projectRoot },
    );
  }
  if (nodeId === "db-model") {
    if (!databaseProfileEnabled(system)) {
      return { skipped: true, reason: "databaseProfile.disabled" };
    }
    return runNodeScript(
      [
        "scripts/build-database-model.js",
        "--input",
        systemOutput,
      ],
      { cwd: projectRoot },
    );
  }
  if (nodeId === "truth-universe") {
    return runNodeScript(
      [
        "scripts/build-function-universe.js",
        "--input",
        systemOutput,
      ],
      { cwd: projectRoot },
    );
  }
  if (nodeId === "truth-claims") {
    return runNodeScript(
      [
        "scripts/build-verified-claims.js",
        "--input",
        systemOutput,
      ],
      { cwd: projectRoot },
    );
  }
  if (nodeId === "build-spec") {
    const buildArgs = [
      "scripts/build-operation-spec.js",
      "--config",
      configPath,
      "--system",
      system.code,
    ];
    if (args["allow-draft"]) buildArgs.push("--allow-draft");
    return runNodeScript(buildArgs, { cwd: projectRoot });
  }
  if (nodeId === "compose-guide") {
    const composeArgs = [
      "scripts/generate-operation-guide.js",
      "--config",
      configPath,
      "--system",
      system.code,
    ];
    if (args["allow-draft"]) composeArgs.push("--allow-draft");
    return runNodeScript(composeArgs, { cwd: projectRoot });
  }
  if (nodeId === "draft") {
    return runNodeScript([
      "scripts/generate-whitepaper.js",
      "--input",
      path.join(systemOutput, "evidence.json"),
    ]);
  }
  if (nodeId === "summary") {
    return runNodeScript([
      "scripts/build-evidence-summary.js",
      "--input",
      path.join(systemOutput, "evidence.json"),
    ]);
  }
  if (nodeId === "narrative") {
    return runPhase3b({
      provider: args.narrativeProvider || args.provider || "manual",
      systemCode: system.code,
      systemName: system.name,
      evidenceSummaryPath: path.join(systemOutput, "evidence-summary.json"),
      draftPath: path.join(systemOutput, "whitepaper.draft.md"),
      outputPath: path.join(systemOutput, "whitepaper.pending-review.md"),
      qualityReportPath: path.join(systemOutput, "quality-report.json"),
      verifiedClaimsPath: path.join(systemOutput, "verified-claims.json"),
      promptOutputPath: path.join(systemOutput, "phase3b-prompt.md"),
      briefPath: path.join(systemOutput, "narrative-brief.md"),
      fragmentsPath: path.join(systemOutput, "narrative-fragments.md"),
      usagePath: path.join(systemOutput, "phase3b-usage.json"),
      model: args.model || "composer-2.5",
      narrativePart: args["narrative-part"] || args.part || "",
      reviewRerun: Boolean(args["review-rerun"]),
      projectRoot,
      sdkCwd: systemOutput,
      pricingConfig: config.narrative?.pricing || {},
    });
  }
  if (nodeId === "fact-check") {
    return runNodeScript(
      [
        "scripts/fact-check-whitepaper.js",
        "--input",
        systemOutput,
      ],
      { cwd: projectRoot },
    );
  }
  if (nodeId === "quality") {
    const evidenceQuality = runNodeScript(["scripts/check-quality.js", "--input", systemOutput]);
    const narrativeQuality = runNodeScript(["scripts/check-narrative.js", "--input", systemOutput]);
    return { evidenceQuality, narrativeQuality };
  }
  if (nodeId === "truth-readiness") {
    return runNodeScript(
      [
        "scripts/check-truth-readiness.js",
        "--input",
        systemOutput,
      ],
      { cwd: projectRoot },
    );
  }
  if (nodeId === "review") {
    return { skipped: true, reason: "review is handled by H5" };
  }
  throw new Error(`Unsupported pipeline node: ${nodeId}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = args.config || "config/systems.local.yaml";
  const systemCode = args.system;
  if (!systemCode) {
    throw new Error(
      "Usage: node scripts/run-whitepaper-pipeline.js --system adp [--nodes draft,summary,narrative] [--provider manual] [--reset]",
    );
  }

  const { config, system, outputRoot, systemOutput, projectRoot } = loadSystem(configPath, systemCode);
  const pipelineContext = { args, config, configPath, system, systemOutput, projectRoot };
  const narrativeProvider = resolveNarrativeProvider({
    provider: args.provider,
    config,
    projectRoot,
  });
  args.narrativeProvider = narrativeProvider;
  fs.mkdirSync(systemOutput, { recursive: true });
  const { statePath, state: initialState } = ensureState(systemOutput, system, Boolean(args.reset));
  let state = initialState;
  const nodesToRun = selectedNodes(args);
  const batchStateOptions = { disabled: Boolean(args["no-batch-state"]) };

  if (args.nodes && args.reset) {
    for (const node of NODES) {
      if (node.id !== "review" && !nodesToRun.includes(node.id)) {
        state = updateNodeStatus(state, node.id, "skipped", { lastError: null });
      }
    }
    writePipelineState(statePath, state);
    writeBatchState(outputRoot, state, batchStateOptions);
  }

  for (const nodeId of nodesToRun) {
    const maxAttempts = resolveNodeMaxAttempts(nodeId, args);
    const result = await runNodeWithRetry(
      state,
      nodeId,
      () => runPipelineNode(nodeId, pipelineContext),
      {
        maxAttempts,
        onStateChange: (nextState) => {
          writePipelineState(statePath, nextState);
          writeBatchState(outputRoot, nextState, batchStateOptions);
        },
      },
    );
    state = result.state;
    writePipelineState(statePath, state);
    writeBatchState(outputRoot, state, batchStateOptions);
    if (result.error) {
      console.error(`Pipeline stopped at ${nodeId}: ${result.error.message}`);
      process.exitCode = 2;
      return;
    }
    if (result.result?.skipped) {
      state = updateNodeStatus(state, nodeId, "skipped", { lastError: null });
      writePipelineState(statePath, state);
      writeBatchState(outputRoot, state, batchStateOptions);
    } else if (
      nodeId === "session" &&
      result.result &&
      !result.result.skipped &&
      state.nodes?.[nodeId]?.status === "success"
    ) {
      state.nodes[nodeId].loginMode = result.result.quick ? "http-verify" : "browser";
      state.updatedAt = new Date().toISOString();
      writePipelineState(statePath, state);
      writeBatchState(outputRoot, state, batchStateOptions);
    }
  }

  console.log(`Pipeline finished for ${system.code}: ${statePath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  buildCollectNodeArgs,
  loadSystem,
  resolveNodeMaxAttempts,
  runPipelineNode,
  selectedNodes,
  writeBatchState,
};
