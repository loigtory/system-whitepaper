#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  parseArgs,
  promotePendingReviewToFinal,
  readOptionalJsonObject,
  syncWhitepaperNamedArtifacts,
  writeJson,
} = require("./system-whitepaper-lib");
const {
  readPipelineStateSafe,
  updateNodeStatus,
  writePipelineState,
} = require("./pipeline-state");
const { exportWhitepaperWord } = require("./export-whitepaper-word");
const {
  assertApprovalTruthReadiness,
  truthReadinessLooksLikeSmoke,
} = require("./approval-guard");

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function appendNarrativeGuardNodes(nodes) {
  const result = [];
  for (const node of nodes || []) {
    result.push(node);
    if (node === "summary") {
      result.push("db-model", "truth-universe", "truth-claims", "business-process");
    }
    if (node === "db-profile") {
      result.push("db-model", "truth-universe", "truth-claims", "business-process");
    }
    if (node === "db-model") {
      result.push("truth-universe", "truth-claims", "business-process");
    }
    if (node === "truth-universe") {
      result.push("truth-claims", "business-process");
    }
    if (node === "truth-claims") {
      result.push("business-process");
    }
    if (node === "narrative") {
      result.push("fact-check");
    }
    if (node === "quality") {
      result.push("truth-readiness");
    }
  }
  if (result.some((node) => ["truth-claims", "business-process", "narrative", "fact-check"].includes(node))) {
    result.push("truth-readiness");
  }
  return unique(result);
}

function normalizeMatchText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function findAliasOccurrences(text, alias) {
  const positions = [];
  let fromIndex = 0;
  while (alias && fromIndex <= text.length) {
    const position = text.indexOf(alias, fromIndex);
    if (position < 0) break;
    positions.push({ position, end: position + alias.length });
    fromIndex = position + Math.max(1, alias.length);
  }
  return positions;
}

function inferTargetModules(comment, evidenceSummary = {}) {
  const text = normalizeMatchText(comment);
  if (!text) return [];

  const candidates = [];
  const addCandidate = (moduleName, alias) => {
    const normalizedModule = String(moduleName || "").trim();
    const normalizedAlias = normalizeMatchText(alias || normalizedModule);
    if (!normalizedModule || !normalizedAlias) return;
    candidates.push({ moduleName: normalizedModule, alias: normalizedAlias });
  };

  for (const module of Array.isArray(evidenceSummary.modules) ? evidenceSummary.modules : []) {
    addCandidate(module.name, module.name);
    addCandidate(module.name, module.entry);
  }
  for (const item of Array.isArray(evidenceSummary.functions) ? evidenceSummary.functions : []) {
    const moduleName = item.module || "";
    addCandidate(moduleName, moduleName);
    addCandidate(moduleName, item.name);
    addCandidate(moduleName, item.menuPath);
  }

  const matches = candidates.flatMap((item, index) =>
    item.alias.length >= 2
      ? findAliasOccurrences(text, item.alias).map((occurrence) => ({ ...item, ...occurrence, index }))
      : [],
  );
  const uncoveredMatches = matches.filter(
    (match) =>
      !matches.some(
        (other) =>
          other.moduleName !== match.moduleName &&
          other.alias.length > match.alias.length &&
          match.position >= other.position &&
          match.end <= other.end,
      ),
  );
  return unique(uncoveredMatches.sort((a, b) => a.index - b.index).map((item) => item.moduleName));
}

function isFunctionRewriteComment(comment) {
  const text = String(comment || "");
  const hasFunctionObject = /模块|功能|页面|字段|表单|按钮|弹窗/.test(text);
  const hasRewriteSignal = /说明|描述|文案|表达|不准确|不清楚|堆砌|修正|错误/.test(text);
  return hasFunctionObject && hasRewriteSignal;
}

function isNarrativeDescriptionGapComment(comment) {
  const text = String(comment || "");
  const hasUiObject = /模块|功能|页面|字段|表单|按钮|弹窗/.test(text);
  const hasDescriptionObject = /说明|描述|文案|表达|业务含义|业务说明|使用场景|用途|解释|流程|角色|权限|边界/.test(text);
  const hasGapSignal = /缺失|缺少|不全|遗漏|补充|不够|没有|未覆盖/.test(text);
  const hasExplicitEvidenceSignal = /证据|截图|采集|取证|漏采|没采|未采|没有采集|没有截图|无法打开|打不开/.test(text);
  return hasUiObject && hasDescriptionObject && hasGapSignal && !hasExplicitEvidenceSignal;
}

