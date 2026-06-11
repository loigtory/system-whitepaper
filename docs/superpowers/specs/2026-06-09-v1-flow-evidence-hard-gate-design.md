# V1 Flow Evidence Hard Gate Design

## Context

V0 established execution governance and froze the high-truth roadmap. V1 starts the first P0 behavior change: formal whitepaper writing and review must not proceed when the system has page evidence but no observed business flow evidence.

The current repository already has `operation-spec.json`, `workflow-spec.json`, fact-check, narrative quality, and truth-readiness artifacts. The gap is that `workflow-spec.json` is not yet a first-class production pipeline node or truth-readiness input. A run can therefore appear review-ready even when operation flows and workflow steps are structurally absent.

## Decision

Implement V1-A as a narrow hard-gate release:

- Add `workflow-spec.json` to the production pipeline after `operation-spec.json`.
- Add `workflow-spec.json` to truth-readiness input loading, source fingerprints, and gate reporting.
- Block `truth-readiness-report.json canSubmitReview=true` when observed operation flows or observed workflow steps are missing.
- Keep collector surface improvement and ADP real-run validation out of this sub-version.

This preserves the main safety principle: missing process evidence cannot be repaired by prompt wording or AI inference.

## Goals

- `run-whitepaper-pipeline --with-whitepaper` generates or refreshes `workflow-spec.json` before narrative and truth-readiness nodes.
- `truth-readiness` exposes a dedicated `workflow` gate.
- Formal review readiness is blocked when `operation-spec.metrics.flowCount` or the computed observed workflow step count is zero.
- Missing, malformed, stale, or forged `workflow-spec.json` is visible in readiness blockers and improvement actions.
- Candidate or planned workflows remain non-narratable as observed business process evidence.

## Non-Goals

- No Playwright collector refactor in V1-A.
- No Browser Use, Stagehand, Crawlee, or cloud browser dependency.
- No real ADP/SIT reset run without separate user authorization.
- No database access, prompt changes, or whitepaper copy changes.
- No threshold weakening in fact-check, quality, safety, database, or approval gates.

## Architecture

### 1. Workflow Artifact Loader

`scripts/check-truth-readiness.js` should treat `workflow-spec.json` as an optional artifact that becomes required for formal readiness when `operation-spec.json` exists or the run is attempting review submission.

The loader records:

- File name.
- Status.
- Error.
- Fingerprint.
- Parsed artifact value.

The artifact contract is delegated to `assertValidWorkflowSpecArtifact` from `scripts/build-workflow-spec.js`.

### 2. Workflow Gate

Truth readiness adds `gates.workflow` with these normalized metrics:

- `operationFlowCount`
- `workflowCount`
- `observedWorkflowCount`
- `candidateWorkflowCount`
- `observedWorkflowStepCount`
- `stepCount`
- `missingWorkflowSpec`
- `artifactContractValid`
- `sourceFresh`

Pass criteria:

- `operation-spec.json` is valid and has `metrics.flowCount > 0`.
- `workflow-spec.json` is valid and source-fresh against the current `operation-spec.json`.
- `workflow-spec.json` has at least one observed workflow.
- At least one observed workflow contains at least one step.
- No candidate workflow is narratable as observed.

`observedWorkflowStepCount` is computed by summing steps on `workflow.evidenceStatus === "observed"` workflows. This avoids changing the existing `workflow-spec.json` schema, where `metrics.stepCount` already remains valid because candidate workflows cannot contain observed steps.

The workflow gate score is binary for V1-A: `1` when pass, `0` when fail. It should not dilute the existing weighted truth score; instead, it contributes a P0 blocker that prevents review submission.

### 3. Pipeline Wiring

`scripts/run-whitepaper-pipeline.js` adds a `workflow-spec` node between `build-spec` and `compose-guide`.

The default `--with-whitepaper` node order becomes:

```text
sync -> session -> collect -> inspect -> validate-write -> summary -> build-spec -> workflow-spec -> compose-guide -> db-profile -> db-model -> truth-universe -> truth-claims -> business-process -> draft -> narrative -> fact-check -> quality -> truth-readiness
```

The default non-whitepaper evidence route also includes `workflow-spec` after `build-spec` so local quality checks see the same process-evidence state.

### 4. Lineage

Readiness lineage adds:

- `workflow-spec.json` must record the current `operation-spec.json` fingerprint.
- `truth-readiness-report.json sourceArtifacts.workflowSpec` records the current workflow artifact fingerprint.
- Stale workflow lineage produces the same P0 stale lineage blocker class as other truth artifacts.

### 5. Blocking Semantics

If workflow evidence is missing, readiness should fail with a specific blocker:

- `workflow.operation-flow-missing` when `operation-spec` has zero observed flows.
- `workflow.spec-missing` when `workflow-spec.json` is absent but operation spec exists.
- `workflow.spec-invalid` when the artifact contract fails.
- `workflow.steps-missing` when no observed workflow step exists.
- `workflow.lineage-stale` when workflow spec does not match current operation spec.

The blocker rerun nodes should include:

```text
build-spec, workflow-spec, business-process, narrative, fact-check, quality, truth-readiness
```

Collector reruns remain a suggested upstream action only when operation flows are absent.

## Data Flow

1. Collector writes `evidence.json`.
2. Summary node writes `evidence-summary.json`.
3. Build-spec node writes `operation-spec.json` and `operation-guide-gate.json`.
4. Workflow-spec node derives `workflow-spec.json` from current operation spec.
5. Downstream truth artifacts continue to build from summary, operation spec, database profile, and business process model.
6. Truth-readiness validates workflow artifact freshness and observed flow/step metrics before allowing review submission.

## Error Handling

- Missing `workflow-spec.json` should not crash input loading.
- If `operation-spec.json` is missing, the workflow gate fails with an operation spec dependency message and existing evidence/lineage gates continue to report their own failures.
- If `workflow-spec.json` is malformed, readiness records the artifact as invalid and blocks review.
- If workflow spec is stale, readiness blocks without rewriting the artifact automatically.
- The pipeline node should fail fast when `build-workflow-spec.js` fails; it must not silently continue to narrative.

## Testing Strategy

Use TDD with targeted tests before running the core gate.

Required tests:

- `buildTruthReadinessReport` blocks review when operation spec has zero observed flows.
- `buildTruthReadinessReport` blocks review when workflow spec has zero observed steps.
- Readiness accepts a valid current workflow spec with observed flow steps when the existing evidence, claims, fact-check, and narrative gates pass.
- Readiness rejects stale workflow spec fingerprints.
- Pipeline selected node order includes `workflow-spec` after `build-spec` for `--with-whitepaper`.
- `pipeline-state` includes a `workflow-spec` node and artifact label.

## Safety Rules

- No real systems, browser sessions, DB metadata, secrets, cookies, ignored business outputs, or customer artifacts are required for V1-A unit implementation.
- DB metadata remains script-only and redacted; it must not enter prompts or whitepaper content.
- AI Provider remains a writer, not a fact source.
- Golden Eval remains evaluation-only input and is not part of V1-A generation.

## Acceptance Criteria

- Targeted V1 tests pass.
- `npm run test:gate:auto -- --dry-run` selects the appropriate gate.
- Selected quality gate passes, using escalation only if the local sandbox blocks child-process spawning.
- `truth-readiness-report.json canSubmitReview=false` when observed operation flows or observed workflow steps are missing.
- `run-whitepaper-pipeline --with-whitepaper` includes `workflow-spec` before narrative.
- No collector, Playwright, Browser Use, Stagehand, Crawlee, DB connector, prompt, or narrative copy behavior is changed in V1-A.
