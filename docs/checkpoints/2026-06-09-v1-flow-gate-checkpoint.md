# V1 Flow Evidence Hard Gate Checkpoint

## Version Target

V1 implements the flow evidence hard gate for the 95%+ truth program. The version target is to prevent formal whitepaper review when business process, workflow, and function summaries are not backed by observed operation flow evidence.

## Branch And Commit

- Coordinator worktree: `D:/核心系统白皮书/skill/system-whitepaper`
- Coordinator branch: `codex/business-process-model`
- Base commit: `fe56179`
- Commit status: not committed in this checkpoint.

## Completed Work

- Added `workflow-spec` to the default and whitepaper pipeline path after `build-spec`.
- Added `workflowSpec` artifact tracking to pipeline state.
- Added truth readiness `workflow` gate with blockers for missing workflow spec, stale workflow lineage, missing operation flows, and missing observed workflow steps.
- Added artifact contract coverage so `truth-readiness-report.json` must include the `workflow` gate.
- Added local smoke truth readiness compatibility for the new workflow gate.
- Expanded regression coverage for workflow evidence, stale workflow specs, pipeline node selection, pipeline state migration, approval guard recomputation, dashboard readiness, batch retry classification, and local smoke approval flows.
- Added V1.1 batch-governance fixes:
  - `--with-whitepaper` batch node list now includes `business-process` and `workflow-spec`.
  - Batch refresh preserves a completed partial rerun instead of downgrading it to queued when the per-system pipeline is pending only because unselected historical nodes remain pending.
  - Batch terminal checks now lazy-load acceptance/delivery/real-run modules to avoid Node circular dependency warnings on stderr.

Changed source files:

- `scripts/check-truth-readiness.js`
- `scripts/pipeline-state.js`
- `scripts/run-local-e2e-smoke.js`
- `scripts/run-whitepaper-batch.js`
- `scripts/run-whitepaper-pipeline.js`
- `scripts/system-whitepaper.test.js`

Related planning and governance files are present in the working tree:

- `docs/95-plus-truth-iteration-master-plan-2026-06-09.md`
- `docs/superpowers/specs/2026-06-09-v1-flow-evidence-hard-gate-design.md`
- `docs/superpowers/plans/2026-06-09-v1-flow-evidence-hard-gate.md`

## Worker Handoffs

No worker agents were used for this checkpoint. The user explicitly preferred single-agent execution while another project was running multi-agent work.

## Verification

- `node --test --test-name-pattern "stale workflow spec" scripts/system-whitepaper.test.js`: exited 0. Result: targeted stale workflow spec regression passed.
- `node --test --test-name-pattern "truth readiness report artifact contract|truth readiness .*workflow|operation flows are missing|observed workflow steps are missing|stale workflow spec" scripts/system-whitepaper.test.js`: exited 0. Result: 5 targeted truth/workflow regressions passed.
- `node --test --test-name-pattern "pipeline default node list|pipeline state includes workflow-spec|pipeline workflow-spec node|pipeline state initializes truth phase|pipeline state migrates" scripts/system-whitepaper.test.js`: exited 0. Result: 4 targeted pipeline/state regressions passed.
- `node --test --test-name-pattern "workflow|truth readiness|pipeline default node list|pipeline state includes workflow-spec|pipeline workflow-spec node|pipeline state initializes truth phase|pipeline state migrates" scripts/system-whitepaper.test.js`: exited 0. Result: 51 targeted workflow/truth/pipeline tests passed.
- `node --test --test-name-pattern "manual phase3b provider writes prompt|reconcilePipelineStateFromArtifacts clears stale narrative|dashboard snapshot summarizes all registered systems|dashboard snapshot regenerates missing docx|dashboard snapshot marks manual review node|batch runner classifies failed children|word exporter approval guard|approved review creates final markdown|approved review tolerates malformed optional pipeline state|local e2e smoke approves copied adp|local e2e smoke ignores non-object" scripts/system-whitepaper.test.js`: exited 0. Result: 11 targeted integration regressions passed.
- `node --test --test-name-pattern "dashboard snapshot marks stale truth readiness|dashboard snapshot exposes writable claim coverage gaps|approved review recomputes current truth readiness|approved review rejects smoke truth readiness|approved review rejects smoke wording" scripts/system-whitepaper.test.js`: exited 0. Result: 5 previously failing dashboard/approval regressions passed.
- `npm test *> .tmp\npm-test-v2.log`: exited 0. Result: 402 tests passed, 0 failed.
- `npm run test:gate:auto -- --dry-run`: sandbox run failed with `spawnSync git EPERM`; rerun outside sandbox exited 0. Result: selected `level=full`, `command=npm run test:gate:full`, reasons `real-run-or-readiness,script-change,core-source`.
- `npm run test:gate:full *> .tmp\test-gate-full-v2.log`: exited 1. Result: `test:gate:core` portion completed with `npm test` 402/402, `pack:check`, and `agent:isolation` before failing at `truth:readiness`.

