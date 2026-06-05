#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { parseArgs, readRequiredJsonObject, writeJson } = require("./system-whitepaper-lib");

const BUSINESS_PROCESS_MODEL_FILE = "business-process-model.json";

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

function normalizeCompactText(value) {
  return String(value || "").replace(/\s+/g, "");
}

function extractChapter(markdown, chapterNumber) {
  const lines = String(markdown || "").split(/\r?\n/);
  const target = String(chapterNumber);
  let start = -1;
  let title = "";
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^##\s+(.+?)\s*$/);
    if (!match) continue;
    const heading = match[1].trim();
    const compact = normalizeCompactText(heading);
    if (
      compact.startsWith(`${target}.`) ||
      compact.startsWith(`${target}、`) ||
      compact.startsWith(`${target}．`) ||
      compact.startsWith(`第${target}章`) ||
      compact.startsWith(`第${target}节`) ||
      compact === target ||
      compact.startsWith(`${target}`)
    ) {
      start = index;
      title = heading;
      break;
    }
  }
  if (start < 0) return { found: false, title: "", content: "" };
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return {
    found: true,
    title,
    content: lines.slice(start + 1, end).join("\n").trim(),
  };
}

function countFlowStepMarkers(chapterText) {
  const numberedSteps = countPattern(chapterText, /^\s*(?:\d+[.、)]|步骤\s*[一二三四五六七八九十\d]+|[-*]\s+)/gm);
  const inlineNumberedSteps = countPattern(chapterText, /(?:^|[\n。；;:：])\s*\d+[.、)]/g);
  const arrowSteps = countPattern(chapterText, /(?:->|→|=>|—>|-->|⇒)/g);
  const sequenceWords = countPattern(chapterText, /先|再|然后|随后|之后|最终|最后|直至|形成/g);
  return numberedSteps + inlineNumberedSteps + arrowSteps + sequenceWords;
}

function semanticHits(chapterText, patterns) {
  return patterns.filter((pattern) => pattern.test(chapterText)).length;
}

function chapterContainsModuleCollaboration(chapterText, specModuleNames = []) {
  const compact = normalizeCompactText(chapterText);
  const connector =
    /协同|联动|跨模块|上下游|流转|同步|对接|关联|依赖|传递|衔接|回写|推送|回流|触发/.test(chapterText);
  const moduleRoots = uniqueStrings(
    specModuleNames.map((name) => String(name || "").split(">").map((part) => part.trim()).filter(Boolean)[0]),
  );
  if (moduleRoots.length > 1) {
    const covered = moduleRoots.filter((name) => compact.includes(normalizeCompactText(name)));
    return connector && covered.length >= 2;
  }
  return connector && /模块|页面|列表|弹窗|接口|后台|数据库|任务|规则|质量/.test(chapterText);
}

function collectBusinessProcessModelArrays(model = {}) {
  const arrays = [];
  const candidates = [
    model.processes,
    model.flows,
    model.businessProcesses,
    model.endToEndFlows,
    model.scenarios,
    model.items,
    model.model?.processes,
    model.businessProcessModel?.processes,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) arrays.push(candidate);
    else if (candidate && typeof candidate === "object") arrays.push(Object.values(candidate));
  }
  if (!arrays.length && (model.name || model.title || model.steps || model.nodes || model.stages)) {
    arrays.push([model]);
  }
  return arrays.flat().filter((item) => item && typeof item === "object" && !Array.isArray(item));
}

function collectStrings(value, depth = 0) {
  if (depth > 5 || value === null || value === undefined) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }
  if (Array.isArray(value)) return value.flatMap((item) => collectStrings(item, depth + 1));
  if (typeof value === "object") {
    return Object.values(value).flatMap((item) => collectStrings(item, depth + 1));
  }
  return [];
}

function uniqueStrings(values = []) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function processName(process = {}) {
  return String(
    process.name ||
      process.title ||
      process.processName ||
      process.flowName ||
      process.scenario ||
      process.id ||
      "",
  ).trim();
}

