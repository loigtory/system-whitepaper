const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const {
  isEnvironmentSwitcherMenu,
  isSystemShellMenu,
  isGenericFieldLabel,
  isTechnicalFieldLabel,
  readOptionalJsonObject,
  readRequiredJsonObject,
} = require("../system-whitepaper-lib");

const MAX_SPEC_BYTES = 50 * 1024;

function fingerprintFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
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

function buildSourceArtifact(filePath, status = "ok") {
  return {
    file: filePath ? path.basename(filePath) : "",
    status,
    fingerprint: fingerprintFile(filePath),
  };
}

function buildOperationSpecSourceArtifacts(input = {}) {
  const result = {};
  if (input.evidencePath) result.evidence = buildSourceArtifact(input.evidencePath);
  if (input.evidenceSummaryPath) result.evidenceSummary = buildSourceArtifact(input.evidenceSummaryPath);
  if (input.writeValidationPath) result.writeValidation = buildSourceArtifact(input.writeValidationPath);
  if (input.networkIndexPath) result.networkIndex = buildSourceArtifact(input.networkIndexPath);
  return result;
}

function assertJsonObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

function assertArray(value, message) {
  if (!Array.isArray(value)) {
    throw new Error(message);
  }
}

function assertBoolean(value, message) {
  if (typeof value !== "boolean") {
    throw new Error(message);
  }
}

function assertFiniteNumber(value, message) {
  if (!Number.isFinite(Number(value))) {
    throw new Error(message);
  }
}

function numberFrom(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function assertMetricEquals(metrics = {}, key, expected, fileName, containerName = "metrics") {
  assertFiniteNumber(metrics[key], `${fileName} ${containerName}.${key} must be numeric.`);
  if (Number(metrics[key]) !== expected) {
    throw new Error(`${fileName} ${containerName}.${key} must match the artifact body count.`);
  }
}

function uniqueStrings(values = []) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

function isHomeModuleName(name) {
  const normalized = String(name || "").trim().toLowerCase();
  return normalized === "\u9996\u9875" || normalized === "home" || normalized === "welcome";
}

function pageById(evidence, pageId) {
  return (evidence.pageInventory || []).find((page) => page.id === pageId) || null;
}

function pagesForMenu(evidence, menuName) {
  const target = String(menuName || "").trim();
  return (evidence.pageInventory || []).filter((page) => {
    if (isContainerEvidencePage(page)) return false;
    const menuPath = String(page.menuPath || "").trim();
    const title = String(page.title || "").trim();
    return menuPath === target || title === target || menuPath.endsWith(`> ${target}`);
  });
}

function isPlaceholderSummaryModule(module = {}) {
  const name = String(module.name || "").trim();
  const summary = String(module.summary || "").trim();
  return name === "本地" && /共\s*0\s*个菜单页|已采集\s*0\s*个/.test(summary);
}

function moduleNameFromValidationScenario(scenario = {}) {
  const menuPath = String(scenario.menuPath || "").trim();
  if (menuPath) return menuPath;
  const target = String(scenario.targetName || "").trim().replace(/^AI_AUTO_TEST_/, "");
  if (target) return target;
  return String(scenario.id || "").trim().replace(/^auto-/, "");
}

function collectModuleNames(evidence, writeValidation = null, evidenceSummary = null) {
  const names = [];
  for (const menu of evidence.menuMap || []) {
    if (isEnvironmentSwitcherMenu(menu) || isSystemShellMenu(menu)) continue;
    names.push(menu.menuPath || menu.title);
  }
  for (const page of evidence.pageInventory || []) {
    if (page.type === "home") continue;
    if (isContainerEvidencePage(page)) continue;
    if (page.menuPath) names.push(page.menuPath);
  }
  for (const scenario of writeValidation?.scenarios || []) {
    const scenarioModule = moduleNameFromValidationScenario(scenario);
    if (scenarioModule) names.push(scenarioModule);
  }
  for (const module of evidence.modules || []) {
    if (module.name) names.push(module.name);
  }
  for (const module of evidenceSummary?.modules || []) {
    if (module.name && !isPlaceholderSummaryModule(module)) names.push(module.name);
  }
  for (const fn of evidenceSummary?.functions || []) {
    if (fn.module) names.push(fn.module);
    else if (fn.menuPath) names.push(String(fn.menuPath).split(">").map((item) => item.trim()).filter(Boolean)[0]);
  }
  for (const shot of evidenceSummary?.screenshots || []) {
    if (shot.module) names.push(shot.module);
    else if (shot.function) names.push(shot.function);
  }
  return uniqueStrings(names).filter((name) => !isHomeModuleName(name));
}

function inferModuleBusinessHint(module) {
  const columns = module.list?.columns || [];
  const flowNames = (module.flows || []).map((flow) => flow.name);
  const fieldLabels = uniqueStrings(
    (module.flows || []).flatMap((flow) =>
      (flow.steps || []).flatMap((step) => (step.fields || []).map((field) => field.label)),
    ),
  );
  const tokens = uniqueStrings([...columns.slice(0, 4), ...flowNames, ...fieldLabels.slice(0, 6)]);
  if (!tokens.length) return "";
  return `围绕${tokens.slice(0, 5).join("、")}等能力展开（依据页面结构归纳，待业务确认）。`;
}

function normalizeOperationText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, "$1$2")
    .trim();
}

function confidenceRank(value) {
  return { high: 3, medium: 2, low: 1 }[value] || 0;
}

function maxConfidence(...values) {
  return values.reduce(
    (best, value) => (confidenceRank(value) > confidenceRank(best) ? value : best),
    "low",
  );
}

function containsColumn(columns = [], fieldName) {
  const target = normalizeOperationText(fieldName);
  return columns.some((column) => normalizeOperationText(column) === target);
}

function evidenceLine(kind, value) {
  const text = normalizeOperationText(value);
  return text ? `${kind}:${text}` : "";
}

const FILTER_OPTION_RULES = [
  {
    field: "需求状态",
    semanticType: "lifecycle-status",
    dimensionType: "demand-lifecycle",
    options: ["需求已完成", "需求待生效", "需求生效"],
  },
  {
    field: "配置质量",
    semanticType: "quality-status",
    dimensionType: "configuration-quality",
    options: ["高风险", "需关注", "良好"],
  },
  {
    field: "接口方式",
    semanticType: "integration-mode",
    dimensionType: "interface-mode",
    options: ["实时回调", "查询接口", "获取文件", "分支共用"],
  },
  {
    field: "任务类型",
    semanticType: "business-type",
    dimensionType: "task-type",
    options: [
      "保全退保",
      "线下单退保",
      "回访",
      "续期",
      "续保",
      "保单状态",
      "线下单承保",
      "线下单回执",
      "理赔",
      "保全批改",
      "星星-回访",
      "fifi-续期",
      "fifi续保",
      "石花-回执",
    ],
  },
];

const BUSINESS_DIMENSION_RULES = [
  {
    field: "保险公司",
    dimensionType: "insurance-company",
    meaning: "保险公司/保司维度",
  },
  {
    field: "任务类型",
    dimensionType: "task-type",
    meaning: "任务类型维度",
  },
  {
    field: "接口方式",
    dimensionType: "interface-mode",
    meaning: "接口方式维度",
  },
];

