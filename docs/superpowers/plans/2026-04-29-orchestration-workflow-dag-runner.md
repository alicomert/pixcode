# Pixcode v2 Orchestration Workflow DAG Runner Plan

**Date:** 2026-04-29
**Status:** Active (partially shipped; follow-up hardening remains)
**Depends on:** `2026-04-29-orchestration-task-dispatch-ui.md`

## Progress Update

- [x] Workflow DAG runner exists and submits child A2A tasks with one shared `contextId`.
- [x] Workflow UI shows per-node status, child A2A task ids, messages, artifacts, and cancel.
- [x] Agent-team workflow now uses bounded backend handoff nodes so frontend can start from a contract instead of waiting for full backend implementation.
- [x] Handoff nodes have a timeout and `continue` fail policy to prevent one agent from blocking the whole team indefinitely.
- [x] Downstream prompt context is compacted before handoff to avoid huge prior-agent transcripts breaking later agents.
- [x] Restart recovery marks non-terminal workflow runs/nodes failed instead of leaving the UI stuck in `running`.
- [x] Workflow API now has a dry-run preview endpoint and parent run SSE stream for API-level testing.
- [x] Added `metadata.agents[].role` so API callers can route agents explicitly without language-specific instruction heuristics.
- [x] Agent-team runs can append bounded `repair` and `recheck` nodes dynamically when a review stage reports actionable issues.
- [x] Added `npm run smoke:orchestration-api` to verify API key auth, workflow listing, and agent-team DAG shape without launching CLI agents.
- [x] Workflow runs now carry an explicit target workspace (`selected_project`, `pixcode_app`, or `custom`) so agents do not infer the wrong repository from the currently selected UI project.
- [x] Every workflow node prompt starts with the resolved workspace context, including the actual working directory and Pixcode app root.

## Goal

Add a workflow runner that can execute multi-CLI pipelines: parallel review fan-out, sequential handoff, and adversarial debate. Each workflow node expands to an A2A task, and all child tasks share a `contextId`.

## Current Baseline

- A2A tasks support `contextId`.
- Adapter resolution supports explicit ids, `auto`, and `skill:<id>`.
- No workflow definition store, run store, topological runner, or workflow UI exists.

## Non-Goals

- Visual workflow editor in the first implementation.
- External marketplace of workflows.
- Cost-aware model switching unless adapter runtimes already expose cheap/expensive variants.

## Target Files

Create:

```text
server/modules/orchestration/workflows/
- workflow.types.ts
- workflow-store.ts
- workflow-runner.ts
- built-in-workflows.ts
- workflow.routes.ts

src/components/orchestration/workflows/
- WorkflowRunPanel.tsx
- WorkflowNodeStream.tsx
- BuiltInWorkflowLauncher.tsx
```

Modify:

```text
server/modules/orchestration/index.ts
server/index.js
src/components/orchestration/TaskDispatchModal.tsx
```

## Task 1: Workflow Types

- [ ] Add `Workflow`, `WorkflowNode`, `WorkflowEdge`, `WorkflowRun`, `WorkflowNodeRun`.
- [ ] Node fields: `id`, `adapterId`, `prompt`, `inputs`, `output`, `onFail`, `isolation`, `timeoutMs`.
- [ ] Run fields: `id`, `workflowId`, `contextId`, `status`, `nodeRuns`, `startedAt`, `finishedAt`, `metadata`.
- [ ] Keep prompt templates plain string first; function prompts can wait.

## Task 2: Validation

- [ ] Validate workflow graph is acyclic.
- [ ] Validate all `inputs` reference existing node ids.
- [ ] Validate adapter selectors resolve before run starts.
- [ ] Validate `onFail` values: `abort`, `continue`, `retry`.
- [ ] Add max node count and max parallelism guardrails.

## Task 3: Runner Core

- [ ] Implement topological scheduling.
- [ ] Run independent nodes concurrently up to a configured limit.
- [ ] Submit each node as an A2A task with shared `contextId`.
- [ ] Wait for child task terminal state through A2A bus/task-store.
- [ ] Collect outputs into downstream prompt context.
- [ ] Apply `onFail` policy.

Implementation constraints:

- The runner should call a single internal task submission service.
- Do not duplicate adapter invocation logic.
- Persist enough run state to show progress after page refresh.

## Task 4: Built-In Workflows

- [ ] Add `multi_model_review`.
- [ ] Add `sequential_handoff`.
- [ ] Add `adversarial_debate`.
- [ ] Seed definitions in code first; SQLite persistence can follow.
- [ ] Make built-ins read-only unless the user explicitly forks them later.

## Task 5: Routes

- [ ] Mount under `/api/orchestration/workflows`.
- [ ] Add `GET /workflows`.
- [ ] Add `POST /workflows/:id/runs`.
- [ ] Add `GET /runs/:runId`.
- [ ] Add `POST /runs/:runId/cancel`.
- [ ] Expose child A2A task ids for direct SSE subscription.

## Task 6: UI

- [ ] Add workflow launcher to dispatch modal.
- [ ] Add workflow run panel with node list and per-node status.
- [ ] Show parallel review streams side-by-side on desktop.
- [ ] Stack streams vertically on mobile.
- [ ] Show final aggregator output as the main result.

First UI should be execution-focused, not an editor.

## Task 7: External A2A Visibility

- [ ] Represent the workflow run as a parent task or a run object linked to child tasks.
- [ ] Keep every child A2A task on the same `contextId`.
- [ ] Add a context stream endpoint only if `/a2a/tasks?contextId=...` plus per-task SSE is not enough.
- [ ] Document how external clients can follow a run.

## Verification

Run:

```bash
npm run typecheck
npm run lint -- server/modules/orchestration src/components/orchestration
```

Manual:

1. Launch sequential handoff on a tiny prompt.
2. Confirm node 2 waits for node 1.
3. Launch multi-model review.
4. Confirm fan-out nodes run concurrently.
5. Force a node failure and confirm `onFail: abort` stops downstream nodes.
6. Confirm all child tasks share one `contextId`.

## Risks

- Workflow runs can become expensive quickly; add max nodes and visible run confirmation.
- Long-running external clients may disconnect; runs must continue server-side.
- Persisted state needs careful cleanup to avoid unbounded task/run growth.