function isOverviewFlowGapComment(comment) {
  const text = String(comment || "");
  const hasOverviewObject = /系统定位|定位|总结|升华|流程|业务流程|角色|权限|边界/.test(text);
  const hasGapSignal = /缺失|缺少|不全|遗漏|补充|不够|没有|未覆盖|看不懂/.test(text);
  const hasExplicitEvidenceSignal = /证据|截图|采集|取证|漏采|没采|未采|没有采集|没有截图|无法打开|打不开/.test(text);
  return hasOverviewObject && hasGapSignal && !hasExplicitEvidenceSignal;
}

function buildOverviewFlowRewrite() {
  return {
    rewriteScope: "overview-flow",
    targetSections: ["1", "4"],
    instructions: "只重写系统概览和典型业务流程，强化业务定位、业务价值和证据边界，不重写整份白皮书。",
  };
}

function isEvidenceRefreshComment(comment) {
  const text = String(comment || "");
  if (!text) return false;
  if (/(不是|不需要|无需|不要|非).{0,8}补充?.{0,8}(证据|截图|采集|页面|菜单|弹窗|表单|字段)/.test(text)) {
    return false;
  }
  if (isNarrativeDescriptionGapComment(text)) return false;
  const hasEvidenceObject = /页面|截图|菜单|弹窗|表单|字段/.test(text);
  const hasMissingSignal = /遗漏|漏采|没采|未采|未覆盖|缺失|缺少|不全|没有采集|没有截图|无法打开|打不开/.test(text);
  const hasEvidenceSupplementSignal = /补充.*(证据|截图|采集|菜单|弹窗|表单|字段)|(证据|截图|采集|菜单|弹窗|表单|字段).*补充/.test(text);
  return hasEvidenceObject && (hasMissingSignal || hasEvidenceSupplementSignal);
}

function inferRerunNodes(comment) {
  const text = String(comment || "");
  const nodes = [];
  const needsEvidenceRefresh = isEvidenceRefreshComment(text);
  if (needsEvidenceRefresh) {
    nodes.push("collect", "inspect", "summary", "narrative");
  }
  if (!needsEvidenceRefresh && !isFunctionRewriteComment(text) && /弹窗|表单|字段/.test(text)) {
    nodes.push("inspect", "summary");
  }
  if (isFunctionRewriteComment(text) || /系统定位|总结|升华|业务|流程|看不懂|文案|表达/.test(text)) {
    nodes.push("narrative");
  }
  if (/质量|校验|检查|不通过/.test(text)) {
    nodes.push("quality");
  }
  if (!nodes.length) {
    nodes.push("narrative");
  }
  nodes.push("quality");
  return appendNarrativeGuardNodes(nodes);
}

function inferRewriteScope(comment, context = {}) {
  const text = String(comment || "");
  const targetModules = Array.isArray(context.targetModules) ? context.targetModules : [];
  if (isEvidenceRefreshComment(text)) {
    return {
      rewriteScope: "evidence-refresh",
      targetSections: [],
      instructions: "先补充缺失页面、截图、弹窗或字段证据，再重新生成叙事片段并执行质量检查。",
    };
  }
  if (targetModules.length) {
    return {
      rewriteScope: "function-sections",
      targetSections: ["2", "3"],
      instructions: `只重写模块「${targetModules.join("、")}」的模块概览和核心功能说明，修正业务用途与证据表述，不重写整份白皮书。`,
    };
  }
  if (isOverviewFlowGapComment(text)) {
    return buildOverviewFlowRewrite();
  }
  if (isFunctionRewriteComment(text)) {
    return {
      rewriteScope: "function-sections",
      targetSections: ["2", "3"],
      instructions: "只重写用户指出的模块的模块概览和核心功能说明，修正业务用途与证据表述，不重写整份白皮书。",
    };
  }
  if (/系统定位|定位|总结|升华|流程|业务流程|看不懂|文案|表达|业务/.test(text)) {
    return buildOverviewFlowRewrite();
  }
  return {
    rewriteScope: "narrative",
    targetSections: ["1", "2", "3", "4", "5", "6"],
    instructions: "在保留证据边界和附录生成逻辑的前提下，重新生成叙事片段。",
  };
}

function resolveReviewNarrativePart(rewriteScope, targetModules = []) {
  if (rewriteScope === "overview-flow") return "overview-flow";
  if (rewriteScope === "function-sections") {
    return targetModules.length ? targetModules.join(",") : "function-sections";
  }
  return "";
}

