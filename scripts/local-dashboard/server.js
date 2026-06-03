#!/usr/bin/env node

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const {
  loadEvidenceSummaryForNaming,
  parseArgs,
  parseSystemsConfig,
  readOptionalJson,
  readOptionalJsonObject,
  resolveConfigRelativePath,
  resolveWhitepaperFileName,
  resolveWhitepaperPendingReviewFileName,
  syncWhitepaperNamedArtifacts,
} = require("../system-whitepaper-lib");
const {
  NODES,
  PHASES,
  createPipelineState,
  readPipelineState,
  recomputePipelineState,
  reconcilePipelineStateFromArtifacts,
  resetSystemPipelineState,
  stopRunningPipelineState,
  updateNodeStatus,
  writePipelineState,
} = require("../pipeline-state");
const {
  killProcessTree,
  killProjectPipelineProcesses,
  listProjectPipelinePids,
} = require("./process-control");
const { runReviewDecision } = require("../run-review-decision");
const { findStaleReadinessSources } = require("../check-truth-readiness");
const { validateFinalDocx } = require("../check-delivery-readiness");
const { isCursorSdkConfigured, resolveNarrativeProvider } = require("../narrative/resolve-provider");
const { formatCny, formatUsd } = require("../narrative/usage-cost");

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3920;
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const LEGACY_REVIEW_RERUN_WINDOW_MS = 24 * 60 * 60 * 1000;

let currentChild = null;
let currentRun = null;

function readDashboardPipelineState(filePath) {
  try {
    return { state: readPipelineState(filePath), error: "" };
  } catch (error) {
    return {
      state: null,
      error: `pipeline-state.json 解析失败：${error.message}`,
    };
  }
}

function resolveDashboardPaths(options = {}) {
  const configPath = path.resolve(options.configPath || "config/systems.local.yaml");
  const config = parseSystemsConfig(fs.readFileSync(configPath, "utf8"));
  const configDir = path.dirname(configPath);
  const outputRoot = resolveConfigRelativePath(configDir, config.runtime?.outputDir || "outputs");
  return { configPath, config, outputRoot };
}

function fileInfo(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { exists: false, file: filePath ? path.basename(filePath) : "", path: filePath || "" };
  }
  const stat = fs.statSync(filePath);
  return {
    exists: true,
    file: path.basename(filePath),
    path: filePath,
    size: stat.size,
    updatedAt: stat.mtime.toISOString(),
  };
}

function resolveDocxArtifact(systemOutput, artifactPath) {
  if (artifactPath) {
    const resolved = path.isAbsolute(artifactPath)
      ? artifactPath
      : path.join(systemOutput, artifactPath);
    if (fs.existsSync(resolved)) return resolved;
    const byBasename = path.join(systemOutput, path.basename(artifactPath));
    if (fs.existsSync(byBasename)) return byBasename;
  }
  if (!fs.existsSync(systemOutput)) return "";
  const docx = fs
    .readdirSync(systemOutput)
    .find((file) => file.toLowerCase().endsWith(".docx"));
  return docx ? path.join(systemOutput, docx) : "";
}

function resolveFinalMarkdownPath(systemOutput, state, system = {}) {
  const artifacts = state.artifacts || {};
  const finalInternal = path.join(systemOutput, "whitepaper.final.md");
  if (fs.existsSync(finalInternal)) return finalInternal;
  const finalNamed = resolveArtifactFileInfo(systemOutput, {
    systemName: system.name || state?.name,
    internalName: artifacts.final || "whitepaper.final.md",
    displayNameResolver: resolveWhitepaperFileName,
  });
  if (finalNamed.exists && finalNamed.path) return finalNamed.path;
  return "";
}

function ensureDocxArtifact(systemOutput, state, system = {}) {
  let docxPath = resolveDocxArtifact(systemOutput, state.artifacts?.docx);
  const mdPath = resolveFinalMarkdownPath(systemOutput, state, system);
  if (docxPath && fs.existsSync(docxPath)) {
    if (!mdPath) return docxPath;
    const docxState = {
      ...state,
      artifacts: {
        ...(state.artifacts || {}),
        docx: path.basename(docxPath),
      },
    };
    if (validateFinalDocx(systemOutput, docxState, mdPath).valid) return docxPath;
  }
  const reviewApproved =
    state.overallStatus === "finalized" || state.review?.status === "approved";
  if (!reviewApproved) return docxPath || "";
  if (!mdPath) return docxPath || "";
  const { exportWhitepaperWord } = require("../export-whitepaper-word");
  return exportWhitepaperWord({
    inputPath: mdPath,
    systemName: system.name || state?.name,
  }).outputPath;
}

function resolveArtifactFileInfo(systemOutput, options = {}) {
  const evidence = loadEvidenceSummaryForNaming(systemOutput);
  if (options.systemName) {
    evidence.systemInfo = { ...(evidence.systemInfo || {}), name: options.systemName };
  }
  const displayName = options.displayNameResolver(evidence);
  const displayPath = path.join(systemOutput, displayName);
  const internalPath = path.join(systemOutput, options.internalName);
  if (fs.existsSync(displayPath)) {
    return { ...fileInfo(displayPath), previewName: displayName };
  }
  if (fs.existsSync(internalPath)) {
    return { ...fileInfo(internalPath), previewName: displayName };
  }
  return { exists: false, file: displayName, path: displayPath, previewName: displayName };
}

function buildArtifactSnapshot(systemOutput, state, system = {}) {
  syncWhitepaperNamedArtifacts({
    systemOutput,
    systemName: system.name || state?.name,
  });
  const artifacts = state.artifacts || {};
  return {
    draft: fileInfo(path.join(systemOutput, artifacts.draft || "whitepaper.draft.md")),
    evidenceSummary: fileInfo(
      path.join(systemOutput, artifacts.evidenceSummary || "evidence-summary.json"),
    ),
    databaseProfile: fileInfo(
      path.join(systemOutput, artifacts.databaseProfile || "database-profile.json"),
    ),
    dataDictionary: fileInfo(
      path.join(systemOutput, artifacts.dataDictionary || "data-dictionary.json"),
    ),
    entityModel: fileInfo(
      path.join(systemOutput, artifacts.entityModel || "entity-model.json"),
    ),
    functionUniverse: fileInfo(
      path.join(systemOutput, artifacts.functionUniverse || "function-universe.json"),
    ),
    verifiedClaims: fileInfo(
      path.join(systemOutput, artifacts.verifiedClaims || "verified-claims.json"),
    ),
    factCheck: fileInfo(path.join(systemOutput, artifacts.factCheck || "fact-check-report.json")),
    coverageRepair: fileInfo(path.join(systemOutput, "coverage-repair-plan.json")),
    truthReadiness: fileInfo(
      path.join(systemOutput, artifacts.truthReadiness || "truth-readiness-report.json"),
    ),
    pendingReview: resolveArtifactFileInfo(systemOutput, {
      systemName: system.name || state?.name,
      internalName: artifacts.pendingReview || "whitepaper.pending-review.md",
      displayNameResolver: resolveWhitepaperPendingReviewFileName,
    }),
    final: resolveArtifactFileInfo(systemOutput, {
      systemName: system.name || state?.name,
      internalName: artifacts.final || "whitepaper.final.md",
      displayNameResolver: resolveWhitepaperFileName,
    }),
    docx: fileInfo(ensureDocxArtifact(systemOutput, state, system)),
    operationGuide: fileInfo(path.join(systemOutput, "operation-guide.md")),
    operationSpec: fileInfo(path.join(systemOutput, "operation-spec.json")),
  };
}

function buildOperationGuideGateSnapshot(systemOutput) {
  const gate = readOptionalJsonObject(path.join(systemOutput, "operation-guide-gate.json"));
  if (!gate) return null;
  return {
    readinessPercent: Number(gate.readinessPercent || 0),
    canComposeGuide: Boolean(gate.canComposeGuide),
    failures: gate.failures || [],
    counts: gate.counts || {},
  };
}