Full gate blocker:

- `npm run truth:readiness` wrote `outputs/adp/truth-readiness-report.json`.
- Current ADP readiness is `35%`, `canSubmitReview=false`.
- Current blockers are `claims.missing-writable`, `fact-check.writable-coverage`, `narrative.quality`, `workflow.spec-missing`, and `truth.score-below-threshold`.
- Specific V1-relevant blocker: `workflow-spec.json` is missing and observed workflow steps are `0`.

Post-gate safe refresh:

- `node scripts/build-evidence-summary.js --input outputs/adp/evidence.json`: exited 0 and wrote `outputs/adp/evidence-summary.json`.
- `node scripts/build-workflow-spec.js --input outputs/adp`: exited 0 and wrote `outputs/adp/workflow-spec.json`; result `workflows=5 observed=5 candidates=0 steps=5`.
- `node scripts/build-function-universe.js --input outputs/adp`: exited 0 and wrote `outputs/adp/function-universe.json`.
- `node scripts/build-verified-claims.js --input outputs/adp`: exited 0 and wrote `outputs/adp/verified-claims.json`.
- `npm run truth:readiness *> .tmp\truth-readiness-after-refresh.log`: exited 1. Result: ADP readiness improved to `60%`, `canSubmitReview=false`; workflow and claims gates scored `100%`, while fact-check, narrative, and lineage remained blocked.
- Remaining blockers after safe refresh: `fact-check.stale-sources`, `narrative.stale-sources`, `truth.lineage-stale`, and `truth.score-below-threshold`.

Post-writing and V1.1 recovery:

- `node scripts/build-business-process-model.js --input outputs/adp`: exited 0. Result: `processes=1 steps=7 confidence=low`.
- `node scripts/generate-whitepaper.js --input outputs/adp/evidence.json`: exited 0.
- `node scripts/run-phase3b.js --system adp --config config/systems.local.yaml *> .tmp\phase3b-adp.log`: exited 0. Result: generated `outputs/adp/whitepaper.pending-review.md` and `outputs/adp/narrative-fragments.md` through the configured AI provider; no manual writing was used.
- `node scripts/fact-check-whitepaper.js --input outputs/adp`: exited 0. Result: `canFinalize=true`, writable claim coverage `9/9`.
- `node scripts/check-narrative.js --input outputs/adp`: exited 0. Result: `canSubmitReview=true`.
- `node scripts/build-operation-spec.js --config config/systems.local.yaml --system adp`: exited 0 and refreshed deterministic operation spec and guide gate.
- `node scripts/build-workflow-spec.js --input outputs/adp`: exited 0. Result: `workflows=5 observed=5 candidates=0 steps=5`.
- `node scripts/build-business-process-model.js --input outputs/adp`: exited 0. Result: `processes=1 steps=7 confidence=low`.
- `node scripts/build-function-universe.js --input outputs/adp`: exited 0.
- `node scripts/build-verified-claims.js --input outputs/adp`: exited 0.
- `node scripts/fact-check-whitepaper.js --input outputs/adp`: exited 0.
- `node scripts/check-quality.js --input outputs/adp`: exited 0. Result: menu coverage `4/4`, pages `6`, actions `107`, operation guide gate `100`.
- `node scripts/check-narrative.js --input outputs/adp`: exited 0.
- `npm run truth:readiness *> .tmp\truth-readiness-adp-final-candidate.log`: exited 0. Result: ADP truth readiness `100%`, `canSubmitReview=true`, `canFinalize=true`; evidence, workflow, claims, fact-check, narrative, and lineage gates all passed.
- `node --test --test-name-pattern "batch runner preserves completed partial reruns|batch runner|batch acceptance report gates|packed skill can load packaged entrypoints|whitepaper batch runner selects systems" scripts/system-whitepaper.test.js *> .tmp\batch-pack-tests-v2.log`: exited 0.
- `node scripts/run-whitepaper-batch.js --config config/systems.local.yaml --systems adp --nodes quality,truth-readiness --concurrency 1 *> .tmp\batch-refresh-quality-truth-v2.log`: exited 0. Result: batch run-state `status=success`, completed `1/1`, repair queue empty.
- `npm run batch:acceptance *> .tmp\batch-acceptance-v3.log`: exited 0. Result: `status=accepted`, accepted `1/1`, minTruth `100%`.
- `npm run test:gate:core *> .tmp\test-gate-core-v1-1.log`: exited 0. Result: `npm test`, `pack:check`, and `agent:isolation` passed.
- `npm run test:gate:full *> .tmp\test-gate-full-v4.log`: exited 1. Result: source/core, truth readiness, and batch acceptance passed; the gate stopped at `delivery:check`.