const KNOWN_ACTION_LABELS = [
  "配置历史",
  "新建AI任务",
  "新增AI任务",
  "新建",
  "新增",
  "编辑",
  "查看",
  "详情",
  "质量",
  "删除",
  "启用",
  "禁用",
  "关闭",
  "开启",
  "处理",
  "导出",
  "下载",
  "复制",
  "发布",
  "撤回",
  "提交",
  "审核",
  "审批",
  "重试",
  "同步",
  "查询",
  "重置",
  "保存",
  "确定",
  "取消",
  "下一步",
  "完成",
];

function stripSelectPlaceholder(raw) {
  return normalizeOperationText(raw)
    .replace(/^全部[（(][^)）]+[)）]/, "")
    .replace(/^全部/, "")
    .replace(/^请选择/, "")
    .replace(/^请输入/, "")
    .trim();
}

function normalizeControlType(value) {
  const control = normalizeOperationText(value).toLowerCase();
  if (control === "text" || control === "input") return "input";
  if (control === "select" || control === "combobox") return "select";
  return control || "unknown";
}

function optionsPresentInText(raw, options = []) {
  const text = normalizeOperationText(raw);
  return options.filter((option) => text.includes(option));
}

function filterEvidence(raw, fieldName) {
  return uniqueStrings([
    evidenceLine("列表列", fieldName),
    evidenceLine("筛选控件", raw),
  ]).slice(0, 4);
}

function inferFilterFromRawField(rawField = {}, columns = []) {
  const raw = normalizeOperationText(rawField.label || rawField.name || rawField);
  if (!raw) return null;
  const control = normalizeControlType(rawField.type || rawField.control);
  if (/输入关键字|关键字|搜索/.test(raw)) {
    return {
      field: "关键字",
      label: "关键字",
      control: control === "unknown" ? "input" : control,
      semanticType: "keyword-search",
      enumOptions: [],
      confidence: "medium",
      evidence: [evidenceLine("筛选控件", raw)].filter(Boolean),
    };
  }
  if (/^(全部|请选择|请输入)$/.test(raw)) return null;

  for (const rule of FILTER_OPTION_RULES) {
    if (!containsColumn(columns, rule.field) && !raw.includes(rule.field)) continue;
    const options = optionsPresentInText(raw, rule.options);
    if (!options.length) continue;
    const enumOptions = raw.startsWith("全部") ? uniqueStrings(["全部", ...options]) : options;
    return {
      field: rule.field,
      label: rule.field,
      control: control === "unknown" ? "select" : control,
      semanticType: rule.semanticType,
      dimensionType: rule.dimensionType,
      enumOptions,
      confidence: options.length >= 2 || containsColumn(columns, rule.field) ? "high" : "medium",
      evidence: filterEvidence(raw, rule.field),
    };
  }

  const remainder = stripSelectPlaceholder(raw);
  if (
    remainder &&
    containsColumn(columns, "保险公司") &&
    /^(全部|请选择)/.test(raw) &&
    remainder.length <= 24 &&
    /[\u4e00-\u9fff]/.test(remainder)
  ) {
    return {
      field: "保险公司",
      label: "保险公司",
      control: control === "unknown" ? "select" : control,
      semanticType: "business-party",
      dimensionType: "insurance-company",
      enumOptions: raw.startsWith("全部") ? uniqueStrings(["全部", remainder]) : [remainder],
      confidence: "medium",
      evidence: filterEvidence(raw, "保险公司"),
    };
  }

  return null;
}

function cleanQueryFieldLabel(rawField = {}, columns = []) {
  const raw = normalizeOperationText(rawField.label || rawField.name || rawField);
  if (!raw) return "";
  const filter = inferFilterFromRawField(rawField, columns);
  if (filter) return filter.label || filter.field;
  if (/^(全部|请选择|请输入)$/.test(raw)) return "";
  const stripped = stripSelectPlaceholder(raw);
  const candidate = stripped || raw.replace(/[：:]\s*$/, "");
  if (!candidate || candidate.length > 32) return "";
  if (/^(全部|请选择|请输入)$/.test(candidate)) return "";
  if (isTechnicalFieldLabel(candidate) || isGenericFieldLabel(candidate)) return "";
  return candidate;
}

function mergeSemanticFilters(filters = []) {
  const byField = new Map();
  for (const filter of filters) {
    const field = normalizeOperationText(filter.field || filter.label);
    if (!field) continue;
    const existing = byField.get(field);
    if (!existing) {
      byField.set(field, {
        ...filter,
        field,
        label: filter.label || field,
        enumOptions: uniqueStrings(filter.enumOptions || []),
        evidence: uniqueStrings(filter.evidence || []).slice(0, 4),
      });
      continue;
    }
    existing.enumOptions = uniqueStrings([
      ...(existing.enumOptions || []),
      ...(filter.enumOptions || []),
    ]).slice(0, 16);
    existing.evidence = uniqueStrings([
      ...(existing.evidence || []),
      ...(filter.evidence || []),
    ]).slice(0, 4);
    existing.confidence = maxConfidence(existing.confidence, filter.confidence);
    existing.semanticType = existing.semanticType || filter.semanticType || "";
    existing.dimensionType = existing.dimensionType || filter.dimensionType || "";
    if (existing.control === "unknown" && filter.control) existing.control = filter.control;
  }
  return Array.from(byField.values());
}

function buildQueryFieldAnalysis(rawFields = [], columns = []) {
  const filters = [];
  const queryFields = [];
  for (const rawField of rawFields) {
    const raw = normalizeOperationText(rawField?.label || rawField?.name || rawField);
    if (!raw) continue;
    if (isTechnicalFieldLabel(raw)) continue;
    const filter = inferFilterFromRawField(rawField, columns);
    if (filter) {
      filters.push(filter);
      queryFields.push(filter.label || filter.field);
      continue;
    }
    const label = cleanQueryFieldLabel(rawField, columns);
    if (label) queryFields.push(label);
  }

  const mergedFilters = mergeSemanticFilters(filters).slice(0, 12);
  const enumOptions = {};
  for (const filter of mergedFilters) {
    if ((filter.enumOptions || []).length) {
      enumOptions[filter.field] = (filter.enumOptions || []).slice(0, 16);
    }
  }

  return {
    queryFields: uniqueStrings([
      ...queryFields,
      ...mergedFilters.map((filter) => filter.label || filter.field),
    ]).slice(0, 12),
    filters: mergedFilters,
    enumOptions,
  };
}

function splitActionLabels(value) {
  const raw = String(value || "");
  const chunks = raw
    .split(/[\r\n\t/、,，;；|]+/)
    .map((chunk) => normalizeOperationText(chunk))
    .filter(Boolean);
  const labels = [];
  const sourceChunks = chunks.length ? chunks : [normalizeOperationText(raw)].filter(Boolean);
  for (const chunk of sourceChunks) {
    if (/^\d+$/.test(chunk) || /^[×xX]$/.test(chunk)) continue;
    const matched = KNOWN_ACTION_LABELS
      .filter((label) => chunk.includes(label))
      .sort((left, right) => chunk.indexOf(left) - chunk.indexOf(right) || right.length - left.length);
    if (matched.length >= 2) {
      labels.push(...matched);
    } else {
      labels.push(chunk);
    }
  }
  return uniqueStrings(labels);
}

function isBusinessRowAction(label) {
  return /^(编辑|查看|详情|删除|启用|禁用|关闭|开启|处理|导出|下载|质量|配置历史|复制|发布|撤回|提交|审核|审批|重试|同步)$/.test(
    normalizeOperationText(label),
  );
}

function isSemanticBusinessAction(label) {
  const text = normalizeOperationText(label);
  return isBusinessRowAction(text) || /新建|新增|创建|发布|提交|审核|审批|保存|下一步|完成/.test(text);
}

