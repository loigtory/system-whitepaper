# V5 Real Batch Delivery Stability Checkpoint

Date: 2026-06-11

## Scope

- Added generic batch diagnosis taxonomy for truth-readiness gate gaps:
  - `workflow-evidence`
  - `business-process`
  - `whitepaper-plan`
  - `golden-eval`
- Exposed truth gate summaries in local dashboard snapshots for workflow, business process, whitepaper plan, and Golden Eval metrics.
- Preserved `golden-eval` in batch acceptance and delivery readiness rerun chains that rewrite or fact-check whitepaper content.
- Updated writable-claim repair queue rerun chain to `narrative -> fact-check -> golden-eval -> quality -> truth-readiness`.
- Ran a fresh ADP reset batch and fixed a generic portal-homepage evidence gap found during the run.

## V5.2 Fresh Run Finding

Initial fresh reset batch command:

```powershell
npm run batch -- --systems adp --reset --concurrency 1
```

The first fresh run collected the homepage successfully but failed at `build-spec` because the collected UI only contained the portal homepage and no second-level business menus. The visible homepage included business/process cards, but the pipeline did not preserve those cards as structured evidence, so the operation-spec module gate saw `moduleCount=0`.

Root cause:

- Portal-style systems can expose business capabilities as homepage overview cards instead of navigable menu leaves.
- Those cards are valid read-only UI evidence when backed by page text and screenshot evidence.
- The prior collector and frame merge path dropped this structure, so downstream business-flow inference had no evidence-bound source.

## Generic Fix

- `scripts/collect-evidence.js`
  - Extracts homepage overview cards from structured DOM headings and visible page text.
  - Keeps the logic read-only; no write action or synthetic operation is created.
- `scripts/system-whitepaper-lib.js`
  - Preserves `overviewCards` on page evidence.
  - Emits `homeOverview` in `evidence-summary.json`.
  - Preserves overview cards when merging frame snapshots.
- `scripts/operation-spec/lib.js`
  - Derives bounded business-flow modules from homepage overview cards.
  - Marks derived modules with `source=home-overview-card` and flow status `inferred-from-home-overview`.
  - Keeps the inference evidence-bound and screenshot-backed; it does not claim observed write operations.
- `scripts/system-whitepaper.test.js`
  - Added coverage for homepage overview extraction, evidence summary preservation, frame merge preservation, and operation-spec derivation.

This is intentionally generic for portal-like systems beyond ADP, such as finance, HR, and internal foundation systems that expose workflow cards before menu navigation is available.

## Fresh Run Result

Final fresh reset batch command:

```powershell
npm run batch -- --systems adp --reset --concurrency 1
```

Result:

- Batch: `success`
- System state after fresh batch: `review-pending`
- Acceptance: `accepted`
- Repair queue: empty
- Truth readiness: `100%`
- Can submit review: yes
- Can finalize: yes
- Delivery readiness before approval: blocked by review/final-delivery boundary only

ADP operation-spec after the fix:

- `moduleCount=8`
- 7 business-flow modules derived from homepage overview cards
- Derived modules are screenshot-backed and labeled as `inferred-from-home-overview`
- No missing writable-claim blocker

Truth-readiness gates after the fresh run:

- evidence: `100%`
- workflow: `100%`
- claims: `100%`
- factCheck: `100%`
- narrative: `100%`
- businessProcess: `100%`
- whitepaperPlan: `100%`
- goldenEval: `100%` with warning because no golden facts are configured
- database: warning only because database evidence is not enabled
- lineage: `100%`

## Delivery Boundary

`npm run real:check -- --systems adp` after the fresh run reports:

- status: `blocked`
- canStart: yes
- canDeliver: no
- blockers: none in real-run readiness itself
- warning: database evidence is not enabled, so the run relies on UI evidence

`delivery:check` blocks final delivery with expected P0 review/finalization gates:

- `delivery.final-missing`: final whitepaper Markdown is required for delivery.
- `delivery.review-not-approved`: final delivery requires approved review state or review decision.

No automatic review approval or final delivery generation was performed in this checkpoint.

## Final Approval And Delivery

After explicit continuation approval, the ADP pending-review artifact was approved through the deterministic review decision path:

```powershell
node scripts/run-review-decision.js --input outputs/adp --status approved
```

Result:

- Pipeline overall status: `finalized`
- Review status: `approved`
- Final Markdown: generated
- Named final Markdown: generated
- Word `.docx`: generated
- Word manifest: generated
- Truth readiness remained `100%`

Final delivery gate result:

- Delivery readiness: `ready`
- Systems ready: `1/1`
- Final whitepapers: `1`
- Current Word outputs: `1/1`
- Blockers: `0`
- Warnings: `0`

Final real-run readiness result:

- Status: `ready`
- canStart: yes
- canDeliver: yes
- Blockers: `0`
- Warning: database evidence is not enabled, so the run relies on UI evidence.

## Verification

- `node --check scripts/collect-evidence.js` passed.
- `node --check scripts/system-whitepaper-lib.js` passed.
- `node --check scripts/operation-spec/lib.js` passed.
- `node --test --test-name-pattern "home overview cards|portal workflow modules|home overview text parser|mergeFrameSnapshots preserves" scripts/system-whitepaper.test.js` passed.
- `node --test --test-name-pattern "mergeFrameSnapshots|mergePageSnapshotIntoEvidence|selectMenusForCollection|isCollectibleMenu|computeEvidenceMetrics|build evidence summary|operation spec|operation guide|workflow-spec node|collect evidence" scripts/system-whitepaper.test.js` passed.
- `node --test scripts/system-whitepaper.test.js` passed: 433/433 tests.
- `npm run pack:check` passed.
- `npm run test:gate:core` passed.
- `npm run test:gate:full` before approval partially passed and then stopped at `delivery:check`:
  - package checks passed
  - agent isolation passed
  - truth readiness passed at `100%`
  - batch acceptance passed as `accepted`
  - delivery readiness blocked only by `delivery.final-missing` and `delivery.review-not-approved`
- `node scripts/run-review-decision.js --input outputs/adp --status approved` passed.
- `npm run test:gate:full` after approval passed:
  - truth readiness: `100%`
  - batch acceptance: `accepted`
  - delivery readiness: `ready`
  - real-run readiness: `ready`
- `npm run real:check -- --systems adp` passed: `status=ready`, `canStart=true`, `canDeliver=true`.

## Remaining Work

- Database evidence remains optional for the current mode. If a later target system requires database-backed truth, configure only redacted metadata collection and keep secrets out of prompts, docs, and whitepapers.
- Future non-ADP systems should reuse the homepage overview evidence path where portal cards are the only visible business workflow surface.
