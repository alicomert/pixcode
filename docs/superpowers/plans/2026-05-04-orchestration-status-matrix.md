# Orchestration + TaskMaster Status Matrix

**Date:** 2026-05-04 (updated)
**Phase:** 1 — Reality Check + Contract Freeze  
**Source of truth:** current repository implementation

## Status Legend

- `complete`: implemented and wired end-to-end, verified
- `partial`: implemented but with known gaps
- `stub`: intentionally present but not functional
- `blocked`: cannot proceed without prerequisite

## Matrix

| Area | Status | Evidence | Notes / Gap to Close |
|---|---|---|---|
| A2A core routes (`/a2a`) | complete | All routes mounted, 6 adapters registered, auth middleware active | Stable |
| Six first-party adapters | complete | Claude/Codex/Cursor/Gemini/Qwen/OpenCode all registered | Stable |
| Workspace isolation (worktree) | complete | Workspace create/finalize/diff/cleanup in A2A task flow | Cross-platform edge cases remain low risk |
| Workspace isolation (docker) | complete | Full lifecycle: pull/create/start/exec/readFile/writeFile/diff/destroy | Lazy-start pattern, `node:22-slim` default image |
| Auto-preview detection + artifact | complete | Port watcher emits `preview-url` with `proxiedUrl` for iframe | Inline preview iframe renders in WorkflowNodeStream |
| Preview proxy security model | complete | Proxy restricts to known preview ports, strips CSP headers | Stable |
| Orchestration tasks API | complete | CRUD + dispatch + cancel, JSON-backed store survives restarts | Store replaces in-memory Map |
| Workflow DAG runner | complete | Workflow routes + runner + events + cancel + preview endpoints | Stable |
| Workflow run persistence | complete | File-backed run store with restart recovery | JSON-backed, matches project pattern |
| TaskMaster integration (standalone) | complete | Backend routes + frontend panel/setup flow | Stable |
| TaskMaster ↔ Orchestration bridge | complete | `upsertFromTaskMaster` + A2A bus sync + completion status write-back | One-way import + done sync back to task-master |
| Unified UX (Task board convergence) | partial | Orchestration and TaskMaster views both exist | Shared task state model still pending |

## Immediate Contract Freeze Decisions

1. **TaskMaster remains planning source; orchestration remains execution source** until Phase 2 is complete.
2. **Docker remains non-default** (worktree stays default) but is now fully functional.
3. **Worktree stays default isolation** for orchestration task dispatch.
4. **No custom test runner**; quality gates remain typecheck + lint + targeted smoke/manual checks.

## Phase 1 Exit Criteria

- [x] Single status matrix created.
- [x] Stub/partial/complete boundaries explicitly documented.
- [x] Docker stub replaced with full lifecycle implementation.
- [x] Plan metadata drift corrected for workflow runner plan.