function buildRowActions(actions = []) {
  return uniqueStrings(
    actions
      .flatMap((action) => splitActionLabels(action.name))
      .filter((label) => isBusinessRowAction(label)),
  );
}

function isOverviewModuleName(name) {
  const text = normalizeOperationText(name).toLowerCase();
  if (isHomeModuleName(text)) return true;
  if (!text) return false;
  return /首页|导航|欢迎|工作台|门户|系统入口|控制台|总览|概览|dashboard|welcome/.test(text);
}

function classifyModuleSurface(input = {}) {
  const {
    name,
    pages = [],
    columns = [],
    queryFields = [],
    filters = [],
    rowActions = [],
    flows = [],
    plannedFlows = [],
    screenshots = [],
  } = input;
  if (isOverviewModuleName(name) || pages.some((page) => page.type === "home")) return "overview";
  if (flows.length) return "business-flow";
  if (columns.length || queryFields.length || filters.length || rowActions.length) return "business-list";
  if (plannedFlows.length) return "business-workflow-candidate";
  if (screenshots.length) return "business-surface";
  return "unknown";
}

function isCoreBusinessSurface(name, surfaceType) {
  return !isOverviewModuleName(name) && surfaceType !== "overview";
}

function isCoreOperationModule(module = {}) {
  if (!module || typeof module !== "object") return false;
  if (module.coreBusinessModule === false) return false;
  return isCoreBusinessSurface(module.name, module.surfaceType || "");
}

function optionsForField(filters = [], fieldName) {
  const target = normalizeOperationText(fieldName);
  const filter = filters.find((item) => normalizeOperationText(item.field || item.label) === target);
  return filter ? uniqueStrings(filter.enumOptions || []) : [];
}

function evidenceForField(columns = [], filters = [], fieldName) {
  const target = normalizeOperationText(fieldName);
  const evidence = [];
  if (containsColumn(columns, target)) evidence.push(evidenceLine("列表列", target));
  const filter = filters.find((item) => normalizeOperationText(item.field || item.label) === target);
  if (filter) evidence.push(...(filter.evidence || []));
  return uniqueStrings(evidence).slice(0, 5);
}

function inferBusinessDimensions(columns = [], filters = []) {
  return BUSINESS_DIMENSION_RULES
    .filter((rule) => containsColumn(columns, rule.field))
    .map((rule) => {
      const enumOptions = optionsForField(filters, rule.field);
      return {
        field: rule.field,
        dimensionType: rule.dimensionType,
        meaning: rule.meaning,
        enumOptions,
        confidence: enumOptions.length ? "high" : "medium",
        evidence: evidenceForField(columns, filters, rule.field),
      };
    });
}

function inferLifecycleSignals(columns = [], filters = []) {
  return columns
    .filter((column) => /状态|阶段|进度/.test(column) && !/质量|风险/.test(column))
    .map((field) => {
      const enumOptions = optionsForField(filters, field);
      return {
        field,
        signalType: field === "需求状态" ? "demand-lifecycle-status" : "lifecycle-status",
        enumOptions,
        confidence: enumOptions.length ? "high" : "medium",
        evidence: evidenceForField(columns, filters, field),
      };
    });
}

function inferQualitySignals(columns = [], filters = [], rowActions = []) {
  const signals = columns
    .filter((column) => /质量|风险|评分|评级/.test(column))
    .map((field) => {
      const enumOptions = optionsForField(filters, field);
      return {
        field,
        signalType: field === "配置质量" ? "configuration-quality-status" : "quality-status",
        enumOptions,
        confidence: enumOptions.length ? "high" : "medium",
        evidence: evidenceForField(columns, filters, field),
      };
    });
  if (rowActions.includes("质量") && !signals.some((signal) => signal.field === "质量")) {
    signals.push({
      field: "质量",
      signalType: "quality-action",
      enumOptions: [],
      confidence: "medium",
      evidence: [evidenceLine("操作", "质量")],
    });
  }
  return signals;
}

function inferBusinessObject(name, columns = [], actionLabels = []) {
  const haystack = `${name} ${columns.join(" ")} ${actionLabels.join(" ")}`;
  if (/元数据/.test(haystack)) {
    return { value: "元数据", confidence: "high", evidence: [evidenceLine("菜单", name)].filter(Boolean) };
  }
  if (/发布/.test(name)) {
    return { value: "AI发布", confidence: "high", evidence: [evidenceLine("菜单", name)].filter(Boolean) };
  }
  if (/监控|观测/.test(name)) {
    return { value: "运行观测数据", confidence: "high", evidence: [evidenceLine("菜单", name)].filter(Boolean) };
  }
  if (/AI任务|任务/.test(haystack)) {
    return {
      value: /AI任务/.test(haystack) ? "AI任务" : "任务记录",
      confidence: /AI任务/.test(haystack) ? "high" : "medium",
      evidence: uniqueStrings([
        evidenceLine("菜单", name),
        containsColumn(columns, "任务类型") ? evidenceLine("列表列", "任务类型") : "",
        actionLabels.find((label) => /新建AI任务/.test(label)) ? evidenceLine("操作", "新建AI任务") : "",
      ]).slice(0, 4),
    };
  }
  if (containsColumn(columns, "保险公司") && containsColumn(columns, "接口方式")) {
    return {
      value: "保司接口配置记录",
      confidence: "medium",
      evidence: [evidenceLine("列表列", "保险公司"), evidenceLine("列表列", "接口方式")],
    };
  }
  return {
    value: normalizeOperationText(name) || "业务对象",
    confidence: "low",
    evidence: [evidenceLine("菜单", name)].filter(Boolean),
  };
}

function inferBusinessRole(name, surfaceType, columns = [], actionLabels = []) {
  if (surfaceType === "overview") {
    return {
      value: "系统概览与导航入口",
      confidence: "high",
      evidence: [evidenceLine("页面类型", "overview"), evidenceLine("菜单", name)].filter(Boolean),
    };
  }
  const evidence = uniqueStrings([
    evidenceLine("菜单", name),
    ...columns.slice(0, 4).map((column) => evidenceLine("列表列", column)),
    ...actionLabels.slice(0, 4).map((label) => evidenceLine("操作", label)),
  ]).slice(0, 6);
  if (/发布/.test(name)) {
    return { value: "发布管理与上线控制", confidence: "high", evidence };
  }
  if (/监控|观测/.test(name)) {
    return { value: "数据与运行观测", confidence: "high", evidence };
  }
  if (/元数据/.test(name)) {
    return { value: "元数据维护", confidence: "high", evidence };
  }
  if (/任务/.test(name) || containsColumn(columns, "任务类型")) {
    return {
      value: containsColumn(columns, "需求状态")
        ? "任务配置与需求生命周期跟踪"
        : "任务配置与维护",
      confidence: "medium",
      evidence,
    };
  }
  if (actionLabels.some((label) => /新建|新增|编辑|删除/.test(label))) {
    return { value: "业务对象维护", confidence: "medium", evidence };
  }
  if (columns.length || surfaceType === "business-list") {
    return { value: "业务对象查询与筛选", confidence: "medium", evidence };
  }
  return { value: "业务页面", confidence: "low", evidence };
}

