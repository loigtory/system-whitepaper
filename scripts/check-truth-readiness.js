#!/usr/bin/env node

const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const { parseArgs, writeJson } = require("./system-whitepaper-lib");

const DEFAULT_THRESHOLD = 0.95;

const REQUIRED_ARTIFACTS = {
  quality: "quality-report.json",
  narrative: "narrative-quality-report.json",
  claims: "verified-claims.json",
  factCheck: "fact-check-report.json",
};

const OPTIONAL_ARTIFACTS = {
  evidenceSummary: "evidence-summary.json",
  functionUniverse: "function-universe.json",
  databaseProfile: "database-profile.json",
};

const CONTENT_ARTIFACTS = {
  pendingReview: "whitepaper.pending-review.md",
};

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function normalizeThreshold(value) {
  if (value === undefined || value === null || value === "") return DEFAULT_THRESHOLD;
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_THRESHOLD;
  return clamp01(number > 1 ? number / 100 : number);
}

function percent(value) {
  return Math.round(clamp01(value) * 1000) / 10;
}

function readJsonArtifact(filePath) {
  if (!fs.existsSync(filePath)) {
    return { status: "missing", value: null, error: "" };
  }
  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { status: "invalid", value: null, error: "Artifact must be a JSON object." };
    }
    return { status: "ok", value, error: "" };
  } catch (error) {
    return { status: "invalid", value: null, error: error.message };
  }
}

function fingerprintFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { exists: false, size: 0, mtimeMs: null, sha256: "" };
  }
  const buffer = fs.readFileSync(filePath);
  const stat = fs.statSync(filePath);
  return {
    exists: true,
    size: stat.size,
    mtimeMs: Math.round(stat.mtimeMs),
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
}

function readContentArtifact(filePath) {
  if (!fs.existsSync(filePath)) {
    return { status: "missing", value: null, error: "" };
  }
  return { status: "ok", value: null, error: "" };
}

function loadReadinessInputs(inputDir) {
  const dir = path.resolve(String(inputDir || "."));
  const result = {};
  for (const [key, fileName] of Object.entries(REQUIRED_ARTIFACTS)) {
    const filePath = path.join(dir, fileName);
    result[key] = {
      file: fileName,
      path: filePath,
      fingerprint: fingerprintFile(filePath),
      ...readJsonArtifact(filePath),
    };
  }
  for (const [key, fileName] of Object.entries(OPTIONAL_ARTIFACTS)) {
    const filePath = path.join(dir, fileName);
    result[key] = {
      file: fileName,
      path: filePath,
      fingerprint: fingerprintFile(filePath),
      ...readJsonArtifact(filePath),
    };
  }
  for (const [key, fileName] of Object.entries(CONTENT_ARTIFACTS)) {
    const filePath = path.join(dir, fileName);
    result[key] = {
      file: fileName,
      path: filePath,
      fingerprint: fingerprintFile(filePath),
      ...readContentArtifact(filePath),
    };
  }
  return result;
}

function buildReadinessSourceArtifacts(artifacts = {}) {
  return Object.fromEntries(
    Object.entries(artifacts).map(([key, artifact]) => [
      key,
      {
        file: artifact.file,
        status: artifact.status,
        error: artifact.error || "",
        fingerprint: artifact.fingerprint || { exists: false, size: 0, mtimeMs: null, sha256: "" },
      },
    ]),
  );
}

function normalizeSourceFingerprint(record = {}) {
  const fingerprint = record.fingerprint || {};
  return {
    exists: Boolean(fingerprint.exists),
    size: Number.isFinite(Number(fingerprint.size)) ? Number(fingerprint.size) : 0,
    sha256: String(fingerprint.sha256 || ""),
  };
}

