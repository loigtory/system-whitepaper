#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { parseArgs, readRequiredJsonObject, writeJson } = require("./system-whitepaper-lib");

function hasAny(markdown, patterns) {
  return patterns.some((pattern) => pattern.test(markdown));
}

function buildNarrativeQualityReport(input = {}) {
  const markdown = String(input.markdown || "");
  const evidenceSummary = input.evidenceSummary || {};
  const failures = [];
  const warnings = [];
  const text = markdown.replace(/\s+/g, "");

  if (text.length < Number(input.minChars || 600)) {
    failures.push("待审稿篇幅过短，可能仍是机械摘要，需重新执行写稿。");
  }

  if (!hasAny(markdown, [/系统定位/, /系统概览/, /系统概述/, /业务定位/])) {
    failures.push("待审稿缺少系统定位或系统概览说明。");
  }

  if (!hasAny(markdown, [/典型业务流程/, /业务流程/, /流程说明/, /场景流程/])) {
    failures.push("待审稿缺少典型业务流程说明。");
  }

  if (!hasAny(markdown, [/证据/, /截图/, /本次取证/, /待确认/, /菜单/])) {
    warnings.push("待审稿较少体现证据边界，建议补充截图、菜单或待确认说明。");
  }

  const pages = Array.isArray(evidenceSummary.pages) ? evidenceSummary.pages : [];
  const evidencePageCount =
    pages.length || Number(evidenceSummary.metrics?.counts?.pages || 0);
  return {
    artifactType: "narrative-quality-report",
    version: 1,
    canSubmitReview: failures.length === 0,
    failures,
    warnings,
    counts: {
      chars: text.length,
      evidencePages: evidencePageCount,
    },
  };
}

function assertValidNarrativeQualityReportArtifact(report = {}) {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("narrative-quality-report.json must be a JSON object.");
  }
  if (report.artifactType !== "narrative-quality-report") {
    throw new Error("narrative-quality-report.json artifactType must be narrative-quality-report.");
  }
  if (typeof report.canSubmitReview !== "boolean") {
    throw new Error("narrative-quality-report.json canSubmitReview must be a boolean.");
  }
  if (!report.counts || typeof report.counts !== "object" || Array.isArray(report.counts)) {
    throw new Error("narrative-quality-report.json counts must be a JSON object.");
  }
  if (!Number.isFinite(Number(report.counts.chars))) {
    throw new Error("narrative-quality-report.json counts.chars must be numeric.");
  }
  if (!Number.isFinite(Number(report.counts.evidencePages))) {
    throw new Error("narrative-quality-report.json counts.evidencePages must be numeric.");
  }
  if (!Array.isArray(report.failures)) {
    throw new Error("narrative-quality-report.json failures must be an array.");
  }
  if (report.warnings !== undefined && !Array.isArray(report.warnings)) {
    throw new Error("narrative-quality-report.json warnings must be an array when present.");
  }
  if (Number(report.counts.chars) < 0 || Number(report.counts.evidencePages) < 0) {
    throw new Error("narrative-quality-report.json counts must not be negative.");
  }
  if (report.canSubmitReview && report.failures.length > 0) {
    throw new Error("narrative-quality-report.json canSubmitReview=true requires zero failures.");
  }
  if (report.canSubmitReview && Number(report.counts.chars) === 0) {
    throw new Error("narrative-quality-report.json canSubmitReview=true requires non-empty markdown chars.");
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

function buildNarrativeSourceArtifacts(input = {}) {
  const result = {};
  if (input.markdownPath) {
    result.pendingReview = {
      file: path.basename(input.markdownPath),
      fingerprint: fingerprintFile(input.markdownPath),
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

function runNarrativeCheck(options = {}) {
  const inputDir = path.resolve(String(options.inputDir || options.input || "."));
  const markdownPath =
    options.markdownPath || path.join(inputDir, "whitepaper.pending-review.md");
  const summaryPath = options.evidenceSummaryPath || path.join(inputDir, "evidence-summary.json");
  const outputPath = options.outputPath || path.join(inputDir, "narrative-quality-report.json");

  if (!fs.existsSync(markdownPath)) {
    const report = {
      artifactType: "narrative-quality-report",
      version: 1,
      canSubmitReview: false,
      failures: [`Pending review markdown not found: ${markdownPath}`],
      warnings: [],
      counts: { chars: 0, evidencePages: 0 },
      sourceArtifacts: buildNarrativeSourceArtifacts({ markdownPath, evidenceSummaryPath: summaryPath }),
    };
    writeJson(outputPath, report);
    return report;
  }

  const markdown = fs.readFileSync(markdownPath, "utf8");
  const evidenceSummary = fs.existsSync(summaryPath)
    ? readRequiredJsonObject(summaryPath, { label: "Evidence summary" })
    : {};
  const report = {
    ...buildNarrativeQualityReport({ markdown, evidenceSummary }),
    sourceArtifacts: buildNarrativeSourceArtifacts({ markdownPath, evidenceSummaryPath: summaryPath }),
  };
  writeJson(outputPath, report);
  return report;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    throw new Error("Usage: node scripts/check-narrative.js --input outputs/system");
  }
  const report = runNarrativeCheck({ inputDir: args.input });
  console.log(`Narrative quality report written: ${path.join(path.resolve(args.input), "narrative-quality-report.json")}`);
  if (!report.canSubmitReview) {
    console.error(report.failures.join("\n"));
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
  assertValidNarrativeQualityReportArtifact,
  buildNarrativeQualityReport,
  buildNarrativeSourceArtifacts,
  fingerprintFile,
  runNarrativeCheck,
};