function processCoverageTokens(process = {}) {
  const stopwords = new Set([
    "页面",
    "菜单",
    "按钮",
    "点击",
    "进入",
    "打开",
    "查看",
    "列表",
    "查询",
    "筛选",
    "字段",
    "系统",
    "模块",
    "流程",
    "业务",
    "状态",
    "质量",
    "数据",
  ]);
  return uniqueStrings(
    collectStrings(process)
      .flatMap((item) => String(item).split(/[，,、；;|>\-—:：\s/\\()[\]{}]+/))
      .map((item) => item.replace(/^["'“”‘’]+|["'“”‘’。.]+$/g, "").trim())
      .filter((item) => item.length >= 2 && item.length <= 24)
      .filter((item) => !stopwords.has(item)),
  ).slice(0, 24);
}

function assessBusinessProcessModelCoverage(model, chapterText) {
  if (!model || typeof model !== "object" || Array.isArray(model)) {
    return { processCount: 0, coveredCount: 0, uncovered: [], failures: [] };
  }
  const processes = collectBusinessProcessModelArrays(model);
  if (!processes.length) {
    return {
      processCount: 0,
      coveredCount: 0,
      uncovered: [],
      failures: [
        `${BUSINESS_PROCESS_MODEL_FILE} 存在但未包含可识别流程数组；请提供 processes、flows、businessProcesses 或 endToEndFlows，并为每个流程列出名称、步骤、对象、状态/质量信号和回流边界。`,
      ],
    };
  }
  const compactChapter = normalizeCompactText(chapterText);
  const coverage = processes.map((process, index) => {
    const name = processName(process);
    const tokens = processCoverageTokens(process);
    const matchedTokens = tokens.filter((token) => compactChapter.includes(normalizeCompactText(token)));
    const nameCovered = Boolean(name && compactChapter.includes(normalizeCompactText(name)));
    const requiredTokenMatches = tokens.length >= 4 ? 2 : 1;
    return {
      name: name || `流程${index + 1}`,
      covered: nameCovered || matchedTokens.length >= requiredTokenMatches,
      matchedTokens,
    };
  });
  const covered = coverage.filter((item) => item.covered);
  const requiredCoverage = Math.min(
    coverage.length,
    Math.max(1, Math.ceil(coverage.length * (coverage.length <= 2 ? 1 : 0.7))),
  );
  const failures = [];
  if (covered.length < requiredCoverage) {
    failures.push(
      `${BUSINESS_PROCESS_MODEL_FILE} 流程覆盖不足：第 4 章覆盖 ${covered.length}/${coverage.length}，至少需要 ${requiredCoverage}；未覆盖流程：${coverage
        .filter((item) => !item.covered)
        .map((item) => item.name)
        .slice(0, 6)
        .join("、")}。请在第 4 章按流程名称补充触发、处理步骤、业务对象、状态/质量信号、协同模块和回流/待确认边界。`,
    );
  }
  return {
    processCount: coverage.length,
    coveredCount: covered.length,
    uncovered: coverage.filter((item) => !item.covered).map((item) => item.name),
    failures,
  };
}

function buildChapter4SemanticFindings(input = {}) {
  const chapter = extractChapter(input.markdown || "", 4);
  const failures = [];
  const specModuleNames = input.specModuleNames || [];
  if (!chapter.found) {
    failures.push("待审稿缺少第 4 章；请按模板新增“## 4. 典型业务流程”，并写入端到端业务流程而非菜单清单。");
    return { failures, chapter };
  }
  if (!/流程|场景|闭环|流转/.test(chapter.title)) {
    failures.push("第 4 章标题未指向典型业务流程；请将第 4 章用于端到端流程说明，而不是证据边界或附录。");
  }
  if (!chapter.content) {
    failures.push("第 4 章为空；请补充端到端业务流程、业务对象、状态/质量信号、模块协同和回流/待确认边界。");
    return { failures, chapter };
  }

  const stepMarkers = countFlowStepMarkers(chapter.content);
  const hasOutcome = hasAny(chapter.content, [
    /端到端|全流程|闭环|从.+到.+(?:完成|归档|确认|回流|结果)/s,
    /触发|承接|流转|处理|生成|归档|完成|形成|最终|结果/,
  ]);
  if (stepMarkers < 3 || !hasOutcome) {
    failures.push(
      `第 4 章缺少端到端流程链路（步骤线索 ${stepMarkers}/3）。请按“触发/输入 -> 处理 -> 状态或质量校验 -> 输出结果 -> 回流或待确认”的顺序重写。`,
    );
  }

  const businessObjectHits = semanticHits(chapter.content, [
    /业务对象|核心对象|对象/,
    /单据|任务|订单|保单|客户|案件|合同|需求|工单|批次|报表|台账|记录|配置项|指标|保司|产品|规则/,
  ]);
  if (businessObjectHits < 1) {
    failures.push("第 4 章缺少业务对象；请明确流程围绕哪些任务、单据、保单、客户、合同、工单、报表、配置项或质量指标流转。");
  }

  const stateSignalHits = semanticHits(chapter.content, [
    /状态|质量|信号|指标|校验|异常|告警|进度|结果|成功|失败|完成|驳回|待处理|待确认|通过|不通过|风险|错误|缺陷/,
    /完整性|一致性|准确|时效|命中|合格|不合格/,
  ]);
  if (stateSignalHits < 1) {
    failures.push("第 4 章缺少状态或质量信号；请写明列表/详情中用于判断流程推进的状态、质量指标、异常告警、校验结果或处理结果。");
  }

  if (!chapterContainsModuleCollaboration(chapter.content, specModuleNames)) {
    failures.push("第 4 章缺少模块协同；请说明至少两个模块、列表/弹窗、接口/后台或上下游页面如何联动、同步、传递或回流信息。");
  }

  const feedbackHits = semanticHits(chapter.content, [
    /问题回流|异常回流|回流|反馈|问题|异常|失败|驳回|待确认|边界|未覆盖|补采|人工确认|待补充|证据边界|未验证|缺口|复核|重试|处理结果|降级/,
  ]);
  if (feedbackHits < 1) {
    failures.push("第 4 章缺少问题回流或待确认边界；请说明异常、质量不通过、证据未覆盖或人工复核场景如何进入回流/待确认。");
  }

  const uiActionCount = countPattern(chapter.content, /进入|打开|点击|页面|菜单|按钮|查看|列表|查询|检索|筛选|下拉|输入|跳转/g);
  const businessSignalCount = countPattern(
    chapter.content,
    /业务对象|任务|订单|保单|客户|案件|合同|需求|工单|状态|质量|异常|告警|审核|审批|提交|处理|复核|校验|同步|生成|归档|回流|整改|确认|闭环|流转|结果/g,
  );
  if (uiActionCount >= 5 && businessSignalCount < 5) {
    failures.push(
      `第 4 章疑似只是菜单/页面操作说明（UI 动作 ${uiActionCount}，业务语义 ${businessSignalCount}）。请补充业务对象、状态变化、质量信号、模块协同和问题回流，不要只写“进入菜单/点击页面/查看列表”。`,
    );
  }

  return { failures, chapter };
}

function buildNarrativeQualityReport(input = {}) {
  const markdown = String(input.markdown || "");
  const evidenceSummary = input.evidenceSummary || {};
  const operationSpec = input.operationSpec || {};
  const businessProcessModel = input.businessProcessModel || null;
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

  const semantic = buildChapter4SemanticFindings({ markdown, specModuleNames });
  failures.push(...semantic.failures);

  if (input.businessProcessModelPresent === true) {
    const coverage = assessBusinessProcessModelCoverage(
      businessProcessModel,
      semantic.chapter?.content || "",
    );
    failures.push(...coverage.failures);
  } else if (input.businessProcessModelPresent === false) {
    warnings.push(
      `${BUSINESS_PROCESS_MODEL_FILE} 不存在；已仅按第 4 章文本语义做门禁。建议后续生成只读业务流程模型，用于校验流程覆盖。`,
    );
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
  if (input.businessProcessModelPath) {
    result.businessProcessModel = {
      file: path.basename(input.businessProcessModelPath),
      fingerprint: fingerprintFile(input.businessProcessModelPath),
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
  const businessProcessModelPath =
    options.businessProcessModelPath || path.join(inputDir, BUSINESS_PROCESS_MODEL_FILE);
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
        businessProcessModelPath,
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
  const businessProcessModelPresent = fs.existsSync(businessProcessModelPath);
  const businessProcessModel = businessProcessModelPresent
    ? readRequiredJsonObject(businessProcessModelPath, { label: "Business process model" })
    : null;
  const report = {
    ...buildNarrativeQualityReport({
      markdown,
      evidenceSummary,
      operationSpec,
      businessProcessModel,
      businessProcessModelPresent,
    }),
    sourceArtifacts: buildNarrativeSourceArtifacts({
      markdownPath,
      evidenceSummaryPath: summaryPath,
      operationSpecPath,
      businessProcessModelPath,
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
  BUSINESS_PROCESS_MODEL_FILE,
  assessBusinessProcessModelCoverage,
  assertValidNarrativeQualityReportArtifact,
  buildNarrativeQualityReport,
  buildNarrativeSourceArtifacts,
  extractChapter,
  fingerprintFile,
  runNarrativeCheck,
};
