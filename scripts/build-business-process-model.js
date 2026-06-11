#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  parseArgs,
  readRequiredJsonObject,
  writeJson,
} = require("./system-whitepaper-lib");
const {
  categoryLabel,
  classifyObjectCategory,
  classifyProcessRole,
  collectEvidenceText,
  hasDefaultDomainLeak,
  isStateSignal,
  roleLabel,
} = require("./business-process/generic-rules");
const {
  applyDomainProfileLabel,
  assertValidDomainProfile,
} = require("./business-process/domain-profile");

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

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function businessProcessContentForHash(artifact = {}) {
  return {
    version: artifact.version,
    system: artifact.system || {},
    businessObjects: artifact.businessObjects || [],
    states: artifact.states || [],
    moduleResponsibilities: artifact.moduleResponsibilities || [],
    processes: artifact.processes || [],
    feedbackLoops: artifact.feedbackLoops || [],
    pending: artifact.pending || [],
    metrics: artifact.metrics || {},
    rules: artifact.rules || {},
  };
}

function hashBusinessProcessContent(artifact = {}) {
  return crypto
    .createHash("sha256")
    .update(stableJson(businessProcessContentForHash(artifact)))
    .digest("hex");
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

function inferBusinessObject(record = {}, options = {}) {
  const fields = recordFields(record);
  const actions = uniqueStrings(record.rowActions || []);
  const haystack = collectEvidenceText([
    record.name,
    record.businessHint,
    ...fields,
    ...actions,
  ]);
  const category = classifyObjectCategory(haystack);
  const genericLabel = categoryLabel(category);
  const profileLabel = applyDomainProfileLabel(
    options.domainProfile,
    category,
    applyDomainProfileLabel(options.domainProfile, "work-item", ""),
  );
  const name = profileLabel || `${record.name}${genericLabel}`;
  return { name, category, fields, actions, haystack };
}

function buildBusinessObjects(records = [], options = {}) {
  const contentRecords = records.filter((record) => !isHomeModuleName(record.name));
  return uniqueBy(
    contentRecords.map((record) => {
      const inferred = inferBusinessObject(record, options);
      const support = {
        records: [record],
        source: record.sources || [],
        evidence: moduleEvidence(record),
      };
      return {
        id: stableId("business-object", [record.name, inferred.category]),
        name: inferred.name,
        category: inferred.category,
        modules: [record.name],
        fields: inferred.fields,
        stateFields: inferred.fields.filter(isStateSignal),
        actions: inferred.actions,
        source: support.source,
        evidence: support.evidence,
        confidence: recordConfidence(record),
        reasoning: record.businessHint
          ? `模块业务提示与页面结构支持将「${record.name}」抽象为「${inferred.name}」。`
          : `基于模块名称、列表字段和可见操作抽象「${inferred.name}」，需业务侧确认命名。`,
      };
    }),
    (item) => item.id,
  );
}

function buildStates(records = []) {
  const contentRecords = records.filter((record) => !isHomeModuleName(record.name));
  const states = [];
  for (const record of contentRecords) {
    const fields = recordFields(record).filter(isStateSignal);
    for (const field of fields) {
      const support = collectFieldSupport([record], [field]);
      if (!support.evidence.length) continue;
      states.push({
        id: stableId("state", [record.name, field]),
        object: `${record.name}业务对象`,
        field,
        stateType: /质量|风险|异常|告警/.test(field)
          ? "quality-or-risk"
          : /审批|审核|状态|进度|阶段|完成|结果/.test(field)
            ? "lifecycle"
            : "classification",
        values: [],
        modules: [record.name],
        source: support.source,
        evidence: support.evidence,
        confidence: recordConfidence(record),
        reasoning: `字段「${field}」来自页面列表或筛选条件，可作为流程推进、分类或风险判断信号。`,
      });
    }
  }
  return uniqueBy(states, (item) => item.id);
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
    processRole: classifyProcessRole(
      collectEvidenceText([
        record.name,
        record.businessHint,
        ...recordFields(record),
        ...asArray(record.rowActions),
      ]),
    ),
    upstreamObjects: [],
    downstreamObjects: [],
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
    role: compactString(options.role),
    status: compactString(options.status || "inferred"),
    source: uniqueBy(support.source || [], sourceKey),
    evidence: uniqueBy(support.evidence || [], evidenceKey),
    confidence: options.confidence || "low",
    reasoning: compactString(options.reasoning),
    boundary: compactString(options.boundary),
  };
}

