#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const issues = [
  {
    title: 'feat(vscode-layout): audit existing open issues before workbench rollout',
    body: `Reason
The VS Code-style workbench should be delivered together with the current GitHub issue queue, not as an isolated local note.

Scope
- Read all currently open issues in alicomert/pixcode.
- Mark which issues are directly affected by the VS Code workbench shell.
- Keep unrelated issues open and untouched.
- Add completion notes to related issues after implementation.

Acceptance
- Existing issues are reviewed before release.
- Related issues receive implementation notes.
- No unrelated issue is closed only because this work shipped.`,
  },
  {
    title: 'feat(vscode-layout): add selectable VS Code-style workbench mode',
    body: `Reason
Users are more familiar with the VS Code workspace model, so Pixcode should offer a separate VS Code-style view without removing the existing experience.

Scope
- Add a persisted classic/vscode layout preference.
- Keep the current Pixcode UI available.
- Switch desktop users into the VS Code-style workbench when selected.
- Leave mobile on the existing responsive shell.

Acceptance
- Users can choose between the existing Pixcode view and VS Code-style view.
- The chosen mode persists between sessions.
- Desktop users can enter the new workbench without changing provider/session behavior.`,
  },
  {
    title: 'feat(vscode-layout): build left activity bar and explorer panels',
    body: `Reason
The left side should match the familiar VS Code model: activity buttons plus project/files/source-control/terminal panels.

Scope
- Add Explorer, Projects, Source Control, and Terminal activity buttons.
- Reuse the existing Pixcode project/sidebar component for project and history access.
- Reuse the existing file tree, git panel, and standalone shell.
- Allow the left pane to collapse and resize.

Acceptance
- Project and session selection still works from the new shell.
- File tree actions still open files.
- Left pane can be resized and collapsed.`,
  },
  {
    title: 'feat(vscode-layout): add central editor surface for files and system screens',
    body: `Reason
VS Code users expect file contents and code to live in the middle, while platform screens remain reachable without leaving the workbench.

Scope
- Open file tree selections in the central editor.
- Reuse the existing CodeMirror editor and save/download behavior.
- Render Control Room, Remote, Orchestration, Tasks, and plugin screens in the center when selected.
- Keep the center area responsive between resizable side panes.

Acceptance
- Opening a file from Explorer shows it in the center.
- System screens remain available inside the workbench.
- The center pane remains usable while resizing side panes.`,
  },
  {
    title: 'feat(vscode-layout): add right-side CLI work area for all providers',
    body: `Reason
The selected CLI should run in the right pane, similar to a focused agent/terminal side area in a three-column workbench.

Scope
- Reuse the current chat/CLI orchestration surface in the right pane.
- Preserve Claude Code, Cursor, Codex, Gemini, Qwen Code, and OpenCode selection through existing provider controls.
- Add a terminal tab in the right pane for shell work.
- Allow the right pane to resize.

Acceptance
- Existing provider selection and send flow are reused.
- The right pane can run CLI chat work and terminal work.
- The pane can be resized without layout overlap.`,
  },
  {
    title: 'feat(vscode-layout): expose layout at login and settings before release',
    body: `Reason
Users should be able to choose the new layout on entry and change it later without hunting through hidden configuration.

Scope
- Add layout selection to login.
- Add layout selection to Appearance settings.
- Add translations for supported locales.
- Verify with smoke, typecheck, lint, and build.
- Publish a release only after all issue notes are posted.

Acceptance
- Login includes Classic and VS Code workbench choices.
- Appearance settings includes the same choices.
- Locale coverage exists for all supported language files.
- Release work starts only after verification is clean.`,
  },
];

for (const issue of issues) {
  const result = spawnSync(
    'gh',
    ['issue', 'create', '--repo', 'alicomert/pixcode', '--title', issue.title, '--body', issue.body],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        GH_TOKEN: process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '',
      },
    },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
