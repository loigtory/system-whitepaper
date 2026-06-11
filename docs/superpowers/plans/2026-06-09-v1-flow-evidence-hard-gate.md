# V1 Flow Evidence Hard Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `workflow-spec.json` a production pipeline/readiness artifact and block formal review when observed operation flows or workflow steps are missing.

**Architecture:** Add a `workflow-spec` pipeline node after `build-spec`, load workflow spec in truth-readiness, validate its contract and lineage against current operation spec, and add a binary `workflow` gate with P0 blockers. This V1-A plan intentionally does not change Playwright collection, prompt generation, DB behavior, or whitepaper copy.

**Tech Stack:** Node.js CommonJS, `node:test`, existing `scripts/build-workflow-spec.js`, `scripts/run-whitepaper-pipeline.js`, `scripts/pipeline-state.js`, `scripts/check-truth-readiness.js`, and `scripts/system-whitepaper.test.js`.

---

## File Structure

- Modify `scripts/check-truth-readiness.js`: add workflow spec input, validator import, workflow gate, lineage check, blockers, improvement actions, and report artifact contract expectation.
- Modify `scripts/run-whitepaper-pipeline.js`: add `workflow-spec` to selected nodes and implement the node by invoking `scripts/build-workflow-spec.js`.
- Modify `scripts/pipeline-state.js`: add `workflow-spec` node and artifact label.
- Modify `scripts/system-whitepaper.test.js`: add V1-A tests near existing pipeline, workflow spec, and truth-readiness tests.
- Create `docs/checkpoints/2026-06-09-v1-flow-gate-checkpoint.md`: record V1-A implementation and verification.

No collector, Playwright, Browser Use, Stagehand, Crawlee, DB connector, prompt, narrative copy, or package distribution changes are part of this plan.

## Task 1: Add Workflow Readiness Red Tests

**Files:**
- Modify: `scripts/system-whitepaper.test.js`

- [ ] **Step 1: Add helper for valid workflow artifacts near workflow spec tests**

Add this helper after `operationSpecFixture` or before the truth-readiness workflow tests:

```js
function workflowSpecFixtureFromOperation(operationSpec, overrides = {}) {
  const { buildWorkflowSpec } = require("./build-workflow-spec");
  const workflowSpec = buildWorkflowSpec({
    operationSpec,
    generatedAt: "2026-06-03T00:00:30.000Z",
    sourceArtifacts: overrides.sourceArtifacts || {
      operationSpec: {
        file: "operation-spec.json",
        status: "ok",
        fingerprint: { exists: false, size: 0, mtimeMs: null, sha256: "" },
      },
    },
  });
  return {
    ...workflowSpec,
    ...overrides,
    metrics: {
      ...workflowSpec.metrics,
      ...(overrides.metrics || {}),
    },
    sourceArtifacts: {
      ...workflowSpec.sourceArtifacts,
      ...(overrides.sourceArtifacts || {}),
    },
  };
}
```

- [ ] **Step 2: Add red test for missing operation flows**

Add this test near `truth readiness passes only when evidence claims fact-check and narrative gates pass`:

```js
test("truth readiness blocks formal review when operation flows are missing", () => {
  const { buildTruthReadinessReport } = require("./check-truth-readiness");
  const operationSpec = operationSpecFixture();
  const workflowSpec = workflowSpecFixtureFromOperation(operationSpec);
  const artifacts = {
    quality: { file: "quality-report.json", status: "ok", value: qualityReportFixture() },
    claims: {
      file: "verified-claims.json",
      status: "ok",
      value: verifiedClaimsFixture([
        {
          id: "function:AI任务管理:任务列表",
          subject: "任务列表",
          module: "AI任务管理",
          status: "confirmed",
          writable: true,
        },
      ]),
    },
    factCheck: { file: "fact-check-report.json", status: "ok", value: factCheckReportFixture() },
    narrative: { file: "narrative-quality-report.json", status: "ok", value: narrativeQualityReportFixture() },
    operationSpec: { file: "operation-spec.json", status: "ok", value: operationSpec },
    workflowSpec: { file: "workflow-spec.json", status: "ok", value: workflowSpec },
  };

  const report = buildTruthReadinessReport({ artifacts, threshold: 95 });

  assert.equal(report.canSubmitReview, false);
  assert.equal(report.gates.workflow.pass, false);
  assert.equal(report.gates.workflow.metrics.operationFlowCount, 0);
  assert.ok(report.blockers.some((item) => item.id === "workflow.operation-flow-missing"));
});
```

