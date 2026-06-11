const fs = require("node:fs");
const path = require("node:path");
const { readOptionalJsonObject } = require("./system-whitepaper-lib");
const {
  DEFAULT_THRESHOLD,
  assertValidTruthReadinessReportArtifact,
  buildTruthReadinessReport,
  findStaleReadinessSources,
  loadReadinessInputs,
  normalizeThreshold,
} = require("./check-truth-readiness");

function unique(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function readApprovalTruthReadiness(inputDir) {
  const reportPath = path.join(inputDir, "truth-readiness-report.json");
  if (!fs.existsSync(reportPath)) {
    throw new Error(`truth-readiness-report.json not found: ${reportPath}`);
  }
  let report = null;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  } catch (error) {
    throw new Error(`truth-readiness-report.json is malformed: ${error.message}`);
  }
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new Error(`truth-readiness-report.json must be a JSON object: ${reportPath}`);
  }
  try {
    assertValidTruthReadinessReportArtifact(report);
  } catch (error) {
    throw new Error(`truth-readiness-report.json is not a valid truth readiness artifact: ${error.message}`);
  }
  return { reportPath, report };
}

function approvalTruthScore(report = {}) {
  const score = Number(report.score);
  if (Number.isFinite(score)) return score;
  const scorePercent = Number(report.scorePercent);
  if (Number.isFinite(scorePercent)) return scorePercent / 100;
  return 0;
}

function normalizeSystemCode(value) {
  return String(value || "").trim();
}

function resolveExpectedApprovalSystem(inputDir, report = {}, options = {}) {
  const state = options.state || {};
  const evidenceSummary = readOptionalJsonObject(path.join(inputDir, "evidence-summary.json"), {});
  const databaseProfile = readOptionalJsonObject(path.join(inputDir, "database-profile.json"), {});
  const code =
    options.systemCode ||
    options.system ||
    state.code ||
    report.system?.code ||
    evidenceSummary.system?.code ||
    databaseProfile.system?.code ||
    "";
  const name =
    options.systemName ||
    state.name ||
    report.system?.name ||
    evidenceSummary.system?.name ||
    databaseProfile.system?.name ||
    "";
  return {
    code: normalizeSystemCode(code),
    name: String(name || "").trim(),
  };
}

function approvalRequiresDatabaseEvidence(report = {}, options = {}) {
  if (options.requireDatabaseEvidence !== undefined) return options.requireDatabaseEvidence;
  if (report.requirements?.databaseEvidenceRequired !== undefined) {
    return report.requirements.databaseEvidenceRequired;
  }
  if (report.gates?.database?.required !== undefined) return report.gates.database.required;
  return false;
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

function assertCurrentTruthReadiness(inputDir, report = {}, threshold, options = {}) {
  const current = buildTruthReadinessReport({
    artifacts: loadReadinessInputs(inputDir),
    threshold,
    requireDatabaseEvidence: approvalRequiresDatabaseEvidence(report, options),
    expectedSystem: resolveExpectedApprovalSystem(inputDir, report, options),
  });
  const score = approvalTruthScore(current);
  if (current.canSubmitReview === true && score >= threshold) {
    return current;
  }
  const blockers = currentTruthFailureSummary(current);
  throw new Error(
    [
      `Current truth readiness gate has not passed: ${path.join(inputDir, "truth-readiness-report.json")}`,
      `canSubmitReview=${Boolean(current.canSubmitReview)}`,
      `score=${Math.round(score * 1000) / 10}%`,
      `threshold=${Math.round(threshold * 1000) / 10}%`,
      blockers ? `blockers=${blockers}` : "",
      "rerun truth-readiness before approval",
    ]
      .filter(Boolean)
      .join("; "),
  );
}

function outputPathHasE2eSegment(inputDir) {
  return path
    .resolve(String(inputDir || ""))
    .split(/[\\/]+/)
    .some((part) => part.toLowerCase() === "_e2e");
}

function truthReadinessLooksLikeSmoke(report = {}) {
  const mode = String(report.mode || "").toLowerCase();
  if (mode.includes("smoke") || mode.includes("local-e2e")) return true;
  return (Array.isArray(report.improvementActions) ? report.improvementActions : []).some((item) =>
    /smoke|local-e2e|本地冒烟/i.test(`${item.id || ""} ${item.message || ""}`),
  );
}

function markdownLooksLikeSmoke(markdown = "") {
  const text = String(markdown || "");
  if (/local-e2e-smoke|smoke gate|smoke artifact/i.test(text)) return true;
  if (text.includes("\u672c\u5730\u5192\u70df") || text.includes("\u5192\u70df")) return true;
  if (text.includes("\u4e0d\u4ee3\u8868\u6700\u7ec8\u4e1a\u52a1\u767d\u76ae\u4e66")) return true;
  return /local-e2e-smoke|smoke gate|本地冒烟|冒烟|不代表最终业务白皮书|不代表最终业务白皮书内容/i.test(
    text,
  );
}

function readTextIfExists(filePath) {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  } catch {
    return "";
  }
}

