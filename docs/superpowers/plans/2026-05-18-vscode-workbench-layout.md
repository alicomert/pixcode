# VS Code Workbench Layout Rollout

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:verification-before-completion before marking any item complete. Track GitHub issue notes as each task closes.

**Goal:** Add a selectable VS Code-style Pixcode workbench so users can work from a three-pane desktop layout: left activity/explorer area, center file/editor/system surface, and right CLI work area for Claude Code, Cursor CLI, Codex, Gemini CLI, Qwen Code, and OpenCode.

**GitHub Issues:** #97, #98, #99, #100, #101, #102

**Implementation Commit:** `f23845345aff99e46802a87cdf8dd5ae5c5756e4`

---

### Task 1: Existing Issue Audit

Issue: #97

- [x] Read current GitHub issues before workbench rollout.
- [x] Confirm old Control Room / TaskMaster issues #92-#96 were already covered by the current codebase.
- [x] Add completion notes and close #92-#96 after smoke verification.

### Task 2: Selectable Workbench Mode

Issue: #98

- [x] Add persistent workbench layout preference storage.
- [x] Keep classic layout available.
- [x] Switch desktop app shell to the VS Code workbench only when the preference is enabled.

### Task 3: Left Activity Bar And Explorer

Issue: #99

- [x] Add VS Code-like activity rail with Explorer, Projects, Source Control, Terminal, orchestration, Control Room, Remote, Tasks, plugins, and settings access.
- [x] Keep left pane resizable and collapsible.
- [x] Reuse existing `FileTree`, `Sidebar`, `GitPanel`, and shell surfaces instead of creating duplicate state.

### Task 4: Center Editor Surface

Issue: #100

- [x] Render selected files in the central `CodeEditor`.
- [x] Route system tabs such as orchestration, remote console, Control Room, TaskMaster, and plugins through the center surface.
- [x] Preserve empty project and empty file states.

### Task 5: Right CLI Work Area

Issue: #101

- [x] Add resizable right pane for provider work.
- [x] Reuse `ChatInterface` so existing CLI provider selection and message flows stay intact.
- [x] Include terminal access in the same right-side work area.

### Task 6: Login And Settings Exposure

Issue: #102

- [x] Add workbench layout choice to login.
- [x] Add workbench layout choice to Appearance settings.
- [x] Add locale keys for `de`, `en`, `it`, `ja`, `ko`, `ru`, `tr`, and `zh-CN`.

### Verification

- [x] `node scripts/smoke/control-room-ux-redesign.mjs`
- [x] `node scripts/smoke/v146-control-room-ui.mjs`
- [x] `node scripts/smoke/taskmaster-config.mjs`
- [x] `node scripts/smoke/vscode-workbench-layout.mjs`
- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run build`
- [x] `npm pack --dry-run --ignore-scripts --json --cache /tmp/npm-cache`

### Release Notes

- The workbench feature has been pushed to `main` in commit `f23845345aff99e46802a87cdf8dd5ae5c5756e4`.
- Release publishing still requires a version bump and the normal GitHub/npm/desktop asset release workflow.
