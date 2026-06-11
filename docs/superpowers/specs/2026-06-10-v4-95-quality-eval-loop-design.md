# V4 95% Quality And Evaluation Loop Design

Date: 2026-06-10

## Purpose

V4 turns the remaining "95%+" goal into a formal, reproducible acceptance loop. The system already gates writable claim coverage, whitepaper-plan required item coverage, observed workflow evidence, business-process model validity, and narrative quality. V4 adds Golden Eval as an optional but hard formal gate when a system has an explicitly configured golden-facts file.

ADP remains a pilot/evaluation system only. Golden facts must never enter generation artifacts, prompts, business-process inference, or whitepaper-plan construction.

## Scope

In scope:

- Treat `golden-eval-report.json` as a first-class optional readiness artifact.
- Run Golden Eval from the pipeline only when a golden facts path is explicitly provided by system config or CLI.
- Add a `goldenEval` truth-readiness gate that blocks formal review when configured golden eval is missing, malformed, stale, under-covered, or has overclaims.
- Surface Golden Eval coverage and overclaim metrics in truth-readiness, batch acceptance, delivery readiness, and dashboard snapshots.
- Add regression tests proving Golden Eval remains evaluation-only and optional for systems without golden config.

Out of scope:

- Creating full ADP golden-facts content.
- Rewriting the Golden Eval scoring algorithm beyond gate integration.
- Making Golden Eval mandatory for all systems.
- Feeding golden facts into Phase3B, `whitepaper-plan.json`, `business-process-model.json`, or any prompt.
- Real ADP/SIT reruns unless explicitly authorized later.

## Artifact Contract

`golden-eval-report.json` already uses:

- `artifactType: "golden-eval-report"`
- `canPass`
- `metrics.coverageRatio`
- `metrics.criticalCoverageRatio`
- `metrics.overclaimCount`
- `thresholds.minCoverageRatio`
- `thresholds.minCriticalCoverageRatio`
- `thresholds.maxOverclaims`
- `sourceArtifacts.markdown`
- `sourceArtifacts.goldenFacts`
- optional `sourceArtifacts.truthModel`
- optional `sourceArtifacts.factCheck`

V4 keeps that contract and adds consumers. The report is valid only if its markdown fingerprint matches the current `whitepaper.pending-review.md` and, when available, its fact-check fingerprint matches current `fact-check-report.json`.

## Readiness Behavior

Truth readiness receives a new optional input:

- `goldenEval: "golden-eval-report.json"`

The gate has three modes:

- `required=false`, no artifact: pass with `available=false`, score 1.
- `required=false`, artifact present: validate and enforce the artifact; stale or failed artifact blocks.
- `required=true`: missing artifact blocks with `golden-eval.report-missing`.

`required=true` is set when:

- CLI/config explicitly provides a golden facts path for the system, or
- a current `golden-eval-report.json` exists in the output directory.

Blocking conditions:

- missing required report: `golden-eval.report-missing`
- invalid report: `golden-eval.invalid-artifact`
- stale source fingerprints: `golden-eval.stale-sources`
- coverage below threshold: `golden-eval.coverage-below-threshold`
- P0/critical coverage below threshold: `golden-eval.critical-coverage-below-threshold`
- overclaim count exceeds max: `golden-eval.overclaim`

Readiness score includes Golden Eval only when the gate is required or the artifact exists. Optional absent Golden Eval does not lower non-ADP systems.

## Pipeline Behavior

`run-whitepaper-pipeline.js` adds a `golden-eval` node after `fact-check` and before `quality` / `truth-readiness`.

The node runs only if a golden facts path is configured or provided:

- CLI: `--golden <path>` or `--golden-facts <path>`
- system config: `goldenFactsPath` or `golden.factsPath`

If no golden facts path exists, the node is skipped and readiness remains optional.

When run, the command equivalent is:

```powershell
node scripts/run-golden-eval.js --input <systemOutput> --golden <goldenFactsPath> --fact-check <systemOutput>/fact-check-report.json
```

Golden facts are not passed to Phase3B, business-process, or whitepaper-plan nodes.

## Batch, Delivery, And Dashboard

Batch acceptance should include per-system Golden Eval metrics when present:

- `goldenEval.coverageRatio`
- `goldenEval.criticalCoverageRatio`
- `goldenEval.overclaimCount`
- `goldenEval.canPass`

Delivery readiness should block when truth-readiness blocks on Golden Eval. It does not need to recompute Golden Eval independently in V4.

Dashboard should expose the same metrics from truth-readiness so operators can see whether the issue is coverage, critical coverage, or overclaim.

## Testing

Required regression tests:

- Truth readiness passes without Golden Eval when no golden artifact/config exists.
- Truth readiness blocks when Golden Eval is required but missing.
- Truth readiness blocks stale Golden Eval markdown source.
- Truth readiness blocks Golden Eval overclaim even if coverage is otherwise high.
- Pipeline selected node list includes `golden-eval` after `fact-check`.
- Pipeline golden-eval node skips without a configured golden facts path.
- Pipeline golden-eval node writes report when a golden path is provided.
- Batch/dashboard snapshots expose Golden Eval metrics without requiring Golden Eval for every system.

## Safety

- No secrets, cookies, tokens, DB credentials, private URLs, or raw samples may be added to golden facts, prompts, reports, or docs.
- Golden facts are evaluation-only. Any code path that injects golden facts into writing prompts or source artifacts for generation is a V4 blocker.
- If real ADP Golden Eval is run later, its report and outputs remain under ignored `outputs/`.
