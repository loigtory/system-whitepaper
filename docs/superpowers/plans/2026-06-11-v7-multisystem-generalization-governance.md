# V7 Multisystem Generalization Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Current coordinator recommendation: start inline with one agent because another project may still consume multi-agent and AI-writing capacity.

**Goal:** Turn the ADP pilot into a repeatable multisystem onboarding and readiness governance process for finance, HR, internal foundation, and other non-ADP systems.

**Architecture:** Keep V0-V6 evidence, plan, fact-check, truth-readiness, batch, delivery, and real-run gates as the source of truth. Add a V7 system onboarding plan, readiness checklist, blocked-category taxonomy, and checkpoint flow before running real systems.

**Tech Stack:** Node.js CommonJS, existing npm gates, Markdown governance docs, ignored local config under `config/`, ignored runtime outputs under `outputs/`, private secrets under `secrets/`.

---

## File Structure

- Modify `docs/95-plus-truth-iteration-master-plan-2026-06-09.md`
  - Mark V0-V6 as completed.
  - Add V7 as the next active version.
  - Update workflow semantics to observed/inferred/candidate.
- Create `docs/superpowers/plans/2026-06-11-v7-multisystem-generalization-governance.md`
  - This plan.
- Create after execution: `docs/checkpoints/2026-06-11-v7-multisystem-generalization-governance-checkpoint.md`
  - Record selected systems, commands, results, blockers, and safety status.
- Optional later code files if V7 discovers gaps:
  - `scripts/doctor.js`
  - `scripts/check-real-run-readiness.js`
  - `scripts/run-whitepaper-batch.js`
  - `scripts/local-dashboard/server.js`
  - `scripts/system-whitepaper.test.js`

## Task 1: Route Map And Version State

**Files:**
- Modify: `docs/95-plus-truth-iteration-master-plan-2026-06-09.md`
- Create: `docs/superpowers/plans/2026-06-11-v7-multisystem-generalization-governance.md`

- [ ] **Step 1: Update the version table**

Set V0-V6 status to completed and add V7:

```markdown
| V7 | 多系统泛化试运行与接入治理 | 用非 ADP 系统验证通用性，固化系统接入、运行资源和验收边界 | P1 | 下一步 | 4-7 天 |
```

- [ ] **Step 2: Update workflow semantic target**

Replace any observed-only workflow target with:

```markdown
`workflow-spec.json` 明确区分 `observed`、`inferred`、`candidate`：observed 可写为已观察流程，inferred 只能带证据边界叙述，candidate 不得写成已验证流程。
```

- [ ] **Step 3: Add V7 section**

Include scope, task split, optional 4-agent model, and acceptance criteria for finance/HR/internal foundation onboarding.

- [ ] **Step 4: Run document checks**

Run:

```powershell
git diff --check
```

Expected: no trailing whitespace or conflict marker errors.

## Task 2: Define V7 System Intake Checklist

**Files:**
- Create or modify: `docs/checkpoints/2026-06-11-v7-multisystem-generalization-governance-checkpoint.md`
- Optional modify: `docs/VERSION-EXECUTION-TEMPLATE.md`

- [ ] **Step 1: Create an intake checklist**

Each candidate system must record:

```markdown
| Field | Required | Notes |
| --- | --- | --- |
| system code | yes | unique, stable, no duplicate batch runs |
| system name | yes | business-readable |
| test URL | yes | test or SIT environment only |
| login role | yes | expected permission level |
| browser auth prerequisite | yes | token/session source available locally |
| database profile mode | optional | disabled, metadata file, or read-only connector |
| evidence risk | yes | auth/menu/workflow/db/narrative/delivery |
| allowed run level | yes | doctor-only, real-check, low-risk nodes, full pipeline, batch |
```

- [ ] **Step 2: Define run-level meanings**

Use these exact levels:

```markdown
- `doctor-only`: only config and secrets path validation.
- `real-check`: readiness checks without collecting new browser evidence.
- `low-risk-nodes`: deterministic nodes only; no new AI writing or write validation.
- `single-pipeline`: one system pipeline with `--with-whitepaper`.
- `batch-candidate`: eligible for bounded batch execution with unique output directory.
```

- [ ] **Step 3: Define stop conditions**

Stop before browser or AI-writing work when:

```markdown
- auth prerequisite is missing or expired
- target system is production rather than test/SIT
- system code duplicates an active run
- DB secret path is outside `secrets/db/`
- connector mode is not explicitly read-only
- another project is actively consuming multi-agent or AI-writing capacity
```