function buildTruthReadinessSnapshot(systemOutput) {
  const report = readOptionalJsonObject(path.join(systemOutput, "truth-readiness-report.json"));
  if (!report) return null;
  const staleSources = findStaleReadinessSources(systemOutput, report);
  const stale = staleSources.length > 0;
  const gates = report.gates && typeof report.gates === "object" && !Array.isArray(report.gates) ? report.gates : {};
  const factCheck = gates.factCheck || {};
  return {
    scorePercent: Number(report.scorePercent || 0),
    threshold: Number(report.threshold || 0),
    thresholdPercent: Number(report.thresholdPercent || Math.round(Number(report.threshold || 0) * 1000) / 10),
    canSubmitReview: Boolean(report.canSubmitReview) && !stale,
    canFinalize: Boolean(report.canFinalize) && !stale,
    stale,
    staleSources,
    blockers: Array.isArray(report.blockers) ? report.blockers : [],
    improvementActions: Array.isArray(report.improvementActions) ? report.improvementActions : [],
    gates,
    writableClaimCoverage: {
      ratio: Number(factCheck.metrics?.writableClaimCoverageRatio || 0),
      minRatio: Number(factCheck.metrics?.minWritableClaimCoverage || 0),
      writableClaimCount: Number(factCheck.metrics?.writableClaimCount || 0),
      coveredWritableClaimCount: Number(factCheck.metrics?.coveredWritableClaimCount || 0),
      missingWritableClaimCount: Number(factCheck.metrics?.missingWritableClaimCount || 0),
      missingWritableClaimIds: Array.isArray(factCheck.missingWritableClaimIds)
        ? factCheck.missingWritableClaimIds.slice(0, 20)
        : [],
    },
    generatedAt: report.generatedAt || "",
  };
}

function buildCoverageRepairSnapshot(systemOutput) {
  const plan = readOptionalJsonObject(path.join(systemOutput, "coverage-repair-plan.json"));
  if (!plan) return null;
  const missingClaims = Array.isArray(plan.missingWritableClaims)
    ? plan.missingWritableClaims
    : [];
  return {
    status: plan.status || "",
    reason: plan.reason || "",
    shouldRepair: Boolean(plan.shouldRepair),
    narrativePart: plan.narrativePart || "",
    targetModules: Array.isArray(plan.targetModules) ? plan.targetModules.slice(0, 12) : [],
    missingWritableClaimIds: Array.isArray(plan.missingWritableClaimIds)
      ? plan.missingWritableClaimIds.slice(0, 20)
      : [],
    missingWritableClaimCount: Array.isArray(plan.missingWritableClaimIds)
      ? plan.missingWritableClaimIds.length
      : 0,
    missingWritableClaims: missingClaims.slice(0, 12).map((claim) => ({
      id: claim.id || "",
      module: claim.module || "",
      function: claim.function || "",
      subject: claim.subject || "",
    })),
    metrics: plan.metrics || {},
    fingerprint: plan.fingerprint || "",
    executedNodes: Array.isArray(plan.executedNodes) ? plan.executedNodes : [],
    error: plan.error || "",
    createdAt: plan.createdAt || "",
    updatedAt: plan.updatedAt || "",
  };
}

function buildUsageCostLabel(usage = {}) {
  const costUsd = normalizeUsageAmount(usage.costUsd);
  if (!(costUsd > 0)) return "";
  const pricingLabel =
    usage.costPricingSource === "cursor-composer-pool" ? "Cursor Composer Pool" : "Cursor API";
  return `参考费用：${formatUsd(costUsd)} / ${formatCny(usage.costCny)}（按 ${pricingLabel} 单价估算，非账单）`;
}

function hasExplicitReviewRerunUsage(usage = {}) {
  return Boolean(usage.reviewRerun || usage.reviewDecision || usage.reviewComment);
}

function parseTimestampMs(value) {
  const ms = Date.parse(value || "");
  return Number.isNaN(ms) ? 0 : ms;
}

function normalizeReviewPart(value) {
  return String(value || "").trim();
}

function reviewDecisionMatchesUsagePart(usage = {}, reviewDecision = {}) {
  const usagePart = normalizeReviewPart(usage.narrativePart);
  const decisionPart = normalizeReviewPart(reviewDecision.narrativePart);
  const targetModules = Array.isArray(reviewDecision.targetModules)
    ? reviewDecision.targetModules.map(normalizeReviewPart).filter(Boolean)
    : [];
  if (decisionPart) return usagePart === decisionPart;
  if (usagePart && targetModules.includes(usagePart)) return true;
  if (reviewDecision.rewriteScope === "overview-flow") return usagePart === "overview-flow";
  if (reviewDecision.rewriteScope === "function-sections") {
    return usagePart === "function-sections" || targetModules.includes(usagePart);
  }
  if (reviewDecision.rewriteScope === "evidence-refresh") return !usagePart;
  if (reviewDecision.rewriteScope === "narrative") return !usagePart;
  return false;
}

function inferLegacyReviewRerunUsage(usage = {}, reviewDecision = {}) {
  if (hasExplicitReviewRerunUsage(usage)) return false;
  if (!reviewDecision || reviewDecision.status !== "rejected") return false;
  if (!reviewDecisionMatchesUsagePart(usage, reviewDecision)) return false;
  const decidedAt = parseTimestampMs(reviewDecision.decidedAt);
  const finishedAt = parseTimestampMs(usage.finishedAt || usage.updatedAt || usage.startedAt);
  if (!decidedAt || !finishedAt) return false;
  return finishedAt >= decidedAt && finishedAt - decidedAt <= LEGACY_REVIEW_RERUN_WINDOW_MS;
}

function canUseDiskReviewDecisionForUsage(usage = {}, reviewDecision = {}) {
  if (!reviewDecision || reviewDecision.status !== "rejected") return false;
  if (!reviewDecisionMatchesUsagePart(usage, reviewDecision)) return false;
  const decidedAt = parseTimestampMs(reviewDecision.decidedAt);
  const finishedAt = parseTimestampMs(usage.finishedAt || usage.updatedAt || usage.startedAt);
  if (!decidedAt || !finishedAt) return true;
  return finishedAt >= decidedAt && finishedAt - decidedAt <= LEGACY_REVIEW_RERUN_WINDOW_MS;
}

function derivePhase3bRunKind(usage = {}, reviewDecision = null) {
  if (hasExplicitReviewRerunUsage(usage) || inferLegacyReviewRerunUsage(usage, reviewDecision)) {
    return "review-rerun";
  }
  if (usage.narrativePart) return "part-rerun";
  return "full";
}

function derivePromptSavings(usage = {}) {
  const promptChars = normalizeUsageInteger(usage.promptChars);
  const generatedPromptChars = normalizeUsageInteger(usage.generatedPromptChars);
  if (!(promptChars > 0) || !(generatedPromptChars > promptChars)) {
    return { promptSavingsPercent: 0, promptSavedChars: 0 };
  }
  return {
    promptSavingsPercent: Math.round((1 - promptChars / generatedPromptChars) * 100),
    promptSavedChars: generatedPromptChars - promptChars,
  };
}

function truncateText(value, maxLength = 180) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function buildReviewRerunSnapshot(usage = {}, reviewDecision = null) {
  const inferred = inferLegacyReviewRerunUsage(usage, reviewDecision);
  if (!hasExplicitReviewRerunUsage(usage) && !inferred) return null;
  const decision =
    usage.reviewDecision ||
    (inferred || canUseDiskReviewDecisionForUsage(usage, reviewDecision) ? reviewDecision : {}) ||
    {};
  return {
    comment: truncateText(usage.reviewComment || decision.comment || ""),
    inferred,
    status: decision.status || "",
    rewriteScope: decision.rewriteScope || "",
    narrativePart: decision.narrativePart || usage.narrativePart || "",
    targetSections: Array.isArray(decision.targetSections) ? decision.targetSections : [],
    targetModules: Array.isArray(decision.targetModules) ? decision.targetModules : [],
  };
}

function normalizeUsageText(value) {
  return String(value ?? "").trim();
}

function normalizeUsageInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
}

