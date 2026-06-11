# V4 95% Quality And Evaluation Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Current coordinator recommendation: execute inline with one agent because another project is using multi-agent capacity.

**Goal:** Add Golden Eval as an optional but hard formal gate when a system has configured golden facts, and surface 95% quality metrics through readiness, pipeline, batch, delivery, and dashboard.

**Architecture:** Keep Golden Eval evaluation-only. `run-golden-eval.js` remains the scorer; `check-truth-readiness.js` consumes `golden-eval-report.json`; pipeline can generate it only when a golden facts path is explicitly configured. Batch, delivery, and dashboard read summarized metrics from readiness reports.

**Tech Stack:** Node.js CommonJS, `node:test`, existing artifacts under system output directories, existing pipeline and readiness scripts.

---

## File Structure

- Modify `scripts/check-truth-readiness.js`: load/validate `golden-eval-report.json`, add `goldenEval` gate, stale source checks, blockers, score integration, and improvement actions.
- Modify `scripts/run-whitepaper-pipeline.js`: add optional `golden-eval` node after `fact-check`, resolve CLI/config golden facts path, and skip node when absent.
- Modify `scripts/pipeline-state.js`: register `golden-eval` node and artifact label.
- Modify `scripts/run-whitepaper-batch.js`: include node in full whitepaper retry order and expose golden metrics in diagnosis.
- Modify `scripts/check-batch-acceptance.js`: include golden metrics in system reports.
- Modify `scripts/local-dashboard/server.js`: expose golden metrics from truth-readiness snapshots.
- Modify `scripts/run-local-e2e-smoke.js`: include optional golden gate field in smoke fixture only when present.
- Modify `scripts/system-whitepaper.test.js`: add V4 tests.
- Create `docs/checkpoints/2026-06-10-v4-95-quality-eval-loop-checkpoint.md` after verification.

## 4-Agent Split For Later

| Agent | Role | Write Scope | Handoff | Verification |
| --- | --- | --- | --- | --- |
| A | Readiness gate | `scripts/check-truth-readiness.js` | Golden gate, blockers, score integration | targeted readiness tests |
| B | Pipeline integration | `scripts/run-whitepaper-pipeline.js`, `scripts/pipeline-state.js` | Optional node and config resolution | pipeline node tests |
| C | Batch/dashboard metrics | `scripts/run-whitepaper-batch.js`, `scripts/check-batch-acceptance.js`, `scripts/local-dashboard/server.js` | Operator-visible metrics | batch/dashboard tests |
| D | Regression tests/docs | `scripts/system-whitepaper.test.js`, docs checkpoint | Safety and optional behavior coverage | targeted V4 tests |

Coordinator-owned files:

- `package.json`
- `scripts/system-whitepaper.test.js`
- `.agents/4-agent-plan.json`
- V4 spec, plan, checkpoint, and final gate execution

## Task 1: Add V4 Red Tests

**Files:**
- Modify `scripts/system-whitepaper.test.js`

- [ ] Add a test proving truth readiness still passes without Golden Eval when no report exists.
- [ ] Add a test proving truth readiness blocks when Golden Eval is required but missing.
- [ ] Add a test proving truth readiness blocks stale Golden Eval markdown fingerprint.
- [ ] Add a test proving truth readiness blocks Golden Eval overclaim.
- [ ] Add a test proving selected `--with-whitepaper` pipeline nodes include `golden-eval` after `fact-check`.
- [ ] Add a test proving the `golden-eval` pipeline node skips when no golden path is configured.
- [ ] Add a test proving the `golden-eval` pipeline node writes `golden-eval-report.json` when a golden path is provided.
- [ ] Add a test proving dashboard truth snapshot exposes Golden Eval metrics.
- [ ] Run:

```powershell
node --test --test-name-pattern "golden eval.*readiness|pipeline.*golden-eval|dashboard.*golden" scripts/system-whitepaper.test.js
```

Expected: FAIL for missing V4 integration, not syntax errors.

## Task 2: Implement Truth Readiness Golden Gate

