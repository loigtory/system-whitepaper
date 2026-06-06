# Evidence Capture Strategy Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract deterministic action classification and page-surface delta helpers so ADP collection can promote real operation surfaces into flow evidence without introducing Browser Use, Stagehand, Crawlee, or any cloud browser dependency.

**Architecture:** Keep local Playwright as the executor and move strategy decisions into pure helpers exported from `scripts/system-whitepaper-lib.js`. `scripts/collect-evidence.js` will call those helpers, preserving its current artifact names while adding compatible metadata such as action class and delta reasons.

**Tech Stack:** Node.js, `node:test`, local Playwright collector, existing operation/workflow artifact builders.

---

### Task 1: Add RED Tests For Strategy Helpers

**Files:**
- Modify: `scripts/system-whitepaper.test.js`
- Read: `docs/superpowers/specs/2026-06-06-evidence-capture-strategy-design.md`

- [ ] **Step 1: Import the wished-for helpers from `system-whitepaper-lib.js`**

```js
const {
  classifyCaptureAction,
  buildInspectionSurfaceDelta,
  buildInspectionSurfaceSnapshot,
} = require("./system-whitepaper-lib");
```

- [ ] **Step 2: Add a failing test for action classification**

```js
test("classifyCaptureAction separates flow starts progress read detail navigation unsafe and unknown actions", () => {
  assert.deepEqual(classifyCaptureAction({ text: "新建AI任务", role: "button" }), {
    class: "flow-start",
    safeToClick: true,
    reason: "business-flow-entry",
  });
  assert.equal(classifyCaptureAction({ text: "下一步", role: "button" }).class, "flow-progress");
  assert.equal(classifyCaptureAction({ text: "查看详情", role: "button" }).class, "read-detail");
  assert.equal(classifyCaptureAction({ text: "任务页签", role: "tab" }).class, "navigation");
  assert.equal(classifyCaptureAction({ text: "删除", role: "button" }).safeToClick, false);
  assert.equal(classifyCaptureAction({ text: "刷新", role: "button" }).class, "unknown");
});
```

- [ ] **Step 3: Add a failing test for surface delta**

```js
test("buildInspectionSurfaceDelta rejects URL-only changes and keeps only business deltas", () => {
  const beforeSnapshot = {
    url: "https://sit-adp.hzins.com/#/tasks",
    forms: [{ formName: "查询", fields: [{ label: "保险公司" }] }],
    buttons: ["查询", "重置", "新建AI任务"],
    tables: [{ columns: ["保险公司", "任务类型", "操作"] }],
  };
  assert.equal(
    buildInspectionSurfaceDelta({
      action: classifyCaptureAction({ text: "新建AI任务", role: "button" }),
      beforeSnapshot,
      afterSnapshot: { ...beforeSnapshot, url: "https://sit-adp.hzins.com/#/tasks?x=1" },
    }).valid,
    false,
  );
  const delta = buildInspectionSurfaceDelta({
    action: classifyCaptureAction({ text: "新建AI任务", role: "button" }),
    beforeSnapshot,
    afterSnapshot: {
      url: beforeSnapshot.url,
      forms: [{ formName: "定义参数", fields: [{ label: "保险公司" }, { label: "接口方式" }] }],
      buttons: ["上一步", "下一步", "保存"],
      tables: [],
    },
  });
  assert.equal(delta.valid, true);
  assert.deepEqual(delta.forms[0].fields.map((field) => field.label), ["接口方式"]);
  assert.deepEqual(delta.buttons, ["上一步", "下一步", "保存"]);
});
```

- [ ] **Step 4: Run the new test names and confirm RED**

