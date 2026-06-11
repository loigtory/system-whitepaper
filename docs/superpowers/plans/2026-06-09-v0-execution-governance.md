# V0 Execution Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the version execution governance needed before V1-V5 multi-agent truth-pipeline development starts.

**Architecture:** V0 is a governance-only release. It adds reusable version/checkpoint templates, replaces the stale `.agents/4-agent-plan.json` with a V0-scoped declaration, records current quality-gate expectations, and freezes the V1 entry backlog without touching runtime pipeline code.

**Tech Stack:** Markdown docs, JSON agent-isolation plan, existing Node.js npm gate scripts.

---

## File Structure

V0 should only touch governance files:

- Create `docs/VERSION-EXECUTION-TEMPLATE.md`: reusable template for future V1-V5 implementation plans.
- Create `docs/checkpoints/README.md`: checkpoint format and required fields.
- Create `docs/checkpoints/2026-06-09-v0-baseline.md`: V0 baseline, current risks, and gate expectations.
- Modify `.agents/4-agent-plan.json`: replace old repair-task worker declarations with V0 worker declarations.
- Do not modify `scripts/`, `package.json`, `SKILL.md`, `quality-checklist.md`, `safety-rules.md`, `evidence-schema.md`, `outputs/`, `secrets/`, or real runtime artifacts.

The coordinator owns this whole V0 change. If worker agents are used, they must write only their declared files and submit handoff summaries; the coordinator performs the final edit and validation.

## Task 1: Create Version Execution Template

**Files:**
- Create: `docs/VERSION-EXECUTION-TEMPLATE.md`
- Read: `docs/95-plus-truth-iteration-master-plan-2026-06-09.md`

- [ ] **Step 1: Create the version execution template**

Add `docs/VERSION-EXECUTION-TEMPLATE.md` with this exact structure:

```markdown
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
```

- [ ] **Step 2: Review the template for forbidden marker text**

Run:

```powershell
rg -n "TB[D]|TO[D]O|FIXM[E]|marker-text" docs/VERSION-EXECUTION-TEMPLATE.md
```

Expected: no matches. The blank template fields are intentional form fields and must not use forbidden marker words.

## Task 2: Create Checkpoint Directory Guide

**Files:**
- Create: `docs/checkpoints/README.md`
- Read: `docs/采集策略重构-V1执行看板-2026-06-09.md`

- [ ] **Step 1: Create checkpoint README**

Add `docs/checkpoints/README.md` with this exact content:

```markdown
# Checkpoints

Checkpoint files record version or worker handoff state when work reaches a durable boundary.

Write a checkpoint when:

- A version completes.
- A worker finishes a task package.
- A real ADP/SIT run is blocked, interrupted, or produces metrics below the version threshold.
- Chat context becomes too long and the next chat must resume from file evidence.

File naming:

```text
YYYY-MM-DD-v{version}-checkpoint.md
YYYY-MM-DD-v{version}-{task-id}-checkpoint.md
```

Required sections:

## Version Target

Describe the version and the concrete target.

## Branch And Commit

List the coordinator branch and commit hash when available.

## Completed Work

List completed tasks and changed files.

## Worker Handoffs

Summarize each worker handoff. If no worker was used, write `No worker agents were used.`

## Verification

List every command run, exit status, and relevant result. Do not claim pass without command output.

## Residual Risk

List untested behavior, blocked checks, missing private config, or real-run gaps.

## Environment And Data Safety

State whether the work touched real environment, DB metadata, secrets, cookies, runtime outputs, or customer artifacts.

## Next Step

Name the next version or task package.
```

- [ ] **Step 2: Confirm the checkpoint directory is not under ignored runtime output**

Run:

```powershell
git -c safe.directory='D:/核心系统白皮书/skill/system-whitepaper' check-ignore -v docs/checkpoints/README.md
```

Expected: exit code 1 and no output, meaning the README is not ignored.

## Task 3: Replace The Agent Isolation Plan For V0

**Files:**
- Modify: `.agents/4-agent-plan.json`
- Read: `SKILL.md`
- Read: `scripts/check-agent-isolation.js`

- [ ] **Step 1: Replace stale repair worker declarations**