- [ ] **Step 3: Add red test for missing workflow steps**

Add this test after the missing-flow test:

```js
test("truth readiness blocks formal review when observed workflow steps are missing", () => {
  const { buildTruthReadinessReport } = require("./check-truth-readiness");
  const operationSpec = operationSpecFixture({
    modules: [
      {
        name: "AI任务管理",
        entry: "左侧「AI任务管理」",
        list: { columns: ["保险公司"], queryFields: [], rowActions: [] },
        flows: [
          {
            name: "新建AI任务",
            trigger: "新增",
            steps: [],
            sourcePage: "AI任务管理",
          },
        ],
        tabs: [],
        screenshots: [],
        apis: [],
      },
    ],
    metrics: { flowCount: 1 },
  });
  const workflowSpec = workflowSpecFixtureFromOperation(operationSpec, {
    workflows: [],
    metrics: {
      workflowCount: 0,
      observedWorkflowCount: 0,
      candidateWorkflowCount: 0,
      stepCount: 0,
      pendingCount: 0,
    },
  });
  const artifacts = {
    quality: { file: "quality-report.json", status: "ok", value: qualityReportFixture() },
    claims: {
      file: "verified-claims.json",
      status: "ok",
      value: verifiedClaimsFixture([
        {
          id: "function:AI任务管理:新建AI任务",
          subject: "新建AI任务",
          module: "AI任务管理",
          status: "confirmed",
          writable: true,
        },
      ]),
    },
    factCheck: { file: "fact-check-report.json", status: "ok", value: factCheckReportFixture() },
    narrative: { file: "narrative-quality-report.json", status: "ok", value: narrativeQualityReportFixture() },
    operationSpec: { file: "operation-spec.json", status: "ok", value: operationSpec },
    workflowSpec: { file: "workflow-spec.json", status: "ok", value: workflowSpec },
  };

  const report = buildTruthReadinessReport({ artifacts, threshold: 95 });

  assert.equal(report.canSubmitReview, false);
  assert.equal(report.gates.workflow.pass, false);
  assert.equal(report.gates.workflow.metrics.observedWorkflowStepCount, 0);
  assert.ok(report.blockers.some((item) => item.id === "workflow.steps-missing"));
});
```

- [ ] **Step 4: Add red test for passing workflow evidence**

Add this test after the missing-step test:

```js
test("truth readiness accepts current observed workflow evidence", () => {
  const { buildTruthReadinessReport } = require("./check-truth-readiness");
  const operationSpec = operationSpecFixture({
    modules: [
      {
        name: "AI任务管理",
        entry: "左侧「AI任务管理」",
        list: { columns: ["保险公司"], queryFields: [], rowActions: [] },
        flows: [
          {
            name: "新建AI任务",
            trigger: "新增",
            sourcePage: "AI任务管理",
            executionStatus: "partial",
            steps: [
              { name: "打开新建表单", action: "点击新增", fields: ["保险公司"] },
              { name: "填写任务信息", action: "填写表单", fields: ["保险公司"] },
            ],
            blockers: [{ reason: "submit-button-not-found" }],
          },
        ],
        tabs: [],
        screenshots: [],
        apis: [],
      },
    ],
    metrics: { flowCount: 1 },
  });
  const workflowSpec = workflowSpecFixtureFromOperation(operationSpec);
  const artifacts = {
    quality: { file: "quality-report.json", status: "ok", value: qualityReportFixture() },
    claims: {
      file: "verified-claims.json",
      status: "ok",
      value: verifiedClaimsFixture([
        {
          id: "function:AI任务管理:新建AI任务",
          subject: "新建AI任务",
          module: "AI任务管理",
          status: "confirmed",
          writable: true,
        },
      ]),
    },
    factCheck: { file: "fact-check-report.json", status: "ok", value: factCheckReportFixture() },
    narrative: { file: "narrative-quality-report.json", status: "ok", value: narrativeQualityReportFixture() },
    operationSpec: { file: "operation-spec.json", status: "ok", value: operationSpec },
    workflowSpec: { file: "workflow-spec.json", status: "ok", value: workflowSpec },
  };

  const report = buildTruthReadinessReport({ artifacts, threshold: 95 });

  assert.equal(report.gates.workflow.pass, true);
  assert.equal(report.gates.workflow.metrics.operationFlowCount, 1);
  assert.equal(report.gates.workflow.metrics.observedWorkflowStepCount, 2);
  assert.equal(report.canSubmitReview, true);
});
```