Run:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
. $PROFILE
$OutputEncoding.WebName
node --test --test-name-pattern "classifyCaptureAction|buildInspectionSurfaceDelta" scripts/system-whitepaper.test.js
```

Expected: FAIL because `classifyCaptureAction` and `buildInspectionSurfaceDelta` are not exported yet.

### Task 2: Implement Pure Strategy Helpers

**Files:**
- Modify: `scripts/system-whitepaper-lib.js`

- [ ] **Step 1: Add action classifier constants and `classifyCaptureAction` near existing click-safety helpers**

```js
function classifyCaptureAction(candidate = {}) {
  const text = normalizeUiText(candidate.text || candidate.name || candidate.label || "");
  const role = String(candidate.role || "").toLowerCase();
  if (!text) return { class: "unknown", safeToClick: false, reason: "missing-label" };
  if (/删除|移除|禁用|审批|通过|驳回|支付|付款|结算|发送|取消订单|作废|关闭订单/.test(text)) {
    return { class: "unsafe-write", safeToClick: false, reason: "unsafe-write-action" };
  }
  if (/新增|新建|创建|配置|生成|执行|运行|上传|导入|编辑|修改/.test(text)) {
    return { class: "flow-start", safeToClick: true, reason: "business-flow-entry" };
  }
  if (/上一步|下一步|保存|提交|确定|确认|发布|完成|开始|运行/.test(text)) {
    return { class: "flow-progress", safeToClick: true, reason: "business-flow-progress" };
  }
  if (/查看|详情|预览/.test(text)) {
    return { class: "read-detail", safeToClick: true, reason: "read-only-detail" };
  }
  if (/menu|tree|tab|navigation/.test(role) || /页签|菜单|导航|切换/.test(text)) {
    return { class: "navigation", safeToClick: true, reason: "navigation" };
  }
  return { class: "unknown", safeToClick: false, reason: "unclassified-action" };
}
```

- [ ] **Step 2: Add `buildInspectionSurfaceDelta` from the current collector logic**

The helper must compare normalized before/after snapshots, reject URL-only changes, reject unchanged list pages, keep only new fields/tables/flow buttons, and return `{ valid: false, reason }` when insufficient.

- [ ] **Step 3: Add `buildInspectionSurfaceSnapshot` wrapper**

The wrapper must call the classifier and delta helper, then return the existing snapshot shape with compatible metadata:

```js
{
  type: "container",
  title: action.text,
  triggerLabel: action.text,
  captureKind: "inspection-surface",
  captureScope: "page-delta",
  actionClass: action.class,
  actionClassification: action,
  buttons: delta.buttons,
  forms: delta.forms,
  tables: delta.tables,
}
```

- [ ] **Step 4: Export the new helpers**

Export `classifyCaptureAction`, `buildInspectionSurfaceDelta`, and `buildInspectionSurfaceSnapshot` from `module.exports`.

### Task 3: Rewire Collector To Use Pure Helpers

**Files:**
- Modify: `scripts/collect-evidence.js`

- [ ] **Step 1: Import `classifyCaptureAction` and `buildInspectionSurfaceSnapshot` from `system-whitepaper-lib.js`**

- [ ] **Step 2: Replace local `buildInspectionSurfaceSnapshot` and related local delta helpers with library imports**

Remove local helper definitions only after Task 1 RED has been observed.

- [ ] **Step 3: Preserve compatibility export**

Keep `collect-evidence.js` exporting `buildInspectionSurfaceSnapshot` by forwarding the imported helper, so existing callers keep working.

### Task 4: Verify And Commit Locally

**Files:**
- Modify: `scripts/system-whitepaper.test.js`
- Modify: `scripts/system-whitepaper-lib.js`
- Modify: `scripts/collect-evidence.js`
- Add: `docs/superpowers/plans/2026-06-06-evidence-capture-strategy-phase1.md`

- [ ] **Step 1: Run targeted strategy and operation tests**

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
. $PROFILE
$OutputEncoding.WebName
node --test --test-name-pattern "classifyCaptureAction|buildInspectionSurfaceDelta|buildInspectionSurfaceSnapshot|buildOperationSpec derives observed flows from container step evidence|buildOperationSpec does not promote read-only detail containers" scripts/system-whitepaper.test.js
```

Expected: PASS.

- [ ] **Step 2: Run quick gate**

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
. $PROFILE
$OutputEncoding.WebName
npm run test:gate:quick
```

Expected: PASS.

- [ ] **Step 3: Review diff and stage only owned files**

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
. $PROFILE
$OutputEncoding.WebName
git diff -- scripts/system-whitepaper.test.js scripts/system-whitepaper-lib.js scripts/collect-evidence.js docs/superpowers/plans/2026-06-06-evidence-capture-strategy-phase1.md
git add scripts/system-whitepaper.test.js scripts/system-whitepaper-lib.js scripts/collect-evidence.js docs/superpowers/plans/2026-06-06-evidence-capture-strategy-phase1.md
```

- [ ] **Step 4: Commit locally**

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
. $PROFILE
$OutputEncoding.WebName
git commit -m "feat(evidence): extract capture strategy helpers"
```

Expected: local commit succeeds. Do not push.