function inferHandoffHints(input = {}) {
  const { columns = [], filters = [], rowActions = [], lifecycleSignals = [], qualitySignals = [] } = input;
  const hints = [];
  const demandSignal = lifecycleSignals.find((signal) => signal.field === "需求状态");
  if (demandSignal) {
    const values = (demandSignal.enumOptions || []).filter((value) => value !== "全部");
    hints.push({
      hint: values.length
        ? `需求状态包含${values.join("、")}，可作为需求生命周期交接线索。`
        : "需求状态字段可作为需求生命周期交接线索。",
      confidence: values.length ? "high" : "medium",
      evidence: demandSignal.evidence || [evidenceLine("列表列", "需求状态")],
    });
  }
  if (containsColumn(columns, "接口方式")) {
    const values = optionsForField(filters, "接口方式").filter((value) => value !== "全部");
    hints.push({
      hint: values.length
        ? `接口方式包含${values.join("、")}，可用于说明系统对接方式差异。`
        : "接口方式字段可用于说明系统对接方式差异。",
      confidence: values.length ? "high" : "medium",
      evidence: evidenceForField(columns, filters, "接口方式"),
    });
  }
  if (rowActions.includes("配置历史")) {
    hints.push({
      hint: "配置历史操作表明页面存在配置变更追溯入口。",
      confidence: "medium",
      evidence: [evidenceLine("操作", "配置历史")],
    });
  }
  const qualitySignal = qualitySignals.find((signal) => signal.field === "配置质量");
  if (qualitySignal && rowActions.includes("质量")) {
    hints.push({
      hint: "配置质量字段与质量操作共同指向质量核查入口。",
      confidence: "medium",
      evidence: uniqueStrings([...(qualitySignal.evidence || []), evidenceLine("操作", "质量")]),
    });
  }
  return hints.slice(0, 6);
}

function buildModuleSemanticProfile(input = {}) {
  const {
    name,
    surfaceType,
    columns = [],
    filters = [],
    rowActions = [],
    actions = [],
  } = input;
  const actionLabels = uniqueStrings([
    ...rowActions,
    ...actions.flatMap((action) => splitActionLabels(action.name)).filter(isSemanticBusinessAction),
  ]);
  const businessDimensions = inferBusinessDimensions(columns, filters);
  const lifecycleSignals = inferLifecycleSignals(columns, filters);
  const qualitySignals = inferQualitySignals(columns, filters, rowActions);
  return {
    businessRole: inferBusinessRole(name, surfaceType, columns, actionLabels),
    businessObject: inferBusinessObject(name, columns, actionLabels),
    businessDimensions,
    lifecycleSignals,
    qualitySignals,
    handoffHints: inferHandoffHints({
      columns,
      filters,
      rowActions,
      lifecycleSignals,
      qualitySignals,
    }),
  };
}

function mapApisForContext(networkIndex, hints = []) {
  const entries = networkIndex?.entries || [];
  const normalizedHints = hints.map((item) => String(item || "").toLowerCase()).filter(Boolean);
  return entries
    .filter((entry) => {
      if (!normalizedHints.length) return true;
      const haystack = `${entry.url} ${(entry.schemaKeys || []).join(" ")}`.toLowerCase();
      return normalizedHints.some((hint) => haystack.includes(hint));
    })
    .slice(0, 8)
    .map((entry) => ({
      method: entry.method,
      url: entry.url,
      schemaKeys: (entry.schemaKeys || []).slice(0, 12),
    }));
}

function buildFlowFromValidationScenario(scenario, networkIndex) {
  const fields = [];
  if (scenario.filledFieldCount > 0) {
    fields.push({
      label: "测试数据字段",
      required: true,
      control: "input",
      note: `已填写 ${scenario.filledFieldCount} 项，值含 AI_AUTO_TEST_ 前缀`,
    });
  }
  return {
    name: scenario.buttonText ? `${scenario.buttonText}` : "试业务操作",
    trigger: scenario.buttonText || "新建",
    status: scenario.status || "planned",
    reason: scenario.reason || "",
    steps: [
      {
        title: "表单填写",
        fields,
        buttons: uniqueStrings([
          scenario.submitButton,
          "下一步",
          "保存",
          "确定",
          "提交",
          "完成",
        ]).filter(Boolean),
        screenshots: scenario.screenshotPath ? [scenario.screenshotPath] : [],
        apis: mapApisForContext(networkIndex, [scenario.menuPath, "options", "companies"]),
        validation: {
          status: scenario.status || "",
          filledFieldCount: Number(scenario.filledFieldCount || 0),
          filledValue: scenario.filledValue || "",
        },
      },
    ],
  };
}

function isContainerEvidencePage(page = {}) {
  const type = String(page.type || "").trim().toLowerCase();
  return ["container", "modal", "drawer", "dialog", "popover", "stepper"].includes(type);
}

function containerStepOrder(page = {}, fallbackIndex = 0) {
  for (const key of ["order", "stepOrder", "index", "sequence"]) {
    const number = Number(page[key]);
    if (Number.isFinite(number)) return number;
  }
  return fallbackIndex;
}

function containerPagesForSourcePages(evidence = {}, sourcePageIds = new Set()) {
  return (evidence.pageInventory || [])
    .map((page, index) => ({ page, index }))
    .filter(({ page }) => isContainerEvidencePage(page) && sourcePageIds.has(page.sourcePageId))
    .sort((left, right) => {
      const leftOrder = containerStepOrder(left.page, left.index);
      const rightOrder = containerStepOrder(right.page, right.index);
      return leftOrder - rightOrder || left.index - right.index;
    })
    .map(({ page }) => page);
}

function fieldsForForms(forms = []) {
  const byKey = new Map();
  for (const field of forms.flatMap((form) => form.fields || [])) {
    const label = normalizeOperationText(field.label || field.name);
    if (!label || isTechnicalFieldLabel(label)) continue;
    const control = normalizeControlType(field.type || field.control);
    const key = `${label}\u0000${control}`;
    if (byKey.has(key)) continue;
    byKey.set(key, {
      label,
      required: Boolean(field.required),
      control,
    });
  }
  return Array.from(byKey.values());
}

function buttonsForActions(actions = []) {
  return uniqueStrings(actions.flatMap((action) => splitActionLabels(action.name)))
    .filter((label) => !/^[×xX]$/.test(label))
    .filter((label) => !/^(取消|关闭|返回)$/.test(label) || actions.length === 1)
    .slice(0, 12);
}

function isFlowProgressButton(label) {
  return /^(下一步|上一步|保存|确定|提交|完成|生成|发布|确认|开始|执行|运行)$/.test(
    normalizeOperationText(label),
  );
}

function inferContainerFlowTrigger(moduleActions = [], containers = []) {
  const explicitTrigger = uniqueStrings(
    containers.map((page) => page.triggerLabel || page.triggerText || page.trigger || ""),
  )[0];
  if (explicitTrigger) return explicitTrigger;
  const labels = uniqueStrings(moduleActions.flatMap((action) => splitActionLabels(action.name)));
  const createLabel = labels.find((label) => /新建|新增|创建/.test(label));
  if (createLabel) return createLabel;
  const semanticLabel = labels.find((label) => isSemanticBusinessAction(label));
  if (semanticLabel) return semanticLabel;
  const containerMenu = normalizeOperationText(containers.find((page) => page.menuPath)?.menuPath);
  if (containerMenu) return containerMenu;
  return normalizeOperationText(containers[0]?.title) || "页面容器流程";
}