function normalizeUsageAmount(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function roundUsageAmount(value, decimals) {
  const amount = normalizeUsageAmount(value);
  const factor = 10 ** decimals;
  return Math.round(amount * factor) / factor;
}

function normalizeOptionalUsageInteger(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  return normalizeUsageInteger(value, null);
}

function sanitizeSentPromptRun(item) {
  if (typeof item === "string") {
    const id = normalizeUsageText(item);
    return id ? { id, type: "", moduleName: "" } : null;
  }
  if (!item || typeof item !== "object") return null;
  const summary = {
    id: normalizeUsageText(item.id),
    type: normalizeUsageText(item.type),
    moduleName: normalizeUsageText(item.moduleName),
  };
  return summary.id || summary.type || summary.moduleName ? summary : null;
}

function sanitizeSentPromptRuns(usage = {}) {
  return Array.isArray(usage.sentPromptRuns)
    ? usage.sentPromptRuns.map(sanitizeSentPromptRun).filter(Boolean)
    : [];
}

function hasPhase3bUsageSignalValue(value, { numeric = false } = {}) {
  if (value === undefined || value === null) return false;
  if (numeric) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0;
  }
  if (typeof value === "string") return Boolean(value.trim());
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

function isPhase3bUsageLikeRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const textKeys = [
    "provider",
    "model",
    "narrativePart",
    "usageSource",
    "usageCaptureMethod",
    "reviewComment",
  ];
  const numericKeys = [
    "promptChars",
    "mainPromptChars",
    "partPromptChars",
    "generatedPromptChars",
    "inlineSummaryChars",
    "fragmentChars",
    "pendingReviewChars",
    "inputTokens",
    "outputTokens",
    "totalTokens",
    "cacheReadTokens",
    "cacheWriteTokens",
  ];
  const structuredKeys = ["sdkUsage", "sentPromptRuns", "reviewRerun", "reviewDecision"];
  return (
    textKeys.some((key) => hasPhase3bUsageSignalValue(value[key])) ||
    numericKeys.some((key) => hasPhase3bUsageSignalValue(value[key], { numeric: true })) ||
    structuredKeys.some((key) => hasPhase3bUsageSignalValue(value[key]))
  );
}

function deriveSentPromptRunCount(usage = {}, sentPromptRuns = sanitizeSentPromptRuns(usage)) {
  const explicit = normalizeOptionalUsageInteger(usage.sentPromptRunCount);
  return explicit !== null ? explicit : sentPromptRuns.length;
}

function deriveSentPromptPartCount(usage = {}, sentPromptRuns = sanitizeSentPromptRuns(usage)) {
  const explicit = normalizeOptionalUsageInteger(usage.sentPromptPartCount);
  return explicit !== null
    ? explicit
    : sentPromptRuns.filter((item) => item.type !== "full").length;
}

function buildPhase3bUsageSnapshotItem(usage = {}, reviewDecision = null, options = {}) {
  const promptSavings = derivePromptSavings(usage);
  const reviewRerun = buildReviewRerunSnapshot(usage, reviewDecision);
  const allSentPromptRuns = sanitizeSentPromptRuns(usage);
  const sentPromptRuns = allSentPromptRuns.slice(0, 12);
  const snapshot = {
    provider: usage.provider || "",
    model: usage.model || "",
    runKind: derivePhase3bRunKind(usage, reviewDecision),
    narrativePart: usage.narrativePart || "",
    reviewRerun,
    promptChars: normalizeUsageInteger(usage.promptChars),
    mainPromptChars: normalizeUsageInteger(usage.mainPromptChars),
    partPromptChars: normalizeUsageInteger(usage.partPromptChars),
    generatedPromptChars: normalizeUsageInteger(usage.generatedPromptChars),
    generatedPromptPartCount: normalizeUsageInteger(usage.generatedPromptPartCount),
    sentPromptRunCount: deriveSentPromptRunCount(usage, allSentPromptRuns),
    sentPromptPartCount: deriveSentPromptPartCount(usage, allSentPromptRuns),
    sentPromptRuns,
    promptSavingsPercent: promptSavings.promptSavingsPercent,
    promptSavedChars: promptSavings.promptSavedChars,
    inlineSummaryChars: normalizeUsageInteger(usage.inlineSummaryChars),
    fragmentChars: normalizeUsageInteger(usage.fragmentChars),
    pendingReviewChars: normalizeUsageInteger(usage.pendingReviewChars),
    durationMs: normalizeUsageInteger(usage.durationMs),
    inputTokens: normalizeUsageInteger(usage.inputTokens ?? usage.sdkUsage?.inputTokens),
    outputTokens: normalizeUsageInteger(usage.outputTokens ?? usage.sdkUsage?.outputTokens),
    totalTokens: normalizeUsageInteger(usage.totalTokens ?? usage.sdkUsage?.totalTokens),
    cacheReadTokens: normalizeUsageInteger(usage.cacheReadTokens ?? usage.sdkUsage?.cacheReadTokens),
    cacheWriteTokens: normalizeUsageInteger(
      usage.cacheWriteTokens ?? usage.sdkUsage?.cacheWriteTokens,
    ),
    usageSource: usage.usageSource || usage.sdkUsage?.source || "",
    usageEstimated: Boolean(usage.usageEstimated ?? usage.sdkUsage?.estimated),
    usageCaptureMethod: usage.usageCaptureMethod || "",
    usageUnavailable: Boolean(usage.usageUnavailable),
    updatedAt: usage.finishedAt || "",
  };
  if (options.includeCost) {
    snapshot.costUsd = normalizeUsageAmount(usage.costUsd);
    snapshot.costCny = normalizeUsageAmount(usage.costCny);
    snapshot.costEstimated = Boolean(usage.costEstimated);
    snapshot.costPricingSource = usage.costPricingSource || "";
    snapshot.costPricingModel = usage.costPricingModel || "";
    snapshot.costLabel = buildUsageCostLabel(usage);
  }
  return snapshot;
}

function buildPhase3bUsageSnapshot(systemOutput, pricingConfig = {}) {
  const { enrichPhase3bUsageRecord } = require("../narrative/extract-sdk-usage");
  const usage = enrichPhase3bUsageRecord(
    readOptionalJsonObject(path.join(systemOutput, "phase3b-usage.json")) || null,
    pricingConfig,
  );
  if (!usage) return null;
  const reviewDecision = readOptionalJsonObject(path.join(systemOutput, "review-decision.json"));
  return buildPhase3bUsageSnapshotItem(usage, reviewDecision, { includeCost: true });
}

function buildPhase3bUsageHistorySnapshot(systemOutput, pricingConfig = {}) {
  const { enrichPhase3bUsageRecord } = require("../narrative/extract-sdk-usage");
  const history = readOptionalJson(path.join(systemOutput, "phase3b-usage-history.json"), []);
  if (!Array.isArray(history)) return [];
  const reviewDecision = readOptionalJsonObject(path.join(systemOutput, "review-decision.json"));
  return history.filter(isPhase3bUsageLikeRecord).slice(-10).map((rawUsage) => {
    const usage = enrichPhase3bUsageRecord(rawUsage, pricingConfig) || rawUsage || {};
    return buildPhase3bUsageSnapshotItem(usage, reviewDecision, { includeCost: true });
  });
}

function buildPhase3bUsageHistorySummary(history = []) {
  const items = Array.isArray(history) ? history : [];
  return {
    runCount: items.length,
    estimatedRunCount: items.filter((item) => item.usageEstimated).length,
    reviewRerunCount: items.filter((item) => item.runKind === "review-rerun").length,
    promptChars: items.reduce((total, item) => total + normalizeUsageInteger(item.promptChars), 0),
    totalTokens: items.reduce((total, item) => total + normalizeUsageInteger(item.totalTokens), 0),
    costUsd: roundUsageAmount(
      items.reduce((total, item) => total + normalizeUsageAmount(item.costUsd), 0),
      4,
    ),
    costCny: roundUsageAmount(
      items.reduce((total, item) => total + normalizeUsageAmount(item.costCny), 0),
      2,
    ),
  };
}

