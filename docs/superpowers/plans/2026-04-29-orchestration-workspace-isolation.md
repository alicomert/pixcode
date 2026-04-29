# Pixcode v2 Orchestration Workspace Isolation Plan

**Date:** 2026-04-29
**Status:** Ready for implementation
**Depends on:** `2026-04-28-orchestration-a2a-foundation.md`

## Goal

Add the execution isolation layer that the A2A foundation currently lacks: a `WorkspaceHandle` abstraction, default git-worktree execution per A2A task, diff artifact generation, and a Docker-capable interface that can be implemented incrementally.

After this plan, A2A task submission can run adapters in an isolated worktree instead of `process.cwd()`, and completed tasks can expose a diff artifact for merge/discard UI.

## Current Baseline

- A2A tasks are submitted through `server/modules/orchestration/a2a/routes.ts`.
- `AdapterContext` currently carries only `cwd`, `permissionMode`, and `parentTaskId`.
- `A2ATaskStore` persists protocol task state in JSON, not SQLite.
- No `server/modules/orchestration/workspace/` module exists.

## Non-Goals

- Full UI merge/discard controls.
- Conflict orchestration between multiple task branches.
- Production Docker sandbox implementation for every CLI.
- Changing legacy `/ws` session behavior.

## Target Files

Create:

```text
server/modules/orchestration/workspace/
- types.ts
- workspace-manager.ts
- worktree-workspace.ts
- docker-workspace.ts
- path-safety.ts
```

Modify:

```text
server/modules/orchestration/index.ts
server/modules/orchestration/a2a/adapters/abstract-a2a.adapter.ts
server/modules/orchestration/a2a/routes.ts
server/modules/orchestration/a2a/types.ts
```

Optional later:

```text
server/modules/orchestration/a2a/task-store.ts
server/database/schema.js
server/database/db.js
```

## Task 1: Workspace Types

- [ ] Add `WorkspaceKind = 'host' | 'worktree' | 'docker'`.
- [ ] Add `WorkspaceHandle` with `id`, `kind`, `path`, `baseRef`, `branchName`, `metadata`, `exec`, `readFile`, `writeFile`, `diff`, `destroy`.
- [ ] Add `WorkspaceRequest` with `taskId`, `projectPath`, `kind`, `baseRef`, `keepAfterCompletion`.
- [ ] Export workspace types from `server/modules/orchestration/index.ts`.

Verification:

```bash
npm run typecheck
```

## Task 2: Path Safety

- [ ] Add helpers that resolve all generated workspaces under `~/.pixcode/worktrees` by default.
- [ ] Reject task ids, branch names, and relative paths containing traversal.
- [ ] Add a single safe path join helper used by workspace file IO.
- [ ] Keep all shell execution APIs based on argument arrays, not interpolated command strings.

Implementation notes:

- Use `fs.realpathSync.native` where possible.
- Treat missing generated directories as safe only after validating their parent.
- Do not allow adapters to read arbitrary host files through `WorkspaceHandle.readFile`.

## Task 3: Worktree Workspace

- [ ] Implement `WorktreeWorkspace` with `execFile`-based git calls.
- [ ] Create worktrees with branch names like `pixcode/task_<taskId>`.
- [ ] Store generated worktrees under `~/.pixcode/worktrees/ws_<taskId>`.
- [ ] Implement `diff()` with `git diff <baseRef>...HEAD`.
- [ ] Implement `destroy()` with `git worktree remove`.

Failure behavior:

- Workspace creation failure should fail the A2A task before adapter submit.
- Destroy failure should be logged and persisted in task metadata if the task already completed.
- If a branch already exists, fail with a structured `WORKSPACE_EXISTS` error.

## Task 4: Workspace Manager

- [ ] Add `WorkspaceManager.create(request)`.
- [ ] Resolve default `kind` from `task.metadata.isolation`, falling back to `worktree`.
- [ ] Resolve default `projectPath` from request metadata first, then current process cwd.
- [ ] Resolve default `baseRef` from `task.metadata.baseRef`, then `HEAD`.
- [ ] Add `WorkspaceManager.recover(task)` for future restart recovery, returning metadata-only handles where active processes cannot be resumed.

## Task 5: Adapter Context Integration

- [ ] Change `AdapterContext` to include `workspace: WorkspaceHandle`.
- [ ] Keep `cwd` temporarily as a compatibility alias during the first patch.
- [ ] Update all six adapters to use `ctx.workspace.path` for CLI cwd.
- [ ] Persist workspace metadata on the A2A task before adapter submit.

Suggested shape:

```ts
export interface AdapterContext {
  workspace: WorkspaceHandle;
  cwd: string; // compatibility alias; remove in a later cleanup
  permissionMode?: 'acceptEdits' | 'plan' | 'bypassPermissions' | 'default';
  parentTaskId?: string;
}
```

## Task 6: A2A Route Lifecycle

- [ ] In `POST /a2a/tasks`, create workspace before calling `adapter.submitTask`.
- [ ] On adapter submit failure, destroy the workspace unless `keepAfterCompletion` is true.
- [ ] On terminal task state, call `workspace.diff()` and emit a `file-diff` artifact.
- [ ] On terminal task state, destroy workspace by default only after diff generation.
- [ ] Add `metadata.workspace` to task summaries.

Important: this requires a runtime map from `taskId` to active `WorkspaceHandle`, similar to the existing task unsubscribe map.

## Task 7: Docker Interface Stub

- [ ] Add `DockerWorkspace` that satisfies `WorkspaceHandle`.
- [ ] Initially return `WORKSPACE_DOCKER_NOT_IMPLEMENTED` unless explicitly enabled.
- [ ] Keep the API shape compatible with future container-backed execution.
- [ ] Document required metadata: image, containerId, exposed ports, mount path.

## Verification

Run after implementation:

```bash
npm run typecheck
npm run lint -- server/modules/orchestration
```

Manual checks:

```bash
curl -sS http://127.0.0.1:3001/a2a/agents
node scripts/smoke/a2a-roundtrip.mjs
git worktree list
```

Expected:

- A submitted task has `metadata.workspace.kind = "worktree"`.
- Adapter cwd is the generated worktree path.
- Completed task contains a `file-diff` artifact, even if the diff is empty.
- Worktree is removed after terminal state unless keep metadata is set.

## Risks

- Dirty source repos can make worktree creation or diff semantics surprising.
- Windows support may need a shallow-clone fallback later.
- Running adapters in generated worktrees may break assumptions in CLI auth/session storage; verify each adapter manually.
