#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  parseArgs,
  readRequiredJsonObject,
  writeJson,
} = require("./system-whitepaper-lib");

const CONFIDENCE_RANK = { low: 1, medium: 2, high: 3 };

function compactString(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function uniqueStrings(values = []) {
  return Array.from(new Set(values.map(compactString).filter(Boolean)));
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items || []) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function normalizeKey(value) {
  return compactString(value).toLowerCase();
}

function stableId(prefix, parts = []) {
  return [prefix, ...parts]
    .map((part) =>
      compactString(part)
        .toLowerCase()
        .replace(/[^\u4e00-\u9fffA-Za-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter(Boolean)
    .join(":");
}

function confidenceRank(value) {
  return CONFIDENCE_RANK[value] || 0;
}

function maxConfidence(...values) {
  return values.reduce(
    (best, value) => (confidenceRank(value) > confidenceRank(best) ? value : best),
    "low",
  );
}

function minConfidence(values = []) {
  return values.reduce(
    (best, value) => (confidenceRank(value) < confidenceRank(best) ? value : best),
    "high",
  );
}

function capConfidence(value, cap) {
  return confidenceRank(value) > confidenceRank(cap) ? cap : value;
}

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

function buildSourceArtifacts(input = {}) {
  const result = {};
  for (const [key, filePath] of Object.entries(input)) {
    if (!filePath) continue;
    result[key] = {
      file: path.basename(filePath),
      fingerprint: fingerprintFile(filePath),
    };
  }
  return result;
}

function sourceRef(artifact, pointer, id, label = "", type = "artifact") {
  return {
    artifact,
    pointer,
    type,
    id: compactString(id),
    label: compactString(label || id),
  };
}

function evidenceRef(kind, label, value, source = "") {
  return {
    kind,
    label: compactString(label),
    value: compactString(value),
    source: compactString(source),
  };
}

function splitActions(actions = []) {
  return uniqueStrings(
    (actions || []).flatMap((action) =>
      String(action || "")
        .split(/[\r\n、,，/]+/)
        .map((item) => item.trim()),
    ),
  );
}

function isHomeModuleName(name) {
  const value = normalizeKey(name);
  return value === "首页" || value === "home" || value === "welcome";
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildClaimRecords(verifiedClaims = {}) {
  return asArray(verifiedClaims.claims).map((claim, index) => ({
    ...claim,
    _index: index,
    _keyParts: [
      claim.id,
      claim.module,
      claim.function,
      claim.subject,
      claim.entity,
      claim.table,
    ].map(normalizeKey),
  }));
}

function claimMatchesModule(claim, moduleName) {
  const target = normalizeKey(moduleName);
  return Boolean(target) && claim._keyParts.some((part) => part === target);
}

function findModuleClaims(claims, moduleName) {
  return claims.filter((claim) => claimMatchesModule(claim, moduleName));
}

function claimSource(claim) {
  return sourceRef(
    "verified-claims",
    `/claims/${claim._index}`,
    claim.id || claim.subject || claim.module,
    claim.text || claim.subject || claim.module,
    claim.type || "claim",
  );
}

function normalizeScreenshotRefs(screenshots = []) {
  return asArray(screenshots)
    .map((shot) => {
      if (typeof shot === "string") {
        return { id: compactString(shot), file: compactString(shot), caption: "" };
      }
      return {
        id: compactString(shot.id || shot.file),
        file: compactString(shot.file || shot.id),
        caption: compactString(shot.caption),
      };
    })
    .filter((shot) => shot.id || shot.file);
}

function mergeModuleRecord(base, patch) {
  return {
    ...base,
    entry: base.entry || patch.entry,
    businessHint: base.businessHint || patch.businessHint,
    columns: uniqueStrings([...(base.columns || []), ...(patch.columns || [])]),
    queryFields: uniqueStrings([...(base.queryFields || []), ...(patch.queryFields || [])]),
    rowActions: uniqueStrings([...(base.rowActions || []), ...(patch.rowActions || [])]),
    flows: [...asArray(base.flows), ...asArray(patch.flows)],
    plannedFlows: [...asArray(base.plannedFlows), ...asArray(patch.plannedFlows)],
    screenshots: uniqueBy(
      [...asArray(base.screenshots), ...asArray(patch.screenshots)],
      (shot) => shot.file || shot.id,
    ),
    apis: [...asArray(base.apis), ...asArray(patch.apis)],
    sources: uniqueBy([...asArray(base.sources), ...asArray(patch.sources)], sourceKey),
    evidenceSummaryFunctions: [
      ...asArray(base.evidenceSummaryFunctions),
      ...asArray(patch.evidenceSummaryFunctions),
    ],
  };
}

function sourceKey(source = {}) {
  return [source.artifact, source.pointer, source.type, source.id, source.label].join("::");
}

function evidenceKey(evidence = {}) {
  return [evidence.kind, evidence.label, evidence.value, evidence.source].join("::");
}

function buildModuleRecords(operationSpec = {}, evidenceSummary = {}, verifiedClaims = {}) {
  const claims = buildClaimRecords(verifiedClaims);
  const byName = new Map();

  for (const [index, module] of asArray(operationSpec.modules).entries()) {
    const name = compactString(module.name);
    if (!name) continue;
    const record = {
      name,
      entry: compactString(module.entry || name),
      businessHint: compactString(module.businessHint),
      columns: uniqueStrings(module.list?.columns || []),
      queryFields: uniqueStrings(module.list?.queryFields || []),
      rowActions: splitActions(module.list?.rowActions || []),
      flows: asArray(module.flows),
      plannedFlows: asArray(module.plannedFlows),
      screenshots: normalizeScreenshotRefs(module.screenshots || []),
      apis: asArray(module.apis),
      sources: [
        sourceRef("operation-spec", `/modules/${index}`, name, module.entry || name, "module"),
      ],
      evidenceSummaryFunctions: [],
    };
    byName.set(normalizeKey(name), record);
  }

  for (const [index, module] of asArray(evidenceSummary.modules).entries()) {
    const name = compactString(module.name);
    if (!name) continue;
    const patch = {
      name,
      entry: compactString(module.entry || name),
      businessHint: compactString(module.summary),
      columns: [],
      queryFields: [],
      rowActions: [],
      flows: [],
      plannedFlows: [],
      screenshots: [],
      apis: [],
      sources: [
        sourceRef("evidence-summary", `/modules/${index}`, name, module.entry || name, "module"),
      ],
      evidenceSummaryFunctions: [],
    };
    const key = normalizeKey(name);
    byName.set(key, byName.has(key) ? mergeModuleRecord(byName.get(key), patch) : patch);
  }

  for (const [index, fn] of asArray(evidenceSummary.functions).entries()) {
    const moduleName = compactString(fn.module || fn.name || "未归类");
    const patch = {
      name: moduleName,
      entry: compactString(fn.menuPath || moduleName),
      businessHint: "",
      columns: uniqueStrings(fn.tableColumns || []),
      queryFields: uniqueStrings(fn.queryFields || []),
      rowActions: splitActions(fn.actions || []),
      flows: [],
      plannedFlows: [],
      screenshots: normalizeScreenshotRefs(fn.screenshots || []),
      apis: [],
      sources: [
        sourceRef(
          "evidence-summary",
          `/functions/${index}`,
          fn.name || moduleName,
          fn.menuPath || fn.name || moduleName,
          "function",
        ),
      ],
      evidenceSummaryFunctions: [fn],
    };
    const key = normalizeKey(moduleName);
    byName.set(key, byName.has(key) ? mergeModuleRecord(byName.get(key), patch) : patch);
  }

  return Array.from(byName.values()).map((record) => {
    const moduleClaims = findModuleClaims(claims, record.name);
    return {
      ...record,
      claims: moduleClaims,
      sources: uniqueBy(
        [...record.sources, ...moduleClaims.map(claimSource)],
        sourceKey,
      ),
    };
  });
}

function recordHasHighFunctionClaim(record = {}) {
  return asArray(record.claims).some(
    (claim) => claim.type === "function-presence" && claim.confidence === "high",
  );
}

function recordConfidence(record = {}) {
  const claimConfidence = asArray(record.claims).reduce(
    (best, claim) => maxConfidence(best, claim.confidence || "low"),
    "low",
  );
  const hasSurface =
    asArray(record.screenshots).length > 0 ||
    asArray(record.columns).length > 0 ||
    asArray(record.rowActions).length > 0;
  if (recordHasHighFunctionClaim(record) && hasSurface) return "high";
  if (claimConfidence === "medium" || hasSurface) return "medium";
  return "low";
}

function moduleEvidence(record = {}, options = {}) {
  const source = record.sources?.[0]?.pointer || "";
  const items = [];
  if (options.businessHint !== false && record.businessHint) {
    items.push(evidenceRef("business-hint", record.name, record.businessHint, source));
  }
  if (options.fields !== false) {
    for (const field of asArray(record.columns).slice(0, 12)) {
      items.push(evidenceRef("table-column", record.name, field, source));
    }
    for (const field of asArray(record.queryFields).slice(0, 8)) {
      items.push(evidenceRef("query-field", record.name, field, source));
    }
  }
  if (options.actions !== false) {
    for (const action of asArray(record.rowActions).slice(0, 12)) {
      items.push(evidenceRef("row-action", record.name, action, source));
    }
  }
  if (options.screenshots !== false) {
    for (const shot of asArray(record.screenshots).slice(0, 3)) {
      items.push(evidenceRef("screenshot", record.name, shot.file || shot.id, source));
    }
  }
  return uniqueBy(items, evidenceKey);
}

function labelMatches(value, pattern) {
  const text = compactString(value);
  const target = compactString(pattern);
  return Boolean(text && target && (text.includes(target) || target.includes(text)));
}

function recordFields(record = {}) {
  return uniqueStrings([...asArray(record.columns), ...asArray(record.queryFields)]);
}

function collectFieldSupport(records = [], fieldPatterns = []) {
  const matchedRecords = [];
  const evidence = [];
  for (const record of records) {
    const fields = recordFields(record);
    const matchedFields = fields.filter((field) =>
      fieldPatterns.some((pattern) => labelMatches(field, pattern)),
    );
    if (!matchedFields.length) continue;
    matchedRecords.push(record);
    const source = record.sources?.[0]?.pointer || "";
    for (const field of matchedFields) {
      evidence.push(
        evidenceRef(
          asArray(record.columns).some((column) => column === field) ? "table-column" : "query-field",
          record.name,
          field,
          source,
        ),
      );
    }
  }
  return {
    records: uniqueBy(matchedRecords, (record) => record.name),
    source: uniqueBy(matchedRecords.flatMap((record) => record.sources || []), sourceKey),
    evidence: uniqueBy(evidence, evidenceKey),
  };
}

function collectActionSupport(records = [], actionPatterns = []) {
  const matchedRecords = [];
  const evidence = [];
  for (const record of records) {
    const matchedActions = asArray(record.rowActions).filter((action) =>
      actionPatterns.some((pattern) => labelMatches(action, pattern)),
    );
    if (!matchedActions.length) continue;
    matchedRecords.push(record);
    const source = record.sources?.[0]?.pointer || "";
    for (const action of matchedActions) {
      evidence.push(evidenceRef("row-action", record.name, action, source));
    }
  }
  return {
    records: uniqueBy(matchedRecords, (record) => record.name),
    source: uniqueBy(matchedRecords.flatMap((record) => record.sources || []), sourceKey),
    evidence: uniqueBy(evidence, evidenceKey),
  };
}

function collectModuleSupport(records = [], modulePattern) {
  const matches = records.filter((record) => {
    const haystack = `${record.name} ${record.businessHint}`;
    return new RegExp(modulePattern).test(haystack);
  });
  return {
    records: matches,
    source: uniqueBy(matches.flatMap((record) => record.sources || []), sourceKey),
    evidence: uniqueBy(matches.flatMap((record) => moduleEvidence(record)), evidenceKey),
  };
}

function combineSupport(...supports) {
  const records = uniqueBy(supports.flatMap((support) => support.records || []), (record) => record.name);
  return {
    records,
    source: uniqueBy(supports.flatMap((support) => support.source || []), sourceKey),
    evidence: uniqueBy(supports.flatMap((support) => support.evidence || []), evidenceKey),
  };
}

function inferBusinessObjectName(record = {}) {
  const haystack = `${record.name} ${record.businessHint}`;
  if (/元数据|字段映射|字典|数据源/.test(haystack)) return "元数据/数据源配置";
  if (/发布|上线/.test(haystack)) return "AI发布上线项";
  if (/运行观测|监控|告警|运行指标/.test(haystack)) return "运行观测与质量风险";
  if (/AI任务|任务管理|需求/.test(haystack)) return "AI任务配置";
  return `${record.name}业务对象`;
}

function buildBusinessObjects(records = []) {
  const objects = [];
  const contentRecords = records.filter((record) => !isHomeModuleName(record.name));
  const taskFields = ["保险公司", "任务类型", "接口方式", "配置时间", "需求状态", "配置质量"];
  const taskSupport = collectFieldSupport(contentRecords, taskFields);
  const taskFieldNames = uniqueStrings(
    taskSupport.evidence
      .map((item) => item.value)
      .filter((field) => taskFields.some((pattern) => labelMatches(field, pattern))),
  );
  if (taskFieldNames.length >= 3) {
    objects.push({
      id: "business-object:insurer-integration-task",
      name: "保司对接需求/任务",
      category: "core-work-item",
      modules: taskSupport.records.map((record) => record.name),
      fields: taskFieldNames,
      stateFields: taskFieldNames.filter((field) => /状态|质量/.test(field)),
      actions: uniqueStrings(taskSupport.records.flatMap((record) => record.rowActions || [])),
      source: taskSupport.source,
      evidence: taskSupport.evidence,
      confidence: taskFieldNames.length >= 5 ? "high" : "medium",
      reasoning:
        "多个模块列表共同出现保险公司、任务类型、接口方式、需求状态、配置质量等字段，可抽象为跨模块承载的保司对接需求/任务对象。",
    });
  }

  for (const record of contentRecords) {
    const name = inferBusinessObjectName(record);
    const support = {
      records: [record],
      source: record.sources || [],
      evidence: moduleEvidence(record),
    };
    objects.push({
      id: stableId("business-object", [name]),
      name,
      category: /元数据/.test(name)
        ? "metadata"
        : /发布/.test(name)
          ? "release"
          : /观测|风险/.test(name)
            ? "observation"
            : "configuration",
      modules: [record.name],
      fields: uniqueStrings(record.columns || []),
      stateFields: uniqueStrings(record.columns || []).filter((field) => /状态|质量|阶段/.test(field)),
      actions: uniqueStrings(record.rowActions || []),
      source: support.source,
      evidence: support.evidence,
      confidence: recordConfidence(record),
      reasoning: record.businessHint
        ? `模块业务提示与页面结构支持将「${record.name}」抽象为「${name}」。`
        : `基于模块名称、列表字段和可见操作抽象「${name}」，需业务侧确认命名。`,
    });
  }

  return uniqueBy(objects, (item) => item.id);
}

function valueAppearsInEvidence(value, support) {
  return asArray(support.evidence).some((item) => item.value.includes(value));
}

function buildStateGroup(records, definition) {
  const fieldSupport = collectFieldSupport(records, [definition.field]);
  const valueSupport = collectFieldSupport(records, definition.values);
  const support = combineSupport(fieldSupport, valueSupport);
  if (!fieldSupport.evidence.length && !valueSupport.evidence.length) return null;
  const values = definition.values
    .filter((value) => valueAppearsInEvidence(value, valueSupport))
    .map((value) => ({
      name: value,
      source: valueSupport.source,
      evidence: valueSupport.evidence.filter((item) => item.value.includes(value)),
      confidence: "medium",
    }));
  return {
    id: stableId("state", [definition.id]),
    object: definition.object,
    field: definition.field,
    stateType: definition.stateType,
    values,
    modules: support.records.map((record) => record.name),
    source: support.source,
    evidence: support.evidence,
    confidence: values.length ? "medium" : "low",
    reasoning: values.length
      ? `状态值来自页面筛选项或列表字段文案：${values.map((item) => item.name).join("、")}。`
      : `仅观察到「${definition.field}」字段，未采集到明确枚举值。`,
  };
}

function buildStates(records = []) {
  const contentRecords = records.filter((record) => !isHomeModuleName(record.name));
  const definitions = [
    {
      id: "demand-status",
      object: "保司对接需求/任务",
      field: "需求状态",
      stateType: "lifecycle",
      values: ["需求待生效", "需求生效", "需求已完成"],
    },
    {
      id: "configuration-quality",
      object: "AI任务配置",
      field: "配置质量",
      stateType: "quality",
      values: ["高风险", "需关注", "良好"],
    },
    {
      id: "interface-mode",
      object: "保司对接需求/任务",
      field: "接口方式",
      stateType: "classification",
      values: ["实时回调", "查询接口", "获取文件"],
    },
  ];
  return definitions.map((definition) => buildStateGroup(contentRecords, definition)).filter(Boolean);
}

function inferResponsibility(record = {}) {
  if (record.businessHint) return record.businessHint;
  const fields = uniqueStrings(record.columns || []).slice(0, 4);
  const actions = uniqueStrings(record.rowActions || []).slice(0, 4);
  if (fields.length || actions.length) {
    return `围绕${[...fields, ...actions].slice(0, 6).join("、")}等页面要素开展业务处理。`;
  }
  return "已采集到模块入口，具体职责待补充页面结构或业务说明。";
}

function buildModuleResponsibilities(records = []) {
  return records.map((record) => ({
    id: stableId("module-responsibility", [record.name]),
    module: record.name,
    responsibility: inferResponsibility(record),
    managedFields: uniqueStrings(record.columns || []),
    visibleActions: uniqueStrings(record.rowActions || []),
    stateFields: uniqueStrings(record.columns || []).filter((field) => /状态|质量|阶段/.test(field)),
    upstreamObjects: /发布|运行观测/.test(`${record.name} ${record.businessHint}`)
      ? ["AI任务配置", "保司对接需求/任务"]
      : [],
    downstreamObjects: /元数据/.test(`${record.name} ${record.businessHint}`)
      ? ["AI任务配置"]
      : /运行观测/.test(`${record.name} ${record.businessHint}`)
        ? ["问题回流修正"]
        : [],
    source: record.sources || [],
    evidence: moduleEvidence(record),
    confidence: recordConfidence(record),
  }));
}

function makeStep(id, order, name, support, options = {}) {
  return {
    id,
    order,
    name,
    businessObject: options.businessObject || "",
    modules: uniqueStrings(asArray(support.records).map((record) => record.name)),
    action: compactString(options.action),
    transition: compactString(options.transition),
    source: uniqueBy(support.source || [], sourceKey),
    evidence: uniqueBy(support.evidence || [], evidenceKey),
    confidence: options.confidence || "low",
    reasoning: compactString(options.reasoning),
    boundary: compactString(options.boundary),
  };
}

function buildEndToEndProcess(records = []) {
  const contentRecords = records.filter((record) => !isHomeModuleName(record.name));
  const taskSupport = collectFieldSupport(contentRecords, [
    "保险公司",
    "任务类型",
    "接口方式",
    "需求状态",
    "配置质量",
  ]);
  const metadataSupport = collectModuleSupport(contentRecords, "元数据|字段映射|字典|数据源");
  const taskConfigSupport = collectModuleSupport(contentRecords, "AI任务管理|任务管理");
  const qualitySupport = combineSupport(
    collectFieldSupport(contentRecords, ["配置质量", "高风险", "需关注", "良好"]),
    collectActionSupport(contentRecords, ["质量"]),
  );
  const releaseSupport = collectModuleSupport(contentRecords, "AI发布|发布|上线");
  const observationSupport = collectModuleSupport(contentRecords, "运行观测|监控|告警|运行指标");
  const feedbackSupport = combineSupport(
    collectFieldSupport(contentRecords, ["配置质量", "高风险", "需关注"]),
    collectActionSupport(contentRecords, ["编辑", "配置历史", "质量"]),
    observationSupport,
    metadataSupport,
    taskConfigSupport,
  );

  const steps = [
    makeStep(
      "step:insurer-integration-task",
      1,
      "保司对接需求/任务",
      taskSupport,
      {
        businessObject: "保司对接需求/任务",
        action: "按保险公司、任务类型、接口方式、需求状态等字段识别对接需求或任务。",
        transition: "形成后续元数据准备与 AI 任务配置的业务对象。",
        confidence: taskSupport.evidence.length >= 5 ? "high" : "medium",
        reasoning: "字段组合直接来自模块列表与筛选项。",
      },
    ),
    makeStep("step:metadata-preparation", 2, "元数据准备", metadataSupport, {
      businessObject: "元数据/数据源配置",
      action: "维护对接字段映射、字典或元数据标准。",
      transition: "为 AI 任务配置提供前置数据定义。",
      confidence: metadataSupport.evidence.length ? "medium" : "low",
      reasoning: "依据元数据管理模块名称、业务提示和已确认模块/功能 claim。",
      boundary: "未观察到从元数据管理自动流转到任务配置的页面操作。",
    }),
    makeStep("step:ai-task-configuration", 3, "AI任务配置", taskConfigSupport, {
      businessObject: "AI任务配置",
      action: "配置、查看、编辑保司数据对接 AI 任务。",
      transition: "任务配置进入质量检查或发布前校验。",
      confidence: taskConfigSupport.evidence.length ? recordConfidence(taskConfigSupport.records[0]) : "low",
      reasoning: "依据 AI任务管理模块业务提示、列表字段与编辑/查看/质量等操作。",
    }),
    makeStep("step:quality-check", 4, "质量检查", qualitySupport, {
      businessObject: "AI任务配置",
      action: "围绕配置质量、高风险、需关注等质量信号执行检查。",
      transition: "质量结果影响发布或回流修正。",
      confidence:
        qualitySupport.evidence.some((item) => item.value === "质量") &&
        qualitySupport.evidence.some((item) => /配置质量|高风险|需关注|良好/.test(item.value))
          ? "high"
          : "medium",
      reasoning: "配置质量字段、质量操作和质量枚举值均来自页面结构。",
    }),
    makeStep("step:release-online", 5, "发布上线", releaseSupport, {
      businessObject: "AI发布上线项",
      action: "管理 AI 能力发布与上线变更。",
      transition: "发布后进入运行观测。",
      confidence: releaseSupport.evidence.length ? "medium" : "low",
      reasoning: "依据 AI发布管理模块名称、业务提示和已确认模块/功能 claim。",
      boundary: "未采集到明确的提交发布按钮或上线审批流，发布顺序为模块职责推断。",
    }),
    makeStep("step:runtime-observation", 6, "运行观测", observationSupport, {
      businessObject: "运行观测与质量风险",
      action: "查看任务运行指标、异常告警或数据质量监控。",
      transition: "观测结果可能触发问题回流。",
      confidence: observationSupport.evidence.length ? "medium" : "low",
      reasoning: "依据数据与运行观测模块名称、业务提示和已确认模块/功能 claim。",
      boundary: "未采集到真实运行指标明细或告警处置记录。",
    }),
    makeStep("step:feedback-correction", 7, "问题回流修正", feedbackSupport, {
      businessObject: "质量问题/修正项",
      action: "基于高风险、需关注、质量和配置历史等信号回到配置或元数据环节修正。",
      transition: "修正后重新进入质量检查、发布与观测。",
      confidence:
        feedbackSupport.evidence.some((item) => /高风险|需关注|配置质量/.test(item.value)) &&
        feedbackSupport.evidence.some((item) => /编辑|配置历史|质量/.test(item.value))
          ? "medium"
          : "low",
      reasoning: "质量风险字段与编辑/质量/配置历史操作共同支持回流修正推理。",
      boundary: "未观察到系统自动创建问题单或自动回滚；回流为证据约束下的业务推理。",
    }),
  ].filter((step) => step.source.length && step.evidence.length);

  if (!steps.length) return [];
  const observedFlows = contentRecords.flatMap((record) => record.flows || []);
  const sequenceConfidence = observedFlows.length ? minConfidence(steps.map((step) => step.confidence)) : "medium";
  return [
    {
      id: "process:insurer-demand-to-runtime-feedback",
      name: "保司对接需求/任务到运行观测回流闭环",
      type: observedFlows.length ? "observed-or-supported" : "inferred-end-to-end",
      status: observedFlows.length ? "partially-observed" : "inferred",
      confidence: capConfidence(minConfidence(steps.map((step) => step.confidence)), sequenceConfidence),
      steps,
      source: uniqueBy(steps.flatMap((step) => step.source), sourceKey),
      evidence: uniqueBy(steps.flatMap((step) => step.evidence).slice(0, 40), evidenceKey),
      reasoning:
        "端到端顺序由模块职责、共享字段、质量状态和可见操作确定性推理；每个步骤均保留来源与证据。",
      boundary: observedFlows.length
        ? "存在模块内流程证据，但跨模块端到端顺序仍需业务侧确认。"
        : "operation-spec 未记录已执行的跨模块流程，端到端顺序不得写成已验证系统自动流转。",
    },
  ];
}

function buildFeedbackLoops(records = []) {
  const contentRecords = records.filter((record) => !isHomeModuleName(record.name));
  const observationSupport = collectModuleSupport(contentRecords, "运行观测|监控|告警|运行指标");
  const riskSupport = collectFieldSupport(contentRecords, ["配置质量", "高风险", "需关注"]);
  const correctionSupport = collectActionSupport(contentRecords, ["编辑", "配置历史", "质量"]);
  const metadataSupport = collectModuleSupport(contentRecords, "元数据|字段映射|字典|数据源");
  const support = combineSupport(observationSupport, riskSupport, correctionSupport, metadataSupport);
  if (!support.evidence.length) return [];

  const loopSteps = [
    makeStep("feedback-step:observe-risk", 1, "运行观测识别质量风险", combineSupport(observationSupport, riskSupport), {
      businessObject: "运行观测与质量风险",
      action: "查看配置质量、高风险或需关注信号。",
      confidence: riskSupport.evidence.length ? "medium" : "low",
    }),
    makeStep("feedback-step:locate-cause", 2, "查看质量与配置历史", correctionSupport, {
      businessObject: "质量问题/修正项",
      action: "通过质量、配置历史等入口定位问题。",
      confidence: correctionSupport.evidence.length ? "medium" : "low",
    }),
    makeStep("feedback-step:correct-config", 3, "回到配置或元数据修正", combineSupport(correctionSupport, metadataSupport), {
      businessObject: "AI任务配置",
      action: "编辑 AI 任务配置或修正元数据准备项。",
      confidence: correctionSupport.evidence.length && metadataSupport.evidence.length ? "medium" : "low",
      boundary: "未观察到自动问题单或强制回流，仅能作为人工修正闭环推理。",
    }),
  ].filter((step) => step.source.length && step.evidence.length);

  return [
    {
      id: "feedback:runtime-quality-correction",
      name: "运行观测与质量问题回流",
      status: "inferred",
      confidence: minConfidence(loopSteps.map((step) => step.confidence)),
      trigger: "配置质量出现高风险或需关注，或运行观测发现异常。",
      correctionTargets: ["AI任务配置", "元数据/数据源配置"],
      steps: loopSteps,
      source: uniqueBy(loopSteps.flatMap((step) => step.source), sourceKey),
      evidence: uniqueBy(loopSteps.flatMap((step) => step.evidence), evidenceKey),
      boundary: "该闭环来自字段、动作与模块职责组合推理，不代表系统已自动闭环处理。",
    },
  ];
}

function buildEvidenceBasis(records = [], input = {}) {
  return {
    sourceArtifacts: input.sourceArtifacts || {},
    claimSummary: input.verifiedClaims?.metrics || {},
    moduleBasis: records.map((record) => ({
      module: record.name,
      entry: record.entry,
      businessHint: record.businessHint,
      fields: uniqueStrings(record.columns || []),
      queryFields: uniqueStrings(record.queryFields || []).slice(0, 8),
      actions: uniqueStrings(record.rowActions || []),
      screenshots: asArray(record.screenshots).map((shot) => shot.file || shot.id),
      claimIds: asArray(record.claims).map((claim) => claim.id),
      confidence: recordConfidence(record),
      source: record.sources || [],
    })),
    inferenceRules: [
      "Only operation-spec, evidence-summary, and verified-claims are used as inputs.",
      "Every process step must carry source and evidence arrays.",
      "Cross-module order is marked inferred unless operation-spec contains observed flow evidence.",
      "Database-only or missing evidence is not promoted into confirmed business process conclusions.",
    ],
  };
}

function buildPendingItems(input = {}) {
  const { operationSpec = {}, evidenceSummary = {}, processes = [], businessObjects = [] } = input;
  const pending = [];
  for (const [index, item] of asArray(operationSpec.pending).entries()) {
    pending.push({
      id: stableId("pending", [item.topic || `operation-spec-${index}`]),
      topic: compactString(item.topic || "operation-spec"),
      reason: compactString(item.reason || "operation-spec 标记为待确认。"),
      source: [sourceRef("operation-spec", `/pending/${index}`, item.topic || "pending", item.reason || "")],
      confidenceImpact: "keeps-related-process-inferred",
    });
  }
  const observedFlowCount = asArray(operationSpec.modules).reduce(
    (sum, module) => sum + asArray(module.flows).length,
    0,
  );
  if (!observedFlowCount) {
    pending.push({
      id: "pending:observed-cross-module-flow",
      topic: "端到端流程执行证据",
      reason: "operation-spec 未记录已执行的跨模块流程，只能把端到端顺序标记为 inferred。",
      source: [sourceRef("operation-spec", "/modules", "modules.flows", "modules[].flows")],
      confidenceImpact: "caps-process-confidence-at-medium",
    });
  }
  if (!asArray(evidenceSummary.functions).length) {
    pending.push({
      id: "pending:evidence-summary-functions",
      topic: "evidence-summary 功能面",
      reason: "evidence-summary.functions 为空，本模型主要依赖 operation-spec 与 verified-claims。",
      source: [sourceRef("evidence-summary", "/functions", "functions", "evidence-summary.functions")],
      confidenceImpact: "requires-operation-spec-fallback",
    });
  }
  for (const processItem of processes) {
    for (const step of processItem.steps || []) {
      if (step.confidence !== "low") continue;
      pending.push({
        id: stableId("pending", [processItem.id, step.id]),
        topic: `${processItem.name} · ${step.name}`,
        reason: "该步骤证据较弱，需补充页面操作、状态流转或业务确认。",
        source: step.source,
        confidenceImpact: "step-confidence-low",
      });
    }
  }
  for (const object of businessObjects) {
    if (object.confidence !== "low") continue;
    pending.push({
      id: stableId("pending", [object.id]),
      topic: object.name,
      reason: "业务对象仅由弱模块/字段证据推断，需补充业务口径。",
      source: object.source,
      confidenceImpact: "object-confidence-low",
    });
  }
  return uniqueBy(pending, (item) => item.id).slice(0, 40);
}

function sectionConfidence(items = []) {
  if (!items.length) return "low";
  return minConfidence(items.map((item) => item.confidence || "low"));
}

function buildConfidenceSummary(input = {}) {
  const businessObjectsConfidence = sectionConfidence(input.businessObjects);
  const statesConfidence = sectionConfidence(input.states);
  const responsibilitiesConfidence = sectionConfidence(input.moduleResponsibilities);
  const processConfidence = sectionConfidence(input.processes);
  const feedbackConfidence = sectionConfidence(input.feedbackLoops);
  const hasInferredProcess = asArray(input.processes).some((processItem) => processItem.status === "inferred");
  const overall = !input.processes.length
    ? "low"
    : hasInferredProcess
      ? "medium"
      : minConfidence([
          businessObjectsConfidence,
          statesConfidence,
          responsibilitiesConfidence,
          processConfidence,
          feedbackConfidence,
        ]);
  return {
    overall,
    bySection: {
      businessObjects: businessObjectsConfidence,
      states: statesConfidence,
      moduleResponsibilities: responsibilitiesConfidence,
      processes: processConfidence,
      feedbackLoops: feedbackConfidence,
    },
    rationale: [
      "模块、字段、动作和 claim 均来自结构化产物，未使用自由生成结论。",
      hasInferredProcess
        ? "端到端顺序为跨模块职责推理，因此总体置信度最高按 medium 处理。"
        : "存在流程证据时仍保留步骤级来源与边界。",
    ],
  };
}

function resolveSystem(operationSpec = {}, evidenceSummary = {}, verifiedClaims = {}) {
  return {
    code: compactString(operationSpec.systemCode || evidenceSummary.system?.code || verifiedClaims.system?.code),
    name: compactString(operationSpec.systemName || evidenceSummary.system?.name || verifiedClaims.system?.name),
    testUrl: compactString(operationSpec.testUrl || evidenceSummary.system?.testUrl || verifiedClaims.system?.testUrl),
  };
}

function resolveGeneratedAt(operationSpec = {}, evidenceSummary = {}, verifiedClaims = {}, options = {}) {
  return compactString(
    options.generatedAt ||
      operationSpec.generatedAt ||
      evidenceSummary.generatedAt ||
      verifiedClaims.generatedAt ||
      new Date().toISOString(),
  );
}

function buildBusinessProcessModel(input = {}) {
  const operationSpec = input.operationSpec || {};
  const evidenceSummary = input.evidenceSummary || {};
  const verifiedClaims = input.verifiedClaims || {};
  const records = buildModuleRecords(operationSpec, evidenceSummary, verifiedClaims);
  const businessObjects = buildBusinessObjects(records);
  const states = buildStates(records);
  const moduleResponsibilities = buildModuleResponsibilities(records);
  const processes = buildEndToEndProcess(records);
  const feedbackLoops = buildFeedbackLoops(records);
  const pending = buildPendingItems({
    operationSpec,
    evidenceSummary,
    processes,
    businessObjects,
  });
  const metrics = {
    businessObjectCount: businessObjects.length,
    stateGroupCount: states.length,
    moduleResponsibilityCount: moduleResponsibilities.length,
    processCount: processes.length,
    processStepCount: processes.reduce((sum, processItem) => sum + asArray(processItem.steps).length, 0),
    feedbackLoopCount: feedbackLoops.length,
    pendingCount: pending.length,
    sourceModuleCount: records.length,
    confirmedClaimCount: asArray(verifiedClaims.claims).filter((claim) => claim.status === "confirmed").length,
  };
  const artifact = {
    artifactType: "business-process-model",
    version: 1,
    generatedAt: resolveGeneratedAt(operationSpec, evidenceSummary, verifiedClaims, input),
    system: resolveSystem(operationSpec, evidenceSummary, verifiedClaims),
    sourceArtifacts: input.sourceArtifacts || {},
    businessObjects,
    states,
    moduleResponsibilities,
    processes,
    feedbackLoops,
    evidenceBasis: buildEvidenceBasis(records, {
      sourceArtifacts: input.sourceArtifacts || {},
      verifiedClaims,
    }),
    confidence: buildConfidenceSummary({
      businessObjects,
      states,
      moduleResponsibilities,
      processes,
      feedbackLoops,
    }),
    pending,
    metrics,
    rules: {
      noUnsupportedConclusion: true,
      processStepsRequireSourceAndEvidence: true,
      inferredSequenceMustBeLabeled: true,
      purpose:
        "Deterministic business-process abstraction for later narrative stages; not a replacement for verified operation evidence.",
    },
  };
  return artifact;
}

function buildBusinessProcessModelFromDir(inputDir, options = {}) {
  const dir = path.resolve(String(inputDir || "."));
  const operationSpecPath = options.operationSpecPath || path.join(dir, "operation-spec.json");
  const evidenceSummaryPath = options.evidenceSummaryPath || path.join(dir, "evidence-summary.json");
  const verifiedClaimsPath = options.verifiedClaimsPath || path.join(dir, "verified-claims.json");
  const operationSpec = readRequiredJsonObject(operationSpecPath, { label: "Operation spec" });
  const evidenceSummary = readRequiredJsonObject(evidenceSummaryPath, { label: "Evidence summary" });
  const verifiedClaims = readRequiredJsonObject(verifiedClaimsPath, { label: "Verified claims" });
  const artifact = buildBusinessProcessModel({
    operationSpec,
    evidenceSummary,
    verifiedClaims,
    sourceArtifacts: buildSourceArtifacts({
      operationSpec: operationSpecPath,
      evidenceSummary: evidenceSummaryPath,
      verifiedClaims: verifiedClaimsPath,
    }),
    generatedAt: options.generatedAt,
  });
  const outputPath = options.outputPath || path.join(dir, "business-process-model.json");
  writeJson(outputPath, artifact);
  return { outputPath, artifact };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    throw new Error(
      "Usage: node scripts/build-business-process-model.js --input outputs/system [--output outputs/system/business-process-model.json]",
    );
  }
  const result = buildBusinessProcessModelFromDir(args.input, {
    outputPath: args.output,
    operationSpecPath: args["operation-spec"],
    evidenceSummaryPath: args["evidence-summary"],
    verifiedClaimsPath: args["verified-claims"],
  });
  console.log(`Business process model written: ${result.outputPath}`);
  console.log(
    `Business process model: processes=${result.artifact.metrics.processCount} steps=${result.artifact.metrics.processStepCount} confidence=${result.artifact.confidence.overall}`,
  );
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
  buildBusinessProcessModel,
  buildBusinessProcessModelFromDir,
  buildSourceArtifacts,
  fingerprintFile,
};
