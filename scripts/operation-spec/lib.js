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
    const menuPath = String(page.menuPath || "").trim();
    const title = String(page.title || "").trim();
    return menuPath === target || title === target || menuPath.endsWith(`> ${target}`);
  });
}

function collectModuleNames(evidence, writeValidation = null) {
  const names = [];
  for (const menu of evidence.menuMap || []) {
    if (isEnvironmentSwitcherMenu(menu) || isSystemShellMenu(menu)) continue;
    names.push(menu.menuPath || menu.title);
  }
  for (const page of evidence.pageInventory || []) {
    if (page.type === "home") continue;
    if (page.menuPath) names.push(page.menuPath);
  }
  for (const scenario of writeValidation?.scenarios || []) {
    if (scenario.menuPath) names.push(scenario.menuPath);
  }
  for (const module of evidence.modules || []) {
    if (module.name) names.push(module.name);
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

function resolveModuleBusinessHint(name, module, system = {}) {
  const hints = system.moduleBusinessHints;
  if (hints && typeof hints === "object" && hints[name]) {
    return String(hints[name]).trim();
  }
  return inferModuleBusinessHint(module);
}

function buildModuleSpec(name, evidence, writeValidation, networkIndex, system = {}) {
  const pages = pagesForMenu(evidence, name);
  const pageIds = new Set(pages.map((page) => page.id));
  const tables = (evidence.tableInventory || []).filter((table) => pageIds.has(table.pageId));
  const forms = (evidence.formInventory || []).filter((form) => pageIds.has(form.pageId));
  const actions = (evidence.actionInventory || []).filter((action) => pageIds.has(action.pageId));
  const columns = uniqueStrings(tables.flatMap((table) => table.columns || []));
  const queryFields = uniqueStrings(
    forms
      .flatMap((form) => (form.fields || []).map((field) => field.label))
      .filter((label) => !isTechnicalFieldLabel(label) && !isGenericFieldLabel(label)),
  ).slice(0, 12);
  const rowActions = uniqueStrings(
    actions
      .map((action) => action.name)
      .filter((label) => /编辑|查看|删除|启用|关闭|开启|处理|导出|下载/.test(label)),
  );
  const screenshots = uniqueStrings(
    pages.map((page) => page.screenshot).concat(
      (evidence.screenshotIndex || [])
        .filter((shot) => shot.module === name || shot.function === name)
        .map((shot) => shot.file),
    ),
  );
  const flows = (writeValidation?.scenarios || [])
    .filter((scenario) => scenario.menuPath === name)
    .map((scenario) => buildFlowFromValidationScenario(scenario, networkIndex));

  const module = {
    name,
    entry: `左侧「${name}」`,
    businessHint: "",
    list: {
      columns,
      queryFields,
      rowActions,
      note: columns.length ? "" : "本轮未采集到列表列，待补采集。",
    },
    flows,
    tabs: uniqueStrings(
      pages.filter((page) => page.type === "container").map((page) => page.title),
    ),
    screenshots,
    apis: mapApisForContext(networkIndex, [name]),
  };
  module.businessHint = resolveModuleBusinessHint(name, module, system);
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

function buildModuleAggregateHint(evidence, writeValidation) {
  const names = collectModuleNames(evidence, writeValidation);
  const columns = uniqueStrings(
    (evidence.tableInventory || []).flatMap((table) => table.columns || []),
  );
  const actions = uniqueStrings(
    (writeValidation?.scenarios || []).map((scenario) => scenario.menuPath),
  );
  const chunks = uniqueStrings([...names.slice(0, 6), ...columns.slice(0, 4), ...actions.slice(0, 4)]);
  if (chunks.length < 2) return "";
  return `平台提供${chunks.slice(0, 6).join("、")}等功能入口（依据菜单与页面结构归纳，非官方口径）。`;
}

function resolvePositioning(evidence, system = {}, writeValidation = null) {
  const sources = [];
  let text = "";
  let confidence = "low";

  if (system.businessHint) {
    sources.push({ type: "registry", weight: 0.4 });
    text = String(system.businessHint).trim();
    confidence = "high";
  }

  const aggregate = buildModuleAggregateHint(evidence, writeValidation);
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

function buildNavigation(evidence) {
  return collectModuleNames(evidence).map((menuPath) => ({
    menuPath,
    entry: `左侧「${menuPath}」`,
  }));
}

function buildCrossLinks(evidence, writeValidation) {
  const links = [];
  for (const action of evidence.actionInventory || []) {
    const name = String(action.name || "");
    if (/删除/.test(name)) {
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
    if (!module.list?.columns?.length && !module.flows?.length) {
      pending.push({
        topic: module.name,
        reason: "缺少列表列与主流程证据，需补采集。",
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
  const minMenus = Number(system.operationGuideMinMenus || 3);
  const modules = (spec.modules || []).filter((module) => !isHomeModuleName(module.name));
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
  const contentModules = modules.filter((module) => !isHomeModuleName(module.name));
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
  assertMetricEquals(spec.metrics, "moduleCount", spec.modules.filter((module) => !isHomeModuleName(module.name)).length, "operation-spec.json");
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
    system = {},
    writeValidation = null,
    networkIndex = null,
    allowDraft = false,
  } = options;
  if (!evidence) {
    throw new Error("buildOperationSpec requires evidence");
  }

  const moduleNames = collectModuleNames(evidence, writeValidation);
  const modules = moduleNames.map((name) =>
    buildModuleSpec(name, evidence, writeValidation, networkIndex, system),
  );

  const homePage = (evidence.pageInventory || []).find((page) => page.type === "home");
  if (homePage) {
    modules.unshift({
      name: "首页",
      entry: "左侧「首页」",
      businessHint: "展示平台概览与功能入口。",
      list: { columns: [], queryFields: [], rowActions: [], note: "首页以浏览为主。" },
      flows: [],
      tabs: [],
      screenshots: homePage.screenshot ? [homePage.screenshot] : [],
      apis: [],
    });
  }

  const positioning = resolvePositioning(evidence, system, writeValidation);
  let spec = {
    artifactType: "operation-spec",
    version: 1,
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    systemCode: system.code || evidence.systemInfo?.code || "",
    systemName: system.name || evidence.systemInfo?.name || "",
    testUrl: evidence.systemInfo?.testUrl || system.url || "",
    positioning,
    navigation: buildNavigation(evidence),
    modules,
    crossLinks: buildCrossLinks(evidence, writeValidation),
    networkEntryCount: (networkIndex?.entries || []).length,
    pending: [],
    metrics: {},
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
  const networkIndex = readOptionalJsonObject(path.join(systemOutput, "network-index.json"));
  return buildOperationSpec({
    evidence,
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
