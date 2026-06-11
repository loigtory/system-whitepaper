# V6 Portal Workflow Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Current coordinator recommendation: execute inline with one agent because another project may use multi-agent capacity.

**Goal:** Correct workflow evidence semantics so homepage-card flows are narratable inferred workflows, not observed workflows.

**Architecture:** Keep V5.2 homepage-card collection and operation-spec derivation. Change workflow-spec classification, truth-readiness metrics/gate policy, and business-process step generation so observed and inferred evidence are reported separately.

**Tech Stack:** Node.js CommonJS, `node:test`, existing artifact builders under `scripts/`, ignored outputs under `outputs/`.

---

## File Structure

- Modify `scripts/build-workflow-spec.js`
  - Add `inferred` workflow evidence status.
  - Map `home-overview-card` and `inferred-from-home-overview` flows to inferred workflows.
  - Add inferred/home-overview/narratable metrics.
- Modify `scripts/check-truth-readiness.js`
  - Report observed/inferred workflow metrics separately.
  - Allow workflow gate pass when narratable inferred workflows exist and are boundary-marked.
  - Keep hard blocker when no observed or inferred narratable workflow exists.
- Modify `scripts/build-business-process-model.js`
  - Convert inferred workflow steps to inferred process steps, not observed.
  - Keep confidence capped and boundary text present.
- Modify `scripts/system-whitepaper.test.js`
  - Add finance/HR/internal portal fixtures.
  - Add regression tests proving homepage-only workflows do not count as observed.
- Update `docs/95-plus-truth-iteration-master-plan-2026-06-09.md`
  - Add V6 row and acceptance summary.
- Create `docs/checkpoints/2026-06-11-v6-portal-workflow-semantics-checkpoint.md`
  - Record commands, ADP rerun result, and any residual risks.

## Task 1: Red Tests For Workflow Semantics

- [ ] Add a test named `V6 homepage overview workflows are inferred not observed`.
- [ ] Build an `operationSpec` fixture with one module:
  - `source: "home-overview-card"`
  - `flows[0].status: "inferred-from-home-overview"`
  - one screenshot-backed step.
- [ ] Call `buildWorkflowSpec({ operationSpec })`.
- [ ] Assert:
  - `metrics.observedWorkflowCount === 0`
  - `metrics.inferredWorkflowCount === 1`
  - `metrics.homeOverviewWorkflowCount === 1`
  - `metrics.narratableWorkflowCount === 1`
  - `workflows[0].evidenceStatus === "inferred"`
  - `workflows[0].canNarrateAsObserved === false`
  - `workflows[0].canNarrateAsInferred === true`
- [ ] Run:

```powershell
node --test --test-name-pattern "V6 homepage overview workflows are inferred not observed" scripts/system-whitepaper.test.js
```

Expected before implementation: fail because the workflow is currently treated as observed or inferred metrics are missing.

## Task 2: Implement Workflow-Spec Classification

- [ ] In `scripts/build-workflow-spec.js`, add a helper:

```js
function inferWorkflowEvidenceStatus(module = {}, flow = {}, workflowType = "flows") {
  if (workflowType === "plannedFlows") return "candidate";
  const source = compactString(module.source || flow.source || flow.validation?.source);
  const status = compactString(flow.status);
  if (source === "home-overview-card" || status === "inferred-from-home-overview") {
    return "inferred";
  }
  return "observed";
}
```

- [ ] Update `normalizeWorkflow()` so:
  - `steps` exist for `observed` and `inferred`, but not `candidate`.
  - `canNarrateAsObserved` is true only for `observed`.
  - `canNarrateAsInferred` is true for `inferred`.
  - `sourceType` is set from module/flow source.
- [ ] Update `workflowBoundaries()` so inferred workflows always carry a boundary.
- [ ] Update `buildMetrics()` with `inferredWorkflowCount`, `homeOverviewWorkflowCount`, `narratableWorkflowCount`, and `inferredStepCount`.
- [ ] Update `assertValidWorkflowSpecArtifact()` to allow `inferred` and require boundaries for inferred workflows.
- [ ] Re-run Task 1 until green.

## Task 3: Red/Green Tests For Truth-Readiness Metrics

