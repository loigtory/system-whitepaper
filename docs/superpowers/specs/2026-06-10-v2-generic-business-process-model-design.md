# V2 Generic Business Process Model Design

## Context

V1 made workflow evidence a hard readiness gate. V2 addresses the next P0 gap: `business-process-model.json` must become a generic, evidence-driven business-process abstraction instead of an ADP-shaped model.

ADP is only the pilot and golden evaluation system. Later targets include finance, HR, internal foundation platforms, approval tools, reporting systems, integration consoles, and other internal applications. The default model must therefore infer business objects, status signals, module responsibilities, and process boundaries from generic evidence patterns, not from ADP vocabulary.

The current `scripts/build-business-process-model.js` still contains default rules and output text for "保司", "AI任务", "元数据", "发布上线", and "运行观测". That is useful for the pilot, but unsafe as default behavior for broad system whitepaper generation.

## Decision

Implement V2 as a generic business-process model release:

- Remove ADP-specific vocabulary from the default builder path.
- Add a domain-neutral inference layer that works from modules, fields, row actions, workflow steps, operation flows, evidence-summary functions, verified claims, and redacted DB-derived metadata when present.
- Add an optional domain profile mechanism that can enhance labels or process templates only when explicitly configured.
- Add a business-process artifact contract and readiness gate so forged, stale, unsupported, or source-less process models cannot support formal review.
- Preserve `observed`, `inferred`, `candidate`, and `pending` statuses through model generation, prompt compaction, and narrative quality checks.

The mature governance pattern is the same one V1 used for `workflow-spec`: deterministic artifact generation, source fingerprints, contract validation, stale-source detection, blocker ids, improvement actions, and TDD fixtures that prove negative cases fail.

## Goals

- Default business-process output must be reusable across ADP, finance, HR, internal foundation, workflow, reporting, and integration systems.
- Non-ADP fixtures must not emit ADP terms unless those exact terms are present in the fixture evidence or an explicit domain profile is supplied.
- Every business object, state group, module responsibility, process, feedback loop, and process step must carry evidence/source references.
- `status="observed"` may only come from observed operation/workflow evidence. Inferred cross-module ordering must remain `status="inferred"` or `status="partially-observed"`.
- `truth-readiness-report.json` must include a `businessProcess` gate and block review when `business-process-model.json` is missing, malformed, stale, forged, or contains process steps without evidence.
- Optional DB metadata remains script-only and redacted. It may support generic object/entity hints through derived artifacts, but secrets and raw database data must not enter prompts or whitepapers.

## Non-Goals

- No Browser Use, Stagehand, Crawlee, or non-local browser automation.
- No AI-provider inference for business-process facts. AI may write prose later, but V2 model generation stays deterministic.
- No ADP golden facts in generation input. Golden facts remain evaluation-only.
- No hardcoding of finance, HR, ADP, or other system-specific process paths in the default builder.
- No weakening of V1 workflow gate, fact-check gate, narrative gate, DB safety checks, or approval guard.
- No real ADP/SIT reset is required for unit implementation. Real-run validation remains a checkpoint activity after source gates pass.

## Architecture

### 1. Generic Evidence Normalization

`scripts/build-business-process-model.js` should normalize input evidence into module records from:

- `operation-spec.json`: modules, fields, row actions, screenshots, APIs, observed flows, planned flows.
- `workflow-spec.json`: observed workflow steps and candidate workflows.
- `evidence-summary.json`: functions, modules, menu paths, screenshots, page summaries.
- `verified-claims.json`: confirmed writable module/function/entity/operation claims.
- Optional redacted DB-derived artifacts: only if already produced by scripts and source-fingerprinted; never through direct model DB access.

Each normalized record must keep source pointers, evidence refs, and confidence hints. Missing optional inputs should degrade confidence, not fabricate conclusions.

### 2. Domain-Neutral Inference Rules

Default rules should infer generic categories rather than named domain chains:

- Business objects: `work-item`, `record`, `master-data`, `configuration`, `transaction`, `approval-item`, `report`, `metric`, `integration-endpoint`, `identity-access`, `notification`, `batch-job`, `audit-log`, and `unknown`.
- State signals: fields or filters containing lifecycle, approval, processing, result, quality, risk, exception, progress, enabled/disabled, validity, completion, and classification meanings.
- Module responsibilities: derived from module name, business hint, fields, row actions, workflow participation, and verified claims.
- Process step roles: `capture-input`, `maintain-config`, `submit-or-create`, `review-or-approve`, `validate-or-check`, `execute-or-sync`, `publish-or-enable`, `monitor-or-report`, `correct-or-retry`, and `archive-or-close`.

Generic ordering is allowed only as an inferred process skeleton. Observed steps from `workflow-spec.json` keep observed status and may anchor the skeleton. Cross-module sequence without observed cross-module flow remains inferred and must include a boundary.

### 3. Optional Domain Profile

Domain profiles are explicit enhancement inputs, not default behavior. A profile may map generic object categories or process roles to local vocabulary, but only when passed by configuration or CLI option.

Profile constraints:

- It must be a JSON artifact with `artifactType="business-process-domain-profile"`.
- It must contain a stable `profileId`.
- It must not contain secrets, URLs, credentials, cookies, raw samples, private customer records, or DB connection data.
- It must be source-fingerprinted when used.
- It must not override evidence requirements or promote inferred steps to observed.

ADP-specific vocabulary belongs in a profile or evaluation fixture. The default builder must pass negative tests without that vocabulary.

### 4. Artifact Contract

`business-process-model.json` version 2 should include:

- `artifactType: "business-process-model"`.
- `version: 2`.
- `generatedAt`.
- `system`.
- `sourceArtifacts`.
- `derivation`: builder name, algorithm version, optional profile id, source hash, model content hash.
- `businessObjects`.
- `states`.
- `moduleResponsibilities`.
- `processes`.
- `feedbackLoops`.
- `pending`.
- `metrics`.
- `confidence`.
- `rules`.

Contract requirements:

- Source artifacts must include current operation-spec, evidence-summary, and verified-claims fingerprints. If workflow-spec exists, it must also be recorded.
- Every non-empty generated array item must have stable `id`, `source`, `evidence`, `confidence`, and `reasoning` when the item is an inference.
- Every process step must have `id`, `order`, `name`, `status`, `source`, `evidence`, `confidence`, and `boundary` when not observed.
- `status` values are limited to `observed`, `partially-observed`, `inferred`, `candidate`, and `pending`.
- `observed` requires observed workflow/operation evidence.
- `contentHash` must be recomputable from deterministic model content, excluding volatile timestamps.

### 5. Readiness Gate

Truth readiness adds `gates.businessProcess`.

Pass criteria:

- `business-process-model.json` exists for formal review.
- Artifact contract is valid.
- Source fingerprints match current inputs.
- Deterministic recomputation from current inputs produces the same model content hash.
- At least one business object or module responsibility is supported by evidence.
- If processes exist, every process and step has evidence/source and a valid status.
- No default ADP vocabulary appears unless present in source evidence or an explicit profile source is recorded.

Failure blocker ids:

- `business-process.spec-missing`
- `business-process.spec-invalid`
- `business-process.lineage-stale`
- `business-process.forged-model`
- `business-process.steps-missing-evidence`
- `business-process.default-domain-leak`

Suggested rerun nodes:

```text
build-spec, workflow-spec, business-process, narrative, fact-check, quality, truth-readiness
```

### 6. Narrative And Prompt Safety

`phase3b` may continue to consume compacted `business-process-model`, but the compacted object must preserve:

- model version and derivation status,
- process and step status,
- boundaries for inferred/candidate items,
- source/evidence summaries,
- profile id when a profile is explicitly used.

Prompt rules should continue to say that AI must not promote inferred flow into observed fact. V2 does not introduce free-form AI process inference.

### 7. Data Flow

```text
operation-spec + workflow-spec + evidence-summary + verified-claims
  -> generic business-process builder
  -> business-process-model.json v2
  -> phase3b compact prompt input
  -> narrative quality coverage check
  -> fact-check / truth-readiness businessProcess gate
```

Optional profile flow:

```text
domain-profile.json
  -> explicit builder input
  -> recorded sourceArtifacts.domainProfile
  -> profileId in derivation
  -> no observed-status promotion
```

## Testing Strategy

Use TDD and fixture-driven tests:

- Generic finance fixture: produces generic object/process categories and no ADP vocabulary.
- Generic HR fixture: produces employee/approval-like evidence only from fixture text, not ADP defaults.
- Internal foundation fixture: produces identity/access/configuration/monitoring-like generic categories from evidence.
- ADP-like fixture without profile: outputs evidence-derived ADP terms only where source evidence contains them, while process template remains generic.
- Explicit profile fixture: profile labels are applied only when passed as input and recorded in source artifacts.
- Forged model fixture: current source fingerprints but altered process content is blocked by readiness recomputation.
- Missing step evidence fixture: readiness blocks process steps with no evidence/source.
- Stale workflow fixture: readiness blocks a business-process model recorded against an older workflow spec.

## Acceptance Criteria

- `buildBusinessProcessModel` no longer emits ADP-specific default process names for non-ADP fixtures.
- `business-process-model.json` contract validation is exported and covered by unit tests.
- `truth-readiness-report.json` includes `gates.businessProcess`.
- Forged and stale business-process models cannot produce `canSubmitReview=true`.
- A valid current model with observed workflow evidence and generic inferred boundaries can pass the new business-process gate.
- Existing V1 workflow readiness tests still pass.
- `npm run test:gate:core` passes after implementation; `npm run test:gate:full` is required before release or real delivery claims.

## Open Design Choices

- Default generic process ordering should be conservative. If a module cannot be classified into a process role, it should remain a module responsibility and pending item instead of being forced into an end-to-end chain.
- Domain profiles should start as local JSON inputs rather than packaged built-ins. This prevents pilot vocabulary from silently becoming default behavior.
- V2 should not attempt full whitepaper-plan control. That belongs to V3.