function findStaleReadinessSources(inputDir, report = {}) {
  const recorded = report.sourceArtifacts;
  if (!recorded || typeof recorded !== "object" || Array.isArray(recorded)) {
    return [{ key: "sourceArtifacts", reason: "missing source artifact fingerprints" }];
  }
  const current = buildReadinessSourceArtifacts(loadReadinessInputs(inputDir));
  const keys = [...new Set([...Object.keys(current), ...Object.keys(recorded)])].sort();
  const stale = [];
  for (const key of keys) {
    const expected = recorded[key];
    const actual = current[key];
    if (!expected) {
      stale.push({ key, file: actual?.file || "", reason: "not recorded in report" });
      continue;
    }
    if (!actual) {
      stale.push({ key, file: expected.file || "", reason: "no longer part of readiness inputs" });
      continue;
    }
    if (String(expected.file || "") !== String(actual.file || "")) {
      stale.push({ key, file: actual.file || expected.file || "", reason: "file mapping changed" });
      continue;
    }
    if (String(expected.status || "") !== String(actual.status || "")) {
      stale.push({
        key,
        file: actual.file || expected.file || "",
        reason: `status changed from ${expected.status || "unknown"} to ${actual.status || "unknown"}`,
      });
      continue;
    }
    const expectedFingerprint = normalizeSourceFingerprint(expected);
    const actualFingerprint = normalizeSourceFingerprint(actual);
    if (!expectedFingerprint.sha256 && actualFingerprint.exists) {
      stale.push({ key, file: actual.file || expected.file || "", reason: "missing recorded sha256" });
      continue;
    }
    if (
      expectedFingerprint.exists !== actualFingerprint.exists ||
      expectedFingerprint.size !== actualFingerprint.size ||
      expectedFingerprint.sha256 !== actualFingerprint.sha256
    ) {
      stale.push({ key, file: actual.file || expected.file || "", reason: "content fingerprint changed" });
    }
  }
  return stale;
}

function blocker(id, severity, message, rerunNodes = []) {
  return { id, severity, message, rerunNodes };
}

function action(id, message, rerunNodes = []) {
  return { id, message, rerunNodes };
}

function buildEvidenceGate(artifact) {
  const value = artifact.value || {};
  const metricKeys = [
    "menuCoverage",
    "corePageScreenshotCoverage",
    "coreFunctionClassificationCoverage",
    "writeOperationSafetyCompliance",
    "unverifiedContentLabeling",
    "coreConclusionTraceability",
  ];
  const metrics = Object.fromEntries(metricKeys.map((key) => [key, clamp01(value[key])]));
  const score = metricKeys.length
    ? Math.min(...metricKeys.map((key) => metrics[key]))
    : 0;
  const failures = [];
  if (artifact.status !== "ok") {
    failures.push(`${artifact.file} is ${artifact.status}.`);
  }
  for (const failure of Array.isArray(value.failures) ? value.failures : []) {
    failures.push(String(failure));
  }
  const pass = artifact.status === "ok" && value.canFinalize === true && failures.length === 0;
  return {
    id: "evidence",
    label: "Evidence coverage and safety",
    pass,
    score,
    scorePercent: percent(score),
    metrics,
    counts: value.counts || {},
    failures,
  };
}

function buildClaimsGate(artifact) {
  const value = artifact.value || {};
  const metrics = value.metrics || {};
  const claimCount = Number(metrics.claimCount || 0);
  const writableClaimCount = Number(metrics.writableClaimCount || 0);
  const confirmedCount = Number(metrics.confirmedCount || 0);
  const inferredCount = Number(metrics.inferredCount || 0);
  const weakCount = Number(metrics.weakCount || 0);
  const hasWritableClaims = writableClaimCount > 0;
  const hasConfirmedOrInferred = confirmedCount + inferredCount > 0;
  const boundaryConfigured =
    value.rules?.lowConfidenceNotWritable === true && value.rules?.databaseOnlyNotConfirmed === true;
  const score =
    artifact.status === "ok"
      ? (hasWritableClaims ? 0.65 : 0) +
        (hasConfirmedOrInferred ? 0.2 : 0) +
        (boundaryConfigured ? 0.15 : 0)
      : 0;
  const failures = [];
  if (artifact.status !== "ok") failures.push(`${artifact.file} is ${artifact.status}.`);
  if (!hasWritableClaims) failures.push("No writable verified claims are available for body assertions.");
  if (!hasConfirmedOrInferred) failures.push("No confirmed or inferred claims are available.");
  const warnings = [];
  if (weakCount > 0) {
    warnings.push(`${weakCount} weak claim(s) must remain pending/unverified unless later confirmed.`);
  }
  return {
    id: "claims",
    label: "Verified writable claims",
    pass: artifact.status === "ok" && hasWritableClaims && hasConfirmedOrInferred,
    score: clamp01(score),
    scorePercent: percent(score),
    metrics: { claimCount, writableClaimCount, confirmedCount, inferredCount, weakCount },
    writableClaimIds: Array.isArray(value.writableClaimIds) ? value.writableClaimIds : [],
    failures,
    warnings,
  };
}

