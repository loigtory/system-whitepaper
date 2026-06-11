#!/usr/bin/env node

const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const {
  buildQualityReport,
  computeEvidenceMetrics,
  parseArgs,
  readOptionalJsonObject,
  readRequiredJsonObject,
  writeJson,
} = require("./system-whitepaper-lib");
const {
  assertValidOperationGuideGateArtifact,
  assertValidOperationSpecArtifact,
} = require("./operation-spec/lib");

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

function buildQualitySourceArtifacts(input = {}) {
  const result = {};
  if (input.evidencePath) {
    result.evidence = {
      file: path.basename(input.evidencePath),
      fingerprint: fingerprintFile(input.evidencePath),
    };
  }
  if (input.operationGuideGatePath) {
    result.operationGuideGate = {
      file: path.basename(input.operationGuideGatePath),
      fingerprint: fingerprintFile(input.operationGuideGatePath),
    };
  }
  if (input.operationSpecPath) {
    result.operationSpec = {
      file: path.basename(input.operationSpecPath),
      fingerprint: fingerprintFile(input.operationSpecPath),
    };
  }
  if (input.evidenceSummaryPath) {
    result.evidenceSummary = {
      file: path.basename(input.evidenceSummaryPath),
      fingerprint: fingerprintFile(input.evidenceSummaryPath),
    };
  }
  return result;
}

function readOperationGuideGate(gatePath) {
  if (!fs.existsSync(gatePath)) return null;
  return readRequiredJsonObject(gatePath, { label: "Operation guide gate" });
}

function readOperationSpec(specPath) {
  if (!fs.existsSync(specPath)) return null;
  return readRequiredJsonObject(specPath, { label: "Operation spec" });
}

function hasRecoveredExplorationEvidence(operationSpec = null, evidenceSummary = null) {
  if (operationSpec?.gate?.canComposeGuide) return true;
  if (Number(operationSpec?.metrics?.moduleCount || 0) > 0 && Number(operationSpec?.metrics?.screenshotCount || 0) > 0) {
    return true;
  }
  const summaryCounts = evidenceSummary?.metrics?.counts || {};
  if (Number(summaryCounts.pages || 0) > 0) return true;
  if (Array.isArray(evidenceSummary?.screenshots) && evidenceSummary.screenshots.length > 0) return true;
  return false;
}

function isInitialPlaywrightBlocker(item = {}) {
  return /尚未执行\s*Playwright\s*页面探索/i.test(String(item.reason || item.message || ""));
}

function filterObsoleteQualityBlockedItems(blockedItems = [], operationSpec = null, evidenceSummary = null) {
  const items = Array.isArray(blockedItems) ? blockedItems : [];
  if (!hasRecoveredExplorationEvidence(operationSpec, evidenceSummary)) return items;
  return items.filter((item) => !isInitialPlaywrightBlocker(item));
}

function assertValidQualityReportArtifact(report = {}) {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("quality-report.json must be a JSON object.");
  }
  if (report.artifactType !== "quality-report") {
    throw new Error("quality-report.json artifactType must be quality-report.");
  }
  if (typeof report.canFinalize !== "boolean") {
    throw new Error("quality-report.json canFinalize must be a boolean.");
  }
  for (const key of [
    "menuCoverage",
    "corePageScreenshotCoverage",
    "coreFunctionClassificationCoverage",
    "writeOperationSafetyCompliance",
    "unverifiedContentLabeling",
    "coreConclusionTraceability",
  ]) {
    if (!Number.isFinite(Number(report[key]))) {
      throw new Error(`quality-report.json ${key} must be numeric.`);
    }
  }
  if (!Array.isArray(report.failures)) {
    throw new Error("quality-report.json failures must be an array.");
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputDir = args.input;

  if (!inputDir) {
    throw new Error("Usage: node scripts/check-quality.js --input outputs/system");
  }

  const evidencePath = path.join(inputDir, "evidence.json");
  const evidence = readRequiredJsonObject(evidencePath, { label: "Evidence file" });
  const evidenceSummaryPath = path.join(inputDir, "evidence-summary.json");
  const evidenceSummary = readOptionalJsonObject(evidenceSummaryPath);
  const gatePath = path.join(inputDir, "operation-guide-gate.json");
  const specPath = path.join(inputDir, "operation-spec.json");
  const operationSpec = readOperationSpec(specPath);

  const metrics = computeEvidenceMetrics(evidence);
  const report = buildQualityReport({
    ...metrics,
    blockedItems: filterObsoleteQualityBlockedItems(evidence.blockedItems || [], operationSpec, evidenceSummary),
  });

  if (operationSpec) {
    try {
      assertValidOperationSpecArtifact(operationSpec);
    } catch (error) {
      report.canFinalize = false;
      report.failures.push(`operation-spec: ${error.message}`);
    }
  }
  const guideGate = readOperationGuideGate(gatePath);
  if (guideGate) {
    try {
      assertValidOperationGuideGateArtifact(guideGate, operationSpec);
    } catch (error) {
      report.canFinalize = false;
      report.failures.push(`operation-guide: ${error.message}`);
    }
    report.operationGuideGate = guideGate;
    report.canComposeGuide = Boolean(guideGate.canComposeGuide);
    if (!guideGate.canComposeGuide) {
      report.canFinalize = false;
      for (const failure of guideGate.failures || []) {
        report.failures.push(`operation-guide: ${failure}`);
      }
    }
  }

  const output = path.join(inputDir, "quality-report.json");
  writeJson(output, {
    ...report,
    counts: metrics.counts,
    sourceArtifacts: buildQualitySourceArtifacts({
      evidencePath,
      evidenceSummaryPath,
      operationSpecPath: specPath,
      operationGuideGatePath: gatePath,
    }),
  });
  console.log(`Quality report written: ${output}`);
  console.log(
    `Coverage: menus ${metrics.counts.visitedMenus}/${metrics.counts.coreMenus}, pages ${metrics.counts.pages}, actions ${metrics.counts.actions}`,
  );
  if (guideGate) {
    console.log(
      `Operation guide gate: readiness=${guideGate.readinessPercent}% canComposeGuide=${guideGate.canComposeGuide}`,
    );
  }

  if (!report.canFinalize) {
    console.error(report.failures.join("\n"));
    process.exit(2);
  }
}

module.exports = {
  assertValidQualityReportArtifact,
  buildQualitySourceArtifacts,
  fingerprintFile,
  filterObsoleteQualityBlockedItems,
  readOperationGuideGate,
  readOperationSpec,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
