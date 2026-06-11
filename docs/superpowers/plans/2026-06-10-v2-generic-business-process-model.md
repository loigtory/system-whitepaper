# V2 Generic Business Process Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Current coordinator recommendation: execute inline with one agent while the parallel project is using multi-agent capacity; keep the 4-agent split below available for a later isolated run.

**Goal:** Replace ADP-shaped default business-process inference with a generic, deterministic, evidence-backed model and block formal readiness when the model is stale, forged, unsupported, or domain-polluted.

**Architecture:** Keep `scripts/build-business-process-model.js` as the CLI/orchestrator, add focused generic inference helpers under `scripts/business-process/`, add a v2 artifact contract and deterministic content hash, and wire a `businessProcess` gate into `scripts/check-truth-readiness.js`. Domain profiles are explicit JSON inputs only; ADP remains pilot/eval data, not default generation logic.

**Tech Stack:** Node.js CommonJS, `node:test`, existing pipeline artifacts (`operation-spec.json`, `workflow-spec.json`, `evidence-summary.json`, `verified-claims.json`), existing readiness and narrative gates.

---

## File Structure

- Create `scripts/business-process/generic-rules.js`: domain-neutral classifiers, support collection helpers, process role inference, generic sequence builder, domain-leak guard.
- Create `scripts/business-process/domain-profile.js`: profile loader/validator and explicit profile application.
- Modify `scripts/build-business-process-model.js`: orchestrate v2 model building, load optional workflow spec and domain profile, export validator/hash helpers, remove ADP-specific default rules.
- Modify `scripts/check-truth-readiness.js`: load/validate business-process model, add `businessProcess` gate, source freshness checks, deterministic recomputation, blockers, improvement actions, and report contract.
- Modify `scripts/narrative/phase3b.js`: preserve v2 derivation/profile/status/boundary metadata in compact prompt input.
- Modify `scripts/check-narrative.js`: require business-process coverage to respect process/step status and boundary wording when the v2 model is present.
- Modify `scripts/system-whitepaper.test.js`: add V2 red/green tests for generic fixtures, profile opt-in, forged/stale model blockers, and compact prompt metadata.
- Modify `package.json`: include `scripts/business-process/` in package files because the builder will require these helpers.
- Create `docs/checkpoints/2026-06-10-v2-business-process-model-checkpoint.md` after implementation and verification.

No generated `outputs/`, secrets, cookies, auth state, real customer artifacts, or ADP final whitepapers are source deliverables.

## 4-Agent Split

When using parallel agents later, use isolated worktrees and this ownership split:

| Agent | Role | Write Scope | Handoff | Verification |
| --- | --- | --- | --- | --- |
| A | Contract/readiness | `scripts/check-truth-readiness.js`, readiness tests only | Gate design, blocker ids, tests | targeted truth readiness tests |
| B | Generic extractor | `scripts/build-business-process-model.js`, `scripts/business-process/generic-rules.js` | Generic model output and fixtures | generic extractor tests |
| C | Domain profile/prompt | `scripts/business-process/domain-profile.js`, `scripts/narrative/phase3b.js`, compact prompt tests | Explicit profile behavior and prompt metadata | profile and phase3b tests |
| D | Negative/regression fixtures | `scripts/system-whitepaper.test.js`, checkpoint draft | Forged/stale/domain-leak coverage | negative targeted tests |

Coordinator-owned files:

- `package.json`
- `scripts/system-whitepaper.test.js` final merge sections
- `.agents/4-agent-plan.json`
- V2 spec, plan, checkpoint, and final gate execution

Inline single-agent execution order: Task 1 -> Task 2 -> Task 3 -> Task 4 -> Task 5 -> Task 6. This avoids write conflicts while another project uses multi-agent capacity.

## Task 1: Add V2 Generic Red Tests

**Files:**
- Modify `scripts/system-whitepaper.test.js`

