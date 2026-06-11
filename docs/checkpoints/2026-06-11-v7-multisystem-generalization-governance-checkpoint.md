# V7 Multisystem Generalization Governance Checkpoint

Date: 2026-06-11

## Version Target

V7 turns the ADP pilot into a repeatable multisystem onboarding and readiness governance process for finance, HR, internal foundation, and other non-ADP systems.

This checkpoint records the first V7 implementation slice: intake governance before any real-system browser collection, AI writing, DB profiling, or batch execution.

## Branch And Commit

- Branch: `codex/v7-intake-governance`
- Base: `main` after PR #2 (`dfbda1a`)
- Commit: recorded in the final handoff after this checkpoint is committed.

## Completed Work

- Confirmed V7 route-map work was merged to `main` through PR #2.
- Created the docs-only V7 intake governance slice.
- Updated `docs/VERSION-EXECUTION-TEMPLATE.md` so V7+ versions can record candidate systems, run levels, stop conditions, and blocked categories.
- Updated `docs/superpowers/plans/2026-06-11-v7-multisystem-generalization-governance.md` task state for the completed governance slice.
- Updated `docs/95-plus-truth-iteration-master-plan-2026-06-09.md` so the current next action points to `codex/v7-intake-governance` instead of the already merged roadmap branch.

## System Intake Checklist

Each candidate system must be recorded before any real run:

| Field | Required | Notes |
| --- | --- | --- |
| system code | yes | Unique, stable, and not duplicated by an active batch or pipeline run. |
| system name | yes | Business-readable and not a private URL. |
| environment | yes | Test or SIT only. Production targets stop the run. |
| login role | yes | Expected permission level for collection and review. |
| browser auth prerequisite | yes | Token/session/cookie source available locally, but never committed or written into prompts/docs. |
| database profile mode | optional | `disabled`, redacted metadata file, or explicitly read-only connector. |
| evidence risk | yes | One or more of `auth`, `menu`, `workflow`, `db`, `narrative`, `delivery`. |
| allowed run level | yes | `doctor-only`, `real-check`, `low-risk-nodes`, `single-pipeline`, or `batch-candidate`. |

No candidate systems were selected in this slice.

## Run Levels

- `doctor-only`: only config and secrets path validation.
- `real-check`: readiness checks without collecting new browser evidence.
- `low-risk-nodes`: deterministic nodes only; no new AI writing or write validation.
- `single-pipeline`: one system pipeline with `--with-whitepaper`.
- `batch-candidate`: eligible for bounded batch execution with a unique output directory.

## Stop Conditions

Stop before browser or AI-writing work when:

- Auth prerequisite is missing or expired.
- Target system is production rather than test/SIT.
- System code duplicates an active run.
- DB secret path is outside `secrets/db/`.
- Connector mode is not explicitly read-only.
- Another project is actively consuming multi-agent or AI-writing capacity.

## Blocked Category Taxonomy

| Category | Meaning | Next action |
| --- | --- | --- |
| `auth` | Login token, session, or user info is unavailable. | Refresh auth and rerun doctor/real-check. |
| `config` | Local config is missing or malformed. | Fix `config/systems.local.yaml`. |
| `menu` | System shell loads but no collectible business menu or homepage cards are available. | Inspect menu API/DOM strategy. |
| `evidence` | Pages load but screenshots, forms, tables, or actions are insufficient. | Rerun evidence collection with bounded scope. |
| `workflow` | No observed or narratable inferred workflow evidence exists. | Collect menu/container/homepage flow evidence. |
| `db` | Optional DB profile is unavailable, unsafe, stale, or not read-only. | Fix redacted metadata collection only. |
| `narrative` | AI writing or fact-check coverage is blocked. | Rerun scoped Phase3b only after evidence is sufficient. |
| `delivery` | Truth passed but final, Word, or review delivery is stale or missing. | Rerun review/final delivery checks. |
| `resource` | AI, browser, CPU, or multi-agent capacity is constrained. | Serialize systems or reduce concurrency. |

## Category To Command Mapping

- `auth`, `config`, `db`: `npm run doctor`
- `resource`: no command; reduce concurrency, serialize systems, or wait.
- `menu`, `evidence`, `workflow`: bounded `npm run pipeline -- --system <code> --nodes collect,build-spec,workflow-spec`
- `narrative`: `npm run phase3b -- --system <code> --narrative-part <scope>`
- `delivery`: `npm run delivery:check` and `npm run real:check -- --systems <code>`

## Selected System Intake Results

No real finance, HR, internal foundation, or other non-ADP system was selected in this slice.

Real-system execution remains blocked until the user provides:

- 2-3 candidate system codes.
- Confirmation that each target is test/SIT, not production.
- The maximum allowed run level for each system.
- Confirmation that required local auth/session prerequisites exist outside the repository.

## Worker Handoffs

No worker agents were used.

Reason: another project may still consume multi-agent and AI-writing capacity, and this V7 slice has tightly coupled governance documents. Single-agent execution avoids unnecessary branch and resource contention.

## Verification

- `git diff --check`: exited 0. Result: no whitespace or conflict-marker errors.
- `npm run test:gate:auto -- --dry-run`: exited 1 in the sandbox. Result: blocked by `spawnSync git EPERM` while detecting changed files.
- `npm test *> .tmp\v7-intake-npm-test.log`: exited 0. Result: 439/439 tests passed, 0 failed.
- `npm run pack:check`: initial sandbox run exited 1 with `EPERM` while unlinking a `.npm-cache` temp file. Rerun with filesystem permission exited 0 and produced `system-whitepaper-skill-0.0.0.tgz` dry-run metadata with `entryCount=72`.
- `npm run test:gate:quick *> .tmp\v7-intake-test-gate-quick.log`: rerun with filesystem permission exited 0. Result: tests 439/439 passed, 0 failed; package dry-run passed with `entryCount=72`.

## Residual Risk

- No non-ADP systems have been selected yet.
- `npm run doctor` and `npm run real:check -- --systems <code>` were not run for V7 candidate systems because no system codes were authorized.
- No low-risk pipeline, AI narrative, DB profile, batch, delivery, or real-system browser run was started.
- Blocked-category taxonomy is documented but not yet emitted directly by every script report.
- `npm run test:gate:auto -- --dry-run` still needs a non-sandbox rerun when used as the authoritative automatic gate selector, because the sandbox blocks its internal Git child process.

## Environment And Data Safety

- Real environment touched: no.
- Browser collection touched: no.
- DB metadata touched: no.
- Secrets, cookies, tokens, or connection strings touched: no.
- Runtime outputs or customer artifacts committed: no.
- Prompt or whitepaper inputs changed: no.

## Next Step

After this governance slice is merged, choose 2-3 non-ADP test/SIT systems and run only the authorized level:

1. `doctor-only` or `real-check` first.
2. `low-risk-nodes` only after prerequisites pass.
3. `single-pipeline` or `batch-candidate` only after explicit approval.
