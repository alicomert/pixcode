# Changelog

All notable changes to Pixcode will be documented in this file.

## [1.49.5](https://github.com/alicomert/pixcode/compare/v1.49.4...v1.49.5) (2026-05-20)

Pixcode 1.49.5 makes the Hermes activity button behave like the working terminal command and keeps Hermes sessions alive in the backend.

### Fixes

* **hermes:** launch the same interactive Hermes entrypoint used by typing `hermes` instead of forcing the `chat --toolsets` subcommand.
* **hermes:** make Pixcode MCP configuration best-effort so a config write failure does not block the Hermes terminal from opening.
* **hermes:** keep Hermes PTYs alive until the process exits, so closing the panel or switching workspaces can reconnect to the same backend session.
* **workbench:** move the welcome Görünüm controls below Proje Aç / Klonla / Hermes’i Başlat and make the action cards auto-wrap in narrow spaces.

## [1.49.4](https://github.com/alicomert/pixcode/compare/v1.49.3...v1.49.4) (2026-05-20)

Pixcode 1.49.4 fixes the Windows Hermes terminal PATH gap found after 1.49.3.

### Fixes

* **hermes:** add Hermes install directories to every Pixcode shell PTY environment so `hermes` works inside the project terminal after the backend has repaired the launcher.
* **hermes:** prime Hermes PATH entries at server boot without clearing project Python environment variables.
* **workbench:** tighten the Hermes activity button monogram while keeping the dedicated `H` launcher under Terminal.

## [1.49.3](https://github.com/alicomert/pixcode/compare/v1.49.2...v1.49.3) (2026-05-20)

Pixcode 1.49.3 hardens Hermes Agent launch, install status, and settings visibility.

### Fixes

* **hermes:** verify Hermes command candidates before launching so stale PATH shims no longer start the wrong command or open the launcher script as text.
* **hermes:** repair POSIX and Windows Hermes command shims after install/status checks, including a Windows `hermes.cmd` launcher.
* **workbench:** keep Hermes install logs auto-scrolled, add a dedicated `H` activity button under Terminal, and pause right-panel CLI auto-connect while Hermes opens in the bottom terminal.
* **settings:** move Hermes Agent out of the Agents picker into a dedicated Settings page with install, repair, start, refresh, and status controls.

### Tests

* verify Hermes API install smoke, VS Code workbench smoke, Hermes status parsing, backend syntax, typecheck, lint, production build, and shell `hermes --version` after shim repair.

## [1.49.2](https://github.com/alicomert/pixcode/compare/v1.49.1...v1.49.2) (2026-05-20)

Pixcode 1.49.2 moves Hermes install and repair into a backend API job so installs no longer depend on terminal command paste behavior.

### Fixes

* **hermes:** add `POST /api/orchestration/hermes/install` with EventSource log streaming, cancellation, install-status reuse, and Pixcode MCP configuration after install.
* **hermes:** make the VS Code workbench install/start buttons use the Hermes API job and show install logs in the bottom panel instead of launching a shell install command.
* **hermes:** download the official installer in backend code, retry with the system download tool when Node fetch fails, skip interactive setup/browser downloads on POSIX installs, and verify `hermes --version` before reporting success.

### Tests

* verify the dedicated Hermes API install smoke, workbench smoke, backend syntax, typecheck, lint, production build, and an isolated `/tmp` Hermes install through the new backend job path.

## [1.49.1](https://github.com/alicomert/pixcode/compare/v1.49.0...v1.49.1) (2026-05-20)

Pixcode 1.49.1 fixes Hermes installation, Hermes settings visibility, and AI CLI bypass-permission launch flags.

### Fixes

* **hermes:** detect an existing Hermes binary before offering install, remove the docs shortcut from the terminal header, and expose Hermes Agent in Settings > Agents.
* **hermes:** avoid antivirus-blocked Windows `irm | iex` install execution by downloading the installer to a temp file before running PowerShell with `-File`.
* **cli:** pass provider-specific permission bypass flags for Codex, Cursor, Gemini, Qwen, OpenCode, and Claude-backed terminal sessions.

### Tests

* verify Hermes workbench coverage, VS Code workbench polish, server syntax, typecheck, lint, production build, package contents, npm publish, registry metadata, and tarball download.

## [1.49.0](https://github.com/alicomert/pixcode/compare/v1.48.6...v1.49.0) (2026-05-20)

Pixcode 1.49.0 ships the Hermes control workbench and a simpler VS Code-style welcome flow.

### New Features

* **hermes:** configure Pixcode as a Hermes MCP server with project listing, provider status checks, and visible CLI terminal launch tools.
* **workbench:** replace the old workspace start screen with a compact welcome page for opening projects, cloning repositories, starting Hermes, recent projects, and theme controls.
* **terminal:** make the bottom terminal resizable and minimizable, and add shrink/expand/collapse controls for the right CLI panel.

### Fixes

* **hermes:** launch Hermes from the bottom terminal instead of the right CLI picker and expand Hermes commands on the server host so Windows browsers do not send PowerShell syntax to Linux servers.
* **theme:** default new installs to the dark workbench while preserving any saved user theme preference.
* **updates:** skip npm install and build during source updates when package manifests or build inputs did not change.

### Tests

* verify the new workbench welcome actions, Hermes MCP bridge, terminal resizing, smart source updater, typecheck, lint, and production build.

## [1.48.6](https://github.com/alicomert/pixcode/compare/v1.48.5...v1.48.6) (2026-05-20)

Pixcode 1.48.6 republishes the 1.48.5 workbench update with a verified npm runtime tarball.

### Fixes

* **release:** move latest from the broken 1.48.5 npm artifact to a fresh 1.48.6 package and verify the registry tarball can be downloaded by runtime-dir updates.

### Tests

* verify npm metadata, npm tarball download, GitHub release assets, remote main, and remote tag after publish.

## [1.48.5](https://github.com/alicomert/pixcode/compare/v1.48.4...v1.48.5) (2026-05-20)

Pixcode 1.48.5 adds a project-scoped terminal/Hermes pass to the VS Code workbench.

### New Features

* **workbench:** add scroll controls to the workspace tab strip and a fixed end-of-strip toggle to fully hide or show the right CLI panel.
* **terminal:** move the Terminal activity to a VS Code-style bottom panel that opens a plain shell in the active project instead of auto-starting the selected AI CLI.
* **hermes:** add a right-panel Hermes Agent launcher with project-scoped start/install actions and official docs access.

### Fixes

* **shell:** spawn an interactive plain shell when no initial command is supplied, while still allowing explicit Hermes/install commands to run in the project directory.
* **orchestration:** remove the old workbench orchestration entry points so Hermes is the personal agent control surface.
* **i18n:** add the new workspace, CLI panel, terminal, and Hermes copy across all supported locales.

### Tests

* extend workbench smoke coverage for workspace overflow controls, right CLI collapse, bottom plain-shell terminal behavior, Hermes launch, and old orchestration removal.

## [1.48.4](https://github.com/alicomert/pixcode/compare/v1.48.3...v1.48.4) (2026-05-20)

Pixcode 1.48.4 fixes the VS Code workbench workspace add button and makes the right CLI panel preserve and reset sessions correctly.

### Fixes

* **workspace-tabs:** restyle the add-workspace button as a centered tab-bar control instead of an off-center bare icon.
* **cli:** persist the open terminal, selected provider, and selected history session per project so switching workspaces returns to the same CLI view automatically.
* **cli:** make the terminal toolbar plus button return to the CLI picker before starting a fresh session.
* **shell:** send an explicit fresh-session flag to the backend and terminate cached provider PTYs so “new CLI session” does not reconnect the previous terminal.

### Tests

* extend workbench smoke coverage for the redesigned workspace add button, per-project CLI state restore, fresh-session picker flow, and backend PTY replacement.

## [1.48.3](https://github.com/alicomert/pixcode/compare/v1.48.2...v1.48.3) (2026-05-20)

Pixcode 1.48.3 tightens the VS Code workbench workspace tabs, Projects panel, Source Control side panel, and OpenCode terminal rendering.

### Fixes

* **workspace-tabs:** keep workspace tabs in their original order when selected, align the add-workspace button, and move tab actions to a right-click menu with rename, star, close, close others, and close all.
* **projects:** make the Projects side panel denser and switch back to Explorer immediately after a project is selected.
* **cli:** keep project history and a new-session plus button visible in the right terminal pane while a CLI is running.
* **source-control:** add compact workbench Source Control controls so narrow side panels use icon-first actions instead of overflowing labels.
* **terminal:** disable the xterm WebGL renderer and refresh terminal rows after streamed output to avoid stale glyph trails with OpenCode output.
* **i18n:** add the new workspace tab close actions across all supported locales.

### Tests

* extend workbench smoke coverage for stable workspace tab ordering, right-click workspace actions, compact Source Control, project-to-Explorer selection, visible CLI history/new-session actions, and stable terminal rendering.

## [1.48.2](https://github.com/alicomert/pixcode/compare/v1.48.1...v1.48.2) (2026-05-19)

Pixcode 1.48.2 tightens the VS Code workbench tab, CLI, and Explorer refresh behavior.

### Fixes

* **workspace-tabs:** move the add-workspace button beside the last open workspace tab instead of pinning it to the far right of the workbench.
* **cli:** split the right panel into a CLI picker and a full-height terminal so provider selection no longer steals space from the running terminal.
* **shell:** make the terminal close button return to the CLI picker instead of leaving the dead "Continue in Shell" overlay.
* **explorer:** keep the current file tree visible during websocket-backed refreshes and highlight changed files without a manual reload.
* **i18n:** add the new CLI picker copy across all supported locales.

### Tests

* extend VS Code workbench smoke coverage for CLI picker-to-terminal flow, close behavior, and non-disruptive Explorer refreshes.

## [1.48.1](https://github.com/alicomert/pixcode/compare/v1.48.0...v1.48.1) (2026-05-19)

Pixcode 1.48.1 polishes the VS Code workbench after the 1.48 launch.

### Fixes

* **workbench:** move workspaces into a persistent Chrome-style tab bar under the menu with add, close, rename, and star actions.
* **editor:** keep file tabs from shrinking by adding a scrollable tab strip, overflow controls, and a right-click menu for close, close all, copy path, split right, and split/move right.
* **cli:** restore provider icons, auto-start the selected CLI terminal when available, and surface install/update actions for missing or outdated CLIs in the right panel.
* **history:** replace the cramped CLI history list with a project-scoped, provider-icon history panel.
* **i18n:** add workbench/CLI/editor copy across all supported locales.

### Tests