- [ ] **Step 1: Add generic fixture helpers near the existing `operationSpecFixture` and truth fixture helpers.**

Add helpers that create source artifacts without secrets:

```js
function genericOperationSpecFixture(overrides = {}) {
  return operationSpecFixture({
    systemCode: "generic-finance",
    systemName: "费用与预算管理系统",
    modules: [
      {
        name: "费用申请",
        entry: "菜单 / 费用申请",
        businessHint: "维护员工费用申请记录，支持提交、审核和状态跟踪。",
        list: {
          columns: ["申请编号", "申请人", "费用类型", "金额", "审批状态", "处理结果"],
          queryFields: ["申请人", "费用类型", "审批状态"],
          rowActions: ["查看", "编辑", "提交", "撤回"],
        },
        flows: [
          {
            name: "费用申请提交",
            executionStatus: "partial",
            sourcePage: "费用申请",
            steps: [
              { name: "填写费用申请", action: "录入金额和费用类型", fields: ["金额", "费用类型"] },
              { name: "提交审批", action: "点击提交", fields: ["审批状态"] },
            ],
          },
        ],
        plannedFlows: [],
        screenshots: [],
        apis: [],
      },
      {
        name: "预算控制",
        entry: "菜单 / 预算控制",
        businessHint: "查看预算额度、占用金额和超预算风险。",
        list: {
          columns: ["预算科目", "年度预算", "已占用金额", "可用金额", "风险状态"],
          queryFields: ["预算科目", "风险状态"],
          rowActions: ["查看", "冻结", "调整"],
        },
        flows: [],
        plannedFlows: [],
        screenshots: [],
        apis: [],
      },
    ],
    metrics: { flowCount: 1, moduleCount: 2 },
    ...overrides,
  });
}

function genericEvidenceSummaryFixture(overrides = {}) {
  return {
    artifactType: "evidence-summary",
    version: 1,
    generatedAt: "2026-06-10T00:00:00.000Z",
    system: { code: "generic-finance", name: "费用与预算管理系统" },
    modules: [
      { name: "费用申请", entry: "菜单 / 费用申请", summary: "维护费用申请和审批状态。" },
      { name: "预算控制", entry: "菜单 / 预算控制", summary: "查看预算额度和风险状态。" },
    ],
    functions: [
      {
        id: "function:费用申请",
        module: "费用申请",
        name: "费用申请列表",
        menuPath: "菜单 / 费用申请",
        actions: ["查看", "编辑", "提交", "撤回"],
        queryFields: ["申请人", "费用类型", "审批状态"],
        tableColumns: ["申请编号", "申请人", "费用类型", "金额", "审批状态", "处理结果"],
      },
    ],
    metrics: { moduleCount: 2, functionCount: 1 },
    ...overrides,
  };
}
```

- [ ] **Step 2: Add a red test proving the default model is domain-neutral.**

```js
test("business process model default inference is generic for non-ADP systems", () => {
  const { buildBusinessProcessModel } = require("./build-business-process-model");
  const model = buildBusinessProcessModel({
    operationSpec: genericOperationSpecFixture(),
    evidenceSummary: genericEvidenceSummaryFixture(),
    verifiedClaims: verifiedClaimsFixture([
      {
        id: "function:费用申请:列表",
        module: "费用申请",
        subject: "费用申请列表",
        status: "confirmed",
        writable: true,
        confidence: "high",
      },
    ]),
    generatedAt: "2026-06-10T00:00:00.000Z",
  });

  const text = JSON.stringify(model);
  assert.equal(model.version, 2);
  assert.doesNotMatch(text, /保司|AI任务|元数据|发布上线|运行观测/);
  assert.ok(model.businessObjects.length >= 1);
  assert.ok(model.moduleResponsibilities.length >= 2);
  assert.ok(model.processes.every((process) => ["observed", "partially-observed", "inferred", "candidate", "pending"].includes(process.status)));
});
```

- [ ] **Step 3: Add a red test proving observed status needs observed workflow evidence.**

