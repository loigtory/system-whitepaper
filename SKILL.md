---
name: system-whitepaper
description: Use when generating or validating high-truth system function whitepapers from test-environment web systems, browser evidence, screenshots, Playwright exploration results, AI_AUTO_TEST_ validation data, redacted database evidence, Truth Pipeline artifacts, or 4-thread batch whitepaper runs.
---

# System Whitepaper

## Core Principle

Generate a concise, evidence-driven system function whitepaper. Do not invent modules, flows, fields, permissions, or technical details that are not present in the evidence package.

This skill is the main controller. Use supporting files for detailed rules:

- `whitepaper-template.md`: Markdown output template
- `evidence-schema.md`: Evidence package structure
- `explorer-guide.md`: Playwright exploration rules
- `form-fill-rules.md`: Form filling and prerequisite data rules
- `safety-rules.md`: Test data and write-operation safety rules
- `quality-checklist.md`: 99%+ quality gate
- `docs/narrative-guide.md`: Agent narrative writing, review rejection, and rewrite rules
- `docs/HIGH-TRUTH-OPTIMIZATION-FRAMEWORK.md`: 95%+ business-truth optimization framework, Golden Eval, Truth Model, and 4-agent execution plan

## Required Inputs

- System list with system name and test-environment URL.
- Huntian temporary token. Token transport is query: `HUNTIAN_TOKEN_TRANSPORT=query`.
- Login verification endpoint pattern: `https://huntian.hzins.com/api/user/getUserLoginInfo?token=REPLACE_WITH_JWT`.
- Local hosts already points target domains to the test environment.
- The test account has full functional permissions unless the user says otherwise.

Never write token values into the whitepaper, screenshot captions, evidence summaries, or logs intended for review.

## Execution Flow

The unattended pipeline is grouped into five business-visible phases:

1. **准备**: sync the system registry and ensure Huntian login/session is valid.
2. **取证**: use Playwright to collect pages, popups, forms, tables, screenshots, logs, and safe `AI_AUTO_TEST_` write-operation evidence.
3. **真相**:
   - **库表画像**: when enabled, convert private test-database metadata or a read-only connector scan into redacted `database-profile.json`; skip this node when `databaseProfile.enabled=false`. Existing DB profiles are reused by default when the same system/database/config/cache key is still current; use an explicit refresh only when the test database schema or sampling policy changed.
   - **库表模型**: convert the redacted profile into `data-dictionary.json` and `entity-model.json`; these are script-derived evidence artifacts, not Agent database access.
   - **功能宇宙**: merge UI evidence and redacted database entities into `function-universe.json` candidates.
   - **可信断言**: convert the universe into `verified-claims.json`; only `writable=true` claims may become body assertions. Database-only claims must remain evidence-only/pending until UI evidence confirms them.
   - When `databaseProfile.enabled=true`, the DB node is complete only after the redacted profile, data dictionary, entity model, function universe, verified claims, fact-check, and truth-readiness all share current source fingerprints. A profile alone is not enough for review readiness.
4. **成稿**:
   - **底稿**: generate `whitepaper.draft.md` from evidence. This is a factual draft, not the final whitepaper.
   - **摘要**: build `evidence-summary.json` for LLM input.
   - **写稿**: `run-phase3b.js` generates `narrative-brief.md` and an inline prompt from compressed `evidence-summary.json`, quality summary, and `verified-claims.json`. Cursor Agent / LLM writes `narrative-fragments.md`; scripts assemble `whitepaper.pending-review.md`.
   - **事实核验**: run `fact-check-whitepaper.js` so unsupported headings and weak body assertions are blocked before review/finalization.
   - For rejection rewrites, prefer `--narrative-part overview-flow`, `--narrative-part function-sections`, or a concrete module name instead of full narrative reruns when the comment scope is limited.
   - When a rerun must apply an existing `review-decision.json`, pass `--review-rerun`; ordinary full narrative runs intentionally ignore stale review decisions.
   - Review rerun usage must remain auditable: `phase3b-usage.json` should explain whether the run was full, partial, or review-driven, which review scope triggered it, and whether split prompts were actually sent to the SDK.
   - Classify rejection comments narrowly: wording, description, and business-flow gaps are narrative rewrites; only missing screenshots, evidence, or collection failures trigger evidence refresh.
   - **质检**: run coverage and narrative checks; unresolved failures become re-run tasks or pending confirmations.
   - **真实度门禁**: run `check-truth-readiness.js` to aggregate coverage, verified claims, fact-check, narrative gates, and source-artifact fingerprints into `truth-readiness-report.json`; review submission requires `canSubmitReview=true`, score >= 95%, and non-stale fingerprints.
