# V7 Release Checklist

Date: 2026-06-12

This checklist controls release readiness for V7 multisystem onboarding governance. V7 turns the ADP pilot into a reusable intake, readiness, blocked-category, repair, dashboard, and delivery governance flow for finance, HR, internal foundation, and other non-ADP systems.

## Release Boundary

V7 has two different release states:

| State | Meaning | Can be claimed |
| --- | --- | --- |
| Code-side release-ready | Governance docs, scripts, tests, blocked-category taxonomy, batch diagnosis, repair queue, dashboard visibility, and full quality gate are ready to merge. | Yes, after `npm run test:gate:full` exits 0 on the release branch. |
| Real multisystem validated | At least 2 non-ADP test/SIT systems complete intake and authorized checks with structured ready or blocked results. | No, until the user provides candidate systems and allowed run levels. |

Do not claim V7 has validated real finance, HR, internal foundation, or other non-ADP systems unless those systems are explicitly selected and checked.

## Evidence Chain Requirements

Every generated business process, use case, function summary, and workflow statement must stay grounded in system evidence or be labeled as unverified.

Required evidence controls:

| Control | Required artifact or gate |
| --- | --- |
| Evidence inventory and extracted facts exist | `evidence-summary.json`, `verified-claims.json` |
| Business process claims have provenance | `business-process-model.json`, `workflow-spec.json`, claim evidence refs |
| Narrative coverage is checked | `fact-check-report.json`, `narrative-quality-report.json` |
| 95%+ readiness is enforced | `truth-readiness-report.json` with score >= 95 and `canSubmitReview=true` |
| Batch delivery is accepted | `batch-acceptance-report.json` |
| Final delivery is current | `delivery-readiness-report.json` |
| Real-run prerequisites are classified | `real-run-readiness-report.json` |

## Safety Requirements

These are release blockers:

| Blocker | Release action |
| --- | --- |
| Production target selected for real run | Stop. Use test/SIT only. |
| Secret, cookie, token, DB credential, private URL, or raw customer artifact appears in docs, prompts, reports, tests, or commits | Stop and remove it before any commit. |
| DB connector is not explicitly read-only | Stop DB profiling. |
| DB secret path is outside `secrets/db/` | Stop DB profiling. |
| A model prompt receives credentials, connection strings, raw rows, or private DB content | Stop. Only redacted metadata may be used downstream. |
| Browser or AI-writing run is requested without user-approved run level | Stop and ask for authorization. |

## Code-Side Release Checklist

Complete all items before opening or merging a V7 code-side PR:

| Item | Required evidence |
| --- | --- |
| Branch is based on current `main` or expected integration base | `git log --oneline --decorate -6` |
| Worktree has no uncommitted release changes | `git status --short --branch` |
| No generated outputs, secrets, cookies, or local configs are staged | `git diff --cached --name-only` review |
| Markdown and scripts have no whitespace/conflict-marker errors | `git diff --check` |
| Node syntax checks pass for changed scripts | `node --check <changed-script>` |
| Targeted regression tests pass for changed behavior | `node --test --test-name-pattern "<pattern>" scripts/system-whitepaper.test.js` |
| Package manifest includes all runtime files required by the skill | `npm run pack:check` |
| Core gate passes for shared code and agent isolation | `npm run test:gate:core` |
| Full gate passes for batch, readiness, delivery, and real-run readiness changes | `npm run test:gate:full` |

Code-side V7 is releasable only when the full gate exits 0 and the residual risk says no real non-ADP systems were validated unless that validation actually happened.

## Real Multisystem Intake Checklist

Before any `doctor`, `real:check`, browser collection, DB profiling, AI writing, low-risk pipeline, single pipeline, or batch run, record each candidate system:

| Field | Required value |
| --- | --- |
| System code | Unique stable code, not already active in another run |
| System name | Business-readable name, no private URL |
| Environment | Test or SIT only |
| Login role | Role expected for evidence collection and review |
| Auth prerequisite | Local session/token path exists, not committed |
| DB profile mode | `disabled`, `metadata-file`, or explicitly read-only connector |
| Evidence risk | One or more of `auth`, `menu`, `workflow`, `db`, `narrative`, `delivery` |
| Allowed run level | `doctor-only`, `real-check`, `low-risk-nodes`, `single-pipeline`, or `batch-candidate` |

## Real Multisystem Run Ladder

Use the smallest authorized run level that answers the current question:

| Level | Allowed commands | Prohibited work |
| --- | --- | --- |
| `doctor-only` | `npm run doctor` | Browser collection, DB profiling, AI writing, pipeline, batch |
| `real-check` | `npm run real:check -- --systems <codes>` | New browser evidence, AI writing, DB profiling |
| `low-risk-nodes` | Bounded deterministic pipeline nodes for selected systems only | AI writing and write validation unless separately approved |
| `single-pipeline` | One selected system pipeline with bounded options | Batch across systems |
| `batch-candidate` | Bounded batch with unique output directories and low concurrency | Shared output directories or production targets |

