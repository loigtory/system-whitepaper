#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { parseArgs, readRequiredJsonObject, writeJson } = require("./system-whitepaper-lib");

function hasAny(markdown, patterns) {
  return patterns.some((pattern) => pattern.test(markdown));
}

function operationSpecModuleNames(operationSpec = {}) {
  return (Array.isArray(operationSpec.modules) ? operationSpec.modules : [])
    .map((item) => String(item?.name || "").trim())
    .filter(Boolean);
}

function countPattern(markdown, pattern) {
  const matches = String(markdown || "").match(pattern);
  return matches ? matches.length : 0;
}

function buildNarrativeQualityReport(input = {}) {
  const markdown = String(input.markdown || "");
  const evidenceSummary = input.evidenceSummary || {};
  const operationSpec = input.operationSpec || {};
  const specModuleNames = operationSpecModuleNames(operationSpec);
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

  const h1Count = countPattern(markdown, /^#\s+/gm);
  if (h1Count > 1) {
    failures.push("待审稿包含多个一级标题，疑似混入旧片段标题或未完成组装。");
  }

  const forbiddenDraftPatterns = [
    [/叙事片段/, "待审稿包含“叙事片段”等中间产物标题，需重新成稿。"],
    [/functions\s*列表为空/i, "待审稿声称 functions 列表为空，需优先使用 operation-spec/verified-claims 重新成稿。"],
    [/无法撰写核心功能说明|无法对以下维度给出已验证描述/, "待审稿仍是占位式能力说明，未形成可审核业务白皮书。"],
    [/尚未执行\s*Playwright\s*页面探索/i, "待审稿引用了过期的 Playwright 未执行阻塞结论。"],
    [/quality\s*摘要[^。\n]*P0/i, "待审稿引用了过期的 quality P0 摘要。"],
    [/verified-claims（2026-05-25）/, "待审稿引用了过期 verified-claims 日期。"],
    [/模块级断言仅有一项/, "待审稿仍按旧 verified-claims 占位模块写作。"],
    [/本轮\s*evidence-summary\s*未包含可附录化的页面证据/, "待审稿附录未使用已有页面/截图证据。"],
  ];
  for (const [pattern, message] of forbiddenDraftPatterns) {
    if (pattern.test(markdown)) failures.push(message);
  }

  if (specModuleNames.length) {
    const coveredModules = specModuleNames.filter((name) => markdown.includes(name));
    const requiredCoverage = Math.min(
      specModuleNames.length,
      Math.max(2, Math.ceil(specModuleNames.length * 0.75)),
    );
    if (coveredModules.length < requiredCoverage) {
      failures.push(
        `待审稿未充分覆盖 operation-spec 业务模块：已覆盖 ${coveredModules.length}/${specModuleNames.length}，至少需要 ${requiredCoverage}。`,
      );
    }
    if (!specModuleNames.includes("本地") && /「本地」模块|模块名称\s*\|\s*证据状态/.test(markdown)) {
      failures.push("待审稿仍把旧占位模块「本地」作为业务模块，需按 operation-spec 模块重写。");
    }
    if (/functions\s*列表为空|不宜编造.*业务流程|无法确认.*业务流程/.test(markdown)) {
      failures.push("operation-spec 已包含模块/字段证据，待审稿不得退回到空功能占位叙述。");
    }
  }

  const uncertaintyCount = countPattern(markdown, /无法|尚未|不宜|未覆盖|需补采|证据不足|待确认/g);
  const uncertaintyLimit = Math.max(18, Math.floor(text.length / 220));
  if (uncertaintyCount > uncertaintyLimit) {
    failures.push(
      `待审稿不确定性表述过多（${uncertaintyCount}/${uncertaintyLimit}），疑似以待确认清单替代业务成稿。`,
    );
  }

  if (!hasAny(markdown, [/证据/, /截图/, /本次取证/, /待确认/, /菜单/])) {
    warnings.push("待审稿较少体现证据边界，建议补充截图、菜单或待确认说明。");
  }

  const pages = Array.isArray(evidenceSummary.pages) ? evidenceSummary.pages : [];
  const evidencePageCount =
    pages.length || Number(evidenceSummary.metrics?.counts?.pages || 0);
  const operationSpecScreenshotCount = (Array.isArray(operationSpec.modules) ? operationSpec.modules : [])
    .reduce((sum, item) => sum + (Array.isArray(item.screenshots) ? item.screenshots.length : 0), 0);
  return {
    artifactType: "narrative-quality-report",
    version: 1,
    canSubmitReview: failures.length === 0,
    failures,
    warnings,
    counts: {
      chars: text.length,
      evidencePages: Math.max(evidencePageCount, operationSpecScreenshotCount),
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
  if (input.operationSpecPath) {
    result.operationSpec = {
      file: path.basename(input.operationSpecPath),
      fingerprint: fingerprintFile(input.operationSpecPath),
    };
  }
  return result;
}

function runNarrativeCheck(options = {}) {
  const inputDir = path.resolve(String(options.inputDir || options.input || "."));
  const markdownPath =
    options.markdownPath || path.join(inputDir, "whitepaper.pending-review.md");
  const summaryPath = options.evidenceSummaryPath || path.join(inputDir, "evidence-summary.json");
  const operationSpecPath = options.operationSpecPath || path.join(inputDir, "operation-spec.json");
  const outputPath = options.outputPath || path.join(inputDir, "narrative-quality-report.json");

  if (!fs.existsSync(markdownPath)) {
    const report = {
      artifactType: "narrative-quality-report",
      version: 1,
      canSubmitReview: false,
      failures: [`Pending review markdown not found: ${markdownPath}`],
      warnings: [],
      counts: { chars: 0, evidencePages: 0 },
      sourceArtifacts: buildNarrativeSourceArtifacts({
        markdownPath,
        evidenceSummaryPath: summaryPath,
        operationSpecPath,
      }),
    };
    writeJson(outputPath, report);
    return report;
  }

  const markdown = fs.readFileSync(markdownPath, "utf8");
  const evidenceSummary = fs.existsSync(summaryPath)
    ? readRequiredJsonObject(summaryPath, { label: "Evidence summary" })
    : {};
  const operationSpec = fs.existsSync(operationSpecPath)
    ? readRequiredJsonObject(operationSpecPath, { label: "Operation spec" })
    : {};
  const report = {
    ...buildNarrativeQualityReport({ markdown, evidenceSummary, operationSpec }),
    sourceArtifacts: buildNarrativeSourceArtifacts({
      markdownPath,
      evidenceSummaryPath: summaryPath,
      operationSpecPath,
    }),
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