function workflowStepSource(workflow = {}, step = {}, workflowIndex = 0, stepIndex = 0) {
  const refs = asArray(step.evidenceRefs);
  if (refs.length) {
    return refs.map((ref) =>
      sourceRef(
        ref.artifact || "workflow-spec",
        ref.pointer || `/workflows/${workflowIndex}/steps/${stepIndex}`,
        step.id || step.name,
        step.name || workflow.name,
        ref.type || "workflow-step",
      ),
    );
  }
  return [
    sourceRef(
      "workflow-spec",
      `/workflows/${workflowIndex}/steps/${stepIndex}`,
      step.id || step.name,
      step.name || workflow.name,
      "workflow-step",
    ),
  ];
}

function workflowStepEvidence(workflow = {}, step = {}, workflowIndex = 0, stepIndex = 0) {
  const label = compactString(workflow.module || workflow.name || "workflow");
  const value = compactString(step.name || step.title || `步骤 ${stepIndex + 1}`);
  return [
    evidenceRef(
      "workflow-step",
      label,
      value,
      `/workflows/${workflowIndex}/steps/${stepIndex}`,
    ),
  ];
}

function buildNarratableWorkflowSteps(workflowSpec = {}, options = {}) {
  const steps = [];
  for (const [workflowIndex, workflow] of asArray(workflowSpec.workflows).entries()) {
    const evidenceStatus = compactString(workflow.evidenceStatus);
    const canUse =
      (evidenceStatus === "observed" && workflow.canNarrateAsObserved === true) ||
      (evidenceStatus === "inferred" && workflow.canNarrateAsInferred === true);
    if (!canUse) continue;
    for (const [stepIndex, step] of asArray(workflow.steps).entries()) {
      const role = classifyProcessRole(
        collectEvidenceText([
          workflow.name,
          workflow.module,
          step.name,
          step.action,
          ...asArray(step.buttons),
          ...asArray(step.fields).map((field) => field.label || field.name || field),
        ]),
      );
      steps.push({
        id: stableId("step", [workflow.module, workflow.name, step.name || stepIndex + 1]),
        order: steps.length + 1,
        name: compactString(step.name || `观察步骤 ${stepIndex + 1}`),
        businessObject: compactString(workflow.businessObject?.name || workflow.module || ""),
        modules: uniqueStrings([workflow.module]),
        action: compactString(step.action || step.name || ""),
        transition: "",
        role,
        roleLabel: applyDomainProfileLabel(options.domainProfile, role, roleLabel(role)),
        status: evidenceStatus === "observed" ? "observed" : "inferred",
        source: uniqueBy(workflowStepSource(workflow, step, workflowIndex, stepIndex), sourceKey),
        evidence: uniqueBy(workflowStepEvidence(workflow, step, workflowIndex, stepIndex), evidenceKey),
        confidence: evidenceStatus === "observed" ? workflow.confidence || "medium" : capConfidence(workflow.confidence || "medium", "medium"),
        reasoning: evidenceStatus === "observed"
          ? "该步骤来自 workflow-spec 的 observed workflow，可作为已观察流程步骤叙述。"
          : "该步骤来自 workflow-spec 的 inferred workflow，依据首页流程卡片等 UI 证据归纳，不能写成已观察执行。",
        boundary: evidenceStatus === "observed" ? "" : compactString(
          asArray(workflow.boundaries).map((boundary) => boundary.reason).filter(Boolean).join(" "),
        ) || "该步骤为证据约束下的流程推理，不代表已观察到实际执行。",
      });
    }
  }
  return steps;
}

