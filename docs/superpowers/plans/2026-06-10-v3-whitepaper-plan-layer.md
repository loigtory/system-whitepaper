# V3 Whitepaper Plan Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Current coordinator recommendation: execute inline with one agent because another project is using multi-agent capacity.

**Goal:** Add a deterministic `whitepaper-plan.json` writing contract so AI narrative generation and gates are controlled by evidence-backed required items instead of free organization across raw artifacts.

**Architecture:** Add a focused plan builder script, wire it into Phase3B, fact/narrative gates, truth-readiness, and pipeline state. Keep the plan generic, source-fingerprinted, deterministic, and free of secrets/raw evidence. Existing upstream artifacts remain the source of truth.

**Tech Stack:** Node.js CommonJS, `node:test`, existing pipeline artifacts (`verified-claims.json`, `business-process-model.json`, `workflow-spec.json`, `operation-spec.json`, `evidence-summary.json`), existing fact-check/narrative/truth-readiness gates.

---

## File Structure

- Create `scripts/build-whitepaper-plan.js`: deterministic plan artifact builder, validator, source fingerprints, content hash, CLI.
- Modify `scripts/narrative/phase3b.js`: load and compact plan, inline it before fallback artifacts, pass plan to part prompts.
- Modify `scripts/fact-check-whitepaper.js`: assess required plan item coverage in pending-review markdown.
- Modify `scripts/check-narrative.js`: include plan source fingerprint and narrative required-item coverage.
- Modify `scripts/check-truth-readiness.js`: add `whitepaperPlan` artifact/gate, stale-source and recompute validation, blocker mapping.
- Modify `scripts/pipeline-state.js`: add `whitepaper-plan` node and artifact label.
- Modify `scripts/run-whitepaper-pipeline.js`: run plan node after `business-process`, pass plan path into narrative.
- Modify `scripts/run-whitepaper-batch.js`: include the node in full whitepaper and repair allowlists.
- Modify `scripts/run-local-e2e-smoke.js`: include whitepaper plan in smoke readiness inputs when present.
- Modify `scripts/system-whitepaper.test.js`: red/green tests for builder, prompt, gate, and pipeline.
- Modify `package.json`: include the builder script in package output if needed by package file allowlist.
- Create `docs/checkpoints/2026-06-10-v3-whitepaper-plan-layer-checkpoint.md` after verification.

## 4-Agent Split For Later

| Agent | Role | Write Scope | Handoff | Verification |
| --- | --- | --- | --- | --- |
| A | Plan builder/contract | `scripts/build-whitepaper-plan.js`, builder tests | Schema, source lineage, deterministic hash | plan builder targeted tests |
| B | Prompt integration | `scripts/narrative/phase3b.js`, prompt tests | Compact plan and prompt rules | phase3b prompt targeted tests |
| C | Gate integration | `scripts/fact-check-whitepaper.js`, `scripts/check-narrative.js`, `scripts/check-truth-readiness.js` | Required-item coverage and readiness blockers | fact/narrative/readiness targeted tests |
| D | Pipeline/batch integration | `scripts/pipeline-state.js`, `scripts/run-whitepaper-pipeline.js`, `scripts/run-whitepaper-batch.js` | Node ordering and retry allowlists | pipeline/batch targeted tests |

Coordinator-owned files:

- `package.json`
- `scripts/system-whitepaper.test.js`
- `.agents/4-agent-plan.json`
- V3 spec, plan, checkpoint, and final gate execution

## Task 1: Add V3 Red Tests

**Files:**
- Modify `scripts/system-whitepaper.test.js`

- [ ] Add tests proving `buildWhitepaperPlan` produces version 1 with source artifacts, chapters, required items, pending items for non-writable claims, and no ADP vocabulary for a generic fixture.
- [ ] Add tests proving `assertValidWhitepaperPlanArtifact` rejects missing content hash and forbidden secret/URL-like content.
- [ ] Add tests proving Phase3B prompt inlines `whitepaper-plan` and states it is the primary writing contract.
- [ ] Add tests proving fact-check reports missing required plan items.
- [ ] Add tests proving truth-readiness blocks missing or forged `whitepaper-plan.json`.
- [ ] Add tests proving pipeline state and `--with-whitepaper` order include `whitepaper-plan` after `business-process` and before `draft`/`narrative`.
- [ ] Run:

```powershell
node --test --test-name-pattern "whitepaper plan|Phase3B prompt inlines whitepaper plan|truth readiness blocks missing whitepaper plan|pipeline state includes whitepaper-plan" scripts/system-whitepaper.test.js
```

Expected: FAIL for missing V3 behavior, not syntax errors.

