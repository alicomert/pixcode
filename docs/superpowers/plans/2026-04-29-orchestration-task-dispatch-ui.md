# Pixcode v2 Orchestration Task Dispatch UI Plan

**Date:** 2026-04-29
**Status:** Ready after workspace isolation
**Depends on:** `2026-04-29-orchestration-workspace-isolation.md`

## Goal

Connect TaskMaster/manual tasks to the A2A adapter layer through a Pixcode orchestration task model, dispatch API, and task board UI. This is the bridge between the existing task board surface and the new multi-CLI execution foundation.

## Current Baseline

- Existing TaskMaster UI lives under `src/components/task-master/`.
- Existing TaskMaster API lives in `server/routes/taskmaster.js`.
- A2A task execution exists under `/a2a/tasks`.
- There is no `/api/orchestration/*` route, no `OrchestratorService`, and no dispatch table.

## Non-Goals

- Custom workflow editor.
- Multi-node DAG execution.
- Full merge conflict UI.
- Replacing TaskMaster as the planning source.

## Target Files

Create:

```text
server/modules/orchestration/tasks/
- orchestration-task.types.ts
- orchestration-task-store.ts
- orchestration-task.service.ts
- orchestration-task.routes.ts

src/components/orchestration/
- TaskBoard.tsx
- TaskCard.tsx
- TaskDispatchModal.tsx
- TaskStreamPanel.tsx
- AdapterSelector.tsx
- useOrchestrationTasks.ts
```

Modify:

```text
server/modules/orchestration/index.ts
server/index.js
src/components/task-master/view/TaskBoard.tsx
src/components/task-master/view/TaskCard.tsx
src/App.tsx
src/i18n/locales/*/tasks.json
```

## Task 1: Orchestration Task Model

- [ ] Define `OrchestrationTask` separate from raw A2A `Task`.
- [ ] Include `id`, `a2aTaskId`, `taskmasterId`, `projectId`, `title`, `description`, `state`, `adapterId`, `adapterSelector`, `workspaceKind`, `workspacePath`, `baseRef`, `metadata`, timestamps.
- [ ] Map states to board columns: `todo`, `in_progress`, `in_review`, `done`, `failed`.
- [ ] Keep TaskMaster ids nullable so manual tasks work.

## Task 2: Persistence

- [ ] Prefer SQLite if this task board becomes durable product state.
- [ ] Add migration/table for `pixcode_tasks` as described in the spec.
- [ ] If migrations are too risky for the first patch, add a JSON store only as a temporary bridge and document the migration.
- [ ] Add indexes for `projectId`, `taskmasterId`, and `a2aTaskId`.

## Task 3: Backend Service

- [ ] Add `OrchestrationTaskService.createManualTask`.
- [ ] Add `syncFromTaskMaster(projectId)` as one-way import.
- [ ] Add `dispatch(taskId, { adapterId, isolation, baseRef })`.
- [ ] `dispatch` should call the existing A2A task path internally rather than duplicate adapter logic.
- [ ] Subscribe to A2A bus/task-store updates and mirror state onto `OrchestrationTask`.

Avoid:

- Calling adapter classes directly from UI routes.
- Duplicating A2A validation logic.
- Making TaskMaster writes until final status transition.

## Task 4: Backend Routes

- [ ] Mount `orchestration-task.routes.ts` under `/api/orchestration`.
- [ ] Add `GET /api/orchestration/tasks?projectId=...`.
- [ ] Add `POST /api/orchestration/tasks`.
- [ ] Add `POST /api/orchestration/tasks/:id/dispatch`.
- [ ] Add `POST /api/orchestration/tasks/:id/cancel`.
- [ ] Add `GET /api/orchestration/tasks/:id/events` or reuse A2A SSE by returning `a2aTaskId`.

All `/api/orchestration/*` routes should use existing Pixcode auth.

## Task 5: Adapter Selector

- [ ] Fetch adapter cards from `/a2a/agents`.
- [ ] Support explicit adapters and `auto`.
- [ ] Support `skill:<id>` where useful.
- [ ] Show adapter name, provider, and skills.
- [ ] Keep AI-suggested routing out of this first UI unless a cheap routing service already exists.

## Task 6: Board UI

- [ ] Reuse TaskMaster board primitives where practical.
- [ ] Add CLI badge, state badge, workspace branch/path, and last A2A update.
- [ ] Dragging to In Progress should open dispatch modal if no adapter is selected.
- [ ] Failed tasks should expose retry and switch adapter.
- [ ] Done tasks should expose diff/preview artifacts if available.

Mobile:

- Keep columns swipeable or reuse current TaskMaster mobile pattern.
- Avoid dense multi-column desktop layout on small screens.

## Task 7: TaskMaster Sync

- [ ] Import TaskMaster tasks into Pixcode orchestration tasks on project open.
- [ ] Store `taskmasterId` as a link, not a replacement id.
- [ ] On Pixcode task done, optionally call TaskMaster status update.
- [ ] Never let TaskMaster overwrite an active Pixcode execution state.

## Verification

Run:

```bash
npm run typecheck
npm run lint -- server/modules/orchestration src/components/orchestration src/components/task-master
```

Manual:

1. Open a project with TaskMaster tasks.
2. Confirm tasks import into the orchestration board.
3. Dispatch one task to `claude-code` or `codex`.
4. Confirm A2A task id is linked.
5. Confirm stream/artifacts are visible from the card.
6. Confirm cancel and retry behavior.

## Risks

- Existing TaskMaster UI may already encode assumptions about task states.
- A2A task store is JSON; product task store should be SQLite for long-lived board state.
- Dispatch UX can become noisy if every state transition opens modals. Keep manual mode explicit and compact.