```js
test("business process model keeps inferred cross-module sequence distinct from observed workflow steps", () => {
  const { buildWorkflowSpec } = require("./build-workflow-spec");
  const { buildBusinessProcessModel } = require("./build-business-process-model");
  const operationSpec = genericOperationSpecFixture();
  const workflowSpec = buildWorkflowSpec({
    operationSpec,
    generatedAt: "2026-06-10T00:00:01.000Z",
    sourceArtifacts: {},
  });
  const model = buildBusinessProcessModel({
    operationSpec,
    workflowSpec,
    evidenceSummary: genericEvidenceSummaryFixture(),
    verifiedClaims: verifiedClaimsFixture([]),
    generatedAt: "2026-06-10T00:00:02.000Z",
  });

  const observedSteps = model.processes.flatMap((process) => process.steps || []).filter((step) => step.status === "observed");
  const inferredProcesses = model.processes.filter((process) => process.status === "inferred" || process.status === "partially-observed");
  assert.ok(observedSteps.length >= 1);
  assert.ok(inferredProcesses.every((process) => process.boundary));
});
```

- [ ] **Step 4: Add a red test proving an explicit profile is opt-in only.**

```js
test("business process domain profile applies only when explicitly supplied", () => {
  const { buildBusinessProcessModel } = require("./build-business-process-model");
  const operationSpec = genericOperationSpecFixture();
  const baseModel = buildBusinessProcessModel({
    operationSpec,
    evidenceSummary: genericEvidenceSummaryFixture(),
    verifiedClaims: verifiedClaimsFixture([]),
    generatedAt: "2026-06-10T00:00:00.000Z",
  });
  const profiledModel = buildBusinessProcessModel({
    operationSpec,
    evidenceSummary: genericEvidenceSummaryFixture(),
    verifiedClaims: verifiedClaimsFixture([]),
    domainProfile: {
      artifactType: "business-process-domain-profile",
      version: 1,
      profileId: "finance-expense",
      labels: {
        "work-item": "费用申请单",
        "validate-or-check": "预算校验",
      },
    },
    generatedAt: "2026-06-10T00:00:00.000Z",
  });

  assert.doesNotMatch(JSON.stringify(baseModel), /费用申请单|预算校验/);
  assert.match(JSON.stringify(profiledModel), /费用申请单|预算校验/);
  assert.equal(profiledModel.derivation.profileId, "finance-expense");
});
```

- [ ] **Step 5: Add red readiness tests for forged and source-less models.**

```js
test("truth readiness blocks forged current business process model", () => {
  const {
    buildTruthReadinessReport,
    buildReadinessSourceArtifacts,
  } = require("./check-truth-readiness");
  const { buildBusinessProcessModel } = require("./build-business-process-model");
  const operationSpec = genericOperationSpecFixture();
  const evidenceSummary = genericEvidenceSummaryFixture();
  const verifiedClaims = verifiedClaimsFixture([]);
  const currentModel = buildBusinessProcessModel({
    operationSpec,
    evidenceSummary,
    verifiedClaims,
    generatedAt: "2026-06-10T00:00:00.000Z",
  });
  const forgedModel = {
    ...currentModel,
    processes: [
      {
        ...currentModel.processes[0],
        name: "手工伪造的已验证自动闭环",
        status: "observed",
      },
    ],
  };
  const artifacts = {
    quality: { file: "quality-report.json", status: "ok", value: qualityReportFixture() },
    claims: { file: "verified-claims.json", status: "ok", value: verifiedClaims },
    factCheck: { file: "fact-check-report.json", status: "ok", value: factCheckReportFixture() },
    narrative: { file: "narrative-quality-report.json", status: "ok", value: narrativeQualityReportFixture() },
    operationSpec: { file: "operation-spec.json", status: "ok", value: operationSpec },
    evidenceSummary: { file: "evidence-summary.json", status: "ok", value: evidenceSummary },
    businessProcessModel: { file: "business-process-model.json", status: "ok", value: forgedModel },
  };
  forgedModel.sourceArtifacts = buildReadinessSourceArtifacts(artifacts);

  const report = buildTruthReadinessReport({ artifacts, threshold: 95 });

  assert.equal(report.canSubmitReview, false);
  assert.equal(report.gates.businessProcess.pass, false);
  assert.ok(report.blockers.some((item) => item.id === "business-process.forged-model"));
});
```

