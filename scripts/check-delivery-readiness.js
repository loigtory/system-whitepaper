#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  finalizeWhitepaperMarkdown,
  parseArgs,
  readOptionalJsonObject,
  writeJson,
} = require("./system-whitepaper-lib");
const { runBatchAcceptance } = require("./check-batch-acceptance");
const {
  assertValidTruthReadinessReportArtifact,
  buildTruthReadinessReport,
  findStaleReadinessSources,
  loadReadinessInputs,
  scanDatabaseProfileSafety,
} = require("./check-truth-readiness");
const { fingerprintFile, resolveDocxManifestPath } = require("./export-whitepaper-word");

const DEFAULT_TARGET_TRUTH_SCORE_PERCENT = 95;
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

function mdCell(value) {
  return String(value === undefined || value === null || value === "" ? "-" : value)
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|");
}

function percentFromReport(report = {}) {
  if (Number.isFinite(Number(report.scorePercent))) return Number(report.scorePercent);
  if (Number.isFinite(Number(report.score))) return Math.round(Number(report.score) * 1000) / 10;
  return 0;
}

function unique(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function blocker(id, message, extra = {}) {
  return {
    id,
    severity: extra.severity || "P0",
    systemCode: extra.systemCode || "",
    message,
    rerunNodes: Array.isArray(extra.rerunNodes) ? extra.rerunNodes : [],
  };
}

function warning(id, message, extra = {}) {
  return {
    id,
    systemCode: extra.systemCode || "",
    message,
  };
}

function outputPathHasE2eSegment(outputDir) {
  return path
    .resolve(String(outputDir || ""))
    .split(/[\\/]+/)
    .some((part) => part.toLowerCase() === "_e2e");
}

function truthReportLooksLikeSmoke(report = {}) {
  const mode = String(report.mode || "").toLowerCase();
  if (mode.includes("smoke") || mode.includes("local-e2e")) return true;
  return (Array.isArray(report.improvementActions) ? report.improvementActions : []).some((item) =>
    /smoke/i.test(`${item.id || ""} ${item.message || ""}`),
  );
}

function truthRequiresDatabaseEvidence(truth = {}, databaseProfileConfigured = false) {
  if (databaseProfileConfigured) return true;
  if (truth.requirements?.databaseEvidenceRequired !== undefined) {
    return truth.requirements.databaseEvidenceRequired;
  }
  if (truth.gates?.database?.required !== undefined) return truth.gates.database.required;
  return false;
}

function currentTruthHasSafeDatabaseProfile(currentTruth = {}) {
  return (
    currentTruth.gates?.database?.profileAvailable === true &&
    currentTruth.gates?.database?.profileSafety?.pass !== false
  );
}

function outputHasSafeDatabaseProfile(outputDir) {
  const profile = loadReadinessInputs(outputDir).databaseProfile?.value;
  return Boolean(
    profile &&
      typeof profile === "object" &&
      !Array.isArray(profile) &&
      profile.artifactType === "database-profile" &&
      scanDatabaseProfileSafety(profile).pass === true,
  );
}

function assertJsonObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

function assertArray(value, message) {
  if (!Array.isArray(value)) {
    throw new Error(message);
  }
}

function assertBoolean(value, message) {
  if (typeof value !== "boolean") {
    throw new Error(message);
  }
}

function assertFiniteNumber(value, message) {
  if (!Number.isFinite(Number(value))) {
    throw new Error(message);
  }
}

function assertValidDeliveryReadinessReportArtifact(report = {}) {
  assertJsonObject(report, "delivery-readiness-report.json must be a JSON object.");
  if (report.artifactType !== "delivery-readiness-report") {
    throw new Error("delivery-readiness-report.json artifactType must be delivery-readiness-report.");
  }
  assertFiniteNumber(report.version, "delivery-readiness-report.json version must be numeric.");
  if (!String(report.generatedAt || "").trim()) {
    throw new Error("delivery-readiness-report.json generatedAt must be present.");
  }
  if (!["ready", "blocked"].includes(String(report.status || ""))) {
    throw new Error("delivery-readiness-report.json status must be ready or blocked.");
  }
  assertBoolean(report.canDeliver, "delivery-readiness-report.json canDeliver must be a boolean.");
  assertFiniteNumber(report.targetTruthScorePercent, "delivery-readiness-report.json targetTruthScorePercent must be numeric.");
  assertJsonObject(report.acceptance, "delivery-readiness-report.json acceptance must be a JSON object.");
  assertJsonObject(report.summary, "delivery-readiness-report.json summary must be a JSON object.");
  assertArray(report.systems, "delivery-readiness-report.json systems must be an array.");
  assertArray(report.blockers, "delivery-readiness-report.json blockers must be an array.");
  assertArray(report.warnings, "delivery-readiness-report.json warnings must be an array.");

  const total = report.systems.length;
  const summaryTotal = Number(report.summary.total);
  if (Number.isFinite(summaryTotal) && summaryTotal !== total) {
    throw new Error("delivery-readiness-report.json summary.total must match systems length.");
  }
  if (report.status === "ready" && report.canDeliver !== true) {
    throw new Error("delivery-readiness-report.json status=ready requires canDeliver=true.");
  }
  if (report.canDeliver && report.status !== "ready") {
    throw new Error("delivery-readiness-report.json canDeliver=true requires status=ready.");
  }
  if (report.canDeliver) {
    if (total <= 0) {
      throw new Error("delivery-readiness-report.json canDeliver=true requires at least one system.");
    }
    if (report.blockers.length > 0 || Number(report.summary.blockers || 0) > 0) {
      throw new Error("delivery-readiness-report.json canDeliver=true requires zero blockers.");
    }
    if (report.acceptance.status !== "accepted" || report.acceptance.canSubmitAll !== true) {
      throw new Error("delivery-readiness-report.json canDeliver=true requires accepted batch acceptance.");
    }
    if (Number(report.summary.ready) !== total || Number(report.summary.blocked || 0) !== 0) {
      throw new Error("delivery-readiness-report.json canDeliver=true requires all systems ready.");
    }
    for (const system of report.systems) {
      assertJsonObject(system, "delivery-readiness-report.json systems[] must be JSON objects.");
      const ready = system.ready === true || system.status === "ready";
      if (!ready) {
        throw new Error("delivery-readiness-report.json canDeliver=true requires every system to be ready.");
      }
      if (system.accepted === false) {
        throw new Error("delivery-readiness-report.json canDeliver=true requires every system to be accepted.");
      }
      if (system.canSubmitReview === false) {
        throw new Error("delivery-readiness-report.json canDeliver=true requires every system canSubmitReview=true.");
      }
      if (Array.isArray(system.blockers) && system.blockers.length > 0) {
        throw new Error("delivery-readiness-report.json canDeliver=true requires system blockers to be empty.");
      }
    }
  }
}

function currentTruthFailureSummary(report = {}) {
  const blockers = Array.isArray(report.blockers)
    ? report.blockers.map((item) => item.id || item.message || "").filter(Boolean)
    : [];
  const failures = Object.values(report.gates || {})
    .flatMap((gate) => (Array.isArray(gate?.failures) ? gate.failures : []))
    .map(String)
    .filter(Boolean);
  return unique([...blockers, ...failures]).slice(0, 8).join(", ");
}

function currentTruthRerunNodes(report = {}) {
  const nodes = unique(
    (Array.isArray(report.blockers) ? report.blockers : []).flatMap((item) =>
      Array.isArray(item.rerunNodes) ? item.rerunNodes : [],
    ),
  );
  return nodes.length ? nodes : ["truth-readiness"];
}

function markdownLooksLikeSmoke(markdown = "") {
  const text = String(markdown || "");
  if (/local-e2e-smoke|smoke gate|smoke artifact/i.test(text)) return true;
  if (text.includes("\u672c\u5730\u5192\u70df") || text.includes("\u5192\u70df")) return true;
  if (text.includes("\u4e0d\u4ee3\u8868\u6700\u7ec8\u4e1a\u52a1\u767d\u76ae\u4e66")) return true;
  return /local-e2e-smoke|smoke gate|本地冒烟|不代表最终业务白皮书|不代表最终业务白皮书内容/i.test(
    String(markdown || ""),
  );
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

function resolvedPathKey(filePath) {
  const normalized = path.resolve(String(filePath || "")).replace(/\\/g, "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function sameResolvedPath(left, right) {
  return resolvedPathKey(left) === resolvedPathKey(right);
}

function sameFingerprint(left = {}, right = {}) {
  return (
    left?.exists === true &&
    right?.exists === true &&
    Number(left.size) === Number(right.size) &&
    String(left.sha256 || "") === String(right.sha256 || "")
  );
}

function resolveArtifactPath(outputDir, artifactPath = "") {
  const value = String(artifactPath || "").trim();
  if (!value) return "";
  return path.isAbsolute(value) ? value : path.join(outputDir, value);
}

function findDocxCandidate(outputDir, state = {}) {
  const stateDocx = resolveArtifactPath(outputDir, state?.artifacts?.docx);
  if (stateDocx) return stateDocx;
  try {
    return fs
      .readdirSync(outputDir)
      .filter((name) => /\.docx$/i.test(name))
      .map((name) => path.join(outputDir, name))
      .filter((filePath) => fs.statSync(filePath).isFile())
      .sort((left, right) => {
        const mtimeDelta = fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs;
        return mtimeDelta || path.basename(left).localeCompare(path.basename(right));
      })[0] || "";
  } catch {
    return "";
  }
}

function validateFinalDocx(outputDir, state = {}, finalPath = "") {
  const finalFingerprint = fingerprintFile(finalPath);
  if (!finalFingerprint.exists) {
    return { valid: false, docxPath: "", manifestPath: "", reason: "final-missing" };
  }
  const docxPath = findDocxCandidate(outputDir, state || {});
  if (!docxPath) {
    return { valid: false, docxPath: "", manifestPath: "", reason: "docx-missing" };
  }
  const docxFingerprint = fingerprintFile(docxPath);
  const manifestPath = resolveArtifactPath(outputDir, state?.artifacts?.docxManifest) || resolveDocxManifestPath(docxPath);
  if (!docxFingerprint.exists) {
    return { valid: false, docxPath, manifestPath, reason: "docx-missing" };
  }
  const manifest = readOptionalJsonObject(manifestPath);
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return { valid: false, docxPath, manifestPath, reason: "manifest-missing-or-malformed" };
  }
  if (manifest.artifactType !== "whitepaper-docx-manifest") {
    return { valid: false, docxPath, manifestPath, reason: "manifest-type-mismatch" };
  }
  if (!sameResolvedPath(manifest.output?.path, docxPath)) {
    return { valid: false, docxPath, manifestPath, reason: "manifest-output-path-mismatch" };
  }
  if (!sameResolvedPath(manifest.input?.path, finalPath)) {
    return { valid: false, docxPath, manifestPath, reason: "manifest-input-path-mismatch" };
  }
  if (!sameFingerprint(manifest.input?.fingerprint, finalFingerprint)) {
    return { valid: false, docxPath, manifestPath, reason: "final-fingerprint-stale" };
  }
  if (!sameFingerprint(manifest.output?.fingerprint, docxFingerprint)) {
    return { valid: false, docxPath, manifestPath, reason: "docx-fingerprint-stale" };
  }
  return { valid: true, docxPath, manifestPath, reason: "" };
}

function finalMatchesPendingReview(pendingMarkdown = "", finalMarkdown = "", options = {}) {
  return String(finalMarkdown || "") === finalizeWhitepaperMarkdown(pendingMarkdown, options);
}

function nodeStatus(state = {}, nodeId) {
  return state.nodes?.[nodeId]?.status || "missing";
}

function nodeIsComplete(state, nodeId, options = {}) {
  const status = nodeStatus(state, nodeId);
  if (status === "success") return true;
  return options.allowSkipped && status === "skipped";
}

function buildNodeStatusSummary(state = {}, databaseProfileConfigured = false) {
  const ids = [
    ...OPTIONAL_OR_SKIPPABLE_NODES,
    ...(databaseProfileConfigured ? DB_REQUIRED_NODES : []),
    ...REQUIRED_REAL_NODES,
  ];
  return Object.fromEntries(ids.map((nodeId) => [nodeId, nodeStatus(state, nodeId)]));
}

function collectNodeBlockers(state, systemReport = {}) {
  const blockers = [];
  const code = systemReport.code || "";
  for (const nodeId of REQUIRED_REAL_NODES) {
    if (!nodeIsComplete(state, nodeId)) {
      blockers.push(
        blocker(
          "delivery.node-not-success",
          `Required real pipeline node ${nodeId} is ${nodeStatus(state, nodeId)}.`,
          { systemCode: code, rerunNodes: [nodeId] },
        ),
      );
    }
  }
  for (const nodeId of OPTIONAL_OR_SKIPPABLE_NODES) {
    if (!nodeIsComplete(state, nodeId, { allowSkipped: true })) {
      blockers.push(
        blocker(
          "delivery.node-not-complete",
          `Pipeline node ${nodeId} is ${nodeStatus(state, nodeId)}; expected success or skipped.`,
          { systemCode: code, rerunNodes: [nodeId] },
        ),
      );
    }
  }
  if (systemReport.databaseProfileConfigured) {
    for (const nodeId of DB_REQUIRED_NODES) {
      if (!nodeIsComplete(state, nodeId)) {
        blockers.push(
          blocker(
            "delivery.database-node-not-success",
            `Database evidence is configured but node ${nodeId} is ${nodeStatus(state, nodeId)}.`,
            { systemCode: code, rerunNodes: [nodeId] },
          ),
        );
      }
    }
  }
  return blockers;
}

function buildSystemDeliveryReadiness(systemReport = {}, context = {}, options = {}) {
  const code = String(systemReport.code || "").trim();
  const outputDir = path.join(context.outputRoot || "", code);
  const state = readOptionalJsonObject(path.join(outputDir, "pipeline-state.json"));
  const reviewDecision = readOptionalJsonObject(path.join(outputDir, "review-decision.json"));
  const truth = readOptionalJsonObject(path.join(outputDir, "truth-readiness-report.json"));
  const pendingPath = path.join(outputDir, "whitepaper.pending-review.md");
  const finalPath = path.join(outputDir, "whitepaper.final.md");
  const pendingReviewExists = fileExists(pendingPath);
  const finalExists = fileExists(finalPath);
  const whitepaperExists = pendingReviewExists || finalExists;
  const pendingMarkdown = readTextIfExists(pendingPath);
  const finalMarkdown = readTextIfExists(finalPath);
  const docx = finalExists
    ? validateFinalDocx(outputDir, state || {}, finalPath)
    : { valid: false, docxPath: "", manifestPath: "", reason: "" };
  const targetTruthScorePercent = Number(
    options.targetTruthScorePercent || DEFAULT_TARGET_TRUTH_SCORE_PERCENT,
  );
  const blockers = [];
  const warnings = [];
  let staleSources = [];
  let scorePercent = 0;
  let canSubmitReview = false;
  let databaseEvidenceAvailable = false;
  const reviewApproved =
    state?.overallStatus === "finalized" ||
    state?.review?.status === "approved" ||
    reviewDecision?.status === "approved";

  if (!systemReport.accepted) {
    blockers.push(
      blocker("delivery.acceptance-system-blocked", "Batch acceptance did not accept this system.", {
        systemCode: code,
        rerunNodes: ["truth-readiness"],
      }),
    );
  }
  if (outputPathHasE2eSegment(outputDir)) {
    blockers.push(
      blocker("delivery.output-under-e2e", "System output is under an _e2e smoke directory, not a real delivery output.", {
        systemCode: code,
      }),
    );
  }
  if (!state) {
    blockers.push(
      blocker("delivery.pipeline-state-missing", "pipeline-state.json is missing or malformed.", {
        systemCode: code,
      }),
    );
  } else {
    blockers.push(...collectNodeBlockers(state, systemReport));
    if (String(state.overallStatus || "") !== "finalized") {
      warnings.push(
        warning(
          "delivery.pipeline-status-not-terminal",
          `Pipeline overallStatus is ${state.overallStatus || "unknown"}; expected finalized.`,
          { systemCode: code },
        ),
      );
    }
  }
  if (!truth) {
    blockers.push(
      blocker("delivery.truth-readiness-missing", "truth-readiness-report.json is missing or malformed.", {
        systemCode: code,
        rerunNodes: ["truth-readiness"],
      }),
    );
  } else {
    const truthContractFailures = [];
    try {
      assertValidTruthReadinessReportArtifact(truth);
    } catch (error) {
      truthContractFailures.push(error.message);
    }
    if (truthContractFailures.length) {
      blockers.push(
        blocker("delivery.truth-invalid-artifact", "truth-readiness-report.json is not a valid truth readiness artifact.", {
          systemCode: code,
          rerunNodes: ["truth-readiness"],
        }),
      );
    }
    const recordedScorePercent = truthContractFailures.length ? 0 : percentFromReport(truth);
    scorePercent = recordedScorePercent;
    canSubmitReview = truthContractFailures.length ? false : Boolean(truth.canSubmitReview);
    staleSources = truthContractFailures.length ? [] : findStaleReadinessSources(outputDir, truth);
    const requireDatabaseEvidence = truthContractFailures.length
      ? Boolean(systemReport.databaseProfileConfigured)
      : truthRequiresDatabaseEvidence(
          truth,
          Boolean(systemReport.databaseProfileConfigured),
        );
    const currentTruth = buildTruthReadinessReport({
      artifacts: loadReadinessInputs(outputDir),
      threshold: targetTruthScorePercent,
      requireDatabaseEvidence,
      expectedSystem: { code, name: systemReport.name || "" },
    });
    const currentScorePercent = percentFromReport(currentTruth);
    scorePercent = Math.min(recordedScorePercent, currentScorePercent);
    canSubmitReview = canSubmitReview && Boolean(currentTruth.canSubmitReview);
    databaseEvidenceAvailable = Boolean(
      currentTruthHasSafeDatabaseProfile(currentTruth) ||
        (!systemReport.databaseProfileConfigured &&
          systemReport.databaseEvidenceAvailable &&
          outputHasSafeDatabaseProfile(outputDir)),
    );
    if (truthReportLooksLikeSmoke(truth)) {
      blockers.push(
        blocker("delivery.smoke-truth-report", "truth-readiness-report.json is marked as local smoke evidence.", {
          systemCode: code,
        }),
      );
    }
    if (!truthContractFailures.length && (truth.canSubmitReview !== true || recordedScorePercent < targetTruthScorePercent)) {
      blockers.push(
        blocker(
          "delivery.truth-not-ready",
          `Truth readiness is not delivery-ready: canSubmitReview=${Boolean(truth.canSubmitReview)}, score=${recordedScorePercent}%.`,
          { systemCode: code, rerunNodes: ["truth-readiness"] },
        ),
      );
    }
    if (!currentTruth.canSubmitReview || currentScorePercent < targetTruthScorePercent) {
      const summary = currentTruthFailureSummary(currentTruth);
      blockers.push(
        blocker(
          "delivery.current-truth-gate-failed",
          [
            `Current truth readiness gate fails against latest artifacts: canSubmitReview=${Boolean(currentTruth.canSubmitReview)}, score=${currentScorePercent}%.`,
            summary ? `Reasons: ${summary}.` : "",
          ]
            .filter(Boolean)
            .join(" "),
          {
            systemCode: code,
            rerunNodes: currentTruthRerunNodes(currentTruth),
          },
        ),
      );
    }
    if (staleSources.length) {
      blockers.push(
        blocker("delivery.truth-readiness-stale-sources", "truth-readiness source fingerprints are stale.", {
          systemCode: code,
          rerunNodes: ["truth-readiness"],
        }),
      );
    }
  }
  if (markdownLooksLikeSmoke(pendingMarkdown)) {
    blockers.push(
      blocker("delivery.smoke-whitepaper", "Pending-review whitepaper contains local smoke wording.", {
        systemCode: code,
        rerunNodes: ["narrative", "fact-check", "quality", "truth-readiness"],
      }),
    );
  }
  if (markdownLooksLikeSmoke(finalMarkdown)) {
    blockers.push(
      blocker("delivery.smoke-whitepaper", "Final whitepaper contains local smoke wording.", {
        systemCode: code,
        rerunNodes: ["narrative", "fact-check", "quality", "truth-readiness"],
      }),
    );
  }
  if (!whitepaperExists) {
    blockers.push(
      blocker("delivery.whitepaper-missing", "No pending-review or final whitepaper Markdown exists.", {
        systemCode: code,
        rerunNodes: ["narrative", "fact-check", "quality", "truth-readiness"],
      }),
    );
  }
  if (!pendingReviewExists) {
    blockers.push(
      blocker("delivery.pending-review-missing", "Pending-review whitepaper Markdown is required for final approval traceability.", {
        systemCode: code,
        rerunNodes: ["narrative", "fact-check", "quality", "truth-readiness"],
      }),
    );
  }
  if (!finalExists) {
    blockers.push(
      blocker("delivery.final-missing", "Final whitepaper Markdown is required for delivery.", {
        systemCode: code,
        rerunNodes: ["review"],
      }),
    );
  }
  if (!reviewApproved) {
    blockers.push(
      blocker("delivery.review-not-approved", "Final delivery requires approved review state or review decision.", {
        systemCode: code,
        rerunNodes: ["review"],
      }),
    );
  }
  if (finalExists && !docx.valid) {
    blockers.push(
      blocker(
        "delivery.docx-not-current",
        `Final whitepaper exists but Word output is not bound to the current final Markdown: ${docx.reason || "unknown"}.`,
        { systemCode: code, rerunNodes: ["review"] },
      ),
    );
  }
  if (finalExists && pendingReviewExists && !finalMatchesPendingReview(pendingMarkdown, finalMarkdown, { systemName: systemReport.name || state?.name || "" })) {
    blockers.push(
      blocker(
        "delivery.final-not-approved-pending",
        "Final whitepaper differs from the approved pending-review markdown; rerun review approval to regenerate final and Word artifacts.",
        { systemCode: code, rerunNodes: ["review"] },
      ),
    );
  }

  return {
    code,
    name: systemReport.name || "",
    status: blockers.length ? "blocked" : "ready",
    ready: blockers.length === 0,
    accepted: Boolean(systemReport.accepted),
    scorePercent,
    canSubmitReview,
    whitepaperExists,
    pendingReviewExists,
    finalExists,
    docxExists: Boolean(docx.docxPath && fileExists(docx.docxPath)),
    docxManifestExists: Boolean(docx.manifestPath && fileExists(docx.manifestPath)),
    docxCurrent: Boolean(docx.valid),
    docxPath: docx.docxPath ? path.basename(docx.docxPath) : "",
    docxManifestPath: docx.manifestPath ? path.basename(docx.manifestPath) : "",
    databaseProfileConfigured: Boolean(systemReport.databaseProfileConfigured),
    databaseEvidenceAvailable,
    pipelineStatus: state?.overallStatus || "",
    nodeStatus: state ? buildNodeStatusSummary(state, Boolean(systemReport.databaseProfileConfigured)) : {},
    staleSourceCount: staleSources.length,
    staleSources: staleSources.slice(0, 12),
    smokeEvidence:
      Boolean(truth && truthReportLooksLikeSmoke(truth)) ||
      markdownLooksLikeSmoke(pendingMarkdown) ||
      markdownLooksLikeSmoke(finalMarkdown),
    blockers,
    warnings,
  };
}

function summarizeSystems(systems = []) {
  return {
    total: systems.length,
    ready: systems.filter((item) => item.ready).length,
    blocked: systems.filter((item) => !item.ready).length,
    accepted: systems.filter((item) => item.accepted).length,
    smokeEvidence: systems.filter((item) => item.smokeEvidence).length,
    whitepapers: systems.filter((item) => item.whitepaperExists).length,
    finalWhitepapers: systems.filter((item) => item.finalExists).length,
    docxCurrent: systems.filter((item) => item.docxCurrent).length,
    docxManifested: systems.filter((item) => item.docxManifestExists).length,
    staleSystems: systems.filter((item) => Number(item.staleSourceCount || 0) > 0).length,
    databaseBacked: systems.filter((item) => item.databaseEvidenceAvailable).length,
    databaseConfigured: systems.filter((item) => item.databaseProfileConfigured).length,
  };
}

function buildDeliveryReadinessReport(input = {}) {
  const acceptanceReport = input.acceptanceReport || {};
  const context = {
    configPath: acceptanceReport.configPath || input.configPath || "",
    outputRoot: acceptanceReport.outputRoot || input.outputRoot || "",
  };
  const targetTruthScorePercent = Number(
    input.targetTruthScorePercent || acceptanceReport.targetTruthScorePercent || DEFAULT_TARGET_TRUTH_SCORE_PERCENT,
  );
  const systems = (Array.isArray(acceptanceReport.systems) ? acceptanceReport.systems : []).map((system) =>
    buildSystemDeliveryReadiness(system, context, { targetTruthScorePercent }),
  );
  const blockers = systems.flatMap((system) => system.blockers);
  const warnings = systems.flatMap((system) => system.warnings);
  if (acceptanceReport.status !== "accepted" || !acceptanceReport.canSubmitAll) {
    blockers.unshift(
      blocker(
        "delivery.acceptance-not-accepted",
        "Batch acceptance is not accepted; delivery readiness cannot pass.",
      ),
    );
  }
  const summary = summarizeSystems(systems);
  const ready =
    blockers.length === 0 &&
    acceptanceReport.status === "accepted" &&
    acceptanceReport.canSubmitAll === true &&
    summary.ready === summary.total &&
    summary.total > 0;
  return {
    artifactType: "delivery-readiness-report",
    version: 1,
    generatedAt: nowIso(input.now),
    status: ready ? "ready" : "blocked",
    canDeliver: ready,
    targetTruthScorePercent,
    acceptance: {
      status: acceptanceReport.status || "",
      canSubmitAll: Boolean(acceptanceReport.canSubmitAll),
      generatedAt: acceptanceReport.generatedAt || "",
      summary: acceptanceReport.summary || {},
    },
    configPath: context.configPath,
    outputRoot: context.outputRoot,
    summary: {
      ...summary,
      blockers: blockers.length,
      warnings: warnings.length,
    },
    systems,
    blockers,
    warnings,
  };
}

function renderDeliveryReadinessMarkdown(report = {}) {
  const summary = report.summary || {};
  const rows = (report.systems || []).map((item) =>
    [
      mdCell(item.code),
      mdCell(item.status),
      mdCell(`${item.scorePercent}%`),
      mdCell(item.accepted ? "yes" : "no"),
      mdCell(item.pipelineStatus || "-"),
      mdCell(item.finalExists ? (item.docxCurrent ? "yes" : "no") : "-"),
      mdCell(item.databaseEvidenceAvailable ? "yes" : "no"),
      mdCell(item.smokeEvidence ? "yes" : "no"),
      mdCell(item.blockers?.map((blockerItem) => blockerItem.id).join(", ") || "-"),
    ].join(" | "),
  );
  const blockerRows = (report.blockers || []).map((item) =>
    [mdCell(item.severity), mdCell(item.systemCode || "-"), mdCell(item.id), mdCell(item.message)].join(" | "),
  );
  return [
    "# Delivery Readiness Report",
    "",
    `- Generated: ${report.generatedAt || ""}`,
    `- Status: ${report.status || ""}`,
    `- Can deliver: ${report.canDeliver ? "yes" : "no"}`,
    `- Target truth score: ${report.targetTruthScorePercent || DEFAULT_TARGET_TRUTH_SCORE_PERCENT}%`,
    `- Systems ready: ${summary.ready || 0}/${summary.total || 0}`,
    `- Final Word current: ${summary.docxCurrent || 0}/${summary.finalWhitepapers || 0}`,
    `- Smoke evidence: ${summary.smokeEvidence || 0}`,
    `- Database-backed systems: ${summary.databaseBacked || 0}/${summary.total || 0}`,
    `- Acceptance status: ${report.acceptance?.status || "-"}`,
    "",
    "## Systems",
    "",
    "| System | Status | Truth | Accepted | Pipeline | Word current | DB evidence | Smoke | Blockers |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    rows.length ? rows.join("\n") : "| - | - | - | - | - | - | - | - | - |",
    "",
    "## Blockers",
    "",
    "| Severity | System | ID | Message |",
    "| --- | --- | --- | --- |",
    blockerRows.length ? blockerRows.join("\n") : "| - | - | - | - |",
    "",
  ].join("\n");
}

function writeDeliveryReadinessReport(outputRoot, report) {
  const batchDir = path.join(outputRoot, "_batch");
  const jsonPath = path.join(batchDir, "delivery-readiness-report.json");
  const markdownPath = path.join(batchDir, "delivery-readiness-report.md");
  writeJson(jsonPath, report);
  fs.writeFileSync(markdownPath, renderDeliveryReadinessMarkdown(report), "utf8");
  return {
    jsonPath,
    markdownPath,
    artifacts: {
      deliveryReadinessJson: path.relative(batchDir, jsonPath).replace(/\\/g, "/"),
      deliveryReadinessMarkdown: path.relative(batchDir, markdownPath).replace(/\\/g, "/"),
    },
  };
}

function buildDeliveryReadinessStateSummary(report = {}, artifacts = {}) {
  return {
    status: report.status || "",
    canDeliver: Boolean(report.canDeliver),
    summary: report.summary || {},
    acceptance: report.acceptance || {},
    artifacts: artifacts.artifacts || artifacts || {},
    generatedAt: report.generatedAt || "",
  };
}

function runDeliveryReadiness(options = {}) {
  const args = options.args || parseArgs(process.argv.slice(2));
  const acceptanceResult =
    options.acceptanceResult ||
    (options.acceptanceReport
      ? { report: options.acceptanceReport }
      : runBatchAcceptance({
          ...options,
          args,
        }));
  const acceptanceReport = acceptanceResult.report || {};
  const report = buildDeliveryReadinessReport({
    ...options,
    acceptanceReport,
    targetTruthScorePercent: options.targetTruthScorePercent || args.threshold,
  });
  const artifacts = writeDeliveryReadinessReport(acceptanceReport.outputRoot || options.outputRoot, report);
  return {
    report,
    artifacts,
    state: buildDeliveryReadinessStateSummary(report, artifacts),
  };
}

function runDeliveryReadinessCheck(options = {}) {
  return runDeliveryReadiness(options);
}

function main() {
  const { report } = runDeliveryReadinessCheck();
  console.log(
    `Delivery readiness: status=${report.status}, ready=${report.summary.ready}/${report.summary.total}, smoke=${report.summary.smokeEvidence}`,
  );
  if (report.status !== "ready") {
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
  assertValidDeliveryReadinessReportArtifact,
  buildDeliveryReadinessReport,
  buildDeliveryReadinessStateSummary,
  buildSystemDeliveryReadiness,
  findDocxCandidate,
  renderDeliveryReadinessMarkdown,
  runDeliveryReadiness,
  runDeliveryReadinessCheck,
  truthReportLooksLikeSmoke,
  validateFinalDocx,
  writeDeliveryReadinessReport,
};