function buildReviewDecision(input = {}) {
  const status = String(input.status || input.decision || "").toLowerCase();
  const comment = String(input.comment || "").trim();
  if (!["approved", "rejected"].includes(status)) {
    throw new Error("Review decision must be approved or rejected.");
  }
  if (status === "rejected" && !comment) {
    throw new Error("审核不通过时必须填写审核意见。");
  }
  const targetModules =
    status === "rejected" ? inferTargetModules(comment, input.evidenceSummary || {}) : [];
  const rewrite =
    status === "rejected" ? inferRewriteScope(comment, { targetModules }) : {};
  const rerunNodes = status === "rejected" ? inferRerunNodes(comment) : [];
  return {
    status,
    comment,
    rerunNodes,
    rewriteScope: rewrite.rewriteScope || "",
    targetSections: rewrite.targetSections || [],
    targetModules,
    narrativePart: resolveReviewNarrativePart(rewrite.rewriteScope || "", targetModules),
    instructions: rewrite.instructions || "",
    decidedAt: new Date().toISOString(),
  };
}

function runReviewDecision(options = {}) {
  const inputDir = path.resolve(String(options.inputDir || options.input || "."));
  const evidenceSummary =
    options.evidenceSummary ||
    readOptionalJsonObject(path.join(inputDir, "evidence-summary.json"), {});
  let decision = buildReviewDecision({ ...options, evidenceSummary });

  const statePath = path.join(inputDir, "pipeline-state.json");
  const state = readPipelineStateSafe(statePath);

  if (decision.status === "approved") {
    const pendingPath = path.join(inputDir, "whitepaper.pending-review.md");
    const finalPath = path.join(inputDir, "whitepaper.final.md");
    if (!fs.existsSync(pendingPath)) {
      throw new Error(`Pending review markdown not found: ${pendingPath}`);
    }
    assertApprovalTruthReadiness(inputDir, { ...options, state });
    promotePendingReviewToFinal(pendingPath, finalPath, {
      systemName: options.systemName || state?.name,
    });
    const named = syncWhitepaperNamedArtifacts({
      systemOutput: inputDir,
      systemName: options.systemName || state?.name,
      date: options.date,
    });
    const word = exportWhitepaperWord({
      inputPath: finalPath,
      systemName: options.systemName || state?.name,
      date: options.date,
    });
    decision = {
      ...decision,
      finalPath,
      displayFinalPath: named.final ? path.join(inputDir, named.final) : "",
      displayPendingPath: named.pendingReview ? path.join(inputDir, named.pendingReview) : "",
      docxPath: word.outputPath,
      docxManifestPath: word.manifestPath,
    };
  }

  const decisionPath = options.outputPath || path.join(inputDir, "review-decision.json");
  writeJson(decisionPath, decision);

  if (state) {
    let next = {
      ...state,
      artifacts: {
        ...state.artifacts,
        pendingReview: decision.displayPendingPath
          ? path.basename(decision.displayPendingPath)
          : state.artifacts?.pendingReview || "whitepaper.pending-review.md",
        final: decision.displayFinalPath
          ? path.basename(decision.displayFinalPath)
          : state.artifacts?.final || "whitepaper.final.md",
        docx: decision.docxPath ? path.basename(decision.docxPath) : state.artifacts?.docx || "",
        docxManifest: decision.docxManifestPath
          ? path.basename(decision.docxManifestPath)
          : state.artifacts?.docxManifest || "",
      },
      review: {
        ...state.review,
        status: decision.status,
        comment: decision.comment,
        decision,
      },
    };
    next = updateNodeStatus(next, "review", decision.status === "approved" ? "success" : "failed", {
      lastError: decision.status === "rejected" ? decision.comment : null,
    });
    writePipelineState(statePath, next);
  }

  return decision;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const status = args.status || args.decision;
  if (!args.input || !status) {
    throw new Error(
      "Usage: node scripts/run-review-decision.js --input outputs/system --status approved|rejected [--comment 修改意见]",
    );
  }
  const decision = runReviewDecision({
    inputDir: args.input,
    status,
    comment: args.comment,
    date: args.date,
    requireDatabaseEvidence: args["require-database-evidence"],
    systemCode: args["system-code"] || args.system,
    systemName: args["system-name"],
  });
  console.log(JSON.stringify(decision, null, 2));
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
  appendNarrativeGuardNodes,
  assertApprovalTruthReadiness,
  buildReviewDecision,
  inferTargetModules,
  inferRewriteScope,
  inferRerunNodes,
  truthReadinessLooksLikeSmoke,
  resolveReviewNarrativePart,
  runReviewDecision,
};