Stop immediately when a selected system hits an unapproved higher run level.

## Blocked Category Contract

V7 release artifacts must preserve blocked categories end to end:

| Category | Source examples | Expected consumer |
| --- | --- | --- |
| `auth` | Missing token, cookie, session, user info | doctor, real-run readiness, dashboard |
| `config` | Missing local config, malformed system entry | doctor, real-run readiness |
| `menu` | No menu tree or business entry point | pipeline diagnosis, repair queue |
| `evidence` | Insufficient screenshots, tables, forms, actions | diagnosis, repair queue |
| `workflow` | No observed or narratable inferred workflow | truth readiness, diagnosis, repair queue |
| `db` | Missing, unsafe, stale, or non-read-only DB metadata | doctor, diagnosis |
| `narrative` | AI writing, fact-check, golden eval, quality, truth score gaps | diagnosis, repair queue, dashboard |
| `delivery` | Final/Word/review artifacts stale or missing | delivery readiness, batch acceptance |
| `resource` | AI, browser, CPU, or multi-agent contention | coordinator checkpoint |

Required V7 consumers:

| Consumer | Required category field |
| --- | --- |
| Real-run readiness | `blockers[].blockedCategory`, `summary.blockedCategories` |
| Batch acceptance | `blockers[].blockedCategory`, `summary.blockedCategories` |
| Batch diagnosis | `systems[].blockedCategories`, `summary.blockedCategories` |
| Repair queue | `items[].blockedCategory`, `items[].blockedCategories`, `summary.blockedCategories` |
| Dashboard | Active and recent batch sections show diagnosis, repair, acceptance, and real-run category counts |

## 4-Agent Activation Rule

Use single-agent execution while another project is actively using multi-agent or AI-writing resources, or when edits touch shared files.

Only activate 4-agent execution when all of these are true:

| Condition | Required evidence |
| --- | --- |
| At least 2 candidate systems are approved | Intake table is filled |
| Systems have disjoint output directories | System codes are unique and not active elsewhere |
| Each worker has disjoint write scope | `.agents/4-agent-plan.json` or version plan names owned files |
| Worker tasks do not share mutable local browser/session state | Auth prerequisites are per-system or read-only |
| Coordinator can run integration gate afterward | `npm run test:gate:full` or documented blocker |

Suggested split for real dry-runs:

| Agent | Scope |
| --- | --- |
| A | Finance system intake, doctor, real-check, evidence readiness |
| B | HR system intake, doctor, real-check, workflow/business-process readiness |
| C | Internal foundation system intake, DB boundary, auth/config readiness |
| D | Batch/dashboard/repair category summary and V7 checkpoint consolidation |

The coordinator owns integration, final diff review, quality gates, and release decision.

## V7 Acceptance Criteria

Code-side V7 acceptance:

| Criterion | Status proof |
| --- | --- |
| Intake governance and run levels are documented | `docs/VERSION-EXECUTION-TEMPLATE.md`, V7 checkpoints |
| Blocked taxonomy exists and covers auth/config/menu/evidence/workflow/db/narrative/delivery/resource | `docs/checkpoints/*v7*`, `scripts/system-whitepaper-lib.js` |
| Real-run readiness and batch acceptance emit category summaries | Tests and full gate |
| Batch diagnosis and repair queue consume category summaries | Tests and full gate |
| Dashboard displays category summaries | Dashboard tests and full gate |
| No secrets, DB credentials, browser cookies, private URLs, or generated customer artifacts are tracked | Staged diff review and git status |
| Full quality gate passes | `npm run test:gate:full` exit 0 |

Real multisystem V7 acceptance:

| Criterion | Status proof |
| --- | --- |
| At least 2 non-ADP test/SIT systems are selected | Filled intake table |
| Each selected system has authorized run level | Intake approval |
| `doctor` and `real:check` complete or produce structured blockers | Reports and checkpoint |
| Blocked systems have category and next action | Readiness, diagnosis, or checkpoint |
| Any bounded pipeline or batch run stays within approved systems and output directories | Command log and checkpoint |
| No DB/secrets/prompt boundary is violated | Safety section in checkpoint |

## Current Release Decision

As of this checklist, V7 can be treated as code-side release-ready only after the latest V7 branch has a fresh `npm run test:gate:full` pass and a clean pushed state.

V7 real multisystem validation remains pending until the user provides 2-3 non-ADP test/SIT candidate systems and allowed run levels.