* extend VS Code workbench smoke coverage for workspace tabs, editor tab menus, provider install/update state, and project-scoped CLI history.

## [1.48.0](https://github.com/alicomert/pixcode/compare/v1.47.5...v1.48.0) (2026-05-19)

Pixcode 1.48.0 makes the VS Code workbench the only desktop experience, removes the TaskMaster product surface, and moves orchestration behind Hermes Agent.

### Breaking Changes

* **workbench:** remove the Classic Pixcode desktop layout switcher from login, settings, and the runtime shell.
* **taskmaster:** remove TaskMaster UI, settings, onboarding, backend routes, and public API manifest entries.

### New Features

* **workbench:** open directly on a project/workspace landing with project cards, add/open/clone actions, and workspace slots in Explorer.
* **editor:** add a tabbed Monaco editing surface in the center pane for opened files.
* **cli:** make the right workbench panel a terminal-first CLI surface with provider launch, new-session, and project-scoped history controls.
* **orchestration:** add Hermes Agent status/context/agent/task APIs and route internal task dispatch through `/hermes`.

### Fixes

* **files:** refresh the Explorer tree when project/file websocket updates arrive so AI-created files appear without a manual reload.
* **shell:** stop automatically opening Codex in the workbench terminal and remove the stuck chat/continue shell handoff.
* **docs:** replace public TaskMaster/A2A wording with Hermes/workbench terminology.

### Tests

* add Pixcode 1.48 workbench smoke coverage for Classic removal, workspace landing, tabbed editor state, terminal-only right panel, TaskMaster removal, Hermes routing, and file refresh events.

## [1.47.5](https://github.com/alicomert/pixcode/compare/v1.47.4...v1.47.5) (2026-05-19)

Pixcode 1.47.5 fixes provider status cards in the VS Code workbench picker.

### Fixes

* **provider-picker:** show `Checking…` only while provider status requests are actively loading.
* **provider-picker:** show a localized unavailable state with retry when a completed status check returns an unknown/error result.
* **providers:** add bounded frontend status request timeouts and a Gemini OAuth tokeninfo timeout so slow provider checks cannot leave the picker stuck.

### Tests

* add smoke coverage for provider picker status states, frontend aborts, and Gemini tokeninfo abort signals.

## [1.47.4](https://github.com/alicomert/pixcode/compare/v1.47.3...v1.47.4) (2026-05-19)

Pixcode 1.47.4 makes the VS Code workbench file editor use the real Monaco editor for regular text files.

### Fixes

* **editor:** replace regular file editing with lazy-loaded Monaco so Ctrl/Cmd+A, mouse selection, line-number selection, and pane resizing behave like a VS Code editor.
* **editor:** keep the existing CodeMirror merge/diff fallback for changed-file review flows.
* **editor:** preserve Pixcode save, theme, line-number, font-size, word-wrap, and language-detection settings in the Monaco path.

### Tests

* add smoke coverage for the Monaco editor engine, VS Code-style editor commands, line-number selection, resizable pane layout, and diff fallback.

## [1.47.3](https://github.com/alicomert/pixcode/compare/v1.47.2...v1.47.3) (2026-05-18)

Pixcode 1.47.3 makes source-install updates use normal Pixcode-facing commands.

### Fixes

* **update:** show `pixcode update --restart-daemon` in the version modal instead of exposing the internal git updater script.
* **update:** make `pixcode update` route git/source installs through the safe updater and rebuild the app after dependencies are reconciled.
* **update:** keep automatic update progress logs product-facing with `Pixcode source update`.

### Tests

* add smoke coverage for the source-update command UX, CLI route, build step, and update stream wording.

## [1.47.2](https://github.com/alicomert/pixcode/compare/v1.47.1...v1.47.2) (2026-05-18)

Pixcode 1.47.2 hardens Linux source updates and fixes two VS Code workbench regressions.

### Fixes

* **update:** replace the raw `git checkout main && git pull && npm install` path with a safe updater that stashes dirty checkout state, fast-forwards from `origin/main`, creates a backup branch before reset-based recovery, and installs dependencies without audit noise.
* **workbench:** keep the Projects activity selected on the first click instead of bouncing back to Explorer while the center chat tab is active.
* **editor:** force a real light CodeMirror theme/background and align the default editor theme with the app light/dark mode unless the editor theme was customized separately.

### Tests

* add smoke coverage for dirty git source updates, Projects activity selection, and light editor theme handling.

## [1.47.1](https://github.com/alicomert/pixcode/compare/v1.47.0...v1.47.1) (2026-05-18)

Pixcode 1.47.1 polishes the new VS Code-style workbench so narrow three-pane layouts stay usable.

### Fixes

* **workbench:** replace the Projects activity chat-history sidebar with a project-directory list that shows shortened paths and file counts.
* **workbench:** add File/Edit/Selection/View/Go/Run/Terminal/Help menus and route Open Project / Clone Repository through the existing workspace wizard.
* **workbench:** stop Settings from carrying over after switching between classic and VS Code layouts.
* **chat:** keep provider cards, composer controls, send, and multi-project worker slots visible in the compact right CLI pane.
* **landing:** make the Start Pixcode workspace cards auto-fit instead of forcing cramped fixed columns.

### Tests

* add smoke coverage for the polished workbench project, menu, compact composer, and file-count flows.

## [1.47.0](https://github.com/alicomert/pixcode/compare/v1.46.7...v1.47.0) (2026-05-18)

Pixcode 1.47.0 adds a selectable VS Code-style workbench layout for desktop users.

### New Features

* **workbench:** add a three-pane VS Code-style layout with a left activity/explorer area, central editor/system surface, and right CLI work area.
* **workbench:** let users switch between classic and VS Code layouts from login and Appearance settings.
* **workbench:** reuse existing file tree, editor, chat/provider, terminal, project, git, Control Room, remote, TaskMaster, and plugin surfaces in the new layout.

### Documentation

* **superpowers:** record the GitHub issue rollout and verification notes for the VS Code workbench layout.

## [1.42.1](https://github.com/alicomert/pixcode/compare/v1.42.0...v1.42.1) (2026-05-12)

Pixcode 1.42.1 standardizes the orchestration init context packet every workflow agent receives.

### New Features

* **orchestration:** add the `pixcode.context.v1` context packet contract with original request, project metadata, task metadata, constraints, upstream artifacts, run state, and compaction metadata.
* **orchestration:** persist the context packet on workflow node runs so init context is inspectable.
* **orchestration:** inject the structured context packet after the original user request and before derived workspace context.
* **orchestration:** surface context packet preparation and compaction metadata in workflow traces.

### Tests

* add smoke coverage for context packet schema, prompt ordering, persisted node-run context, and trace visibility.

## [1.42.0](https://github.com/alicomert/pixcode/compare/v1.41.5...v1.42.0) (2026-05-12)

Pixcode 1.42.0 starts the real orchestration roadmap with a structured handoff artifact protocol between agents.

### New Features

* **orchestration:** add the `pixcode.handoff.v1` artifact schema with task status, compacted context, task result, changed files, blockers, risks, next action, and next instructions.
* **orchestration:** require handoff, init, and compact nodes to produce a validated handoff artifact instead of relying only on prompt text.
* **orchestration:** persist validated handoff artifacts on workflow node runs and pass the structured artifact forward as downstream context.
* **orchestration:** surface handoff artifacts in workflow outputs and trace timelines.

### Reliability

* fail invalid handoff artifacts visibly with a recoverable workflow node error.
* add smoke coverage for the handoff schema, runner validation, trace labeling, and UI artifact rendering.

## [1.41.5](https://github.com/alicomert/pixcode/compare/v1.41.4...v1.41.5) (2026-05-12)

Pixcode 1.41.5 unifies Live View into a single preview environment model for framework detection, custom commands, runtime diagnostics, logs, responsive preview, and future tunnel state.

### New Features

* **live-view:** add a preview environment contract that joins target detection, active session status, runner command, runtime state, logs, diagnostics, and tunnel readiness.
* **live-view:** expose framework and custom-command state through the same environment payload used by status, start, and restart responses.
* **live-view:** render the environment model in the panel so framework, command, upstream, tunnel state, diagnostics, logs, and responsive preview controls stay in one surface.

### Tests

* add smoke coverage for the Live View environment contract and UI wiring.

## [1.41.4](https://github.com/alicomert/pixcode/compare/v1.41.3...v1.41.4) (2026-05-12)

Pixcode 1.41.4 introduces the shared runtime manager boundary used by Live View runtime checks.

### New Features

* **runtime:** add a central runtime manager registry for Node.js, PHP, Python, Go, Java, and Rust discovery.
* **live-view:** route JavaScript package-runner and PHP runtime decisions through the runtime manager while preserving managed npm and FrankenPHP hooks.
* **live-view:** expose runtime diagnostics on Live View session payloads so the UI/API can grow without changing runtime detection internals.

### Maintenance

* replace duplicated Live View runtime availability checks with reusable runtime manager diagnostics.
* add smoke coverage for runtime discovery, managed Node package-runner fallback, managed PHP fallback, and Live View integration.

## [1.41.3](https://github.com/alicomert/pixcode/compare/v1.41.2...v1.41.3) (2026-05-12)

Pixcode 1.41.3 adds the first workflow trace timeline so orchestration runs can be inspected step by step without reading raw logs.

### New Features

* **orchestration:** add a provider-independent trace event schema and `/api/orchestration/workflows/runs/:runId/trace` endpoint.
* **orchestration:** derive timeline events for run start/finish, node execution, provider calls, prompts, agent messages, file-diff artifacts, command/preview artifacts, and errors.
* **orchestration:** add a trace timeline tab with actor, provider, type, and severity filters in the workflow run panel.

### Maintenance

* redact workspace paths, email addresses, and common token shapes from trace summaries before returning them to the UI.
* add smoke coverage for the trace event contract, API route, UI timeline wiring, and English/Turkish labels.

## [1.41.2](https://github.com/alicomert/pixcode/compare/v1.41.1...v1.41.2) (2026-05-12)

Pixcode 1.41.2 stabilizes chat and orchestration state refresh by introducing a shared browser run-state refresh event and wiring terminal run snapshots back into active UI caches.

### Bug Fixes

* **chat:** refresh the active session from persisted server messages after chat completion, failure, cancellation, and reconnect paths.
* **orchestration:** merge workflow run snapshots from the run panel back into the run list so completion status updates without a manual refresh.
* **changes:** refresh changed-file monitoring on canonical chat/orchestration run-state events.

### Tests

* add smoke coverage for chat completion refresh, changed-files refresh events, and orchestration snapshot merging.
* keep the changed-files smoke resilient while still asserting that `latestMessage` reaches the monitor.