function buildWriteValidationSnapshot(systemOutput) {
  const result = readOptionalJsonObject(path.join(systemOutput, "write-validation-result.json"));
  if (!result) return null;
  const scenarios = Array.isArray(result.scenarios) ? result.scenarios : [];
  return {
    status: result.status || "",
    reason: result.reason || "",
    counts: result.counts || {},
    scenarioCount: scenarios.length,
    successCount: scenarios.filter((item) => item.status === "success").length,
    partialCount: scenarios.filter((item) => item.status === "partial").length,
    blockedCount: scenarios.filter((item) => item.status === "blocked").length,
    scenarios: scenarios.slice(0, 8).map((item) => ({
      id: item.id || "",
      menuPath: item.menuPath || "",
      action: item.action || "",
      status: item.status || "",
      reason: item.reason || "",
      targetName: item.targetName || "",
      buttonText: item.buttonText || "",
      submitButton: item.submitButton || "",
      filledFieldCount: Number(item.filledFieldCount || 0),
      filledValue: item.filledValue || "",
      screenshotPath: item.screenshotPath || "",
    })),
    updatedAt: result.finishedAt || "",
  };
}

function buildEvidenceSnapshot(systemOutput) {
  const summaryPath = path.join(systemOutput, "evidence-summary.json");
  const evidencePath = path.join(systemOutput, "evidence.json");

  if (fs.existsSync(summaryPath)) {
    const summary = readOptionalJsonObject(summaryPath);
    if (summary) {
      const metrics = summary.metrics?.counts || {};
      const screenshots = Array.isArray(summary.screenshots) ? summary.screenshots : [];
      return {
        menuCount: Number(metrics.menus || 0),
        coreMenuCount: Number(metrics.coreMenus || 0),
        visitedMenuCount: Number(metrics.visitedMenus || 0),
        pageCount: Number(metrics.pages || 0),
        screenshotCount: screenshots.length,
        collectedAt: summary.system?.collectedAt || summary.generatedAt || "",
        screenshots: screenshots.slice(0, 24).map((shot) => ({
          id: shot.id || "",
          file: shot.file || "",
          module: shot.module || "",
          function: shot.function || "",
          caption: shot.caption || "",
        })),
      };
    }
  }

  const evidence = readOptionalJsonObject(evidencePath);
  if (!evidence) return null;
  const screenshotIndex = Array.isArray(evidence.screenshotIndex) ? evidence.screenshotIndex : [];
  return {
    menuCount: (evidence.menuMap || []).length,
    coreMenuCount: (evidence.menuMap || []).filter((item) => item.coreCoverage !== false).length,
    visitedMenuCount: (evidence.menuMap || []).filter((item) => item.status === "visited").length,
    pageCount: (evidence.pageInventory || []).length,
    screenshotCount: screenshotIndex.length,
    collectedAt: evidence.systemInfo?.collectedAt || "",
    screenshots: screenshotIndex.slice(0, 24).map((shot) => ({
      id: shot.id || "",
      file: shot.file || "",
      module: shot.module || "",
      function: shot.function || "",
      step: shot.step || "",
      caption: shot.caption || "",
    })),
  };
}

function resolveArtifactDownloadPath(systemOutput, artifactKey, state, system = {}) {
  const snapshot = buildArtifactSnapshot(systemOutput, state, system);
  const artifact = snapshot[artifactKey];
  if (!artifact?.exists || !artifact.path) {
    throw new Error(`Artifact not found: ${artifactKey}`);
  }
  return artifact;
}

function resolveScreenshotPath(systemOutput, relativeFile) {
  const normalized = path
    .normalize(String(relativeFile || ""))
    .replace(/^(\.\.(\/|\\|$))+/, "");
  const fullPath = path.resolve(systemOutput, normalized);
  const outputRoot = path.resolve(systemOutput);
  if (!fullPath.startsWith(outputRoot)) {
    throw new Error("Invalid screenshot path.");
  }
  if (!fs.existsSync(fullPath)) {
    throw new Error("Screenshot not found.");
  }
  return fullPath;
}

function sendDownloadFile(response, filePath, downloadName) {
  const stat = fs.statSync(filePath);
  response.writeHead(200, {
    "content-type": "application/octet-stream",
    "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(downloadName || path.basename(filePath))}`,
    "content-length": stat.size,
  });
  fs.createReadStream(filePath).pipe(response);
}

function sendScreenshotFile(response, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType =
    ext === ".png"
      ? "image/png"
      : ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : ext === ".webp"
          ? "image/webp"
          : "application/octet-stream";
  response.writeHead(200, {
    "content-type": contentType,
    "cache-control": "public, max-age=300",
  });
  fs.createReadStream(filePath).pipe(response);
}

function nodeDurationMs(node) {
  if (!node?.startedAt) return 0;
  const end = node.finishedAt ? new Date(node.finishedAt).getTime() : Date.now();
  const start = new Date(node.startedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, end - start);
}

function buildProgress(state) {
  const nodeIds = NODES.map((node) => node.id);
  const completed = nodeIds.filter((nodeId) =>
    ["success", "skipped"].includes(state.nodes?.[nodeId]?.status),
  ).length;
  const failed = nodeIds.filter((nodeId) =>
    ["failed", "paused"].includes(state.nodes?.[nodeId]?.status),
  ).length;
  return {
    completed,
    failed,
    total: nodeIds.length,
    percent: nodeIds.length ? Math.round((completed / nodeIds.length) * 100) : 0,
  };
}

function nextNodeId(currentNodeId) {
  const index = NODES.findIndex((node) => node.id === currentNodeId);
  if (index < 0 || index >= NODES.length - 1) return "";
  return NODES[index + 1].id;
}

function buildSystemDashboardItem(system, outputRoot, options = {}) {
  const pricingConfig = options.pricingConfig || {};
  const systemOutput = path.join(outputRoot, system.code);
  const statePath = path.join(systemOutput, "pipeline-state.json");
  const stateRead = readDashboardPipelineState(statePath);
  let state = stateRead.state || createPipelineState(system);
  if (
    stateRead.state &&
    state.overallStatus === "finalized" &&
    (state.currentPhase !== "completed" || state.currentNode !== "end")
  ) {
    state = recomputePipelineState(state);
    writePipelineState(statePath, state);
  }
  if (stateRead.state) {
    const reconciled = reconcilePipelineStateFromArtifacts(state, systemOutput);
    if (reconciled.changed) {
      state = reconciled.state;
      writePipelineState(statePath, state);
    }
  }
  const nodes = JSON.parse(JSON.stringify(state.nodes || {}));
  if (state.overallStatus === "review-pending" && nodes.review?.status === "pending") {
    nodes.review.displayStatus = "ready";
  }
  const currentNode = state.nodes?.[state.currentNode] || null;
  const phase3bUsageHistory = buildPhase3bUsageHistorySnapshot(systemOutput, pricingConfig);
  return {
    code: system.code,
    name: system.name,
    url: system.url,
    owner: system.owner || "",
    priority: system.priority || "",
    outputDir: systemOutput,
    overallStatus: state.overallStatus,
    currentPhase: state.currentPhase,
    currentNode: state.currentNode,
    nextNode: nextNodeId(state.currentNode),
    phases: state.phases,
    nodes,
    nodeOrder: NODES,
    phaseOrder: PHASES,
    review: state.review,
    artifacts: buildArtifactSnapshot(systemOutput, state, system),
    phase3bUsage: buildPhase3bUsageSnapshot(systemOutput, pricingConfig),
    phase3bUsageHistory,
    phase3bUsageHistorySummary: buildPhase3bUsageHistorySummary(phase3bUsageHistory),
    writeValidation: buildWriteValidationSnapshot(systemOutput),
    operationGuideGate: buildOperationGuideGateSnapshot(systemOutput),
    truthReadiness: buildTruthReadinessSnapshot(systemOutput),
    coverageRepair: buildCoverageRepairSnapshot(systemOutput),
    evidence: buildEvidenceSnapshot(systemOutput),
    progress: buildProgress(state),
    currentNodeDurationMs: nodeDurationMs(currentNode),
    lastError: stateRead.error || currentNode?.lastError || "",
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  };
}

function buildSummary(systems) {
  const summary = {
    total: systems.length,
    running: 0,
    reviewPending: 0,
    failed: 0,
    finalized: 0,
    pending: 0,
    paused: 0,
  };
  for (const system of systems) {
    if (system.overallStatus === "running") summary.running += 1;
    else if (system.overallStatus === "review-pending") summary.reviewPending += 1;
    else if (system.overallStatus === "failed") summary.failed += 1;
    else if (system.overallStatus === "paused") summary.paused += 1;
    else if (system.overallStatus === "finalized") summary.finalized += 1;
    else summary.pending += 1;
  }
  return summary;
}

