#!/usr/bin/env node

require("./narrative/ensure-dispose-symbols").ensureDisposeSymbols();

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const {
  normalizeAuthPaths,
  parseArgs,
  parseSystemsConfig,
  readOptionalJsonObject,
  resolveConfigRelativePath,
  resolveCollectProfileOptions,
  writeJson,
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

function pathIsInside(parent, child) {
  const parentPath = path.resolve(String(parent || ""));
  const childPath = path.resolve(String(child || ""));
  const relative = path.relative(parentPath, childPath);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
}

function resetSystemOutputDirectory(input = {}) {
  const systemOutput = path.resolve(String(input.systemOutput || ""));
  const outputRoot = path.resolve(String(input.outputRoot || ""));
  const projectRoot = path.resolve(String(input.projectRoot || process.cwd()));
  const systemCode = String(input.systemCode || "").trim();

  if (!systemCode) throw new Error("Cannot reset output without a system code.");
  if (!pathIsInside(outputRoot, systemOutput)) {
    throw new Error(`Refusing to reset output outside output root: ${systemOutput}`);
  }
  if (path.basename(systemOutput) !== systemCode) {
    throw new Error(`Refusing to reset unexpected system output directory: ${systemOutput}`);
  }
  if (!fs.existsSync(systemOutput)) return { reset: false, archivedTo: "" };

  const backupRoot = path.join(projectRoot, ".tmp", "reset-output-backups");
  fs.mkdirSync(backupRoot, { recursive: true });
  const safeCode = systemCode.replace(/[^A-Za-z0-9._-]+/g, "-") || "system";
  let archivedTo = path.join(backupRoot, `${safeCode}-${timestampForPath()}`);
  let suffix = 1;
  while (fs.existsSync(archivedTo)) {
    archivedTo = path.join(backupRoot, `${safeCode}-${timestampForPath()}-${suffix}`);
    suffix += 1;
  }
  fs.renameSync(systemOutput, archivedTo);
  fs.mkdirSync(systemOutput, { recursive: true });
  return { reset: true, archivedTo };
}

function shouldResetSystemOutput(args = {}, nodesToRun = []) {
  if (!args.reset) return false;
  if (args["keep-output-on-reset"]) return false;
  return nodesToRun.includes("collect") || nodesToRun.includes("sync") || args["with-whitepaper"] || !args.nodes;
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
      "summary",
      "build-spec",
      "compose-guide",
      "db-profile",
      "db-model",
      "truth-universe",
      "truth-claims",
      "business-process",
      "draft",
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

function evidenceSummaryNeedsRefresh(systemOutput) {
  const evidencePath = path.join(systemOutput, "evidence.json");
  const summaryPath = path.join(systemOutput, "evidence-summary.json");
  if (!fs.existsSync(summaryPath)) return fs.existsSync(evidencePath);
  if (!fs.existsSync(evidencePath)) return false;
  const evidenceMtime = fs.statSync(evidencePath).mtimeMs;
  const summaryMtime = fs.statSync(summaryPath).mtimeMs;
  return summaryMtime < evidenceMtime;
}

function ensureFreshEvidenceSummary(context) {
  const { systemOutput, projectRoot } = context;
  if (!evidenceSummaryNeedsRefresh(systemOutput)) return null;
  return runNodeScript(
    [
      "scripts/build-evidence-summary.js",
      "--input",
      path.join(systemOutput, "evidence.json"),
    ],
    { cwd: projectRoot },
  );
}

function operationSpecNeedsRefresh(systemOutput) {
  const specPath = path.join(systemOutput, "operation-spec.json");
  const sourcePaths = [
    path.join(systemOutput, "evidence.json"),
    path.join(systemOutput, "write-validation-result.json"),
    path.join(systemOutput, "network-index.json"),
  ].filter((filePath) => fs.existsSync(filePath));
  if (!fs.existsSync(specPath)) return false;
  if (!sourcePaths.length) return false;
  const specMtime = fs.statSync(specPath).mtimeMs;
  return sourcePaths.some((filePath) => fs.statSync(filePath).mtimeMs > specMtime);
}

function ensureFreshOperationSpec(context) {
  const { systemOutput, projectRoot, configPath, system, args } = context;
  if (!operationSpecNeedsRefresh(systemOutput)) return null;
  const specArgs = ["scripts/build-operation-spec.js"];
  if (configPath && fs.existsSync(configPath)) {
    specArgs.push("--config", configPath, "--system", system.code);
  } else {
    specArgs.push("--input", systemOutput);
    if (system?.code) specArgs.push("--system", system.code);
  }
  if (args["allow-draft"]) specArgs.push("--allow-draft");
  return runNodeScript(specArgs, { cwd: projectRoot });
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

function stableHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function normalizeList(value) {
  const source = Array.isArray(value) ? value : [];
  return Array.from(new Set(source.map((item) => String(item || "").trim()).filter(Boolean)));
}

function inferModuleFromClaimId(claimId) {
  const parts = String(claimId || "").split(":");
  return parts[0] === "function" && parts[1] ? parts[1].trim() : "";
}

function buildCoverageRepairPlan(input = {}) {
  const factCheckReport = input.factCheckReport || {};
  const verifiedClaims = input.verifiedClaims || {};
  const missingWritableClaimIds = normalizeList(factCheckReport.missingWritableClaimIds);
  if (!missingWritableClaimIds.length) {
    return {
      artifactType: "coverage-repair-plan",
      version: 1,
      shouldRepair: false,
      status: "skipped",
      reason: "no-missing-writable-claims",
      missingWritableClaimIds: [],
    };
  }

  const claims = Array.isArray(verifiedClaims.claims) ? verifiedClaims.claims : [];
  const claimById = new Map(claims.map((claim) => [claim.id, claim]));
  const missingWritableClaims = missingWritableClaimIds.map((id) => {
    const claim = claimById.get(id) || {};
    return {
      id,
      module: String(claim.module || inferModuleFromClaimId(id) || "").trim(),
      function: String(claim.function || "").trim(),
      subject: String(claim.subject || "").trim(),
      entity: String(claim.entity || "").trim(),
      status: String(claim.status || "").trim(),
      confidence: String(claim.confidence || "").trim(),
      text: String(claim.text || "").trim(),
    };
  });
  const targetModules = normalizeList(
    missingWritableClaims.map((claim) => claim.module || inferModuleFromClaimId(claim.id)),
  );
  const narrativePart = targetModules.length ? targetModules.join(",") : "function-sections";
  const metrics = factCheckReport.metrics || {};
  const fingerprint = stableHash({
    missingWritableClaimIds,
    narrativePart,
    writableClaimCoverageRatio: metrics.writableClaimCoverageRatio ?? null,
    minWritableClaimCoverage: metrics.minWritableClaimCoverage ?? null,
  });

  return {
    artifactType: "coverage-repair-plan",
    version: 1,
    shouldRepair: true,
    status: "planned",
    reason: "missing-writable-claim-coverage",
    systemCode: input.systemCode || "",
    fingerprint,
    sourceArtifacts: {
      factCheck: "fact-check-report.json",
      verifiedClaims: "verified-claims.json",
    },
    rerunNodes: ["narrative", "fact-check", "quality", "truth-readiness"],
    executedNodes: [],
    narrativePart,
    targetModules,
    missingWritableClaimIds,
    missingWritableClaims,
    metrics: {
      writableClaimCount: Number(metrics.writableClaimCount || 0),
      coveredWritableClaimCount: Number(metrics.coveredWritableClaimCount || 0),
      missingWritableClaimCount: Number(
        metrics.missingWritableClaimCount || missingWritableClaimIds.length,
      ),
      writableClaimCoverageRatio: Number(metrics.writableClaimCoverageRatio || 0),
      minWritableClaimCoverage: Number(metrics.minWritableClaimCoverage || 0),
    },
    createdAt: input.now || new Date().toISOString(),
  };
}

function loadCoverageRepairPlanInputs(systemOutput) {
  return {
    factCheckReport: readOptionalJsonObject(path.join(systemOutput, "fact-check-report.json"), {}),
    verifiedClaims: readOptionalJsonObject(path.join(systemOutput, "verified-claims.json"), {}),
  };
}

function readFactCheckReportStamp(systemOutput) {
  const reportPath = path.join(systemOutput, "fact-check-report.json");
  try {
    const stat = fs.statSync(reportPath);
    return {
      exists: true,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    };
  } catch {
    return { exists: false, mtimeMs: 0, size: 0 };
  }
}

function hasNewFactCheckReport(systemOutput, beforeStamp) {
  const after = readFactCheckReportStamp(systemOutput);
  if (!after.exists) return false;
  if (!beforeStamp?.exists) return true;
  return after.mtimeMs !== beforeStamp.mtimeMs || after.size !== beforeStamp.size;
}

function writeCoverageRepairPlan(systemOutput, plan, updates = {}) {
  const next = {
    ...plan,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  writeJson(path.join(systemOutput, "coverage-repair-plan.json"), next);
  return next;
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
    const dbProfileArgs = [
      "scripts/collect-database-profile.js",
      "--config",
      configPath,
      "--system",
      system.code,
    ];
    if (args["refresh-database-profile"]) dbProfileArgs.push("--refresh-database-profile");
    return runNodeScript(dbProfileArgs, { cwd: projectRoot });
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
    const summaryRefresh = ensureFreshEvidenceSummary(context);
    const operationSpecRefresh = ensureFreshOperationSpec(context);
    const result = runNodeScript(
      [
        "scripts/build-function-universe.js",
        "--input",
        systemOutput,
      ],
      { cwd: projectRoot },
    );
    return summaryRefresh || operationSpecRefresh
      ? { ...result, summaryRefresh, operationSpecRefresh }
      : result;
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
  if (nodeId === "business-process") {
    return runNodeScript(
      [
        "scripts/build-business-process-model.js",
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
    const pendingReviewPath = path.join(systemOutput, "whitepaper.pending-review.md");
    const result = await runPhase3b({
      provider: args.narrativeProvider || args.provider || "manual",
      systemCode: system.code,
      systemName: system.name,
      evidenceSummaryPath: path.join(systemOutput, "evidence-summary.json"),
      draftPath: path.join(systemOutput, "whitepaper.draft.md"),
      outputPath: path.join(systemOutput, "whitepaper.pending-review.md"),
      qualityReportPath: path.join(systemOutput, "quality-report.json"),
      verifiedClaimsPath: path.join(systemOutput, "verified-claims.json"),
      operationSpecPath: path.join(systemOutput, "operation-spec.json"),
      businessProcessModelPath: path.join(systemOutput, "business-process-model.json"),
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
    if (
      result?.status === "manual-required" &&
      (!result.outputPath || !fs.existsSync(pendingReviewPath))
    ) {
      throw new Error(
        [
          "Narrative provider manual only prepared prompts and did not generate whitepaper.pending-review.md.",
          "Configure a model provider such as --provider cursor-sdk/codex, or provide narrative-fragments.md and rerun the narrative node.",
        ].join(" "),
      );
    }
    return result;
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
    const readinessArgs = [
      "scripts/check-truth-readiness.js",
      "--input",
      systemOutput,
      "--system-code",
      system.code,
      "--system-name",
      system.name || "",
    ];
    if (databaseProfileEnabled(system)) {
      readinessArgs.push("--require-database-evidence");
    }
    return runNodeScript(readinessArgs, { cwd: projectRoot });
  }
  if (nodeId === "review") {
    return { skipped: true, reason: "review is handled by H5" };
  }
  throw new Error(`Unsupported pipeline node: ${nodeId}`);
}

async function runPipelineNodeWithState(nodeId, context, stateContext = {}) {
  const { attemptedCoverageRepairFingerprints } = stateContext;
  const executeNode =
    typeof stateContext.runPipelineNode === "function"
      ? stateContext.runPipelineNode
      : runPipelineNode;
  const factCheckReportStamp =
    nodeId === "fact-check" ? readFactCheckReportStamp(context.systemOutput) : null;
  try {
    return await executeNode(nodeId, context);
  } catch (error) {
    if (
      nodeId !== "fact-check" ||
      context.args["no-coverage-repair"] ||
      !attemptedCoverageRepairFingerprints
    ) {
      throw error;
    }

    if (!hasNewFactCheckReport(context.systemOutput, factCheckReportStamp)) {
      throw error;
    }

    const inputs = loadCoverageRepairPlanInputs(context.systemOutput);
    const plan = buildCoverageRepairPlan({
      ...inputs,
      systemCode: context.system.code,
    });
    if (!plan.shouldRepair) throw error;
    if (attemptedCoverageRepairFingerprints.has(plan.fingerprint)) {
      writeCoverageRepairPlan(context.systemOutput, plan, {
        status: "failed",
        reason: "coverage-repair-already-attempted",
        error: error.message,
      });
      throw error;
    }

    attemptedCoverageRepairFingerprints.add(plan.fingerprint);
    writeCoverageRepairPlan(context.systemOutput, plan, {
      status: "running",
      executedNodes: ["narrative"],
    });
    try {
      await executeNode("narrative", {
        ...context,
        args: {
          ...context.args,
          "narrative-part": plan.narrativePart,
          part: plan.narrativePart,
          "review-rerun": true,
        },
      });
      const factCheckResult = await executeNode("fact-check", context);
      writeCoverageRepairPlan(context.systemOutput, plan, {
        status: "completed",
        executedNodes: ["narrative", "fact-check"],
      });
      return {
        coverageRepair: {
          fingerprint: plan.fingerprint,
          narrativePart: plan.narrativePart,
          missingWritableClaimIds: plan.missingWritableClaimIds,
        },
        factCheck: factCheckResult,
      };
    } catch (repairError) {
      writeCoverageRepairPlan(context.systemOutput, plan, {
        status: "failed",
        executedNodes: ["narrative", "fact-check"],
        error: repairError.message,
      });
      throw repairError;
    }
  }
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
  const nodesToRun = selectedNodes(args);
  if (shouldResetSystemOutput(args, nodesToRun)) {
    const resetResult = resetSystemOutputDirectory({
      systemOutput,
      outputRoot,
      projectRoot,
      systemCode: system.code,
    });
    if (resetResult.reset) {
      console.log(`Reset output archived: ${resetResult.archivedTo}`);
    }
  }
  fs.mkdirSync(systemOutput, { recursive: true });
  const { statePath, state: initialState } = ensureState(systemOutput, system, Boolean(args.reset));
  let state = initialState;
  const batchStateOptions = { disabled: Boolean(args["no-batch-state"]) };
  const attemptedCoverageRepairFingerprints = new Set();

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
      () =>
        runPipelineNodeWithState(nodeId, pipelineContext, {
          attemptedCoverageRepairFingerprints,
        }),
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
  buildCoverageRepairPlan,
  buildCollectNodeArgs,
  ensureFreshEvidenceSummary,
  ensureFreshOperationSpec,
  evidenceSummaryNeedsRefresh,
  operationSpecNeedsRefresh,
  loadSystem,
  pathIsInside,
  resolveNodeMaxAttempts,
  resetSystemOutputDirectory,
  runPipelineNodeWithState,
  runPipelineNode,
  selectedNodes,
  shouldResetSystemOutput,
  writeBatchState,
};