5. **审定**: the reviewer approves or rejects in the local dashboard. Approval creates `whitepaper.final.md` and Word output only after `run-review-decision.js` verifies `truth-readiness-report.json` has passed. Rejection must include comments; `run-review-decision.js` classifies the comment and writes `review-decision.json`; the Agent/LLM only executes the scoped narrative rewrite when required.

Delivery note: approval also creates a `.docx.manifest.json` sidecar for the Word output. Treat the manifest as part of the final delivery evidence because it binds the current `whitepaper.final.md` fingerprint to the generated `.docx`.

## Parallel Batch Model

Use the 4-thread model for unattended multi-system development:

- Run different systems in parallel. Each system must write to its own `outputs/<system-code>/` directory.
- For Codex/Agent development work, the main Agent is the coordinator and reviewer. Worker Agents must act like independent developers: each writable worker uses its own non-nested worktree, branch, output directory, `handoffReport`, and non-overlapping `writeScope`; read-only auditors must declare no `writeScope`.
- Record the assignment in `.agents/4-agent-plan.json` and run `npm run agent:isolation` before creating or dispatching workers. This is only a declaration check.
- Run `npm run agent:worktrees` to dry-run the exact `git worktree add` and output-directory commands. Re-run with `npm run agent:worktrees -- --apply` only after reviewing the plan.
- Before worker execution, run `npm run agent:isolation:worktrees` from the coordinator worktree. Before merging, run `npm run agent:isolation:strict`. The worktree check proves worker paths are registered git worktrees and writable workers are on their assigned branches; strict mode additionally proves worker diffs stay inside `writeScope` and each writable worker has a valid `handoffReport`.
- Treat same-directory subagents as not isolated. If a worker cannot run in its own git worktree/branch/output/handoff path, do not count it as one of the 4 independent agents and do not merge its changes as worker output.
- Integrate worker results only through the main Agent after reviewing each worker's `handoffReport`, diffs, and tests. Treat shared config, `scripts/system-whitepaper.test.js`, `SKILL.md`, `package.json`, `.agents/`, and `_batch` state as coordinator-owned unless the main Agent changes them directly.
- Use a merge policy in the plan, for example: `"mergePolicy": { "coordinatorOnlyMerge": true, "reviewRequired": true }`.
- Do not run the same system twice at the same time. Duplicate system codes or duplicate batch requests are invalid because they can overwrite screenshots, state, prompts, and review artifacts.
- The batch runner owns `outputs/_batch/run-state.json`. Single-system child pipelines are started with `--no-batch-state` so they cannot overwrite the aggregate batch state.
- The local dashboard reads the same batch state and shows each running system's status, current phase/node, pid, per-system log path, truth-readiness summary, writable-claim coverage, coverage-repair status, failure category, retry plan, batch diagnosis summary, and repair-queue summary.
- Batch completion writes `outputs/_batch/diagnosis.json`, `outputs/_batch/diagnosis.md`, `outputs/_batch/repair-queue.json`, and `outputs/_batch/repair-queue.md`. Diagnosis explains readiness and blockers; repair queue converts safe rerun actions into bounded queue items.
- Repair queue items are restricted: `reset=false`, `review` is excluded, only known pipeline nodes are allowed, and items that include `narrative` are marked Agent-writing quota sensitive. They are not auto-runnable unless `runtime.repairAllowAgentWriting=true` or batch is run with `-- --repair-allow-agent-writing`.
- Batch retries are opt-in with `-- --batch-retries <n>`. Retried systems resume from the failed node, do not inherit `--reset`, and mark retries that include `narrative` as Agent-writing quota sensitive.
- Batch execution increases throughput only. It does not multiply Cursor/Codex plan quota and it does not make Agent writing free.