Expected result before implementation: tests fail because version 2, profile opt-in, businessProcess gate, and forged-model recomputation do not exist yet.

- [ ] **Step 6: Run the red test subset.**

Run:

```powershell
node --test --test-name-pattern "business process model default inference|business process model keeps inferred|business process domain profile|truth readiness blocks forged current business process model" scripts/system-whitepaper.test.js
```

Expected: FAIL for the new V2 reasons, not syntax errors.

## Task 2: Add Generic Rule And Profile Helpers

**Files:**
- Create `scripts/business-process/generic-rules.js`
- Create `scripts/business-process/domain-profile.js`
- Modify `package.json`

- [ ] **Step 1: Create `scripts/business-process/generic-rules.js`.**

Implement helpers with CommonJS exports:

```js
const DOMAIN_LEAK_PATTERNS = [/保司/, /AI任务/, /元数据/, /发布上线/, /运行观测/];
const STATUS_WORDS = ["状态", "阶段", "进度", "结果", "质量", "风险", "异常", "审批", "审核", "启用", "有效", "完成"];
const PROCESS_ROLES = [
  ["capture-input", /申请|录入|登记|新建|创建|导入|采集|提交/],
  ["maintain-config", /配置|维护|设置|规则|参数|字典|模板|权限/],
  ["review-or-approve", /审批|审核|复核|确认|通过|驳回/],
  ["validate-or-check", /校验|检查|核验|对账|质量|风险|异常|预算|额度/],
  ["execute-or-sync", /执行|同步|处理|生成|调度|跑批|分发|推送/],
  ["publish-or-enable", /发布|启用|上线|生效|停用/],
  ["monitor-or-report", /监控|看板|报表|统计|指标|日志|告警|审计/],
  ["correct-or-retry", /编辑|调整|撤回|重试|修正|补录|回滚/],
  ["archive-or-close", /归档|关闭|完成|结案|作废/],
];

function compactString(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function classifyProcessRole(text) {
  const value = compactString(text);
  const found = PROCESS_ROLES.find(([, pattern]) => pattern.test(value));
  return found ? found[0] : "unknown";
}

function hasDefaultDomainLeak(value, allowedEvidenceText = "") {
  const text = compactString(value);
  const allowed = compactString(allowedEvidenceText);
  return DOMAIN_LEAK_PATTERNS.some((pattern) => pattern.test(text) && !pattern.test(allowed));
}

module.exports = {
  DOMAIN_LEAK_PATTERNS,
  STATUS_WORDS,
  PROCESS_ROLES,
  classifyProcessRole,
  compactString,
  hasDefaultDomainLeak,
};
```

Extend this file during implementation with object classification and sequence helpers. Keep the helpers deterministic and dependency-free.

- [ ] **Step 2: Create `scripts/business-process/domain-profile.js`.**

Implement profile validation:

```js
function assertValidDomainProfile(profile = {}) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    throw new Error("domain profile must be a JSON object.");
  }
  if (profile.artifactType !== "business-process-domain-profile") {
    throw new Error("domain profile artifactType must be business-process-domain-profile.");
  }
  if (!profile.profileId || typeof profile.profileId !== "string") {
    throw new Error("domain profile profileId is required.");
  }
  const serialized = JSON.stringify(profile);
  if (/password|secret|token|cookie|jdbc:|mysql:\/\/|postgres:\/\/|http:\/\/|https:\/\//i.test(serialized)) {
    throw new Error("domain profile contains forbidden secret, credential, URL, or connection-like content.");
  }
  return true;
}

function applyDomainProfileLabel(profile, key, fallback) {
  const labels = profile && typeof profile.labels === "object" && !Array.isArray(profile.labels)
    ? profile.labels
    : {};
  return String(labels[key] || fallback || "");
}

module.exports = {
  assertValidDomainProfile,
  applyDomainProfileLabel,
};
```