- [ ] Add a test named `V6 workflow gate passes narratable inferred workflows without observed counts`.
- [ ] Use a temporary output dir containing:
  - valid `operation-spec.json` with homepage-card inferred flow
  - valid `workflow-spec.json` built from it
  - minimal required companion artifacts already used by existing truth-readiness helper tests
- [ ] Assert workflow gate:
  - `pass === true`
  - `metrics.observedWorkflowCount === 0`
  - `metrics.inferredWorkflowCount === 1`
  - `metrics.homeOverviewWorkflowCount === 1`
  - `metrics.narratableWorkflowCount === 1`
  - `metrics.observedWorkflowStepCount === 0`
  - `metrics.inferredWorkflowStepCount === 1`
- [ ] Run targeted test and confirm red before implementation.
- [ ] In `scripts/check-truth-readiness.js`:
  - Count observed and inferred workflow steps separately.
  - Replace hard pass condition from observed-only to narratable workflow count.
  - Keep blocker text explicit when only inferred workflows exist.
- [ ] Re-run targeted test until green.

## Task 4: Business Process Inferred Step Semantics

- [ ] Add a test named `V6 business process keeps homepage workflow steps inferred`.
- [ ] Build a workflow-spec fixture with one `evidenceStatus=inferred` homepage workflow.
- [ ] Call the business-process builder used by existing tests.
- [ ] Assert:
  - generated process step `status === "inferred"`
  - process status is `inferred` when no observed steps exist
  - boundary is non-empty
- [ ] Update `scripts/build-business-process-model.js`:
  - Rename or generalize `buildObservedWorkflowSteps()` to include narratable workflow steps.
  - Map evidence status to process step status.
  - Use observed reasoning only for observed workflows; use inferred reasoning and boundary for inferred workflows.
- [ ] Re-run targeted tests until green.

## Task 5: Generic Portal Fixtures

- [ ] Add tests for three portal homepage fixtures:
  - finance: `费用申请 -> 预算校验 -> 财务复核 -> 付款归档`
  - HR: `入职申请 -> 资料审核 -> 账号开通 -> 入职归档`
  - internal foundation: `权限申请 -> 负责人审批 -> 权限开通 -> 到期复核`
- [ ] Assert all fixtures:
  - preserve overview cards in evidence summary
  - derive operation-spec modules from homepage cards
  - build inferred workflow-spec entries
  - do not create write actions
- [ ] Keep the assertions generic; do not add ADP-only names to production code.

## Task 6: ADP Fresh Artifact Rerun

- [ ] Run the current ADP output through affected deterministic nodes without resetting browser collection:

```powershell
node scripts/build-workflow-spec.js --input outputs/adp
node scripts/build-business-process-model.js --input outputs/adp
npm run truth:readiness -- --systems adp
npm run batch:acceptance
npm run delivery:check
npm run real:check -- --systems adp
```

- [ ] Expected:
  - truth-readiness remains >= 95
  - delivery readiness remains ready
  - real-run readiness remains ready
  - workflow gate reports observed and inferred counts separately

## Task 7: Verification And Checkpoint

- [ ] Run V6 targeted tests:

```powershell
node --test --test-name-pattern "V6|home overview cards|portal workflow modules|home overview text parser|mergeFrameSnapshots preserves" scripts/system-whitepaper.test.js
```

- [ ] Run syntax checks:

```powershell
node --check scripts/build-workflow-spec.js
node --check scripts/check-truth-readiness.js
node --check scripts/build-business-process-model.js
```

- [ ] Run core/full gates:

```powershell
npm run test:gate:core
npm run test:gate:full
```

- [ ] Write `docs/checkpoints/2026-06-11-v6-portal-workflow-semantics-checkpoint.md`.

## Acceptance Criteria

- Homepage-only portal fixtures produce inferred workflows, not observed workflows.
- Observed and inferred workflow metrics are visible separately in workflow-spec and truth-readiness.
- Inferred homepage workflows can support whitepaper readiness only with explicit boundaries.
- Business process model preserves inferred status.
- ADP remains deliverable with `real:check` ready.
- No secrets, DB credentials, cookies, private URLs, or real generated outputs are added to tracked files.