function resolveTrackedRun(systems) {
  if (currentRun && currentChild) {
    if (currentRun.mode === "batch") {
      return {
        mode: "batch",
        pid: currentChild.pid,
        provider: currentRun.provider || "",
        reset: Boolean(currentRun.reset),
        nodes: currentRun.nodes || "",
        concurrency: currentRun.concurrency || 4,
        systems: currentRun.systems || "",
        startedAt: currentRun.startedAt || "",
        tracked: true,
        stale: false,
      };
    }
    return {
      mode: "single",
      systemCode: currentRun.system,
      pid: currentChild.pid,
      provider: currentRun.provider || "",
      reset: Boolean(currentRun.reset),
      nodes: currentRun.nodes || "",
      startedAt: currentRun.startedAt || "",
      tracked: true,
      stale: false,
    };
  }
  const runningSystem = systems.find((item) => item.overallStatus === "running");
  if (!runningSystem) return null;
  const orphanPids = listProjectPipelinePids(PROJECT_ROOT);
  return {
    mode: "single",
    systemCode: runningSystem.code,
    pid: orphanPids[0] || null,
    provider: "",
    reset: false,
    nodes: "",
    startedAt: runningSystem.updatedAt || "",
    tracked: false,
    stale: orphanPids.length === 0,
  };
}

function progressFromBatchSummary(summary = {}) {
  const total = Number(summary.total || 0);
  const completed = Number(summary.completed || 0) + Number(summary.failed || 0);
  const boundedCompleted = Math.min(total, Math.max(0, completed));
  return {
    total,
    completed: boundedCompleted,
    percent: total ? Math.round((boundedCompleted / total) * 100) : 0,
  };
}

function buildBatchActiveRun(run, systems, batch) {
  const batchSystems = Array.isArray(batch?.systems) ? batch.systems : [];
  const runningBatchSystems = batchSystems.filter(
    (item) => item.runStatus === "running" || item.status === "running",
  );
  const currentCodes = runningBatchSystems.map((item) => item.code).filter(Boolean);
  const runningSystems = systems.filter((item) => currentCodes.includes(item.code));
  const summary = batch?.summary || {};
  const runningCount =
    Number(summary.running || 0) || runningBatchSystems.length || runningSystems.length || 0;
  const queuedCount = Number(summary.queued || 0);
  const failedCount = Number(summary.failed || 0);
  const total = Number(summary.total || batchSystems.length || systems.length || 0);
  const lastError =
    failedCount > 0
      ? `${failedCount} system(s) failed; open batch run-state.json or per-system log for details.`
      : run.stale
        ? "Batch state is running, but no local pipeline process was detected."
        : "";
  const truthReadyCount = batchSystems.filter((item) => item.truthReadiness?.canSubmitReview).length;
  const repairCount = batchSystems.filter((item) => item.coverageRepair).length;
  const failureSummary = batch?.failureSummary || { counts: {}, recoverable: 0, quotaSensitive: 0 };
  const diagnosis = batch?.diagnosis || null;
  const repairQueue = batch?.repairQueue || null;
  const acceptance = batch?.acceptance || null;
  const deliveryReadiness = batch?.deliveryReadiness || null;
  const realRunReadiness = batch?.realRunReadiness || null;
  const repairFollowUp = batch?.repairFollowUp || null;
  return {
    mode: "batch",
    systemCode: currentCodes.join(","),
    systemName: `Batch ${runningCount}/${total} running`,
    pid: run.pid || null,
    provider: run.provider || "",
    reset: Boolean(run.reset),
    nodes: run.nodes || "",
    concurrency: run.concurrency || batch?.concurrency || 4,
    systems: batchSystems,
    truthReadyCount,
    coverageRepairCount: repairCount,
    failureSummary,
    diagnosis,
    repairQueue,
    acceptance,
    deliveryReadiness,
    realRunReadiness,
    repairFollowUp,
    startedAt: run.startedAt || batch?.startedAt || "",
    runningMs:
      run.startedAt || batch?.startedAt
        ? Math.max(0, Date.now() - new Date(run.startedAt || batch.startedAt).getTime())
        : 0,
    currentPhase: "batch",
    currentNode: "batch",
    currentNodeLabel: `${runningCount} running / ${queuedCount} queued`,
    nextNode: "",
    nextNodeLabel: "",
    lastError,
    progress: progressFromBatchSummary(summary),
    tracked: run.tracked,
    stale: run.stale,
  };
}

function buildActiveRun(systems, batch = null) {
  if (!currentRun && batch?.status === "running") {
    const batchPids = (Array.isArray(batch.systems) ? batch.systems : [])
      .map((item) => Number(item.pid || 0))
      .filter((pid) => pid > 0);
    return buildBatchActiveRun(
      {
        mode: "batch",
        pid: batchPids[0] || null,
        provider: "",
        reset: false,
        nodes: "",
        concurrency: batch.concurrency || 4,
        systems: "",
        startedAt: batch.startedAt || "",
        tracked: false,
        stale: batchPids.length === 0,
      },
      systems,
      batch,
    );
  }
  const run = resolveTrackedRun(systems);
  if (!run) return null;
  if (run.mode === "batch") return buildBatchActiveRun(run, systems, batch);
  const system = systems.find((item) => item.code === run.systemCode);
  if (!system) return null;
  const currentNode = system.nodes?.[system.currentNode] || null;
  return {
    systemCode: run.systemCode,
    systemName: system.name,
    pid: run.pid || null,
    provider: run.provider || "",
    reset: Boolean(run.reset),
    nodes: run.nodes || "",
    startedAt: run.startedAt || "",
    runningMs: run.startedAt ? Math.max(0, Date.now() - new Date(run.startedAt).getTime()) : 0,
    currentPhase: system.currentPhase,
    currentNode: system.currentNode,
    currentNodeLabel: currentNode?.label || system.currentNode,
    nextNode: system.nextNode,
    nextNodeLabel: system.nextNode ? system.nodes?.[system.nextNode]?.label || system.nextNode : "",
    lastError: currentNode?.lastError || run.stale ? "状态显示运行中，但未检测到流水线进程（可能已卡住）。" : "",
    progress: system.progress,
    tracked: run.tracked,
    stale: run.stale,
  };
}

function pauseRunningStatesOnDisk(configPath, options = {}) {
  const { config, outputRoot } = resolveDashboardPaths({ configPath });
  const targetCode = options.system || "";
  const systems = (config.systems || []).filter((system) => !targetCode || system.code === targetCode);
  const paused = [];
  for (const system of systems) {
    const statePath = path.join(outputRoot, system.code, "pipeline-state.json");
    const { state } = readDashboardPipelineState(statePath);
    if (!state) continue;
    const hasRunningNode = Object.values(state.nodes || {}).some((node) => node.status === "running");
    if (state.overallStatus !== "running" && !hasRunningNode) continue;
    const result = stopRunningPipelineState(state, options.message || "用户手动停止");
    if (result.changed) {
      writePipelineState(statePath, result.state);
      paused.push(system.code);
    }
  }
  return paused;
}

function resetPipelineStateOnDisk(systemCode, configPath) {
  const { config, outputRoot } = resolveDashboardPaths({ configPath });
  const system = (config.systems || []).find((item) => item.code === systemCode);
  if (!system) throw new Error(`System not found: ${systemCode}`);
  const { state } = resetSystemPipelineState(system, path.join(outputRoot, system.code));
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
  return state;
}