function buildInferredModuleSteps(records = [], existingModules = new Set(), options = {}) {
  const contentRecords = records.filter((record) => !isHomeModuleName(record.name));
  const steps = [];
  for (const record of contentRecords) {
    if (existingModules.has(record.name)) continue;
    const role = classifyProcessRole(
      collectEvidenceText([
        record.name,
        record.businessHint,
        ...recordFields(record),
        ...asArray(record.rowActions),
      ]),
    );
    const support = {
      records: [record],
      source: record.sources || [],
      evidence: moduleEvidence(record),
    };
    if (!support.source.length || !support.evidence.length) continue;
    const stepName = applyDomainProfileLabel(options.domainProfile, role, roleLabel(role));
    steps.push(makeStep(stableId("step", [record.name, role]), steps.length + 1, stepName, support, {
      businessObject: `${record.name}业务对象`,
      action: inferResponsibility(record),
      role,
      status: "inferred",
      confidence: capConfidence(recordConfidence(record), "medium"),
      reasoning: "模块职责、字段和可见操作支持该流程角色，但未观察到跨模块自动流转。",
      boundary: "该步骤为证据约束下的业务流程推理，不能写成已验证自动流转。",
    }));
  }
  return steps;
}

function buildEndToEndProcess(records = [], input = {}) {
  const contentRecords = records.filter((record) => !isHomeModuleName(record.name));
  const workflowSteps = buildNarratableWorkflowSteps(input.workflowSpec, input);
  const observedModules = new Set(workflowSteps.flatMap((step) => step.modules || []));
  const inferredSteps = buildInferredModuleSteps(contentRecords, observedModules, input);
  const steps = [...workflowSteps, ...inferredSteps].map((step, index) => ({ ...step, order: index + 1 }));

  if (!steps.length) return [];
  const observedCount = steps.filter((step) => step.status === "observed").length;
  const inferredCount = steps.filter((step) => step.status !== "observed").length;
  const status = observedCount && inferredCount ? "partially-observed" : observedCount ? "observed" : "inferred";
  const boundary = status === "observed"
    ? ""
    : observedCount
      ? "存在已观察步骤，但跨模块顺序或未覆盖模块职责仍为证据约束推理。"
      : "未观察到端到端流程执行证据，流程顺序不能写成已验证自动流转。";
  const reasoning = status === "observed"
    ? "流程由 observed workflow 步骤确定性生成；每个步骤均保留来源与证据。"
    : observedCount
      ? "流程由 observed workflow 步骤与证据约束下的 inferred workflow 或模块职责推理共同生成；每个步骤均保留来源与证据。"
      : "流程由 inferred workflow、模块职责、字段状态信号和可见操作在证据约束下推理生成；不能写成已观察执行。";
  return [
    {
      id: stableId("process", [input.system?.code || "system", "business-flow"]),
      name: "业务处理链路",
      type: status === "observed" ? "observed-workflow" : "generic-business-process",
      status,
      confidence: status === "observed"
        ? minConfidence(steps.map((step) => step.confidence))
        : capConfidence(minConfidence(steps.map((step) => step.confidence)), "medium"),
      steps,
      source: uniqueBy(steps.flatMap((step) => step.source), sourceKey),
      evidence: uniqueBy(steps.flatMap((step) => step.evidence).slice(0, 40), evidenceKey),
      reasoning,
      boundary,
    },
  ];
}