- [ ] **Step 5: Run targeted tests and confirm they fail**

Run:

```powershell
node --test --test-name-pattern "truth readiness .*workflow|operation flows are missing|observed workflow steps are missing" scripts/system-whitepaper.test.js
```

Expected: fails because `report.gates.workflow` is missing or no workflow blockers are emitted.

## Task 2: Implement Workflow Gate In Truth Readiness

**Files:**
- Modify: `scripts/check-truth-readiness.js`
- Modify: `scripts/system-whitepaper.test.js`

- [ ] **Step 1: Import workflow spec validator**

Add near existing `operation-spec/lib` import:

```js
const { assertValidWorkflowSpecArtifact } = require("./build-workflow-spec");
```

- [ ] **Step 2: Add workflow spec to optional artifacts**

Add to `OPTIONAL_ARTIFACTS`:

```js
workflowSpec: "workflow-spec.json",
```

- [ ] **Step 3: Add workflow lineage validation**

In `buildLineageGate`, add this check after the operation-guide gate lineage check:

```js
["operationSpec", artifacts.workflowSpec, artifacts.operationSpec, "workflow-spec.json"],
```

- [ ] **Step 4: Add workflow gate builder**

Add this function before `buildClaimsGate`:

```js
function observedWorkflowStepCount(workflowSpec = {}) {
  return Array.isArray(workflowSpec.workflows)
    ? workflowSpec.workflows
        .filter((workflow) => workflow && workflow.evidenceStatus === "observed")
        .reduce((sum, workflow) => sum + (Array.isArray(workflow.steps) ? workflow.steps.length : 0), 0)
    : 0;
}

function buildWorkflowGate(artifacts = {}) {
  const operationSpec = artifacts.operationSpec || {};
  const workflowSpec = artifacts.workflowSpec || {};
  const failures = [];
  const contractFailures = [];
  const operationMetrics = operationSpec.value?.metrics || {};
  const workflowMetrics = workflowSpec.value?.metrics || {};
  const operationFlowCount = Number(operationMetrics.flowCount || 0);
  const observedWorkflowCount = Number(workflowMetrics.observedWorkflowCount || 0);
  const candidateWorkflowCount = Number(workflowMetrics.candidateWorkflowCount || 0);
  const stepCount = Number(workflowMetrics.stepCount || 0);
  const computedObservedStepCount =
    workflowSpec.status === "ok" ? observedWorkflowStepCount(workflowSpec.value || {}) : 0;

  if (operationSpec.status !== "ok") {
    failures.push(`${operationSpec.file || "operation-spec.json"} is ${operationSpec.status || "missing"}.`);
  } else {
    try {
      assertValidOperationSpecArtifact(operationSpec.value);
    } catch (error) {
      contractFailures.push(error.message);
    }
  }

  if (workflowSpec.status === "missing" || !workflowSpec.fingerprint?.exists) {
    failures.push("workflow-spec.json is missing.");
  } else if (workflowSpec.status !== "ok") {
    failures.push(`${workflowSpec.file || "workflow-spec.json"} is ${workflowSpec.status}.`);
  } else {
    try {
      assertValidWorkflowSpecArtifact(workflowSpec.value, operationSpec.value || null);
    } catch (error) {
      contractFailures.push(error.message);
    }
    const stale = lineageMismatch("operationSpec", workflowSpec, operationSpec, "workflow-spec.json");
    if (stale) failures.push(stale);
  }

  if (operationFlowCount <= 0) {
    failures.push("operation-spec.json has no observed operation flows.");
  }
  if (observedWorkflowCount <= 0 || computedObservedStepCount <= 0) {
    failures.push("workflow-spec.json has no observed workflow steps.");
  }

  const artifactContractValid = contractFailures.length === 0;
  const pass = artifactContractValid && failures.length === 0;
  return {
    id: "workflow",
    label: "Observed workflow evidence",
    pass,
    artifactStatus: workflowSpec.status || "missing",
    artifactContractValid,
    contractFailures,
    score: pass ? 1 : 0,
    scorePercent: pass ? 100 : 0,
    metrics: {
      operationFlowCount,
      workflowCount: Number(workflowMetrics.workflowCount || 0),
      observedWorkflowCount,
      candidateWorkflowCount,
      observedWorkflowStepCount: computedObservedStepCount,
      stepCount,
      missingWorkflowSpec: workflowSpec.status === "missing" || !workflowSpec.fingerprint?.exists,
      sourceFresh:
        workflowSpec.status === "ok" &&
        !lineageMismatch("operationSpec", workflowSpec, operationSpec, "workflow-spec.json"),
    },
    failures: [...contractFailures, ...failures],
  };
}
```