function buildDashboardSnapshot(options = {}) {
  const { configPath, config, outputRoot } = resolveDashboardPaths(options);
  const batch = readOptionalJsonObject(path.join(outputRoot, "_batch", "run-state.json"));
  const batchDiagnosis = readOptionalJsonObject(path.join(outputRoot, "_batch", "diagnosis.json"));
  const batchDiagnosisArtifacts = {
    json: fileInfo(path.join(outputRoot, "_batch", "diagnosis.json")),
    markdown: fileInfo(path.join(outputRoot, "_batch", "diagnosis.md")),
  };
  const batchRepairQueue = readOptionalJsonObject(path.join(outputRoot, "_batch", "repair-queue.json"));
  const batchRepairQueueArtifacts = {
    json: fileInfo(path.join(outputRoot, "_batch", "repair-queue.json")),
    markdown: fileInfo(path.join(outputRoot, "_batch", "repair-queue.md")),
  };
  const batchAcceptanceReport = readOptionalJsonObject(path.join(outputRoot, "_batch", "acceptance-report.json"));
  const batchAcceptanceArtifacts = {
    json: fileInfo(path.join(outputRoot, "_batch", "acceptance-report.json")),
    markdown: fileInfo(path.join(outputRoot, "_batch", "acceptance-report.md")),
  };
  const batchDeliveryReadinessReport = readOptionalJsonObject(
    path.join(outputRoot, "_batch", "delivery-readiness-report.json"),
  );
  const batchDeliveryReadinessArtifacts = {
    json: fileInfo(path.join(outputRoot, "_batch", "delivery-readiness-report.json")),
    markdown: fileInfo(path.join(outputRoot, "_batch", "delivery-readiness-report.md")),
  };
  const batchRealRunReadinessReport = readOptionalJsonObject(
    path.join(outputRoot, "_batch", "real-run-readiness-report.json"),
  );
  const batchRealRunReadinessArtifacts = {
    json: fileInfo(path.join(outputRoot, "_batch", "real-run-readiness-report.json")),
    markdown: fileInfo(path.join(outputRoot, "_batch", "real-run-readiness-report.md")),
  };
  const batchRepairRunState = readOptionalJsonObject(path.join(outputRoot, "_batch", "repair-run-state.json"));
  const batchRepairRunPlan = readOptionalJsonObject(path.join(outputRoot, "_batch", "repair-run-plan.json"));
  const batchRepairClosure = readOptionalJsonObject(path.join(outputRoot, "_batch", "repair-closure.json"));
  const batchRepairFollowUpPlan = readOptionalJsonObject(path.join(outputRoot, "_batch", "repair-follow-up-plan.json"));
  const batchRepairFollowUpLoopState = readOptionalJsonObject(
    path.join(outputRoot, "_batch", "repair-follow-up-loop-state.json"),
  );
  const batchRepairRunArtifacts = {
    state: fileInfo(path.join(outputRoot, "_batch", "repair-run-state.json")),
    planJson: fileInfo(path.join(outputRoot, "_batch", "repair-run-plan.json")),
    planMarkdown: fileInfo(path.join(outputRoot, "_batch", "repair-run-plan.md")),
    closureJson: fileInfo(path.join(outputRoot, "_batch", "repair-closure.json")),
    closureMarkdown: fileInfo(path.join(outputRoot, "_batch", "repair-closure.md")),
    followUpJson: fileInfo(path.join(outputRoot, "_batch", "repair-follow-up-plan.json")),
    followUpMarkdown: fileInfo(path.join(outputRoot, "_batch", "repair-follow-up-plan.md")),
    followUpLoopState: fileInfo(path.join(outputRoot, "_batch", "repair-follow-up-loop-state.json")),
  };
  const batchForActiveRun = batch
    ? {
        ...batch,
        diagnosis:
          batch.diagnosis ||
          (batchDiagnosis
            ? {
                summary: batchDiagnosis.summary || {},
                artifacts: { diagnosisJson: "diagnosis.json", diagnosisMarkdown: "diagnosis.md" },
                generatedAt: batchDiagnosis.generatedAt || "",
              }
            : null),
        repairQueue:
          batch.repairQueue ||
          (batchRepairQueue
            ? {
                summary: batchRepairQueue.summary || {},
                artifacts: { repairQueueJson: "repair-queue.json", repairQueueMarkdown: "repair-queue.md" },
                generatedAt: batchRepairQueue.generatedAt || "",
              }
            : null),
        acceptance:
          batch.acceptance ||
          (batchAcceptanceReport
            ? {
                status: batchAcceptanceReport.status || "",
                canSubmitAll: Boolean(batchAcceptanceReport.canSubmitAll),
                summary: batchAcceptanceReport.summary || {},
                artifacts: { acceptanceJson: "acceptance-report.json", acceptanceMarkdown: "acceptance-report.md" },
                generatedAt: batchAcceptanceReport.generatedAt || "",
              }
            : null),
        deliveryReadiness:
          batch.deliveryReadiness ||
          (batchDeliveryReadinessReport
            ? {
                status: batchDeliveryReadinessReport.status || "",
                canDeliver: Boolean(batchDeliveryReadinessReport.canDeliver),
                summary: batchDeliveryReadinessReport.summary || {},
                acceptance: batchDeliveryReadinessReport.acceptance || {},
                artifacts: {
                  deliveryReadinessJson: "delivery-readiness-report.json",
                  deliveryReadinessMarkdown: "delivery-readiness-report.md",
                },
                generatedAt: batchDeliveryReadinessReport.generatedAt || "",
              }
            : null),
        realRunReadiness:
          batch.realRunReadiness ||
          (batchRealRunReadinessReport
            ? {
                status: batchRealRunReadinessReport.status || "",
                canStartRealRun: Boolean(batchRealRunReadinessReport.canStartRealRun),
                canDeliver: Boolean(batchRealRunReadinessReport.canDeliver),
                summary: batchRealRunReadinessReport.summary || {},
                batchRun: batchRealRunReadinessReport.batchRun || null,
                acceptance: batchRealRunReadinessReport.acceptance || null,
                deliveryReadiness: batchRealRunReadinessReport.deliveryReadiness || null,
                artifacts: {
                  realRunReadinessJson: "real-run-readiness-report.json",
                  realRunReadinessMarkdown: "real-run-readiness-report.md",
                },
                generatedAt: batchRealRunReadinessReport.generatedAt || "",
                nextAction: batchRealRunReadinessReport.nextAction || "",
              }
            : null),
        repairFollowUp:
          batch.repairFollowUp ||
          batch.followUpPlan ||
          (batchRepairFollowUpPlan
            ? {
                status: batchRepairFollowUpPlan.status || "",
                nextBestAction: batchRepairFollowUpPlan.nextBestAction || "",
                summary: batchRepairFollowUpPlan.summary || {},
                artifacts: {
                  followUpJson: "repair-follow-up-plan.json",
                  followUpMarkdown: "repair-follow-up-plan.md",
                },
                generatedAt: batchRepairFollowUpPlan.generatedAt || "",
              }
            : null),
      }
    : batch;
  const pricingConfig = config.narrative?.pricing || {};
  const systems = (config.systems || []).map((system) =>
    buildSystemDashboardItem(system, outputRoot, { pricingConfig }),
  );
  let activeRun = buildActiveRun(systems, batchForActiveRun);
  if (options.activeRun) {
    const explicit = options.activeRun;
    const system = systems.find(
      (item) => item.code === (explicit.system || explicit.systemCode),
    );
    if (system) {
      const currentNode = system.nodes?.[system.currentNode] || null;
      const base =
        activeRun ||
        ({
          systemCode: system.code,
          systemName: system.name,
          pid: null,
          provider: "",
          reset: false,
          nodes: "",
          startedAt: "",
          runningMs: 0,
          currentPhase: system.currentPhase,
          currentNode: system.currentNode,
          currentNodeLabel: currentNode?.label || system.currentNode,
          nextNode: system.nextNode,
          nextNodeLabel: system.nextNode
            ? system.nodes?.[system.nextNode]?.label || system.nextNode
            : "",
          lastError: currentNode?.lastError || "",
          progress: system.progress,
          tracked: false,
          stale: true,
        });
      activeRun = {
        ...base,
        pid: explicit.pid ?? base.pid,
        provider: explicit.provider || base.provider,
        reset: Boolean(explicit.reset),
        nodes: explicit.nodes || base.nodes,
        startedAt: explicit.startedAt || base.startedAt,
        runningMs: explicit.startedAt
          ? Math.max(0, Date.now() - new Date(explicit.startedAt).getTime())
          : base.runningMs,
        tracked: Boolean(explicit.pid) || base.tracked,
        stale: explicit.pid ? false : base.stale,
        lastError: explicit.pid ? currentNode?.lastError || "" : base.lastError,
      };
    }
  }

  const projectRoot = path.resolve(path.dirname(configPath), "..");
  const defaultNarrativeProvider = resolveNarrativeProvider({ config, projectRoot });

  return {
    configPath,
    outputRoot,
    batch: batchForActiveRun,
    batchDiagnosis,
    batchDiagnosisArtifacts,
    batchRepairQueue,
    batchRepairQueueArtifacts,
    batchAcceptanceReport,
    batchAcceptanceArtifacts,
    batchDeliveryReadinessReport,
    batchDeliveryReadinessArtifacts,
    batchRealRunReadinessReport,
    batchRealRunReadinessArtifacts,
    batchRepairRunState,
    batchRepairRunPlan,
    batchRepairClosure,
    batchRepairFollowUpPlan,
    batchRepairFollowUpLoopState,
    batchRepairRunArtifacts,
    summary: buildSummary(systems),
    activeRun,
    systems,
    running: Boolean(activeRun),
    defaultNarrativeProvider,
    cursorSdkConfigured: isCursorSdkConfigured({ projectRoot }),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeNodes(nodes) {
  if (Array.isArray(nodes)) return nodes.filter(Boolean).join(",");
  return String(nodes || "").trim();
}

function buildPipelineCommand(options = {}) {
  if (!options.system) throw new Error("system is required");
  const args = [
    "scripts/run-whitepaper-pipeline.js",
    "--config",
    options.configPath || "config/systems.local.yaml",
    "--system",
    options.system,
  ];
  const nodes = normalizeNodes(options.nodes);
  if (nodes) args.push("--nodes", nodes);
  if (options.provider) args.push("--provider", options.provider);
  if (options.narrativePart) args.push("--narrative-part", options.narrativePart);
  if (options.reviewRerun) args.push("--review-rerun");
  if (options.reset) args.push("--reset");
  if (options["skip-session"]) args.push("--skip-session");
  return {
    command: process.execPath,
    args,
    cwd: PROJECT_ROOT,
  };
}

function isBatchRunOptions(options = {}) {
  const system = String(options.system || "").trim();
  return Boolean(
    options.batch ||
      options.all ||
      system === "*" ||
      Array.isArray(options.systems) ||
      String(options.systems || "").trim(),
  );
}

function normalizeBatchSystems(options = {}) {
  const source =
    options.systems !== undefined && options.systems !== null
      ? options.systems
      : options.system && String(options.system).trim() !== "*"
        ? options.system
        : "";
  if (Array.isArray(source)) {
    return source.map((item) => String(item || "").trim()).filter(Boolean).join(",");
  }
  return String(source || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .join(",");
}

function buildBatchPipelineCommand(options = {}) {
  const args = [
    "scripts/run-whitepaper-batch.js",
    "--config",
    options.configPath || "config/systems.local.yaml",
  ];
  const systems = normalizeBatchSystems(options);
  if (systems) {
    args.push("--systems", systems);
  } else {
    args.push("--all");
  }
  const nodes = normalizeNodes(options.nodes);
  if (nodes) args.push("--nodes", nodes);
  if (options.provider) args.push("--provider", options.provider);
  if (options.reset) args.push("--reset");
  if (options["skip-session"]) args.push("--skip-session");
  if (options.withWhitepaper !== false && options["with-whitepaper"] !== false) {
    args.push("--with-whitepaper");
  }
  args.push("--concurrency", String(options.concurrency || 4));
  return {
    command: process.execPath,
    args,
    cwd: PROJECT_ROOT,
  };
}

function resolveRerunNarrativePart(decision = {}) {
  if (decision.narrativePart) return decision.narrativePart;
  if (decision.rewriteScope === "overview-flow") return "overview-flow";
  if (decision.rewriteScope === "function-sections") return "function-sections";
  return "";
}

function forceStopPipelineSync(options = {}) {
  const killedPids = [];
  if (currentChild?.pid) {
    if (killProcessTree(currentChild.pid)) killedPids.push(currentChild.pid);
    currentChild = null;
    currentRun = null;
  }
  const pausedSystems = pauseRunningStatesOnDisk(options.configPath, {
    system: options.system,
    message: options.message || "用户手动停止",
  });
  return { killedPids: [...new Set(killedPids)], pausedSystems };
}

function schedulePipelineProcessCleanup(skipPids = []) {
  const skip = new Set((Array.isArray(skipPids) ? skipPids : [skipPids]).filter(Boolean));
  setImmediate(() => {
    try {
      for (const pid of listProjectPipelinePids(PROJECT_ROOT)) {
        if (skip.has(pid)) continue;
        killProcessTree(pid);
      }
    } catch {
      // Best-effort orphan cleanup after the HTTP response is sent.
    }
  });
}

function forceStopPipeline(options = {}) {
  const result = forceStopPipelineSync(options);
  schedulePipelineProcessCleanup(result.killedPids);
  return result;
}

function runPipeline(options = {}) {
  const configPath = options.configPath || "config/systems.local.yaml";
  const batchMode = isBatchRunOptions(options);
  let stoppedPids = [];
  if (currentChild || options.reset) {
    ({ killedPids: stoppedPids } = forceStopPipelineSync({
      configPath,
      system: batchMode ? "" : options.system,
    }));
  }
  const { config } = resolveDashboardPaths({ configPath });
  const provider =
    options.provider ||
    resolveNarrativeProvider({ config, projectRoot: PROJECT_ROOT, provider: options.provider });
  if (!batchMode && options.reset && options.system) {
    resetPipelineStateOnDisk(options.system, configPath);
  }
  const command = batchMode
    ? buildBatchPipelineCommand({ ...options, provider, configPath })
    : buildPipelineCommand({ ...options, provider, configPath });
  currentChild = spawn(command.command, command.args, {
    cwd: command.cwd,
    stdio: "ignore",
    windowsHide: true,
  });
  const pid = currentChild.pid;
  if (!batchMode) {
    schedulePipelineProcessCleanup([...stoppedPids, pid]);
  }
  currentRun = {
    mode: batchMode ? "batch" : "single",
    system: batchMode ? "" : options.system,
    systems: batchMode ? normalizeBatchSystems(options) || "*" : "",
    nodes: normalizeNodes(options.nodes),
    provider,
    reset: Boolean(options.reset),
    concurrency: batchMode ? Number(options.concurrency || 4) : null,
    narrativePart: options.narrativePart || "",
    pid,
    startedAt: new Date().toISOString(),
    configPath: options.configPath,
  };
  currentChild.on("exit", () => {
    const finishedRun = currentRun;
    currentChild = null;
    currentRun = null;
    if (!finishedRun?.system) return;
    try {
      const { outputRoot } = resolveDashboardPaths({ configPath: finishedRun.configPath });
      const statePath = path.join(outputRoot, finishedRun.system, "pipeline-state.json");
      const { state } = readDashboardPipelineState(statePath);
      if (!state) return;
      const reconciled = reconcilePipelineStateFromArtifacts(
        state,
        path.join(outputRoot, finishedRun.system),
      );
      if (reconciled.changed) {
        writePipelineState(statePath, reconciled.state);
        return;
      }
      const runningNodeId = finishedRun.nodes?.split(",")?.[0] || state.currentNode;
      if (runningNodeId && state.nodes?.[runningNodeId]?.status === "running") {
        writePipelineState(
          statePath,
          updateNodeStatus(state, runningNodeId, "paused", {
            lastError: "流水线子进程已结束，但节点状态未更新。请重试该节点或刷新页面。",
          }),
        );
      }
    } catch {
      // Best-effort state repair after child exit.
    }
  });
  return { status: "started", mode: batchMode ? "batch" : "single", pid, args: command.args };
}

function stopPipeline(options = {}) {
  const configPath = options.configPath || currentRun?.configPath || "config/systems.local.yaml";
  const targetSystem = currentRun?.mode === "batch" ? "" : options.system;
  const { killedPids, pausedSystems } = forceStopPipelineSync({
    configPath,
    system: targetSystem,
    message: options.message || "用户手动停止",
  });
  schedulePipelineProcessCleanup(killedPids);
  if (!killedPids.length && !pausedSystems.length) {
    return { status: "idle", killedPids, pausedSystems };
  }
  return {
    status: "stopped",
    killedPids,
    pausedSystems,
    staleStateCleared: pausedSystems.length > 0 && killedPids.length === 0,
  };
}

function readRequestJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON request body."));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendFile(response, filePath, contentType, options = {}) {
  const headers = { "content-type": contentType };
  if (options.noCache) {
    headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
    headers.Pragma = "no-cache";
    headers.Expires = "0";
  }
  response.writeHead(200, headers);
  response.end(fs.readFileSync(filePath));
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMarkdownToHtml(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const chunks = [];
  let inPre = false;
  for (const line of lines) {
    if (line.startsWith("```")) {
      if (!inPre) {
        chunks.push("<pre><code>");
        inPre = true;
      } else {
        chunks.push("</code></pre>");
        inPre = false;
      }
      continue;
    }
    if (inPre) {
      chunks.push(`${escapeHtml(line)}\n`);
      continue;
    }
    if (/^#{1,6}\s+/.test(line)) {
      const level = Math.min(6, line.match(/^#+/)[0].length);
      chunks.push(`<h${level}>${escapeHtml(line.replace(/^#{1,6}\s+/, ""))}</h${level}>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      chunks.push(`<blockquote>${escapeHtml(line.replace(/^>\s?/, ""))}</blockquote>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      chunks.push(`<li>${escapeHtml(line.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }
    if (!line.trim()) {
      chunks.push("<p></p>");
      continue;
    }
    chunks.push(`<p>${escapeHtml(line)}</p>`);
  }
  if (inPre) chunks.push("</code></pre>");
  return chunks.join("\n");
}

function resolvePreviewArtifact(systemOutput, artifactKey, system = {}) {
  const { state } = readDashboardPipelineState(path.join(systemOutput, "pipeline-state.json"));
  const snapshot = buildArtifactSnapshot(systemOutput, state || {}, system);
  const artifact = snapshot[artifactKey];
  if (!artifact?.exists || !artifact.path) {
    throw new Error(`Artifact not found: ${artifactKey}`);
  }
  return artifact;
}

function sendArtifactPreview(response, systemOutput, artifactKey, system = {}) {
  const artifact = resolvePreviewArtifact(systemOutput, artifactKey, system);
  const markdown = fs.readFileSync(artifact.path, "utf8");
  const title = artifact.previewName || artifact.file || artifactKey;
  const body = renderMarkdownToHtml(markdown);
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: "Segoe UI", "Microsoft YaHei", sans-serif; margin: 24px auto; max-width: 960px; color: #0f172a; line-height: 1.65; }
    h1,h2,h3 { margin-top: 1.2em; }
    pre { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; overflow: auto; }
    blockquote { border-left: 4px solid #cbd5e1; color: #475569; margin: 0; padding-left: 12px; }
    li { margin: 4px 0; }
    .meta { color: #64748b; font-size: 13px; margin-bottom: 18px; }
  </style>
</head>
<body>
  <div class="meta">白皮书预览 · ${escapeHtml(title)}</div>
  ${body}
</body>
</html>`;
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
}

async function routeRequest(request, response, options = {}) {
  const url = new URL(request.url, `http://${request.headers?.host || DEFAULT_HOST}`);
  try {
    if (request.method === "GET" && url.pathname === "/") {
      sendFile(response, path.join(__dirname, "index.html"), "text/html; charset=utf-8", {
        noCache: true,
      });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/state") {
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      });
      response.end(JSON.stringify(buildDashboardSnapshot(options), null, 2));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/preview") {
      const systemCode = url.searchParams.get("system");
      const artifactKey = url.searchParams.get("artifact") || "pendingReview";
      if (!systemCode) throw new Error("system is required");
      const { config, outputRoot } = resolveDashboardPaths(options);
      const system = (config.systems || []).find((item) => item.code === systemCode);
      if (!system) throw new Error(`System not found: ${systemCode}`);
      sendArtifactPreview(response, path.join(outputRoot, systemCode), artifactKey, system);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/download") {
      const systemCode = url.searchParams.get("system");
      const artifactKey = url.searchParams.get("artifact") || "docx";
      if (!systemCode) throw new Error("system is required");
      const { config, outputRoot } = resolveDashboardPaths(options);
      const system = (config.systems || []).find((item) => item.code === systemCode);
      if (!system) throw new Error(`System not found: ${systemCode}`);
      const systemOutput = path.join(outputRoot, systemCode);
      const { state } = readDashboardPipelineState(path.join(systemOutput, "pipeline-state.json"));
      const artifact = resolveArtifactDownloadPath(
        systemOutput,
        artifactKey,
        state || createPipelineState(system),
        system,
      );
      sendDownloadFile(response, artifact.path, artifact.previewName || artifact.file);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/screenshot") {
      const systemCode = url.searchParams.get("system");
      const relativeFile = url.searchParams.get("file");
      if (!systemCode) throw new Error("system is required");
      if (!relativeFile) throw new Error("file is required");
      const { config, outputRoot } = resolveDashboardPaths(options);
      const system = (config.systems || []).find((item) => item.code === systemCode);
      if (!system) throw new Error(`System not found: ${systemCode}`);
      const screenshotPath = resolveScreenshotPath(path.join(outputRoot, systemCode), relativeFile);
      sendScreenshotFile(response, screenshotPath);
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/run") {
      const body = await readRequestJson(request);
      sendJson(response, 202, runPipeline({ ...body, configPath: options.configPath }));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/retry") {
      const body = await readRequestJson(request);
      sendJson(
        response,
        202,
        runPipeline({
          ...body,
          configPath: options.configPath,
          nodes: body.node || body.nodes,
        }),
      );
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/stop") {
      const body = await readRequestJson(request);
      sendJson(
        response,
        202,
        stopPipeline({
          system: body.system,
          configPath: options.configPath,
        }),
      );
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/review") {
      const body = await readRequestJson(request);
      if (!body.system) throw new Error("system is required");
      const { configPath, config, outputRoot } = resolveDashboardPaths(options);
      const system = (config.systems || []).find((item) => item.code === body.system);
      if (!system) throw new Error(`System not found: ${body.system}`);
      const decision = runReviewDecision({
        inputDir: path.join(outputRoot, body.system),
        status: body.status || body.decision,
        comment: body.comment,
        requireDatabaseEvidence: system.databaseProfile?.enabled,
        systemCode: system.code,
        systemName: system.name,
      });
      let payload = decision;
      if (decision.status === "rejected" && body.autoRerun !== false && decision.rerunNodes?.length) {
        const provider = resolveNarrativeProvider({
          provider: body.provider,
          config,
          projectRoot: PROJECT_ROOT,
        });
        const narrativePart = resolveRerunNarrativePart(decision);
        payload = {
          ...decision,
          autoRerun: true,
          rerunProvider: provider,
          rerunNarrativePart: narrativePart,
          rerun: runPipeline({
            system: body.system,
            nodes: decision.rerunNodes.join(","),
            provider,
            narrativePart,
            reviewRerun: true,
            configPath,
          }),
        };
      }
      sendJson(response, 200, payload);
      return;
    }
    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    sendJson(response, 400, { error: error.message });
  }
}

function createDashboardServer(options = {}) {
  return http.createServer((request, response) => {
    routeRequest(request, response, options);
  });
}

function startDashboardServer(options = {}) {
  const host = options.host || DEFAULT_HOST;
  const port = Number(options.port || DEFAULT_PORT);
  const server = createDashboardServer(options);
  server.listen(port, host, () => {
    console.log(`Local dashboard: http://${host}:${port}`);
  });
  return server;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  startDashboardServer({
    configPath: args.config || "config/systems.local.yaml",
    host: args.host || DEFAULT_HOST,
    port: args.port || DEFAULT_PORT,
  });
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  buildActiveRun,
  buildArtifactSnapshot,
  buildDashboardSnapshot,
  buildBatchPipelineCommand,
  buildEvidenceSnapshot,
  buildTruthReadinessSnapshot,
  buildPipelineCommand,
  buildSystemDashboardItem,
  createDashboardServer,
  forceStopPipeline,
  forceStopPipelineSync,
  readDashboardPipelineState,
  readJsonSafe: readOptionalJson,
  resetPipelineStateOnDisk,
  resolveArtifactDownloadPath,
  resolveRerunNarrativePart,
  resolveScreenshotPath,
  routeRequest,
  startDashboardServer,
  stopPipeline,
};