## [1.41.1](https://github.com/alicomert/pixcode/compare/v1.41.0...v1.41.1) (2026-05-12)

Pixcode 1.41.1 moves provider model selection behind a shared server registry so chat, orchestration, Telegram, and API consumers stop drifting across stale static lists.

### New Features

* **models:** add a provider model registry service with defaults, static fallbacks, live catalog results, and freshness/degraded metadata.
* **models:** return `defaultModel`, `error`, and `freshness` from `/api/providers/:provider/models` so catalog fallback reasons stay visible.

### Maintenance

* route orchestration model validation, Telegram model fallback, slash command model lists, and legacy API defaults through the shared registry.
* document the registry contract and add smoke coverage for provider support, fallback markers, defaults, and degraded metadata.

## [1.41.0](https://github.com/alicomert/pixcode/compare/v1.40.10...v1.41.0) (2026-05-12)

Pixcode 1.41.0 starts the reliability and observability roadmap by centralizing notification event naming and delivery metadata across chat, orchestration, approvals, failures, updates, and Live View diagnostics.

### New Features

* **notifications:** add a shared notification taxonomy with stable `eventType`, `category`, `preferenceKey`, `kind`, `severity`, and `requiresUserAction` metadata.
* **notifications:** expose `GET /api/settings/notification-taxonomy` so UI, Telegram, API, and future webhook consumers can subscribe to the same contract.
* **notifications:** represent the required roadmap event types: `chat.done`, `orchestration.done`, `approval.needed`, `error`, `test.failed`, and `live_view.failed`.

### Maintenance

* document the notification taxonomy and preserve backward-compatible preference keys for existing user settings.
* add smoke coverage for notification event normalization and preference mapping.

## [1.40.10](https://github.com/alicomert/pixcode/compare/v1.40.9...v1.40.10) (2026-05-12)

Pixcode 1.40.10 cleans the repository release surface before the next roadmap work and keeps personal project workspaces out of published source history.

### Maintenance

* remove committed per-version release note/tracking files from the repository root.
* remove the committed personal `projects/pixcode-project-12` workspace from the repository.
* ignore future `RELEASE_NOTES_*`, `RELEASE_TRACKING_*`, and local `projects/` workspace files.
* document that every GitHub release must include the desktop installer assets (`.deb`, `.dmg`, `.AppImage`, `.exe`), copied from the last complete asset set when a desktop rebuild is not needed.

## [1.40.9](https://github.com/alicomert/pixcode/compare/v1.40.8...v1.40.9) (2026-05-12)

Pixcode 1.40.9 fixes the remaining Live View startup regressions and restores reliable completion notifications for chat and orchestration runs.

### Bug Fixes

* **live-view:** install JavaScript project dependencies with dev dependencies included, fixing Vite projects that installed packages but still failed with `'vite' is not recognized`.
* **live-view:** add the managed FrankenPHP runtime directory and extension directory to the spawned process PATH, fixing Windows PHP launches that still exited with `3221225781` after runtime install.
* **notifications:** make local notification ids unique per run event while keeping server dedupe intact, so completed chat sessions can notify more than once per session.
* **orchestration:** attach the authenticated user id to workflow runs and emit completion/failure notifications when orchestration runs finish.

### Tests

* extend Live View smoke coverage for dev dependency installation and managed PHP runtime PATH propagation.
* extend notification smoke coverage for repeated completion notifications and orchestration terminal notifications.

## [1.40.8](https://github.com/alicomert/pixcode/compare/v1.40.7...v1.40.8) (2026-05-12)

Pixcode 1.40.8 fixes the remaining Live View managed-runtime failures across desktop/server installs. The runtime preparation path is kept cross-platform for Windows, macOS, and Linux.

### Bug Fixes

* **live-view:** preserve sidecar files from the FrankenPHP archive instead of copying only `frankenphp.exe`, fixing Windows launches that exited with `3221225781` / `0xC0000135`.
* **live-view:** keep managed FrankenPHP selection and install paths OS/architecture aware for Windows, macOS, and Linux rather than using a Windows-only runtime assumption.
* **live-view:** treat an installed managed FrankenPHP binary that cannot start as missing so Pixcode can reinstall a complete runtime automatically.
* **live-view:** prepare missing JavaScript project dependencies before starting package-script previews, so Vite/React projects without `node_modules` no longer fail with `'vite' is not recognized`.
* **live-view:** surface dependency preparation in the Live View log before launching the project server.

### Tests

* extend Live View smoke coverage for missing Vite dependency installation, FrankenPHP sidecar preservation, and broken managed runtime reinstallation.

## [1.40.7](https://github.com/alicomert/pixcode/compare/v1.40.6...v1.40.7) (2026-05-11)

Pixcode 1.40.7 fixes orchestration model drift and makes debate/team workflows keep the real user request in front of every agent.

### Bug Fixes

* **orchestration:** load the same live provider model catalog used by chat so agent model selectors do not get stuck on stale static OpenCode entries.
* **orchestration:** validate each workflow node model server-side before submitting A2A tasks, falling back to the closest available live model when a saved model has rotated out.
* **opencode:** stop merging stale static Zen free models into a successful models.dev catalog, preventing `Model not found` failures for removed freebies such as `hy3-preview-free` and `ling-2.6-flash-free`.
* **orchestration:** label the original user request first in every workflow prompt so agents answer the actual task instead of the workspace context header.

### Tests

* add smoke coverage for OpenCode live model catalog merging and orchestration/chat model synchronization.
* re-run provider model smoke, orchestration model sync smoke, typecheck, and lint before publishing.

## [1.40.6](https://github.com/alicomert/pixcode/compare/v1.40.5...v1.40.6) (2026-05-11)

Pixcode 1.40.6 fixes the managed runtime bootstrap paths reported from Live View after the 1.40.5 rollout.

### Bug Fixes

* **live-view:** request npm runtime metadata with an npm-compatible JSON `Accept` header instead of GitHub's media type, preventing HTTP 406 failures when starting Vite and package-script projects.
* **live-view:** only attach GitHub bearer auth to GitHub runtime URLs, keeping npm registry and custom runtime downloads clean.
* **live-view:** pass Windows `Expand-Archive` paths through an explicit PowerShell param block so FrankenPHP zip extraction receives the archive and target directory reliably.

### Tests

* extend Live View smoke coverage for managed npm metadata headers, local npm runtime installation, and Windows PowerShell archive extraction command construction.

## [1.40.5](https://github.com/alicomert/pixcode/compare/v1.40.4...v1.40.5) (2026-05-11)

Pixcode 1.40.5 hardens Live View runtime startup so PHP and Vite projects can start from the app without relying on a fragile system `PATH`.

### Bug Fixes

* **live-view:** always route PHP previews through Pixcode's managed FrankenPHP runtime instead of trusting an external `php` binary.
* **live-view:** add a Pixcode-managed npm runner so Vite, React, Next.js, Nuxt, Astro, and package-script projects stay runnable even when `npm` is not visible to the desktop/server process.
* **live-view:** show an explicit runtime preparation state while Pixcode downloads and installs the required runtime locally.
* **live-view:** use a cross-platform JavaScript tar extractor for managed runtime archives instead of depending on a host `tar` command.

### Tests

* extend Live View integration smoke coverage for missing npm, external PHP avoidance, managed runtime progress UI, and runtime extraction support.
* re-run Live View integration smoke, typecheck, lint, production build, and npm pack dry-run before publishing.

## [1.40.4](https://github.com/alicomert/pixcode/compare/v1.40.3...v1.40.4) (2026-05-11)

Pixcode 1.40.4 starts the Live View managed-runtime layer so users do not have to manually install PHP just to preview a PHP project.

### New Features

* **live-view:** add Pixcode-managed runtimes under the user profile, starting with a local FrankenPHP runtime for PHP previews.
* **live-view:** automatically select the managed PHP runner when `php` is missing, keeping PHP projects runnable without global PATH setup.
* **live-view:** prepare managed PHP on demand across Windows, macOS, and Linux, with Windows zip and macOS/Linux tarball extraction support.

### Bug Fixes

* **live-view:** replace technical PHP PATH guidance with product-level "Pixcode will prepare the runtime" messaging.
* **live-view:** avoid Windows shell quoting issues when launching a Pixcode-managed `.exe` runtime from an absolute path.

### Tests

* extend Live View integration smoke coverage for managed PHP detection, cross-platform runtime asset handling, and runtime preparation UI.
* re-run Live View integration smoke, typecheck, lint, production build, and npm pack dry-run before publishing.

## [1.40.3](https://github.com/alicomert/pixcode/compare/v1.40.2...v1.40.3) (2026-05-11)

Pixcode 1.40.3 makes Live View safer on machines that do not have the detected runtime installed, especially PHP on Windows.

### Bug Fixes

* **live-view:** preflight detected process runners before launch so missing PHP, Node package managers, Python, Go, Rust, and similar runtimes do not create broken preview sessions.
* **live-view:** show a clear unavailable-runner message in the Live View panel when the selected project needs a runtime that is not in `PATH`.
* **live-view:** keep the detected framework and command visible so users can install the missing runtime or use a custom command with the full executable path.

### Tests

* extend Live View integration smoke coverage for missing PHP runtime detection and unavailable-runner UI messaging.
* re-run Live View integration smoke, typecheck, lint, production build, and npm pack dry-run before publishing.

## [1.40.2](https://github.com/alicomert/pixcode/compare/v1.40.1...v1.40.2) (2026-05-11)

Pixcode 1.40.2 makes Live View failures actionable, especially for process-backed runners such as PHP, Node, React, Vite, Next.js, and custom commands.

### Bug Fixes

* **live-view:** stop hiding failed process sessions behind a generic `Live View session not found` response.
* **live-view:** show a diagnostic HTML page on `/live/<share-id>/` when the runner is starting, stopped, errored, or unreachable.
* **live-view:** include the attempted command, upstream URL, port, exit/spawn details, recent logs, and framework-specific suggestions in diagnostic responses.
* **live-view:** show the real runner error and latest logs directly inside the Live View panel, with a Restart action for failed runners.

### Tests

* add Live View diagnostic smoke coverage for PHP runner failures and public diagnostic rendering.
* extend Live View integration smoke coverage for visible runner errors and restart controls.
* re-run Live View diagnostics smoke, Live View integration smoke, chat timeline smoke, Changes panel smoke, chat composer layout smoke, orchestration mobile scroll smoke, typecheck, lint, production build, and npm pack dry-run before publishing.

## [1.40.1](https://github.com/alicomert/pixcode/compare/v1.40.0...v1.40.1) (2026-05-11)

