const fs = require("node:fs");
const path = require("node:path");
const {
  readExistingJsonObject,
  readOptionalJson,
  readOptionalJsonObject,
  readRequiredJsonObject,
} = require("../system-whitepaper-lib");
const { assertValidVerifiedClaimsArtifact } = require("../fact-check-whitepaper");

function normalizePromptPath(filePath) {
  return String(filePath || "").replace(/\\/g, "/");
}

function ensureJsonObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function resolveOutputDir(context = {}) {
  return path.dirname(path.resolve(context.outputPath || "whitepaper.pending-review.md"));
}

function resolvePhase3bPaths(context = {}) {
  const outputDir = resolveOutputDir(context);
  return {
    outputDir,
    briefPath: context.briefPath || path.join(outputDir, "narrative-brief.md"),
    promptPath: context.promptOutputPath || path.join(outputDir, "phase3b-prompt.md"),
    skeletonPath: context.skeletonPath || path.join(outputDir, "whitepaper.skeleton.md"),
    promptPartsDir: context.promptPartsDir || path.join(outputDir, "phase3b-prompts"),
    fragmentPartsDir: context.fragmentPartsDir || path.join(outputDir, "narrative-fragments"),
    fragmentsPath: context.fragmentsPath || path.join(outputDir, "narrative-fragments.md"),
    outputPath: context.outputPath || path.join(outputDir, "whitepaper.pending-review.md"),
    usagePath: context.usagePath || path.join(outputDir, "phase3b-usage.json"),
    usageHistoryPath:
      context.usageHistoryPath || path.join(outputDir, "phase3b-usage-history.json"),
  };
}

function resolveSdkCwd(context = {}) {
  return path.resolve(context.sdkCwd || resolveOutputDir(context));
}

function loadEvidenceSummary(context = {}) {
  if (context.evidenceSummary) return ensureJsonObject(context.evidenceSummary, "Evidence summary");
  return readExistingJsonObject(context.evidenceSummaryPath, {}, { label: "Evidence summary" });
}

function summarizeQualityReport(report = {}) {
  return {
    canSubmitReview: report.canSubmitReview,
    failures: Array.isArray(report.failures) ? report.failures.slice(0, 8) : [],
    warnings: Array.isArray(report.warnings) ? report.warnings.slice(0, 8) : [],
    counts: report.counts || {},
  };
}

function loadQualitySummary(context = {}) {
  return summarizeQualityReport(
    context.qualityReport
      ? ensureJsonObject(context.qualityReport, "Quality report")
      : readExistingJsonObject(context.qualityReportPath, {}, { label: "Quality report" }),
  );
}

function loadVerifiedClaims(context = {}) {
  if (context.verifiedClaims) {
    const claimsArtifact = ensureJsonObject(context.verifiedClaims, "Verified claims");
    assertValidVerifiedClaimsArtifact(claimsArtifact);
    return claimsArtifact;
  }
  const outputDir = resolveOutputDir(context);
  const claimsPath = context.verifiedClaimsPath || path.join(outputDir, "verified-claims.json");
  const claimsArtifact = readRequiredJsonObject(claimsPath, { label: "Verified claims" });
  assertValidVerifiedClaimsArtifact(claimsArtifact);
  return claimsArtifact;
}

function loadFactCheckReport(context = {}) {
  if (context.factCheckReport) return ensureJsonObject(context.factCheckReport, "Fact-check report");
  const outputDir = resolveOutputDir(context);
  const reportPath = context.factCheckReportPath || path.join(outputDir, "fact-check-report.json");
  if (!context.factCheckReportPath && !fs.existsSync(reportPath)) return null;
  return readExistingJsonObject(reportPath, null, { label: "Fact-check report" });
}

function compactWritableClaimGap(factCheckReport = null, claimsArtifact = {}, options = {}) {
  const missingIds = Array.isArray(factCheckReport?.missingWritableClaimIds)
    ? factCheckReport.missingWritableClaimIds
    : [];
  const claims = Array.isArray(claimsArtifact.claims) ? claimsArtifact.claims : [];
  const claimById = new Map(claims.map((claim) => [claim.id, claim]));
  const targetModule = String(options.moduleName || "").trim();
  const missingWritableClaims = missingIds
    .map((id) => claimById.get(id) || { id })
    .filter((claim) => {
      if (!targetModule) return true;
      return String(claim.module || "").trim() === targetModule;
    })
    .slice(0, options.limit || 80)
    .map((claim) => ({
      id: claim.id || "",
      type: claim.type || "",
      subject: claim.subject || "",
      module: claim.module || "",
      function: claim.function || "",
      entity: claim.entity || "",
      table: claim.table || "",
      status: claim.status || "",
      confidence: claim.confidence || "",
      text: claim.text || "",
      evidence: claim.evidence || {},
    }));
  const metrics = factCheckReport?.metrics || {};
  return {
    available: Boolean(factCheckReport),
    scope: targetModule ? { module: targetModule } : { module: "" },
    canFinalize: factCheckReport?.canFinalize ?? null,
    metrics: {
      writableClaimCount: Number(metrics.writableClaimCount || 0),
      coveredWritableClaimCount: Number(metrics.coveredWritableClaimCount || 0),
      missingWritableClaimCount: Number(metrics.missingWritableClaimCount || missingIds.length || 0),
      writableClaimCoverageRatio: Number(metrics.writableClaimCoverageRatio || 0),
      minWritableClaimCoverage: Number(metrics.minWritableClaimCoverage || 0),
    },
    missingWritableClaimIds: missingWritableClaims.map((claim) => claim.id).filter(Boolean),
    missingWritableClaims,
  };
}

function loadReviewDecision(context = {}) {
  if (context.reviewDecision) return ensureJsonObject(context.reviewDecision, "Review decision");
  if (!context.reviewRerun) return null;
  const outputDir = resolveOutputDir(context);
  const decisionPath = path.join(outputDir, "review-decision.json");
  if (String(context.reviewComment || "").trim()) {
    return readOptionalJsonObject(decisionPath, null);
  }
  return readExistingJsonObject(decisionPath, null, { label: "Review decision" });
}

function compactList(items, limit, mapper) {
  return (Array.isArray(items) ? items : []).slice(0, limit).map(mapper);
}

function compactEvidenceSummary(summary = {}) {
  return {
    system: summary.system || {},
    metrics: summary.metrics || {},
    modules: compactList(summary.modules, 30, (item) => ({
      name: item.name || "",
      entry: item.entry || "",
      summary: item.summary || "",
    })),
    functions: compactList(summary.functions, 120, (item) => ({
      module: item.module || "",
      name: item.name || "",
      menuPath: item.menuPath || "",
      actions: (item.actions || []).slice(0, 8),
      queryFields: (item.queryFields || []).slice(0, 8),
      tableColumns: (item.tableColumns || []).slice(0, 10),
      screenshots: compactList(item.screenshots, 2, (shot) => ({
        id: shot.id || "",
        file: shot.file || "",
        caption: shot.caption || "",
      })),
      hasContainerEvidence: Boolean(item.hasContainerEvidence),
    })),
    containers: compactList(summary.containers, 80, (item) => ({
      sourcePageId: item.sourcePageId || "",
      title: item.title || "",
      actions: (item.actions || []).slice(0, 8),
      fields: (item.fields || []).slice(0, 10),
    })),
    pendingItems: compactList(summary.pendingItems, 40, (item) => item),
    failedPages: compactList(summary.failedPages, 40, (item) => item),
  };
}

