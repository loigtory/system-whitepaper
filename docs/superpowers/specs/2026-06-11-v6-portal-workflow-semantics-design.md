# V6 Portal Workflow Semantics Design

Date: 2026-06-11

## Goal

V6 separates observed workflow evidence from evidence-bounded inferred workflows, especially for portal-style systems whose homepage exposes business flow cards before any menu or form interaction is available.

The goal is to improve system truth accuracy without losing the useful V5.2 homepage-card inference path that made ADP and similar portal systems describable.

## Problem

The V5.2 ADP fresh run showed that homepage overview cards can be valid UI evidence for business capabilities. The pipeline now captures those cards and derives modules with:

- `source=home-overview-card`
- `flow.status=inferred-from-home-overview`

However, `workflow-spec.json` currently treats every `operation-spec.modules[].flows[]` entry as `evidenceStatus=observed`. This means homepage-card flows are counted in:

- `metrics.observedWorkflowCount`
- truth-readiness `workflow.metrics.observedWorkflowCount`
- truth-readiness `workflow.metrics.observedWorkflowStepCount`

That is too strong. A homepage card supports a bounded business-flow inference, but it is not the same as observing a workflow execution, menu traversal, form submission, or write validation path.

## Semantics

V6 introduces three distinct workflow evidence semantics:

- `observed`
  - A flow observed from page/menu/action/form/list/write-validation evidence.
  - Can be narrated as observed.
  - Counts toward `observedWorkflowCount`.
- `inferred`
  - A flow inferred from evidence-backed UI structures such as homepage overview cards.
  - Can be narrated only with an inference boundary.
  - Does not count toward `observedWorkflowCount`.
- `candidate`
  - A planned or candidate flow without enough direct evidence.
  - Cannot be narrated as a confirmed workflow.
  - Does not count toward `observedWorkflowCount`.

For homepage overview cards:

- `operation-spec` may keep `modules[].flows[]` so downstream planning can reason about the capability.
- `workflow-spec` must classify these workflows as `evidenceStatus=inferred`.
- `canNarrateAsObserved` must be `false`.
- `canNarrateAsInferred` may be `true`.
- Each inferred workflow must carry a boundary explaining that it comes from homepage cards and screenshot-backed UI text, not observed execution.

## Artifact Changes

### workflow-spec.json

Add or normalize:

- `metrics.inferredWorkflowCount`
- `metrics.homeOverviewWorkflowCount`
- `metrics.narratableWorkflowCount`
- `workflows[].evidenceStatus` allowed values: `observed`, `inferred`, `candidate`
- `workflows[].sourceType`, when available, such as `home-overview-card`
- `workflows[].canNarrateAsObserved`
- `workflows[].canNarrateAsInferred`

Rules:

- `flow.status=inferred-from-home-overview` or module `source=home-overview-card` maps to `evidenceStatus=inferred`.
- `plannedFlows[]` remain `candidate`.
- Observed flow steps are counted only from `evidenceStatus=observed`.
- Inferred workflow steps can exist for plan/narrative context but must not be counted as observed steps.

### truth-readiness-report.json

The workflow gate should report:

- `operationFlowCount`
- `observedWorkflowCount`
- `inferredWorkflowCount`
- `homeOverviewWorkflowCount`
- `narratableWorkflowCount`
- `observedWorkflowStepCount`
- `inferredWorkflowStepCount`

Gate policy:

- A system with only inferred homepage workflows may pass the whitepaper-readiness workflow gate if each inferred workflow is evidence-backed and boundary-marked.
- The report must not state or imply that inferred homepage workflows are observed.
- If neither observed nor inferred narratable workflows exist, review/finalization remains blocked.

This preserves automation for portal systems while improving truth semantics.

### business-process-model.json

Business process generation must not convert inferred homepage workflows into observed process steps.

Rules:

- `workflow.evidenceStatus=observed` creates `process.steps[].status=observed`.
- `workflow.evidenceStatus=inferred` creates `process.steps[].status=inferred`.
- Inferred steps carry medium-or-lower confidence and a boundary.
- Process status becomes `inferred` or `partially-observed` depending on mixed evidence.

### narrative / whitepaper

Narrative may use inferred homepage workflows only with bounded language:

- Allowed: “首页展示费用申请、预算校验等流程环节，依据首页流程卡片和截图归纳。”
- Disallowed: “系统已验证费用申请到付款归档的完整执行流程。”

The existing whitepaper plan and fact-check gates should continue to enforce evidence references and boundaries.

## Genericity Requirements

V6 must not specialize to ADP. Tests must include at least:

- A finance portal homepage with expense workflow cards.
- An HR portal homepage with onboarding or employee-service workflow cards.
- An internal foundation portal homepage with access/request/approval workflow cards.

The parser can use conservative structural heuristics and domain-neutral labels. Any fallback keyword list must not be required for the primary DOM-card path.

## Security And Secrets

- No secrets, cookies, database credentials, private URLs, or customer artifacts enter prompts, docs, tests, or whitepaper text.
- Database metadata remains optional and redacted-only.
- No Browser Use, Stagehand, or Crawlee integration.

## Acceptance Criteria

- Homepage-card workflows are classified as `inferred`, not `observed`, in `workflow-spec.json`.
- `observedWorkflowCount` remains `0` for a homepage-only portal fixture.
- `inferredWorkflowCount` and `homeOverviewWorkflowCount` reflect the homepage-card workflows.
- truth-readiness can pass with `narratableWorkflowCount > 0` while clearly reporting `observedWorkflowCount=0`.
- business-process steps from homepage-card workflows are `inferred`, not `observed`.
- Whitepaper/narrative facts remain evidence-bound and boundary-marked.
- ADP final delivery remains possible after rerunning pipeline with the corrected semantics.