function buildFeedbackLoops(records = []) {
  const contentRecords = records.filter((record) => !isHomeModuleName(record.name));
  const signalSupport = collectFieldSupport(
    contentRecords,
    contentRecords.flatMap((record) => recordFields(record).filter(isStateSignal)),
  );
  const correctionSupport = collectActionSupport(contentRecords, ["编辑", "调整", "撤回", "重试", "修正", "冻结", "解冻"]);
  const support = combineSupport(signalSupport, correctionSupport);
  if (!support.evidence.length) return [];

  const loopSteps = [
    makeStep("feedback-step:detect-signal", 1, "识别状态或质量信号", signalSupport, {
      businessObject: "状态/质量信号",
      action: "查看状态、结果、风险、异常或质量字段。",
      role: "validate-or-check",
      status: "inferred",
      confidence: signalSupport.evidence.length ? "medium" : "low",
      boundary: "未观察到自动问题创建，仅能说明页面存在判断信号。",
    }),
    makeStep("feedback-step:correct-record", 2, "执行修正或重试", correctionSupport, {
      businessObject: "修正项",
      action: "通过编辑、调整、撤回、重试或冻结等入口修正记录。",
      role: "correct-or-retry",
      status: "inferred",
      confidence: correctionSupport.evidence.length ? "medium" : "low",
      boundary: "未观察到强制闭环或自动回滚，只能作为人工修正或重试入口推理。",
    }),
  ].filter((step) => step.source.length && step.evidence.length);
  if (!loopSteps.length) return [];

  return [
    {
      id: "feedback:status-signal-correction",
      name: "状态信号与问题修正回流",
      status: "inferred",
      confidence: minConfidence(loopSteps.map((step) => step.confidence)),
      trigger: "页面出现状态、结果、质量、风险或异常信号，或存在编辑、调整、撤回、重试等修正入口。",
      correctionTargets: uniqueStrings(loopSteps.flatMap((step) => step.modules || [])),
      steps: loopSteps,
      source: uniqueBy(loopSteps.flatMap((step) => step.source), sourceKey),
      evidence: uniqueBy(loopSteps.flatMap((step) => step.evidence), evidenceKey),
      boundary: "该回流来自字段、动作与模块职责组合推理，不代表系统已自动闭环处理。",
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
  const workflowSpec = input.workflowSpec || {};
  const domainProfile = input.domainProfile || null;
  if (domainProfile) assertValidDomainProfile(domainProfile);
  const system = resolveSystem(operationSpec, evidenceSummary, verifiedClaims);
  const records = buildModuleRecords(operationSpec, evidenceSummary, verifiedClaims);
  const profileOptions = { domainProfile, workflowSpec, system };
  const businessObjects = buildBusinessObjects(records, profileOptions);
  const states = buildStates(records);
  const moduleResponsibilities = buildModuleResponsibilities(records);
  const processes = buildEndToEndProcess(records, profileOptions);
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
    version: 2,
    generatedAt: resolveGeneratedAt(operationSpec, evidenceSummary, verifiedClaims, input),
    system,
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
      observedRequiresWorkflowEvidence: true,
      domainProfileExplicitOnly: true,
      purpose:
        "Deterministic business-process abstraction for later narrative stages; not a replacement for verified operation evidence.",
    },
  };
  artifact.derivation = {
    builder: "build-business-process-model",
    algorithmVersion: 2,
    profileId: domainProfile?.profileId || "",
    sourceHash: crypto
      .createHash("sha256")
      .update(stableJson(artifact.sourceArtifacts || {}))
      .digest("hex"),
    contentHash: hashBusinessProcessContent(artifact),
  };
  return artifact;
}

function assertJsonObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
}

function assertArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
}

function assertValidBusinessProcessStatus(status, label) {
  const allowed = new Set(["observed", "partially-observed", "inferred", "candidate", "pending"]);
  if (!allowed.has(String(status || ""))) {
    throw new Error(`${label} status must be one of observed, partially-observed, inferred, candidate, pending.`);
  }
}

function assertValidSourceEvidenceArrays(item, label) {
  assertArray(item.source, `${label}.source`);
  assertArray(item.evidence, `${label}.evidence`);
  if (!item.source.length || !item.evidence.length) {
    throw new Error(`${label} must include non-empty source and evidence arrays.`);
  }
}

