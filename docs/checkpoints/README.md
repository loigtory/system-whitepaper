# Checkpoints

Checkpoint files record version or worker handoff state when work reaches a durable boundary.

Write a checkpoint when:

- A version completes.
- A worker finishes a task package.
- A real ADP/SIT run is blocked, interrupted, or produces metrics below the version threshold.
- Chat context becomes too long and the next chat must resume from file evidence.

File naming:

```text
YYYY-MM-DD-v<version>-checkpoint.md
YYYY-MM-DD-v<version>-<task-id>-checkpoint.md
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