function buildFlowFromContainerEvidence(input = {}) {
  const {
    containers = [],
    forms = [],
    actions = [],
    tables = [],
    moduleActions = [],
    networkIndex = null,
  } = input;
  if (!containers.length) return null;
  const containerIds = new Set(containers.map((page) => page.id).filter(Boolean));
  const relevantForms = forms.filter((form) => containerIds.has(form.pageId));
  const relevantActions = actions.filter((action) => containerIds.has(action.pageId));
  const relevantTables = tables.filter((table) => containerIds.has(table.pageId));
  const flowButtons = buttonsForActions(relevantActions).filter(isFlowProgressButton);
  const trigger = inferContainerFlowTrigger(moduleActions, containers);
  const hasBusinessTrigger = /新建|新增|创建|编辑|发布|提交|配置|生成|执行|运行|上传|导入/.test(trigger);
  const hasStepEvidence =
    relevantForms.some((form) => (form.fields || []).length) ||
    relevantTables.some((table) => (table.columns || []).length) ||
    flowButtons.length > 0;
  if (!hasBusinessTrigger || !hasStepEvidence) return null;

  const steps = containers
    .map((container, index) => {
      const pageForms = relevantForms.filter((form) => form.pageId === container.id);
      const pageActions = relevantActions.filter((action) => action.pageId === container.id);
      const pageTables = relevantTables.filter((table) => table.pageId === container.id);
      const fields = fieldsForForms(pageForms);
      const columns = uniqueStrings(pageTables.flatMap((table) => table.columns || []));
      const title = normalizeOperationText(container.title || container.menuPath) || `步骤 ${index + 1}`;
      return {
        title,
        fields,
        buttons: buttonsForActions(pageActions),
        tables: columns.length ? [{ columns }] : [],
        screenshots: uniqueStrings([container.screenshot, ...(container.screenshots || [])]),
        apis: mapApisForContext(networkIndex, [trigger, title, ...fields.map((field) => field.label)]),
        validation: {
          status: "observed",
          filledFieldCount: 0,
          source: "container-evidence",
        },
      };
    })
    .filter((step) =>
      step.fields.length ||
      step.buttons.length ||
      step.tables.length ||
      step.screenshots.length,
    );
  if (!steps.length) return null;
  return {
    name: trigger,
    trigger,
    status: "observed",
    reason: "依据页面容器/弹窗/抽屉截图与字段证据归纳，未执行真实提交。",
    steps,
  };
}

function groupContainerPagesByTrigger(containers = []) {
  const groups = new Map();
  for (const container of containers) {
    const triggerKey =
      container.triggerActionId ||
      [
        container.sourcePageId,
        container.triggerLabel || container.triggerText || container.trigger || container.menuPath,
      ]
        .filter(Boolean)
        .join("::") ||
      "__default__";
    const key = normalizeOperationText(triggerKey);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(container);
  }
  return Array.from(groups.values());
}

function buildFlowsFromContainerEvidence(input = {}) {
  return groupContainerPagesByTrigger(input.containers || [])
    .map((containers) => buildFlowFromContainerEvidence({ ...input, containers }))
    .filter(Boolean);
}

function scenarioHasObservedFlowEvidence(scenario = {}) {
  const status = String(scenario.status || "").trim().toLowerCase();
  if (status && status !== "planned") return true;
  if (Number(scenario.filledFieldCount || 0) > 0) return true;
  if (String(scenario.screenshotPath || "").trim()) return true;
  return false;
}

function buildPlannedFlowFromValidationScenario(scenario = {}) {
  return {
    name: scenario.buttonText ? `${scenario.buttonText}` : "试业务操作",
    trigger: scenario.buttonText || scenario.action || "新建",
    status: scenario.status || "planned",
    reason: scenario.reason || "仅生成计划，未形成可写入主流程的页面操作证据。",
  };
}

function flowIdentity(value = {}) {
  return normalizeOperationText(`${value.name || ""} ${value.trigger || ""}`).toLowerCase();
}

function plannedFlowCoveredByObserved(planned = {}, observedFlows = []) {
  if (!observedFlows.length) return false;
  const plannedName = normalizeOperationText(planned.name || "");
  const plannedTrigger = normalizeOperationText(planned.trigger || "");
  const plannedKey = flowIdentity(planned);
  return observedFlows.some((flow) => {
    const flowName = normalizeOperationText(flow.name || "");
    const flowTrigger = normalizeOperationText(flow.trigger || "");
    if (plannedKey && plannedKey === flowIdentity(flow)) return true;
    if (plannedName && (plannedName === flowName || plannedName === flowTrigger)) return true;
    if (plannedTrigger && (plannedTrigger === flowName || plannedTrigger === flowTrigger)) return true;
    return false;
  });
}

function prunePlannedFlowsCoveredByObserved(plannedFlows = [], observedFlows = []) {
  const remaining = [];
  let genericCreateCredits = observedFlows.filter((flow) => /新建|新增|创建/.test(`${flow.name || ""} ${flow.trigger || ""}`)).length;
  for (const flow of plannedFlows) {
    if (plannedFlowCoveredByObserved(flow, observedFlows)) continue;
    const trigger = normalizeOperationText(flow.trigger || "");
    if (/^(create|new|新增|新建|创建)$/.test(trigger) && genericCreateCredits > 0) {
      genericCreateCredits -= 1;
      continue;
    }
    remaining.push(flow);
  }
  return remaining;
}

function resolveModuleBusinessHint(name, module, system = {}, evidenceSummary = null) {
  const hints = system.moduleBusinessHints;
  if (hints && typeof hints === "object" && hints[name]) {
    return String(hints[name]).trim();
  }
  const summaryModule = (evidenceSummary?.modules || []).find((item) => item.name === name);
  if (summaryModule?.summary && !isPlaceholderSummaryModule(summaryModule)) {
    return String(summaryModule.summary).trim();
  }
  return inferModuleBusinessHint(module);
}