- [ ] **Step 3: Update `package.json` files list.**

Add:

```json
"scripts/business-process/",
```

Expected: `npm run pack:check` later includes the helper directory.

## Task 3: Refactor Business Process Builder To V2

**Files:**
- Modify `scripts/build-business-process-model.js`

- [ ] **Step 1: Import generic/profile helpers.**

Add imports near the top:

```js
const {
  classifyProcessRole,
  compactString: compactRuleString,
  hasDefaultDomainLeak,
} = require("./business-process/generic-rules");
const {
  applyDomainProfileLabel,
  assertValidDomainProfile,
} = require("./business-process/domain-profile");
```

- [ ] **Step 2: Add deterministic hash helpers.**

Implement stable JSON sorting and model content hashing:

```js
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
  return crypto.createHash("sha256").update(stableJson(businessProcessContentForHash(artifact))).digest("hex");
}
```

- [ ] **Step 3: Load optional workflow spec and domain profile.**

Update `buildBusinessProcessModelFromDir` to read `workflow-spec.json` when present. Add CLI options:

```text
--workflow-spec outputs/system/workflow-spec.json
--domain-profile path/to/profile.json
```

Behavior:

- Missing workflow spec remains allowed for builder execution, but readiness may block formal review.
- A supplied domain profile must pass `assertValidDomainProfile`.
- `sourceArtifacts.workflowSpec` is recorded when the file exists.
- `sourceArtifacts.domainProfile` is recorded only when supplied.

- [ ] **Step 4: Replace ADP-specific object/state/process rules with generic rules.**

Remove default output strings and hardcoded patterns for:

```text
保司, AI任务, 元数据, 发布上线, 运行观测, 配置质量 as an ADP-specific chain
```

Build generic output:

- Object names from module/function evidence, for example `费用申请业务对象`, `预算控制业务对象`, or profile-enhanced names.
- Categories from generic classifiers.
- State groups from fields/filters matching state signal words.
- Process steps from observed workflow steps first, then inferred role groups.
- Boundaries on all inferred or partially observed process sequences.

- [ ] **Step 5: Add derivation metadata.**

After artifact assembly:

```js
artifact.version = 2;
artifact.derivation = {
  builder: "build-business-process-model",
  algorithmVersion: 2,
  profileId: domainProfile?.profileId || "",
  sourceHash: crypto.createHash("sha256").update(stableJson(artifact.sourceArtifacts || {})).digest("hex"),
  contentHash: hashBusinessProcessContent(artifact),
};
```

- [ ] **Step 6: Add and export `assertValidBusinessProcessModelArtifact`.**

Validation requirements:

```js
function assertValidBusinessProcessModelArtifact(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("business-process-model.json must be a JSON object.");
  if (value.artifactType !== "business-process-model") throw new Error("business-process-model.json artifactType must be business-process-model.");
  if (Number(value.version) !== 2) throw new Error("business-process-model.json version must be 2.");
  if (!value.derivation || typeof value.derivation !== "object") throw new Error("business-process-model.json derivation is required.");
  if (!value.derivation.contentHash) throw new Error("business-process-model.json derivation.contentHash is required.");
  for (const processItem of value.processes || []) {
    if (!processItem.id || !processItem.status) throw new Error("business-process-model.json process id and status are required.");
    for (const step of processItem.steps || []) {
      if (!step.id || !step.status || !Array.isArray(step.source) || !step.source.length || !Array.isArray(step.evidence) || !step.evidence.length) {
        throw new Error("business-process-model.json process steps must include id, status, source, and evidence.");
      }
      if (step.status !== "observed" && !step.boundary) {
        throw new Error("business-process-model.json inferred or candidate process steps must include boundary.");
      }
    }
  }
  const expectedHash = hashBusinessProcessContent(value);
  if (value.derivation.contentHash !== expectedHash) throw new Error("business-process-model.json derivation.contentHash is stale.");
  return true;
}
```

