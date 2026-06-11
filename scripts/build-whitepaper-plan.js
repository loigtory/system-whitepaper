#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  parseArgs,
  readRequiredJsonObject,
  writeJson,
} = require("./system-whitepaper-lib");
const { assertValidVerifiedClaimsArtifact } = require("./fact-check-whitepaper");
const { assertValidBusinessProcessModelArtifact } = require("./build-business-process-model");

const FORBIDDEN_CONTENT_PATTERN = /password|secret|token|cookie|jdbc:|mysql:\/\/|postgres:\/\/|http:\/\/|https:\/\//i;
const STATUS_VALUES = new Set(["observed", "partially-observed", "inferred", "candidate", "pending", "confirmed", "weak"]);

function compactString(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values = []) {
  return Array.from(new Set(asArray(values).map(compactString).filter(Boolean)));
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

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
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

function sourceArtifact(filePath) {
  return {
    file: path.basename(filePath),
    fingerprint: fingerprintFile(filePath),
  };
}

function buildSourceArtifacts(input = {}) {
  const result = {};
  for (const [key, filePath] of Object.entries(input)) {
    if (!filePath) continue;
    result[key] = sourceArtifact(filePath);
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

function planContentForHash(plan = {}) {
  return {
    version: plan.version,
    system: plan.system || {},
    chapters: plan.chapters || [],
    requiredItems: plan.requiredItems || [],
    allowedFacts: plan.allowedFacts || [],
    pendingItems: plan.pendingItems || [],
    forbiddenItems: plan.forbiddenItems || [],
    metrics: plan.metrics || {},
    rules: plan.rules || {},
  };
}

function hashWhitepaperPlanContent(plan = {}) {
  return crypto.createHash("sha256").update(stableJson(planContentForHash(plan))).digest("hex");
}

function deriveSystem(input = {}) {
  const operationSpec = input.operationSpec || {};
  const evidenceSummary = input.evidenceSummary || {};
  const verifiedClaims = input.verifiedClaims || {};
  return {
    code:
      compactString(operationSpec.systemCode) ||
      compactString(evidenceSummary.system?.code) ||
      compactString(verifiedClaims.system?.code),
    name:
      compactString(operationSpec.systemName) ||
      compactString(evidenceSummary.system?.name) ||
      compactString(verifiedClaims.system?.name),
  };
}

function normalizeTerms(values = []) {
  return uniqueStrings(
    values
      .flatMap((value) => {
        if (Array.isArray(value)) return value;
        return [value];
      })
      .filter(Boolean),
  ).slice(0, 12);
}

function addUniqueItem(items, item) {
  if (!item?.id || items.some((existing) => existing.id === item.id)) return;
  items.push(item);
}

function claimTerms(claim = {}) {
  return normalizeTerms([
    claim.module,
    claim.function,
    claim.subject,
    claim.entity,
    claim.table,
    claim.text,
    claim.evidence?.comment,
    claim.evidence?.queryFields,
    claim.evidence?.tableColumns,
  ]);
}

function writableClaimRequiredItem(claim = {}, index = 0) {
  const subject = compactString(claim.subject || claim.function || claim.entity || claim.table || claim.id);
  const moduleName = compactString(claim.module);
  return {
    id: stableId("plan-claim", [claim.id || index]),
    chapter: moduleName ? 3 : 1,
    status: compactString(claim.status || "confirmed"),
    type: "writable-claim",
    claimId: compactString(claim.id),
    text: moduleName
      ? `${moduleName}模块必须覆盖${subject}这一已验证功能或事实。`
      : `白皮书必须覆盖${subject}这一已验证事实。`,
    terms: claimTerms(claim),
    source: [sourceRef("verified-claims", `/claims/${index}`, claim.id, subject, claim.type || "claim")],
    evidence: [
      evidenceRef("verified-claim", moduleName || "verified-claims", subject, claim.id),
    ],
  };
}

function nonWritablePendingItem(claim = {}, index = 0) {
  const subject = compactString(claim.subject || claim.function || claim.entity || claim.table || claim.id);
  return {
    id: stableId("plan-pending-claim", [claim.id || index]),
    status: compactString(claim.status || "weak"),
    type: "non-writable-claim",
    text: `${subject}证据不足，只能作为待确认事项，不得写入正文确认结论。`,
    terms: claimTerms(claim),
    source: [sourceRef("verified-claims", `/claims/${index}`, claim.id, subject, claim.type || "claim")],
    evidence: [evidenceRef("non-writable-claim", claim.module || "verified-claims", subject, claim.id)],
  };
}

function moduleResponsibilityItems(model = {}) {
  return asArray(model.moduleResponsibilities).map((item, index) => {
    const moduleName = compactString(item.module || item.name || item.label);
    const role = compactString(item.roleLabel || item.role || item.responsibility || "模块职责");
    return {
      id: stableId("plan-module", [item.id || moduleName || index]),
      chapter: 2,
      status: compactString(item.status || "inferred"),
      type: "module-responsibility",
      text: `${moduleName}模块必须说明其在业务过程中的职责：${role}。`,
      terms: normalizeTerms([moduleName, role, item.reasoning, item.businessObject, item.object]),
      source: asArray(item.source).length
        ? item.source
        : [sourceRef("business-process-model", `/moduleResponsibilities/${index}`, item.id || moduleName, moduleName, "module-responsibility")],
      evidence: asArray(item.evidence).length
        ? item.evidence
        : [evidenceRef("business-process", moduleName, role, item.id || moduleName)],
    };
  }).filter((item) => item.terms.length);
}

function processRequiredItems(model = {}) {
  return asArray(model.processes).map((processItem, index) => {
    const name = compactString(processItem.name || processItem.id || `业务流程${index + 1}`);
    const status = compactString(processItem.status || "inferred");
    const stepTerms = asArray(processItem.steps).flatMap((step) => [step.name, step.roleLabel, step.status]);
    return {
      id: stableId("plan-process", [processItem.id || name || index]),
      chapter: 4,
      status,
      type: "business-process",
      text:
        status === "observed"
          ? `第 4 章必须覆盖已观察流程：${name}。`
          : `第 4 章必须覆盖${name}，并明确这是${status}流程及其证据边界。`,
      terms: normalizeTerms([name, status, processItem.boundary, processItem.reasoning, stepTerms]),
      source: asArray(processItem.source).length
        ? processItem.source
        : [sourceRef("business-process-model", `/processes/${index}`, processItem.id || name, name, "process")],
      evidence: asArray(processItem.evidence).length
        ? processItem.evidence
        : [evidenceRef("business-process", name, status, processItem.id || name)],
      boundary: compactString(processItem.boundary),
    };
  }).filter((item) => item.terms.length);
}

function workflowAllowedFacts(workflowSpec = {}) {
  const facts = [];
  for (const [workflowIndex, workflow] of asArray(workflowSpec.workflows).entries()) {
    const workflowName = compactString(workflow.name || workflow.module || workflow.id);
    for (const [stepIndex, step] of asArray(workflow.steps).entries()) {
      const stepName = compactString(step.name || step.title || `步骤${stepIndex + 1}`);
      addUniqueItem(facts, {
        id: stableId("fact-workflow-step", [workflow.id || workflowName, step.id || stepName]),
        status: "observed",
        type: "workflow-step",
        text: `${workflowName}包含已观察步骤：${stepName}。`,
        terms: normalizeTerms([workflowName, stepName, workflow.module, step.fields, step.buttons]),
        source: [sourceRef("workflow-spec", `/workflows/${workflowIndex}/steps/${stepIndex}`, step.id || stepName, stepName, "workflow-step")],
        evidence: [evidenceRef("workflow-step", workflowName, stepName, step.id || stepName)],
      });
    }
  }
  return facts;
}

function operationModuleFallbackItems(operationSpec = {}, evidenceSummary = {}) {
  const evidenceModules = new Map(
    asArray(evidenceSummary.modules).map((item) => [compactString(item.name), item]),
  );
  return asArray(operationSpec.modules).map((module, index) => {
    const name = compactString(module.name);
    const evidenceModule = evidenceModules.get(name) || {};
    return {
      id: stableId("plan-operation-module", [name || index]),
      chapter: 2,
      status: "observed",
      type: "operation-module",
      text: `白皮书必须覆盖${name}模块的用途和页面证据。`,
      terms: normalizeTerms([
        name,
        module.businessHint,
        evidenceModule.summary,
        module.list?.columns,
        module.list?.queryFields,
      ]),
      source: [sourceRef("operation-spec", `/modules/${index}`, name, name, "module")],
      evidence: [evidenceRef("operation-spec", name, module.businessHint || name, module.entry || name)],
    };
  }).filter((item) => item.terms.length);
}

function chapterTitle(chapter) {
  return {
    1: "系统定位与业务价值",
    2: "功能模块概览",
    3: "核心功能说明",
    4: "典型业务流程",
    5: "使用角色与权限边界",
    6: "待确认事项",
  }[chapter] || `第 ${chapter} 章`;
}

function buildChapters(requiredItems = [], pendingItems = []) {
  const chapters = [1, 2, 3, 4, 5, 6].map((chapter) => ({
    chapter,
    title: chapterTitle(chapter),
    requiredItemIds: requiredItems.filter((item) => item.chapter === chapter).map((item) => item.id),
    pendingItemIds: chapter === 6 ? pendingItems.map((item) => item.id) : [],
    writingFocus:
      chapter === 4
        ? "按业务对象、状态流转、模块职责、回流闭环组织，不写成点击步骤。"
        : "",
  }));
  return chapters;
}

function buildWhitepaperPlan(input = {}) {
  const verifiedClaims = input.verifiedClaims || {};
  if (verifiedClaims.artifactType === "verified-claims") {
    assertValidVerifiedClaimsArtifact(verifiedClaims);
  }
  const businessProcessModel = input.businessProcessModel || {};
  if (businessProcessModel.artifactType === "business-process-model") {
    assertValidBusinessProcessModelArtifact(businessProcessModel, { validateContentHash: false });
  }
  const workflowSpec = input.workflowSpec || {};
  if (workflowSpec.artifactType === "workflow-spec") {
    assertJsonObject(workflowSpec, "workflow-spec.json must be an object.");
    assertArray(workflowSpec.workflows, "workflow-spec.json workflows must be an array.");
    assertJsonObject(workflowSpec.metrics || {}, "workflow-spec.json metrics must be an object.");
  }

  const requiredItems = [];
  const allowedFacts = [];
  const pendingItems = [];
  const forbiddenItems = [
    {
      id: "forbidden:unsupported-business-claim",
      text: "不得写入 whitepaper-plan、verified-claims、business-process-model、workflow-spec、operation-spec 或 evidence-summary 之外的业务流程、用途、职责、状态或自动化结论。",
    },
    {
      id: "forbidden:non-writable-body-claim",
      text: "writable=false 的断言不得作为正文确认结论，也不得使用 [claim:<id>] 标记。",
    },
  ];

  for (const [index, claim] of asArray(verifiedClaims.claims).entries()) {
    if (claim?.writable) {
      const item = writableClaimRequiredItem(claim, index);
      addUniqueItem(requiredItems, item);
      addUniqueItem(allowedFacts, {
        id: stableId("fact-claim", [claim.id || index]),
        status: compactString(claim.status || "confirmed"),
        type: "writable-claim",
        claimId: compactString(claim.id),
        text: item.text,
        terms: item.terms,
        source: item.source,
        evidence: item.evidence,
      });
    } else {
      addUniqueItem(pendingItems, nonWritablePendingItem(claim, index));
    }
  }

  for (const item of moduleResponsibilityItems(businessProcessModel)) {
    addUniqueItem(requiredItems, item);
    addUniqueItem(allowedFacts, { ...item, id: item.id.replace(/^plan-/, "fact-") });
  }
  for (const item of processRequiredItems(businessProcessModel)) {
    addUniqueItem(requiredItems, item);
    addUniqueItem(allowedFacts, { ...item, id: item.id.replace(/^plan-/, "fact-") });
  }
  for (const fact of workflowAllowedFacts(workflowSpec)) {
    addUniqueItem(allowedFacts, fact);
  }
  for (const item of operationModuleFallbackItems(input.operationSpec || {}, input.evidenceSummary || {})) {
    addUniqueItem(requiredItems, item);
    addUniqueItem(allowedFacts, { ...item, id: item.id.replace(/^plan-/, "fact-") });
  }

  const sourceArtifacts = input.sourceArtifacts || {};
  const plan = {
    artifactType: "whitepaper-plan",
    version: 1,
    generatedAt: input.generatedAt || new Date().toISOString(),
    system: deriveSystem(input),
    sourceArtifacts,
    derivation: {
      builder: "build-whitepaper-plan",
      algorithmVersion: 1,
      sourceHash: crypto.createHash("sha256").update(stableJson(sourceArtifacts)).digest("hex"),
      contentHash: "",
    },
    chapters: [],
    requiredItems,
    allowedFacts,
    pendingItems,
    forbiddenItems,
    metrics: {
      chapterCount: 6,
      requiredItemCount: requiredItems.length,
      allowedFactCount: allowedFacts.length,
      pendingItemCount: pendingItems.length,
      forbiddenItemCount: forbiddenItems.length,
      writableClaimRequiredCount: requiredItems.filter((item) => item.type === "writable-claim").length,
      processRequiredCount: requiredItems.filter((item) => item.type === "business-process").length,
    },
    rules: {
      aiMustUsePlanFirst: true,
      nonWritableClaimsPendingOnly: true,
      observedRequiresWorkflowEvidence: true,
      inferredMustKeepBoundary: true,
    },
  };
  plan.chapters = buildChapters(requiredItems, pendingItems);
  plan.derivation.contentHash = hashWhitepaperPlanContent(plan);
  assertValidWhitepaperPlanArtifact(plan);
  return plan;
}

function readOptionalArtifact(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return readRequiredJsonObject(filePath, { label: path.basename(filePath) });
}

function buildWhitepaperPlanFromDir(inputDir, options = {}) {
  const dir = path.resolve(String(inputDir || "."));
  const paths = {
    verifiedClaimsPath: options.verifiedClaimsPath || path.join(dir, "verified-claims.json"),
    businessProcessModelPath: options.businessProcessModelPath || path.join(dir, "business-process-model.json"),
    workflowSpecPath: options.workflowSpecPath || path.join(dir, "workflow-spec.json"),
    operationSpecPath: options.operationSpecPath || path.join(dir, "operation-spec.json"),
    evidenceSummaryPath: options.evidenceSummaryPath || path.join(dir, "evidence-summary.json"),
  };
  const plan = buildWhitepaperPlan({
    verifiedClaims: readRequiredJsonObject(paths.verifiedClaimsPath, { label: "Verified claims" }),
    businessProcessModel: readRequiredJsonObject(paths.businessProcessModelPath, { label: "Business process model" }),
    workflowSpec: readOptionalArtifact(paths.workflowSpecPath),
    operationSpec: readOptionalArtifact(paths.operationSpecPath),
    evidenceSummary: readOptionalArtifact(paths.evidenceSummaryPath),
    sourceArtifacts: buildSourceArtifacts({
      verifiedClaims: paths.verifiedClaimsPath,
      businessProcessModel: paths.businessProcessModelPath,
      workflowSpec: fs.existsSync(paths.workflowSpecPath) ? paths.workflowSpecPath : "",
      operationSpec: fs.existsSync(paths.operationSpecPath) ? paths.operationSpecPath : "",
      evidenceSummary: fs.existsSync(paths.evidenceSummaryPath) ? paths.evidenceSummaryPath : "",
    }),
    generatedAt: options.generatedAt,
  });
  const outputPath = options.outputPath || path.join(dir, "whitepaper-plan.json");
  writeJson(outputPath, plan);
  return plan;
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

function assertValidPlanItem(item = {}, label = "whitepaper-plan item") {
  assertJsonObject(item, `${label} must be a JSON object.`);
  if (!compactString(item.id)) throw new Error(`${label}.id is required.`);
  if (item.chapter !== undefined && !Number.isFinite(Number(item.chapter))) {
    throw new Error(`${label}.chapter must be numeric when present.`);
  }
  const status = compactString(item.status || "pending");
  if (item.status !== undefined && !STATUS_VALUES.has(status)) {
    throw new Error(`${label}.status is invalid.`);
  }
  if (!compactString(item.text)) throw new Error(`${label}.text is required.`);
  assertArray(item.terms, `${label}.terms must be an array.`);
  assertArray(item.source, `${label}.source must be an array.`);
  assertArray(item.evidence, `${label}.evidence must be an array.`);
}

function assertValidWhitepaperPlanArtifact(plan = {}, options = {}) {
  assertJsonObject(plan, "whitepaper-plan.json must be a JSON object.");
  if (plan.artifactType !== "whitepaper-plan") {
    throw new Error("whitepaper-plan.json artifactType must be whitepaper-plan.");
  }
  if (Number(plan.version) !== 1) {
    throw new Error("whitepaper-plan.json version must be 1.");
  }
  assertJsonObject(plan.sourceArtifacts, "whitepaper-plan.json sourceArtifacts must be a JSON object.");
  assertJsonObject(plan.derivation, "whitepaper-plan.json derivation must be a JSON object.");
  if (!compactString(plan.derivation.contentHash)) {
    throw new Error("whitepaper-plan.json derivation.contentHash is required.");
  }
  assertArray(plan.chapters, "whitepaper-plan.json chapters must be an array.");
  assertArray(plan.requiredItems, "whitepaper-plan.json requiredItems must be an array.");
  assertArray(plan.allowedFacts, "whitepaper-plan.json allowedFacts must be an array.");
  assertArray(plan.pendingItems, "whitepaper-plan.json pendingItems must be an array.");
  assertArray(plan.forbiddenItems, "whitepaper-plan.json forbiddenItems must be an array.");
  assertJsonObject(plan.metrics, "whitepaper-plan.json metrics must be a JSON object.");
  assertJsonObject(plan.rules, "whitepaper-plan.json rules must be a JSON object.");

  const serialized = JSON.stringify({
    system: plan.system,
    chapters: plan.chapters,
    requiredItems: plan.requiredItems,
    allowedFacts: plan.allowedFacts,
    pendingItems: plan.pendingItems,
    forbiddenItems: plan.forbiddenItems,
  });
  if (FORBIDDEN_CONTENT_PATTERN.test(serialized)) {
    throw new Error("whitepaper-plan.json contains forbidden secret, URL, or connection-like content.");
  }

  for (const [index, item] of plan.requiredItems.entries()) {
    assertValidPlanItem(item, `whitepaper-plan.json requiredItems[${index}]`);
    if (item.type === "writable-claim" && !compactString(item.claimId)) {
      throw new Error(`whitepaper-plan.json requiredItems[${index}].claimId is required for writable claims.`);
    }
  }
  for (const [index, item] of plan.allowedFacts.entries()) {
    assertValidPlanItem(item, `whitepaper-plan.json allowedFacts[${index}]`);
  }
  for (const [index, item] of plan.pendingItems.entries()) {
    assertValidPlanItem(item, `whitepaper-plan.json pendingItems[${index}]`);
  }

  const expectedHash = hashWhitepaperPlanContent(plan);
  if (options.validateContentHash !== false && plan.derivation.contentHash !== expectedHash) {
    throw new Error("whitepaper-plan.json derivation.contentHash is stale.");
  }
  return true;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    throw new Error("Usage: node scripts/build-whitepaper-plan.js --input outputs/system");
  }
  const plan = buildWhitepaperPlanFromDir(args.input, { outputPath: args.output });
  const outputPath = args.output || path.join(path.resolve(args.input), "whitepaper-plan.json");
  console.log(`Whitepaper plan written: ${outputPath}`);
  console.log(`Required items: ${plan.metrics.requiredItemCount}`);
  return plan;
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
  assertValidWhitepaperPlanArtifact,
  buildSourceArtifacts,
  buildWhitepaperPlan,
  buildWhitepaperPlanFromDir,
  fingerprintFile,
  hashWhitepaperPlanContent,
  main,
  sourceArtifact,
  stableJson,
};
