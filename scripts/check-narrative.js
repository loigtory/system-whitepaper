#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
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
    canSubmitReview: failures.length === 0,
    failures,
    warnings,
    counts: {
      chars: text.length,
      evidencePages: evidencePageCount,
    },
  };
}

function runNarrativeCheck(options = {}) {
  const inputDir = path.resolve(String(options.inputDir || options.input || "."));
  const markdownPath =
    options.markdownPath || path.join(inputDir, "whitepaper.pending-review.md");
  const summaryPath = options.evidenceSummaryPath || path.join(inputDir, "evidence-summary.json");
  const outputPath = options.outputPath || path.join(inputDir, "narrative-quality-report.json");

  if (!fs.existsSync(markdownPath)) {
    const report = {
      canSubmitReview: false,
      failures: [`Pending review markdown not found: ${markdownPath}`],
      warnings: [],
      counts: { chars: 0, evidencePages: 0 },
    };
    writeJson(outputPath, report);
    return report;
  }

  const markdown = fs.readFileSync(markdownPath, "utf8");
  const evidenceSummary = fs.existsSync(summaryPath)
    ? readRequiredJsonObject(summaryPath, { label: "Evidence summary" })
    : {};
  const report = buildNarrativeQualityReport({ markdown, evidenceSummary });
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
  buildNarrativeQualityReport,
  runNarrativeCheck,
};
