# Pixcode Production Agent Loop

Introduced in v1.44, the production loop control plane now coordinates the agent runtime, Git routes, NanoClaw task runs, and release process.

## Issue-to-PR

`POST /api/production-agent-loop/github/issue-to-pr` records a GitHub issue-to-PR run plan. The plan includes the issue reference, provider/model selection, generated branch name, acceptance criteria, and the `/api/agent` request shape needed to create the branch and pull request.

## CI-aware repair

`POST /api/production-agent-loop/ci/repair-plan` parses build, test, lint, and typecheck output into:

- failed commands
- likely touched files
- top error lines
- a repair prompt that can be sent back into the same task

The goal is to make CI feedback a first-class repair loop instead of a detached log blob.

## Review Queue

`/api/production-agent-loop/review-queue` stores review requested, accepted, and needs fix states for changed files. The queue is intentionally separate from git status so a reviewer can mark files without mutating the repository.

## Inline Diff Anchors

Changed files now calculate the first changed line and expose an `L<number>` hint in the command-center rail. The utility also builds stable line anchors so editor navigation can jump directly to the relevant change.

## Background Scheduler

`/api/production-agent-loop/scheduler/jobs` stores watch, cron, and manual background agent jobs. Initial jobs are persisted as scheduled records with provider, project, prompt, and next-run metadata.

## Workspace Checkpoints

`/api/production-agent-loop/snapshots` creates `pixcode.workspace-checkpoint.v1` metadata checkpoints before risky production loops. Checkpoints include project identity, git head, changed files, reason, and arbitrary metadata for later comparison or rollback.

## Desktop Asset Policy

`/api/production-agent-loop/desktop-release/assets-policy` verifies the required desktop asset surface for every GitHub release:

- Windows `.exe`
- Linux `.AppImage`
- Linux `.deb`
- macOS `x64.dmg`
- macOS `arm64.dmg`

The policy explicitly allows carrying assets forward and renaming them when the desktop shell updates Pixcode internally.