## Execution Commands

Use the npm scripts as the stable entrypoints:

- `npm run init`: create `config/systems.local.yaml`, `secrets/`, and `outputs/` from the packaged example if missing.
- `npm run doctor`: validate local config, secret paths, safe test-data prefix, output directory, and system registry before running the pipeline.
- `npm run agent:isolation`: validate `.agents/4-agent-plan.json` declarations before creating 4-agent Codex workers.
- `npm run agent:worktrees`: dry-run creation commands for worker git worktrees and per-worker output/handoff directories; add `-- --apply` only after review.
- `npm run agent:isolation:worktrees`: validate actual git worktrees, branches, and coordinator cleanliness before worker execution.
- `npm run agent:isolation:strict`: validate actual git worktrees, branches, handoff reports, coordinator cleanliness, and worker diff/writeScope boundaries before merging.
- `npm run db:profile -- --system <code>`: build a redacted `database-profile.json` from private test-database metadata or `databaseProfile.mode=connector` / `--connector` read-only schema scan when enabled. The command reuses an existing profile for the same database/cache key by default and does not reconnect/re-read metadata; add `-- --refresh-database-profile` only after schema, metadata, includeSchemas, sampleRows, or sampleTables changed.
- `npm run db:model -- --input outputs/<code>`: derive `data-dictionary.json` and `entity-model.json` from the redacted database profile.
- `npm run truth:universe -- --input outputs/<code>`: merge UI evidence summary and redacted database profile into `function-universe.json` candidates.
- `npm run truth:claims -- --input outputs/<code>`: convert the function universe into `verified-claims.json` with confidence and writable/non-writable boundaries; database-only inferred claims are not writable.
- `npm run truth:fact-check -- --input outputs/<code>`: check `whitepaper.pending-review.md` against writable claims; block unsupported/non-writable body assertions and low writable-claim coverage.
- `npm run truth:readiness -- --input outputs/<code>`: aggregate truth gates into `truth-readiness-report.json`; a non-passing report blocks review submission. In the full pipeline, systems with `databaseProfile.enabled=true` automatically require the complete DB enhancement chain: redacted profile, derived model artifacts, DB-linked function universe, database boundary claims, at least one UI+DB writable claim, fact-check coverage, and current source fingerprints.
- `npm run sync`: sync the system registry into `config/systems.local.yaml`.
- `npm run pipeline -- --system <code> --with-whitepaper`: run the unattended end-to-end whitepaper pipeline for one configured system. Without `--with-whitepaper`, pipeline runs are for scoped evidence/spec/quality nodes only and are not deliverable whitepaper runs.
- `npm run batch`: run the full whitepaper pipeline for all configured systems with 4 parallel workers; use `-- --systems <code1>,<code2>` to limit scope, `-- --concurrency <n>` to change worker count, or `-- --batch-retries <n>` to enable bounded recoverable retries.
- `npm run repair:batch`: consume `outputs/_batch/repair-queue.json` and run only `canAutoRun=true` repair items through a new bounded batch run; use `-- --dry-run` to write `repair-run-plan.json/md` without execution. Agent-writing repairs require `-- --allow-agent-writing`. Terminal repair closure and next-step follow-up are written to `repair-closure.json/md` and `repair-follow-up-plan.json/md`.
- `npm run repair:loop`: consume `outputs/_batch/repair-follow-up-plan.json` and repeatedly run only low-quota `repair:batch` follow-up commands until the closure passes, max rounds are reached, or the plan requires Agent-writing/manual intervention.
- `npm run batch:acceptance`: read batch diagnosis, repair queue/closure/follow-up state, per-system truth readiness, source fingerprints, database evidence availability, and whitepaper artifacts; write `outputs/_batch/acceptance-report.json/md` and fail unless every selected system is 95%+ review-ready.
- `npm run delivery:check`: explicitly refresh batch acceptance and final delivery readiness, then write `outputs/_batch/delivery-readiness-report.json/md`; fail if accepted systems are smoke/local-e2e artifacts or if real pipeline evidence nodes did not complete.
- `npm run real:check`: write `outputs/_batch/real-run-readiness-report.json/md`; before running, confirm config/doctor/system/DB prerequisites are ready, and after running, summarize acceptance and delivery readiness into one real-run status.
- `npm run dashboard`: open the local review dashboard on port `3920`.
- `npm run phase3b -- --system <code>`: run or rerun the narrative-writing stage for one system.
- `npm test`: run the regression suite before and after script changes.
- `npm run pack:check`: dry-run the skill package and verify private/runtime artifacts stay out.

