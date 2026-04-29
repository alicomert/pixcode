# Pixcode v2 Orchestration Auto-Preview Plan

**Date:** 2026-04-29
**Status:** Ready after workspace isolation
**Depends on:** `2026-04-29-orchestration-workspace-isolation.md`

## Goal

Detect dev servers started by CLI tasks, emit A2A `preview-url` artifacts, and show those previews in the UI through a desktop split pane or mobile bottom sheet.

## Current Baseline

- A2A artifacts already support `type: 'preview-url'`.
- No `server/modules/orchestration/preview/` module exists.
- No `src/components/preview/PreviewPane.tsx` exists.
- The spec requires `/preview/<port>/*` proxying later for HTTPS/mobile safety.

## Non-Goals

- Detecting non-HTTP protocols.
- Replacing Vite dev proxy behavior.
- Solving every CSP/X-Frame-Options case.
- Full Docker port detection until Docker workspace is implemented.

## Target Files

Create:

```text
server/modules/orchestration/preview/
- port-watcher.ts
- preview-proxy.ts
- types.ts

src/components/preview/
- PreviewPane.tsx
- PreviewTabs.tsx
- usePreviewArtifacts.ts
```

Modify:

```text
server/modules/orchestration/index.ts
server/modules/orchestration/a2a/routes.ts
server/index.js
src/App.tsx
```

## Task 1: Preview Types

- [ ] Add `PortEvent` with `taskId`, `workspaceId`, `port`, `host`, `url`, `processName`, `detectedAt`.
- [ ] Add `PreviewArtifactData` for the A2A artifact data part.
- [ ] Export preview types through the orchestration barrel.

## Task 2: Host Port Watcher

- [ ] Implement polling watcher for Linux host mode.
- [ ] Start with `ss -ltnp` or `/proc` parsing, depending on what is already available in deployment targets.
- [ ] Scope detection to the adapter process tree when the adapter can expose a pid.
- [ ] De-dupe repeated ports per task.
- [ ] Stop watching when task reaches a terminal state.

Pragmatic first version:

- If adapter pid is not available, detect new listening ports during the task window and mark confidence as `low`.
- Later tighten this when adapters expose child process pid.

## Task 3: A2A Artifact Emission

- [ ] Wire `PortWatcher` into task lifecycle in `routes.ts` or a new orchestration service.
- [ ] Emit artifact:

```ts
{
  artifactId: 'art_...',
  type: 'preview-url',
  parts: [{ kind: 'data', data: { url, port, processName, confidence } }],
  metadata: { source: 'port-watcher', workspaceId }
}
```

- [ ] Persist artifacts through existing `A2ATaskStore`.
- [ ] Include preview counts in task summaries if useful for UI.

## Task 4: Preview Proxy

- [ ] Add `/preview/:port/*` proxy route on the backend.
- [ ] Restrict proxy targets to ports detected for active or recently completed tasks.
- [ ] Reuse existing auth behavior; remote preview access must require authenticated Pixcode access.
- [ ] Add clear fallback metadata when iframe embedding is blocked.

Security constraints:

- Do not proxy arbitrary hostnames.
- Do not accept user-supplied target URLs directly.
- Bind preview proxy to known detected `127.0.0.1:<port>` targets.

## Task 5: Frontend Preview State

- [ ] Add `usePreviewArtifacts(taskId)` to derive preview tabs from A2A artifacts.
- [ ] Render desktop preview as a resizable side pane.
- [ ] Render mobile preview as a bottom sheet.
- [ ] Keep the pane open if the port disappears.
- [ ] Add open-external fallback for iframe-blocked pages.

UI constraints:

- Do not add a marketing/landing surface.
- Keep controls compact: close, open external, reload, tab switch.
- Avoid nested cards; the preview pane is a tool surface.

## Task 6: Integration Points

- [ ] Integrate previews into the active session/task view, not only the future task board.
- [ ] If no orchestration UI exists yet, expose a minimal preview drawer behind A2A task detail.
- [ ] Make the component consume artifacts generically so workflow/task board can reuse it later.

## Verification

Run:

```bash
npm run typecheck
npm run lint -- server/modules/orchestration src/components/preview
```

Manual:

1. Submit an A2A task that starts `npm run client` in a disposable project.
2. Confirm a `preview-url` artifact appears on `GET /a2a/tasks/:id`.
3. Confirm SSE emits the artifact.
4. Confirm desktop iframe opens through `/preview/<port>/`.
5. Confirm mobile layout uses the bottom sheet.

## Risks

- Process-tree scoping is the hard part. Do not overfit the first implementation to one CLI.
- HTTPS mobile access makes reverse proxy support mandatory.
- Some dev servers intentionally reject iframe embedding; fallback must be first-class.
