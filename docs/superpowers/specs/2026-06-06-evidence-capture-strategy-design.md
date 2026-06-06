# Evidence Capture Strategy Refactor Design

## Context

The current ADP pilot proved that page-level evidence is not enough for a high-truth whitepaper. The archived ADP run had 5 menus, 5 pages, 94 actions, 4 forms, and 4 tables, but it produced 0 containers, 0 observed flows, and 0 workflow steps. The resulting whitepaper could label weak claims correctly, but it could not explain the real business process.

The root issue is not the writing provider. The root issue is that the collection layer records UI elements but does not reliably convert page interactions into business-flow evidence. A writing model cannot infer a 95%+ truthful process from empty flow artifacts.

## Decision

Use Scheme B first: keep local Playwright as the execution engine and refactor the strategy layer around deterministic page-state evidence.

Do not introduce Browser Use, Stagehand, Crawlee, or any cloud browser dependency in this version. Their design ideas are useful, but this version must avoid new model cost, cloud cost, security review, and extra moving parts.

## Goals

- Capture SPA page-internal forms, wizards, drawers, tabs, and route changes as evidence surfaces when they produce meaningful business deltas.
- Promote only business-operation entry points into observed flows, such as create, edit, configure, generate, execute, upload, import, submit, and publish.
- Keep read-only detail actions such as view and detail as supporting evidence, not primary business flows.
- Block formal narrative generation when flow evidence is structurally missing.
- Preserve the existing safety model: no production writes, no model access to secrets, and no unverified claims promoted to confirmed truth.

## Non-Goals

- No AI browser agent in this version.
- No cloud browser dependency.
- No large-scale crawler migration.
- No direct database access by any model or agent.
- No attempt to make weak evidence sound confident in the whitepaper.

## Architecture

The collection strategy should be split into four deterministic layers.

### 1. Page State Snapshot

Normalize the visible page state before and after a safe click.

The normalized snapshot contains:

- URL and route signature.
- Active frame identity when available.
- Visible heading/title candidates.
- Forms and fields.
- Tables and column signatures.
- Buttons and action labels.
- Containers such as modal, drawer, popup, side panel, and page-internal surfaces.

The snapshot is not a business claim. It is only evidence input.

### 2. Action Classification

Classify click candidates before execution.

Allowed action classes:

- `flow-start`: new, add, create, configure, generate, execute, upload, import.
- `flow-progress`: next, previous, save, submit, confirm, publish, finish, run.
- `read-detail`: view, detail, preview.
- `navigation`: menu and tab navigation.
- `unsafe-write`: delete, remove, disable, approve, reject, pay, settle, send, cancel, close-order.
- `unknown`: visible action without enough semantic signal.

Only safe classes can be clicked during evidence collection. `unsafe-write` must never be clicked by collection.

### 3. Surface Delta Detection

After a safe click, compare before and after snapshots.

A surface is valid only when it has at least one meaningful delta:

- New business fields.
- New flow-progress buttons.
- New table signature.
- New container surface.
- New route plus a meaningful form/table/button delta.

URL-only changes are not enough. Re-rendered list pages are not enough. Existing query fields must not pollute the captured flow surface.

### 4. Flow Evidence Gate

Operation and workflow artifacts must distinguish between page inventory and flow evidence.

Observed flow eligibility requires:

- A business trigger from `flow-start` or a write-like edit/configure action.
- At least one captured surface with fields, flow-progress buttons, table delta, screenshot, or validated safe write result.
- Source references to evidence artifacts.

Read-only detail containers can enrich module descriptions but must not create primary observed flows.

## Data Flow

1. Collect page snapshot.
2. Select safe click candidates.
3. Classify candidate action.
4. Execute candidate in Playwright.
5. Wait for deterministic state change.
6. Collect post-click snapshot.
7. Build delta surface.
8. Merge valid surface into `evidence.json`.
9. Build `operation-spec.json`.
10. Build `workflow-spec.json`.
11. Gate narrative readiness based on flow evidence.

## Artifacts

This version should keep the existing artifact names and add only compatible fields.

- `evidence.json`: may include `captureKind`, `captureScope`, `triggerLabel`, `triggerActionId`, and action classification metadata.
- `operation-spec.json`: must expose observed flows only when flow evidence passes the gate.
- `workflow-spec.json`: must contain steps only when operation flows have usable steps.
- `quality-report.json` or readiness checks: must block formal writing when no observed flows or workflow steps exist.

## Safety Rules

- Collection may click only read-safe or form-opening actions.
- Collection must not click destructive, approval, payment, settlement, deletion, send, cancel, or final-submit actions.
- Write validation remains separate and may mutate only `AI_AUTO_TEST_` records created in the current run.
- Secrets, database credentials, cookies, and private raw samples must not enter prompts, whitepapers, logs intended for review, or packaged artifacts.

## Testing Strategy

Use test-driven changes with fixture-level unit tests before real ADP runs.

Required test coverage:

- Action classification rejects unsafe writes and classifies flow starts.
- Surface delta rejects URL-only changes.
- Surface delta rejects unchanged list pages.
- Surface delta keeps only new fields/buttons/tables.
- Operation spec does not promote read-only details to flows.
- Operation spec separates flows by trigger and source page.
- Narrative/readiness gate blocks formal writing when containers, observed flows, or workflow steps are missing.

Real ADP validation is required after unit tests:

- Fresh reset run against SIT ADP.
- Expected: `containers > 0`.
- Expected: observed operation flows > 0.
- Expected: workflow steps > 0.
- If any expected metric fails, do not run formal narrative generation.

## Implementation Phases

### Phase 1: Deterministic Classifier and Delta Model

Extract pure helpers from the current collector into testable functions. Add unit tests for safe action classes and snapshot deltas.

### Phase 2: Collector Integration

Wire the helpers into `inspectSafeContainers` and related collection paths. Preserve Playwright execution but avoid stale frames after SPA route changes.

### Phase 3: Flow Gate

Update operation/workflow/readiness checks so empty observed flows block formal narrative generation.

### Phase 4: ADP Real-Run Validation

Run ADP from reset, inspect metrics, and only proceed to narrative if flow evidence exists.

## Acceptance Criteria

- Quick gate passes.
- ADP real collection has containers or equivalent page-internal surfaces.
- ADP operation spec has at least one observed flow.
- ADP workflow spec has at least one step.
- Formal narrative generation is blocked when the above evidence is missing.
- No new external service dependency is required.
- No secrets or private connection data enter model prompts or packaged artifacts.
