#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  normalizeAuthPaths,
  parseArgs,
  parseSystemsConfig,
  resolveConfigRelativePath,
  writeJson,
} = require("./system-whitepaper-lib");
const {
  assertPrivateDatabaseMetadataPath,
  assertPrivateDatabaseSecretPath,
  resolveDatabaseProfileConfig,
} = require("./collect-database-profile");
const { runDoctor } = require("./doctor");
const {
  assertValidTruthReadinessReportArtifact,
  buildTruthReadinessReport,
  findStaleReadinessSources,
  loadReadinessInputs,
} = require("./check-truth-readiness");
const { assertValidBatchAcceptanceReportArtifact } = require("./check-batch-acceptance");
const { assertValidDeliveryReadinessReportArtifact } = require("./check-delivery-readiness");

const REQUIRED_REAL_NODES = [
  "collect",
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
const DB_REQUIRED_NODES = ["db-profile", "db-model"];
const OPTIONAL_OR_SKIPPABLE_NODES = ["sync", "session", "inspect", "validate-write"];

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

function mdCell(value) {
  return String(value === undefined || value === null || value === "" ? "-" : value)
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|");
}

function issue(id, message, extra = {}) {
  return {
    id,
    severity: extra.severity || "P0",
    systemCode: extra.systemCode || "",
    message,
  };
}

function warning(id, message, extra = {}) {
  return {
    id,
    systemCode: extra.systemCode || "",
    message,
  };
}

function readJsonObjectIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function loadRealRunContext(options = {}) {
  const projectRoot = path.resolve(String(options.projectRoot || process.cwd()));
  const configPath = path.resolve(projectRoot, String(options.config || options.configPath || "config/systems.local.yaml"));
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config not found: ${configPath}`);
  }
  const config = parseSystemsConfig(fs.readFileSync(configPath, "utf8"));
  normalizeAuthPaths(config, configDir);
  const outputRoot = resolveConfigRelativePath(configDir, config.runtime?.outputDir || "outputs");
  return {
    projectRoot,
    configPath,
    configDir,
    config,
    outputRoot,
  };
}

function selectSystems(config = {}, args = {}) {
  const systems = Array.isArray(config.systems) ? config.systems : [];
  const requested = splitCsv(args.systems !== undefined ? args.systems : args.system);
  const selectedCodes = !requested.length || requested.includes("*") || args.all
    ? systems.map((system) => String(system.code || "").trim()).filter(Boolean)
    : requested;
  const seen = new Set();
  const duplicates = [];
  for (const code of selectedCodes) {
    if (seen.has(code)) duplicates.push(code);
    seen.add(code);
  }
  const byCode = new Map(systems.map((system) => [String(system.code || "").trim(), system]));
  return {
    systems: [...seen].map((code) => byCode.get(code)).filter(Boolean),
    missingCodes: [...seen].filter((code) => !byCode.has(code)),
    duplicateCodes: duplicates,
    requestedCodes: selectedCodes,
  };
}

function outputPathHasE2eSegment(outputDir) {
  return path
    .resolve(String(outputDir || ""))
    .split(/[\\/]+/)
    .some((part) => part.toLowerCase() === "_e2e");
}

function buildSystemPreparation(system = {}, context = {}) {
  const code = String(system.code || "").trim();
  const outputDir = path.join(context.outputRoot, code);
  const blockers = [];
  const warnings = [];
  if (!code) blockers.push(issue("system.code-missing", "System code is required."));
  if (!String(system.url || "").trim()) {
    blockers.push(issue("system.url-missing", "System URL is required.", { systemCode: code }));
  }
  if (outputPathHasE2eSegment(outputDir)) {
    blockers.push(issue("system.output-under-e2e", "Real run output must not be under an _e2e smoke directory.", { systemCode: code }));
  }
  if (system.databaseProfile?.enabled) {
    const databaseProfile = resolveDatabaseProfileConfig(system, context.configDir);
    const secretFile = databaseProfile.secretFile || "";
    let databaseSecret = null;
    let secretPathAllowed = true;
    if (!secretFile) {
      blockers.push(issue("database.secret-missing", "databaseProfile.enabled=true but the private database secret is missing.", { systemCode: code }));
    } else {
      try {
        assertPrivateDatabaseSecretPath(system, context.configDir, databaseProfile);
      } catch (error) {
        secretPathAllowed = false;
        blockers.push(issue("database.secret-path-unsafe", error.message, { systemCode: code }));
      }
    }
    if (secretFile && secretPathAllowed) {
      if (!fs.existsSync(secretFile)) {
        blockers.push(issue("database.secret-missing", "databaseProfile.enabled=true but the private database secret is missing.", { systemCode: code }));
      } else {
        try {
          databaseSecret = JSON.parse(fs.readFileSync(secretFile, "utf8"));
          if (!databaseSecret || typeof databaseSecret !== "object" || Array.isArray(databaseSecret)) {
            throw new Error("not object");
          }
        } catch {
          blockers.push(issue("database.secret-malformed", "Database secret file must be a valid JSON object.", { systemCode: code }));
        }
      }
    }
    if (databaseProfile.mode === "connector" && databaseProfile.readOnly !== true && databaseSecret?.readOnly !== true) {
      blockers.push(issue("database.connector-not-readonly", "databaseProfile.mode=connector requires databaseProfile.readOnly=true or secret readOnly=true.", { systemCode: code }));
    }
    const metadataFile = databaseProfile.metadataFile || databaseSecret?.metadataFile || "";
    if (databaseProfile.mode !== "connector") {
      let metadataPath = "";
      if (!metadataFile) {
        blockers.push(issue("database.metadata-missing", "Database metadata file is required for non-connector database evidence.", { systemCode: code }));
      } else {
        try {
          metadataPath = assertPrivateDatabaseMetadataPath(system, context.configDir, metadataFile);
        } catch (error) {
          blockers.push(issue("database.metadata-path-unsafe", error.message, { systemCode: code }));
        }
      }
      if (metadataPath && !fs.existsSync(metadataPath)) {
        blockers.push(issue("database.metadata-missing", "Database metadata file is required for non-connector database evidence.", { systemCode: code }));
      }
    }
  } else {
    warnings.push(warning("database.not-enabled", "Database evidence is not enabled; real run will rely on UI evidence only.", { systemCode: code }));
  }
  return {
    code,
    name: system.name || "",
    outputDir,
    databaseProfileEnabled: Boolean(system.databaseProfile?.enabled),
    status: blockers.length ? "blocked" : "ready-to-run",
    blockers,
    warnings,
  };
}

function reportSystemCodes(report = {}) {
  if (!Array.isArray(report.systems)) return null;
  return report.systems
    .map((item) => String(item?.code || item?.systemCode || "").trim())
    .filter(Boolean);
}

function sameCodeSet(left = [], right = []) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size !== rightSet.size) return false;
  return [...leftSet].every((code) => rightSet.has(code));
}

function normalizeComparablePath(value) {
  if (!value) return "";
  const normalized = path.resolve(String(value)).replace(/\\/g, "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function sameResolvedPath(left, right) {
  const normalizedLeft = normalizeComparablePath(left);
  const normalizedRight = normalizeComparablePath(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function reportScopeWarning(kind, id, message) {
  return warning(`${kind}.${id}`, message);
}

function reportPathScopeWarnings(report, kind, context = {}) {
  const warnings = [];
  if (report.configPath && context.configPath && !sameResolvedPath(report.configPath, context.configPath)) {
    warnings.push(
      reportScopeWarning(kind, "config-mismatch", `Ignored ${kind} report because configPath does not match current config.`),
    );
  }
  if (report.outputRoot && context.outputRoot && !sameResolvedPath(report.outputRoot, context.outputRoot)) {
    warnings.push(
      reportScopeWarning(kind, "output-mismatch", `Ignored ${kind} report because outputRoot does not match current output directory.`),
    );
  }
  return warnings;
}

function selectScopedReport(report, kind, selectedCodes = [], context = {}) {
  if (!report) return { report: null, warnings: [] };
  const expectedArtifactType = kind === "acceptance" ? "batch-acceptance-report" : "delivery-readiness-report";
  if (report.artifactType && report.artifactType !== expectedArtifactType) {
    return {
      report: null,
      warnings: [
        reportScopeWarning(kind, "artifact-type-mismatch", `Ignored ${kind} report with unsupported artifactType: ${report.artifactType}`),
      ],
    };
  }
  try {
    if (kind === "acceptance") {
      assertValidBatchAcceptanceReportArtifact(report);
    } else {
      assertValidDeliveryReadinessReportArtifact(report);
    }
  } catch (error) {
    return {
      report: null,
      warnings: [
        reportScopeWarning(
          kind,
          "invalid-artifact",
          `Ignored ${kind} report because it is not a valid artifact: ${error.message}`,
        ),
      ],
    };
  }
  const reportCodes = reportSystemCodes(report);
  if (!reportCodes || !reportCodes.length) {
    return {
      report: null,
      warnings: [
        reportScopeWarning(kind, "scope-unknown", `Ignored ${kind} report because it does not list system codes.`),
      ],
    };
  }
  if (!sameCodeSet(reportCodes, selectedCodes)) {
    return {
      report: null,
      warnings: [
        reportScopeWarning(
          kind,
          "scope-mismatch",
          `Ignored ${kind} report because systems do not match current selection. selected=${selectedCodes.join(",") || "-"} report=${reportCodes.join(",") || "-"}`,
        ),
      ],
    };
  }
  const pathWarnings = reportPathScopeWarnings(report, kind, context);
  if (pathWarnings.length) {
    return {
      report: null,
      warnings: pathWarnings,
    };
  }
  return { report, warnings: [] };
}

function acceptanceReportIsAccepted(acceptanceReport) {
  return acceptanceReport?.status === "accepted" && acceptanceReport.canSubmitAll === true;
}

function sameGeneratedAt(left, right) {
  return Boolean(left && right && String(left) === String(right));
}

function parseGeneratedAtMs(value) {
  if (!value) return null;
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}

function percentFromTruthReport(report = {}) {
  if (Number.isFinite(Number(report.scorePercent))) return Number(report.scorePercent);
  if (Number.isFinite(Number(report.score))) return Math.round(Number(report.score) * 1000) / 10;
  return 0;
}

function truthRequiresDatabaseEvidence(truth = {}, system = {}) {
  if (system.databaseProfileConfigured || system.databaseProfileEnabled) return true;
  if (truth.requirements?.databaseEvidenceRequired !== undefined) {
    return truth.requirements.databaseEvidenceRequired;
  }
  if (truth.gates?.database?.required !== undefined) return truth.gates.database.required;
  return false;
}

function truthReportLooksLikeSmoke(report = {}) {
  const mode = String(report.mode || "").toLowerCase();
  if (mode.includes("smoke") || mode.includes("local-e2e")) return true;
  const generatedBy = String(report.generatedBy || report.provenance?.generatedBy || "").toLowerCase();
  return generatedBy.includes("smoke") || generatedBy.includes("local-e2e");
}

function runStateSystemCodes(runState = {}) {
  if (!Array.isArray(runState.systems)) return null;
  return runState.systems
    .map((item) => String(item?.code || item?.systemCode || "").trim())
    .filter(Boolean);
}

function selectScopedRunState(runState, selectedCodes = [], context = {}) {
  if (!runState) return { runState: null, warnings: [] };
  if (runState.artifactType && runState.artifactType !== "batch-run-state") {
    return {
      runState: null,
      warnings: [
        reportScopeWarning(
          "batch",
          "artifact-type-mismatch",
          `Ignored batch run-state with unsupported artifactType: ${runState.artifactType}`,
        ),
      ],
    };
  }
  const runStateCodes = runStateSystemCodes(runState);
  if (!runStateCodes || !runStateCodes.length) {
    return {
      runState: null,
      warnings: [
        reportScopeWarning("batch", "scope-unknown", "Ignored batch run-state because it does not list system codes."),
      ],
    };
  }
  if (!sameCodeSet(runStateCodes, selectedCodes)) {
    return {
      runState: null,
      warnings: [
        reportScopeWarning(
          "batch",
          "scope-mismatch",
          `Ignored batch run-state because systems do not match current selection. selected=${selectedCodes.join(",") || "-"} runState=${runStateCodes.join(",") || "-"}`,
        ),
      ],
    };
  }
  const pathWarnings = reportPathScopeWarnings(runState, "batch", context);
  if (pathWarnings.length) {
    return { runState: null, warnings: pathWarnings };
  }
  return { runState, warnings: [] };
}

function summarizeRunState(runState = {}) {
  const systems = Array.isArray(runState.systems) ? runState.systems : [];
  const summary = runState.summary || {};
  return {
    status: runState.status || "",
    batchId: runState.batchId || "",
    concurrency: Number(runState.concurrency || 0),
    total: Number(summary.total || systems.length || 0),
    queued: Number(summary.queued || systems.filter((item) => item.runStatus === "queued").length),
    running: Number(summary.running || systems.filter((item) => item.runStatus === "running").length),
    completed: Number(summary.completed || systems.filter((item) => item.runStatus === "completed").length),
    failed: Number(summary.failed || systems.filter((item) => item.runStatus === "failed").length),
    paused: Number(summary.paused || systems.filter((item) => item.status === "paused").length),
    startedAt: runState.startedAt || "",
    finishedAt: runState.finishedAt || "",
  };
}

function bindDeliveryToBatchRunState(deliveryReport, runState, selectedCodes = []) {
  if (!deliveryReport || deliveryReport.status !== "ready" || deliveryReport.canDeliver !== true) {
    return { deliveryReport, warnings: [] };
  }
  if (!runState) {
    return {
      deliveryReport: null,
      warnings: [
        reportScopeWarning(
          "batch",
          "run-state-missing",
          "Ignored ready delivery report because current batch run-state is missing or not bound to this selection.",
        ),
      ],
    };
  }
  const systems = Array.isArray(runState.systems) ? runState.systems : [];
  const byCode = new Map(systems.map((item) => [String(item.code || "").trim(), item]));
  const invalid = [];
  for (const code of selectedCodes) {
    const item = byCode.get(code);
    if (!item) {
      invalid.push(`${code}:missing`);
      continue;
    }
    const runStatus = String(item.runStatus || "");
    const status = String(item.status || "");
    if (runStatus !== "completed" || !["success", "review-pending", "finalized"].includes(status)) {
      invalid.push(`${code}:${runStatus || "unknown"}/${status || "unknown"}`);
    }
  }
  const runningOrQueued = systems
    .filter((item) => ["running", "queued"].includes(String(item.runStatus || "")))
    .map((item) => String(item.code || "").trim())
    .filter(Boolean);
  const failedOrPaused = systems
    .filter((item) => ["failed", "paused"].includes(String(item.runStatus || "")) || ["failed", "paused"].includes(String(item.status || "")))
    .map((item) => String(item.code || "").trim())
    .filter(Boolean);
  if (runningOrQueued.length) invalid.push(`active:${runningOrQueued.join(",")}`);
  if (failedOrPaused.length) invalid.push(`failed:${failedOrPaused.join(",")}`);
  if (invalid.length) {
    return {
      deliveryReport: null,
      warnings: [
        reportScopeWarning(
          "batch",
          "run-state-not-terminal",
          `Ignored ready delivery report because current batch run-state is not terminal-complete: ${invalid.join("; ")}.`,
        ),
      ],
    };
  }
  return { deliveryReport, warnings: [] };
}

function readTextIfExists(filePath) {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  } catch {
    return "";
  }
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function markdownLooksLikeSmoke(markdown = "") {
  const text = String(markdown || "");
  if (/local-e2e-smoke|smoke gate|smoke artifact/i.test(text)) return true;
  if (text.includes("\u672c\u5730\u5192\u70df") || text.includes("\u5192\u70df")) return true;
  if (text.includes("\u4e0d\u4ee3\u8868\u6700\u7ec8\u4e1a\u52a1\u767d\u76ae\u4e66")) return true;
  return /local-e2e-smoke|smoke gate|本地冒烟|冒烟|不代表最终业务白皮书|不代表最终业务白皮书内容/i.test(
    String(markdown || ""),
  );
}

function pipelineNodeStatus(state = {}, nodeId) {
  return state.nodes?.[nodeId]?.status || "missing";
}

function pipelineNodeIsComplete(state, nodeId, options = {}) {
  const status = pipelineNodeStatus(state, nodeId);
  if (status === "success") return true;
  return options.allowSkipped && status === "skipped";
}

function pipelineNodeStillComplete(currentStatus, recordedStatus) {
  if (recordedStatus === "success") return currentStatus === "success";
  if (recordedStatus === "skipped") return currentStatus === "skipped";
  return true;
}

function collectCurrentRequiredNodeFailures(pipelineState = {}, system = {}) {
  const failures = [];
  const databaseProfileConfigured = Boolean(
    system.databaseProfileConfigured || system.databaseProfileEnabled || system.databaseProfile?.enabled,
  );
  for (const nodeId of REQUIRED_REAL_NODES) {
    if (!pipelineNodeIsComplete(pipelineState, nodeId)) {
      failures.push(`${nodeId}:${pipelineNodeStatus(pipelineState, nodeId)}`);
    }
  }
  if (databaseProfileConfigured) {
    for (const nodeId of DB_REQUIRED_NODES) {
      if (!pipelineNodeIsComplete(pipelineState, nodeId)) {
        failures.push(`${nodeId}:${pipelineNodeStatus(pipelineState, nodeId)}`);
      }
    }
  }
  for (const nodeId of OPTIONAL_OR_SKIPPABLE_NODES) {
    if (!pipelineNodeIsComplete(pipelineState, nodeId, { allowSkipped: true })) {
      failures.push(`${nodeId}:${pipelineNodeStatus(pipelineState, nodeId)}`);
    }
  }
  return failures;
}

function bindDeliveryReportToCurrentRequiredNodes(deliveryReport, context = {}, currentSystems = []) {
  if (!deliveryReport || deliveryReport.status !== "ready" || deliveryReport.canDeliver !== true) {
    return { report: deliveryReport, warnings: [] };
  }
  const invalidSystems = [];
  const currentSystemByCode = new Map(
    currentSystems.map((system) => [String(system?.code || system?.systemCode || "").trim(), system]),
  );
  for (const system of Array.isArray(deliveryReport.systems) ? deliveryReport.systems : []) {
    const code = String(system?.code || system?.systemCode || "").trim();
    if (!code) continue;
    const pipelineState = readJsonObjectIfExists(path.join(context.outputRoot || "", code, "pipeline-state.json"));
    if (!pipelineState) {
      invalidSystems.push({ code, failures: ["pipeline-state:missing"] });
      continue;
    }
    const currentSystem = currentSystemByCode.get(code) || {};
    const failures = collectCurrentRequiredNodeFailures(pipelineState, { ...system, ...currentSystem });
    if (failures.length) invalidSystems.push({ code, failures });
  }
  if (invalidSystems.length) {
    return {
      report: null,
      warnings: [
        reportScopeWarning(
          "delivery",
          "current-required-nodes-not-success",
          `Ignored ready delivery report because current required pipeline nodes are not complete: ${invalidSystems.map((item) => `${item.code}:${item.failures.join(",")}`).join("; ")}.`,
        ),
      ],
    };
  }
  return { report: deliveryReport, warnings: [] };
}

function bindDeliveryReportToAcceptance(deliveryReport, acceptanceReport) {
  if (!deliveryReport) return { report: null, warnings: [] };
  if (!acceptanceReport) {
    return {
      report: null,
      warnings: [
        reportScopeWarning(
          "delivery",
          "acceptance-missing",
          "Ignored delivery report because the matching standalone acceptance report is missing.",
        ),
      ],
    };
  }
  const embeddedAcceptance = deliveryReport.acceptance || {};
  const statusMatches = embeddedAcceptance.status === acceptanceReport.status;
  const canSubmitMatches = Boolean(embeddedAcceptance.canSubmitAll) === Boolean(acceptanceReport.canSubmitAll);
  const generatedAtMatches = sameGeneratedAt(embeddedAcceptance.generatedAt, acceptanceReport.generatedAt);
  if (!statusMatches || !canSubmitMatches || !generatedAtMatches) {
    return {
      report: null,
      warnings: [
        reportScopeWarning(
          "delivery",
          "acceptance-mismatch",
          "Ignored delivery report because it was not generated from the current standalone acceptance report.",
        ),
      ],
    };
  }
  const deliveryGeneratedAtMs = parseGeneratedAtMs(deliveryReport.generatedAt);
  const acceptanceGeneratedAtMs = parseGeneratedAtMs(acceptanceReport.generatedAt);
  if (deliveryGeneratedAtMs !== null && acceptanceGeneratedAtMs !== null && deliveryGeneratedAtMs < acceptanceGeneratedAtMs) {
    return {
      report: null,
      warnings: [
        reportScopeWarning(
          "delivery",
          "generated-before-acceptance",
          "Ignored delivery report because it was generated before the current acceptance report.",
        ),
      ],
    };
  }
  return { report: deliveryReport, warnings: [] };
}

function bindDeliveryReportToCurrentSources(deliveryReport, context = {}) {
  if (!deliveryReport) return { report: null, warnings: [] };
  const invalidSystems = [];
  const targetTruthScorePercent = Number(deliveryReport.targetTruthScorePercent || 95);
  for (const system of Array.isArray(deliveryReport.systems) ? deliveryReport.systems : []) {
    const code = String(system?.code || system?.systemCode || "").trim();
    if (!code) continue;
    const pipelineState = readJsonObjectIfExists(path.join(context.outputRoot || "", code, "pipeline-state.json"));
    if (!pipelineState) {
      invalidSystems.push({ code, reason: "missing-pipeline-state" });
      continue;
    }
    if (!["review-pending", "finalized"].includes(String(pipelineState.overallStatus || ""))) {
      invalidSystems.push({ code, reason: "pipeline-not-delivery-state" });
      continue;
    }
    const recordedNodeStatus = system.nodeStatus || {};
    if (!recordedNodeStatus || !Object.keys(recordedNodeStatus).length) {
      invalidSystems.push({ code, reason: "missing-delivery-node-status" });
      continue;
    }
    for (const [nodeId, recordedStatus] of Object.entries(recordedNodeStatus)) {
      const currentStatus = pipelineNodeStatus(pipelineState, nodeId);
      if (!pipelineNodeStillComplete(currentStatus, recordedStatus)) {
        invalidSystems.push({ code, reason: `pipeline-node-${nodeId}-${currentStatus}` });
        break;
      }
    }
    if (invalidSystems.some((item) => item.code === code)) continue;
    const systemOutputDir = path.join(context.outputRoot || "", code);
    const pendingPath = path.join(systemOutputDir, "whitepaper.pending-review.md");
    const finalPath = path.join(systemOutputDir, "whitepaper.final.md");
    const pendingMarkdown = readTextIfExists(pendingPath);
    const finalMarkdown = readTextIfExists(finalPath);
    if (!fileExists(pendingPath) && !fileExists(finalPath)) {
      invalidSystems.push({ code, reason: "missing-whitepaper" });
      continue;
    }
    if (markdownLooksLikeSmoke(pendingMarkdown) || markdownLooksLikeSmoke(finalMarkdown)) {
      invalidSystems.push({ code, reason: "smoke-whitepaper" });
      continue;
    }
    const truthReportPath = path.join(context.outputRoot || "", code, "truth-readiness-report.json");
    const truthReport = readJsonObjectIfExists(truthReportPath);
    if (!truthReport) {
      invalidSystems.push({ code, reason: "missing-truth-readiness" });
      continue;
    }
    try {
      assertValidTruthReadinessReportArtifact(truthReport);
    } catch {
      invalidSystems.push({ code, reason: "truth-invalid-artifact" });
      continue;
    }
    if (
      truthReportLooksLikeSmoke(truthReport) ||
      truthReport.canSubmitReview !== true ||
      percentFromTruthReport(truthReport) < targetTruthScorePercent
    ) {
      invalidSystems.push({ code, reason: "truth-not-currently-ready" });
      continue;
    }
    const staleSources = findStaleReadinessSources(systemOutputDir, truthReport);
    if (staleSources.length) {
      invalidSystems.push({ code, reason: "stale-truth-sources" });
      continue;
    }
    const currentTruth = buildTruthReadinessReport({
      artifacts: loadReadinessInputs(systemOutputDir),
      threshold: targetTruthScorePercent,
      requireDatabaseEvidence: truthRequiresDatabaseEvidence(truthReport, system),
      expectedSystem: { code, name: system.name || "" },
    });
    if (
      currentTruth.canSubmitReview !== true ||
      percentFromTruthReport(currentTruth) < targetTruthScorePercent
    ) {
      invalidSystems.push({ code, reason: "current-truth-gate-failed" });
    }
  }
  if (invalidSystems.length) {
    return {
      report: null,
      warnings: [
        reportScopeWarning(
          "delivery",
          "current-truth-invalid",
          `Ignored delivery report because current pipeline/truth/whitepaper evidence is not delivery-ready for systems: ${invalidSystems.map((item) => `${item.code}:${item.reason}`).join(",")}.`,
        ),
      ],
    };
  }
  return { report: deliveryReport, warnings: [] };
}

function deriveStatus(preparationStatus, acceptanceReport, deliveryReport) {
  if (preparationStatus === "blocked") return "blocked";
  if (deliveryReport?.status === "blocked" || acceptanceReport?.status === "blocked") return "blocked";
  if (deliveryReport?.status === "ready" && deliveryReport.canDeliver === true && acceptanceReportIsAccepted(acceptanceReport)) {
    return "ready";
  }
  if (acceptanceReportIsAccepted(acceptanceReport) && !deliveryReport) return "in-progress";
  if (preparationStatus === "ready-to-run") return "ready-to-run";
  return "blocked";
}

function buildRealRunReadinessReport(input = {}) {
  const args = input.args || {};
  const context = input.context || loadRealRunContext(input);
  const doctor = input.doctor || runDoctor({ config: context.configPath, projectRoot: context.projectRoot });
  const selection = selectSystems(context.config, args);
  const blockers = [];
  const warnings = [];
  for (const failure of doctor.failures || []) {
    blockers.push(issue(`doctor.${failure.id}`, failure.message));
  }
  for (const doctorWarning of doctor.warnings || []) {
    warnings.push(warning(`doctor.${doctorWarning.id}`, doctorWarning.message));
  }
  for (const code of selection.missingCodes) {
    blockers.push(issue("system.not-found", `System not found in config: ${code}`, { systemCode: code }));
  }
  for (const code of selection.duplicateCodes) {
    blockers.push(issue("system.duplicate-request", `Duplicate system requested: ${code}`, { systemCode: code }));
  }
  const systems = selection.systems.map((system) => buildSystemPreparation(system, context));
  blockers.push(...systems.flatMap((system) => system.blockers));
  warnings.push(...systems.flatMap((system) => system.warnings));

  const selectedCodes = systems.map((system) => system.code).filter(Boolean);
  const rawRunState = input.batchRunState || input.runState || readJsonObjectIfExists(path.join(context.outputRoot, "_batch", "run-state.json"));
  const rawAcceptanceReport = input.acceptanceReport || readJsonObjectIfExists(path.join(context.outputRoot, "_batch", "acceptance-report.json"));
  const rawDeliveryReport = input.deliveryReport || readJsonObjectIfExists(path.join(context.outputRoot, "_batch", "delivery-readiness-report.json"));
  const runStateSelection = selectScopedRunState(rawRunState, selectedCodes, context);
  const acceptanceSelection = selectScopedReport(rawAcceptanceReport, "acceptance", selectedCodes, context);
  const deliverySelection = selectScopedReport(rawDeliveryReport, "delivery", selectedCodes, context);
  const boundDeliverySelection = bindDeliveryReportToAcceptance(deliverySelection.report, acceptanceSelection.report);
  const requiredNodeDeliverySelection = bindDeliveryReportToCurrentRequiredNodes(boundDeliverySelection.report, context, systems);
  const freshDeliverySelection = bindDeliveryReportToCurrentSources(requiredNodeDeliverySelection.report, context);
  const terminalDeliverySelection = bindDeliveryToBatchRunState(
    freshDeliverySelection.report,
    runStateSelection.runState,
    selectedCodes,
  );
  warnings.push(
    ...runStateSelection.warnings,
    ...acceptanceSelection.warnings,
    ...deliverySelection.warnings,
    ...boundDeliverySelection.warnings,
    ...requiredNodeDeliverySelection.warnings,
    ...freshDeliverySelection.warnings,
    ...terminalDeliverySelection.warnings,
  );
  const acceptanceReport = acceptanceSelection.report;
  const deliveryReport = terminalDeliverySelection.deliveryReport;
  const preparationStatus = blockers.length ? "blocked" : "ready-to-run";
  const status = deriveStatus(preparationStatus, acceptanceReport, deliveryReport);
  return {
    artifactType: "real-run-readiness-report",
    version: 1,
    generatedAt: nowIso(input.now),
    status,
    canStartRealRun: preparationStatus === "ready-to-run",
    canDeliver: status === "ready",
    configPath: context.configPath,
    outputRoot: context.outputRoot,
    summary: {
      systems: systems.length,
      readyToRun: systems.filter((system) => system.status === "ready-to-run").length,
      databaseEnabled: systems.filter((system) => system.databaseProfileEnabled).length,
      blockers: blockers.length,
      warnings: warnings.length,
    },
    doctor: {
      ok: Boolean(doctor.ok),
      counts: doctor.counts || {},
    },
    acceptance: acceptanceReport
      ? {
          status: acceptanceReport.status || "",
          canSubmitAll: Boolean(acceptanceReport.canSubmitAll),
          generatedAt: acceptanceReport.generatedAt || "",
          summary: acceptanceReport.summary || {},
        }
      : null,
    deliveryReadiness: deliveryReport
      ? {
          status: deliveryReport.status || "",
          canDeliver: Boolean(deliveryReport.canDeliver),
          generatedAt: deliveryReport.generatedAt || "",
          summary: deliveryReport.summary || {},
        }
      : null,
    batchRun: runStateSelection.runState ? summarizeRunState(runStateSelection.runState) : null,
    systems,
    blockers,
    warnings,
    nextAction:
      status === "ready"
        ? "Deliver the latest whitepaper artifacts; delivery-readiness-report.json is ready."
        : status === "in-progress"
          ? "Run npm run delivery:check -- --systems <codes> to bind delivery readiness to the latest accepted batch report."
        : status === "ready-to-run"
          ? "Run npm run batch -- --systems <codes>, then consume repair:batch/repair:loop until delivery-readiness is ready."
          : "Resolve blockers, rerun the required pipeline or repair nodes, then rerun npm run real:check.",
  };
}

function renderRealRunReadinessMarkdown(report = {}) {
  const summary = report.summary || {};
  const systemRows = (report.systems || []).map((system) =>
    [
      mdCell(system.code),
      mdCell(system.status),
      mdCell(system.databaseProfileEnabled ? "yes" : "no"),
      mdCell(system.outputDir),
      mdCell(system.blockers?.map((item) => item.id).join(", ") || "-"),
    ].join(" | "),
  );
  const blockerRows = (report.blockers || []).map((item) =>
    [mdCell(item.severity), mdCell(item.systemCode || "-"), mdCell(item.id), mdCell(item.message)].join(" | "),
  );
  const warningRows = (report.warnings || []).map((item) =>
    [mdCell(item.systemCode || "-"), mdCell(item.id), mdCell(item.message)].join(" | "),
  );
  return [
    "# Real Run Readiness Report",
    "",
    `- Generated: ${report.generatedAt || ""}`,
    `- Status: ${report.status || ""}`,
    `- Can start real run: ${report.canStartRealRun ? "yes" : "no"}`,
    `- Can deliver: ${report.canDeliver ? "yes" : "no"}`,
    `- Systems ready to run: ${summary.readyToRun || 0}/${summary.systems || 0}`,
    `- Database-enabled systems: ${summary.databaseEnabled || 0}/${summary.systems || 0}`,
    `- Batch run: ${report.batchRun?.status || "-"}`,
    `- Acceptance: ${report.acceptance?.status || "-"}`,
    `- Delivery readiness: ${report.deliveryReadiness?.status || "-"}`,
    `- Next action: ${report.nextAction || ""}`,
    "",
    "## Systems",
    "",
    "| System | Status | DB enabled | Output | Blockers |",
    "| --- | --- | --- | --- | --- |",
    systemRows.length ? systemRows.join("\n") : "| - | - | - | - | - |",
    "",
    "## Blockers",
    "",
    "| Severity | System | ID | Message |",
    "| --- | --- | --- | --- |",
    blockerRows.length ? blockerRows.join("\n") : "| - | - | - | - |",
    "",
    "## Warnings",
    "",
    "| System | ID | Message |",
    "| --- | --- | --- |",
    warningRows.length ? warningRows.join("\n") : "| - | - | - |",
    "",
  ].join("\n");
}

function writeRealRunReadinessReport(outputRoot, report) {
  const batchDir = path.join(outputRoot, "_batch");
  const jsonPath = path.join(batchDir, "real-run-readiness-report.json");
  const markdownPath = path.join(batchDir, "real-run-readiness-report.md");
  writeJson(jsonPath, report);
  fs.writeFileSync(markdownPath, renderRealRunReadinessMarkdown(report), "utf8");
  return {
    jsonPath,
    markdownPath,
    artifacts: {
      realRunReadinessJson: path.relative(batchDir, jsonPath).replace(/\\/g, "/"),
      realRunReadinessMarkdown: path.relative(batchDir, markdownPath).replace(/\\/g, "/"),
    },
  };
}

function buildRealRunReadinessStateSummary(report = {}, artifacts = {}) {
  return {
    status: report.status || "",
    canStartRealRun: Boolean(report.canStartRealRun),
    canDeliver: Boolean(report.canDeliver),
    summary: report.summary || {},
    batchRun: report.batchRun || null,
    acceptance: report.acceptance || null,
    deliveryReadiness: report.deliveryReadiness || null,
    artifacts: artifacts.artifacts || artifacts || {},
    generatedAt: report.generatedAt || "",
    nextAction: report.nextAction || "",
  };
}

function runRealRunReadiness(options = {}) {
  const args = options.args || parseArgs(process.argv.slice(2));
  const context = options.context || loadRealRunContext({ ...options, ...args });
  const report = buildRealRunReadinessReport({
    ...options,
    args,
    context,
  });
  const artifacts = writeRealRunReadinessReport(context.outputRoot, report);
  return {
    report,
    artifacts,
    state: buildRealRunReadinessStateSummary(report, artifacts),
  };
}

function main() {
  const { report } = runRealRunReadiness();
  console.log(
    `Real run readiness: status=${report.status}, canStart=${report.canStartRealRun}, canDeliver=${report.canDeliver}`,
  );
  if (report.status === "blocked") {
    console.error(report.blockers.map((item) => `${item.id}: ${item.message}`).join("\n"));
    process.exit(2);
  }
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
  buildRealRunReadinessReport,
  buildRealRunReadinessStateSummary,
  loadRealRunContext,
  renderRealRunReadinessMarkdown,
  runRealRunReadiness,
  selectSystems,
  writeRealRunReadinessReport,
};