Pixcode 1.40.1 tightens the Live View and chat experience after the first Live View rollout.

### Bug Fixes

* **live-view:** move Live View into the same split/full side-panel behavior as Files, Source Control, and Changes instead of taking over the primary workspace.
* **live-view:** clear the stopped preview iframe immediately after Stop so the panel does not show a stale `/live` error response.
* **live-view:** add editable preview resolution controls with Desktop, Tablet, Mobile, and custom width/height modes.
* **chat:** order normalized messages by timeline before rendering so older tool events cannot remain stuck below later assistant replies.

### Tests

* add smoke coverage for Live View side-panel registration, stopped-session clearing, resolution controls, and chat message timeline ordering.
* re-run Live View smoke, chat timeline smoke, Changes panel smoke, chat composer layout smoke, typecheck, lint, production build, and npm pack dry-run before publishing.

## [1.40.0](https://github.com/alicomert/pixcode/compare/v1.39.2...v1.40.0) (2026-05-11)

Pixcode 1.40.0 adds project Live View: a first-class tab that detects runnable web projects, starts or serves them locally, and exposes a share link through Pixcode's existing External Access tunnel when available.

### New Features

* **live-view:** add a `Live View` / `Canlı Görünüm` top tab after `Changes`, with an availability indicator when Pixcode detects a runnable project.
* **live-view:** detect common project entry points automatically, including Vite, Next.js, Nuxt, Astro, package scripts, Django, FastAPI, Flask, Go, Rust, PHP, and static `index.html`.
* **live-view:** start detected runners with a stable local port, serve static HTML directly, keep recent logs visible, and allow a custom command override for uncommon stacks.
* **sharing:** expose running previews through `/live/<share-id>/` and show both local and secure-tunnel share links when External Access is running.

### Tests

* add Live View integration smoke coverage for tab registration, route mounting, detection, static session startup, and share-path generation.
* re-run Live View smoke, chat composer layout smoke, Changes panel smoke, orchestration mobile scroll smoke, typecheck, lint, production build, and npm pack dry-run before publishing.

## [1.39.2](https://github.com/alicomert/pixcode/compare/v1.39.1...v1.39.2) (2026-05-11)

Pixcode 1.39.2 removes the last empty layout gap left behind by the old Command Center rail.

### Bug Fixes

* **chat:** restore the full-width flex wrapper around the chat surface so the composer and messages no longer leave a blank right-side reservation when `Changes` is closed.
* **orchestration:** restore the same full-width flex wrapper around orchestration surfaces so the run/setup layout fills the available area without the removed Command Center rail.

### Tests

* extend chat composer layout smoke coverage to require the full-width `flex-1` content wrappers.
* re-run Changes panel smoke, chat composer layout smoke, orchestration mobile scroll smoke, typecheck, lint, production build, diff whitespace check, and npm pack dry-run before publishing.

## [1.39.1](https://github.com/alicomert/pixcode/compare/v1.39.0...v1.39.1) (2026-05-11)

Pixcode 1.39.1 fixes the chat and orchestration layout regression from 1.39.0 and moves changed-file awareness into a normal top navigation panel.

### Bug Fixes

* **chat:** keep the composer pinned inside the chat frame even when the changed-files panel is closed, so the input no longer drops below the viewport or disappears.
* **orchestration:** keep orchestration inside a stable full-height flex frame so the page scroll behavior does not depend on the old Command Center rail.
* **changes:** promote Command Center to a first-class `Changes` side panel beside Chat, Orchestration, Shell, Files, and Source Control.
* **quick-settings:** remove the Command Center enable/disable switch from Quick Settings; changed-file tracking now powers file highlights and the optional Changes panel directly.

### Tests

* add smoke coverage for the `Changes` side-panel layout and Quick Settings removal.
* re-run Changes panel smoke, chat composer layout smoke, orchestration mobile scroll smoke, typecheck, lint, production build, and diff whitespace check before publishing.

## [1.39.0](https://github.com/alicomert/pixcode/compare/v1.38.5...v1.39.0) (2026-05-11)

Pixcode 1.39.0 adds custom OpenAI-compatible TaskMaster configuration and refreshes the public-facing project presentation for open-source discovery, contributor onboarding, and GitHub Pages SEO.

### New Features

* **taskmaster:** add custom OpenAI-compatible API key, API URL, and model fields to TaskMaster Settings.
* **taskmaster:** map custom OpenAI-compatible values into `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `OPENAI_MODEL` for TaskMaster CLI execution while preserving aliases for compatible tooling.
* **docs:** rebuild the README as a complete open-source project overview with install commands, screenshots, feature map, API examples, TaskMaster notes, security guidance, and contribution links.
* **site:** redesign the GitHub Pages landing page as a text-first product page that explains what Pixcode does, supported CLIs, orchestration, TaskMaster, API automation, and install paths.
* **community:** add `CODE_OF_CONDUCT.md`, `SECURITY.md`, and a `good first issue` template for public contribution flow.

### Bug Fixes

* **chat:** pin the chat composer to the bottom of the chat frame with measured message-pane padding so it no longer jumps between empty, split-panel, side-panel, and active-session layouts.
* **orchestration:** allow page-level vertical scrolling before desktop split mode so mobile and tablet users can reach the run panel instead of being trapped inside individual subpanes.

### Improvements

* **seo:** update `llms.txt`, `llms-full.txt`, sitemap metadata, docs, and feature pages with TaskMaster and OpenAI-compatible endpoint coverage.
* **package:** include contributor and security documents in the npm tarball.

### Tests

* add smoke coverage for custom OpenAI-compatible TaskMaster config fields and env resolution.
* add smoke coverage for the fixed chat composer layout.
* add smoke coverage for orchestration mobile scroll behavior.
* re-run TaskMaster config smoke, chat composer layout smoke, orchestration mobile scroll smoke, typecheck, lint, production build, diff whitespace check, and npm pack dry-run before publishing.

## [1.38.5](https://github.com/alicomert/pixcode/compare/v1.38.4...v1.38.5) (2026-05-10)

Pixcode 1.38.5 is a Command Center realtime-write hotfix. It connects agent file write/edit tool events directly to the changed-files rail and opens changed files in the editor with diff context.

### Bug Fixes

* **command-center:** ingest realtime `Write`, `Edit`, `MultiEdit`, `ApplyPatch`, and provider file-change events instead of waiting only for git/filesystem polling.
* **command-center:** keep direct agent writes merged with polled local changes so the rail does not go empty after a status refresh.
* **editor:** open changed files from the activity rail with preserved `old_string`/`new_string` diff context, enabling the green changed-content view in the editor.
* **command-center:** normalize absolute agent paths back to project-relative paths before highlighting or opening files.

### Tests

* add smoke coverage for direct agent write ingestion and changed-file editor opening.
* re-run Command Center non-git smoke, extraction behavior checks, typecheck, lint, and production build before publishing.

## [1.38.4](https://github.com/alicomert/pixcode/compare/v1.38.3...v1.38.4) (2026-05-10)

Pixcode 1.38.4 is a Command Center and mobile-access reliability patch. It makes local-only projects first-class, moves changed-file awareness beside the active AI workspace, turns missing tunnel binaries into actionable setup guidance, and makes notification channel preferences stricter.

### Bug Fixes

* **git:** return a structured filesystem-tracking status for non-git folders instead of surfacing `Git operation failed`.
* **command-center:** show changed files in a dedicated activity rail beside chat/orchestration, while Quick Settings keeps only the toggle and compact status.
* **source-control:** render non-git folders as local file activity so users are not forced to initialize Git just to see agent edits.
* **mobile:** show cloudflared/ngrok install guidance when no tunnel binary exists and keep LAN QR endpoints usable.
* **notifications:** honor the In-app center channel preference before storing or opening in-app notification UI.
* **desktop:** keep the desktop bundled `@pixelbyte-software/pixcode` dependency aligned with the release version.

### Tests

* add smoke coverage for non-git Command Center fallback, mobile tunnel guidance, and in-app notification preference enforcement.
* re-run smoke checks, typecheck, lint, and production build before publishing.

## [1.38.3](https://github.com/alicomert/pixcode/compare/v1.38.2...v1.38.3) (2026-05-10)

Pixcode 1.38.3 is a Mac/runtime reliability patch for the v1.38 desktop and orchestration wave. It fixes macOS GUI PATH detection for provider/task installs, keeps Qwen/OpenCode chats hydrated after project refreshes, improves the multi-worker composer entry point, and prevents external-directory permission denials from breaking orchestration final reports.

### Bug Fixes

* **macos:** hydrate the desktop runtime PATH from the user's login shell and common Node manager paths so TaskMaster/provider installs can find `npm` from Electron, not only from Terminal.
* **providers:** honor resolved `CODEX_CLI_PATH`, `CURSOR_CLI_PATH`, `GEMINI_CLI_PATH`, and `QWEN_CLI_PATH` during CLI status checks so existing CLIs do not falsely show install/download states.
* **chat:** include Qwen and OpenCode session pools in project refresh/change detection and persist the selected session provider before navigation, fixing chats that stayed on the "continue your conversation" screen until another chat was opened.
* **orchestration:** detect external-directory permission denials, avoid default auto-reject mode for selected host workspaces, and synthesize a readable final report from completed agent outputs instead of failing the whole run.
* **desktop:** resize the macOS tray/menu-bar icon to a native 18px template image so the app logo does not overflow the menu bar.
* **ui:** move the multi-worker `+` control next to the chat composer send button and add direction-aware split-panel transitions.

### Tests

* add smoke checks for macOS desktop runtime PATH resolution, Qwen/OpenCode chat session pools, orchestration permission fallback, desktop tray icon sizing, and multi-worker composer UI placement.
* re-run smoke checks, typecheck, lint, and production build before publishing.

## [1.38.2](https://github.com/alicomert/pixcode/compare/v1.38.1...v1.38.2) (2026-05-10)

Pixcode 1.38.2 is a desktop notification patch for the installer builds. It routes agent/task notifications through the Electron native notification bridge first, then falls back to the existing browser/service-worker notification path for web and server installs.

### Bug Fixes

* **desktop:** add a preload-safe native notification bridge so Windows/macOS/Linux installers can show OS notifications for agent, task, permission, and error events, not only app update events.
* **notifications:** keep the browser/service-worker fallback for npm/web installs while honoring the existing desktop notification preference and dedupe behavior.

### Tests

* add `node scripts/smoke/desktop-native-notifications.mjs` to verify the Electron preload, IPC handler, renderer bridge, and fallback wiring.
* re-run notification center, desktop release-hardening, typecheck, lint, and production build checks for the patch release.

## [1.38.1](https://github.com/alicomert/pixcode/compare/v1.38.0...v1.38.1) (2026-05-10)

Pixcode 1.38.1 completes the v1.38 operations issue set after the initial 1.38.0 planning release. It turns the remote/API/Telegram/Taskmaster/provider/diagnostics GitHub issues into shipped behavior and closes the v1.38 epic.

### New Features

* **remote:** add first-run local/remote mode selection, redacted remote API URL/key persistence, protected remote config APIs, and remote health checks.
* **api:** add a protected public API manifest and OpenAPI fragment covering auth, projects, sessions, providers, orchestration, Taskmaster, notifications, files, git, settings, updates, diagnostics, remote, Telegram, and plugins.
* **api:** persist scoped `px_` API-key metadata while keeping keys revocable and compatible with existing API-key auth paths.
* **telegram:** add sessions, new-chat controls, and errors-only progress mode alongside final-only, step-summary, and all-output modes.
* **tasks:** add Taskmaster queue/detail automation routes and preserve provider, model, permission mode, fallback provider, and worker slot in dispatch metadata.
* **providers:** add provider plugin-state endpoints plus redacted config previews, validation, and safe backup actions for CLI config files.
* **diagnostics:** add Settings -> Diagnostics with manual refresh, provider health, WebSocket state, active runs, recent redacted errors, and copyable support bundles.

### Tests

* add `npm run smoke:v138-completion` to verify the complete v1.38 issue completion surface before release.
* re-run v1.38 issue planner, desktop, diagnostics, Telegram control, Taskmaster Telegram, typecheck, lint, and build checks for the patch release.

## [1.38.0](https://github.com/alicomert/pixcode/compare/v1.37.0...v1.38.0) (2026-05-10)

Pixcode 1.38.0 starts the remote-control and release-hardening wave. It publishes the v1.38 GitHub issue plan, adds release-progress metadata that can be read by the update UI, hardens desktop installer guidance, and introduces a redacted diagnostics bundle for support/debugging.

### New Features

* **release:** add v1.38 GitHub issue automation and link the release checklist to issues #15-#22.
* **diagnostics:** add protected `/api/diagnostics` output with runtime, version, WebSocket client count, notification state, credential presence, memory usage, and redacted environment data.

### Improvements

* **desktop:** verify desktop package version alignment, installer artifact naming, AppImage coverage, unsigned macOS Gatekeeper guidance, and the bundled `Fix Gatekeeper.command` helper through a dedicated v1.38 smoke check.
* **updates:** keep the `pixcode:issue-progress` block populated with real GitHub issue numbers so future update screens can present issue-backed progress without guessing.

### Tests

* add `npm run smoke:v138-issues` for v1.38 issue payload validation.
* add `npm run smoke:v138-desktop` for desktop release-hardening checks.
* add `npm run smoke:v138-diagnostics` for diagnostics health aggregation and secret-redaction checks.

## [1.37.0](https://github.com/alicomert/pixcode/compare/v1.36.4...v1.37.0) (2026-05-09)

Pixcode 1.37.0 is the orchestration reliability and task-foundation release. It turns the v1.37 issue plan into shipped product behavior: stricter agent handoffs, a clearer active-run dashboard, reliable chat hydration, layered notifications, Taskmaster onboarding/execution, multi-worker chat slots, and issue-backed update progress.

### New Features

* **orchestration:** add strict sequential handoff support with internal init/compact packets so each agent can receive the previous agent's real summary before continuing.
* **orchestration:** focus the active execution dashboard when a workflow starts, keeping progress, current stage, CLI/model context, and final output visible.
* **notifications:** add an in-app notification center with WebSocket event delivery, desktop/browser fallbacks, Telegram channel preferences, and duplicate-event protection.
* **tasks:** add optional Taskmaster setup during first account onboarding with install status, persisted setup choice, and non-blocking skip behavior.
* **tasks:** add Taskmaster execution through orchestration and Telegram, including task listing, task run callbacks, selected provider/model routing, and completion monitoring.
* **chat:** add up to four multi-worker slots from the composer so users can run separate provider/model/project work in parallel from the main prompt surface.
* **updates:** show issue-backed release progress in the version/update modal using bundled release metadata instead of repeated GitHub API calls.

### Bug Fixes

* **chat:** stabilize active session hydration, focus/visibility refresh, message dedupe, and polling fallback so agent responses already present in the REST API render without switching chats.
* **orchestration:** keep internal compact/init packets out of user-facing output while preserving the handoff context needed by later agents.

### Tests

* add smoke coverage for strict handoff compact packets, orchestration execution dashboard focus, user-facing orchestration output, chat realtime hydration, chat session state freshness, notification center events, Taskmaster onboarding, Taskmaster Telegram execution, multi-worker slots, update issue progress, shell manual disconnects, split-panel file editing, Telegram control routing, and update UX.

## [1.36.4](https://github.com/alicomert/pixcode/compare/v1.36.3...v1.36.4) (2026-05-08)

### Bug Fixes

* **telegram:** add the remote-control menu system for projects, providers, models, workflows, installs, auth help, settings, language, and progress mode directly from Telegram.
* **telegram:** keep `/start`, `/help`, `/menu`, bot-suffixed commands, `/`, and unknown slash commands inside the control center instead of forwarding them as agent prompts.
* **telegram:** edit inline menu messages in place after selections so every button press does not create another chat message.
* **telegram:** persist language changes and translate the main Telegram control surfaces in Turkish and English.
* **server:** run the systemd daemon from the compiled `dist-server/server/cli.js` entrypoint when available, avoiding source-mode alias resolution crashes.
* **server:** serve the built Pixcode app before `public/` static docs so `http://host:3001/` opens the app instead of the GitHub Pages landing page.
* **updates:** show current-release notes only once per version instead of reopening the version modal on every page load.
* **orchestration:** normalize A2A task output so raw `agent:`/`user:` role prefixes and internal workflow text do not leak into user-facing summaries.
* **shell:** respect manual disconnects so the shell does not auto-reconnect immediately after the user closes the connection.
* **files:** keep chat or orchestration visible while opening files from the split Files panel, dock the editor inside the side panel, and cap the split panel at half of the workspace.