function buildFactCheckGate(artifact) {
  const value = artifact.value || {};
  const metrics = value.metrics || {};
  const supportedRatio = clamp01(metrics.supportedRatio ?? (value.canFinalize ? 1 : 0));
  const failures = [];
  if (artifact.status !== "ok") failures.push(`${artifact.file} is ${artifact.status}.`);
  for (const failure of Array.isArray(value.failures) ? value.failures : []) failures.push(String(failure));
  const warnings = Array.isArray(value.warnings) ? value.warnings.map(String) : [];
  return {
    id: "fact-check",
    label: "Fact-check against writable claims",
    pass: artifact.status === "ok" && value.canFinalize === true && failures.length === 0,
    score: supportedRatio,
    scorePercent: percent(supportedRatio),
    metrics: {
      claimCount: Number(metrics.claimCount || 0),
      checkedAssertions: Number(metrics.checkedAssertions || 0),
      supportedAssertions: Number(metrics.supportedAssertions || 0),
      supportedRatio,
    },
    failures,
    warnings,
  };
}

function buildNarrativeGate(artifact) {
  const value = artifact.value || {};
  const chars = Number(value.counts?.chars || 0);
  const evidencePages = Number(value.counts?.evidencePages || 0);
  const failures = [];
  if (artifact.status !== "ok") failures.push(`${artifact.file} is ${artifact.status}.`);
  for (const failure of Array.isArray(value.failures) ? value.failures : []) failures.push(String(failure));
  const warnings = Array.isArray(value.warnings) ? value.warnings.map(String) : [];
  const score =
    artifact.status === "ok"
      ? (value.canSubmitReview ? 0.8 : Math.min(0.6, chars / 1200)) +
        (evidencePages > 0 ? 0.2 : 0)
      : 0;
  return {
    id: "narrative",
    label: "Narrative business readability",
    pass: artifact.status === "ok" && value.canSubmitReview === true && failures.length === 0,
    score: clamp01(score),
    scorePercent: percent(score),
    counts: { chars, evidencePages },
    failures,
    warnings,
  };
}

function buildDatabaseGate(artifacts) {
  const profile = artifacts.databaseProfile || {
    status: "missing",
    file: OPTIONAL_ARTIFACTS.databaseProfile,
    value: null,
  };
  const universeArtifact = artifacts.functionUniverse || {
    status: "missing",
    file: OPTIONAL_ARTIFACTS.functionUniverse,
    value: null,
  };
  const universe = universeArtifact.value || {};
  const coverage = universe.coverage || {};
  const entityCount = Number(coverage.entityCount || 0);
  const linkedFunctionCount = Number(coverage.linkedFunctionCount || 0);
  const available = profile.status === "ok" || entityCount > 0;
  return {
    id: "database",
    label: "Redacted database evidence",
    pass: true,
    available,
    score: available ? 1 : 0,
    scorePercent: available ? 100 : 0,
    metrics: {
      entityCount,
      linkedFunctionCount,
      databaseProfileStatus: profile.status,
    },
    warnings: available
      ? []
      : ["No redacted database profile was available; UI evidence remains the primary truth source."],
  };
}

function collectBlockers(gates) {
  const blockers = [];
  if (!gates.evidence.pass) {
    blockers.push(
      blocker(
        "evidence.coverage-or-safety",
        "P0",
        "Evidence coverage, traceability, or write-operation safety gate did not pass.",
        ["collect", "inspect", "validate-write", "quality", "truth-readiness"],
      ),
    );
  }
  if (!gates.claims.pass) {
    blockers.push(
      blocker(
        "claims.missing-writable",
        "P0",
        "Verified writable claims are missing, so the narrative cannot assert business conclusions safely.",
        ["summary", "truth-universe", "truth-claims", "narrative", "fact-check", "quality", "truth-readiness"],
      ),
    );
  }
  if (!gates.factCheck.pass) {
    blockers.push(
      blocker(
        "fact-check.unsupported-assertions",
        "P0",
        "Pending-review whitepaper contains unsupported, weak, or unknown assertions.",
        ["narrative", "fact-check", "quality", "truth-readiness"],
      ),
    );
  }
  if (!gates.narrative.pass) {
    blockers.push(
      blocker(
        "narrative.quality",
        "P1",
        "Narrative quality gate did not pass for business readability or required sections.",
        ["narrative", "fact-check", "quality", "truth-readiness"],
      ),
    );
  }
  return blockers;
}