Export it with `buildBusinessProcessModel`, `buildBusinessProcessModelFromDir`, `buildSourceArtifacts`, and `fingerprintFile`.

- [ ] **Step 7: Run Task 1 extractor tests.**

Run:

```powershell
node --test --test-name-pattern "business process model default inference|business process model keeps inferred|business process domain profile" scripts/system-whitepaper.test.js
```

Expected: PASS after Task 3.

## Task 4: Add Business Process Readiness Gate

**Files:**
- Modify `scripts/check-truth-readiness.js`
- Modify `scripts/system-whitepaper.test.js`

- [ ] **Step 1: Import the builder validator and hash/recompute helpers.**

Add imports from `scripts/build-business-process-model.js`:

```js
const {
  assertValidBusinessProcessModelArtifact,
  buildBusinessProcessModel,
} = require("./build-business-process-model");
```

If direct import creates a circular dependency warning, use the existing V1 lazy-load pattern from batch terminal checks.

- [ ] **Step 2: Add `businessProcessModel` contract validation to artifact loading.**

When `business-process-model.json` is present:

- Parse it as JSON.
- Validate with `assertValidBusinessProcessModelArtifact`.
- Store contract failures in the artifact status.

- [ ] **Step 3: Add `buildBusinessProcessGate(artifacts)`.**

The gate should return:

```js
{
  id: "businessProcess",
  label: "Business process model",
  pass,
  score,
  scorePercent,
  artifactStatus,
  metrics: {
    modelPresent,
    processCount,
    processStepCount,
    businessObjectCount,
    staleSourceCount,
    forged,
    defaultDomainLeakCount
  },
  failures,
  staleSources,
  recomputedContentHash
}
```

Pass requires a valid current model with matching recomputed hash and no unsupported domain leak.

- [ ] **Step 4: Add blocker mapping.**

Map failures to:

- `business-process.spec-missing`
- `business-process.spec-invalid`
- `business-process.lineage-stale`
- `business-process.forged-model`
- `business-process.steps-missing-evidence`
- `business-process.default-domain-leak`

Use rerun nodes:

```js
["build-spec", "workflow-spec", "business-process", "narrative", "fact-check", "quality", "truth-readiness"]
```

- [ ] **Step 5: Update readiness report contract.**

Add `businessProcess` to required gates in `assertValidTruthReadinessReportArtifact`.

Do not weaken existing score thresholds. For V2, the business-process gate should be a hard blocker. V4 can decide whether to add it to weighted scoring.

- [ ] **Step 6: Run readiness red/green tests.**

Run:

```powershell
node --test --test-name-pattern "truth readiness blocks forged current business process model|truth readiness passes only|workflow|business process" scripts/system-whitepaper.test.js
```

Expected: PASS after Task 4.

## Task 5: Preserve V2 Metadata In Prompt And Narrative Quality

**Files:**
- Modify `scripts/narrative/phase3b.js`
- Modify `scripts/check-narrative.js`
- Modify `scripts/system-whitepaper.test.js`

- [ ] **Step 1: Update `compactBusinessProcessModel`.**

Ensure compact output keeps:

```js
{
  version: model.version,
  derivation: {
    builder: model.derivation?.builder || "",
    algorithmVersion: model.derivation?.algorithmVersion || 0,
    profileId: model.derivation?.profileId || "",
  },
  rules: {
    inferredSequenceMustBeLabeled: true,
    observedRequiresWorkflowEvidence: true,
  }
}
```