### Tests

* add smoke coverage for Telegram control routing, daemon entrypoint selection, static root routing, update modal auto-show behavior, orchestration user-facing output, shell manual disconnects, and Files split editor layout.

## [1.36.3](https://github.com/alicomert/pixcode/compare/v1.36.2...v1.36.3) (2026-05-08)

### Bug Fixes

* **chat:** refresh the active session message list immediately when the session store receives fetched or streamed messages, fixing chats that only appeared after switching away and back.
* **chat:** keep the session loading state from falling through to the empty "Continue your conversation" view when network data has already reached the local store.
* **updates:** open the update modal when a background check or manual "Check for updates" action finds a newer release.
* **updates:** default GitHub release checks to every 30 minutes and keep release notes visible on app open for the current release.
* **desktop:** show explicit startup/update splash text while the desktop wrapper checks for updates or applies a downloaded runtime update.

### Tests

* **chat:** add a smoke regression check that fails if active session messages are read through a stale memoized store snapshot.
* **updates:** add a smoke regression check for the 30-minute default, update modal trigger, release-notes-only modal mode, and desktop update splash copy.

## [1.36.2](https://github.com/alicomert/pixcode/compare/v1.36.1...v1.36.2) (2026-05-08)

### Bug Fixes

* **opencode:** restore assistant history for block-based OpenCode responses so `/api/sessions/:id/messages` no longer returns only user messages after a run.
* **opencode:** persist terminal, stderr, timeout, and JSON stream errors into the session history so failed runs show a visible answer/error instead of a blank chat.
* **api:** classify missing CLI failures from REST agent runs more accurately, including split stderr output and `exited with code 127` cases.

### Tests

* **providers:** add `npm run smoke:provider-rest` to exercise Claude, Cursor, Codex, Gemini, Qwen, and OpenCode through `/api/agent` with one REST smoke command.

## [1.36.1](https://github.com/alicomert/pixcode/compare/v1.36.0...v1.36.1) (2026-05-08)

### Bug Fixes

* **updates:** make GitHub release checks cache-aware and user configurable to avoid browser-side API rate limits.
* **service-worker:** stop intercepting cross-origin release checks so GitHub failures are not reported as service-worker responses.
* **startup:** gate plugin and TaskMaster startup requests behind authentication to prevent login/setup page request spam.
* **orchestration:** reduce background run polling, dedupe in-flight run refreshes, and normalize Windows project ids.

## [1.36.0](https://github.com/alicomert/pixcode/compare/v1.35.5...v1.36.0) (2026-05-08)

Pixcode 1.36.0 is a product-level release focused on control, visibility, orchestration, theming, automation, and public documentation. It turns the app from a multi-CLI chat surface into a more complete self-hosted AI coding-agent workspace.

### New Features

* **Changed-files Command Center:** add the Hakimiyet/Command Center workflow for local working-tree visibility, so users can see newly edited files while an agent is working and jump back into the related file context.
* **Theme system:** add application-wide accent palettes, including emerald, VS Code-style colors, and custom light/dark accent colors driven by shared theme tokens.
* **Orchestration controls:** add fallback CLI-agent selection and per-agent model selection so failed or weak workflow steps can be routed through a chosen backup provider/model.
* **Provider status:** add provider CLI version status caching, daily background checks, manual refresh actions, and update notices in the provider settings surface.
* **Startup recovery path:** add startup update-check plumbing before the normal server boot path, improving recovery when an installed build needs to pull a fixed version.
* **Static documentation site:** add SEO-focused static pages, full system documentation, feature pages, orchestration/API pages, `llms.txt`, `llms-full.txt`, `robots.txt`, and `sitemap.xml`.
* **API key prefix:** switch newly generated Pixcode API keys to the `px_` prefix while preserving legacy `ck_` compatibility for existing installs.

### Improvements

* **Chat workspace:** refine prompt composer behavior, CLI activity feedback, duplicate-response handling, and provider empty-state copy.
* **Panel UX:** polish desktop split/full panel behavior for Files, Shell, Source Control, and orchestration panes with clearer close/sizing controls.
* **Responsive orchestration:** improve mobile and tablet orchestration layouts, panel sizing, and run output readability.
* **Files view:** tune narrow file-tree layout, detailed columns, changed-file highlighting, and panel-safe file opening behavior.
* **Notifications:** strengthen browser push and Telegram notification plumbing for long-running provider sessions.
* **Documentation quality:** replace stale inherited README content with current Pixcode positioning, screenshots, installation details, orchestration coverage, API examples, themes, Telegram, MCP, plugins, and security guidance.
* **Discovery metadata:** refresh npm package description/keywords and public API documentation so package search, GitHub readers, search engines, and AI assistants can understand the project.