## Task 3: Define Blocked Category Taxonomy

**Files:**
- Create or modify: `docs/checkpoints/2026-06-11-v7-multisystem-generalization-governance-checkpoint.md`
- Optional modify after tests: `scripts/check-real-run-readiness.js`, `scripts/run-whitepaper-batch.js`, `scripts/local-dashboard/server.js`

- [ ] **Step 1: Define categories**

Use this taxonomy for each non-ADP blocked system:

```markdown
| Category | Meaning | Next action |
| --- | --- | --- |
| `auth` | login token/session/user info unavailable | refresh auth and rerun doctor/real-check |
| `config` | missing or malformed local config | fix `config/systems.local.yaml` |
| `menu` | system shell loads but no collectible business menu or homepage cards | inspect menu API/DOM strategy |
| `evidence` | pages load but screenshots/forms/tables/actions are insufficient | rerun evidence collection with bounded scope |
| `workflow` | no observed or narratable inferred workflow evidence | collect menu/container/homepage flow evidence |
| `db` | optional DB profile unavailable, unsafe, stale, or not read-only | fix redacted metadata collection only |
| `narrative` | AI writing or fact-check coverage blocked | rerun scoped Phase3b only after evidence is sufficient |
| `delivery` | truth passed but final/Word/review delivery is stale or missing | rerun review/final delivery checks |
| `resource` | AI/browser/CPU/multi-agent capacity is constrained | serialize systems or reduce concurrency |
```

- [ ] **Step 2: Map categories to commands**

Use:

```markdown
- `auth`, `config`, `db`: `npm run doctor`
- `resource`: no command; reduce concurrency or wait
- `menu`, `evidence`, `workflow`: bounded `npm run pipeline -- --system <code> --nodes collect,build-spec,workflow-spec`
- `narrative`: `npm run phase3b -- --system <code> --narrative-part <scope>`
- `delivery`: `npm run delivery:check` and `npm run real:check -- --systems <code>`
```

## Task 4: Dry-Run Candidate Systems

**Files:**
- Ignored output only: `outputs/<system-code>/`
- Create after run: `docs/checkpoints/2026-06-11-v7-multisystem-generalization-governance-checkpoint.md`

- [ ] **Step 1: Select systems with the user**

Ask for 2-3 non-ADP system codes from:

```markdown
- finance
- HR
- internal foundation
- another internal test/SIT system
```

- [ ] **Step 2: Run prerequisite checks only**

For selected systems:

```powershell
npm run doctor
npm run real:check -- --systems <code1>,<code2>
```

Expected:

```markdown
- ready-to-run or ready means the system may proceed to bounded execution.
- blocked must include concrete blockers and category mapping.
```

- [ ] **Step 3: Do not start full batch without explicit approval**

Only after the user confirms:

```powershell
npm run batch -- --systems <code1>,<code2> --concurrency 1
```

## Task 5: Checkpoint And Verification

**Files:**
- Create: `docs/checkpoints/2026-06-11-v7-multisystem-generalization-governance-checkpoint.md`

- [ ] **Step 1: Write checkpoint**

Checkpoint must include:

```markdown
## Version Target
V7 multisystem onboarding and readiness governance.

## Branch And Commit
Branch and commit hash.

## Completed Work
Roadmap update, V7 plan, selected system intake results.

## Worker Handoffs
No worker agents were used unless real per-system workers were explicitly started.

## Verification
Exact commands, exit codes, and key output lines.

## Residual Risk
Systems not selected, missing credentials, missing DB metadata, AI-writing not run.

## Environment And Data Safety
Whether any real environment, DB metadata, secrets, cookies, runtime outputs, or customer artifacts were touched.

## Next Step
Start bounded V7 dry-run or split into per-system worker branches.
```

- [ ] **Step 2: Run verification**

For docs-only work:

```powershell
git diff --check
npm run test:gate:quick
```

For code changes:

```powershell
npm run test:gate:core
```

For browser, DB, batch, delivery, or real-readiness changes:

```powershell
npm run test:gate:full
```

## Acceptance Criteria

- Master roadmap states V0-V6 completed and V7 as next step.
- V7 plan exists and does not require immediate real-system execution.
- V7 distinguishes intake, dry-run, bounded pipeline, and batch-candidate levels.
- Blocked categories cover auth, config, menu, evidence, workflow, DB, narrative, delivery, and resource constraints.
- No secrets, DB credentials, browser cookies, private URLs, raw generated outputs, or customer artifacts are tracked.
- Full-system execution remains blocked until the user explicitly names candidate systems and authorizes run level.
