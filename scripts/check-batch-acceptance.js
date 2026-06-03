#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  parseArgs,
  readOptionalJsonObject,
  writeJson,
} = require("./system-whitepaper-lib");
const {
  assertValidTruthReadinessReportArtifact,
  buildTruthReadinessReport,
  findStaleReadinessSources,
  isValidDatabaseProfile,
  loadReadinessInputs,
  normalizeThreshold,
  scanDatabaseProfileSafety,
} = require("./check-truth-readiness");

const DEFAULT_TARGET_TRUTH_SCORE_PERCENT = 95;
const ACCEPTED_BATCH_STATUSES = new Set(["success", "review-pending", "finalized"]);
const ACCEPTED_SYSTEM_STATUSES = new Set(["success", "review-pending", "finalized", "skipped"]);

function nowIso(value) {
  return value || new Date().toISOString();
}

function getBatchHelpers() {
  return require("./run-whitepaper-batch");
}

function splitCsv(value) {
  if (Array.isArray(value)) return value.flatMap((item) => splitCsv(item));
  if (value === undefined || value === null || value === true || value === false) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function percentFromReport(report = {}) {
  if (Number.isFinite(Number(report.scorePercent))) return Number(report.scorePercent);
  if (Number.isFinite(Number(report.score))) return Math.round(Number(report.score) * 1000) / 10;
  return 0;
}

function mdCell(value) {
  return String(value === undefined || value === null || value === "" ? "-" : value)
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|");
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

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function readTextIfExists(filePath) {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  } catch {
    return "";
  }
}

function truthReportLooksLikeSmoke(report = {}) {
  const mode = String(report.mode || "").toLowerCase();
  if (mode.includes("smoke") || mode.includes("local-e2e")) return true;
  return (Array.isArray(report.improvementActions) ? report.improvementActions : []).some((item) =>
    /smoke|local-e2e/i.test(`${item.id || ""} ${item.message || ""}`),
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

function isSafeDatabaseProfileForSystem(profile, system = {}) {
  return isValidDatabaseProfile(profile, system) && scanDatabaseProfileSafety(profile).pass === true;
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
  return /local-e2e-smoke|smoke gate|本地冒烟|冒烟|不代表最终业务白皮书|不代表最终业务白皮书内容/i.test(text);
}

function readBatchArtifact(outputRoot, fileName) {
  return readOptionalJsonObject(path.join(outputRoot, "_batch", fileName));
}

function generatedAtMatches(actual, expected) {
  return Boolean(actual && expected && String(actual) === String(expected));
}

function buildSystemAcceptance(system = {}, context = {}, options = {}) {
  const code = String(system.code || "").trim();
  const outputDir = path.join(context.outputRoot, code);
  const truthPath = path.join(outputDir, "truth-readiness-report.json");
  const factCheckPath = path.join(outputDir, "fact-check-report.json");
  const databaseProfilePath = path.join(outputDir, "database-profile.json");
  const pendingReviewPath = path.join(outputDir, "whitepaper.pending-review.md");
  const finalPath = path.join(outputDir, "whitepaper.final.md");
  const truth = readOptionalJsonObject(truthPath);
  const factCheck = readOptionalJsonObject(factCheckPath);
  const databaseProfile = readOptionalJsonObject(databaseProfilePath);
  const pendingMarkdown = readTextIfExists(pendingReviewPath);
  const finalMarkdown = readTextIfExists(finalPath);
  const targetTruthScorePercent = Number(options.targetTruthScorePercent || DEFAULT_TARGET_TRUTH_SCORE_PERCENT);
  const blockers = [];
  const warnings = [];
  const databaseProfileConfigured = Boolean(system.databaseProfile?.enabled);
  const whitepaperExists = fileExists(pendingReviewPath) || fileExists(finalPath);
  const smokeWhitepaper = markdownLooksLikeSmoke(pendingMarkdown) || markdownLooksLikeSmoke(finalMarkdown);
  let scorePercent = 0;
  let canSubmitReview = false;
  let canFinalize = false;
  let staleSources = [];
  let smokeTruth = false;
  let missingWritableClaimCount = null;
  let writableClaimCoverageRatio = null;
  let minWritableClaimCoverage = null;
  let databaseEvidenceAvailable = isSafeDatabaseProfileForSystem(databaseProfile, { code });
  let databaseProfileUnsafe = false;

  if (!truth) {
    blockers.push(
      blocker("truth-readiness.missing", "truth-readiness-report.json is missing or malformed.", {
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
        blocker("truth-readiness.invalid-artifact", "truth-readiness-report.json is not a valid truth readiness artifact.", {
          systemCode: code,
          rerunNodes: ["truth-readiness"],
        }),
      );
    }
    scorePercent = truthContractFailures.length ? 0 : percentFromReport(truth);
    canSubmitReview = truthContractFailures.length ? false : Boolean(truth.canSubmitReview);
    canFinalize = truthContractFailures.length ? false : Boolean(truth.canFinalize);
    staleSources = truthContractFailures.length ? [] : findStaleReadinessSources(outputDir, truth);
    smokeTruth = truthReportLooksLikeSmoke(truth);
    const requireDatabaseEvidence = truthContractFailures.length
      ? databaseProfileConfigured
      : truthRequiresDatabaseEvidence(truth, databaseProfileConfigured);
    const currentTruth = buildTruthReadinessReport({
      artifacts: loadReadinessInputs(outputDir),
      threshold: targetTruthScorePercent,
      requireDatabaseEvidence,
      expectedSystem: { code, name: system.name || "" },
    });
    const currentScorePercent = percentFromReport(currentTruth);
    const currentDatabaseProfileUnsafe = (Array.isArray(currentTruth.blockers) ? currentTruth.blockers : []).find(
      (item) => item.id === "database.profile-unsafe",
    );
    if (currentDatabaseProfileUnsafe) {
      databaseProfileUnsafe = true;
      blockers.push(
        blocker(
          "database.profile-unsafe",
          currentDatabaseProfileUnsafe.message || "database-profile.json is not safely redacted for Truth Pipeline use.",
          {
            systemCode: code,
            rerunNodes: currentDatabaseProfileUnsafe.rerunNodes || [
              "db-profile",
              "db-model",
              "truth-universe",
              "truth-claims",
              "truth-readiness",
            ],
          },
        ),
      );
    }
    scorePercent = Math.min(scorePercent, currentScorePercent);
    canSubmitReview = canSubmitReview && Boolean(currentTruth.canSubmitReview);
    canFinalize = canFinalize && Boolean(currentTruth.canFinalize);
    if (smokeTruth) {
      blockers.push(
        blocker("truth-readiness.smoke-report", "truth-readiness-report.json is marked as local smoke evidence.", {
          systemCode: code,
          rerunNodes: ["truth-readiness"],
        }),
      );
    }
    if (!truthContractFailures.length && truth.canSubmitReview !== true) {
      blockers.push(
        blocker("truth-readiness.not-submittable", "truth-readiness-report.json does not allow review submission.", {
          systemCode: code,
          rerunNodes: ["truth-readiness"],
        }),
      );
    }
    if (scorePercent < targetTruthScorePercent) {
      blockers.push(
        blocker(
          "truth-readiness.below-target",
          `Truth readiness score ${scorePercent}% is below ${targetTruthScorePercent}%.`,
          {
            systemCode: code,
            rerunNodes: ["truth-claims", "narrative", "fact-check", "quality", "truth-readiness"],
          },
        ),
      );
    }
    if (!currentTruth.canSubmitReview || currentScorePercent < targetTruthScorePercent) {
      const summary = currentTruthFailureSummary(currentTruth);
      blockers.push(
        blocker(
          "truth-readiness.current-gate-failed",
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
        blocker("truth-readiness.stale-sources", "truth-readiness source fingerprints are stale.", {
          systemCode: code,
          rerunNodes: ["truth-readiness"],
        }),
      );
    }
    const factMetrics = currentTruth.gates?.factCheck?.metrics || truth.gates?.factCheck?.metrics || factCheck?.metrics || {};
    missingWritableClaimCount = Number(factMetrics.missingWritableClaimCount || 0);
    writableClaimCoverageRatio = Number(factMetrics.writableClaimCoverageRatio);
    minWritableClaimCoverage = Number(factMetrics.minWritableClaimCoverage || 0.8);
    if (!Number.isFinite(writableClaimCoverageRatio)) {
      blockers.push(
        blocker("fact-check.coverage-metric-missing", "Writable claim coverage metric is missing.", {
          systemCode: code,
          rerunNodes: ["fact-check", "truth-readiness"],
        }),
      );
    } else if (writableClaimCoverageRatio < minWritableClaimCoverage) {
      blockers.push(
        blocker("fact-check.writable-coverage", "Writable claim coverage is below threshold.", {
          systemCode: code,
          rerunNodes: ["narrative", "fact-check", "quality", "truth-readiness"],
        }),
      );
    }
    if (missingWritableClaimCount > 0) {
      blockers.push(
        blocker("fact-check.missing-writable-claims", `${missingWritableClaimCount} writable claim(s) remain uncovered.`, {
          systemCode: code,
          rerunNodes: ["narrative", "fact-check", "quality", "truth-readiness"],
        }),
      );
    }
    databaseEvidenceAvailable = Boolean(
      currentTruth.gates?.database?.profileAvailable || isSafeDatabaseProfileForSystem(databaseProfile, { code }),
    );
  }

  if (!whitepaperExists) {
    blockers.push(
      blocker("whitepaper.missing", "No pending-review or final whitepaper Markdown exists.", {
        systemCode: code,
        rerunNodes: ["narrative", "fact-check", "quality", "truth-readiness"],
      }),
    );
  }
  if (smokeWhitepaper) {
    blockers.push(
      blocker("whitepaper.smoke-artifact", "Whitepaper Markdown contains local smoke wording.", {
        systemCode: code,
        rerunNodes: ["narrative", "fact-check", "quality", "truth-readiness"],
      }),
    );
  }

  if (databaseProfileConfigured && !databaseEvidenceAvailable && !databaseProfileUnsafe) {
    blockers.push(
      blocker("database.profile-missing", "databaseProfile.enabled=true but no redacted database evidence is available.", {
        systemCode: code,
        rerunNodes: ["db-profile", "db-model", "truth-universe", "truth-claims", "truth-readiness"],
      }),
    );
  } else if (!databaseProfileConfigured && !databaseEvidenceAvailable) {
    warnings.push(
      warning("database.profile-not-configured", "No redacted database evidence is available; acceptance relies on UI evidence.", {
        systemCode: code,
      }),
    );
  }

  return {
    code,
    name: system.name || "",
    status: blockers.length ? "blocked" : "accepted",
    accepted: blockers.length === 0,
    scorePercent,
    canSubmitReview,
    canFinalize,
    whitepaperExists,
    pendingReviewExists: fileExists(pendingReviewPath),
    finalExists: fileExists(finalPath),
    smokeEvidence: smokeTruth || smokeWhitepaper,
    databaseProfileConfigured,
    databaseEvidenceAvailable,
    missingWritableClaimCount,
    writableClaimCoverageRatio: Number.isFinite(writableClaimCoverageRatio) ? writableClaimCoverageRatio : null,
    minWritableClaimCoverage: Number.isFinite(minWritableClaimCoverage) ? minWritableClaimCoverage : null,
    staleSourceCount: staleSources.length,
    staleSources: staleSources.slice(0, 12),
    blockers,
    warnings,
  };
}

function buildBatchArtifactAcceptance(context = {}, systems = [], options = {}) {
  const outputRoot = context.outputRoot;
  const batchState = readBatchArtifact(outputRoot, "run-state.json");
  const diagnosis = readBatchArtifact(outputRoot, "diagnosis.json");
  const repairQueue = readBatchArtifact(outputRoot, "repair-queue.json");
  const repairClosure = readBatchArtifact(outputRoot, "repair-closure.json");
  const followUpPlan = readBatchArtifact(outputRoot, "repair-follow-up-plan.json");
  const followUpLoopState = readBatchArtifact(outputRoot, "repair-follow-up-loop-state.json");
  const blockers = [];
  const warnings = [];
  const targetCodes = new Set(systems.map((system) => String(system.code || "").trim()).filter(Boolean));

  if (!batchState) {
    blockers.push(blocker("batch.run-state-missing", "outputs/_batch/run-state.json is missing or malformed."));
  } else {
    const batchSystems = Array.isArray(batchState.systems) ? batchState.systems : [];
    const byCode = new Map(batchSystems.map((item) => [String(item.code || ""), item]));
    for (const code of targetCodes) {
      const item = byCode.get(code);
      if (!item) {
        blockers.push(blocker("batch.run-state-system-missing", `Batch run-state is missing target system ${code}.`, { systemCode: code }));
        continue;
      }
      if (item.runStatus !== "completed" || !ACCEPTED_SYSTEM_STATUSES.has(String(item.status || ""))) {
        blockers.push(blocker("batch.run-state-system-incomplete", `Batch run-state does not mark ${code} complete.`, { systemCode: code }));
      }
    }
    if (!ACCEPTED_BATCH_STATUSES.has(String(batchState.status || ""))) {
      const targetSystemsDone = [...targetCodes].every((code) => {
        const item = byCode.get(code);
        return item && item.runStatus === "completed" && ACCEPTED_SYSTEM_STATUSES.has(String(item.status || ""));
      });
      if (targetSystemsDone) {
        warnings.push(warning("batch.global-status-not-success", `Batch status is ${batchState.status || "unknown"}, but target systems are complete.`));
      } else {
        blockers.push(blocker("batch.not-success", `Batch status is ${batchState.status || "unknown"}, not success.`));
      }
    }
  }

  if (!diagnosis) {
    blockers.push(blocker("batch.diagnosis-missing", "outputs/_batch/diagnosis.json is missing or malformed."));
  } else {
    const diagnosisSystems = Array.isArray(diagnosis.systems) ? diagnosis.systems : [];
    const byCode = new Map(diagnosisSystems.map((item) => [String(item.code || ""), item]));
    for (const code of targetCodes) {
      const item = byCode.get(code);
      if (!item) {
        blockers.push(blocker("batch.diagnosis-system-missing", `Batch diagnosis is missing target system ${code}.`, { systemCode: code }));
      } else if (!item.ready) {
        blockers.push(blocker("batch.diagnosis-system-blocked", `Batch diagnosis marks ${code} as blocked.`, { systemCode: code }));
      }
      if (Number(item?.missingWritableClaimCount || 0) > 0) {
        blockers.push(
          blocker("batch.diagnosis-missing-writable-claims", `Batch diagnosis still reports missing writable claims for ${code}.`, {
            systemCode: code,
          }),
        );
      }
    }
  }

  let remainingRepairItems = 0;
  let remainingAgentWritingItems = 0;
  let remainingBlockedRepairItems = 0;
  if (!repairQueue) {
    blockers.push(blocker("batch.repair-queue-missing", "outputs/_batch/repair-queue.json is missing or malformed."));
  } else {
    const summary = repairQueue.summary || {};
    const items = Array.isArray(repairQueue.items) ? repairQueue.items : null;
    const targetItems = items
      ? items.filter((item) => targetCodes.has(String(item.systemCode || "")))
      : [];
    remainingRepairItems = items ? targetItems.length : Number(summary.total || 0);
    remainingAgentWritingItems = items
      ? targetItems.filter((item) => item.requiresAgentWriting || item.quotaImpact === "agent-writing").length
      : Number(summary.requiresAgentWriting || 0);
    remainingBlockedRepairItems = items
      ? targetItems.filter((item) => item.blockedReason || item.canAutoRun === false).length
      : Number(summary.blocked || 0);
    if (remainingRepairItems > 0) {
      blockers.push(blocker("batch.repair-queue-not-empty", "Batch repair queue is not empty."));
    }
    if (remainingAgentWritingItems > 0) {
      blockers.push(blocker("batch.repair-agent-writing-remaining", "Repair queue still requires Agent-writing quota."));
    }
    if (remainingBlockedRepairItems > 0) {
      blockers.push(blocker("batch.repair-blocked-remaining", "Repair queue still contains blocked items."));
    }
  }

  const repairClosureMatches =
    repairClosure &&
    generatedAtMatches(repairClosure.diagnosis?.generatedAt, diagnosis?.generatedAt) &&
    generatedAtMatches(repairClosure.repairQueue?.generatedAt, repairQueue?.generatedAt);
  if (repairClosure && repairClosure.status !== "passed" && (remainingRepairItems > 0 || repairClosureMatches)) {
    blockers.push(blocker("repair.closure-not-passed", "Repair closure is not passed while repair items remain."));
  } else if (repairClosure && repairClosure.status !== "passed") {
    warnings.push(warning("repair.closure-not-passed-stale", "Repair closure is not passed, but current repair queue is empty."));
  }

  const followUpMatches =
    followUpPlan &&
    generatedAtMatches(followUpPlan.source?.diagnosisGeneratedAt, diagnosis?.generatedAt) &&
    generatedAtMatches(followUpPlan.source?.repairQueueGeneratedAt, repairQueue?.generatedAt);
  if (followUpPlan && ["ready-to-run", "needs-agent-writing", "blocked"].includes(String(followUpPlan.status || ""))) {
    if (remainingRepairItems > 0 || followUpMatches) {
      blockers.push(blocker("repair.follow-up-not-complete", `Repair follow-up status is ${followUpPlan.status}.`));
    } else {
      warnings.push(warning("repair.follow-up-not-complete-stale", `Repair follow-up status is ${followUpPlan.status}, but current repair queue is empty.`));
    }
  }

  if (followUpLoopState && !["complete"].includes(String(followUpLoopState.status || ""))) {
    if (remainingRepairItems > 0) {
      blockers.push(blocker("repair.loop-not-complete", `Repair follow-up loop status is ${followUpLoopState.status}.`));
    } else {
      warnings.push(warning("repair.loop-not-complete-stale", `Repair follow-up loop status is ${followUpLoopState.status}, but current repair queue is empty.`));
    }
  }

  return {
    status: blockers.length ? "blocked" : "accepted",
    batchState: batchState
      ? {
          status: batchState.status || "",
          batchId: batchState.batchId || "",
          concurrency: Number(batchState.concurrency || 0),
          summary: batchState.summary || {},
          startedAt: batchState.startedAt || "",
          finishedAt: batchState.finishedAt || "",
        }
      : null,
    diagnosis: diagnosis
      ? {
          status: diagnosis.status || "",
          generatedAt: diagnosis.generatedAt || "",
          summary: diagnosis.summary || {},
        }
      : null,
    repairQueue: repairQueue
      ? {
          status: repairQueue.status || "",
          generatedAt: repairQueue.generatedAt || "",
          summary: repairQueue.summary || {},
          targetRemainingItems: remainingRepairItems,
          targetAgentWritingItems: remainingAgentWritingItems,
          targetBlockedItems: remainingBlockedRepairItems,
        }
      : null,
    repairClosure: repairClosure
      ? {
          status: repairClosure.status || "",
          generatedAt: repairClosure.generatedAt || "",
          blockers: repairClosure.blockers || [],
        }
      : null,
    followUpPlan: followUpPlan
      ? {
          status: followUpPlan.status || "",
          generatedAt: followUpPlan.generatedAt || "",
          summary: followUpPlan.summary || {},
          nextBestAction: followUpPlan.nextBestAction || "",
        }
      : null,
    followUpLoopState: followUpLoopState
      ? {
          status: followUpLoopState.status || "",
          startedAt: followUpLoopState.startedAt || "",
          finishedAt: followUpLoopState.finishedAt || "",
          rounds: Array.isArray(followUpLoopState.rounds) ? followUpLoopState.rounds.length : 0,
          reason: followUpLoopState.reason || "",
        }
      : null,
    blockers,
    warnings,
  };
}

function summarizeSystems(systems = []) {
  const scores = systems.map((item) => Number(item.scorePercent || 0)).filter((value) => Number.isFinite(value));
  return {
    total: systems.length,
    accepted: systems.filter((item) => item.accepted).length,
    blocked: systems.filter((item) => !item.accepted).length,
    minTruthScorePercent: scores.length ? Math.min(...scores) : 0,
    missingWritableClaims: systems.reduce((sum, item) => sum + Number(item.missingWritableClaimCount || 0), 0),
    staleSystems: systems.filter((item) => Number(item.staleSourceCount || 0) > 0).length,
    smokeEvidence: systems.filter((item) => item.smokeEvidence).length,
    databaseBacked: systems.filter((item) => item.databaseEvidenceAvailable).length,
    databaseConfigured: systems.filter((item) => item.databaseProfileConfigured).length,
    whitepapers: systems.filter((item) => item.whitepaperExists).length,
  };
}

function buildBatchAcceptanceReport(input = {}) {
  const args = input.args || {};
  const helpers = !input.context || !input.systems ? getBatchHelpers() : null;
  const context = input.context || helpers.loadBatchConfig(args.config || input.configPath);
  const threshold = normalizeThreshold(args.threshold || input.threshold || DEFAULT_TARGET_TRUTH_SCORE_PERCENT);
  const targetTruthScorePercent = Math.round(threshold * 1000) / 10;
  const systems = input.systems || helpers.selectBatchSystems(context.config, args);
  const systemReports = systems.map((system) =>
    buildSystemAcceptance(system, context, { targetTruthScorePercent }),
  );
  const batch = buildBatchArtifactAcceptance(context, systems, { targetTruthScorePercent });
  const blockers = [
    ...batch.blockers,
    ...systemReports.flatMap((item) => item.blockers),
  ];
  const warnings = [
    ...batch.warnings,
    ...systemReports.flatMap((item) => item.warnings),
  ];
  const summary = summarizeSystems(systemReports);
  const accepted = blockers.length === 0 && summary.accepted === summary.total && batch.status === "accepted";
  return {
    artifactType: "batch-acceptance-report",
    version: 1,
    generatedAt: nowIso(input.now),
    status: accepted ? "accepted" : "blocked",
    canSubmitAll: accepted,
    targetTruthScorePercent,
    configPath: context.configPath,
    outputRoot: context.outputRoot,
    summary: {
      ...summary,
      blockers: blockers.length,
      warnings: warnings.length,
    },
    batch,
    systems: systemReports,
    blockers,
    warnings,
  };
}

function renderBatchAcceptanceMarkdown(report = {}) {
  const summary = report.summary || {};
  const batch = report.batch || {};
  const rows = (report.systems || []).map((item) =>
    [
      mdCell(item.code),
      mdCell(item.status),
      mdCell(`${item.scorePercent}%`),
      mdCell(item.canSubmitReview ? "yes" : "no"),
      mdCell(item.whitepaperExists ? "yes" : "no"),
      mdCell(item.databaseEvidenceAvailable ? "yes" : "no"),
      mdCell(item.missingWritableClaimCount ?? "-"),
      mdCell(item.staleSourceCount || 0),
      mdCell(item.blockers?.map((blockerItem) => blockerItem.id).join(", ") || "-"),
    ].join(" | "),
  );
  const blockerRows = (report.blockers || []).map((item) =>
    [mdCell(item.severity), mdCell(item.systemCode || "-"), mdCell(item.id), mdCell(item.message)].join(" | "),
  );
  const warningRows = (report.warnings || []).map((item) =>
    [mdCell(item.systemCode || "-"), mdCell(item.id), mdCell(item.message)].join(" | "),
  );
  return [
    "# Batch Acceptance Report",
    "",
    `- Generated: ${report.generatedAt || ""}`,
    `- Status: ${report.status || ""}`,
    `- Can submit all: ${report.canSubmitAll ? "yes" : "no"}`,
    `- Target truth score: ${report.targetTruthScorePercent || DEFAULT_TARGET_TRUTH_SCORE_PERCENT}%`,
    `- Systems accepted: ${summary.accepted || 0}/${summary.total || 0}`,
    `- Minimum truth score: ${summary.minTruthScorePercent || 0}%`,
    `- Missing writable claims: ${summary.missingWritableClaims || 0}`,
    `- Stale systems: ${summary.staleSystems || 0}`,
    `- Database-backed systems: ${summary.databaseBacked || 0}/${summary.total || 0}`,
    `- Batch status: ${batch.batchState?.status || "-"}`,
    `- Repair queue items: ${batch.repairQueue?.summary?.total ?? "-"}`,
    "",
    "## Systems",
    "",
    "| System | Status | Truth | Submit | Whitepaper | DB evidence | Missing writable | Stale sources | Blockers |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    rows.length ? rows.join("\n") : "| - | - | - | - | - | - | - | - | - |",
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

function writeBatchAcceptanceReport(outputRoot, report) {
  const batchDir = path.join(outputRoot, "_batch");
  const jsonPath = path.join(batchDir, "acceptance-report.json");
  const markdownPath = path.join(batchDir, "acceptance-report.md");
  writeJson(jsonPath, report);
  fs.writeFileSync(markdownPath, renderBatchAcceptanceMarkdown(report), "utf8");
  return {
    jsonPath,
    markdownPath,
    artifacts: {
      acceptanceJson: path.relative(batchDir, jsonPath).replace(/\\/g, "/"),
      acceptanceMarkdown: path.relative(batchDir, markdownPath).replace(/\\/g, "/"),
    },
  };
}

function buildBatchAcceptanceStateSummary(report = {}, artifacts = {}) {
  return {
    status: report.status || "",
    canSubmitAll: Boolean(report.canSubmitAll),
    summary: report.summary || {},
    artifacts: artifacts.artifacts || artifacts || {},
    generatedAt: report.generatedAt || "",
  };
}

function runBatchAcceptance(options = {}) {
  const args = options.args || parseArgs(process.argv.slice(2));
  const context = options.context || getBatchHelpers().loadBatchConfig(args.config || options.configPath);
  const report = buildBatchAcceptanceReport({
    ...options,
    args,
    context,
  });
  const artifacts = writeBatchAcceptanceReport(context.outputRoot, report);
  return {
    report,
    artifacts,
    state: buildBatchAcceptanceStateSummary(report, artifacts),
  };
}

function runBatchAcceptanceCheck(options = {}) {
  return runBatchAcceptance(options).report;
}

function writeBatchAcceptanceStateSummary(outputRoot, report) {
  const artifacts = writeBatchAcceptanceReport(outputRoot, report);
  return buildBatchAcceptanceStateSummary(report, artifacts);
}

function main() {
  const { report } = runBatchAcceptance();
  console.log(
    `Batch acceptance: status=${report.status}, accepted=${report.summary.accepted}/${report.summary.total}, minTruth=${report.summary.minTruthScorePercent}%`,
  );
  if (report.status !== "accepted") {
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
  buildBatchAcceptanceStateSummary,
  buildBatchAcceptanceReport,
  buildBatchArtifactAcceptance,
  buildSystemAcceptance,
  renderBatchAcceptanceMarkdown,
  runBatchAcceptance,
  runBatchAcceptanceCheck,
  writeBatchAcceptanceStateSummary,
  writeBatchAcceptanceReport,
};