- [ ] **Step 5: Add workflow gate to report gates**

In `buildTruthReadinessReport`, add:

```js
workflow: buildWorkflowGate(artifacts),
```

Place it after `evidence`.

- [ ] **Step 6: Add workflow blockers**

Add this function before `buildImprovementActions`:

```js
function collectWorkflowBlockers(gates) {
  const gate = gates.workflow || {};
  if (gate.pass) return [];
  const failures = gate.failures || [];
  const rerunNodes = ["build-spec", "workflow-spec", "business-process", "narrative", "fact-check", "quality", "truth-readiness"];
  if (gate.metrics?.operationFlowCount <= 0) {
    return [
      blocker(
        "workflow.operation-flow-missing",
        "P0",
        "No observed operation flows are available; formal whitepaper review cannot proceed from page inventory alone.",
        ["collect", "inspect", ...rerunNodes],
        { failures },
      ),
    ];
  }
  if (gate.metrics?.missingWorkflowSpec) {
    return [
      blocker(
        "workflow.spec-missing",
        "P0",
        "workflow-spec.json is missing; generate workflow evidence before formal review.",
        ["workflow-spec", ...rerunNodes.slice(2)],
        { failures },
      ),
    ];
  }
  if (gate.artifactContractValid === false) {
    return [
      blocker(
        "workflow.spec-invalid",
        "P0",
        "workflow-spec.json is not a valid workflow artifact.",
        ["workflow-spec", ...rerunNodes.slice(2)],
        { failures },
      ),
    ];
  }
  if (failures.some((failure) => /fingerprint is stale|source operationSpec/.test(String(failure)))) {
    return [
      blocker(
        "workflow.lineage-stale",
        "P0",
        "workflow-spec.json is stale against the current operation-spec.json.",
        rerunNodes,
        { failures },
      ),
    ];
  }
  return [
    blocker(
      "workflow.steps-missing",
      "P0",
      "No observed workflow steps are available; formal whitepaper review cannot proceed from candidate or empty workflows.",
      ["collect", "inspect", ...rerunNodes],
      { failures },
    ),
  ];
}
```

Then include it in `buildTruthReadinessReport` blockers:

```js
...collectWorkflowBlockers(gates),
```

Place it before database blockers.

- [ ] **Step 7: Add workflow improvement action**

In `buildImprovementActions`, add:

```js
if (gates.workflow && !gates.workflow.pass) {
  actions.push(
    action(
      "workflow.refresh",
      "Refresh operation and workflow evidence before formal narrative or review.",
      ["build-spec", "workflow-spec", "business-process", "narrative", "fact-check", "quality", "truth-readiness"],
    ),
  );
}
```

- [ ] **Step 8: Update report artifact fixture contract expectation**

In `truthReadinessReportFixture`, add workflow gate to `baseGates`:

```js
workflow: { pass: true, scorePercent: 100, metrics: { operationFlowCount: 1, observedWorkflowStepCount: 1 } },
```

- [ ] **Step 9: Run targeted tests and confirm pass**

Run:

