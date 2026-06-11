# Project Development Rules

These rules specialize the global Codex methodology for this repository.

## Project Scope

- This repository implements the `system-whitepaper-skill` Node.js/Codex skill for evidence-driven system whitepaper generation.
- Treat `SKILL.md`, `quality-checklist.md`, `safety-rules.md`, `evidence-schema.md`, and `docs/narrative-guide.md` as product requirements, not loose documentation.
- Most runtime artifacts are generated under ignored paths such as `outputs/`, `.tmp/`, `.agents/`, `.playwright-*`, `secrets/`, and local config files. Do not commit generated evidence, browser sessions, secrets, cookies, tokens, or real customer artifacts.

## Development Methodology

- Use the global Superpowers-driven workflow: inspect first, plan before multi-step edits, use TDD for feature and bug fixes when practical, debug from evidence, and verify before completion.
- Use `fullstack-quality-gate` for behavior, pipeline, browser, data, integration, packaging, and safety-rule changes.
- For multi-agent work, split only independent tasks with disjoint write scopes. Use the existing `.agents/4-agent-plan.json` conventions and run the agent isolation gate before merging worker output.

## Evidence And Safety Rules

- Do not invent whitepaper claims. Every business capability, workflow, page, and write-operation statement must trace back to evidence artifacts or be labeled as unverified.
- Follow `safety-rules.md`: automation may mutate only records created by the current automation run and registered with the `AI_AUTO_TEST_` prefix.
- Never hardcode or expose secrets, production credentials, browser cookies, database passwords, tokens, or private system URLs in code, tests, docs, prompts, or reports.
- If a real-environment check needs `config/systems.local.yaml`, browser auth state, database metadata, or secrets and they are missing, report the gate as blocked. Do not fabricate substitutes.

## Quality Gates

- Quick gate for small docs, tests, and low-risk script edits:
  `npm run test:gate:quick`
- Core gate for feature work, bug fixes, package files, agent coordination, and shared library changes:
  `npm run test:gate:core`
- Full gate for release readiness or changes touching browser automation, real-run readiness, delivery, batch acceptance, database profiling, auth, or whitepaper finalization:
  `npm run test:gate:full`

If a required gate cannot run locally, state the exact blocker and residual risk in the final report.

## Change Discipline

- Keep package distribution in sync. If a file is required by the skill at runtime, update `package.json` `files` and run `npm run pack:check`.
- Prefer focused changes to `scripts/system-whitepaper-lib.js` and targeted tests in `scripts/system-whitepaper.test.js`.
- Preserve Chinese business terminology exactly unless the task explicitly asks for copy changes.
- Do not weaken quality thresholds, evidence traceability, write-operation safety checks, or readiness gates to make tests pass.