function assertNotSmokeApproval(inputDir, reportPath, report = {}, options = {}) {
  if (options.allowSmokeTruthReadiness) return;
  const reasons = [];
  if (truthReadinessLooksLikeSmoke(report)) {
    reasons.push("truth-readiness-report.json is marked as smoke/local-e2e evidence");
  }
  if (outputPathHasE2eSegment(inputDir)) {
    reasons.push("input directory is under an _e2e smoke output");
  }
  const pendingMarkdown = readTextIfExists(path.join(inputDir, "whitepaper.pending-review.md"));
  if (markdownLooksLikeSmoke(pendingMarkdown)) {
    reasons.push("pending-review markdown contains smoke wording");
  }
  if (reasons.length) {
    throw new Error(
      [
        `Smoke truth readiness report cannot approve real delivery: ${reportPath}`,
        ...reasons,
        "run the real pipeline and truth-readiness before approval",
      ].join("; "),
    );
  }
}

function assertApprovalTruthReadiness(inputDir, options = {}) {
  const { reportPath, report } = readApprovalTruthReadiness(inputDir);
  assertNotSmokeApproval(inputDir, reportPath, report, options);
  const threshold = normalizeThreshold(options.threshold ?? report.threshold ?? DEFAULT_THRESHOLD);
  const score = approvalTruthScore(report);
  const blockers = Array.isArray(report.blockers)
    ? report.blockers.map((item) => item.id || item.message || "").filter(Boolean).join(", ")
    : "";
  if (report.canSubmitReview === true && score >= threshold) {
    const staleSources = findStaleReadinessSources(inputDir, report);
    if (!staleSources.length) {
      if (!options.allowSmokeTruthReadiness) {
        assertCurrentTruthReadiness(inputDir, report, threshold, options);
      }
      return report;
    }
    throw new Error(
      [
        `Truth readiness report is stale: ${reportPath}`,
        ...staleSources
          .slice(0, 6)
          .map((item) => `${item.key}${item.file ? `(${item.file})` : ""}: ${item.reason}`),
        staleSources.length > 6 ? `and ${staleSources.length - 6} more` : "",
        "rerun truth-readiness before approval",
      ]
        .filter(Boolean)
        .join("; "),
    );
  }
  throw new Error(
    [
      `Truth readiness gate has not passed: ${reportPath}`,
      `canSubmitReview=${Boolean(report.canSubmitReview)}`,
      `score=${Math.round(score * 1000) / 10}%`,
      `threshold=${Math.round(threshold * 1000) / 10}%`,
      blockers ? `blockers=${blockers}` : "",
    ]
      .filter(Boolean)
      .join("; "),
  );
}

module.exports = {
  approvalTruthScore,
  assertApprovalTruthReadiness,
  markdownLooksLikeSmoke,
  outputPathHasE2eSegment,
  readApprovalTruthReadiness,
  truthReadinessLooksLikeSmoke,
};