Run `npm run init` once after installing the skill, then edit `config/systems.local.yaml` and write the Huntian token into `secrets/huntian-token.txt`.
Run `npm run doctor` before first collection and after changing config or secret paths.
Run `npm run real:check -- --systems <code1>,<code2>` before the first real-system batch and after every repair loop. Treat `status=ready-to-run` as permission to start real batch execution; treat `status=ready` as the final automated real-run handoff. `status=blocked` means do not deliver.
Prefer `npm run pipeline -- --system <code> --with-whitepaper` for single-system production whitepaper runs. Use `npm run batch` when multiple independent systems must be processed unattended. Watch `outputs/_batch/run-state.json`, `outputs/_batch/diagnosis.md`, `outputs/_batch/repair-queue.md`, or the dashboard "Batch 4 threads" panel to see all active system threads, truth-readiness scores, coverage-repair outcomes, and blocked next actions at once. Use `npm run phase3b` only for scoped narrative work, review rewrites, or prompt/fragment regeneration after evidence and summary artifacts already exist.
Do not repeatedly collect the same test database in ordinary reruns. Keep the existing `outputs/<code>/database-profile.json` unless a deliberate refresh is needed; pipeline/batch can forward `-- --refresh-database-profile` to force the DB node to re-read metadata or reconnect once.
Run `npm run repair:batch -- --dry-run` before consuming a repair queue. The runner rebuilds safe batch arguments from queue fields, ignores embedded command strings, writes `outputs/_batch/repair-run-plan.json`, `outputs/_batch/repair-run-plan.md`, `outputs/_batch/repair-run-state.json`, `outputs/_batch/repair-closure.json/md`, and `outputs/_batch/repair-follow-up-plan.json/md`, and never runs queue items that require Agent writing unless `-- --allow-agent-writing` is present. Treat closure `status=passed` as the batch-level repair signal: all systems are 95%+ ready, no missing writable claims remain, and the repair queue is empty. Treat follow-up `status=ready-to-run` as the next unattended low-quota repair step; run `npm run repair:loop -- --max-rounds 3` to consume those steps automatically. Treat `status=needs-agent-writing` as a hard stop until explicit quota approval is given.
Batch, `repair:batch`, and `repair:loop` automatically refresh `outputs/_batch/acceptance-report.json/md` and `outputs/_batch/delivery-readiness-report.json/md` at terminal state; run `npm run batch:acceptance` or `npm run delivery:check` only for explicit re-checks after inspecting or moving artifacts. Treat `acceptance-report.json status=accepted` as the unattended delivery gate: every target system has a non-stale truth-readiness report, score >=95%, no uncovered writable claims, a pending-review/final whitepaper, and no remaining repair queue or follow-up blocker.
Before calling a real-system batch deliverable complete, confirm the latest auto-refreshed `delivery-readiness-report.json status=ready`. Treat it as the final evidence audit: it confirms batch acceptance passed, each selected system came from a real pipeline output directory, smoke/local-e2e truth reports are absent, required evidence/truth/narrative/fact-check nodes completed, and any final Word output is manifest-bound to the current `whitepaper.final.md`.
Run `npm run pack:check` before distributing or installing an updated copy of this skill.

## Hard Rules