Replace `.agents/4-agent-plan.json` with this V0-scoped JSON:

```json
{
  "artifactType": "agent-isolation-plan",
  "version": 1,
  "expectedWorkers": 4,
  "coordinator": {
    "id": "main",
    "worktree": "D:/核心系统白皮书/skill/system-whitepaper",
    "branch": "codex/business-process-model"
  },
  "mergePolicy": {
    "coordinatorOnlyMerge": true,
    "reviewRequired": true
  },
  "workers": [
    {
      "id": "v0-version-template",
      "worktree": "D:/核心系统白皮书/skill/system-whitepaper-agent-v0-template",
      "branch": "codex/v0-version-template",
      "outputDir": "outputs/agent-v0-template",
      "handoffReport": "outputs/agent-v0-template/handoff.json",
      "writeScope": [
        "docs/VERSION-EXECUTION-TEMPLATE.md"
      ]
    },
    {
      "id": "v0-checkpoint-guide",
      "worktree": "D:/核心系统白皮书/skill/system-whitepaper-agent-v0-checkpoint",
      "branch": "codex/v0-checkpoint-guide",
      "outputDir": "outputs/agent-v0-checkpoint",
      "handoffReport": "outputs/agent-v0-checkpoint/handoff.json",
      "writeScope": [
        "docs/checkpoints/README.md"
      ]
    },
    {
      "id": "v0-gate-baseline",
      "worktree": "D:/核心系统白皮书/skill/system-whitepaper-agent-v0-gates",
      "branch": "codex/v0-gate-baseline",
      "outputDir": "outputs/agent-v0-gates",
      "handoffReport": "outputs/agent-v0-gates/handoff.json",
      "writeScope": [
        "docs/checkpoints/2026-06-09-v0-baseline.md"
      ]
    },
    {
      "id": "v0-risk-baseline",
      "readOnly": true,
      "worktree": "D:/核心系统白皮书/skill/system-whitepaper-agent-v0-risk-auditor"
    }
  ]
}
```

- [ ] **Step 2: Run declaration isolation check**

Run:

```powershell
npm run agent:isolation
```

Expected: exit code 0. This check validates declaration shape and write-scope overlap only; it does not prove real worktrees exist.

- [ ] **Step 3: Dry-run worktree creation commands**

Run:

```powershell
npm run agent:worktrees
```

Expected: exit code 0 and printed dry-run commands. Do not apply worktree creation during V0 unless the coordinator explicitly decides to use worker agents.

## Task 4: Create V0 Baseline Checkpoint

**Files:**
- Create: `docs/checkpoints/2026-06-09-v0-baseline.md`
- Read: `docs/95-plus-truth-iteration-master-plan-2026-06-09.md`
- Read: `docs/采集策略重构-V1执行看板-2026-06-09.md`

- [ ] **Step 1: Create the baseline checkpoint**

Add `docs/checkpoints/2026-06-09-v0-baseline.md` with this exact structure and content:

```markdown
# V0 Baseline Checkpoint

## Version Target

V0 establishes execution governance before V1-V5 high-truth implementation. It does not change runtime collection, truth, narrative, database, batch, delivery, or dashboard behavior.

## Current Branch And Worktree

- Coordinator worktree: `D:/核心系统白皮书/skill/system-whitepaper`
- Coordinator branch: `codex/business-process-model`

## Baseline Inputs

- Master plan: `docs/95-plus-truth-iteration-master-plan-2026-06-09.md`
- V1 board: `docs/采集策略重构-V1执行看板-2026-06-09.md`
- Project rules: `AGENTS.md`
- Skill rules: `SKILL.md`

## P0 Entry Risks For V1

- Formal narrative and review must be blocked when observed operation flows or workflow steps are structurally missing.
- `workflow-spec.json` must participate in the production whitepaper path and readiness lineage.
- ADP fresh reset validation requires explicit user authorization and valid local SIT prerequisites.
- DB metadata remains script-only and redacted; DB secrets and raw samples must not enter prompt or whitepaper content.

## P1 Entry Risks For V2-V4

- Current business process modeling contains ADP-specific semantics and must be generalized before cross-system trust claims.
- Formal whitepaper claim coverage should converge to 95% rather than the current lower default coverage used by fact-check.
- Golden Eval must remain isolated as evaluation-only input.

## Quality Gate Baseline

- Planned command for docs/governance changes: `npm run test:gate:auto -- --dry-run`
- If auto gate selects core: run `npm run test:gate:core`
- Full gate is reserved for collector, pipeline, DB, readiness, delivery, batch, auth, and finalization behavior changes.

## Environment And Data Safety

V0 should not touch real systems, browser sessions, DB metadata, secrets, cookies, ignored runtime outputs, or customer artifacts.

## Next Step

After V0 governance is accepted, start V1: flow evidence hard gate.
```