function compactVerifiedClaims(claimsArtifact = {}, options = {}) {
  const targetModule = String(options.moduleName || "").trim();
  const claims = (Array.isArray(claimsArtifact.claims) ? claimsArtifact.claims : []).filter((claim) => {
    if (!targetModule) return true;
    return String(claim.module || "").trim() === targetModule;
  });
  const writableClaimIds = new Set(claims.filter((claim) => claim.writable).map((claim) => claim.id).filter(Boolean));
  return {
    system: claimsArtifact.system || {},
    metrics: claimsArtifact.metrics || {},
    scope: targetModule ? { module: targetModule } : { module: "" },
    writableClaimIds: Array.isArray(claimsArtifact.writableClaimIds)
      ? claimsArtifact.writableClaimIds.filter((id) => writableClaimIds.has(id)).slice(0, 200)
      : [...writableClaimIds].slice(0, 200),
    claims: claims.slice(0, 220).map((claim) => ({
      id: claim.id || "",
      type: claim.type || "",
      subject: claim.subject || "",
      module: claim.module || "",
      function: claim.function || "",
      entity: claim.entity || "",
      table: claim.table || "",
      confidence: claim.confidence || "",
      status: claim.status || "",
      writable: Boolean(claim.writable),
      text: claim.text || "",
      evidence: claim.evidence || {},
      reasoning: claim.reasoning || "",
    })),
    rules: claimsArtifact.rules || {},
  };
}