- No evidence, no conclusion. Unsupported content goes to pending confirmations.
- Core functions and high-impact actions must bind to screenshots, logs, page structure, system feedback, or state changes.
- Write operations must target records in `test-data-ledger` with the `AI_AUTO_TEST_` prefix.
- Existing system data may be read or referenced, but must not be modified, submitted, approved, deleted, overwritten, or published.
- If a target record cannot be proven to be automation-created, do not execute the final write action.
- Seeing a button is not the same as validating a flow.
- Session expiry is not permission denial. If the page returns to login, shows 401/403, or user info is empty, pause and request a fresh token.
- Keep the whitepaper concise. Each normal function description should usually fit in 5-8 lines.
- `generate-whitepaper.js` output is only a **底稿**. Do not treat `whitepaper.draft.md` as a deliverable final whitepaper.
- Stage **成稿 · 写稿** must follow `docs/narrative-guide.md`; do not use fixed template sentences as a substitute for Agent narrative writing.
- During **成稿 · 写稿**, keep the Agent working set to the single system output directory. Do not ask it to explore `scripts/`, `node_modules/`, full `evidence.json`, screenshot binaries, or other systems' outputs.
- During batch execution, each Agent/LLM writing task still receives only one system's reduced evidence and verified claims. Never give an Agent the whole batch output tree as its writing context.
- Never explore runtime/private directories such as `secrets/`, `.playwright-*`, `node_modules/`, or unrelated `outputs/` when generating or revising narrative content.
- Database connection details are private script inputs only. Do not put `secrets/db/<system>.json`, database hostnames, users, passwords, DSNs, or raw sample rows into prompts, logs intended for review, or whitepapers. Prefer `databaseProfile.secretDir: ./secrets/db`; scripts resolve the private secret as `secrets/db/<system-code>.json`. Legacy `databaseProfile.secretFile` is still accepted only when it resolves to that same per-system path. Non-connector metadata files must also stay under `secrets/db/`. Connector mode requires explicit `readOnly=true`; sample rows are disabled by default and, when enabled, must stay limited and redacted in `database-profile.json`. Agent writing may only use redacted database artifacts such as `database-profile.json`, `data-dictionary.json`, `entity-model.json`, and `verified-claims.json`.
- Seeing a menu, button, or field proves only that the UI element exists. Business value, process completion, and write-operation validation require supporting evidence.
- Treat core JSON artifacts as schema-bound products, not loose caches. `evidence.json`, `evidence-summary.json`, `quality-report.json`, `write-validation-plan.json`, `operation-spec.json`, and `pipeline-state.json` must be valid JSON objects when they already exist and are used as inputs.
- Optional enrichment/cache files may be ignored when missing, malformed, or the wrong top-level shape, but they must not be treated as valid evidence. Examples: `phase3b-usage-history.json` may be an array cache; `review-decision.json`, `write-validation-result.json`, `operation-guide-gate.json`, and `network-index.json` are object-shaped optional artifacts.
- When editing scripts, use the shared JSON helpers from `scripts/system-whitepaper-lib.js`: strict core inputs use `readRequiredJsonObject` or `readExistingJsonObject`; optional object artifacts use `readOptionalJsonObject`; optional array/history caches use `readOptionalJson` plus an `Array.isArray` guard.

## Output Structure

Generate artifacts per system:

- `whitepaper.draft.md`: factual draft from deterministic scripts.
- `evidence-summary.json`: compressed evidence for Agent writing.
- `database-profile.json`: redacted database schema/entity evidence; never include database secrets or raw sensitive rows.
- `data-dictionary.json`: field-level dictionary derived from redacted database evidence; includes semantic tags and counts, not raw sample rows.
- `entity-model.json`: entity and relation model derived from the data dictionary; database-only relationships remain inference evidence until UI confirms workflow behavior.
- `function-universe.json`: UI + DB candidate universe for later verified claims; not final conclusions.
- `verified-claims.json`: claim-level evidence and confidence boundary for narrative writing and fact checks.
- `fact-check-report.json`: deterministic assertion and writable-claim coverage report for pending review/finalization gates.
- `coverage-repair-plan.json`: audit record for bounded automatic narrative repair when writable-claim coverage is incomplete.
- `truth-readiness-report.json`: final truth gate report; combines evidence quality, writable claims, fact checks, narrative quality, and optional redacted database support.
- `whitepaper.pending-review.md`: Agent-written business-readable whitepaper for review.
- `whitepaper.final.md`: final Markdown after approval.
- `{系统名称}_系统功能白皮书_{YYYYMMDD}.docx`: Word output after approval.