Keep `status`, `boundary`, `source`, and `evidence` on processes and steps after compaction.

- [ ] **Step 2: Add a compact prompt regression test.**

```js
test("phase3b compact business process model preserves v2 status and boundaries", () => {
  const { compactBusinessProcessModel } = require("./narrative/phase3b");
  const compact = compactBusinessProcessModel({
    artifactType: "business-process-model",
    version: 2,
    derivation: { builder: "build-business-process-model", algorithmVersion: 2, profileId: "" },
    processes: [
      {
        id: "process:expense",
        name: "费用申请处理链路",
        status: "inferred",
        boundary: "跨模块顺序为证据约束推理。",
        steps: [
          {
            id: "step:submit",
            name: "提交审批",
            status: "observed",
            source: [{ artifact: "workflow-spec", pointer: "/workflows/0/steps/1" }],
            evidence: [{ kind: "workflow-step", label: "费用申请", value: "提交审批" }],
          },
        ],
      },
    ],
  });
  assert.equal(compact.model.version, 2);
  assert.match(JSON.stringify(compact), /inferred|observed|跨模块顺序为证据约束推理/);
});
```

- [ ] **Step 3: Update narrative quality wording checks.**

When v2 model is present and a covered process is `inferred` or `partially-observed`, Chapter 4 must include a boundary phrase such as:

```text
推理, 依据, 边界, 未观察到, 待确认, partially observed, inferred
```

If the narrative presents an inferred process as fully observed without a boundary, fail narrative quality.

- [ ] **Step 4: Run phase3b/narrative tests.**

Run:

```powershell
node --test --test-name-pattern "phase3b compact business process model|narrative quality validates business process model|phase3b assembly" scripts/system-whitepaper.test.js
```

Expected: PASS.

## Task 6: Integration, Gates, And Checkpoint

**Files:**
- Modify `docs/checkpoints/2026-06-10-v2-business-process-model-checkpoint.md`

- [ ] **Step 1: Run the V2 targeted suite.**

Run:

```powershell
node --test --test-name-pattern "business process model|businessProcess|truth readiness blocks forged current business process model|phase3b compact business process model|narrative quality validates business process model" scripts/system-whitepaper.test.js
```

Expected: PASS.

- [ ] **Step 2: Run auto gate dry-run.**

Run:

```powershell
npm run test:gate:auto -- --dry-run
```

Expected: exits 0 and selects at least `core`; source/readiness changes may select `full`.

- [ ] **Step 3: Run the required gate selected by auto gate.**

If auto selects core:

```powershell
npm run test:gate:core
```

If auto selects full:

```powershell
npm run test:gate:full
```

Expected: exits 0. If private config, auth state, or real artifacts block full gate, record the exact failing command, missing prerequisite, and residual risk.

- [ ] **Step 4: Run package check if helper files were added.**

Run:

```powershell
npm run pack:check
```

Expected: exits 0 and includes `scripts/business-process/`.

- [ ] **Step 5: Write checkpoint.**

Create `docs/checkpoints/2026-06-10-v2-business-process-model-checkpoint.md` with:

- version target,
- branch/commit status,
- whether single-agent or 4-agent execution was used,
- changed files,
- commands and results,
- whether real environment, DB, secrets, or outputs were touched,
- residual risks,
- V3 recommendation.

## Acceptance Criteria

- Default non-ADP fixtures produce no ADP vocabulary unless the words exist in source evidence.
- Explicit domain profile changes output labels only when supplied and records `derivation.profileId`.
- `business-process-model.json` version 2 has source artifacts, derivation hash, process status, evidence, and boundaries.
- `truth-readiness-report.json` has `gates.businessProcess`.
- Forged, stale, malformed, or source-less business-process models block `canSubmitReview`.
- Prompt compaction preserves process status and boundaries.
- Narrative quality blocks inferred process prose that omits evidence boundary wording.
- Required gate selected by auto gate passes or is reported as blocked with exact prerequisite.
