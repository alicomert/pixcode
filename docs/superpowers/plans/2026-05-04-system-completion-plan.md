# Pixcode System Completion Plan (Phased Execution)

**Date:** 2026-05-04  
**Status:** Active  
**Owner:** Codex execution stream

## Objective

Close the remaining gaps to make orchestration + TaskMaster integration production-complete with clear phase gates, measurable verification, and minimal regression risk.

## Phase 1 — Reality Check + Contract Freeze (In Progress)

Goal: lock current behavior and remove doc/implementation drift before feature work.

### Deliverables

- [ ] Create a single source status matrix for:
  - A2A
  - workspace isolation
  - preview
  - orchestration task board
  - workflow DAG
  - TaskMaster integration
- [ ] Mark each item as `complete`, `partial`, `stub`, or `blocked`.
- [ ] Explicitly mark Docker workspace as stub and define acceptance criteria.
- [ ] Resolve plan-status drift where documents still say "draft" while progress is already shipped.

### Verification

- [ ] `npm run typecheck`
- [ ] `npm run lint -- server/modules/orchestration src/components/orchestration server/routes/taskmaster.js`

## Phase 2 — TaskMaster ↔ Orchestration Data Bridge

Goal: make TaskMaster the planning source and Orchestration the execution source with stable IDs.

### Deliverables

- [ ] Extend orchestration task model with `taskmasterId` and sync metadata.
- [ ] Add one-way import endpoint/service: TaskMaster -> OrchestrationTask.
- [ ] Add dispatch linking: `orchestrationTask.a2aTaskId` + `taskmasterId`.
- [ ] Add optional completion sync back to TaskMaster status.
- [ ] Preserve safety: TaskMaster updates must never override active orchestration execution states.

### Verification

- [ ] `npm run typecheck`
- [ ] `npm run lint -- server/modules/orchestration src/components/orchestration src/components/task-master server/routes/taskmaster.js`
- [ ] Manual: import -> dispatch -> stream -> completion -> status sync

## Phase 3 — Durable Orchestration Task Persistence

Goal: move orchestration task state to durable storage suitable for long-lived product use.

### Deliverables

- [ ] Define storage contract (SQLite preferred).
- [ ] Add schema + migration for orchestration tasks.
- [ ] Add indexes (`projectId`, `taskmasterId`, `a2aTaskId`, state/time fields).
- [ ] Backfill/compat path from transient JSON/in-memory where needed.

### Verification

- [ ] Restart survival checks
- [ ] Query latency checks for board views

## Phase 4 — Docker Workspace MVP

Goal: replace current docker stub with a safe MVP execution path.

### Deliverables

- [ ] Implement container create/start/exec/diff/destroy lifecycle.
- [ ] Restrict mounts/paths with existing path safety constraints.
- [ ] Add task metadata for image/container/ports.
- [ ] Keep worktree as default until Docker stability targets are met.

### Verification

- [ ] Worktree and docker parity smoke for simple tasks
- [ ] Cleanup guarantees on terminal task states

## Phase 5 — Product Hardening + UX Integration

Goal: polish final operational quality.

### Deliverables

- [ ] Unify orchestration/taskmaster task UX surfaces.
- [ ] Improve error surfacing for workspace and adapter failures.
- [ ] Add smoke scripts for orchestration-task bridge flows.
- [ ] Final docs alignment and release checklist.

## Execution Notes

- No custom test runner will be introduced.
- Verification baseline remains typecheck + lint + targeted smoke/manual checks.
- Work proceeds phase-by-phase; each phase must close with explicit pass criteria.