```powershell
node --test --test-name-pattern "truth readiness .*workflow|operation flows are missing|observed workflow steps are missing|truth readiness report artifact contract" scripts/system-whitepaper.test.js
```

Expected: matching tests pass.

## Task 3: Add Pipeline Workflow Node Red Tests

**Files:**
- Modify: `scripts/system-whitepaper.test.js`

- [ ] **Step 1: Update selected node list test expected arrays**

In `pipeline default node list uses operation guide path before whitepaper`, update default expected nodes to include `workflow-spec` after `build-spec`:

```js
[
  "sync",
  "session",
  "collect",
  "inspect",
  "validate-write",
  "build-spec",
  "workflow-spec",
  "compose-guide",
  "quality",
]
```

Update `with-whitepaper` expected nodes to include `workflow-spec` after `build-spec`:

```js
[
  "sync",
  "session",
  "collect",
  "inspect",
  "validate-write",
  "summary",
  "build-spec",
  "workflow-spec",
  "compose-guide",
  "db-profile",
  "db-model",
  "truth-universe",
  "truth-claims",
  "business-process",
  "draft",
  "narrative",
  "fact-check",
  "quality",
  "truth-readiness",
]
```

- [ ] **Step 2: Add pipeline state node test**

Add this test near other `pipeline-state` tests:

```js
test("pipeline state includes workflow-spec node and artifact label", () => {
  const { NODES, createPipelineState } = require("./pipeline-state");
  const workflowNode = NODES.find((node) => node.id === "workflow-spec");
  assert.deepEqual(workflowNode, { id: "workflow-spec", phase: "compose", label: "流程规格" });
  const state = createPipelineState({ code: "adp", name: "AI保单数据闭环平台" });
  assert.equal(state.nodes["workflow-spec"].phase, "compose");
  assert.equal(state.artifacts.workflowSpec, "workflow-spec.json");
});
```

- [ ] **Step 3: Add runPipelineNode workflow-spec test**

Add this test near existing `runPipelineNode("build-spec"...` tests:

```js
test("pipeline workflow-spec node writes workflow spec from operation spec", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { runPipelineNode } = require("./run-whitepaper-pipeline");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-workflow-spec-"));
  const systemOutput = path.join(tempRoot, "outputs", "adp");
  fs.mkdirSync(systemOutput, { recursive: true });
  fs.writeFileSync(
    path.join(systemOutput, "operation-spec.json"),
    JSON.stringify(operationSpecFixture({
      modules: [
        {
          name: "AI任务管理",
          entry: "左侧「AI任务管理」",
          list: { columns: ["保险公司"], queryFields: [], rowActions: [] },
          flows: [
            {
              name: "新建AI任务",
              trigger: "新增",
              sourcePage: "AI任务管理",
              executionStatus: "partial",
              steps: [{ name: "打开新建表单", action: "点击新增", fields: ["保险公司"] }],
              blockers: [{ reason: "submit-button-not-found" }],
            },
          ],
          tabs: [],
          screenshots: [],
          apis: [],
        },
      ],
      metrics: { flowCount: 1 },
    })),
    "utf8",
  );
  const context = {
    args: {},
    config: {},
    configPath: path.join(tempRoot, "systems.local.yaml"),
    system: { code: "adp", name: "AI保单数据闭环平台" },
    systemOutput,
    projectRoot: path.resolve(__dirname, ".."),
  };

  await runPipelineNode("workflow-spec", context);

  const workflowSpec = JSON.parse(fs.readFileSync(path.join(systemOutput, "workflow-spec.json"), "utf8"));
  assert.equal(workflowSpec.artifactType, "workflow-spec");
  assert.equal(workflowSpec.metrics.observedWorkflowCount, 1);
  assert.equal(workflowSpec.metrics.stepCount, 1);
});
```

- [ ] **Step 4: Run targeted pipeline tests and confirm fail**

Run:

```powershell
node --test --test-name-pattern "pipeline default node list|pipeline state includes workflow-spec|pipeline workflow-spec node" scripts/system-whitepaper.test.js
```

Expected: fails because the pipeline does not yet have `workflow-spec`.

## Task 4: Implement Pipeline Workflow Node