function buildModuleSpec(name, evidence, writeValidation, networkIndex, system = {}, evidenceSummary = null) {
  const pages = pagesForMenu(evidence, name);
  const pageIds = new Set(pages.map((page) => page.id));
  const containerPages = containerPagesForSourcePages(evidence, pageIds);
  const containerPageIds = new Set(containerPages.map((page) => page.id));
  const tables = (evidence.tableInventory || []).filter((table) => pageIds.has(table.pageId));
  const containerTables = (evidence.tableInventory || []).filter((table) => containerPageIds.has(table.pageId));
  const forms = (evidence.formInventory || []).filter((form) => pageIds.has(form.pageId));
  const containerForms = (evidence.formInventory || []).filter((form) => containerPageIds.has(form.pageId));
  const actions = (evidence.actionInventory || []).filter((action) => pageIds.has(action.pageId));
  const containerActions = (evidence.actionInventory || []).filter((action) => containerPageIds.has(action.pageId));
  const summaryFunctions = (evidenceSummary?.functions || []).filter((fn) => {
    const haystack = `${fn.module || ""} ${fn.name || ""} ${fn.menuPath || ""}`;
    return haystack.includes(name);
  });
  const summaryScreenshots = (evidenceSummary?.screenshots || []).filter((shot) => {
    const haystack = `${shot.module || ""} ${shot.function || ""} ${shot.caption || ""}`;
    return haystack.includes(name);
  });
  const columns = uniqueStrings(
    tables.flatMap((table) => table.columns || []).concat(
      summaryFunctions.flatMap((fn) => fn.tableColumns || []),
    ),
  );
  const rawQueryFields = forms
    .flatMap((form) => (form.fields || []).map((field) => ({
      label: field.label,
      type: field.type || field.control,
      required: Boolean(field.required),
    })))
    .concat(
      summaryFunctions.flatMap((fn) =>
        (fn.queryFields || []).map((label) => ({
          label,
          type: "",
          required: false,
        })),
      ),
    );
  const queryAnalysis = buildQueryFieldAnalysis(rawQueryFields, columns);
  const rowActions = buildRowActions(actions);
  const screenshots = uniqueStrings(
    pages.map((page) => page.screenshot).concat(
      containerPages.map((page) => page.screenshot),
      (evidence.screenshotIndex || [])
        .filter((shot) => shot.module === name || shot.function === name)
        .map((shot) => shot.file),
      summaryScreenshots.map((shot) => shot.file),
    ),
  );
  const validationScenarios = (writeValidation?.scenarios || [])
    .filter((scenario) => moduleNameFromValidationScenario(scenario) === name);
  const validationFlows = validationScenarios
    .filter((scenario) => scenarioHasObservedFlowEvidence(scenario))
    .map((scenario) => buildFlowFromValidationScenario(scenario, networkIndex));
  const containerFlows = buildFlowsFromContainerEvidence({
    containers: containerPages,
    forms: containerForms,
    actions: containerActions,
    tables: containerTables,
    moduleActions: actions,
    networkIndex,
  });
  const flows = [...validationFlows, ...containerFlows].filter(Boolean);
  const plannedFlows = prunePlannedFlowsCoveredByObserved(validationScenarios
    .filter((scenario) => !scenarioHasObservedFlowEvidence(scenario))
    .map(buildPlannedFlowFromValidationScenario), flows);
  const surfaceType = classifyModuleSurface({
    name,
    pages,
    columns,
    queryFields: queryAnalysis.queryFields,
    filters: queryAnalysis.filters,
    rowActions,
    flows,
    plannedFlows,
    screenshots,
  });
  const semanticProfile = buildModuleSemanticProfile({
    name,
    surfaceType,
    columns,
    filters: queryAnalysis.filters,
    rowActions,
    actions: [...actions, ...containerActions],
  });

  const fallbackQueryFields = uniqueStrings(
    rawQueryFields
      .map((field) => cleanQueryFieldLabel(field, columns))
      .filter(Boolean),
  ).slice(0, 12);

  const module = {
    name,
    entry: `左侧「${name}」`,
    surfaceType,
    coreBusinessModule: isCoreBusinessSurface(name, surfaceType),
    businessHint: "",
    ...semanticProfile,
    list: {
      columns,
      queryFields: queryAnalysis.queryFields.length ? queryAnalysis.queryFields : fallbackQueryFields,
      filters: queryAnalysis.filters,
      enumOptions: queryAnalysis.enumOptions,
      rowActions,
      note: columns.length ? "" : "本轮未采集到列表列，待补采集。",
    },
    flows,
    plannedFlows,
    tabs: uniqueStrings(
      containerPages.map((page) => page.title),
    ),
    screenshots,
    apis: mapApisForContext(networkIndex, [name]),
  };
  module.businessHint = resolveModuleBusinessHint(name, module, system, evidenceSummary);
  return module;
}

function extractRichHomeText(homePage) {
  if (!homePage) return "";
  const areas = (homePage.mainAreas || []).join(" ");
  const title = String(homePage.title || "");
  const combined = `${title} ${areas}`.trim();
  if (combined.length < 30) return "";
  return combined.slice(0, 240);
}

function buildModuleAggregateHint(evidence, writeValidation, evidenceSummary = null) {
  const names = collectModuleNames(evidence, writeValidation, evidenceSummary);
  const columns = uniqueStrings(
    (evidence.tableInventory || []).flatMap((table) => table.columns || []).concat(
      (evidenceSummary?.functions || []).flatMap((fn) => fn.tableColumns || []),
    ),
  );
  const actions = uniqueStrings(
    (writeValidation?.scenarios || []).map((scenario) => scenario.menuPath),
  );
  const chunks = uniqueStrings([...names.slice(0, 6), ...columns.slice(0, 4), ...actions.slice(0, 4)]);
  if (chunks.length < 2) return "";
  return `平台提供${chunks.slice(0, 6).join("、")}等功能入口（依据菜单与页面结构归纳，非官方口径）。`;
}

function resolvePositioning(evidence, system = {}, writeValidation = null, evidenceSummary = null) {
  const sources = [];
  let text = "";
  let confidence = "low";

  if (system.businessHint) {
    sources.push({ type: "registry", weight: 0.4 });
    text = String(system.businessHint).trim();
    confidence = "high";
  }

  const aggregate = buildModuleAggregateHint(evidence, writeValidation, evidenceSummary);
  if (aggregate) {
    sources.push({ type: "module-aggregate", weight: 0.4 });
    if (!text) {
      text = aggregate;
      confidence = "medium";
    }
  }

  const homePage = (evidence.pageInventory || []).find((page) => page.type === "home");
  const homeText = extractRichHomeText(homePage);
  if (homeText) {
    sources.push({ type: "homepage-text", weight: 0.2, note: "rich-home" });
    if (!text) {
      text = homeText;
      confidence = "medium";
    }
  }

  if (!text) {
    text = `${system.name || evidence.systemInfo?.name || "本系统"}：已采集部分菜单与页面结构，业务定位待确认。`;
    confidence = "low";
  }

  if (confidence === "low") {
    text = `${text}（待业务确认）`;
  }

  return { text, confidence, sources };
}

function buildNavigation(evidence, writeValidation = null, evidenceSummary = null) {
  return collectModuleNames(evidence, writeValidation, evidenceSummary).map((menuPath) => ({
    menuPath,
    entry: `左侧「${menuPath}」`,
  }));
}

function buildCrossLinks(evidence, writeValidation) {
  const links = [];
  for (const action of evidence.actionInventory || []) {
    for (const name of splitActionLabels(action.name)) {
      if (!/删除/.test(name)) continue;
      links.push({
        from: name,
        hint: "删除操作可能存在关联数据联动，以页面确认框为准。",
      });
    }
  }
  for (const scenario of writeValidation?.scenarios || []) {
    if (scenario.reason) {
      links.push({
        from: scenario.menuPath,
        hint: `试业务操作：${scenario.status || "unknown"} · ${scenario.reason}`,
      });
    }
  }
  return links.slice(0, 20);
}

function buildPendingItems(spec, gate) {
  const pending = [];
  for (const failure of gate.failures || []) {
    pending.push({ topic: "质检门禁", reason: failure });
  }
  for (const module of spec.modules || []) {
    if (!isCoreOperationModule(module)) continue;
    if (!module.list?.columns?.length && !module.flows?.length) {
      pending.push({
        topic: module.name,
        reason: "缺少列表列与主流程证据，需补采集。",
      });
    }
    for (const flow of module.plannedFlows || []) {
      pending.push({
        topic: `${module.name} · ${flow.name}`,
        reason: flow.reason || "试业务操作仅处于计划状态，尚未形成可写入主流程的页面证据。",
      });
    }
    for (const flow of module.flows || []) {
      if (flow.status === "partial" || flow.status === "failed") {
        pending.push({
          topic: `${module.name} · ${flow.name}`,
          reason: flow.reason || "试业务操作未完全成功",
        });
      }
    }
  }
  if (spec.positioning?.confidence === "low") {
    pending.push({
      topic: "系统定位",
      reason: "定位置信度较低，请补充 registry.businessHint 或补采集模块页。",
    });
  }
  return pending;
}