- [ ] **Step 2: Scan the checkpoint for accidental secrets or private runtime paths**

Run:

```powershell
rg -n "password|passwd|pwd|secret|token|cookie|JSESSIONID|HUNTIANSID|jdbc|dsn|数据库密码|客户" docs/checkpoints/2026-06-09-v0-baseline.md
```

Expected: matches are allowed only for generic policy words such as `secrets`, `token`, or `cookie`; no actual secret values, DSNs, hosts, users, or customer data should appear.

## Task 5: Run V0 Verification

**Files:**
- Verify only; no edits expected.

- [ ] **Step 1: Run auto gate dry-run**

Run:

```powershell
npm run test:gate:auto -- --dry-run
```

Expected: exit code 0. Record the selected gate level and command in the final V0 checkpoint update. If sandbox blocks git with `spawnSync git EPERM`, rerun the same command with approved escalation and record both results.

- [ ] **Step 2: Run the selected gate**

If auto gate selects quick, run:

```powershell
npm run test:gate:quick
```

If auto gate selects core, run:

```powershell
npm run test:gate:core
```

Expected: exit code 0. If the gate fails because `.agents/4-agent-plan.json` is invalid, fix the plan rather than weakening `check-agent-isolation.js`.

- [ ] **Step 3: Inspect git status**

Run:

```powershell
git -c safe.directory='D:/核心系统白皮书/skill/system-whitepaper' status --short --branch
```

Expected: only V0 governance files and pre-existing untracked project bootstrap files appear. Do not stage or revert unrelated user changes.

## Task 6: V0 Completion Checkpoint Update

**Files:**
- Modify: `docs/checkpoints/2026-06-09-v0-baseline.md`

- [ ] **Step 1: Append verification results**

After verification, append concrete command results. Do not paste a fill-in template. Use this style, replacing the example result text with the actual observed output:

```markdown
## V0 Verification Results

- `npm run agent:isolation`: exit 0; declaration accepted 4 workers with disjoint write scopes.
- `npm run agent:worktrees`: exit 0; dry-run printed worktree creation commands and no worktrees were created.
- `npm run test:gate:auto -- --dry-run`: exit 0; selected `core`, command `npm run test:gate:core`.
- `npm run test:gate:core`: exit 0; quick gate and agent isolation completed.

## V0 Residual Risk

- V0 did not run real ADP/SIT collection.
- V0 did not run full gate unless auto gate selected it.
- V0 did not modify runtime code.
```

Use actual command results before finalizing V0. Do not leave fill-in marker text in the checkpoint.

- [ ] **Step 2: Confirm no fill-in marker text remains**

Run:

```powershell
rg -n "exit status|selected gate command|fill-in|example result" docs/checkpoints/2026-06-09-v0-baseline.md
```

Expected: no matches.

## Self-Review Checklist

- [ ] The plan covers all V0 master-plan requirements: version template, checkpoint guide, agent plan template, gate baseline, P0/P1 backlog.
- [ ] The plan keeps V0 out of runtime code and private artifacts.
- [ ] Every command has an expected result.
- [ ] `.agents/4-agent-plan.json` write scopes are disjoint.
- [ ] Coordinator-owned files remain coordinator-owned.
- [ ] No step asks workers to weaken quality thresholds, evidence traceability, write-operation safety, DB redaction, or readiness gates.

## Execution Recommendation

Execute V0 inline in this coordinator chat. V0 is mostly governance/doc work, so using live worker agents would add coordination cost without much benefit. Reserve 4-agent execution for V1.
