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

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values = []) {
  return Array.from(new Set(values.map(compactString).filter(Boolean)));
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

function minConfidence(values = []) {
  if (!values.length) return "low";
  return values.reduce(
    (best, value) => (confidenceRank(value) < confidenceRank(best) ? value : best),
    "high",
  );
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
  if (input.operationSpecPath) {
    result.operationSpec = {
      file: path.basename(input.operationSpecPath),
      fingerprint: fingerprintFile(input.operationSpecPath),
    };
  }
  return result;
}

function evidenceRef(artifact, pointer, label, type = "artifact") {
  return {
    artifact,
    pointer,
    type,
    label: compactString(label),
  };
}

function fieldEvidenceRefs(moduleIndex, workflowType, flowIndex, stepIndex, step = {}) {
  const basePointer = `/modules/${moduleIndex}/${workflowType}/${flowIndex}/steps/${stepIndex}`;
  const refs = [evidenceRef("operation-spec", basePointer, step.title || step.name || "step", "step")];
  if (asArray(step.screenshots).length) {
    refs.push(evidenceRef("operation-spec", `${basePointer}/screenshots`, asArray(step.screenshots)[0], "screenshot"));
  }
  if (asArray(step.apis).length) {
    refs.push(evidenceRef("operation-spec", `${basePointer}/apis`, "step APIs", "api"));
  }
  return refs;
}

function normalizeStep(step = {}, index, moduleIndex, workflowType, flowIndex) {
  const name = compactString(step.title || step.name || `步骤 ${index + 1}`);
  const fields = asArray(step.fields).map((field) => ({
    label: compactString(field.label || field.name),
    required: Boolean(field.required),
    control: compactString(field.control || field.type),
    note: compactString(field.note),
  })).filter((field) => field.label || field.control || field.note);
  return {
    id: stableId("step", [name || index + 1]),
    order: index + 1,
    name,
    fields,
    buttons: uniqueStrings(step.buttons || []),
    screenshots: uniqueStrings(step.screenshots || []),
    apis: asArray(step.apis).map((api) => ({
      method: compactString(api.method),
      url: compactString(api.url),
      schemaKeys: uniqueStrings(api.schemaKeys || []),
    })),
    validation: step.validation && typeof step.validation === "object" ? {
      status: compactString(step.validation.status),
      filledFieldCount: Number(step.validation.filledFieldCount || 0),
      filledValue: compactString(step.validation.filledValue),
    } : {},
    evidenceRefs: fieldEvidenceRefs(moduleIndex, workflowType, flowIndex, index, step),
  };
}

function normalizeBusinessObject(module = {}, moduleIndex) {
  const value = compactString(module.businessObject?.value || module.businessObject?.name || module.name);
  return {
    name: value || "业务对象",
    confidence: compactString(module.businessObject?.confidence || "low"),
    evidence: uniqueStrings(module.businessObject?.evidence || []),
    evidenceRefs: [
      evidenceRef("operation-spec", `/modules/${moduleIndex}/businessObject`, value || module.name, "business-object"),
    ],
  };
}

function normalizeSignals(signals = [], moduleIndex, key) {
  return asArray(signals).map((signal, index) => ({
    field: compactString(signal.field || signal.name),
    signalType: compactString(signal.signalType || signal.type),
    enumOptions: uniqueStrings(signal.enumOptions || signal.options || []),
    confidence: compactString(signal.confidence || "low"),
    evidence: uniqueStrings(signal.evidence || []),
    evidenceRefs: [
      evidenceRef("operation-spec", `/modules/${moduleIndex}/${key}/${index}`, signal.field || signal.name, "signal"),
    ],
  })).filter((signal) => signal.field);
}

function workflowSourceType(module = {}, flow = {}) {
  return compactString(module.source || flow.source || flow.validation?.source);
}

function inferWorkflowEvidenceStatus(module = {}, flow = {}, workflowType = "flows") {
  if (workflowType === "plannedFlows") return "candidate";
  const source = workflowSourceType(module, flow);
  const status = compactString(flow.status);
  if (source === "home-overview-card" || status === "inferred-from-home-overview") {
    return "inferred";
  }
  return "observed";
}

function workflowBoundaries(flow = {}, evidenceStatus) {
  const status = compactString(flow.status || (evidenceStatus === "candidate" ? "planned" : ""));
  const reason = compactString(flow.reason);
  const boundaries = [];
  if (evidenceStatus === "candidate") {
    boundaries.push({
      severity: "P1",
      reason: reason || "该流程仅来自 plannedFlows，未形成可写入 observed workflow 的页面操作证据。",
    });
  }
  if (evidenceStatus === "inferred") {
    boundaries.push({
      severity: "P1",
      reason: reason || "依据首页流程卡片和截图归纳，未形成已点击菜单、表单执行或写操作验证证据。",
    });
  }
  if (evidenceStatus === "observed" && (/^(partial|failed)$/i.test(status) || reason)) {
    boundaries.push({
      severity: /failed/i.test(status) ? "P0" : "P1",
      reason: uniqueStrings([status, reason]).join(" · "),
    });
  }
  return boundaries;
}

function workflowConfidence(input = {}) {
  const { evidenceStatus, executionStatus, steps = [], lifecycleSignals = [], qualitySignals = [] } = input;
  if (evidenceStatus === "candidate") return "low";
  if (evidenceStatus === "inferred") return "medium";
  if (/^failed$/i.test(executionStatus)) return "low";
  if (!steps.length) return "low";
  const signalConfidenceValues = [
    ...lifecycleSignals.map((signal) => signal.confidence),
    ...qualitySignals.map((signal) => signal.confidence),
  ].map(compactString).filter(Boolean);
  const signalConfidence = signalConfidenceValues.length ? minConfidence(signalConfidenceValues) : "high";
  if (/^partial$/i.test(executionStatus)) return minConfidence(["medium", signalConfidence]);
  return minConfidence(["high", signalConfidence]);
}

function normalizeWorkflow(input = {}) {
  const {
    module,
    moduleIndex,
    flow,
    flowIndex,
    workflowType,
    evidenceStatus,
  } = input;
  const name = compactString(flow.name || flow.trigger || "业务流程");
  const steps = ["observed", "inferred"].includes(evidenceStatus)
    ? asArray(flow.steps).map((step, index) => normalizeStep(step, index, moduleIndex, workflowType, flowIndex))
    : [];
  const sourceType = workflowSourceType(module, flow);
  const lifecycleSignals = normalizeSignals(module.lifecycleSignals, moduleIndex, "lifecycleSignals");
  const qualitySignals = normalizeSignals(module.qualitySignals, moduleIndex, "qualitySignals");
  const executionStatus = compactString(flow.status || (evidenceStatus === "candidate" ? "planned" : ""));
  const evidenceRefs = [
    evidenceRef("operation-spec", `/modules/${moduleIndex}`, module.name, "module"),
    evidenceRef("operation-spec", `/modules/${moduleIndex}/${workflowType}/${flowIndex}`, name, "workflow"),
  ];
  return {
    id: stableId("workflow", [module.name, name]),
    module: compactString(module.name),
    moduleEntry: compactString(module.entry),
    name,
    trigger: compactString(flow.trigger || name),
    evidenceStatus,
    sourceType,
    executionStatus,
    confidence: workflowConfidence({
      evidenceStatus,
      executionStatus,
      steps,
      lifecycleSignals,
      qualitySignals,
    }),
    canNarrateAsObserved: evidenceStatus === "observed",
    canNarrateAsInferred: evidenceStatus === "inferred",
    businessObject: normalizeBusinessObject(module, moduleIndex),
    steps,
    lifecycleSignals,
    qualitySignals,
    listContext: {
      columns: uniqueStrings(module.list?.columns || []),
      queryFields: uniqueStrings(module.list?.queryFields || []),
      rowActions: uniqueStrings(module.list?.rowActions || []),
    },
    apis: asArray(module.apis).map((api) => ({
      method: compactString(api.method),
      url: compactString(api.url),
      schemaKeys: uniqueStrings(api.schemaKeys || []),
    })),
    boundaries: workflowBoundaries(flow, evidenceStatus),
    evidenceRefs,
  };
}

function buildPending(workflows = []) {
  const pending = [];
  for (const workflow of workflows) {
    if (workflow.evidenceStatus === "candidate") {
      const boundary = workflow.boundaries[0];
      pending.push({
        id: stableId("pending", [workflow.id, "candidate"]),
        topic: `${workflow.module} · ${workflow.name}`,
        reason: boundary?.reason || "流程仅为候选，未形成 observed workflow 证据。",
        evidenceRefs: workflow.evidenceRefs,
      });
      continue;
    }
    for (const [index, boundary] of workflow.boundaries.entries()) {
      pending.push({
        id: stableId("pending", [workflow.id, index]),
        topic: `${workflow.module} · ${workflow.name}`,
        reason: boundary.reason,
        evidenceRefs: workflow.evidenceRefs,
      });
    }
  }
  return pending;
}

function buildMetrics(workflows = [], pending = [], operationSpec = {}) {
  const observed = workflows.filter((workflow) => workflow.evidenceStatus === "observed");
  const inferred = workflows.filter((workflow) => workflow.evidenceStatus === "inferred");
  const candidates = workflows.filter((workflow) => workflow.evidenceStatus === "candidate");
  return {
    workflowCount: workflows.length,
    observedWorkflowCount: observed.length,
    inferredWorkflowCount: inferred.length,
    homeOverviewWorkflowCount: inferred.filter((workflow) => workflow.sourceType === "home-overview-card").length,
    candidateWorkflowCount: candidates.length,
    narratableWorkflowCount: workflows.filter(
      (workflow) => workflow.canNarrateAsObserved === true || workflow.canNarrateAsInferred === true,
    ).length,
    stepCount: workflows.reduce((sum, workflow) => sum + workflow.steps.length, 0),
    observedStepCount: observed.reduce((sum, workflow) => sum + workflow.steps.length, 0),
    inferredStepCount: inferred.reduce((sum, workflow) => sum + workflow.steps.length, 0),
    pendingCount: pending.length,
    sourceModuleCount: asArray(operationSpec.modules).length,
    boundaryCount: workflows.reduce((sum, workflow) => sum + workflow.boundaries.length, 0),
    lifecycleSignalCount: workflows.reduce((sum, workflow) => sum + workflow.lifecycleSignals.length, 0),
    qualitySignalCount: workflows.reduce((sum, workflow) => sum + workflow.qualitySignals.length, 0),
  };
}

function resolveSystem(operationSpec = {}) {
  return {
    code: compactString(operationSpec.systemCode),
    name: compactString(operationSpec.systemName),
    testUrl: compactString(operationSpec.testUrl),
  };
}

function buildWorkflowSpec(input = {}) {
  const operationSpec = input.operationSpec || {};
  const workflows = [];
  for (const [moduleIndex, module] of asArray(operationSpec.modules).entries()) {
    if (!compactString(module.name)) continue;
    for (const [flowIndex, flow] of asArray(module.flows).entries()) {
      workflows.push(normalizeWorkflow({
        module,
        moduleIndex,
        flow,
        flowIndex,
        workflowType: "flows",
        evidenceStatus: inferWorkflowEvidenceStatus(module, flow, "flows"),
      }));
    }
    for (const [flowIndex, flow] of asArray(module.plannedFlows).entries()) {
      workflows.push(normalizeWorkflow({
        module,
        moduleIndex,
        flow,
        flowIndex,
        workflowType: "plannedFlows",
        evidenceStatus: inferWorkflowEvidenceStatus(module, flow, "plannedFlows"),
      }));
    }
  }

  const pending = buildPending(workflows);
  const metrics = buildMetrics(workflows, pending, operationSpec);
  return {
    artifactType: "workflow-spec",
    version: 1,
    generatedAt: compactString(input.generatedAt || operationSpec.generatedAt || new Date().toISOString()),
    system: resolveSystem(operationSpec),
    sourceArtifacts: input.sourceArtifacts || {},
    workflows,
    pending,
    metrics,
    rules: {
      confirmedStepsRequireModuleFlow: true,
      plannedFlowsAreCandidatesOnly: true,
      homepageOverviewFlowsAreInferred: true,
      signalsDoNotCreateTransitions: true,
      crossModuleOrderRequiresObservedFlowEvidence: true,
      partialOrFailedFlowsRequireBoundary: true,
    },
  };
}

function assertJsonObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

function assertArray(value, message) {
  if (!Array.isArray(value)) throw new Error(message);
}

function assertMetricEquals(metrics = {}, key, expected) {
  if (!Number.isFinite(Number(metrics[key]))) {
    throw new Error(`workflow-spec.json metrics.${key} must be numeric.`);
  }
  if (Number(metrics[key]) !== expected) {
    throw new Error(`workflow-spec.json metrics.${key} must match the artifact body count.`);
  }
}

function assertValidWorkflowSpecArtifact(artifact = {}) {
  assertJsonObject(artifact, "workflow-spec.json must be an object.");
  if (artifact.artifactType !== "workflow-spec") {
    throw new Error("workflow-spec.json artifactType must be workflow-spec.");
  }
  assertJsonObject(artifact.system, "workflow-spec.json system must be an object.");
  assertJsonObject(artifact.sourceArtifacts, "workflow-spec.json sourceArtifacts must be an object.");
  const operationSpecSource = artifact.sourceArtifacts.operationSpec;
  if (
    !operationSpecSource ||
    typeof operationSpecSource !== "object" ||
    Array.isArray(operationSpecSource) ||
    !operationSpecSource.fingerprint ||
    typeof operationSpecSource.fingerprint !== "object" ||
    Array.isArray(operationSpecSource.fingerprint) ||
    compactString(operationSpecSource.file) !== "operation-spec.json" ||
    operationSpecSource.fingerprint.exists !== true ||
    !compactString(operationSpecSource.fingerprint.sha256)
  ) {
    throw new Error(
      "workflow-spec.json sourceArtifacts.operationSpec.fingerprint must reference the current operation-spec.json.",
    );
  }
  assertArray(artifact.workflows, "workflow-spec.json workflows must be an array.");
  assertArray(artifact.pending, "workflow-spec.json pending must be an array.");
  assertJsonObject(artifact.metrics, "workflow-spec.json metrics must be an object.");
  assertJsonObject(artifact.rules, "workflow-spec.json rules must be an object.");

  const observed = artifact.workflows.filter((workflow) => workflow.evidenceStatus === "observed");
  const inferred = artifact.workflows.filter((workflow) => workflow.evidenceStatus === "inferred");
  const candidates = artifact.workflows.filter((workflow) => workflow.evidenceStatus === "candidate");
  const stepCount = artifact.workflows.reduce((sum, workflow) => {
    assertJsonObject(workflow, "workflow-spec.json workflows[] must be an object.");
    if (!compactString(workflow.id)) throw new Error("workflow-spec.json workflows[].id is required.");
    if (!compactString(workflow.module)) throw new Error("workflow-spec.json workflows[].module is required.");
    if (!compactString(workflow.name)) throw new Error("workflow-spec.json workflows[].name is required.");
    if (!["observed", "inferred", "candidate"].includes(workflow.evidenceStatus)) {
      throw new Error("workflow-spec.json workflows[].evidenceStatus must be observed, inferred, or candidate.");
    }
    assertArray(workflow.steps, "workflow-spec.json workflows[].steps must be an array.");
    assertArray(workflow.boundaries, "workflow-spec.json workflows[].boundaries must be an array.");
    assertArray(workflow.evidenceRefs, "workflow-spec.json workflows[].evidenceRefs must be an array.");
    if (workflow.evidenceStatus === "candidate" && workflow.canNarrateAsObserved !== false) {
      throw new Error("workflow-spec.json candidate workflows must not be narratable as observed.");
    }
    if (workflow.evidenceStatus === "candidate" && workflow.steps.length) {
      throw new Error("workflow-spec.json candidate workflows must not contain observed steps.");
    }
    if (workflow.evidenceStatus === "inferred" && workflow.canNarrateAsObserved !== false) {
      throw new Error("workflow-spec.json inferred workflows must not be narratable as observed.");
    }
    if (workflow.evidenceStatus === "inferred" && workflow.canNarrateAsInferred !== true) {
      throw new Error("workflow-spec.json inferred workflows must be narratable only as inferred.");
    }
    if (workflow.evidenceStatus === "inferred" && !workflow.boundaries.length) {
      throw new Error("workflow-spec.json inferred workflows must carry inference boundaries.");
    }
    if (/^(partial|failed)$/i.test(workflow.executionStatus || "") && !workflow.boundaries.length) {
      throw new Error("workflow-spec.json partial or failed workflows must carry boundaries.");
    }
    return sum + workflow.steps.length;
  }, 0);

  assertMetricEquals(artifact.metrics, "workflowCount", artifact.workflows.length);
  assertMetricEquals(artifact.metrics, "observedWorkflowCount", observed.length);
  assertMetricEquals(artifact.metrics, "inferredWorkflowCount", inferred.length);
  assertMetricEquals(
    artifact.metrics,
    "homeOverviewWorkflowCount",
    inferred.filter((workflow) => workflow.sourceType === "home-overview-card").length,
  );
  assertMetricEquals(artifact.metrics, "candidateWorkflowCount", candidates.length);
  assertMetricEquals(
    artifact.metrics,
    "narratableWorkflowCount",
    artifact.workflows.filter(
      (workflow) => workflow.canNarrateAsObserved === true || workflow.canNarrateAsInferred === true,
    ).length,
  );
  assertMetricEquals(artifact.metrics, "stepCount", stepCount);
  assertMetricEquals(
    artifact.metrics,
    "observedStepCount",
    observed.reduce((sum, workflow) => sum + workflow.steps.length, 0),
  );
  assertMetricEquals(
    artifact.metrics,
    "inferredStepCount",
    inferred.reduce((sum, workflow) => sum + workflow.steps.length, 0),
  );
  assertMetricEquals(artifact.metrics, "pendingCount", artifact.pending.length);
  return true;
}

function buildWorkflowSpecFromDir(inputDir, options = {}) {
  const dir = path.resolve(String(inputDir || "."));
  const operationSpecPath = options.operationSpecPath || path.join(dir, "operation-spec.json");
  const operationSpec = readRequiredJsonObject(operationSpecPath, { label: "Operation spec" });
  const artifact = buildWorkflowSpec({
    operationSpec,
    generatedAt: options.generatedAt,
    sourceArtifacts: buildSourceArtifacts({ operationSpecPath }),
  });
  assertValidWorkflowSpecArtifact(artifact);
  const outputPath = options.outputPath || path.join(dir, "workflow-spec.json");
  writeJson(outputPath, artifact);
  return { outputPath, artifact };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    throw new Error(
      "Usage: node scripts/build-workflow-spec.js --input outputs/system [--output outputs/system/workflow-spec.json]",
    );
  }
  const result = buildWorkflowSpecFromDir(args.input, {
    outputPath: args.output,
    operationSpecPath: args["operation-spec"],
  });
  console.log(`Workflow spec written: ${result.outputPath}`);
  console.log(
    `Workflow spec: workflows=${result.artifact.metrics.workflowCount} observed=${result.artifact.metrics.observedWorkflowCount} candidates=${result.artifact.metrics.candidateWorkflowCount} steps=${result.artifact.metrics.stepCount}`,
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
  assertValidWorkflowSpecArtifact,
  buildSourceArtifacts,
  buildWorkflowSpec,
  buildWorkflowSpecFromDir,
  fingerprintFile,
  main,
};
