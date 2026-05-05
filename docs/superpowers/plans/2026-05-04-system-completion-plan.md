# Pixcode System Completion Plan (Phased Execution)

**Date:** 2026-05-04  
**Status:** Active  
**Owner:** Codex execution stream

## Objective

Close the remaining gaps to make orchestration + TaskMaster integration production-complete with clear phase gates, measurable verification, and minimal regression risk.

## Phase 1 — Reality Check + Contract Freeze (Complete)

Goal: lock current behavior and remove doc/implementation drift before feature work.

### Deliverables

- [x] Create a single source status matrix for:
  - A2A
  - workspace isolation
  - preview
  - orchestration task board
  - workflow DAG
  - TaskMaster integration
- [x] Mark each item as `complete`, `partial`, `stub`, or `blocked`.
- [x] Explicitly mark Docker workspace as stub and define acceptance criteria.
- [x] Resolve plan-status drift where documents still say "draft" while progress is already shipped.

### Verification

- [x] `npm run typecheck`
- [x] `npm run lint -- server/modules/orchestration src/components/orchestration server/routes/taskmaster.js`

## Phase 2 — TaskMaster ↔ Orchestration Data Bridge

Goal: make TaskMaster the planning source and Orchestration the execution source with stable IDs.

### Deliverables

- [x] Extend orchestration task model with `taskmasterId` and sync metadata.
- [x] Add one-way import endpoint/service: TaskMaster -> OrchestrationTask.
- [x] Add dispatch linking: `orchestrationTask.a2aTaskId` + `taskmasterId`.
- [x] Add optional completion sync back to TaskMaster status.
- [x] Preserve safety: TaskMaster updates must never override active orchestration execution states.

### Verification

- [x] `npm run typecheck`
- [x] `npm run lint -- server/modules/orchestration src/components/orchestration src/components/task-master server/routes/taskmaster.js`
- [x] Manual: import -> dispatch -> stream -> completion -> status sync

## Phase 3 — Durable Orchestration Task Persistence

Goal: move orchestration task state to durable storage suitable for long-lived product use.

### Deliverables

- [x] Define storage contract (JSON-backed via shared JsonStore, consistent with auth store migration).
- [x] Migrate A2ATaskStore to shared JsonStore pattern with atomic writes and corruption recovery.
- [x] Migrate OrchestrationTaskStore to shared JsonStore pattern with `orchestration_tasks` table.
- [x] Add query helpers (`getByA2ATaskId`, `getByTaskMasterId`, `listByProjectId`) for efficient board views.
- [x] Backfill/compat path from legacy standalone JSON files where needed.

### Verification

- [x] Restart survival checks
- [x] Query latency checks for board views

## Phase 4 — Docker Workspace MVP

Goal: replace current docker stub with a safe MVP execution path.

### Deliverables

- [x] Implement container create/start/exec/diff/destroy lifecycle.
- [x] Restrict mounts/paths with existing path safety constraints.
- [x] Add task metadata for image/container/ports.
- [x] Keep worktree as default until Docker stability targets are met.

### Verification

- [x] Worktree and docker parity smoke for simple tasks
- [x] Cleanup guarantees on terminal task states

## Phase 5 — Product Hardening + UX Integration

Goal: polish final operational quality.

### Deliverables

- [x] Unify orchestration/taskmaster task UX surfaces.
- [x] Improve error surfacing for workspace and adapter failures.
- [x] Add smoke scripts for orchestration-task bridge flows.
- [x] Final docs alignment and release checklist.

## Execution Notes

- No custom test runner will be introduced.
- Verification baseline remains typecheck + lint + targeted smoke/manual checks.
- Work proceeds phase-by-phase; each phase must close with explicit pass criteria.
