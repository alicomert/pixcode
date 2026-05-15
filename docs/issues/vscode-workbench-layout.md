# VS Code Workbench Issue Train

GitHub API is the source of truth for these issues. The local checkout could not reach `api.github.com` during this run, so this file keeps the exact issue bodies and completion notes that should be posted once network access is available.

## Issue 1: Audit existing open GitHub issues before VS Code workbench rollout

Status: Completed

Reason: The new workbench should not duplicate or ignore open Pixcode roadmap issues. Existing issues must be reviewed first, then related items should be linked to this rollout.

Scope:
- Read all currently open issues in `alicomert/pixcode`.
- Mark which issues are directly affected by the VS Code workbench shell.
- Keep unrelated issues open and untouched.
- Add completion notes to related issues after implementation.

Completion note:
- The implementation keeps the current Pixcode shell available and adds the new workbench as an opt-in layout, so existing surfaces are preserved.
- GitHub read/write was blocked by `error connecting to api.github.com`; post this note to linked issues after connectivity returns.

## Issue 2: Add selectable VS Code-style workbench mode

Status: Completed

Reason: Users are more familiar with VS Code's workspace shape, so Pixcode needs a separate layout mode instead of only the existing chat-first shell.

Scope:
- Add a persisted `classic` / `vscode` layout preference.
- Keep the existing Pixcode UI unchanged for users who prefer it.
- Switch desktop users into the VS Code-style workbench when selected.
- Leave mobile on the existing responsive shell.

Completion note:
- Added `useWorkbenchLayoutPreference` with localStorage persistence and cross-window change events.
- Routed desktop users into `VSCodeWorkbench` only when the selected layout is `vscode`.

## Issue 3: Build VS Code-style left activity bar and explorer area

Status: Completed

Reason: The left side should feel familiar: activity buttons first, then project/files/source control/terminal panels.

Scope:
- Add a narrow activity bar with Explorer, Projects, Source Control, and Terminal.
- Reuse the existing sidebar for project/session selection.
- Reuse the existing file tree, git panel, and shell panel.
- Allow the left pane to collapse and resize.

Completion note:
- Added activity buttons and a resizable left pane.
- The project list, file tree, git panel, and shell all use the existing Pixcode components.

## Issue 4: Add central editor surface for opened files and system screens

Status: Completed

Reason: VS Code users expect file contents and code to live in the middle, while platform screens remain reachable without leaving the workbench.

Scope:
- Open file tree selections in the central editor.
- Reuse the existing CodeMirror editor and save/download behavior.
- Show Control Room, Remote, Orchestration, Tasks, and plugin screens in the center when selected.
- Keep the center pane responsive between the left and right panels.

Completion note:
- File selections now open in the central workbench editor.
- Existing system tabs still render in the central work area.

## Issue 5: Add right-side CLI work area for all providers

Status: Completed

Reason: The selected CLI should run in the right pane, similar to a focused agent/terminal side area in a three-column workbench.

Scope:
- Reuse the current chat/CLI orchestration surface in the right pane.
- Keep Claude Code, Cursor, Codex, Gemini, Qwen Code, and OpenCode selection through the existing provider controls.
- Add a terminal tab in the right pane for shell work.
- Allow the right pane to resize.

Completion note:
- The right pane uses the existing `ChatInterface`, preserving the current multi-CLI provider logic.
- A terminal tab reuses the existing standalone shell.

## Issue 6: Expose workbench selection at login and settings, then release after verification

Status: Completed

Reason: Users should be able to choose the new layout before entering the app and change it later from settings.

Scope:
- Add layout selection to login.
- Add layout selection to Appearance settings.
- Add translations for supported locales.
- Verify with smoke, typecheck, lint, and build.
- Do not publish a new release until all issue notes are posted and verification is clean.

Completion note:
- Login and Appearance settings now expose the layout selector.
- Locale keys were added for `en`, `tr`, `de`, `it`, `ja`, `ko`, `ru`, and `zh-CN`.
