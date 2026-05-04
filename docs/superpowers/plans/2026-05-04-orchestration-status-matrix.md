# Orchestration + TaskMaster Status Matrix

**Date:** 2026-05-04  
**Phase:** 1 — Reality Check + Contract Freeze  
**Source of truth:** current repository implementation

## Status Legend

- `complete`: implemented and wired end-to-end in current app flow
- `partial`: implemented but with known scope/UX/persistence gaps
- `stub`: intentionally present but not implemented for runtime use
- `blocked`: cannot proceed without prerequisite

## Matrix

| Area | Status | Evidence | Notes / Gap to Close |
|---|---|---|---|
| A2A core routes (`/a2a`) | complete | `server/index.js` mounts router and registers all adapters | Keep auth posture documented for local/remote modes |
| Six first-party adapters | complete | Claude/Codex/Cursor/Gemini/Qwen/OpenCode registered | Add regression smoke coverage per adapter in release flow |
| Workspace isolation (worktree) | partial | Workspace create/finalize + diff artifact + cleanup in A2A task flow | Cross-platform edge-case hardening still needed |
| Workspace isolation (docker) | stub | `DockerWorkspace` throws `WORKSPACE_DOCKER_NOT_IMPLEMENTED` | Phase 4 implements lifecycle and safety controls |
| Auto-preview detection + artifact | partial | Port watcher emits `preview-url` artifacts and proxied URL | UX integration still split across orchestration views |
| Preview proxy security model | partial | Proxy only allows known preview ports | Add explicit doc/tests for denied unknown ports |
| Orchestration tasks API (`/api/orchestration/tasks`) | partial | Router mounted and UI hook consumes create/list/dispatch/cancel | Persistence and TaskMaster bridge model incomplete |
| Workflow DAG runner | complete | Workflow routes + runner + events + cancel + preview endpoints | Documentation status drift fixed in plan metadata |
| Workflow run persistence | partial | File-backed run store exists | Long-lived product durability and migration strategy pending |
| TaskMaster integration (standalone) | complete | Dedicated backend routes + frontend panel/setup flow exist | Treated as separate surface today |
| TaskMaster ↔ Orchestration bridge | partial | Concept appears in plans; not yet unified as single execution model | Phase 2 implements `taskmasterId` mapping + sync rules |
| Unified UX (Task board convergence) | partial | Orchestration and TaskMaster views both exist | Needs shared task state model and reduced duplication |

## Immediate Contract Freeze Decisions

1. **TaskMaster remains planning source; orchestration remains execution source** until Phase 2 is complete.
2. **Docker remains non-default** and explicitly marked as stub until Phase 4 acceptance criteria pass.
3. **Worktree stays default isolation** for orchestration task dispatch.
4. **No custom test runner**; quality gates remain typecheck + lint + targeted smoke/manual checks.

## Phase 1 Exit Criteria

- [x] Single status matrix created.
- [x] Stub/partial/complete boundaries explicitly documented.
- [x] Docker stub acknowledged with forward plan.
- [x] Plan metadata drift corrected for workflow runner plan.