The Word sidecar manifest follows the generated document name plus `.manifest.json`, for example `{system}_系统功能白皮书_{YYYYMMDD}.docx.manifest.json`. It must stay next to the `.docx` because delivery readiness uses it to reject stale Word output.

The reviewed whitepaper keeps this structure:

1. System overview
2. Function module overview
3. Core function descriptions
4. Typical business flows
5. Role and permission summary
6. Pending confirmations
7. Appendix: evidence index

Put key screenshots inside the relevant function or flow section. Put full screenshot and evidence indexes in the appendix.

## Quality Gate

Before finalizing, verify:

- Menu coverage >= 99% or every missing menu has a reason.
- Core page screenshot coverage >= 99%.
- Core function classification coverage >= 99%.
- Write-operation safety compliance = 100%.
- Unverified-content labeling = 100%.
- Core conclusion traceability = 100%.
- Deterministic business claims should come from `verified-claims.json`; weak or database-only non-writable claims must not be written as confirmed conclusions.
- Pending-review content should cover most writable claims; low writable-claim coverage means the whitepaper is incomplete even when every written sentence is supported.
- `run-whitepaper-pipeline.js` automatically performs one bounded coverage repair when `fact-check-report.json` lists `missingWritableClaimIds`: it writes `coverage-repair-plan.json`, reruns scoped narrative work with the inferred module `--narrative-part`, then reruns fact-check. Use `--no-coverage-repair` only for debugging.
- `fact-check-report.json` must have `canFinalize=true` before producing `whitepaper.final.md`.
- `truth-readiness-report.json` must have `canSubmitReview=true`, score >= 95%, and matching source-artifact fingerprints before human review or final approval; `run-review-decision.js --status approved` blocks final Markdown/Word generation when this report is missing, malformed, non-passing, stale, smoke/local-e2e, or under an `_e2e` output directory.
- Database-derived truth artifacts (`data-dictionary.json`, `entity-model.json`, `function-universe.json`, and `verified-claims.json`) must carry current upstream source fingerprints; `truth-readiness` blocks stale DB/claim lineage. If DB evidence is required, it also blocks `database.enhancement-incomplete` until DB-derived entities and UI+DB linked writable claims participate in the checked whitepaper path.
- If `whitepaper.final.md` exists, delivery readiness requires the `.docx` sidecar manifest to match the current final Markdown fingerprint and current Word file fingerprint.
- No duplicated function explanations.
- No source-code, database, or internal implementation claims without browser evidence.

If any quality gate fails, do not finalize. Re-run, downgrade to pending confirmation, or record a justified exclusion.

## Review Rejection

When review is rejected, comments are mandatory. `run-review-decision.js` inspects the comments and returns one structured decision:

- `rerunNodes`: concrete nodes to re-run, usually `narrative,fact-check,quality,truth-readiness` or `collect,inspect,summary,db-model,truth-universe,truth-claims,narrative,fact-check,quality,truth-readiness`.
- `rewriteScope`: `overview-flow`, `function-sections`, `evidence-refresh`, or `narrative`.
- `narrativePart`: scoped writer input such as `overview-flow`, `function-sections`, or a concrete module name.
- `instructions`: what the next rewrite must fix.

The Agent must follow `review-decision.json` during `--review-rerun` and explain how the rewrite addresses the review comments.
`review-decision.json` uses the script schema: `status`, `comment`, `rerunNodes`, `rewriteScope`, `targetSections`, `targetModules`, `narrativePart`, `instructions`, `decidedAt`.

## Common Mistakes

- Writing a long manual instead of a concise whitepaper.
- Treating inferred business meaning as verified fact.
- Deleting or modifying existing test-environment data.
- Hiding uncovered menus or failed pages.
- Letting screenshots accumulate without selecting representative ones.
- Writing technical implementation details from URLs or API names alone.
- Marking `whitepaper.draft.md` as final output.
- Rewriting evidence into polished claims that cannot be traced back to screenshots, fields, logs, or test data.