function buildImprovementActions(gates, blockers) {
  const actions = blockers.map((item) => action(item.id, item.message, item.rerunNodes));
  if (!gates.database.available) {
    actions.push(
      action(
        "database.optional-profile",
        "Add redacted test-database metadata when available to strengthen entity and status-field reasoning.",
        ["db-profile", "truth-universe", "truth-claims", "narrative", "fact-check", "quality", "truth-readiness"],
      ),
    );
  }
  if (gates.claims.warnings?.length) {
    actions.push(
      action(
        "claims.weak-boundary",
        "Keep weak/database-only claims in pending confirmations unless browser evidence confirms them.",
        ["narrative", "fact-check", "truth-readiness"],
      ),
    );
  }
  return actions;
}

function buildTruthReadinessReport(input = {}) {
  const threshold = normalizeThreshold(input.threshold);
  const artifacts = input.artifacts || {};
  const gates = {
    evidence: buildEvidenceGate(artifacts.quality || { status: "missing", file: REQUIRED_ARTIFACTS.quality }),
    claims: buildClaimsGate(artifacts.claims || { status: "missing", file: REQUIRED_ARTIFACTS.claims }),
    factCheck: buildFactCheckGate(
      artifacts.factCheck || { status: "missing", file: REQUIRED_ARTIFACTS.factCheck },
    ),
    narrative: buildNarrativeGate(
      artifacts.narrative || { status: "missing", file: REQUIRED_ARTIFACTS.narrative },
    ),
    database: buildDatabaseGate(artifacts),
  };
  const score =
    gates.evidence.score * 0.35 +
    gates.claims.score * 0.25 +
    gates.factCheck.score * 0.25 +
    gates.narrative.score * 0.15;
  const blockers = collectBlockers(gates);
  if (score < threshold) {
    blockers.push(
      blocker(
        "truth.score-below-threshold",
        "P0",
        `Truth readiness score ${percent(score)}% is below ${percent(threshold)}%.`,
        ["truth-claims", "narrative", "fact-check", "quality", "truth-readiness"],
      ),
    );
  }
  const canSubmitReview = blockers.length === 0 && score >= threshold;
  return {
    artifactType: "truth-readiness-report",
    version: 1,
    generatedAt: input.generatedAt || new Date().toISOString(),
    system: input.system || artifacts.evidenceSummary?.value?.system || artifacts.claims?.value?.system || null,
    threshold,
    score: clamp01(score),
    scorePercent: percent(score),
    canSubmitReview,
    canFinalize: canSubmitReview && gates.factCheck.pass && gates.evidence.pass,
    gates,
    blockers,
    improvementActions: buildImprovementActions(gates, blockers),
    sourceArtifacts: buildReadinessSourceArtifacts(artifacts),
  };
}

function runTruthReadinessCheck(options = {}) {
  const inputDir = path.resolve(String(options.inputDir || options.input || "."));
  const artifacts = loadReadinessInputs(inputDir);
  const report = buildTruthReadinessReport({
    artifacts,
    threshold: options.threshold,
  });
  const outputPath = options.outputPath || path.join(inputDir, "truth-readiness-report.json");
  writeJson(outputPath, report);
  return report;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    throw new Error("Usage: node scripts/check-truth-readiness.js --input outputs/system");
  }
  const report = runTruthReadinessCheck({
    inputDir: args.input,
    outputPath: args.output,
    threshold: args.threshold,
  });
  const outputPath = args.output || path.join(path.resolve(args.input), "truth-readiness-report.json");
  console.log(`Truth readiness report written: ${outputPath}`);
  console.log(`Truth readiness: ${report.scorePercent}% canSubmitReview=${report.canSubmitReview}`);
  if (!report.canSubmitReview) {
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
  DEFAULT_THRESHOLD,
  buildReadinessSourceArtifacts,
  buildTruthReadinessReport,
  findStaleReadinessSources,
  loadReadinessInputs,
  normalizeThreshold,
  runTruthReadinessCheck,
};