Formal delivery completion:

- `node scripts/run-whitepaper-pipeline.js --config config/systems.local.yaml --system adp --nodes truth-universe,truth-claims,business-process,build-spec,workflow-spec,compose-guide,draft,summary,narrative,fact-check,quality,truth-readiness --provider cursor-sdk`: initially exited 1 at `fact-check` because the AI draft introduced unsupported `### 跨模块质量与回流能力`.
- Source fix added: phase3b assembly now demotes unsupported `## 3. 核心功能说明` subheadings to bold body text unless the heading is backed by verified claim module/function/entity/subject terms.
- `node --test --test-name-pattern "phase3b assembly demotes unsupported core headings" scripts/system-whitepaper.test.js`: red first, then exited 0 after the fix.
- `node --test --test-name-pattern "phase3b assembly|phase3b part assembly|manual phase3b provider|fact check|truth readiness passes only" scripts/system-whitepaper.test.js`: exited 0.
- `node scripts/run-phase3b.js --system adp --config config/systems.local.yaml --provider manual`: exited 0. Result: reassembled existing fragments with the stricter heading sanitizer; no manual writing was used.
- `node scripts/run-whitepaper-pipeline.js --config config/systems.local.yaml --system adp --nodes summary,build-spec,workflow-spec,compose-guide,truth-universe,truth-claims,business-process,fact-check,quality,truth-readiness --provider cursor-sdk`: exited 0. Result: lineage restored, fact-check/quality/truth readiness passed.
- `node scripts/run-review-decision.js --input outputs/adp --status approved --system-code adp --system-name "AI保单数据闭环平台"`: exited 0. Result: generated `whitepaper.final.md`, display final Markdown, Word `.docx`, and docx manifest.
- `node scripts/run-whitepaper-batch.js --config config/systems.local.yaml --systems adp --nodes truth-readiness --concurrency 1`: exited 0. Result: refreshed batch aggregate after approval.
- `npm run batch:acceptance *> .tmp\batch-acceptance-after-refresh.log`: exited 0. Result: `status=accepted`, accepted `1/1`, minTruth `100%`.
- `npm run delivery:check *> .tmp\delivery-check-after-refresh.log`: exited 0. Result: `status=ready`, ready `1/1`, smoke `0`.
- `npm run real:check *> .tmp\real-check-after-refresh.log`: exited 0. Result: `status=in-progress`, `canStart=true`. This gate checks real-run start readiness; `canDeliver=false` remains informational when no new real batch run is being started.
- `npm run test:gate:full *> .tmp\test-gate-full-final.log`: exited 0. Result: full gate passed: core, truth readiness, batch acceptance, delivery readiness, and real-run readiness.

## Residual Risk

- V1 source implementation is covered by automated tests, and the current ADP final artifact reaches `100%` truth readiness with no truth blockers.
- Full release readiness now passes locally via `npm run test:gate:full`.
- `pipeline-state.json` still has optional database nodes pending because `databaseProfile.enabled` is false for ADP; delivery readiness treats the system as ready because required real nodes, review approval, final Markdown, and Word manifest are current.
- All generated ADP evidence, narrative, batch, and delivery reports are ignored runtime artifacts and are not source deliverables.
- The formal approval was executed through `scripts/run-review-decision.js`; no whitepaper body or final artifact was hand-written.

## Environment And Data Safety

- No worker agents were spawned.
- No Browser Use, Stagehand, or Crawlee integration was added.
- No secrets, cookies, tokens, database passwords, or raw database data were added to prompts, code, tests, or docs.
- The full gate wrote an ignored runtime report under `outputs/adp/truth-readiness-report.json`. Source changes do not commit generated evidence or runtime outputs.
- Database evidence remains script-only and redacted; model code does not connect directly to a database.

## Next Step

Next step:

1. Review the source diff and decide whether to commit V1/V1.1 as one commit or split governance/pipeline fixes from documentation.
2. Move to V2 planning/execution after preserving the current checkpoint and generated runtime artifacts outside source control.