function assertValidBusinessProcessModelArtifact(value, options = {}) {
  assertJsonObject(value, "business-process-model.json");
  if (value.artifactType !== "business-process-model") {
    throw new Error("business-process-model.json artifactType must be business-process-model.");
  }
  if (Number(value.version) !== 2) {
    throw new Error("business-process-model.json version must be 2.");
  }
  assertJsonObject(value.sourceArtifacts, "business-process-model.json sourceArtifacts");
  assertJsonObject(value.derivation, "business-process-model.json derivation");
  if (!value.derivation.contentHash) {
    throw new Error("business-process-model.json derivation.contentHash is required.");
  }
  assertArray(value.businessObjects, "business-process-model.json businessObjects");
  assertArray(value.states, "business-process-model.json states");
  assertArray(value.moduleResponsibilities, "business-process-model.json moduleResponsibilities");
  assertArray(value.processes, "business-process-model.json processes");
  assertArray(value.feedbackLoops, "business-process-model.json feedbackLoops");
  for (const [index, object] of value.businessObjects.entries()) {
    if (!object.id || !object.name) throw new Error(`business-process-model.json businessObjects/${index} id and name are required.`);
    assertValidSourceEvidenceArrays(object, `business-process-model.json businessObjects/${index}`);
  }
  for (const [index, processItem] of value.processes.entries()) {
    if (!processItem.id || !processItem.name) {
      throw new Error(`business-process-model.json processes/${index} id and name are required.`);
    }
    assertValidBusinessProcessStatus(processItem.status, `business-process-model.json processes/${index}`);
    assertValidSourceEvidenceArrays(processItem, `business-process-model.json processes/${index}`);
    assertArray(processItem.steps, `business-process-model.json processes/${index}.steps`);
    for (const [stepIndex, step] of processItem.steps.entries()) {
      if (!step.id || !step.name) {
        throw new Error(`business-process-model.json processes/${index}.steps/${stepIndex} id and name are required.`);
      }
      assertValidBusinessProcessStatus(step.status, `business-process-model.json processes/${index}.steps/${stepIndex}`);
      assertValidSourceEvidenceArrays(step, `business-process-model.json processes/${index}.steps/${stepIndex}`);
      if (step.status !== "observed" && !compactString(step.boundary)) {
        throw new Error(`business-process-model.json processes/${index}.steps/${stepIndex} inferred or candidate steps must include boundary.`);
      }
    }
    if (processItem.status !== "observed" && !compactString(processItem.boundary)) {
      throw new Error(`business-process-model.json processes/${index} inferred or candidate process must include boundary.`);
    }
  }
  if (options.validateContentHash !== false) {
    const expectedHash = hashBusinessProcessContent(value);
    if (value.derivation.contentHash !== expectedHash) {
      throw new Error("business-process-model.json derivation.contentHash is stale.");
    }
  }
  return true;
}

function buildBusinessProcessModelFromDir(inputDir, options = {}) {
  const dir = path.resolve(String(inputDir || "."));
  const operationSpecPath = options.operationSpecPath || path.join(dir, "operation-spec.json");
  const evidenceSummaryPath = options.evidenceSummaryPath || path.join(dir, "evidence-summary.json");
  const verifiedClaimsPath = options.verifiedClaimsPath || path.join(dir, "verified-claims.json");
  const workflowSpecPath = options.workflowSpecPath || path.join(dir, "workflow-spec.json");
  const domainProfilePath = options.domainProfilePath || options.domainProfile;
  const operationSpec = readRequiredJsonObject(operationSpecPath, { label: "Operation spec" });
  const evidenceSummary = readRequiredJsonObject(evidenceSummaryPath, { label: "Evidence summary" });
  const verifiedClaims = readRequiredJsonObject(verifiedClaimsPath, { label: "Verified claims" });
  const workflowSpec = fs.existsSync(workflowSpecPath)
    ? readRequiredJsonObject(workflowSpecPath, { label: "Workflow spec" })
    : {};
  const domainProfile = domainProfilePath
    ? readRequiredJsonObject(domainProfilePath, { label: "Domain profile" })
    : null;
  const artifact = buildBusinessProcessModel({
    operationSpec,
    workflowSpec,
    evidenceSummary,
    verifiedClaims,
    domainProfile,
    sourceArtifacts: buildSourceArtifacts({
      operationSpec: operationSpecPath,
      workflowSpec: fs.existsSync(workflowSpecPath) ? workflowSpecPath : "",
      evidenceSummary: evidenceSummaryPath,
      verifiedClaims: verifiedClaimsPath,
      domainProfile: domainProfilePath || "",
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
    workflowSpecPath: args["workflow-spec"],
    evidenceSummaryPath: args["evidence-summary"],
    verifiedClaimsPath: args["verified-claims"],
    domainProfilePath: args["domain-profile"],
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
  assertValidBusinessProcessModelArtifact,
  buildBusinessProcessModel,
  buildBusinessProcessModelFromDir,
  buildSourceArtifacts,
  hashBusinessProcessContent,
  stableJson,
  fingerprintFile,
};