function slugifyPartName(value) {
  const normalized = String(value || "part")
    .trim()
    .replace(/[\\/:*?"<>|#%&{}$!@`'+=]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return (normalized || "part").slice(0, 80);
}

function stableShortHash(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).slice(0, 6);
}

function groupFunctionsByModule(summary = {}) {
  const groups = new Map();
  for (const item of Array.isArray(summary.modules) ? summary.modules : []) {
    const moduleName = String(typeof item === "string" ? item : item?.name || "").trim();
    if (moduleName && !groups.has(moduleName)) groups.set(moduleName, []);
  }
  for (const item of Array.isArray(summary.functions) ? summary.functions : []) {
    const moduleName = String(item.module || "").trim() || "未归类功能";
    if (!groups.has(moduleName)) groups.set(moduleName, []);
    groups.get(moduleName).push(item);
  }
  return [...groups.entries()].map(([moduleName, functions]) => ({ moduleName, functions }));
}

function compactOverviewSummary(summary = {}) {
  const compact = compactEvidenceSummary(summary);
  const countsByModule = {};
  for (const item of Array.isArray(compact.functions) ? compact.functions : []) {
    const moduleName = item.module || "未归类功能";
    countsByModule[moduleName] = (countsByModule[moduleName] || 0) + 1;
  }
  return {
    system: compact.system,
    metrics: compact.metrics,
    modules: compact.modules,
    functionCountsByModule: countsByModule,
    pendingItems: compact.pendingItems,
    failedPages: compact.failedPages,
  };
}

function compactModuleSummary(summary = {}, moduleName) {
  const compact = compactEvidenceSummary(summary);
  const moduleRecord = (compact.modules || []).find((item) => item.name === moduleName) || {
    name: moduleName,
  };
  return {
    system: compact.system,
    metrics: compact.metrics,
    module: moduleRecord,
    functions: (compact.functions || []).filter((item) => (item.module || "未归类功能") === moduleName),
    containers: (compact.containers || []).filter((item) => {
      const text = `${item.title || ""} ${item.sourcePageId || ""}`;
      return !moduleName || text.includes(moduleName);
    }),
    pendingItems: (compact.pendingItems || []).filter((item) => {
      const text = `${item.module || ""} ${item.function || ""} ${item.title || ""}`;
      return !moduleName || text.includes(moduleName);
    }),
  };
}

function buildWhitepaperSkeleton(input = {}) {
  const summary = input.evidenceSummary || {};
  const system = summary.system || {};
  const systemName = input.systemName || system.name || "系统";
  const modules = Array.isArray(summary.modules) ? summary.modules : [];
  const groups = groupFunctionsByModule(summary);
  const lines = [
    `# ${systemName}功能白皮书（待审核）`,
    "",
    "> 本骨架由脚本基于 evidence-summary 生成；`[待升华]` 占位由成稿 Agent 填写，附录由脚本生成。",
    "",
    "## 1. 系统概览",
    "",
    "[待升华：业务定位、服务角色、证据边界]",
    "",
    "## 2. 功能模块概览",
    "",
  ];

  if (modules.length) {
    for (const item of modules) {
      lines.push(`- **${item.name || "未命名模块"}**：[待升华：业务对象与使用目的]`);
    }
  } else {
    lines.push("- [待升华：根据证据归纳模块]");
  }

  lines.push("", "## 3. 核心功能说明", "");
  if (groups.length) {
    for (const group of groups) {
      lines.push(`### ${group.moduleName}`, "");
      for (const item of group.functions.slice(0, 30)) {
        lines.push(`#### ${item.name || item.menuPath || "未命名功能"}`, "");
        lines.push("[待升华：业务用途、关键内容、已验证操作、证据边界]", "");
      }
    }
  } else {
    lines.push("[待升华：根据页面证据归纳核心功能]", "");
  }

  lines.push(
    "## 4. 典型业务流程",
    "",
    "[待升华：围绕业务目标归纳流程，不写成点击步骤]",
    "",
    "## 5. 使用角色与权限边界",
    "",
    "[待升华：根据登录角色、可见菜单和证据边界描述]",
    "",
    "## 6. 待确认事项",
    "",
  );

  const pending = Array.isArray(summary.pendingItems) ? summary.pendingItems : [];
  if (pending.length) {
    for (const item of pending.slice(0, 20)) {
      lines.push(`- ${item.function || item.title || "待确认项"}：${item.reason || "需业务确认"}`);
    }
  } else {
    lines.push("- [待审核确认：暂无自动识别的待确认事项]");
  }

  lines.push("", "## 7. 附录：证据索引", "", "[由脚本根据 evidence-summary 生成]");
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

function buildNarrativeBrief(context = {}) {
  const summary = context.evidenceSummary || {};
  const system = summary.system || {};
  const systemName = context.systemName || system.name || "";
  return [
    "# 低 Token 白皮书成稿规程",
    "",
    `系统：${systemName || "未命名系统"}`,
    "",
    "## 工作边界",
    "",
    "- 只基于 prompt 内联的 evidence-summary 和 quality 摘要写作。",
    "- 不要读取 evidence.json、whitepaper.draft.md、截图二进制、仓库脚本、项目根目录文件、secrets/ 或 .playwright-*。",
    "- 不要编造证据里没有的模块、字段、流程、权限或写操作结果。",
    "- 写操作只有出现 AI_AUTO_TEST_ 测试数据、ledger 和结果证据时，才能描述为已验证。",
    "",
    "## 写作重点",
    "",
    "- 系统概览必须写成业务定位：说明系统位于哪条业务链路、解决什么问题、服务哪些角色。",
    "- 功能模块说明要写业务对象和使用目的，不要堆按钮清单。",
    "- 核心功能说明优先回答谁使用、处理什么对象、关键字段表达什么、哪些操作已验证。",
    "- 典型业务流程围绕业务目标，不写成点击步骤。",
    "- 证据不足、写操作未验证、截图缺口必须进入待确认事项。",
    "",
    "## 输出要求",
    "",
    "- 只写 narrative-fragments.md。",
    "- 使用以下固定章节：",
    "  - ## 1. 系统概览",
    "  - ## 2. 功能模块概览",
    "  - ## 3. 核心功能说明",
    "  - ## 4. 典型业务流程",
    "  - ## 5. 使用角色与权限边界",
    "  - ## 6. 待确认事项",
    "- 不要生成附录；附录由脚本根据 evidence-summary 机械生成。",
  ].join("\n");
}

function sectionExists(markdown, title) {
  return new RegExp(`^##\\s+${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "m").test(markdown);
}

function appendixFromSummary(summary = {}) {
  const lines = ["## 7. 附录：证据索引", ""];
  const functions = Array.isArray(summary.functions) ? summary.functions : [];
  if (!functions.length) {
    lines.push("- 本轮 evidence-summary 未包含可附录化的页面证据。");
    return lines.join("\n");
  }

  for (const item of functions) {
    lines.push(`- **${item.module || "未归类"} / ${item.name || "未命名功能"}**`);
    if (item.menuPath) lines.push(`  - 页面入口：${item.menuPath}`);
    const screenshots = Array.isArray(item.screenshots) ? item.screenshots : [];
    for (const shot of screenshots.slice(0, 3)) {
      lines.push(`  - 截图：${shot.file || shot.id || "未命名截图"}`);
    }
  }

  const pending = Array.isArray(summary.pendingItems) ? summary.pendingItems : [];
  if (pending.length) {
    lines.push("", "### 待确认证据边界", "");
    for (const item of pending.slice(0, 20)) {
      lines.push(`- ${item.function || item.title || "待确认项"}：${item.reason || "需业务确认"}`);
    }
  }
  return lines.join("\n");
}

function assemblePendingReviewMarkdown(input = {}) {
  const summary = input.evidenceSummary || {};
  const system = summary.system || {};
  const fragments = String(input.fragments || "").trim();
  const lines = [
    `# ${system.name || input.systemName || "系统"}功能白皮书（待审核）`,
    "",
    "> 本文依据测试环境自动取证和 AI 叙事归纳生成，未取证或未验证内容均列入待确认事项。",
    "",
  ];

  if (fragments) {
    lines.push(fragments, "");
  } else {
    lines.push(
      "## 1. 系统概览",
      "",
      "待 AI 写稿补充业务定位。",
      "",
      "## 4. 典型业务流程",
      "",
      "待 AI 写稿补充业务流程。",
      "",
    );
  }

  if (!sectionExists(lines.join("\n"), "6. 待确认事项")) {
    lines.push("## 6. 待确认事项", "");
    const pending = Array.isArray(summary.pendingItems) ? summary.pendingItems : [];
    if (pending.length) {
      for (const item of pending.slice(0, 20)) {
        lines.push(`- ${item.function || item.title || "待确认项"}：${item.reason || "需业务确认"}`);
      }
    } else {
      lines.push("- 暂无自动识别的待确认事项；仍需业务审核最终确认。");
    }
    lines.push("");
  }

  lines.push(appendixFromSummary(summary));
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

function readExistingPartFragments(parts = []) {
  const existing = [];
  for (const part of parts) {
    const content = part.content
      ? String(part.content).trim()
      : part.outputPath && fs.existsSync(part.outputPath)
      ? fs.readFileSync(part.outputPath, "utf8").trim()
      : "";
    if (content) existing.push({ ...part, content });
  }
  return existing;
}

function splitTopLevelSections(markdown = "") {
  const text = String(markdown || "").trim();
  if (!text) return [];
  const matches = [...text.matchAll(/^##\s+.*$/gm)];
  if (!matches.length) return [{ number: "", content: text }];
  return matches.map((match, index) => {
    const start = match.index || 0;
    const end = index + 1 < matches.length ? matches[index + 1].index || text.length : text.length;
    const content = text.slice(start, end).trim();
    const numberMatch = content.match(/^##\s*(\d+)/);
    return {
      number: numberMatch ? numberMatch[1] : "",
      content,
    };
  });
}

function mapTopLevelSections(markdown = "") {
  const sections = new Map();
  for (const section of splitTopLevelSections(markdown)) {
    if (section.number && !sections.has(section.number)) {
      sections.set(section.number, section.content);
    }
  }
  return sections;
}

function stripCoreSectionHeading(markdown = "") {
  return String(markdown || "")
    .trim()
    .replace(/^##\s*3[^\n]*\n+/, "")
    .trim();
}

function normalizeModuleHeading(value = "") {
  return String(value || "")
    .trim()
    .replace(/^[#*\-\s]+/, "")
    .replace(/[：:，,。.].*$/, "")
    .replace(/\*+$/g, "")
    .trim();
}

function splitModuleOverviewItems(overviewSection = "") {
  const body = String(overviewSection || "")
    .trim()
    .replace(/^##\s*2[^\n]*\n+/, "")
    .trim();
  if (!body) return [];
  const lines = body.split(/\r?\n/);
  const items = [];
  let current = null;

  for (const line of lines) {
    if (/^[-*]\s+/.test(line) || /^###\s+/.test(line)) {
      if (current) items.push(current);
      const heading = line
        .replace(/^[-*]\s+/, "")
        .replace(/^###\s+/, "")
        .replace(/^\*\*/, "")
        .replace(/\*\*.*$/, "")
        .replace(/[：:，,。.].*$/, "")
        .trim();
      current = { heading, content: line.trim() };
      continue;
    }
    if (current && line.trim()) {
      current.content += `\n${line.trim()}`;
    }
  }
  if (current) items.push(current);
  return items;
}

function extractModuleOverviewItem(fragment = {}) {
  const section = mapTopLevelSections(fragment.content || "").get("2") || "";
  if (!section) return null;
  const items = splitModuleOverviewItems(section);
  const expected = normalizeModuleHeading(fragment.moduleName);
  return (
    items.find((item) => normalizeModuleHeading(item.heading) === expected) ||
    items[0] ||
    null
  );
}

function buildModuleOverviewSection(moduleFragments = [], baselineSection = "") {
  if (!moduleFragments.length) return String(baselineSection || "").trim();
  const itemsByHeading = new Map();
  const orderedHeadings = [];

  for (const item of splitModuleOverviewItems(baselineSection)) {
    const key = normalizeModuleHeading(item.heading) || `baseline-${orderedHeadings.length}`;
    itemsByHeading.set(key, item.content);
    orderedHeadings.push(key);
  }

  for (const fragment of moduleFragments) {
    const item = extractModuleOverviewItem(fragment);
    if (!item) continue;
    const key =
      normalizeModuleHeading(fragment.moduleName) ||
      normalizeModuleHeading(item.heading) ||
      `module-${orderedHeadings.length}`;
    if (!orderedHeadings.includes(key)) orderedHeadings.push(key);
    itemsByHeading.set(key, item.content);
  }

  const items = orderedHeadings.map((heading) => itemsByHeading.get(heading)).filter(Boolean);
  if (!items.length) return String(baselineSection || "").trim();
  return ["## 2. 功能模块概览", ...items].join("\n\n").trim();
}

function splitModuleSubsections(coreSection = "") {
  const body = stripCoreSectionHeading(coreSection);
  if (!body) return [];
  const matches = [...body.matchAll(/^###\s+.*$/gm)];
  if (!matches.length) return [{ heading: "", content: body }];
  return matches.map((match, index) => {
    const start = match.index || 0;
    const end = index + 1 < matches.length ? matches[index + 1].index || body.length : body.length;
    const content = body.slice(start, end).trim();
    return {
      heading: match[0].replace(/^###\s+/, "").trim(),
      content,
    };
  });
}

function buildCoreFunctionSection(moduleFragments = [], baselineSection = "") {
  if (!moduleFragments.length) return String(baselineSection || "").trim();
  const sectionsByHeading = new Map();
  const orderedHeadings = [];

  for (const section of splitModuleSubsections(baselineSection)) {
    const key = normalizeModuleHeading(section.heading) || `baseline-${orderedHeadings.length}`;
    sectionsByHeading.set(key, section.content);
    orderedHeadings.push(key);
  }

  for (const fragment of moduleFragments) {
    const content = stripCoreSectionHeading(mapTopLevelSections(fragment.content || "").get("3") || fragment.content);
    if (!content) continue;
    const heading =
      content.match(/^###\s+(.+)$/m)?.[1]?.trim() ||
      fragment.moduleName ||
      `module-${orderedHeadings.length}`;
    const key = normalizeModuleHeading(heading) || `module-${orderedHeadings.length}`;
    if (!orderedHeadings.includes(key)) orderedHeadings.push(key);
    sectionsByHeading.set(key, content);
  }

  const modules = orderedHeadings.map((heading) => sectionsByHeading.get(heading)).filter(Boolean);
  if (!modules.length) return String(baselineSection || "").trim();
  return ["## 3. 核心功能说明", ...modules].join("\n\n").trim();
}

function assembleFragmentsFromParts(parts = [], options = {}) {
  const existing = readExistingPartFragments(parts);
  const baselineSections = mapTopLevelSections(options.baselineFragments || "");
  if (!existing.length) return String(options.baselineFragments || "").trim();

  const overview = existing.find((item) => item.type === "overview");
  const modules = existing.filter((item) => item.type === "module");
  const overviewSections = mapTopLevelSections(overview?.content || "");
  const overviewSection2 = overviewSections.get("2") || "";
  const overviewHasModuleItems = splitModuleOverviewItems(overviewSection2).length > 0;
  const overviewModuleBase =
    overviewSection2 && (!modules.length || overviewHasModuleItems)
      ? overviewSection2
      : baselineSections.get("2");
  const moduleOverviewSection = buildModuleOverviewSection(modules, overviewModuleBase || "");
  const coreSection = buildCoreFunctionSection(modules, baselineSections.get("3") || "");
  const ordered = [];

  for (const number of ["1", "2", "3", "4", "5", "6"]) {
    const content =
      number === "2"
        ? moduleOverviewSection || overviewSections.get(number) || baselineSections.get(number) || ""
        : number === "3"
        ? coreSection
        : overviewSections.get(number) || baselineSections.get(number) || "";
    if (content) ordered.push(content);
  }

  if (!ordered.length && overview?.content) ordered.push(overview.content);
  for (const section of splitTopLevelSections(overview?.content || "")) {
    if (section.number && !["1", "2", "3", "4", "5", "6"].includes(section.number)) {
      ordered.push(section.content);
    }
  }

  return ordered.filter(Boolean).join("\n\n");
}

function formatReviewRerunPromptLines(reviewDecision = {}, fallbackInstruction, options = {}) {
  const scope = reviewDecision?.rewriteScope || "narrative";
  const targetSections = (reviewDecision?.targetSections || []).join("、");
  const isEvidenceRefresh = scope === "evidence-refresh";
  const isPartPrompt = options.mode === "part";
  return [
    isEvidenceRefresh
      ? `重跑类型：证据刷新后${isPartPrompt ? "分片成稿" : "全量成稿"}`
      : `局部重写范围：${scope}`,
    `目标章节：${
      targetSections ||
      (isEvidenceRefresh
        ? isPartPrompt
          ? "本分片范围，按更新后的分片 evidence-summary 重写"
          : "全量正文，按更新后的 evidence-summary 重写"
        : "按意见判断")
    }`,
    `重写指令：${reviewDecision?.instructions || fallbackInstruction}`,
  ];
}

function buildPhase3bPrompt(context = {}) {
  const {
    systemCode,
    systemName,
    model,
    reviewComment,
  } = context;
  const paths = resolvePhase3bPaths(context);
  const evidenceSummary = compactEvidenceSummary(loadEvidenceSummary(context));
  const qualitySummary = loadQualitySummary(context);
  const verifiedClaimsArtifact = loadVerifiedClaims(context);
  const verifiedClaims = compactVerifiedClaims(verifiedClaimsArtifact);
  const writableClaimGap = compactWritableClaimGap(loadFactCheckReport(context), verifiedClaimsArtifact);
  const reviewDecision = loadReviewDecision(context);
  const inlineSummary = JSON.stringify(evidenceSummary, null, 2);
  const inlineQuality = JSON.stringify(qualitySummary, null, 2);
  const inlineVerifiedClaims = JSON.stringify(verifiedClaims, null, 2);
  const inlineWritableClaimGap = JSON.stringify(writableClaimGap, null, 2);

  const lines = [
    "你正在执行 system-whitepaper Skill 的【成稿 · 写稿】节点（M10 低 Token 模式）。",
    "",
    "只允许读取当前工作目录下的 narrative-brief.md；不要读取仓库、不要探索脚本目录、不要读取 evidence.json、底稿、secrets/ 或 .playwright-*。",
    "",
    "系统信息：",
    `- code: ${systemCode || ""}`,
    `- name: ${systemName || ""}`,
    "",
    "输出文件：",
    `- fragments: ${normalizePromptPath(paths.fragmentsPath)}`,
    "",
    "写作要求：",
    "- 只输出 narrative-fragments.md，不要生成完整附录。",
    "- 重点写业务定位、业务价值、模块用途、核心功能说明和典型业务流程。",
    "- 证据不足时写入待确认事项，不要编造。",
    "- 避免模板句、按钮堆砌和每页重复验证噪声。",
    "- 写操作只有存在 AI_AUTO_TEST_ 证据和 ledger 时才能写为已验证。",
    "",
    "quality 摘要：",
    "```json",
    inlineQuality,
    "```",
    "",
    "verified-claims (authoritative writable business claims):",
    "```json",
    inlineVerifiedClaims,
    "```",
    "",
    "Verified-claims writing rules:",
    "- Body sections may only assert claims with writable=true.",
    "- Claims with writable=false must only appear under pending/unverified confirmation items.",
    "- Do not invent business flow, purpose, role, status, or automation claims outside verified-claims.",
    "- Cover each writable claim with its subject/function plus module/entity/evidence context; automatic repair may add `[claim:<id>]` markers for precise traceability.",
    "- If writable-claim-coverage-gap lists missingWritableClaims, write those writable claims into the relevant body sections before considering the draft complete.",
    "",
    "writable-claim-coverage-gap (from fact-check-report, if available):",
    "```json",
    inlineWritableClaimGap,
    "```",
    "",
    "evidence-summary（已压缩内联）：",
    "```json",
    inlineSummary,
    "```",
    "",
    "写完后停止，不要继续读取其他文件。",
  ];

  if (model) {
    lines.push("", `模型策略：本次期望使用 ${model}。`);
  }

  if (reviewComment || reviewDecision?.comment) {
    lines.push(
      "",
      "审核驳回意见：",
      reviewComment || reviewDecision.comment,
      "",
      ...formatReviewRerunPromptLines(
        reviewDecision,
        "按审核意见局部修订叙事片段，不重写整份白皮书。",
      ),
    );
  }

  return `${lines.join("\n")}\n`;
}

function buildPhase3bPartPrompt(context = {}) {
  const {
    part,
    systemCode,
    systemName,
    model,
    reviewComment,
  } = context;
  const paths = resolvePhase3bPaths(context);
  const qualitySummary = loadQualitySummary(context);
  const verifiedClaimsArtifact = loadVerifiedClaims(context);
  const reviewDecision = loadReviewDecision(context);
  const partInfo = part || { id: "overview-flow", type: "overview" };
  const verifiedClaims = compactVerifiedClaims(verifiedClaimsArtifact, {
    moduleName: partInfo.type === "module" ? partInfo.moduleName : "",
  });
  const writableClaimGap = compactWritableClaimGap(loadFactCheckReport(context), verifiedClaimsArtifact, {
    moduleName: partInfo.type === "module" ? partInfo.moduleName : "",
  });
  const inlineSummary = JSON.stringify(partInfo.summary || {}, null, 2);
  const inlineQuality = JSON.stringify(qualitySummary, null, 2);
  const inlineVerifiedClaims = JSON.stringify(verifiedClaims, null, 2);
  const inlineWritableClaimGap = JSON.stringify(writableClaimGap, null, 2);
  const outputFile = partInfo.outputPath || path.join(paths.fragmentPartsDir, `${partInfo.id}.md`);
  const sectionInstruction =
    partInfo.type === "module"
      ? [
          `你只写模块「${partInfo.moduleName || "未命名模块"}」的局部片段：## 2 功能模块概览中的该模块条目，以及 ## 3 核心功能说明中的该模块小节。`,
          "输出可以包含 `## 2. 功能模块概览`，但只写该模块的一条概览，不要写其他模块。",
          "输出必须包含该模块的 `## 3. 核心功能说明` 片段，下面从三级标题开始，例如 `### 模块名`，并为该模块下每个核心功能写 5-8 行。",
          "不要写系统概览、典型流程、权限边界、待确认事项或附录。",
        ]
      : [
          "你只写非功能明细章节：## 1 系统概览、## 2 功能模块概览、## 4 典型业务流程、## 5 使用角色与权限边界、## 6 待确认事项。",
          "不要写 ## 3 核心功能说明，也不要生成附录。",
        ];

  const lines = [
    "你正在执行 system-whitepaper Skill 的【成稿 · 写稿】分片节点。",
    "",
    "只允许读取当前工作目录下的 narrative-brief.md 和 whitepaper.skeleton.md；不要读取 evidence.json、whitepaper.draft.md、截图二进制、仓库脚本、secrets/、.playwright-* 或其他系统产物。",
    "",
    "系统信息：",
    `- code: ${systemCode || ""}`,
    `- name: ${systemName || ""}`,
    "",
    "分片信息：",
    `- id: ${partInfo.id}`,
    `- type: ${partInfo.type}`,
    partInfo.moduleName ? `- module: ${partInfo.moduleName}` : "",
    "",
    "输出文件：",
    `- ${normalizePromptPath(outputFile)}`,
    "",
    "写作范围：",
    ...sectionInstruction.map((item) => `- ${item}`),
    "- 证据不足时写入待确认事项，不要编造。",
    "- 写操作只有存在 AI_AUTO_TEST_ 证据和 ledger 时才能写为已验证。",
    "",
    "quality 摘要：",
    "```json",
    inlineQuality,
    "```",
    "",
    "verified-claims (authoritative writable business claims):",
    "```json",
    inlineVerifiedClaims,
    "```",
    "",
    "Verified-claims writing rules:",
    "- Body sections may only assert claims with writable=true.",
    "- Claims with writable=false must only appear under pending/unverified confirmation items.",
    "- Do not invent business flow, purpose, role, status, or automation claims outside verified-claims.",
    "- Cover each writable claim with its subject/function plus module/entity/evidence context; automatic repair may add `[claim:<id>]` markers for precise traceability.",
    "- If writable-claim-coverage-gap lists missingWritableClaims for this part, cover those claims in this fragment.",
    "",
    "writable-claim-coverage-gap (from fact-check-report, filtered to this part when possible):",
    "```json",
    inlineWritableClaimGap,
    "```",
    "",
    "分片 evidence-summary：",
    "```json",
    inlineSummary,
    "```",
    "",
    "写完后停止，不要继续读取其他文件。",
  ].filter((line) => line !== "");

  if (model) {
    lines.push("", `模型策略：本次期望使用 ${model}。`);
  }

  if (reviewComment || reviewDecision?.comment) {
    lines.push(
      "",
      "审核驳回意见：",
      reviewComment || reviewDecision.comment,
      "",
      ...formatReviewRerunPromptLines(reviewDecision, "按审核意见局部修订本分片。", {
        mode: "part",
      }),
    );
  }

  return `${lines.join("\n")}\n`;
}

function buildNarrativeParts(context = {}, evidenceSummary = loadEvidenceSummary(context)) {
  const paths = resolvePhase3bPaths(context);
  const usedModuleSlugs = new Set();
  const parts = [
    {
      id: "overview-flow",
      type: "overview",
      label: "概览与流程",
      outputPath: path.join(paths.fragmentPartsDir, "overview-flow.md"),
      promptPath: path.join(paths.promptPartsDir, "overview-flow-prompt.md"),
      summary: compactOverviewSummary(evidenceSummary),
    },
  ];

  for (const group of groupFunctionsByModule(evidenceSummary)) {
    const baseSlug = slugifyPartName(group.moduleName);
    let slug = baseSlug;
    if (usedModuleSlugs.has(slug)) {
      slug = `${baseSlug.slice(0, 72)}-${stableShortHash(group.moduleName)}`;
    }
    usedModuleSlugs.add(slug);
    parts.push({
      id: `module-${slug}`,
      type: "module",
      label: `模块：${group.moduleName}`,
      moduleName: group.moduleName,
      outputPath: path.join(paths.fragmentPartsDir, `module-${slug}.md`),
      promptPath: path.join(paths.promptPartsDir, `module-${slug}-prompt.md`),
      summary: compactModuleSummary(evidenceSummary, group.moduleName),
    });
  }

  return parts;
}

function normalizeNarrativePartSelector(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === "all" || raw === "narrative") return "";
  if (raw === "overview" || raw === "overview-flow") return "overview-flow";
  if (raw === "functions" || raw === "function-sections" || raw === "modules") {
    return "function-sections";
  }
  return raw;
}

function selectNarrativeParts(parts = [], selector = "") {
  const normalized = normalizeNarrativePartSelector(selector);
  if (!normalized) return parts;
  if (normalized === "overview-flow") {
    return parts.filter((part) => part.id === "overview-flow");
  }
  if (normalized === "function-sections") {
    return parts.filter((part) => part.type === "module");
  }
  const wanted = new Set(
    normalized
      .split(/[,，、]/)
      .map((item) => item.trim())
      .filter(Boolean),
  );
  return parts.filter(
    (part) =>
      wanted.has(part.id) ||
      wanted.has(part.type) ||
      wanted.has(part.moduleName) ||
      wanted.has(slugifyPartName(part.moduleName)),
  );
}

function resolveCursorApiKey(context = {}) {
  if (context.apiKey) return String(context.apiKey).trim();
  if (process.env.CURSOR_API_KEY) return String(process.env.CURSOR_API_KEY).trim();

  const keyFile =
    context.cursorApiKeyFile ||
    path.resolve(process.cwd(), "secrets", "cursor-api-key.txt");
  if (!fs.existsSync(keyFile)) return "";

  return fs.readFileSync(keyFile, "utf8").trim();
}

function writePreparationFiles(context = {}) {
  const paths = resolvePhase3bPaths(context);
  const evidenceSummary = loadEvidenceSummary(context);
  const qualitySummary = loadQualitySummary(context);
  const verifiedClaims = loadVerifiedClaims(context);
  const factCheckReport = loadFactCheckReport(context);
  const skeleton = buildWhitepaperSkeleton({
    ...context,
    evidenceSummary,
  });
  const brief = buildNarrativeBrief({
    ...context,
    evidenceSummary,
    qualityReport: qualitySummary,
  });
  const prompt = buildPhase3bPrompt({
    ...context,
    evidenceSummary,
    qualityReport: qualitySummary,
    verifiedClaims,
    factCheckReport,
    verifiedClaimsPath: undefined,
  });
  const parts = buildNarrativeParts(context, evidenceSummary);
  const selectedPartSelector = normalizeNarrativePartSelector(context.narrativePart || context.part);
  const selectedParts = selectNarrativeParts(parts, selectedPartSelector);
  if (selectedPartSelector && !selectedParts.length) {
    throw new Error(`No narrative parts matched selector: ${selectedPartSelector}`);
  }
  fs.mkdirSync(paths.outputDir, { recursive: true });
  fs.mkdirSync(paths.promptPartsDir, { recursive: true });
  fs.mkdirSync(paths.fragmentPartsDir, { recursive: true });
  fs.writeFileSync(paths.skeletonPath, skeleton, "utf8");
  fs.writeFileSync(paths.briefPath, brief, "utf8");
  fs.writeFileSync(paths.promptPath, prompt, "utf8");
  for (const part of parts) {
    const partPrompt = buildPhase3bPartPrompt({
      ...context,
      part,
      evidenceSummary,
      qualityReport: qualitySummary,
      verifiedClaims,
      factCheckReport,
      verifiedClaimsPath: undefined,
    });
    fs.writeFileSync(part.promptPath, partPrompt, "utf8");
  }
  return { paths, evidenceSummary, qualitySummary, skeleton, brief, prompt, parts, selectedParts };
}

function assembleIfFragmentsExist(context = {}, evidenceSummary, parts = [], selectedParts = parts) {
  const paths = resolvePhase3bPaths(context);
  const existingCombined = fs.existsSync(paths.fragmentsPath)
    ? fs.readFileSync(paths.fragmentsPath, "utf8")
    : "";
  let fragments = "";
  const shouldAssembleFromParts =
    selectedParts.length > 0 &&
    (context.forceAssembleParts || !fs.existsSync(paths.fragmentsPath));
  if (shouldAssembleFromParts) {
    fragments = assembleFragmentsFromParts(selectedParts, { baselineFragments: existingCombined });
  } else if (existingCombined) {
    fragments = existingCombined;
  }
  if (!String(fragments || "").trim()) return null;
  if (shouldAssembleFromParts || !fs.existsSync(paths.fragmentsPath)) {
    fs.writeFileSync(paths.fragmentsPath, `${String(fragments).trim()}\n`, "utf8");
  }
  const markdown = assemblePendingReviewMarkdown({
    evidenceSummary,
    fragments,
    systemName: context.systemName,
  });
  fs.writeFileSync(paths.outputPath, markdown, "utf8");
  const { syncWhitepaperNamedArtifacts } = require("../system-whitepaper-lib");
  syncWhitepaperNamedArtifacts({
    systemOutput: paths.outputDir,
    systemName: context.systemName,
    syncFinal: false,
  });
  return { outputPath: paths.outputPath, chars: markdown.length };
}

function resolvePricingConfig(context = {}) {
  return context.pricingConfig || context.narrativePricing || {};
}

function listPromptPartFiles(paths) {
  if (!paths.promptPartsDir || !fs.existsSync(paths.promptPartsDir)) return [];
  return fs.readdirSync(paths.promptPartsDir).filter((name) => name.endsWith(".md"));
}

function sumPromptPartChars(paths) {
  return listPromptPartFiles(paths)
    .map((name) => fs.readFileSync(path.join(paths.promptPartsDir, name), "utf8").length)
    .reduce((sum, value) => sum + value, 0);
}

function normalizeUsageInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
}

function normalizeOptionalUsageInteger(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  return normalizeUsageInteger(value, null);
}

function resolveGeneratedPromptChars(paths, usage = {}) {
  if (usage.generatedPromptChars !== undefined) {
    return normalizeUsageInteger(usage.generatedPromptChars);
  }
  const mainPromptChars =
    usage.generatedMainPromptChars !== undefined
      ? normalizeUsageInteger(usage.generatedMainPromptChars)
      : fs.existsSync(paths.promptPath)
        ? fs.readFileSync(paths.promptPath, "utf8").length
        : 0;
  const partPromptChars =
    usage.generatedPartPromptChars !== undefined
      ? normalizeUsageInteger(usage.generatedPartPromptChars)
      : sumPromptPartChars(paths);
  return mainPromptChars + partPromptChars;
}

function resolveGeneratedPromptPartCount(paths, usage = {}) {
  if (usage.generatedPromptPartCount !== undefined) {
    return normalizeUsageInteger(usage.generatedPromptPartCount);
  }
  return listPromptPartFiles(paths).length;
}

function normalizeUsageText(value) {
  return String(value ?? "").trim();
}

function sanitizeSentPromptRun(item) {
  if (typeof item === "string") {
    const id = normalizeUsageText(item);
    return id ? { id, type: "", moduleName: "" } : null;
  }
  if (!item || typeof item !== "object") return null;
  const summary = {
    id: normalizeUsageText(item.id),
    type: normalizeUsageText(item.type),
    moduleName: normalizeUsageText(item.moduleName),
  };
  return summary.id || summary.type || summary.moduleName ? summary : null;
}

function sanitizeSentPromptRuns(runs = []) {
  return Array.isArray(runs) ? runs.map(sanitizeSentPromptRun).filter(Boolean) : [];
}

function writeUsage(context = {}, usage = {}) {
  const paths = resolvePhase3bPaths(context);
  const explicitReviewDecision = context.reviewDecision || usage.reviewDecision || null;
  const explicitReviewComment =
    context.reviewComment || usage.reviewComment || explicitReviewDecision?.comment || "";
  const reviewDecision = loadReviewDecision({
    ...context,
    reviewDecision: explicitReviewDecision,
    reviewComment: explicitReviewComment,
  });
  const prompt = fs.existsSync(paths.promptPath) ? fs.readFileSync(paths.promptPath, "utf8") : "";
  const mainPromptChars =
    usage.mainPromptChars !== undefined ? normalizeUsageInteger(usage.mainPromptChars) : prompt.length;
  const partPromptChars =
    usage.partPromptChars !== undefined
      ? normalizeUsageInteger(usage.partPromptChars)
      : sumPromptPartChars(paths);
  const promptChars =
    usage.promptChars !== undefined
      ? normalizeUsageInteger(usage.promptChars)
      : mainPromptChars + partPromptChars;
  const generatedPromptChars = resolveGeneratedPromptChars(paths, usage);
  const generatedPromptPartCount = resolveGeneratedPromptPartCount(paths, usage);
  const sentPromptRuns = sanitizeSentPromptRuns(usage.sentPromptRuns);
  const explicitSentPromptRunCount =
    normalizeOptionalUsageInteger(usage.sentPromptRunCount);
  const explicitSentPromptPartCount =
    normalizeOptionalUsageInteger(usage.sentPromptPartCount);
  const sentPromptRunCount =
    explicitSentPromptRunCount !== null ? explicitSentPromptRunCount : sentPromptRuns.length;
  const sentPromptPartCount =
    explicitSentPromptPartCount !== null
      ? explicitSentPromptPartCount
      : sentPromptRuns.filter((item) => item.type !== "full").length;
  const fragments = fs.existsSync(paths.fragmentsPath)
    ? fs.readFileSync(paths.fragmentsPath, "utf8")
    : "";
  const pendingChars =
    usage.pendingReviewChars !== undefined
      ? normalizeUsageInteger(usage.pendingReviewChars)
      : fs.existsSync(paths.outputPath)
        ? fs.readFileSync(paths.outputPath, "utf8").length
        : 0;
  const sdkUsage = usage.sdkUsage || null;
  let usageEstimated = Boolean(usage.usageEstimated ?? sdkUsage?.estimated);
  let usageSource = usage.usageSource || sdkUsage?.source || (usageEstimated ? "estimated" : "");
  let inputTokens = normalizeUsageInteger(usage.inputTokens ?? sdkUsage?.inputTokens ?? 0);
  let outputTokens = normalizeUsageInteger(usage.outputTokens ?? sdkUsage?.outputTokens ?? 0);
  let totalTokens = normalizeUsageInteger(usage.totalTokens ?? sdkUsage?.totalTokens ?? 0);
  let cacheReadTokens = normalizeUsageInteger(usage.cacheReadTokens ?? sdkUsage?.cacheReadTokens ?? 0);
  let cacheWriteTokens = normalizeUsageInteger(
    usage.cacheWriteTokens ?? sdkUsage?.cacheWriteTokens ?? 0,
  );
  let usageCaptureMethod = usage.usageCaptureMethod || "";
  let resolvedSdkUsage = sdkUsage;

  if (
    (context.provider || usage.provider) === "cursor-sdk" &&
    !totalTokens &&
    usageSource !== "sdk"
  ) {
    const { estimateTokenUsageFromChars } = require("./extract-sdk-usage");
    const estimated = estimateTokenUsageFromChars({
      promptChars,
      inlineSummaryChars: normalizeUsageInteger(usage.inlineSummaryChars),
      fragmentChars: fragments.length,
    });
    if (estimated) {
      resolvedSdkUsage = estimated;
      usageEstimated = true;
      usageSource = "estimated";
      inputTokens = estimated.inputTokens;
      outputTokens = estimated.outputTokens;
      totalTokens = estimated.totalTokens;
      usageCaptureMethod = usageCaptureMethod || "char-estimate-writeUsage";
    }
  }

  const { attachUsageCost } = require("./usage-cost");
  const pricingConfig = resolvePricingConfig(context);
  const record = attachUsageCost(
    {
      provider: context.provider || usage.provider || "manual",
      model: context.model || "composer-2.5",
      systemCode: context.systemCode || "",
      narrativePart: context.narrativePart || context.part || "",
      reviewRerun: Boolean(context.reviewRerun || usage.reviewRerun || reviewDecision),
      reviewComment: explicitReviewComment || reviewDecision?.comment || "",
      reviewDecision: reviewDecision
        ? {
            status: reviewDecision.status || "",
            rewriteScope: reviewDecision.rewriteScope || "",
            narrativePart: reviewDecision.narrativePart || "",
            targetSections: reviewDecision.targetSections || [],
            targetModules: reviewDecision.targetModules || [],
          }
        : usage.reviewDecision || null,
      startedAt: usage.startedAt || "",
      finishedAt: usage.finishedAt || new Date().toISOString(),
      durationMs: normalizeUsageInteger(usage.durationMs),
      promptChars,
      mainPromptChars,
      partPromptChars,
      generatedPromptChars,
      generatedPromptPartCount,
      sentPromptRunCount,
      sentPromptPartCount,
      sentPromptRuns,
      inlineSummaryChars: normalizeUsageInteger(usage.inlineSummaryChars),
      fragmentChars: fragments.length,
      pendingReviewChars: pendingChars,
      sdkUsage: resolvedSdkUsage,
      inputTokens,
      outputTokens,
      totalTokens,
      cacheReadTokens,
      cacheWriteTokens,
      usageSource,
      usageEstimated,
      usageCaptureMethod,
      usageUnavailable: Boolean(
        usage.usageUnavailable ??
          (usageSource === "unavailable" || (!resolvedSdkUsage && !usageEstimated)),
      ),
    },
    pricingConfig,
  );
  writeJson(paths.usagePath, record);
  const history = readOptionalJson(paths.usageHistoryPath, []);
  const nextHistory = (Array.isArray(history) ? history : []).concat(record).slice(-50);
  writeJson(paths.usageHistoryPath, nextHistory);
  return paths.usagePath;
}

async function runManualProvider(context) {
  const started = Date.now();
  const prepared = writePreparationFiles({ ...context, provider: "manual" });
  const assembled = assembleIfFragmentsExist(context, prepared.evidenceSummary, prepared.parts);
  const usagePath = writeUsage(
    { ...context, provider: "manual" },
    {
      provider: "manual",
      startedAt: new Date(started).toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      inlineSummaryChars: JSON.stringify(compactEvidenceSummary(prepared.evidenceSummary)).length,
      pendingReviewChars: assembled?.chars || 0,
    },
  );
  return {
    status: "manual-required",
    provider: "manual",
    narrativePart: context.narrativePart || context.part || "",
    promptPath: prepared.paths.promptPath,
    skeletonPath: prepared.paths.skeletonPath,
    briefPath: prepared.paths.briefPath,
    fragmentsPath: prepared.paths.fragmentsPath,
    partPrompts: summarizePartPrompts(prepared.selectedParts),
    outputPath: assembled?.outputPath || "",
    usagePath,
  };
}

function summarizePartPrompts(parts = []) {
  return parts.map((part) => ({
    id: part.id,
    type: part.type,
    label: part.label,
    moduleName: part.moduleName || "",
    promptPath: part.promptPath,
    outputPath: part.outputPath,
  }));
}

function summarizePromptRuns(promptRuns = [], options = {}) {
  return promptRuns.map((item) => {
    const summary = {
      id: item.id,
      type: item.type,
      moduleName: item.moduleName || "",
    };
    if (options.includePaths) {
      summary.promptPath = item.promptPath;
      summary.outputPath = item.outputPath;
    }
    return summary;
  });
}

function resolveCursorSdkPrompts(prepared, context = {}) {
  const selector = normalizeNarrativePartSelector(context.narrativePart || context.part);
  if (!selector) {
    return [
      {
        id: "full",
        type: "full",
        prompt: prepared.prompt,
        promptPath: prepared.paths.promptPath,
        outputPath: prepared.paths.fragmentsPath,
      },
    ];
  }
  return prepared.selectedParts.map((part) => ({
    id: part.id,
    type: part.type,
    moduleName: part.moduleName || "",
    prompt: fs.readFileSync(part.promptPath, "utf8"),
    promptPath: part.promptPath,
    outputPath: part.outputPath,
  }));
}

async function sendCursorSdkPrompt(agent, prompt, options = {}) {
  const run = await agent.send(prompt, {
    apiKey: options.apiKey,
    model: { id: options.modelId },
    local: { cwd: options.sdkCwd },
    onDelta: ({ update }) => {
      options.collectTurnEndedUsageCandidates(update, options.turnEndedUsages);
    },
    onStep: ({ step }) => {
      options.collectTurnEndedUsageCandidates(step, options.turnEndedUsages);
    },
  });

  for await (const event of run.stream()) {
    options.collectTurnEndedUsageCandidates(event, options.turnEndedUsages);
  }

  let conversationTurns = [];
  if (run.supports("conversation")) {
    try {
      conversationTurns = await run.conversation();
    } catch {
      conversationTurns = [];
    }
  }

  return {
    conversationTurns,
    result: await run.wait(),
  };
}

async function runCursorSdkProvider(context) {
  const { assertCursorSdkNodeVersion } = require("./ensure-dispose-symbols");
  assertCursorSdkNodeVersion();

  let sdk;
  try {
    sdk = await import("@cursor/sdk");
  } catch (error) {
    throw new Error(
      "@cursor/sdk is not installed. Install it or use --provider manual. Original error: " +
        error.message,
    );
  }

  const apiKey = resolveCursorApiKey(context);
  if (!apiKey) {
    throw new Error(
      "CURSOR_API_KEY is required for cursor-sdk provider. Set env var or create secrets/cursor-api-key.txt.",
    );
  }

  const started = Date.now();
  const prepared = writePreparationFiles({ ...context, provider: "cursor-sdk" });
  const inlineSummaryChars = JSON.stringify(compactEvidenceSummary(prepared.evidenceSummary)).length;
  const turnEndedUsages = [];
  const conversationTurns = [];
  const promptRuns = resolveCursorSdkPrompts(prepared, context);
  const sentPromptRuns = summarizePromptRuns(promptRuns);
  const sentPromptChars = promptRuns
    .map((item) => String(item.prompt || "").length)
    .reduce((sum, value) => sum + value, 0);
  let result;
  const {
    collectTurnEndedUsageCandidates,
    resolvePhase3bUsage,
  } = require("./extract-sdk-usage");
  const modelId = context.model || "composer-2.5";
  const sdkCwd = resolveSdkCwd(context);

  const agent = await sdk.Agent.create({
    apiKey,
    model: { id: modelId },
    local: { cwd: sdkCwd },
  });

  try {
    for (const promptRun of promptRuns) {
      const runResult = await sendCursorSdkPrompt(agent, promptRun.prompt, {
        apiKey,
        modelId,
        sdkCwd,
        turnEndedUsages,
        collectTurnEndedUsageCandidates,
      });
      conversationTurns.push(...runResult.conversationTurns);
      result = runResult.result;
    }
  } finally {
    if (typeof agent[Symbol.asyncDispose] === "function") {
      await agent[Symbol.asyncDispose]();
    } else {
      agent.close();
    }
  }

  const isPartRun = promptRuns.some((item) => item.type !== "full");
  const assembled = assembleIfFragmentsExist(
    { ...context, forceAssembleParts: isPartRun },
    prepared.evidenceSummary,
    prepared.parts,
    isPartRun ? prepared.selectedParts : prepared.parts,
  );
  const fragmentChars = fs.existsSync(prepared.paths.fragmentsPath)
    ? fs.readFileSync(prepared.paths.fragmentsPath, "utf8").length
    : assembled?.chars || 0;
  const resolvedUsage = resolvePhase3bUsage({
    turnEndedUsages,
    conversationTurns,
    agentResult: result,
    charCounts: {
      promptChars: sentPromptChars,
      inlineSummaryChars,
      fragmentChars,
    },
  });
  const sdkUsage = resolvedUsage.sdkUsage;
  const usagePath = writeUsage(
    { ...context, provider: "cursor-sdk" },
    {
      provider: "cursor-sdk",
      startedAt: new Date(started).toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      promptChars: sentPromptChars,
      mainPromptChars: isPartRun ? 0 : prepared.prompt.length,
      partPromptChars: isPartRun ? sentPromptChars : 0,
      generatedPromptPartCount: prepared.parts.length,
      sentPromptRunCount: promptRuns.length,
      sentPromptPartCount: promptRuns.filter((item) => item.type !== "full").length,
      sentPromptRuns,
      inlineSummaryChars,
      pendingReviewChars: assembled?.chars || 0,
      sdkUsage,
      inputTokens: sdkUsage?.inputTokens ?? 0,
      outputTokens: sdkUsage?.outputTokens ?? 0,
      totalTokens: sdkUsage?.totalTokens ?? 0,
      cacheReadTokens: sdkUsage?.cacheReadTokens ?? 0,
      cacheWriteTokens: sdkUsage?.cacheWriteTokens ?? 0,
      usageSource: resolvedUsage.usageSource,
      usageEstimated: resolvedUsage.usageEstimated,
      usageCaptureMethod: resolvedUsage.usageCaptureMethod,
      usageUnavailable: resolvedUsage.usageSource === "unavailable",
    },
  );

  return {
    status: result.status || "completed",
    provider: "cursor-sdk",
    narrativePart: context.narrativePart || context.part || "",
    promptPath: prepared.paths.promptPath,
    skeletonPath: prepared.paths.skeletonPath,
    briefPath: prepared.paths.briefPath,
    fragmentsPath: prepared.paths.fragmentsPath,
    partPrompts: summarizePartPrompts(prepared.selectedParts),
    promptRuns: summarizePromptRuns(promptRuns, { includePaths: true }),
    outputPath: assembled?.outputPath || "",
    usagePath,
    result,
  };
}

async function runCodexProvider() {
  throw new Error("codex provider is reserved but not implemented yet.");
}

async function runPhase3b(context = {}) {
  const provider = context.provider || "manual";
  if (provider === "manual") return runManualProvider(context);
  if (provider === "cursor-sdk") return runCursorSdkProvider(context);
  if (provider === "codex") return runCodexProvider(context);
  throw new Error(`Unknown phase3b provider: ${provider}`);
}

module.exports = {
  assemblePendingReviewMarkdown,
  assembleFragmentsFromParts,
  assembleIfFragmentsExist,
  buildNarrativeBrief,
  buildNarrativeParts,
  buildPhase3bPartPrompt,
  buildPhase3bPrompt,
  buildWhitepaperSkeleton,
  compactEvidenceSummary,
  compactModuleSummary,
  compactOverviewSummary,
  compactWritableClaimGap,
  normalizeNarrativePartSelector,
  resolveCursorApiKey,
  resolveCursorSdkPrompts,
  resolveSdkCwd,
  runPhase3b,
  selectNarrativeParts,
  summarizeQualityReport,
  writePreparationFiles,
  writeUsage,
};
