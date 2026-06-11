# Version Execution Template

> Copy this template when starting each implementation version.

## 1. Version Identity

- Version:
- Theme:
- Priority:
- Target start date:
- Target finish date:
- Coordinator:
- Branch:

## 2. Version Goal

State the concrete behavioral outcome for this version in 3-6 bullets.

## 3. Scope

### In Scope

- List files, artifacts, and behavior that may change.

### Out Of Scope

- List files, artifacts, and behavior that must not change in this version.

## 4. Evidence And Safety Constraints

- No unsupported whitepaper claims.
- No weakening of evidence traceability, readiness thresholds, write-operation safety, or DB redaction rules.
- No secrets, cookies, database credentials, private URLs, raw samples, or real customer artifacts in prompts, docs, tests, reports, or commits.
- Real ADP/SIT runs require explicit user authorization.
- Non-ADP systems must pass the intake checklist before browser collection, AI writing, DB profiling, or batch execution.
- Database inputs may only be used by scripts to create redacted metadata; models and prompts must never receive credentials, connection strings, raw rows, or private DB content.

## 5. System Intake And Run Level

Use this section for V7+ multisystem work. Leave it as `not applicable` only when the version does not touch real-system onboarding, readiness, browser evidence, DB metadata, or batch execution.

### Candidate Systems

| System code | System name | Environment | Login role | Auth prerequisite | DB profile mode | Evidence risk | Allowed run level | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  | test/SIT only |  | token/session available locally | disabled / metadata-file / read-only-connector | auth/menu/workflow/db/narrative/delivery | doctor-only / real-check / low-risk-nodes / single-pipeline / batch-candidate | pending |

### Run Levels

- `doctor-only`: only config and secrets path validation.
- `real-check`: readiness checks without collecting new browser evidence.
- `low-risk-nodes`: deterministic nodes only; no new AI writing or write validation.
- `single-pipeline`: one system pipeline with `--with-whitepaper`.
- `batch-candidate`: eligible for bounded batch execution with a unique output directory.

### Stop Conditions

Stop before browser or AI-writing work when any item is true:

- Auth prerequisite is missing or expired.
- Target system is production rather than test/SIT.
- System code duplicates an active run.
- DB secret path is outside `secrets/db/`.
- Connector mode is not explicitly read-only.
- Another project is actively consuming multi-agent or AI-writing capacity.

### Blocked Categories

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

## 6. Agent Plan

| Agent | Role | Write Scope | Output/Handoff | Verification |
| --- | --- | --- | --- | --- |
| A |  |  |  |  |
| B |  |  |  |  |
| C |  |  |  |  |
| D |  |  |  |  |

Coordinator-owned files:

- `package.json`
- `SKILL.md`
- `scripts/system-whitepaper.test.js`
- `.agents/4-agent-plan.json`
- Version plan and checkpoint docs

## 7. Tasks

| Task | Goal | Owner | Files | Tests |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## 8. Verification Plan

- Targeted tests:
- Auto gate dry-run:
- Required gate:
- Real-run checks:
- Blockers if unavailable:

## 9. Acceptance Criteria

- Every acceptance criterion must be objectively checkable.
- Each criterion must name the artifact, command, or report that proves it.

## 10. Checkpoint Requirements

Write `docs/checkpoints/YYYY-MM-DD-v{version}-checkpoint.md` with:

- Version target
- Branch and commit
- Worker handoff summary
- Changed files
- Commands run and results
- Residual untested risk
- Real environment / DB / secrets / outputs touched
- Next version recommendation