## Task 2: Implement `build-whitepaper-plan.js`

**Files:**
- Create `scripts/build-whitepaper-plan.js`

- [ ] Implement `fingerprintFile`, `sourceArtifact`, `stableJson`, `hashWhitepaperPlanContent`, and `assertValidWhitepaperPlanArtifact`.
- [ ] Implement `buildWhitepaperPlan(input)` using only compact current artifacts:
  - writable verified claims -> body `requiredItems` and `allowedFacts`;
  - non-writable/weak claims -> `pendingItems`;
  - business-process model processes -> Chapter 4 required items with status/boundary terms;
  - module responsibilities -> Chapters 2 and 3 required items;
  - workflow steps -> Chapter 4 observed-step allowed facts;
  - operation/evidence modules -> fallback module required items.
- [ ] Reject serialized content matching `password|secret|token|cookie|jdbc:|mysql://|postgres://|http://|https://`.
- [ ] Add `buildWhitepaperPlanFromDir(inputDir, options)` and CLI:

```powershell
node scripts/build-whitepaper-plan.js --input outputs/system
```

- [ ] Export builder, validator, source builder, hash helper, and `main`.

## Task 3: Wire Plan Into Phase3B

**Files:**
- Modify `scripts/narrative/phase3b.js`

- [ ] Add `whitepaperPlanPath` to resolved paths.
- [ ] Add `loadWhitepaperPlan`, `compactWhitepaperPlan`, and inline JSON in full and part prompts.
- [ ] Put plan instructions before fallback artifact instructions.
- [ ] Keep fallback artifacts available only as support when the plan is absent or incomplete.
- [ ] Ensure non-writable claim ids are not exposed as body citation markers.

## Task 4: Add Plan Coverage Gates

**Files:**
- Modify `scripts/fact-check-whitepaper.js`
- Modify `scripts/check-narrative.js`

- [ ] Add reusable required-item coverage assessment by `terms` and explicit writable `[claim:<id>]` markers.
- [ ] Fact-check should include `planCoverage`, `coveredPlanItemIds`, `missingPlanItemIds`, and fail when coverage is below threshold.
- [ ] Narrative quality should read optional `whitepaper-plan.json`, include source fingerprint, and fail when required plan items are missing from body sections.
- [ ] Missing plan file should be a warning in standalone narrative checks, while truth-readiness is the hard formal blocker.

## Task 5: Add Truth Readiness And Pipeline Integration

**Files:**
- Modify `scripts/check-truth-readiness.js`
- Modify `scripts/pipeline-state.js`
- Modify `scripts/run-whitepaper-pipeline.js`
- Modify `scripts/run-whitepaper-batch.js`
- Modify `scripts/run-local-e2e-smoke.js`

- [ ] Add optional artifact `whitepaperPlan: "whitepaper-plan.json"`.
- [ ] Add required gate `whitepaperPlan` to truth-readiness contract.
- [ ] Validate plan artifact, source freshness, deterministic recomputation, and required coverage.
- [ ] Map blockers:
  - `whitepaper-plan.spec-missing`
  - `whitepaper-plan.spec-invalid`
  - `whitepaper-plan.lineage-stale`
  - `whitepaper-plan.forged-plan`
  - `whitepaper-plan.required-coverage`
- [ ] Add pipeline node `whitepaper-plan` after `business-process` and before `draft`.
- [ ] Pass `whitepaperPlanPath` into narrative node.

## Task 6: Verification And Checkpoint

**Files:**
- Create `docs/checkpoints/2026-06-10-v3-whitepaper-plan-layer-checkpoint.md`

- [ ] Run targeted V3 tests.
- [ ] Run `node scripts/system-whitepaper.test.js`.
- [ ] Run `npm run test:gate:core`.
- [ ] Run `npm run test:gate:full` because pipeline/readiness/formal delivery behavior changes.
- [ ] Run `npm run pack:check` if the package file set changed.
- [ ] Write checkpoint with changed files, commands, results, residual risks, and whether real environment/DB/secrets/outputs were touched.

## Acceptance Criteria

- `whitepaper-plan.json` is deterministic, validated, source-fingerprinted, and packaged.
- Phase3B prompt treats `whitepaper-plan` as the primary writing contract.
- Fact/narrative gates report plan required-item coverage.
- Truth readiness blocks missing, stale, malformed, forged, or under-covered plans.
- Pipeline and batch full-whitepaper runs include `whitepaper-plan`.
- No generated prompt, whitepaper, docs, or tests contain secrets, DB credentials, private URLs, cookies, raw samples, or real customer artifacts.