### Release Notes

* Full release notes for GitHub are available in [`RELEASE_NOTES_v1.36.0.md`](RELEASE_NOTES_v1.36.0.md).

## [1.35.5](https://github.com/alicomert/pixcode/compare/v1.35.4...v1.35.5) (2026-05-07)

### Bug Fixes

* refine split panel workspace UX with desktop-only split/full indicators, draggable panel sizing, GSAP transitions, and sticky chat composer ([8e61d70](https://github.com/alicomert/pixcode/commit/8e61d70))

## [1.35.4](https://github.com/alicomert/pixcode/compare/v1.35.3...v1.35.4) (2026-05-07)

### New Features

* improve chat workspace UX with persistent modes, visible CLI activity, terminal-styled chat, desktop split panels, and responsive orchestration polish ([380002a](https://github.com/alicomert/pixcode/commit/380002a))

## [1.35.3](https://github.com/alicomert/pixcode/compare/v1.35.2...v1.35.3) (2026-05-07)

### Bug Fixes

* open project after wizard creation ([9bd4857](https://github.com/alicomert/pixcode/commit/9bd48578b1c2361e83ad32abfd06e492797530b9))

## [1.35.1](https://github.com/alicomert/pixcode/compare/v1.35.0...v1.35.1) (2026-05-05)

### Bug Fixes

* **orchestration:** align A2ATaskStore API with Map surface expected by routes ([f4c4ba3](https://github.com/alicomert/pixcode/commit/f4c4ba3f488d4c7873ba524847592f5939465c44))
* support Express 5 preview proxy routes ([1b52ec1](https://github.com/alicomert/pixcode/commit/1b52ec17bf17073927f734a868e6139c4d345f86))

## [1.34.0](https://github.com/alicomert/pixcode/compare/v1.33.11...v1.34.0) (2026-04-29)

### New Features

* **orchestration:** add A2A auth middleware (localhost bypass + JWT) ([45732c5](https://github.com/alicomert/pixcode/commit/45732c5a47b9bdd2e442a8e5d468496421ed033f))
* **orchestration:** add A2A v0.2 HTTP router (discovery, tasks, SSE, messages) ([d21ac5e](https://github.com/alicomert/pixcode/commit/d21ac5e3e76f04e447b070959083bf8f08616f21))
* **orchestration:** add AbstractA2AAdapter base class ([3568c32](https://github.com/alicomert/pixcode/commit/3568c32a73779156f3a5daf1a06761a3feaf4f86))
* **orchestration:** add adapter registry with id/skill/auto resolution ([96134be](https://github.com/alicomert/pixcode/commit/96134bed950f54e102804099275d2bf4d6116d59))
* **orchestration:** add ClaudeCodeA2AAdapter wrapping claude-sdk.js ([b1fda25](https://github.com/alicomert/pixcode/commit/b1fda25bfc4c38ec05af0c49621abc4d06a7a78c))
* **orchestration:** add empty module skeleton with barrel ([9bd5d87](https://github.com/alicomert/pixcode/commit/9bd5d87f61c5239095bc5f2279eac158ad7581ae))
* **orchestration:** add hand-written A2A payload validators ([70e6737](https://github.com/alicomert/pixcode/commit/70e673752c6cdeb030a2db4efd7c6b01067399a9))
* **orchestration:** add in-process A2A pub/sub bus ([80e9615](https://github.com/alicomert/pixcode/commit/80e9615e829f79d164c371b0f5d5f322a1e50754))
* **orchestration:** add pixcode self-AgentCard generator ([f4a0ba3](https://github.com/alicomert/pixcode/commit/f4a0ba3d3a9f6942c772b4083ecfe064397c1dd0))
* **orchestration:** define A2A v0.2 core types ([5b2a343](https://github.com/alicomert/pixcode/commit/5b2a34339fcb2270ca1d62163a31cf9d2d32fbcd))
* **orchestration:** mount /a2a router and register Claude adapter at boot ([2d94e48](https://github.com/alicomert/pixcode/commit/2d94e4824337be8764a95f8ef2525e2a3797451e))
* **orchestration:** publish module barrel and document protocol semantics ([112478d](https://github.com/alicomert/pixcode/commit/112478ddccead0492fd9b3927a42e5455e25fce6))

### Bug Fixes

* **orchestration:** correct Claude adapter frame translation and cancel race ([c852d00](https://github.com/alicomert/pixcode/commit/c852d00fdaa953b2e9f5ba8b912e8a1bf57cb044))
* **orchestration:** harden adapter registry auto/skill resolution semantics ([dbe41a5](https://github.com/alicomert/pixcode/commit/dbe41a593a97f50ae9eea7454168d7dc9a1bc7b7))
* **orchestration:** map Claude error frames to failed task state ([df0baf1](https://github.com/alicomert/pixcode/commit/df0baf1421f4b3f5ec7cb0993f58efa39da87e51))
* **orchestration:** publish failure to bus, bound tasks store, plug listener leak ([fe87c54](https://github.com/alicomert/pixcode/commit/fe87c5405b8816216a2c21a78a6d3ee5b4c1285b))
* **orchestration:** read pixcode version from package.json on backend ([3f0a422](https://github.com/alicomert/pixcode/commit/3f0a42200cf42d8abf5a1aff9de54212f87f28cf))
* **orchestration:** tighten A2A validators for soundness and consistency ([7e8c416](https://github.com/alicomert/pixcode/commit/7e8c416388017233957e3d5af78f8c37a3491735))

### Documentation

* add orchestration+A2A foundation implementation plan ([4cdd2b9](https://github.com/alicomert/pixcode/commit/4cdd2b970320a852f135373f1d28acc6b3f6b479))
* add v2 multi-CLI A2A platform vision spec ([f1b2cb8](https://github.com/alicomert/pixcode/commit/f1b2cb8bd41b6c033b988e121cd372caf745224e))

### Tests

* **orchestration:** add A2A end-to-end smoke script ([66ebe16](https://github.com/alicomert/pixcode/commit/66ebe16e191a603eb715a7e2a4aa627caa9248f3))

## Unreleased

Ports upstream `siteboon/claudecodeui` v1.30.0 features on top of Pixcode's v1.29.5 base. The release-it tooling will generate the final numbered entry when the next Pixcode version is cut.

### New Features

* **i18n:** add Turkish (tr) and Italian (it) language support (upstream PRs [#677](https://github.com/siteboon/claudecodeui/pull/677), [#678](https://github.com/siteboon/claudecodeui/pull/678))
* introduce Claude Opus 4.6 as an explicit model option and bump `@anthropic-ai/claude-agent-sdk` to ^0.2.116
* Claude env variables such as `ANTHROPIC_BASE_URL` from `.claude/settings.json` are now forwarded to the Claude Agent SDK subprocess
* new UI primitives (Alert, Card, Collapsible, Command, Confirmation, Dialog, Reasoning, Shimmer, PromptInput, Queue) usable from `@/shared/view/ui`
* add `PlanDisplay` and `ToolStatusBadge` helpers for the upcoming chat redesign
* add history view switch (Recent / By project), session action menu, session starring, and time-bucketed flat list in the sidebar
* **orchestration:** add A2A adapters for Codex, Cursor, Gemini, Qwen, and OpenCode so all first-party CLI integrations are reachable from `/a2a/*`
* **orchestration:** add `POST /a2a/adapters/resolve` and `GET /a2a/tasks` for adapter dry-run resolution plus task listing/filtering
* **orchestration:** persist A2A tasks to disk with restart recovery and task summary responses for external clients
* **orchestration:** make agent-team workflows append bounded repair/recheck steps when review agents report actionable issues
* **orchestration:** add an explicit target workspace selector so agent teams can run against the selected project, the Pixcode app root, or a custom path
* **desktop:** align the Electron wrapper package and bundled Pixcode dependency with version 1.34.0 for installer releases

### Refactoring

* provider runtimes consolidated under `server/modules/providers/*` with auth/sessions/MCP split into dedicated providers (upstream PR [#666](https://github.com/siteboon/claudecodeui/pull/666))
* chat composer, tool display, plan mode, and session model selector rebuilt on top of the new primitives (upstream refactor commits [7763e60](https://github.com/siteboon/claudecodeui/commit/7763e60), [5758bee](https://github.com/siteboon/claudecodeui/commit/5758bee), [ec0ff97](https://github.com/siteboon/claudecodeui/commit/ec0ff97))
* **orchestration:** split task persistence into a dedicated A2A task store and extend the orchestration barrel/types surface for summaries and multi-adapter boot registration

### Bug Fixes

* iOS scrolling in main chat area, mobile permission mode button tap target and provider selector sizing, PlanDisplay raw params migration, precise Claude SDK denial detection
* **orchestration:** keep the A2A layer opt-in while hardening selector resolution, task-scoped message history, missing-task errors, and richer adapter-not-found responses
* **orchestration:** make smoke/API coverage reflect the real six-adapter boot set and validate resolve/listing negative paths
* **orchestration:** propagate workspace context into every workflow prompt and fill new orchestration locale strings across all supported languages

### Documentation

* document the Pixcode system architecture and orchestration workflow model in dedicated Markdown guides

### Tests

* **orchestration:** extend `scripts/smoke/a2a-roundtrip.mjs` to cover adapter registration, resolution, invalid submit/message paths, task listing, and the task stream happy path

## [1.29.5](https://github.com/alicomert/pixcode/compare/v1.29.4...v1.29.5) (2026-04-16)

### Bug Fixes

* update node-pty to latest version ([6a13e17](https://github.com/alicomert/pixcode/commit/6a13e1773b145049ade512aa6e5cac21c2e5c4de))

## [1.29.4](https://github.com/alicomert/pixcode/compare/v1.29.3...v1.29.4) (2026-04-16)

### New Features

* deleting from sidebar will now ask whether to remove all data as well ([e9c7a50](https://github.com/alicomert/pixcode/commit/e9c7a5041c31a6f7b2032f06abe19c52d3d4cd8c))

### Bug Fixes

* pass pathToClaudeCodeExecutable to SDK when CLAUDE_CLI_PATH is set ([4c106a5](https://github.com/alicomert/pixcode/commit/4c106a5083d90989bbeedaefdbb68f5b3fa6fd58)), closes [#468](https://github.com/alicomert/pixcode/issues/468)

### Refactoring

* remove the sqlite3 dependency ([2895208](https://github.com/alicomert/pixcode/commit/289520814cf3ca36403056739ef22021f78c6033))
* **server:** extract URL detection and color utils from index.js ([#657](https://github.com/alicomert/pixcode/issues/657)) ([63e996b](https://github.com/alicomert/pixcode/commit/63e996bb77cfa97b1f55f6bdccc50161a75a3eee))

### Maintenance

* upgrade commit lint to 20.5.0 ([0948601](https://github.com/alicomert/pixcode/commit/09486016e67d97358c228ebc6eb4502ccb0012e4))

## [1.29.3](https://github.com/alicomert/pixcode/compare/v1.29.2...v1.29.3) (2026-04-15)

### Bug Fixes

* **version-upgrade-modal:** implement reload countdown and update UI messages ([#655](https://github.com/alicomert/pixcode/issues/655)) ([6413042](https://github.com/alicomert/pixcode/commit/641304242d7705b54aab65faa4a7673438c92c60))

### Maintenance

* remove unused route (migrated to providers already) ([31f28a2](https://github.com/alicomert/pixcode/commit/31f28a2c183f6ead50941027632d7ab64b7bb2d4))

## [1.29.2](https://github.com/alicomert/pixcode/compare/v1.29.1...v1.29.2) (2026-04-14)

### Bug Fixes

* **sandbox:** use backgrounded sbx run to keep sandbox  alive ([9b11c03](https://github.com/alicomert/pixcode/commit/9b11c034d9a19710a23b56c62dcf07c21a17bd97))

## [1.29.1](https://github.com/alicomert/pixcode/compare/v1.29.0...v1.29.1) (2026-04-14)

### Bug Fixes

* add latest tag to docker npx command and change the detach mode to work without spawn ([4a56972](https://github.com/alicomert/pixcode/commit/4a569725dae320a505753359d8edfd8ca79f0fd7))

## [1.29.0](https://github.com/alicomert/pixcode/compare/v1.28.1...v1.29.0) (2026-04-14)

### New Features

* adding docker sandbox environments ([13e97e2](https://github.com/alicomert/pixcode/commit/13e97e2c71254de7a60afb5495b21064c4bc4241))

### Bug Fixes

* **thinking-mode:** fix dropdown positioning ([#646](https://github.com/alicomert/pixcode/issues/646)) ([c7a5baf](https://github.com/alicomert/pixcode/commit/c7a5baf1479404bd40e23aa58bd9f677df9a04c6))

### Maintenance

* update release flow node version ([e2459cb](https://github.com/alicomert/pixcode/commit/e2459cb0f8b35f54827778a7b444e6c3ca326506))

## [1.28.1](https://github.com/alicomert/pixcode/compare/v1.28.0...v1.28.1) (2026-04-10)

### New Features

* add branding, community links, GitHub star badge, and About settings tab ([2207d05](https://github.com/alicomert/pixcode/commit/2207d05c1ca229214aa9c2e2c9f4d0827d421574))

### Bug Fixes

* corrupted binary downloads ([#634](https://github.com/alicomert/pixcode/issues/634)) ([e61f8a5](https://github.com/alicomert/pixcode/commit/e61f8a543d63fe7c24a04b3d2186085a06dcbcdb))
* **ui:** remove mobile bottom nav, unify processing indicator, and improve tooltip behavior on mobile ([#632](https://github.com/alicomert/pixcode/issues/632)) ([a8dab0e](https://github.com/alicomert/pixcode/commit/a8dab0edcf949ae610820bae9500c433781f7c73))

### Refactoring

* remove unused whispher transcribe logic ([#637](https://github.com/alicomert/pixcode/issues/637)) ([590dd42](https://github.com/alicomert/pixcode/commit/590dd42649424ab990353fcf59ce0965036d3d25))

## [1.28.0](https://github.com/alicomert/pixcode/compare/v1.27.1...v1.28.0) (2026-04-03)

### New Features

* adding session resume in the api ([8f1042c](https://github.com/alicomert/pixcode/commit/8f1042cf256be282f009adcceeb55ab2dddf3fba))
* moving new session button higher ([1628868](https://github.com/alicomert/pixcode/commit/16288684702dec894cf054291ca3d545ddb8214b))

### Maintenance

* changing package name to pixcode ([ef51de2](https://github.com/alicomert/pixcode/commit/ef51de259ea2b963bc15f058b084e11220bc216a))

## [1.27.1](https://github.com/alicomert/pixcode/compare/v1.26.3...v1.27.1) (2026-03-29)

### Bug Fixes

* prevent split on undefined（[#491](https://github.com/alicomert/pixcode/issues/491)） ([#563](https://github.com/alicomert/pixcode/issues/563)) ([b54cdf8](https://github.com/alicomert/pixcode/commit/b54cdf8168fc224e9907796e4229ae8ed34e6885))

### Maintenance

* add release-it github action ([42a1313](https://github.com/alicomert/pixcode/commit/42a131389a6954df0d2c3bedd2cb6d3406c5ebc1))
* add terminal plugin in the plugins list ([004135e](https://github.com/alicomert/pixcode/commit/004135ef0187023e1da29c4a7137a28a42ebf9af))
* release tokens ([f1063fd](https://github.com/alicomert/pixcode/commit/f1063fd33964ccb517f5ebcdd14526ed162e1138))
* relicense to AGPL-3.0-or-later ([27cd124](https://github.com/alicomert/pixcode/commit/27cd12432b7d3237981f86acd9cc99532d843d4a))

## [1.26.3](https://github.com/alicomert/pixcode/compare/v1.26.2...v1.26.3) (2026-03-22)

## [1.26.2](https://github.com/alicomert/pixcode/compare/v1.26.0...v1.26.2) (2026-03-21)

### Bug Fixes

* change SW cache mechanism ([17d6ec5](https://github.com/alicomert/pixcode/commit/17d6ec54af18d333c8b04d2ffc64793e688d996e))
* claude auth changes and adding copy on mobile ([a41d2c7](https://github.com/alicomert/pixcode/commit/a41d2c713e87d56f23d5884585b4bb43c43a250a))

## [1.26.0](https://github.com/alicomert/pixcode/compare/v1.25.2...v1.26.0) (2026-03-20)

### New Features

* add German (Deutsch) language support ([#525](https://github.com/alicomert/pixcode/issues/525)) ([a7299c6](https://github.com/alicomert/pixcode/commit/a7299c68237908c752d504c2e8eea91570a30203))
* add WebSocket proxy for plugin backends ([#553](https://github.com/alicomert/pixcode/issues/553)) ([88c60b7](https://github.com/alicomert/pixcode/commit/88c60b70b031798d51ce26c8f080a0f64d824b05))
* Browser autofill support for login form ([#521](https://github.com/alicomert/pixcode/issues/521)) ([72ff134](https://github.com/alicomert/pixcode/commit/72ff134b315b7a1d602f3cc7dd60d47c1c1c34af))
* git panel redesign ([#535](https://github.com/alicomert/pixcode/issues/535)) ([adb3a06](https://github.com/alicomert/pixcode/commit/adb3a06d7e66a6d2dbcdfb501615e617178314af))
* introduce notification system and claude notifications ([#450](https://github.com/alicomert/pixcode/issues/450)) ([45e71a0](https://github.com/alicomert/pixcode/commit/45e71a0e73b368309544165e4dcf8b7fd014e8dd))
* **refactor:** move plugins to typescript ([#557](https://github.com/alicomert/pixcode/issues/557)) ([612390d](https://github.com/alicomert/pixcode/commit/612390db536417e2f68c501329bfccf5c6795e45))
* unified message architecture with provider adapters and session store ([#558](https://github.com/alicomert/pixcode/issues/558)) ([a4632dc](https://github.com/alicomert/pixcode/commit/a4632dc4cec228a8febb7c5bae4807c358963678))

### Bug Fixes

* detect Claude auth from settings env ([#527](https://github.com/alicomert/pixcode/issues/527)) ([95bcee0](https://github.com/alicomert/pixcode/commit/95bcee0ec459f186d52aeffe100ac1a024e92909))
* remove /exit command from claude login flow during onboarding ([#552](https://github.com/alicomert/pixcode/issues/552)) ([4de8b78](https://github.com/alicomert/pixcode/commit/4de8b78c6db5d8c2c402afce0f0b4cc16d5b6496))

### Documentation

* add German language link to all README files ([#534](https://github.com/alicomert/pixcode/issues/534)) ([1d31c3e](https://github.com/alicomert/pixcode/commit/1d31c3ec8309b433a041f3099955addc8c136c35))
* **readme:** hotfix and improve for README.jp.md ([#550](https://github.com/alicomert/pixcode/issues/550)) ([7413c2c](https://github.com/alicomert/pixcode/commit/7413c2c78422c308ac949e6a83c3e9216b24b649))
* **README:** update translations with Pixcode branding and feature restructuring ([#544](https://github.com/alicomert/pixcode/issues/544)) ([14aef73](https://github.com/alicomert/pixcode/commit/14aef73cc6085fbb519fe64aea7cac80b7d51285))

## [1.25.2](https://github.com/alicomert/pixcode/compare/v1.25.0...v1.25.2) (2026-03-11)

### New Features

* **i18n:** localize plugin settings for all languages ([#515](https://github.com/alicomert/pixcode/issues/515)) ([621853c](https://github.com/alicomert/pixcode/commit/621853cbfb4233b34cb8cc2e1ed10917ba424352))

### Bug Fixes

* codeql user value provided path validation ([aaa14b9](https://github.com/alicomert/pixcode/commit/aaa14b9fc0b9b51c4fb9d1dba40fada7cbbe0356))
* numerous bugs ([#528](https://github.com/alicomert/pixcode/issues/528)) ([a77f213](https://github.com/alicomert/pixcode/commit/a77f213dd5d0b2538dea091ab8da6e55d2002f2f))
* **security:** disable executable gray-matter frontmatter in commands ([b9c902b](https://github.com/alicomert/pixcode/commit/b9c902b016f411a942c8707dd07d32b60bad087c))
* session reconnect catch-up, always-on input, frozen session recovery ([#524](https://github.com/alicomert/pixcode/issues/524)) ([4d8fb6e](https://github.com/alicomert/pixcode/commit/4d8fb6e30aa03d7cdb92bd62b7709422f9d08e32))

### Refactoring

* new settings page design and new pill component ([8ddeeb0](https://github.com/alicomert/pixcode/commit/8ddeeb0ce8d0642560bd3fa149236011dc6e3707))

## [1.25.0](https://github.com/alicomert/pixcode/compare/v1.24.0...v1.25.0) (2026-03-10)

### New Features

* add copy as text or markdown feature for assistant messages ([#519](https://github.com/alicomert/pixcode/issues/519)) ([1dc2a20](https://github.com/alicomert/pixcode/commit/1dc2a205dc2a3cbf960625d7669c7c63a2b6905f))
* add full Russian language support; update Readme.md files, and .gitignore update ([#514](https://github.com/alicomert/pixcode/issues/514)) ([c7dcba8](https://github.com/alicomert/pixcode/commit/c7dcba8d9117e84db8aac7d8a7bf6a3aa683e115))
* new plugin system ([#489](https://github.com/alicomert/pixcode/issues/489)) ([8afb46a](https://github.com/alicomert/pixcode/commit/8afb46af2e5514c9284030367281793fbb014e4f))

### Bug Fixes

* resolve duplicate key issue when rendering model options ([#520](https://github.com/alicomert/pixcode/issues/520)) ([9bceab9](https://github.com/alicomert/pixcode/commit/9bceab9e1a6e063b0b4f934ed2d9f854fcc9c6a4))

### Maintenance

* add plugins section in readme ([e581a0e](https://github.com/alicomert/pixcode/commit/e581a0e1ccd59fd7ec7306ca76a13e73d7c674c1))

## [1.24.0](https://github.com/alicomert/pixcode/compare/v1.23.2...v1.24.0) (2026-03-09)

### New Features

* add full-text search across conversations ([#482](https://github.com/alicomert/pixcode/issues/482)) ([3950c0e](https://github.com/alicomert/pixcode/commit/3950c0e47f41e93227af31494690818d45c8bc7a))

### Bug Fixes

* **git:** prevent shell injection in git routes ([86c33c1](https://github.com/alicomert/pixcode/commit/86c33c1c0cb34176725a38f46960213714fc3e04))
* replace getDatabase with better-sqlite3 db in getGithubTokenById ([#501](https://github.com/alicomert/pixcode/issues/501)) ([cb4fd79](https://github.com/alicomert/pixcode/commit/cb4fd795c938b1cc86d47f401973bfccdd68fdee))

## [1.23.2](https://github.com/alicomert/pixcode/compare/v1.22.1...v1.23.2) (2026-03-06)

### New Features

* add clickable overlay buttons for CLI prompts in Shell terminal ([#480](https://github.com/alicomert/pixcode/issues/480)) ([2444209](https://github.com/alicomert/pixcode/commit/2444209723701dda2b881cea2501b239e64e51c1)), closes [#427](https://github.com/alicomert/pixcode/issues/427)
* add terminal shortcuts panel for mobile ([#411](https://github.com/alicomert/pixcode/issues/411)) ([b0a3fdf](https://github.com/alicomert/pixcode/commit/b0a3fdf95ffdb961261194d10400267251e42f17))
* implement session rename with SQLite storage ([#413](https://github.com/alicomert/pixcode/issues/413)) ([198e3da](https://github.com/alicomert/pixcode/commit/198e3da89b353780f53a91888384da9118995e81)), closes [#72](https://github.com/alicomert/pixcode/issues/72) [#358](https://github.com/alicomert/pixcode/issues/358)

### Bug Fixes

* **chat:** finalize terminal lifecycle to prevent stuck processing/thinking UI ([#483](https://github.com/alicomert/pixcode/issues/483)) ([0590c5c](https://github.com/alicomert/pixcode/commit/0590c5c178f4791e2b039d525ecca4d220c3dcae))
* **codex-history:** prevent AGENTS.md/internal prompt leakage when reloading Codex sessions ([#488](https://github.com/alicomert/pixcode/issues/488)) ([64a96b2](https://github.com/alicomert/pixcode/commit/64a96b24f853acb802f700810b302f0f5cf00898))
* preserve pending permission requests across WebSocket reconnections ([#462](https://github.com/alicomert/pixcode/issues/462)) ([4ee88f0](https://github.com/alicomert/pixcode/commit/4ee88f0eb0c648b54b05f006c6796fb7b09b0fae))
* prevent React 18 batching from losing messages during session sync ([#461](https://github.com/alicomert/pixcode/issues/461)) ([688d734](https://github.com/alicomert/pixcode/commit/688d73477a50773e43c85addc96212aa6290aea5))
* release it script ([dcea8a3](https://github.com/alicomert/pixcode/commit/dcea8a329c7d68437e1e72c8c766cf33c74637e9))

### Styling

* improve UI for processing banner ([#477](https://github.com/alicomert/pixcode/issues/477)) ([2320e1d](https://github.com/alicomert/pixcode/commit/2320e1d74b59c65b5b7fc4fa8b05fd9208f4898c))

### Maintenance

* remove logging of received WebSocket messages in production ([#487](https://github.com/alicomert/pixcode/issues/487)) ([9193feb](https://github.com/alicomert/pixcode/commit/9193feb6dc83041f3c365204648a88468bdc001b))

## [1.22.0](https://github.com/alicomert/pixcode/compare/v1.21.0...v1.22.0) (2026-03-03)

### New Features

* add community button in the app ([84d4634](https://github.com/alicomert/pixcode/commit/84d4634735f9ee13ac1c20faa0e7e31f1b77cae8))
* Advanced file editor and file tree improvements ([#444](https://github.com/alicomert/pixcode/issues/444)) ([9768958](https://github.com/alicomert/pixcode/commit/97689588aa2e8240ba4373da5f42ab444c772e72))
* update document title based on selected project ([#448](https://github.com/alicomert/pixcode/issues/448)) ([9e22f42](https://github.com/alicomert/pixcode/commit/9e22f42a3d3a781f448ddac9d133292fe103bb8c))

### Bug Fixes

* **claude:** correct project encoded path ([#451](https://github.com/alicomert/pixcode/issues/451)) ([9c0e864](https://github.com/alicomert/pixcode/commit/9c0e864532dcc5ce7ee890d3b4db722872db2b54)), closes [#447](https://github.com/alicomert/pixcode/issues/447)
* **claude:** move model usage log to result message only ([#454](https://github.com/alicomert/pixcode/issues/454)) ([506d431](https://github.com/alicomert/pixcode/commit/506d43144b3ec3155c3e589e7e803862c4a8f83a))
* missing translation label ([855e22f](https://github.com/alicomert/pixcode/commit/855e22f9176a71daa51de716370af7f19d55bfb4))

### Maintenance

* add Gemini-CLI support to README ([#453](https://github.com/alicomert/pixcode/issues/453)) ([503c384](https://github.com/alicomert/pixcode/commit/503c3846850fb843781979b0c0e10a24b07e1a4b))

## [1.21.0](https://github.com/alicomert/pixcode/compare/v1.20.1...v1.21.0) (2026-02-27)

### New Features

* add copy icon for user messages ([#449](https://github.com/alicomert/pixcode/issues/449)) ([b359c51](https://github.com/alicomert/pixcode/commit/b359c515277b4266fde2fb9a29b5356949c07c4f))
* Google's gemini-cli integration ([#422](https://github.com/alicomert/pixcode/issues/422)) ([a367edd](https://github.com/alicomert/pixcode/commit/a367edd51578608b3281373cb4a95169dbf17f89))
* persist active tab across reloads via localStorage ([#414](https://github.com/alicomert/pixcode/issues/414)) ([e3b6892](https://github.com/alicomert/pixcode/commit/e3b689214f11d549ffe1b3a347476d58f25c5aca)), closes [#387](https://github.com/alicomert/pixcode/issues/387)

### Bug Fixes

* add support for Codex in the shell ([#424](https://github.com/alicomert/pixcode/issues/424)) ([23801e9](https://github.com/alicomert/pixcode/commit/23801e9cc15d2b8d1bfc6e39aee2fae93226d1ad))

### Maintenance

* upgrade @anthropic-ai/claude-agent-sdk to version 0.2.59 and add model usage logging ([#446](https://github.com/alicomert/pixcode/issues/446)) ([917c353](https://github.com/alicomert/pixcode/commit/917c353115653ee288bf97be01f62fad24123cbc))
* upgrade better-sqlite to latest version to support node 25 ([#445](https://github.com/alicomert/pixcode/issues/445)) ([4ab94fc](https://github.com/alicomert/pixcode/commit/4ab94fce4257e1e20370fa83fa4c0f6fadbb8a2b))

## [1.20.1](https://github.com/alicomert/pixcode/compare/v1.19.1...v1.20.1) (2026-02-23)

### New Features

* implement install mode detection and update commands in version upgrade process ([f986004](https://github.com/alicomert/pixcode/commit/f986004319207b068431f9f6adf338a8ce8decfc))
* migrate legacy database to new location and improve last login update handling ([50e097d](https://github.com/alicomert/pixcode/commit/50e097d4ac498aa9f1803ef3564843721833dc19))

## [1.19.1](https://github.com/alicomert/pixcode/compare/v1.19.0...v1.19.1) (2026-02-23)

### Bug Fixes

* add prepublishOnly script to build before publishing ([82efac4](https://github.com/alicomert/pixcode/commit/82efac4704cab11ed8d1a05fe84f41312140b223))

## [1.19.0](https://github.com/alicomert/pixcode/compare/v1.18.2...v1.19.0) (2026-02-23)

### New Features

* add HOST environment variable for configurable bind address ([#360](https://github.com/alicomert/pixcode/issues/360)) ([cccd915](https://github.com/alicomert/pixcode/commit/cccd915c336192216b6e6f68e2b5f3ece0ccf966))
* subagent tool grouping ([#398](https://github.com/alicomert/pixcode/issues/398)) ([0207a1f](https://github.com/alicomert/pixcode/commit/0207a1f3a3c87f1c6c1aee8213be999b23289386))

### Bug Fixes

* **macos:** fix node-pty posix_spawnp error with postinstall script ([#347](https://github.com/alicomert/pixcode/issues/347)) ([38a593c](https://github.com/alicomert/pixcode/commit/38a593c97fdb2bb7f051e09e8e99c16035448655)), closes [#284](https://github.com/alicomert/pixcode/issues/284)
* slash commands with arguments bypass command execution ([#392](https://github.com/alicomert/pixcode/issues/392)) ([597e9c5](https://github.com/alicomert/pixcode/commit/597e9c54b76e7c6cd1947299c668c78d24019cab))

### Refactoring

* **releases:** Create a contributing guide and proper release notes using a release-it plugin ([fc369d0](https://github.com/alicomert/pixcode/commit/fc369d047e13cba9443fe36c0b6bb2ce3beaf61c))

### Maintenance

* update @anthropic-ai/claude-agent-sdk to version 0.1.77 in package-lock.json ([#410](https://github.com/alicomert/pixcode/issues/410)) ([7ccbc8d](https://github.com/alicomert/pixcode/commit/7ccbc8d92d440e18c157b656c9ea2635044a64f6))