function trimSpec(spec) {
  const clone = JSON.parse(JSON.stringify(spec));
  for (const module of clone.modules || []) {
    module.apis = (module.apis || []).slice(0, 6);
    module.plannedFlows = (module.plannedFlows || []).slice(0, 4);
    module.businessDimensions = (module.businessDimensions || []).slice(0, 8);
    module.lifecycleSignals = (module.lifecycleSignals || []).slice(0, 8);
    module.qualitySignals = (module.qualitySignals || []).slice(0, 8);
    module.handoffHints = (module.handoffHints || []).slice(0, 6);
    for (const key of ["businessRole", "businessObject"]) {
      if (module[key]?.evidence) {
        module[key].evidence = module[key].evidence.slice(0, 6);
      }
    }
    if (module.list) {
      module.list.filters = (module.list.filters || []).slice(0, 12).map((filter) => ({
        ...filter,
        enumOptions: (filter.enumOptions || []).slice(0, 16),
        evidence: (filter.evidence || []).slice(0, 4),
      }));
      module.list.enumOptions = Object.fromEntries(
        Object.entries(module.list.enumOptions || {})
          .slice(0, 12)
          .map(([field, options]) => [field, (options || []).slice(0, 16)]),
      );
    }
    for (const flow of module.flows || []) {
      for (const step of flow.steps || []) {
        step.apis = (step.apis || []).slice(0, 4);
        step.fields = (step.fields || []).slice(0, 20);
      }
    }
  }
  clone.crossLinks = (clone.crossLinks || []).slice(0, 12);
  clone.pending = (clone.pending || []).slice(0, 30);
  return clone;
}

function enforceSpecSizeLimit(spec) {
  let current = trimSpec(spec);
  let size = Buffer.byteLength(JSON.stringify(current), "utf8");
  if (size <= MAX_SPEC_BYTES) {
    return { spec: current, size, trimmed: false };
  }
  current.modules = (current.modules || []).map((module) => ({
    ...module,
    screenshots: (module.screenshots || []).slice(0, 2),
    flows: (module.flows || []).slice(0, 2),
  }));
  size = Buffer.byteLength(JSON.stringify(current), "utf8");
  return { spec: current, size, trimmed: true, withinLimit: size <= MAX_SPEC_BYTES };
}

function evaluateOperationGuideGate(spec, system = {}) {
  const minMenus = Number(
    system.operationGuideMinMenus ||
      spec.gateCriteria?.operationGuideMinMenus ||
      3,
  );
  const modules = (spec.modules || []).filter((module) => isCoreOperationModule(module));
  const failures = [];
  const checks = [];

  checks.push({
    id: "business-modules",
    pass: modules.length >= minMenus,
    actual: modules.length,
    expected: minMenus,
  });
  if (modules.length < minMenus) {
    failures.push(`业务模块数 ${modules.length} 低于门槛 ${minMenus}`);
  }

  let modulesWithSurface = 0;
  for (const module of modules) {
    const hasList = (module.list?.columns || []).length > 0;
    const hasFlow = (module.flows || []).length > 0;
    const hasScreenshot = (module.screenshots || []).length > 0;
    if (hasList || hasFlow || hasScreenshot) modulesWithSurface += 1;
  }
  checks.push({
    id: "module-surface",
    pass: modulesWithSurface >= Math.min(modules.length, minMenus),
    actual: modulesWithSurface,
    expected: Math.min(modules.length, minMenus),
  });
  if (modulesWithSurface < Math.min(modules.length, minMenus)) {
    failures.push("多个模块缺少列表列/主流程/截图中的任一项");
  }

  const size = Buffer.byteLength(JSON.stringify(spec), "utf8");
  checks.push({
    id: "spec-size",
    pass: size <= MAX_SPEC_BYTES,
    actual: size,
    expected: MAX_SPEC_BYTES,
  });
  if (size > MAX_SPEC_BYTES) {
    failures.push(`operation-spec 体积 ${size} 超过 ${MAX_SPEC_BYTES} 字节`);
  }

  if (spec.positioning?.confidence === "low") {
    checks.push({
      id: "positioning-confidence",
      pass: false,
      actual: "low",
      expected: "medium",
    });
  }

  const passedChecks = checks.filter((item) => item.pass).length;
  const readinessPercent = checks.length
    ? Math.round((passedChecks / checks.length) * 100)
    : 0;

  return {
    artifactType: "operation-guide-gate",
    version: 1,
    generatedAt: spec.generatedAt || new Date().toISOString(),
    canComposeGuide: failures.length === 0,
    readinessPercent,
    failures,
    checks,
    counts: {
      modules: modules.length,
      modulesWithSurface,
      specBytes: size,
    },
  };
}

function buildOperationSpecMetrics(spec = {}) {
  const modules = Array.isArray(spec.modules) ? spec.modules : [];
  const contentModules = modules.filter((module) => isCoreOperationModule(module));
  return {
    moduleCount: contentModules.length,
    navigationCount: Array.isArray(spec.navigation) ? spec.navigation.length : 0,
    flowCount: modules.reduce((sum, module) => sum + (Array.isArray(module.flows) ? module.flows.length : 0), 0),
    screenshotCount: modules.reduce((sum, module) => sum + (Array.isArray(module.screenshots) ? module.screenshots.length : 0), 0),
    pendingCount: Array.isArray(spec.pending) ? spec.pending.length : 0,
    crossLinkCount: Array.isArray(spec.crossLinks) ? spec.crossLinks.length : 0,
    networkEntryCount: numberFrom(spec.networkEntryCount),
  };
}

function assertValidOperationSpecArtifact(spec = {}) {
  assertJsonObject(spec, "operation-spec.json must be a JSON object.");
  if (spec.artifactType !== "operation-spec") {
    throw new Error("operation-spec.json artifactType must be operation-spec.");
  }
  assertFiniteNumber(spec.version, "operation-spec.json version must be numeric.");
  assertFiniteNumber(spec.schemaVersion, "operation-spec.json schemaVersion must be numeric.");
  if (!String(spec.generatedAt || "").trim()) {
    throw new Error("operation-spec.json generatedAt must be present.");
  }
  assertJsonObject(spec.positioning, "operation-spec.json positioning must be a JSON object.");
  if (!["high", "medium", "low"].includes(String(spec.positioning.confidence || ""))) {
    throw new Error("operation-spec.json positioning.confidence must be high, medium, or low.");
  }
  assertArray(spec.positioning.sources, "operation-spec.json positioning.sources must be an array.");
  assertArray(spec.navigation, "operation-spec.json navigation must be an array.");
  assertArray(spec.modules, "operation-spec.json modules must be an array.");
  assertArray(spec.crossLinks, "operation-spec.json crossLinks must be an array.");
  assertArray(spec.pending, "operation-spec.json pending must be an array.");
  assertJsonObject(spec.gate, "operation-spec.json gate must be a JSON object.");
  assertBoolean(spec.gate.canComposeGuide, "operation-spec.json gate.canComposeGuide must be a boolean.");
  assertFiniteNumber(spec.gate.readinessPercent, "operation-spec.json gate.readinessPercent must be numeric.");
  assertArray(spec.gate.failures, "operation-spec.json gate.failures must be an array.");
  assertJsonObject(spec.metrics, "operation-spec.json metrics must be a JSON object.");
  assertMetricEquals(spec.metrics, "moduleCount", spec.modules.filter((module) => isCoreOperationModule(module)).length, "operation-spec.json");
  assertMetricEquals(spec.metrics, "navigationCount", spec.navigation.length, "operation-spec.json");
  assertMetricEquals(
    spec.metrics,
    "flowCount",
    spec.modules.reduce((sum, module) => sum + (Array.isArray(module.flows) ? module.flows.length : 0), 0),
    "operation-spec.json",
  );
  assertMetricEquals(
    spec.metrics,
    "screenshotCount",
    spec.modules.reduce((sum, module) => sum + (Array.isArray(module.screenshots) ? module.screenshots.length : 0), 0),
    "operation-spec.json",
  );
  assertMetricEquals(spec.metrics, "pendingCount", spec.pending.length, "operation-spec.json");
  assertMetricEquals(spec.metrics, "crossLinkCount", spec.crossLinks.length, "operation-spec.json");
  assertJsonObject(spec.sourceArtifacts, "operation-spec.json sourceArtifacts must be a JSON object.");
  assertJsonObject(spec.sourceArtifacts.evidence, "operation-spec.json must record sourceArtifacts.evidence.");
  for (const module of spec.modules) {
    assertJsonObject(module, "operation-spec.json modules[] must be JSON objects.");
    if (!String(module.name || "").trim()) {
      throw new Error("operation-spec.json modules[].name must be present.");
    }
    assertJsonObject(module.list, "operation-spec.json modules[].list must be a JSON object.");
    assertArray(module.list.columns, "operation-spec.json modules[].list.columns must be an array.");
    if (module.list.filters !== undefined) {
      assertArray(module.list.filters, "operation-spec.json modules[].list.filters must be an array.");
    }
    assertArray(module.flows, "operation-spec.json modules[].flows must be an array.");
    assertArray(module.screenshots, "operation-spec.json modules[].screenshots must be an array.");
  }
}