**Files:**
- Modify: `scripts/run-whitepaper-pipeline.js`
- Modify: `scripts/pipeline-state.js`

- [ ] **Step 1: Add selectedNodes entry**

In `selectedNodes(args)`, add `"workflow-spec"` after `"build-spec"` in both default and `--with-whitepaper` arrays.

- [ ] **Step 2: Add runPipelineNode branch**

In `runPipelineNode`, add after `build-spec`:

```js
if (nodeId === "workflow-spec") {
  return runNodeScript(
    [
      "scripts/build-workflow-spec.js",
      "--input",
      systemOutput,
    ],
    { cwd: projectRoot },
  );
}
```

- [ ] **Step 3: Add pipeline state node**

In `scripts/pipeline-state.js`, add a node after `build-spec`:

```js
{ id: "workflow-spec", phase: "compose", label: "流程规格" },
```

- [ ] **Step 4: Add pipeline artifact label**

In `createPipelineState().artifacts`, add:

```js
workflowSpec: "workflow-spec.json",
```

- [ ] **Step 5: Run targeted pipeline tests and confirm pass**

Run:

```powershell
node --test --test-name-pattern "pipeline default node list|pipeline state includes workflow-spec|pipeline workflow-spec node" scripts/system-whitepaper.test.js
```

Expected: matching tests pass.

## Task 5: Add Workflow Spec Lineage Integration Tests

**Files:**
- Modify: `scripts/system-whitepaper.test.js`

- [ ] **Step 1: Add stale workflow spec readiness test**

Add near existing `truth readiness rejects forged operation spec against current evidence` tests:

```js
test("truth readiness rejects stale workflow spec against current operation spec", () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { buildWorkflowSpecFromDir } = require("./build-workflow-spec");
  const { runTruthReadinessCheck } = require("./check-truth-readiness");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "truth-stale-workflow-spec-"));
  fs.writeFileSync(path.join(dir, "evidence.json"), JSON.stringify(evidenceFixture()), "utf8");
  fs.writeFileSync(path.join(dir, "evidence-summary.json"), JSON.stringify(buildEvidenceSummary(evidenceFixture())), "utf8");
  writeOperationSpecFixture(dir);
  buildWorkflowSpecFromDir(dir, { generatedAt: "2026-06-03T00:00:30.000Z" });
  const currentSpec = JSON.parse(fs.readFileSync(path.join(dir, "operation-spec.json"), "utf8"));
  currentSpec.modules[0].flows.push({
    name: "变更后的流程",
    trigger: "新增",
    sourcePage: "AI任务管理",
    executionStatus: "partial",
    steps: [{ name: "打开表单", action: "点击新增", fields: ["保险公司"] }],
    blockers: [{ reason: "submit-button-not-found" }],
  });
  currentSpec.metrics.flowCount = 1;
  fs.writeFileSync(path.join(dir, "operation-spec.json"), JSON.stringify(currentSpec), "utf8");
  writeQualityReportFixture(dir);
  fs.writeFileSync(
    path.join(dir, "verified-claims.json"),
    JSON.stringify(verifiedClaimsFixture([
      {
        id: "function:AI任务管理:新建AI任务",
        subject: "新建AI任务",
        module: "AI任务管理",
        status: "confirmed",
        writable: true,
      },
    ])),
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "whitepaper.pending-review.md"), passingUiOnlyNarrativeMarkdown(), "utf8");
  runFactCheck({ inputDir: dir });
  runNarrativeCheck({ inputDir: dir });

  const report = runTruthReadinessCheck({ inputDir: dir });

  assert.equal(report.canSubmitReview, false);
  assert.equal(report.gates.workflow.pass, false);
  assert.ok(report.blockers.some((item) => item.id === "workflow.lineage-stale"));
});
```

- [ ] **Step 2: Run stale workflow test**

Run:

```powershell
node --test --test-name-pattern "stale workflow spec" scripts/system-whitepaper.test.js
```

Expected: pass after Task 2 implementation; if it fails because the blocker order emits `workflow.operation-flow-missing`, inspect fixture operation metrics and adjust the fixture so operation flow count is positive before workflow spec staleness is asserted.

## Task 6: Run Gates And Write V1-A Checkpoint

