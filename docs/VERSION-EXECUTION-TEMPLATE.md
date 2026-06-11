# Version Execution Template

> Copy this template when starting each V1-V5 implementation version.

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

## 5. Agent Plan

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

## 6. Tasks

| Task | Goal | Owner | Files | Tests |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## 7. Verification Plan

- Targeted tests:
- Auto gate dry-run:
- Required gate:
- Real-run checks:
- Blockers if unavailable:

## 8. Acceptance Criteria

- Every acceptance criterion must be objectively checkable.
- Each criterion must name the artifact, command, or report that proves it.

## 9. Checkpoint Requirements

Write `docs/checkpoints/YYYY-MM-DD-v{version}-checkpoint.md` with:

- Version target
- Branch and commit
- Worker handoff summary
- Changed files
- Commands run and results
- Residual untested risk
- Real environment / DB / secrets / outputs touched
- Next version recommendation