**Files:**
- Modify `scripts/check-truth-readiness.js`

- [ ] Import `assertValidGoldenEvalReportArtifact`.
- [ ] Add optional artifact mapping `goldenEval: "golden-eval-report.json"`.
- [ ] Add `goldenEval` to required truth-readiness gate ids.
- [ ] Implement `findStaleGoldenEvalSources(artifacts)`, checking current `pendingReview`, `factCheck`, and golden facts source fingerprints when present.
- [ ] Implement `buildGoldenEvalGate(artifacts, options)` with modes:
  - optional absent => pass, `available=false`, `required=false`;
  - required missing => fail;
  - present => validate contract, stale sources, coverage, critical coverage, and overclaim thresholds.
- [ ] Add blockers:
  - `golden-eval.report-missing`
  - `golden-eval.invalid-artifact`
  - `golden-eval.stale-sources`
  - `golden-eval.coverage-below-threshold`
  - `golden-eval.critical-coverage-below-threshold`
  - `golden-eval.overclaim`
- [ ] Include Golden Eval in score only when required or present.
- [ ] Export `buildGoldenEvalGate` for tests if useful.

## Task 3: Wire Pipeline Golden Eval Node

**Files:**
- Modify `scripts/pipeline-state.js`
- Modify `scripts/run-whitepaper-pipeline.js`
- Modify `scripts/run-whitepaper-batch.js`

- [ ] Add node `{ id: "golden-eval", phase: "compose", label: "评测" }` after `fact-check` and before `quality`.
- [ ] Add artifact `goldenEval: "golden-eval-report.json"`.
- [ ] Include `golden-eval` in full whitepaper node list after `fact-check`.
- [ ] Resolve golden facts path from CLI `--golden`, CLI `--golden-facts`, system `goldenFactsPath`, or system `golden.factsPath`.
- [ ] In `runPipelineNode("golden-eval")`, skip when path is absent.
- [ ] When present, run `scripts/run-golden-eval.js --input <systemOutput> --golden <path> --fact-check <factCheckPath>`.
- [ ] Pass golden required/readiness context into `truth-readiness` when configured.

## Task 4: Surface Metrics In Batch, Delivery, And Dashboard

**Files:**
- Modify `scripts/check-batch-acceptance.js`
- Modify `scripts/run-whitepaper-batch.js`
- Modify `scripts/local-dashboard/server.js`
- Modify `scripts/run-local-e2e-smoke.js`

- [ ] Add `goldenEval` metric summaries from truth-readiness gate:
  - coverage ratio;
  - critical coverage ratio;
  - overclaim count;
  - canPass/pass.
- [ ] Ensure batch acceptance still passes systems without required Golden Eval.
- [ ] Ensure dashboard snapshots expose metrics from `truth-readiness-report.json`.
- [ ] Do not recompute Golden Eval in delivery readiness in V4; delivery follows truth-readiness blockers.

## Task 5: Verification And Checkpoint

**Files:**
- Create `docs/checkpoints/2026-06-10-v4-95-quality-eval-loop-checkpoint.md`

- [ ] Run targeted V4 tests.
- [ ] Run `node scripts/system-whitepaper.test.js`.
- [ ] Run `npm run test:gate:core`.
- [ ] Refresh local ignored `outputs/adp` Golden Eval only if a local golden facts file is created and explicitly used; otherwise do not fabricate ADP golden report.
- [ ] Run `npm run test:gate:full`.
- [ ] Write checkpoint with changed files, commands, results, residual risks, and whether real environment/DB/secrets/outputs were touched.

## Acceptance Criteria

- Golden Eval is formal and blocking when configured.
- Golden Eval is optional and non-blocking when no system golden facts path/report exists.
- Golden facts never enter generation prompts, `whitepaper-plan.json`, or `business-process-model.json`.
- Stale Golden Eval reports cannot pass readiness, batch, or delivery.
- Overclaims block even when required terms are otherwise covered.
- Dashboard/batch surfaces Golden Eval metrics for operators.