**Files:**
- Create: `docs/checkpoints/2026-06-09-v1-flow-gate-checkpoint.md`

- [ ] **Step 1: Run targeted V1 test set**

Run:

```powershell
node --test --test-name-pattern "workflow|pipeline default node list|truth readiness .*workflow|operation flows are missing|observed workflow steps are missing|stale workflow spec" scripts/system-whitepaper.test.js
```

Expected: matching tests pass.

- [ ] **Step 2: Run auto gate dry run**

Run:

```powershell
npm run test:gate:auto -- --dry-run
```

Expected: selects `core` or `full` depending on changed files. If sandbox returns `spawnSync git EPERM`, rerun outside sandbox with the same command and record both results.

- [ ] **Step 3: Run selected quality gate**

If auto selects core:

```powershell
npm run test:gate:core
```

If auto selects full:

```powershell
npm run test:gate:full
```

Expected: selected gate passes. If sandbox blocks child-process spawning, rerun outside sandbox and record the diagnostic.

- [ ] **Step 4: Create V1-A checkpoint**

Create `docs/checkpoints/2026-06-09-v1-flow-gate-checkpoint.md`:

```markdown
# V1-A Flow Evidence Hard Gate Checkpoint

## Version Target

V1-A makes workflow evidence a production pipeline/readiness artifact and blocks formal review when observed operation flows or observed workflow steps are missing.

## Branch And Commit

- Coordinator worktree: `D:/核心系统白皮书/skill/system-whitepaper`
- Coordinator branch: `codex/business-process-model`
- Commit: not committed in this checkpoint.

## Completed Work

- Added `workflow-spec` pipeline node after `build-spec`.
- Added `workflow-spec.json` to pipeline state artifacts.
- Added workflow spec loading, validation, lineage, readiness gate, blockers, and improvement action.
- Added targeted tests for missing flows, missing steps, valid workflow evidence, pipeline node order, state registration, node execution, and stale workflow spec.

## Worker Handoffs

No worker agents were used. V1-A was executed inline as a single-agent implementation because another project was already using multi-agent resources.

## Verification

- Targeted tests: replace this line with the exact command, exit result, and pass/fail summary from Step 1.
- Auto gate dry-run: replace this line with the exact command, exit result, selected gate, and any sandbox rerun note from Step 2.
- Selected quality gate: replace this line with the exact command, exit result, and pass/fail summary from Step 3.

## Residual Risk

- V1-A does not improve Playwright collection quality. It prevents false readiness when flow evidence is absent.
- ADP fresh reset validation is still pending separate user authorization and valid local SIT prerequisites.

## Environment And Data Safety

Implementation did not touch real systems, browser sessions, DB metadata, secrets, cookies, business runtime outputs, or customer artifacts. Verification may use local ignored test/cache paths such as `.tmp` and `.npm-cache`.

## Next Step

Start V1-B collector surface integration or request ADP/SIT authorization for V1-D validation after collector changes are ready.
```

- [ ] **Step 5: Final safety scans**

Run:

```powershell
rg -n "TBD|TODO|FIXME|selected gate command|Record targeted|Record auto gate|Record selected" docs/checkpoints/2026-06-09-v1-flow-gate-checkpoint.md
rg -n "password|passwd|pwd|secret|token|cookie|JSESSIONID|HUNTIANSID|jdbc|dsn|数据库密码|客户" docs/checkpoints/2026-06-09-v1-flow-gate-checkpoint.md
git -c safe.directory='D:/核心系统白皮书/skill/system-whitepaper' status --short
```

Expected: first command has no matches after filling verification results. Second command only matches generic safety-policy wording, not secret values. Git status should show only expected source/docs changes and existing untracked governance files.

## Self-Review

- Spec coverage: covers workflow pipeline node, readiness input/gate, lineage, blockers, tests, and checkpoint.
- Scope control: excludes collector, Playwright, ADP real-run, DB connector, prompt, narrative copy, and package changes.
- Type consistency: uses existing `workflow-spec.json` schema and computes `observedWorkflowStepCount` only inside readiness.
- Verification: requires red tests before implementation, targeted tests, auto gate dry-run, selected quality gate, and final checkpoint scans.
