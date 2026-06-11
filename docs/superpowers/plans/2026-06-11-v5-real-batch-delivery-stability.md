# V5 Real Batch Delivery Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Current coordinator recommendation: execute inline with one agent because another project may use multi-agent capacity.

**Goal:** Stabilize batch diagnosis, repair queue, dashboard, batch acceptance, and delivery readiness around the V1-V4 formal gates without requiring a real ADP run.

**Architecture:** Reuse existing truth-readiness gates as the source of truth. Add deterministic summaries and rerun-node normalization at batch/dashboard/delivery boundaries; do not add new whitepaper facts or generation inputs.

**Tech Stack:** Node.js CommonJS, `node:test`, existing ignored outputs under `outputs/`, existing dashboard snapshot JSON.

---

## File Structure

- Modify `scripts/run-whitepaper-batch.js`: add truth gate summaries, standardized gap types, repair queue gap metadata, and `golden-eval` normalization for narrative/fact-check repair chains.
- Modify `scripts/local-dashboard/server.js`: expose `gateSummary` in truth readiness snapshots.
- Modify `scripts/check-batch-acceptance.js`: normalize narrative/fact-check rerun nodes through `golden-eval`.
- Modify `scripts/check-delivery-readiness.js`: normalize narrative/fact-check rerun nodes through `golden-eval`.
- Modify `scripts/system-whitepaper.test.js`: add V5.1 regression tests for synthetic multi-system gaps, dashboard gate summary, and rerun chain normalization.
- Create `docs/checkpoints/2026-06-11-v5-real-batch-delivery-stability-checkpoint.md` after verification.

## Tasks

### Task 1: Red Tests For V5.1 Batch And Dashboard Gaps

- [ ] Add a test where a non-ADP synthetic system has failing `workflow`, `businessProcess`, `whitepaperPlan`, and `goldenEval` gates in `truthReadiness`.
- [ ] Assert `buildBatchDiagnosis()` returns `summary.gapTypes` counts and per-system gaps for `workflow-evidence`, `business-process`, `whitepaper-plan`, and `golden-eval`.
- [ ] Assert `buildBatchRepairQueue()` carries `gapTypes` and `primaryGapType`, and Agent-writing items stay blocked when `allowAgentWriting=false`.
- [ ] Add a dashboard truth snapshot test proving `gateSummary.workflow`, `gateSummary.businessProcess`, `gateSummary.whitepaperPlan`, and `gateSummary.goldenEval` are exposed.
- [ ] Run:

```powershell
node --test --test-name-pattern "V5 batch diagnosis|V5 dashboard truth gate summary" scripts/system-whitepaper.test.js
```

Expected: fail because V5.1 fields do not exist yet.

### Task 2: Implement Batch Diagnosis And Repair Queue Summaries

- [ ] In `scripts/run-whitepaper-batch.js`, add helpers:
  - `buildTruthGateSummary(truth)`
  - `truthGateGapType(gateId)`
  - `withGoldenEvalNode(nodes)`
- [ ] Include `truthGateSummary` in `buildBatchTruthSummary()`.
- [ ] In `buildSystemDiagnosis()`, convert failing gates into standardized gaps and actions from existing blockers/improvement actions.
- [ ] Add `summary.gapTypes` in `summarizeDiagnosisSystems()`.
- [ ] Add `gapTypes` and `primaryGapType` in `buildRepairQueueItem()`.
- [ ] Ensure the custom writable-claim repair action uses `["narrative", "fact-check", "golden-eval", "quality", "truth-readiness"]`.
- [ ] Re-run Task 1 test until it passes.

### Task 3: Implement Dashboard Gate Summary

- [ ] In `scripts/local-dashboard/server.js`, add a `buildTruthGateSummaryFromGates(gates)` helper.
- [ ] Add `gateSummary` to `buildTruthReadinessSnapshot()`.
- [ ] Include workflow metrics: `operationFlowCount`, `observedWorkflowStepCount`.
- [ ] Include business process metrics: `processCount`, `staleSourceCount`, `stepEvidenceMissingCount`, `defaultDomainLeakCount`.
- [ ] Include whitepaper plan metrics: `requiredItemCount`, `coveredRequiredItemCount`, `planRequiredCoverageRatio`, `missingRequiredItemCount`.
- [ ] Re-run the dashboard V5 test until it passes.

### Task 4: Normalize Batch Acceptance And Delivery Rerun Chains

- [ ] In `scripts/check-batch-acceptance.js`, add `withGoldenEvalNode(nodes)` and use it for all narrative/fact-check-to-quality chains.
- [ ] In `scripts/check-delivery-readiness.js`, add the same helper and use it for all narrative/fact-check-to-quality chains.
- [ ] Add/adjust tests proving whitepaper missing/smoke and below-target blockers include `golden-eval` while DB-only and review-only chains do not.
- [ ] Run targeted tests:

```powershell
node --test --test-name-pattern "V5 rerun chain|batch aggregate report|delivery readiness" scripts/system-whitepaper.test.js
```

### Task 5: Verification And Checkpoint

- [ ] Run targeted V5.1 tests.
- [ ] Run `node scripts/system-whitepaper.test.js`.
- [ ] Run `npm run pack:check`.
- [ ] Run `npm run test:gate:core`.
- [ ] Run `npm run test:gate:full`.
- [ ] Write `docs/checkpoints/2026-06-11-v5-real-batch-delivery-stability-checkpoint.md` with commands, results, touched outputs, and V5.2 real-run authorization requirement.

## Acceptance Criteria

- Batch diagnosis reports standardized gap type counts for workflow/process/plan/golden gates.
- Repair queue carries `gapTypes` and `primaryGapType`.
- Repair queue does not auto-run Agent-writing items without explicit `allowAgentWriting`.
- Dashboard truth snapshot exposes the same gate summary without recomputing truth.
- Batch acceptance and delivery readiness preserve `golden-eval` in narrative/fact-check downstream rerun chains.
- No secrets, DB credentials, browser cookies, private URLs, real outputs, or customer data are added to tracked files.