function assertValidOperationGuideGateArtifact(gate = {}, spec = null) {
  assertJsonObject(gate, "operation-guide-gate.json must be a JSON object.");
  if (gate.artifactType !== "operation-guide-gate") {
    throw new Error("operation-guide-gate.json artifactType must be operation-guide-gate.");
  }
  assertFiniteNumber(gate.version, "operation-guide-gate.json version must be numeric.");
  if (!String(gate.generatedAt || "").trim()) {
    throw new Error("operation-guide-gate.json generatedAt must be present.");
  }
  assertBoolean(gate.canComposeGuide, "operation-guide-gate.json canComposeGuide must be a boolean.");
  assertFiniteNumber(gate.readinessPercent, "operation-guide-gate.json readinessPercent must be numeric.");
  assertArray(gate.failures, "operation-guide-gate.json failures must be an array.");
  assertArray(gate.checks, "operation-guide-gate.json checks must be an array.");
  assertJsonObject(gate.counts, "operation-guide-gate.json counts must be a JSON object.");
  assertJsonObject(gate.sourceArtifacts, "operation-guide-gate.json sourceArtifacts must be a JSON object.");
  assertJsonObject(gate.sourceArtifacts.operationSpec, "operation-guide-gate.json must record sourceArtifacts.operationSpec.");
  if (gate.canComposeGuide && gate.failures.length > 0) {
    throw new Error("operation-guide-gate.json canComposeGuide=true requires zero failures.");
  }
  const failedChecks = gate.checks.filter((check) => check && check.pass === false);
  if (gate.canComposeGuide && failedChecks.length > 0) {
    throw new Error("operation-guide-gate.json canComposeGuide=true requires all checks to pass.");
  }
  if (spec) {
    assertValidOperationSpecArtifact(spec);
    const metrics = buildOperationSpecMetrics(spec);
    assertMetricEquals(gate.counts, "modules", metrics.moduleCount, "operation-guide-gate.json", "counts");
  }
}

function buildOperationSpec(options = {}) {
  const {
    evidence,
    evidenceSummary = null,
    system = {},
    writeValidation = null,
    networkIndex = null,
    allowDraft = false,
  } = options;
  if (!evidence) {
    throw new Error("buildOperationSpec requires evidence");
  }

  const moduleNames = collectModuleNames(evidence, writeValidation, evidenceSummary);
  const modules = moduleNames.map((name) =>
    buildModuleSpec(name, evidence, writeValidation, networkIndex, system, evidenceSummary),
  );

  const homePage = (evidence.pageInventory || []).find((page) => page.type === "home");
  if (homePage) {
    modules.unshift({
      name: "首页",
      entry: "左侧「首页」",
      surfaceType: "overview",
      coreBusinessModule: false,
      businessHint: "展示平台概览与功能入口。",
      businessRole: {
        value: "系统概览与导航入口",
        confidence: "high",
        evidence: [evidenceLine("页面类型", "home"), evidenceLine("菜单", "首页")],
      },
      businessObject: {
        value: "平台入口",
        confidence: "medium",
        evidence: uniqueStrings([
          evidenceLine("页面标题", homePage.title || "首页"),
          evidenceLine("页面类型", "home"),
        ]),
      },
      businessDimensions: [],
      lifecycleSignals: [],
      qualitySignals: [],
      handoffHints: [],
      list: { columns: [], queryFields: [], filters: [], enumOptions: {}, rowActions: [], note: "首页以浏览为主。" },
      flows: [],
      tabs: [],
      screenshots: homePage.screenshot ? [homePage.screenshot] : [],
      apis: [],
    });
  }

  const positioning = resolvePositioning(evidence, system, writeValidation, evidenceSummary);
  let spec = {
    artifactType: "operation-spec",
    version: 1,
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    systemCode: system.code || evidence.systemInfo?.code || "",
    systemName: system.name || evidence.systemInfo?.name || "",
    testUrl: evidence.systemInfo?.testUrl || system.url || "",
    positioning,
    navigation: buildNavigation(evidence, writeValidation, evidenceSummary),
    modules,
    crossLinks: buildCrossLinks(evidence, writeValidation),
    networkEntryCount: (networkIndex?.entries || []).length,
    pending: [],
    metrics: {},
    gateCriteria: {
      operationGuideMinMenus: Number(system.operationGuideMinMenus || 3),
      maxSpecBytes: MAX_SPEC_BYTES,
    },
    sourceArtifacts: options.sourceArtifacts || {},
  };

  const trimmed = enforceSpecSizeLimit(spec);
  spec = trimmed.spec;
  const gate = evaluateOperationGuideGate(spec, system);
  spec.pending = buildPendingItems(spec, gate);
  spec.metrics = buildOperationSpecMetrics(spec);
  spec.gate = {
    canComposeGuide: allowDraft ? true : gate.canComposeGuide,
    readinessPercent: gate.readinessPercent,
    failures: gate.failures,
  };

  return { spec, gate, trimmed };
}

function loadOperationSpecInputs(systemOutput, system = {}) {
  const evidence = readRequiredJsonObject(path.join(systemOutput, "evidence.json"), {
    label: "Evidence",
  });
  const writeValidation = readOptionalJsonObject(
    path.join(systemOutput, "write-validation-result.json"),
  );
  const evidenceSummary = readOptionalJsonObject(path.join(systemOutput, "evidence-summary.json"));
  const networkIndex = readOptionalJsonObject(path.join(systemOutput, "network-index.json"));
  return buildOperationSpec({
    evidence,
    evidenceSummary,
    system,
    writeValidation,
    networkIndex,
    allowDraft: Boolean(system.operationGuideAllowDraft),
  });
}

module.exports = {
  MAX_SPEC_BYTES,
  assertValidOperationGuideGateArtifact,
  assertValidOperationSpecArtifact,
  buildOperationSpec,
  buildModuleAggregateHint,
  buildOperationSpecMetrics,
  buildOperationSpecSourceArtifacts,
  evaluateOperationGuideGate,
  fingerprintFile,
  loadOperationSpecInputs,
  resolvePositioning,
};
