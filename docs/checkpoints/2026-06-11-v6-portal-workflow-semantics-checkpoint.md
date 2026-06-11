# V6 Portal Workflow Semantics Checkpoint

Date: 2026-06-11

## Scope

- Corrected portal-homepage workflow semantics:
  - Homepage overview cards are evidence-backed `inferred` workflows, not `observed` workflows.
  - They can be used for narrative synthesis when backed by screenshots and page text.
  - They cannot be written as already clicked, executed, submitted, or write-validated workflows.
- Generalized the behavior beyond ADP for portal systems such as finance, HR, and internal foundation systems.
- Updated truth readiness wording and metrics so `observed=0` is explicit while `narratable inferred workflows > 0` can still satisfy the workflow gate.
- Updated business process synthesis so inferred workflow steps remain inferred through process modeling and whitepaper narration.
- Added deterministic Phase3b pending-confirmation consolidation so repeated module-level uncertainty does not make the draft fail narrative quality while preserving evidence boundaries.
- Fixed local single-system pipeline batch state so finalized runs write `runStatus=completed` and can be accepted by batch/delivery gates.

## Semantic Contract

V6 treats workflow evidence as three distinct levels:

- `observed`: backed by direct UI interaction evidence, page/action/state details, or other concrete operation evidence.
- `inferred`: backed by homepage workflow cards, screenshots, module names, business hints, or other bounded UI evidence, but not executed end to end.
- `candidate`: planned or weak flow hints that are not narratable as business process evidence.

Readiness now reports all three counts:

- `observedWorkflowCount`
- `inferredWorkflowCount`
- `homeOverviewWorkflowCount`
- `narratableWorkflowCount`
- `observedWorkflowStepCount`
- `inferredWorkflowStepCount`

The gate can pass with inferred narratable workflows, but the report must preserve `observedWorkflowCount=0` instead of hiding that limitation.

## Generic Portal Coverage

Added regression coverage for non-ADP portal-homepage cards:

- Finance: expense request, budget check, finance review, payment archive.
- HR: onboarding request, material review, account provisioning, onboarding archive.
- Internal foundation: permission request, owner approval, permission provisioning, expiry review.

Expected behavior for all cases:

- `operation-spec` derives bounded modules from homepage cards.
- `workflow-spec` marks those workflows as `inferred`.
- `observedWorkflowCount=0`.
- `inferredWorkflowCount > 0`.
- `homeOverviewWorkflowCount > 0`.
- `narratableWorkflowCount > 0`.
- No write-action claim is created from homepage cards.
- Each inferred workflow keeps a boundary explaining that no clicked menu, form execution, or write-operation validation was observed.

## ADP Trial Result

Fresh deterministic ADP rerun after V6:

- `workflow-spec`: `workflows=7`, `observed=0`, `candidates=0`, `steps=7`.
- `business-process-model`: `processes=1`, `steps=7`, `confidence=medium`.
- Truth readiness: `scorePercent=100`.
- Workflow readiness metrics:
  - `operationFlowCount=7`
  - `workflowCount=7`
  - `observedWorkflowCount=0`
  - `inferredWorkflowCount=7`
  - `homeOverviewWorkflowCount=7`
  - `narratableWorkflowCount=7`
  - `observedWorkflowStepCount=0`
  - `inferredWorkflowStepCount=7`
- Narrative quality: `canSubmitReview=true`, `failures=[]`.
- Batch acceptance: `status=accepted`, `accepted=1/1`, `minTruth=100%`.
- Delivery readiness: `status=ready`, `ready=1/1`, `smoke=0`.
- Real-run readiness: `status=ready`, `canStart=true`, `canDeliver=true`.

## Implementation Notes

- `scripts/build-workflow-spec.js`
  - Adds source-type/evidence-status derivation.
  - Marks homepage overview card workflows as inferred.
  - Adds workflow boundaries and metrics for observed/inferred/homeOverview/narratable counts.
- `scripts/check-truth-readiness.js`
  - Renames the gate to workflow evidence.
  - Allows narratable inferred workflow steps while reporting observed count explicitly.
- `scripts/build-business-process-model.js`
  - Consumes observed and narratable inferred workflow steps.
  - Keeps inferred steps and process reasoning from being described as observed execution.
- `scripts/narrative/phase3b.js`
  - Adds prompt guidance to merge same-class pending confirmations.
  - Consolidates repeated module-level pending-confirmation bullets in the assembled draft.
- `scripts/run-whitepaper-pipeline.js`
  - Writes completed local batch state for finalized single-system runs.
- `scripts/system-whitepaper.test.js`
  - Adds V6 tests for inferred homepage workflow semantics, non-ADP generic portal systems, business-process inference propagation, narrative pending-confirmation consolidation, and local batch state.

## Verification

- `node --check scripts/build-workflow-spec.js` passed.
- `node --check scripts/check-truth-readiness.js` passed.
- `node --check scripts/build-business-process-model.js` passed.
- `node --check scripts/run-whitepaper-pipeline.js` passed.
- `node --check scripts/narrative/phase3b.js` passed.
- `node --check scripts/system-whitepaper.test.js` passed.
- TDD red check for pending-confirmation consolidation failed first with `consolidatePendingConfirmationSection is not a function`.
- `node --test --test-name-pattern "V6 pending confirmations consolidate repeated module uncertainty|buildPhase3bPrompt uses low-token inline inputs" scripts/system-whitepaper.test.js` passed.
- `node --test --test-name-pattern "V6|home overview cards|portal workflow modules|home overview text parser|mergeFrameSnapshots preserves|buildWorkflowSpec|business process model keeps inferred|pipeline local batch state marks finalized systems completed|truth readiness accepts current observed workflow evidence|truth readiness blocks formal review when observed workflow steps are missing|buildPhase3bPrompt uses low-token inline inputs" scripts/system-whitepaper.test.js` passed: 16/16 selected tests.
- `node scripts/build-workflow-spec.js --input outputs/adp` passed.
- `node scripts/build-business-process-model.js --input outputs/adp` passed.
- `node scripts/run-whitepaper-pipeline.js --config config/systems.local.yaml --system adp --nodes whitepaper-plan,narrative,fact-check,golden-eval,quality,truth-readiness` passed.
- `node scripts/run-review-decision.js --input outputs/adp --status approved` passed after regenerated pending-review changed final artifact hash.
- `node scripts/run-whitepaper-pipeline.js --config config/systems.local.yaml --system adp --nodes truth-readiness` passed.
- `npm run batch:acceptance` passed: `status=accepted`, `accepted=1/1`, `minTruth=100%`.
- `npm run delivery:check` passed: `status=ready`, `ready=1/1`, `smoke=0`.
- `npm run real:check -- --systems adp` passed: `status=ready`, `canStart=true`, `canDeliver=true`.
- `npm run test:gate:core` passed:
  - tests: 439/439
  - package check passed
  - agent isolation passed
- `npm run test:gate:full` passed:
  - tests: 439/439
  - package check passed
  - agent isolation passed
  - batch acceptance accepted
  - delivery readiness ready
  - real-run readiness ready

## Remaining Boundaries

- ADP is still a UI-evidence pilot. Database evidence is not enabled in the current ADP mode.
- Inferred homepage workflows must remain labeled as inferred unless a later run captures direct interaction, form execution, state transition, or safe AI_AUTO_TEST_ write evidence.
- Secrets, cookies, database credentials, and private DB metadata remain excluded from prompts, whitepapers, and model access. Database inputs may only be used by scripts to produce redacted metadata artifacts.
- Future systems should reuse the same semantic split instead of adding ADP-specific rules.
