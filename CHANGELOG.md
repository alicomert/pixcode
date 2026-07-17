# Changelog

All notable changes to Pixcode will be documented in this file.


## [1.63.7](https://github.com/alicomert/pixcode/compare/v1.63.6...v1.63.7) (2026-07-17)

### Bug Fixes

* **pixbot:** badge/forceCli always spawns CLI, never HTTP recovery ([7833076](https://github.com/alicomert/pixcode/commit/7833076b28bd94092a25d5425c146fd03851afd6))

## [1.63.6](https://github.com/alicomert/pixcode/compare/v1.63.5...v1.63.6) (2026-07-17)

### New Features

* **pixbot:** agent slash badges in composer and chat bubbles ([183237e](https://github.com/alicomert/pixcode/commit/183237efbd4e1432efc4161244630d76af9631c6))

## [1.63.5](https://github.com/alicomert/pixcode/compare/v1.63.4...v1.63.5) (2026-07-17)

### Bug Fixes

* **pixbot:** explicit /grok always wins over HTTP model picker ([28e4615](https://github.com/alicomert/pixcode/commit/28e461519e6d29501ff4998237c9001548161030))

## [1.63.4](https://github.com/alicomert/pixcode/compare/v1.63.3...v1.63.4) (2026-07-17)

### Bug Fixes

* **pixbot:** never send HTTP picker models to CLI runners ([67ad398](https://github.com/alicomert/pixcode/commit/67ad398c87ded022ea3cf87f625b9b4d2a544bc7))

## [1.63.3](https://github.com/alicomert/pixcode/compare/v1.63.2...v1.63.3) (2026-07-17)

### Bug Fixes

* **pixbot:** no path hardcodes; fix opencode/codex NL routing ([fd4080d](https://github.com/alicomert/pixcode/commit/fd4080df401a993d6fe5c13ff766089a0358e23e))

### Maintenance

* **desktop:** bump version label to 1.63.2 (no installer rebuild) ([4079331](https://github.com/alicomert/pixcode/commit/407933145d368af686a02f51afba985405917b4f))

## [1.63.2](https://github.com/alicomert/pixcode/compare/v1.63.1...v1.63.2) (2026-07-17)

### Bug Fixes

* **pixbot:** force /grok CLI path and auto-attach project files ([0bb523b](https://github.com/alicomert/pixcode/commit/0bb523b391c889f7555fc34857292255a97ce17d))

### Maintenance

* **desktop:** bump version label to 1.63.1 (no installer rebuild) ([44c29fb](https://github.com/alicomert/pixcode/commit/44c29fb119a0cb776ca4cec8af6e04be5a326679))

## [1.63.1](https://github.com/alicomert/pixcode/compare/v1.63.0...v1.63.1) (2026-07-17)

### Bug Fixes

* **pixbot:** honest version check and real schedule/opencode routing ([2f529e8](https://github.com/alicomert/pixcode/commit/2f529e88e13ed392040bb9ad5921817aca1be2f0))

### Maintenance

* **desktop:** bump version label to 1.63.0 (no installer rebuild) ([47cdeaf](https://github.com/alicomert/pixcode/commit/47cdeaf00927dec5af91b90b426892fc23aa9570))

## [1.63.0](https://github.com/alicomert/pixcode/compare/v1.62.0...v1.63.0) (2026-07-17)

### New Features

* **pixbot:** stream chat, provider modal, and markdown replies ([f06d7c5](https://github.com/alicomert/pixcode/commit/f06d7c565ee92601c8da3d6e39375e744a105c15))

### Maintenance

* **desktop:** bump version label to 1.62.0 (no installer rebuild) ([93e90eb](https://github.com/alicomert/pixcode/commit/93e90eb1e5b5af22b1fb23128dc3a3e2f5f2b136))

## [1.62.0](https://github.com/alicomert/pixcode/compare/v1.61.1...v1.62.0) (2026-07-17)

### New Features

* **pixbot:** ChatGPT-style UI with model picker and project scan ([4d520e1](https://github.com/alicomert/pixcode/commit/4d520e180c85c213de554cab2867d12a13b810ad))
* **pixbot:** multi custom providers via models.dev catalog ([83931b2](https://github.com/alicomert/pixcode/commit/83931b2b9b09cdf74f962a97ec80d78ed4015060))
* **pixbot:** OpenAI-compatible API chat with /v1/models picker ([ba99eac](https://github.com/alicomert/pixcode/commit/ba99eacec57263a1f05fa7ba0a4c9340c41632ea))

### Maintenance

* **desktop:** bump version label to 1.61.1 (no installer rebuild) ([7343142](https://github.com/alicomert/pixcode/commit/7343142bb593962533b280d9eb61c9c85827bbc8))

## [1.61.1](https://github.com/alicomert/pixcode/compare/v1.61.0...v1.61.1) (2026-07-17)

### New Features

* **nanoclaw:** [@file](https://github.com/file) and /command autocomplete above chat input ([c95a126](https://github.com/alicomert/pixcode/commit/c95a12617e6f09eee884a7467c1e6725440f9064))

### Bug Fixes

* **cli:** never use sudo for npm update on Windows ([87c3712](https://github.com/alicomert/pixcode/commit/87c37125191b6aacf3e46f10a85a475d3a6303f8))
* **nanoclaw:** stop stuck loading; local smalltalk; clean CLI prompts ([1a446cc](https://github.com/alicomert/pixcode/commit/1a446ccfb1843d42c068e384c776d1d43e5ce503))
* **projects:** decode Windows Claude project paths for Files panel ([e342935](https://github.com/alicomert/pixcode/commit/e342935e18aa21c24bbbc793c6964c3f840ae45a))
* **update:** stabilize runtime delta updates against CDN 404s ([3943844](https://github.com/alicomert/pixcode/commit/39438449b0f6065b1cdeafb1f1468a866a550d69))

### Refactoring

* **nanoclaw:** replace /agent-opencode with short /opencode and chips ([5b1f538](https://github.com/alicomert/pixcode/commit/5b1f53878e6a6013c0ee96e918b1dc26308f4cee))

### Maintenance

* **desktop:** pin wrapper to 1.61.0 product runtime ([6a12c04](https://github.com/alicomert/pixcode/commit/6a12c0484d0db65bbc2a3d1aac9b7475c8e0d5e1))

## [1.61.0](https://github.com/alicomert/pixcode/compare/v1.60.1...v1.61.0) (2026-07-17)

### New Features

* **api:** NanoClaw HTTP surface + fix incomplete Files/Editor loads ([45ee9d8](https://github.com/alicomert/pixcode/commit/45ee9d888b66ceb5bbf773869e483c2e818cf7cc))
* **cli:** add Grok Build as first-class shell CLI provider ([67a6656](https://github.com/alicomert/pixcode/commit/67a6656c3486ed9a61f45540fe3e576d9eb8a71f))
* **nanoclaw:** chat-first engine — real conversation, not job tickets ([f4765a3](https://github.com/alicomert/pixcode/commit/f4765a3eecfc7ea6f345ef8b523e8108dbcc19d2))

### Bug Fixes

* **desktop:** pin installer to 1.60.1 and skip electron native rebuild ([3a7647c](https://github.com/alicomert/pixcode/commit/3a7647cbb5d1b44f0882714bb8b4abc0820c8a7e))
* **ui:** drop NC/Both/IDE switcher — always open hybrid ([5029747](https://github.com/alicomert/pixcode/commit/50297471a6b9a584df07cd92a7fe9b8c0508567a))

## [1.58.0](https://github.com/alicomert/pixcode/compare/v1.57.3...v1.58.0) (2026-07-16)

### New Features

* **tasks:** introduce PixBot chat with approve-to-run tasks and crons ([fdaabb7](https://github.com/alicomert/pixcode/commit/fdaabb7143692d998d73a3d70506ba5335e6933e))

## [1.57.3](https://github.com/alicomert/pixcode/compare/v1.57.2...v1.57.3) (2026-07-16)

### New Features

* **tasks:** wire CLI+model into runs with live OpenCode free catalog ([6adaf49](https://github.com/alicomert/pixcode/commit/6adaf49f189348a24d951dca99c5c4d8a9790c13))

### Maintenance

* sync desktop/package.json to 1.57.3 ([57ed7eb](https://github.com/alicomert/pixcode/commit/57ed7eb858504aef209b12c7c3b41a1fb2e23bcc))

## [1.57.2](https://github.com/alicomert/pixcode/compare/v1.57.1...v1.57.2) (2026-07-16)

### New Features

* **tasks:** CLI-first create flow with free model auto-select ([eca68e8](https://github.com/alicomert/pixcode/commit/eca68e8a6eb470309856f112cc65361b180d4ae4))

### Maintenance

* sync desktop/package.json to 1.57.2 ([744e544](https://github.com/alicomert/pixcode/commit/744e544a787810f675b992ec40f19181a505fc80))

## [1.57.1](https://github.com/alicomert/pixcode/compare/v1.57.0...v1.57.1) (2026-07-16)

### Bug Fixes

* drop SGR mouse reports with NaN coords that loop as terminal input ([6a93059](https://github.com/alicomert/pixcode/commit/6a9305994b276b6f61830426561b960d5d534393))

### Maintenance

* sync desktop/package.json to 1.57.1 ([992813a](https://github.com/alicomert/pixcode/commit/992813ae51017472e440a3dff22cf9d342e9bf89))

## [1.57.0](https://github.com/alicomert/pixcode/compare/v1.56.3...v1.57.0) (2026-07-16)

### New Features

* delta product updates for desktop runtime installs ([9c6b65a](https://github.com/alicomert/pixcode/commit/9c6b65a690156b11759d15f2f0ca7d48826cd121))

### Maintenance

* sync desktop/package.json to 1.57.0 ([bc3bda8](https://github.com/alicomert/pixcode/commit/bc3bda8ff4b5f56f2ad1589559039d8fa6ab663a))

## [1.56.3](https://github.com/alicomert/pixcode/compare/v1.56.2...v1.56.3) (2026-07-16)

### Bug Fixes

* make desktop in-app updates actually restart after download ([e6959a7](https://github.com/alicomert/pixcode/commit/e6959a7b063da5d9d9e54dcedd5c02fdc2a9f9ec))

### Maintenance

* sync desktop/package.json to 1.56.3 ([781c6f6](https://github.com/alicomert/pixcode/commit/781c6f6ae489722014763b7c8563f8bf7752539b))

## [1.56.2](https://github.com/alicomert/pixcode/compare/v1.56.1...v1.56.2) (2026-07-16)

### Bug Fixes

* stop file-tree refresh spam and terminal aNM background sessions ([5925d37](https://github.com/alicomert/pixcode/commit/5925d37cb38c13c8ece1634e507a4e8998d7db53))

### Maintenance

* sync desktop/package.json to 1.56.2 ([98a7443](https://github.com/alicomert/pixcode/commit/98a74439c9a06b1c45153465839452430cc09969))

## [1.56.1](https://github.com/alicomert/pixcode/compare/v1.56.0...v1.56.1) (2026-07-16)

### Bug Fixes

* stop first-run Access denied on missing auth token ([0bcdaa1](https://github.com/alicomert/pixcode/commit/0bcdaa1a866edc9c506050c190a803ce46edf881))

### Maintenance

* sync desktop/package.json to 1.56.1 ([353c025](https://github.com/alicomert/pixcode/commit/353c025f3d3e3b6e6add5f2feef3119cfb0f9a98))

## [1.56.0](https://github.com/alicomert/pixcode/compare/v1.55.11...v1.56.0) (2026-07-16)

### New Features

* task runtime overhaul and fix missing UI after npm update ([6681aca](https://github.com/alicomert/pixcode/commit/6681acaa8fba391dcbe9d911b3b3a4d14d7fdc2e))

### Bug Fixes

* sync desktop/package.json to 1.55.11 — installers must match release ([ca14343](https://github.com/alicomert/pixcode/commit/ca14343081a33129d69420674cd9d72b21e7d1cd))

## [1.55.0] — 2026-07-13

### Breaking Change — Orchestration System Replaced

The old orchestration system (workflows, a2a adapters, task dispatcher) has been
completely removed and replaced with a new, simpler, more reliable task system
inspired by FastVibe and VibeHQ.

### New Task System

- **Task queue with dependency support** — Tasks can chain: "Backend first, then frontend"
- **Scheduler** — Polls every 2 seconds, respects concurrency limits (default: 3)
- **Multi-CLI agent runners** — Claude Code (SDK), Codex (SDK), Gemini/Qwen/OpenCode (spawn)
- **Role presets** — Backend, Frontend, Fullstack, Reviewer, Tester (from VibeHQ model)
- **Git worktree isolation** — Each task gets its own branch and working directory
- **User interaction** — Agent can ask questions, user answers via Web UI
- **Budget tracking** — Per-task USD budget limit, token counting (input/output)
- **Session continuation** — Follow-up tasks can continue a predecessor's session
- **Task summary** — Automatic AI-generated summary on completion
- **Real-time updates** — SSE event stream for task status, logs, and interactions
- **REST API** — Full CRUD at `/api/tasks`, `/api/tasks/:id`, `/api/tasks/:id/logs`, etc.

### Frontend

- New **Tasks tab** in the sidebar with clipboard icon
- Task list with status filters, cost/token/file counts
- Task creation dialog with agent, role, model, priority, budget selection
- Task detail modal with logs, pending interactions, summary, changed files

### Removed

- `server/modules/orchestration/` — All workflow, a2a, task dispatcher code
- `src/components/orchestration/` — All orchestration UI components
- Preview proxy, workflow store, approval queue, built-in workflows
- A2A adapter registry and all provider adapters (Claude/Codex/Gemini/etc.)

### Kept

- `server/modules/security/permission-policy.ts` — Moved out of orchestration


## [v1.54.11](https://github.com/alicomert/pixcode/compare/v1.54.10...vv1.54.11) (2026-07-13)

### Bug Fixes

* add missing sidebar modal handler functions ([65caf69](https://github.com/alicomert/pixcode/commit/65caf6945239e0727adaefa6499519965b77e589))

### Documentation

* add MIT license badge, discussions badge, and Cloud SaaS section to README ([2e457f5](https://github.com/alicomert/pixcode/commit/2e457f5756faeba44f8d1033fc178c7b4e94d786))
* update landing page license label to MIT ([87aa34d](https://github.com/alicomert/pixcode/commit/87aa34d04e3ae4276cb324ce03004755a08d4f3e))

### CI/CD

* add CI workflow for lint, typecheck, and build on PRs and pushes ([cebb509](https://github.com/alicomert/pixcode/commit/cebb509e24574410fbd950bfd396dfd19ea37d7d))

## [1.54.7](https://github.com/alicomert/pixcode/compare/v1.54.6...v1.54.7) (2026-06-26)

Pixcode 1.54.7 removes the CSP header that was causing blank screens on VPS/cloud deployments.

### Bug Fixes

* remove Content-Security-Policy header entirely — it was blocking Vite inline modulepreload scripts, Google Fonts, and IP-based WebSocket connections, causing a blank white screen when accessing the UI
* fix duplicate `app.disable('x-powered-by')` call

## [1.54.6](https://github.com/alicomert/pixcode/compare/v1.54.5...v1.54.6) (2026-06-25)

Pixcode 1.54.6 fixes the server crash caused by static imports of native modules (better-sqlite3, node-pty) that fail when npm blocks install scripts.

### Bug Fixes

* make `better-sqlite3` import dynamic in `projects.js` — static top-level import crashed the server when the native module wasn't compiled (npm `allow-scripts` blocking)
* make `node-pty` import dynamic in `index.js` — server now starts even without the native module; terminal features show a helpful error message instead of crashing
* add guard before `pty.spawn()` — returns clear error to WebSocket client instead of throwing

## [1.54.5](https://github.com/alicomert/pixcode/compare/v1.54.4...v1.54.5) (2026-06-25)

Pixcode 1.54.5 fixes the API rate limiter that was blocking frontend polling and causing false "rate limit" errors.

### Bug Fixes

* exempt GET/HEAD/OPTIONS requests from API rate limiter — frontend polls update-state, sessions, and file tree endpoints frequently; limiting reads caused false 429 errors
* raise write-operation rate limit from 120/min to 300/min — prevents false positives during active coding sessions

## [1.54.4](https://github.com/alicomert/pixcode/compare/v1.54.3...v1.54.4) (2026-06-25)

Pixcode 1.54.4 completely removes auto browser opening (fixes xdg-open crash on headless Linux) and shows the server's public IP address instead of localhost.

### Bug Fixes

* remove auto browser opening entirely — was causing `spawn xdg-open ENOENT` crashes on headless Linux/VPS servers
* show server's public IP address (e.g. `http://85.235.74.198:3001`) instead of `localhost` in the ready banner and setup wizard
* list all available network IPs when multiple interfaces are present

## [1.54.3](https://github.com/alicomert/pixcode/compare/v1.54.2...v1.54.3) (2026-06-25)

Pixcode 1.54.3 fixes a server crash on headless Linux servers where `xdg-open` is not installed.

### Bug Fixes

* fix `spawn xdg-open ENOENT` crash on headless Linux/VPS — detect missing DISPLAY or xdg-open binary and skip browser opening silently instead of throwing an unhandled error event
* add `.on('error')` handler to spawn child processes to prevent unhandled error events from crashing the server

## [1.54.2](https://github.com/alicomert/pixcode/compare/v1.54.1...v1.54.2) (2026-06-25)

Pixcode 1.54.2 fixes a server crash caused by the CORS allowlist referencing an out-of-scope variable, and relaxes CSP to allow IP-based access.

### Bug Fixes

* fix server crash on startup — CORS origin function referenced `req` which was out of scope, causing immediate exit
* revert CORS to reflect-origin mode (`origin: true`) for self-hosted tool compatibility with IP-based access
* relax CSP `connect-src` to allow `http:` and `https:` alongside `ws:`/`wss:` for IP-based WebSocket access

## [1.54.1](https://github.com/alicomert/pixcode/compare/v1.54.0...v1.54.1) (2026-06-25)

Pixcode 1.54.1 fixes the terminal "aNM" spam with xterm.js parser handlers, fixes --dangerously-skip-permissions on root, and applies OWASP Top 10 2025 security hardening across the entire backend.

### Bug Fixes

* prevent terminal "aNM" feedback loop by registering xterm.js parser handlers that suppress DA1/DA2/DSR response generation at the source (regex sanitizers were insufficient for split chunks)
* fix `--dangerously-skip-permissions` refusing to run as root by setting `IS_SANDBOX=1` environment variable in both PTY shell and Claude SDK paths
* remove cloudflare tunnel quick-launch button from terminal panel
* sanitize error messages across all route handlers to prevent stack trace / file path leakage to clients
* add process-level uncaughtException and unhandledRejection handlers with clean exit

### Security (OWASP Top 10 2025)

* **A01 Broken Access Control**: require admin auth on connection-mode PUT and all diagnostics routes; replace wildcard CORS with origin allowlist
* **A02 Security Misconfiguration**: add security headers (CSP, X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy, Permissions-Policy); disable x-powered-by; set trust proxy; remove debug env logging
* **A03 Supply Chain**: verify npm tarball SRI integrity (SHA-512) before extraction in both runtime-dir and startup-update paths
* **A04 Cryptographic Failures**: replace Math.random with crypto.randomBytes for upload filenames and crypto.randomInt for Telegram pairing codes
* **A05 Injection**: validate port input before firewall commands; replace exec() with spawn() argument arrays for browser opening
* **A06 Insecure Design**: add rate limiting (10/15min auth, 120/min API); add account lockout after 5 failed logins; enforce strong password policy (8+ chars, mixed case, numbers, special)
* **A07 Auth Failures**: pin JWT algorithm to HS256; reduce JWT expiry from 7d to 24h; audit-log credentials passed via URL query params
* **A08 Integrity Failures**: add audit trail for plugin loading; verify tarball integrity in startup-update extraction
* **A09 Logging Failures**: add centralized security logger writing to ~/.pixcode/logs/security.log with log rotation and injection prevention; log all auth events, admin actions, rate limit hits, and system updates
* **A10 Exception Handling**: add global Express error middleware with safe messages; guard WebSocket error handlers; add process-level error handlers

## [1.54.0](https://github.com/alicomert/pixcode/compare/v1.53.28...v1.54.0) (2026-06-25)

Pixcode 1.54.0 adds an interactive first-run setup wizard, a one-click Cloudflare tunnel launcher in the terminal panel, and fixes a critical terminal feedback loop that produced "aNM" characters on Linux.

### New Features

* add interactive setup wizard for first-run experience — port selection, daemon/foreground mode choice, auto-open browser, and port conflict detection with alternative suggestions
* add `pixcode setup` command to manually re-run the setup wizard
* add `--no-browser` CLI flag to disable automatic browser opening on server ready
* add Cloudflare tunnel quick-launch button in the terminal panel — start/stop tunnel without leaving the terminal, shows public URL (click to copy)

### Bug Fixes

* prevent terminal "aNM" feedback loop on Linux by filtering xterm.js response sequences (DA2, mouse reports, DSR, focus events) that were echoed by the PTY and re-triggered responses indefinitely
* remove paste input size limit — raised from 16MB to 256MB, increased chunk size from 4KB to 16KB with zero delay, replaced silent drop with queue rotation
* add Ctrl+V / Cmd+V / Shift+Ctrl+V paste from clipboard support in the terminal
* add Shift+Ctrl+C copy current line support when no text is selected
* remove misleading "input queue limit reached" warning message on large pastes

## [1.53.4](https://github.com/alicomert/pixcode/compare/v1.53.3...v1.53.4) (2026-06-16)

Pixcode 1.53.4 fixes a Telegram bot memory blow-up caused by replaying stale Telegram update backlogs concurrently after startup.

### Fixes

* start Telegram polling only after token validation and listener wiring
* drop stale pending Telegram updates before long polling so old offline messages are not replayed into Pixcode on restart
* process Telegram updates serially with a bounded polling batch size to avoid parallel project/filesystem scans exhausting the Node heap
* prune expired Telegram inline callback actions and cap the callback action store

## [1.53.3](https://github.com/alicomert/pixcode/compare/v1.53.2...v1.53.3) (2026-06-16)

Pixcode 1.53.3 tightens the desktop workbench chrome, makes update/restart safer around active CLI sessions, and reduces background polling while preserving agent diff detection.

### Fixes

* move the Quick Settings trigger into the desktop workbench menu bar and keep the draggable floating handle mobile-only
* close editor tabs with middle-click and remove the unused File Tree collapse-all toolbar button
* localize workbench menu labels and the new settings-panel button across bundled locales
* reattach the update modal to an already-running background update job after reopening it
* block update restarts while active terminal or agent sessions are running until the user explicitly confirms

### Performance

* stop polling changed files while the file/changes panels are not visible, while keeping direct agent-message diff ingestion active
* preserve cached update metadata when GitHub release checks fail transiently
* harden theme storage reads/writes, custom accent validation, and cross-tab theme synchronization

## [1.53.2](https://github.com/alicomert/pixcode/compare/v1.53.1...v1.53.2) (2026-06-15)

Pixcode 1.53.2 fixes agent diff baseline tracking for dirty files and moves the notification center into the workbench top bar.

### Fixes

* track workspace file snapshots so CLI agent edits diff against the content immediately before the edit, not the whole git working tree
* show deleted agent-edited lines more clearly in the inline CodeMirror diff view
* place the notification dropdown in the workbench menu bar with a red unread state instead of a floating desktop button

## [1.53.1](https://github.com/alicomert/pixcode/compare/v1.53.0...v1.53.1) (2026-06-15)

Pixcode 1.53.1 fixes the first 1.53.0 workbench regressions around inline agent diffs, CLI tab persistence, and compact workbench chrome.

### Fixes

* fix filesystem auto-diff path normalization so absolute watcher paths are converted to project-relative paths before opening editor diffs
* align `file-with-diff` with git index semantics so staged-new plus unstaged edits show only the actual new line instead of the whole file as added
* keep CLI and plain-shell PTY sessions reusable across workspace switches and CLI panel hide/show by not persisting one-shot fresh-session flags
* compact the code editor diff badge and remove redundant workbench/CLI scroll/header controls
* move in-app notifications to a top-right dropdown and translate Remote Console / Control Room primary UI text

## [1.53.0](https://github.com/alicomert/pixcode/compare/v1.52.4...v1.53.0) (2026-06-15)

Pixcode 1.53.0 makes agent diffs visible by default, keeps workbench CLI tabs stable across workspace switches, removes the old Hermes control plane, and polishes Settings copy/accessibility.

### Features

* default `Agent diff` to `Always` for new preference stores
* persist workbench CLI/plain-terminal tabs per workspace without auto-opening provider tabs on startup
* dispatch orchestration tasks directly through in-process A2A adapters instead of the removed Hermes HTTP router

### Fixes

* remove duplicate CLI toolbar creation buttons and the old CLI History control
* restrict filesystem auto-diff to workspace files and skip internal paths such as `.git/`, `node_modules/`, and `.pixcode/`
* translate high-visibility Settings UI text and add visible labels for advanced access inputs

### Removed

* remove Hermes backend services, routes, scripts, smoke tests, settings UI, i18n keys, public docs, and public API manifest entries


## [1.52.4](https://github.com/alicomert/pixcode/compare/v1.52.3...v1.52.4) (2026-06-15)

Pixcode 1.52.4 fixes two issues that prevented filesystem edits (e.g. from `kimi`) from appearing as inline diffs: the workspace watcher was only subscribed when the FileTree explorer was open, and the diff visibility toggle did not update when a diff was applied to an already-open tab. The Quick Settings panel is also widened so the `Agent diff` selector fits.

### Features

* widen Quick Settings panel and allow the `Agent diff` PillBar to wrap

### Fixes

* subscribe to `watch-project` independently in `useFilesystemDiffAutoOpener` so external CLI edits are detected even when the explorer is closed
* update `CodeEditor` `showDiff` state whenever `file.diffInfo` changes

## [1.52.3](https://github.com/alicomert/pixcode/compare/v1.52.2...v1.52.3) (2026-06-15)

Pixcode 1.52.3 adds a **View → Quick Settings** menu item in the VSCode workbench layout and fixes inline diff not appearing when a diff is applied to an already-open editor tab.

### Features

* add **View → Quick Settings** menu item to open the panel from the top menu bar

### Fixes

* update `showDiff` state when `file.diffInfo` changes so agent/filesystem diffs appear on already-open tabs

## [1.52.2](https://github.com/alicomert/pixcode/compare/v1.52.1...v1.52.2) (2026-06-15)

Pixcode 1.52.2 fixes the Quick Settings panel so it is reachable in the desktop VSCode workbench layout, allowing users to change the `Agent diff` preference to `Always`.

### Fixes

* render Quick Settings panel at the app root so it appears in both VSCode workbench and mobile layouts

## [1.52.1](https://github.com/alicomert/pixcode/compare/v1.52.0...v1.52.1) (2026-06-15)

Pixcode 1.52.1 extends inline diff surfacing to filesystem edits such as those made by external CLI tools (e.g. `kimi`). Files modified outside of Pixcode's agent stream now open in diff mode automatically when the preference is enabled.

### Features

* auto-open filesystem edits as inline diff in the code editor
* apply filesystem diff to already-open editor tabs

## [1.52.0](https://github.com/alicomert/pixcode/compare/v1.51.9...v1.52.0) (2026-06-15)

Pixcode 1.52.0 surfaces agent file edits as inline diffs inside the code editor. When a CLI agent modifies a file that is already open, the editor switches to diff mode so additions and deletions are visible immediately.

### Features

* show agent file edits as inline diff in the code editor
* add `autoShowAgentDiff` preference: off / open files only / always
* apply agent diff to already-open editor tabs in both VSCode workbench and mobile layout

## [1.51.9](https://github.com/alicomert/pixcode/compare/v1.51.8...v1.51.9) (2026-06-15)

Pixcode 1.51.9 isolates every CLI and plain-terminal session by tab so multiple instances of the same provider can run side-by-side without PTY collisions, and adds multi-tab plain shell support in the workbench.

### Features

* isolate CLI/PTY sessions per tab using a unique tabId in the session key
* add multi-tab plain shell support in VSCode workbench
* batch PTY output to reduce WebSocket frame overhead

### Fixes

* prevent forceNewSession from killing sibling PTYs of the same provider

## [1.51.3](https://github.com/alicomert/pixcode/compare/v1.51.2...v1.51.3) (2026-06-14)

### New Features

* add JsonEventA2AAdapter ([904f64f](https://github.com/alicomert/pixcode/commit/904f64ff32e9479e1899db3b88fe0ca21fc1b335))
* add useExecutionState hook for task event streaming ([c27b73c](https://github.com/alicomert/pixcode/commit/c27b73cc10199248e3a028c18a42c66c2b6c9b10))
* export JsonEventA2AAdapter from orchestration index ([0a4ab42](https://github.com/alicomert/pixcode/commit/0a4ab42eedaefbca5a5c3a0615e87d1b4c6877f1))
* **hermes:** add control plane integration ([424d378](https://github.com/alicomert/pixcode/commit/424d3781026157e0c304053cfa004b392aed622b))
* **hermes:** surface control plane in workbench ([0f49f47](https://github.com/alicomert/pixcode/commit/0f49f472bd3c0e34176c35044a051bc5f720abf0))
* implement VerticalTimeline UI component for agent execution visualization ([a9600da](https://github.com/alicomert/pixcode/commit/a9600da0da9ff0c9eeb1f48ab9b8a3694f169b32))
* register JsonEventA2AAdapter in server index ([a06cea5](https://github.com/alicomert/pixcode/commit/a06cea5f908b3175badcbdc3566cd7f1914964b4))

### Refactoring

* **tests:** migrate JsonEventA2AAdapter tests to node:test and improve event handling ([5b9281b](https://github.com/alicomert/pixcode/commit/5b9281b8b0228e38043ae62f5a744244db5984b5))

### Tests

* add tests for JsonEventA2AAdapter ([39f4d94](https://github.com/alicomert/pixcode/commit/39f4d940c2d67fd7a26d53e9bcfd66bfa8814db1))

## [1.51.2](https://github.com/alicomert/pixcode/compare/v1.51.1...v1.51.2) (2026-06-02)

Pixcode 1.51.2 fixes OpenCode visible terminal startup with current OpenCode TUI builds.

### Fixes

* **opencode:** stop passing the headless `run --dangerously-skip-permissions` flag to the interactive OpenCode TUI, which prints the help screen and exits with code 1 on current OpenCode builds.

### Verification

* `scripts/smoke/pixcode-workbench-1-48.mjs`
* `node --check server/index.js`

## [1.51.1](https://github.com/alicomert/pixcode/compare/v1.51.0...v1.51.1) (2026-06-01)

Pixcode 1.51.1 keeps the desktop runtime dependency aligned with the published Hermes integration package.

### Fixes

* **desktop:** bump the Electron shell package and its embedded `@pixelbyte-software/pixcode` runtime dependency to `1.51.1` so newly built desktop installers do not pin the older runtime.

### Verification

* `npm view @pixelbyte-software/pixcode@1.51.0 version dist.tarball --json`
* `node --check dist-server/server/services/hermes-gateway.js`
* `node --check scripts/hermes/pixcode-mcp-server.mjs`
* `scripts/hermes/configure-pixcode-mcp.mjs`
* `scripts/smoke/hermes-rest-chat-api.mjs`
* `scripts/smoke/hermes-mcp-pixcode-roundtrip.mjs`

## [1.51.0](https://github.com/alicomert/pixcode/compare/v1.50.9...v1.51.0) (2026-06-01)

Pixcode 1.51.0 makes Hermes Agent a full Pixcode control plane instead of a narrow visible-terminal bridge.

### Features

* **hermes:** expose redacted integration diagnostics for install state, active model/provider, auth, toolsets, Pixcode MCP tools, REST gateway health, cron jobs, and recent error signals.
* **mcp:** add Pixcode API manifest access, authenticated Pixcode REST calls, managed Hermes gateway requests, Hermes cron job management, and direct visible CLI input tools.
* **settings:** add Hermes diagnostics, cron/MCP/model visibility, a real-prompt REST probe, and a non-interactive Hermes updater.
* **api:** document Hermes Agent and visible terminal control in the public automation manifest.

### Fixes

* **hermes:** keep `hermes-cli` enabled alongside `mcp-pixcode` so cron, skills, file, terminal, and native Hermes tools remain available.
* **hermes:** stop overriding toolsets on the Hermes terminal command line; Pixcode now writes the toolset config before launch to avoid new Hermes CLI warnings.
* **mcp:** wait for a stable idle visible provider readback, recover stuck startup input by submitting Enter to the existing terminal, and keep provider work in the visible Pixcode session.

### Verification

* `scripts/smoke/hermes-settings-commands.mjs`
* `scripts/smoke/hermes-mcp-pixcode-roundtrip.mjs`
* `scripts/smoke/hermes-rest-chat-api.mjs`
* `scripts/smoke/hermes-rest-codex-launch.mjs`
* `scripts/smoke/hermes-rest-gateway.mjs`
* `scripts/smoke/hermes-api-install.mjs`
* `scripts/smoke/pixcode-workbench-1-48.mjs`
* `scripts/smoke/vscode-workbench-polish.mjs`
* `npm run typecheck`
* `npm run lint`
* `npm run build`

## [1.50.9](https://github.com/alicomert/pixcode/compare/v1.50.8...v1.50.9) (2026-05-23)

Pixcode 1.50.9 fixes the Linux/self-hosted code editor loader so files that download correctly also open in Monaco.

### Fixes

* **editor:** configure the Monaco editor before mount to use Pixcode's same-origin `/vendor/monaco-editor/min/vs` loader instead of the default CDN loader.
* **server:** serve Monaco loader, language files, and workers from the installed `monaco-editor` package so git/npm Linux installs work without external CDN access.
* **packaging:** move `monaco-editor` to production dependencies so npm/runtime installs include the editor assets required by the backend vendor route.

### Verification

* `scripts/smoke/code-editor-vscode-engine.mjs`
* `npm run typecheck`
* `npm run lint`
* `npm run build`

## [1.50.8](https://github.com/alicomert/pixcode/compare/v1.50.7...v1.50.8) (2026-05-22)

Pixcode 1.50.8 hardens Hermes MCP control of visible provider terminals and keeps the Hermes REST gateway ready from settings.

### Fixes

* **hermes:** queue startup input for reused visible provider PTYs until the terminal is no longer busy, preventing Codex from receiving `/init` while a task is still in progress.
* **shell:** clear half-typed provider prompt lines before sending Hermes-requested work, so corrupted inputs like `t/init` are replaced with the exact requested command.
* **mcp:** rebind reused provider PTYs to the latest Hermes launch id so readback follows the current Codex/Claude/Gemini/Qwen/OpenCode request instead of timing out against an old session id.
* **mcp:** keep polling when Codex shows the requested text at the prompt but has not produced the final response yet.
* **hermes:** auto-start/probe the managed Hermes REST gateway from Settings and make MCP gateway probes start it by default unless explicitly disabled.

### Verification

* `scripts/smoke/hermes-settings-commands.mjs`
* `scripts/smoke/hermes-mcp-pixcode-roundtrip.mjs`
* `node --check server/index.js`
* `node --check scripts/hermes/pixcode-mcp-server.mjs`

## [1.50.7](https://github.com/alicomert/pixcode/compare/v1.50.6...v1.50.7) (2026-05-22)

Pixcode 1.50.7 fixes Hermes visible-terminal submission and replaces the bottom terminal minimized strip with half/full modes.

### Fixes

* **terminal:** filter xterm OSC 10/11/12 color-query replies before they are forwarded to provider PTYs, preventing `]11;rgb:...` text from corrupting Hermes/Codex prompts during resize or theme probes.
* **hermes:** submit Hermes startup input from the backend directly into the reused visible provider PTY, so existing Codex sessions receive `/init`, `selam`, or longer tasks instead of leaving text typed but unsubmitted.
* **shell:** carry explicit startup input delivery mode (`command` or `terminal`) through the shell WebSocket init payload.
* **workbench:** remove the bottom terminal minimize/restore strip and replace it with half-screen/full-screen controls that keep the PTY alive.

### Verification

* `scripts/smoke/hermes-settings-commands.mjs`
* `scripts/smoke/pixcode-workbench-1-48.mjs`
* `scripts/smoke/vscode-workbench-polish.mjs`
* `scripts/smoke/hermes-mcp-pixcode-roundtrip.mjs`
* `scripts/smoke/hermes-rest-codex-launch.mjs`
* `npm run typecheck`
* `npm run lint`
* `npm run build`

## [1.50.6](https://github.com/alicomert/pixcode/compare/v1.50.5...v1.50.6) (2026-05-22)

Pixcode 1.50.6 makes Hermes continue visible Pixcode CLI sessions instead of starting hidden provider processes.

### Fixes

* **hermes:** run the Hermes terminal with the Pixcode MCP-only toolset so requests like "open Codex and run /init" do not fall back to Hermes' hidden Codex skill/proc path.
* **workbench:** continue the current visible Codex/Claude/Gemini/Qwen/OpenCode terminal by default and only kill/start a fresh provider PTY when the user explicitly asks for a new session.
* **mcp:** carry `forceNewSession` through the Hermes launch API and keep startup input on the visible terminal path when reusing an existing session.
* **hermes:** update live REST smoke coverage to prove Pixcode MCP launches Codex with `forceNewSession=false` and permission bypass enabled.

### Verification

* `scripts/smoke/hermes-settings-commands.mjs`
* `scripts/smoke/pixcode-workbench-1-48.mjs`
* `scripts/smoke/vscode-workbench-polish.mjs`
* `scripts/smoke/hermes-api-install.mjs`
* `scripts/smoke/hermes-mcp-pixcode-roundtrip.mjs`
* `scripts/smoke/hermes-rest-codex-launch.mjs`
* `npm run typecheck`
* `npm run lint`

## [1.50.5](https://github.com/alicomert/pixcode/compare/v1.50.4...v1.50.5) (2026-05-21)

Pixcode 1.50.5 hardens Hermes-visible CLI work and keeps user-started tunnels alive across app updates.

### Fixes

* **hermes:** keep completed/failed visible provider PTY records long enough for Pixcode MCP readback, expose provider-agnostic lifecycle fields, and report non-zero visible terminal exits as failures instead of stale output.
* **hermes:** require stable idle readback before summarizing visible provider output, so Hermes does not answer while Codex/Claude/Gemini/Qwen/OpenCode is still printing follow-up results.
* **access:** persist the user's tunnel-start intent and restore cloudflared/ngrok on server restart after updates until the user explicitly stops the tunnel.

### Verification

* `scripts/smoke/hermes-settings-commands.mjs`
* `scripts/smoke/hermes-mcp-pixcode-roundtrip.mjs`
* `scripts/smoke/tunnel-persistence.mjs`
* `scripts/smoke/mobile-tunnel-guidance.mjs`
* `node --check server/index.js`
* `node --check server/services/external-access.js`
* `node --check scripts/hermes/pixcode-mcp-server.mjs`

## [1.50.4](https://github.com/alicomert/pixcode/compare/v1.50.3...v1.50.4) (2026-05-21)

Pixcode 1.50.4 fixes Hermes readback so visible provider work is not reported before the provider CLI is actually done.

### Fixes

* **hermes:** keep polling visible provider terminal output while Codex is still busy and only treat the readback as final after the terminal returns to an idle prompt.
* **mcp:** tie Pixcode MCP provider-output reads to the exact Hermes terminal launch id, so Hermes cannot summarize an older or different Codex terminal session by mistake.
* **shell:** carry the Hermes launch id from the workbench into the provider PTY cache and expose terminal busy/idle state through the provider-output API.
* **hermes:** default startup-input launches to completion-aware readback and return an explicit non-final message if the provider is still running.

### Verification

* `scripts/smoke/hermes-settings-commands.mjs`
* `scripts/smoke/hermes-mcp-pixcode-roundtrip.mjs`
* `scripts/smoke/hermes-rest-codex-launch.mjs`
* `npm run typecheck`
* `npm run lint`
* `npm run build`
* `git diff --check`

## [1.50.3](https://github.com/alicomert/pixcode/compare/v1.50.2...v1.50.3) (2026-05-21)

Pixcode 1.50.3 fixes Hermes-driven visible Codex launches and makes Hermes terminal state workspace-scoped again.

### Fixes

* **hermes:** pass Hermes-triggered Codex startup prompts to the Codex CLI as the initial prompt argument instead of typing into the already-open TUI, so update banners or startup screens cannot leave `/init` or longer tasks sitting unsubmitted.
* **workbench:** persist Hermes bottom-terminal open/minimized state per workspace, so switching workspaces reconnects to that workspace's own Hermes PTY instead of keeping the previous project's Hermes terminal on screen.
* **hermes:** open native history with `hermes sessions browse` instead of the parent `hermes sessions` usage screen.
* **shell:** submit detected CLI prompt option buttons with Enter, so model/setup/update pickers do not leave a bare number typed into the terminal.
* **mcp:** steer Hermes to use Pixcode MCP launch/readback for visible provider work instead of launching a hidden parallel Codex process for the same request.

### Verification

* `scripts/smoke/hermes-settings-commands.mjs`
* `scripts/smoke/pixcode-workbench-1-48.mjs`
* `scripts/smoke/vscode-workbench-polish.mjs`
* `scripts/smoke/hermes-mcp-pixcode-roundtrip.mjs`
* `scripts/smoke/hermes-rest-codex-launch.mjs`
* `scripts/smoke/vscode-workbench-layout.mjs`
* `npm run typecheck`
* `npm run lint`
* `npm run build`
* `git diff --check`

## [1.50.2](https://github.com/alicomert/pixcode/compare/v1.50.1...v1.50.2) (2026-05-21)

Pixcode 1.50.2 stabilizes the Hermes bottom terminal when switching workspaces.

### Fixes

* **workbench:** bind the bottom terminal to the project it was opened for instead of following every workspace selection change, so Hermes keeps running in the background and reconnects like the other CLI terminals.
* **hermes:** add a bottom-terminal history action that opens the native `hermes sessions` view in the project terminal.
* **i18n:** add the Hermes history label across all bundled common locales.

### Verification

* `scripts/smoke/pixcode-workbench-1-48.mjs`
* `scripts/smoke/vscode-workbench-polish.mjs`
* `scripts/smoke/vscode-workbench-layout.mjs`
* `scripts/smoke/hermes-settings-commands.mjs`
* `npm run typecheck`
* `npm run lint`
* `npm run build`

## [1.50.1](https://github.com/alicomert/pixcode/compare/v1.50.0...v1.50.1) (2026-05-21)

Pixcode 1.50.1 fixes Hermes-triggered Codex tasks getting typed into the visible terminal without being submitted.

### Fixes

* **shell:** send Hermes-triggered Codex startup input with a line feed submit sequence, while leaving the existing carriage-return flow for the other provider TUIs.
* **workbench:** stop pre-appending a submit character before provider-aware startup input normalization, so `/init` and longer Hermes prompts are sent through one consistent path.

### Verification

* `scripts/smoke/hermes-settings-commands.mjs`
* `scripts/smoke/hermes-mcp-pixcode-roundtrip.mjs`
* `scripts/smoke/hermes-rest-codex-launch.mjs`
* `scripts/smoke/pixcode-workbench-1-48.mjs`
* `scripts/smoke/vscode-workbench-polish.mjs`
* `scripts/smoke/vscode-workbench-layout.mjs`
* `npm run typecheck`
* `npm run lint`
* `npm run build`

## [1.50.0](https://github.com/alicomert/pixcode/compare/v1.49.11...v1.50.0) (2026-05-21)

Pixcode 1.50.0 makes Hermes a visible work controller for full provider-CLI tasks and gives Hermes launches a real bypass path.

### Features

* **hermes:** send arbitrary multi-step user work through Pixcode MCP as provider CLI `startupInput`, so Hermes can open Codex, Claude, Gemini, Qwen, Cursor, or OpenCode and drive the requested work in the visible Pixcode terminal instead of using hidden shell/proc execution.
* **hermes:** carry `permissionMode`, `skipPermissions`, and `bypassPermissions` from Hermes MCP launch requests through the backend event stream into the shell websocket init message, using provider-specific no-approval flags where supported.
* **hermes:** start the real Hermes terminal with `hermes --yolo` by default so Hermes approval prompts do not block work launched from Pixcode.
* **ui:** replace the placeholder Hermes `H` glyph with the provided 60x60 Hermes Agent logo across settings, welcome, activity, and terminal surfaces.

### Verification

* `scripts/smoke/hermes-settings-commands.mjs`
* `scripts/smoke/hermes-rest-codex-launch.mjs`
* `scripts/smoke/hermes-mcp-pixcode-roundtrip.mjs`
* `npm run typecheck`
* `npm run lint`
* `npm run build`

## [1.49.11](https://github.com/alicomert/pixcode/compare/v1.49.10...v1.49.11) (2026-05-21)

Pixcode 1.49.11 stabilizes the Hermes terminal integration, keeps REST gateway control isolated from the user's normal Hermes gateway, and restores terminal copy/paste shortcuts.

### Fixes

* **hermes:** run the Pixcode-managed REST gateway from an isolated Hermes profile and strip messaging-platform credentials from its copied `.env` so `--replace` no longer kills or races the user's default/global Hermes gateway.
* **hermes:** configure Pixcode MCP before launching the real `hermes` terminal, enable the MCP toolset for the CLI, and reuse existing gateways without killing them after transient probe failures.
* **hermes:** teach Pixcode MCP to configure provider MCP settings before launching installed CLIs and to block launch requests for providers that are not installed.
* **shell:** wait for provider TUIs such as Codex to become ready before sending Hermes-triggered startup input, avoiding prompts being written too early.
* **terminal:** support browser and xterm copy/paste flows for `Ctrl+C`, `Ctrl+V`, `Ctrl+Shift+C`, and `Ctrl+Shift+V` while preserving `Ctrl+C` interrupt when no text is selected.

### Verification

* `scripts/smoke/pixcode-workbench-1-48.mjs`
* `scripts/smoke/hermes-gateway-persistence.mjs`
* `scripts/smoke/hermes-rest-gateway.mjs`
* `scripts/smoke/hermes-rest-chat-api.mjs`
* `scripts/smoke/hermes-rest-chat-live.mjs`
* `scripts/smoke/hermes-mcp-pixcode-roundtrip.mjs`
* `npm run typecheck`
* `npm run build`

## [1.49.10](https://github.com/alicomert/pixcode/compare/v1.49.9...v1.49.10) (2026-05-21)

Pixcode 1.49.10 makes Hermes use the real REST gateway path with terminal-style output and blocks smoke-test launchers from being treated as installed Hermes.

### Fixes

* **hermes:** reject `Hermes Agent v0.0.0 smoke` launchers and avoid persisting temporary `HERMES_CLI_PATH` commands into user PATH shims.
* **hermes:** start the gateway with `hermes gateway run --replace` so an existing Hermes gateway no longer crashes Pixcode REST chat with code 1.
* **hermes:** send prompts through `/v1/responses` first, report the REST endpoint/status/transport back to the UI, then fall back to `/v1/chat/completions` and `/v1/runs`.
* **workbench:** replace the Hermes bubble chat surface with a terminal-style REST transcript that shows the command prompt, endpoint, HTTP status, transport, and Hermes output.

### Verification

* `scripts/smoke/hermes-smoke-launcher-guard.mjs`
* `scripts/smoke/hermes-rest-chat-api.mjs`
* `scripts/smoke/hermes-rest-chat-live.mjs`
* `scripts/smoke/hermes-rest-live.mjs`
* `scripts/smoke/hermes-api-install.mjs`
* `scripts/smoke/hermes-rest-gateway.mjs`
* `scripts/smoke/pixcode-workbench-1-48.mjs`
* `node --input-type=module --eval "...selam..."`
* `npm run typecheck`

## [1.49.9](https://github.com/alicomert/pixcode/compare/v1.49.8...v1.49.9) (2026-05-21)

Pixcode 1.49.9 fixes the Hermes REST chat path and the Codex terminal crash introduced while removing the old Hermes shell sentinel.

### Fixes

* **cli:** remove the last stale `hermesCommand` references from provider shell startup logging so Codex, Gemini, Qwen, OpenCode, and Cursor sessions can start normally.
* **hermes:** send bottom-panel Hermes chat prompts through the OpenAI-compatible `/v1/chat/completions` gateway endpoint before falling back to `/v1/runs`.
* **hermes:** include recent Hermes gateway stdout/stderr when the gateway exits, so the UI shows the real failure text instead of only `Hermes gateway exited with code 1`.

### Verification

* `scripts/smoke/hermes-rest-chat-api.mjs`
* `scripts/smoke/hermes-rest-chat-live.mjs`
* `scripts/smoke/hermes-rest-live.mjs`
* `scripts/smoke/pixcode-workbench-1-48.mjs`
* `scripts/smoke/hermes-rest-gateway.mjs`
* `scripts/smoke/hermes-api-install.mjs`
* `node --check server/index.js`
* `node --check server/services/hermes-gateway.js`
* `node_modules/.bin/eslint server/index.js server/services/hermes-gateway.js scripts/smoke/hermes-rest-chat-api.mjs scripts/smoke/hermes-rest-gateway.mjs scripts/smoke/pixcode-workbench-1-48.mjs`
* `npm run build:server`

## [1.49.8](https://github.com/alicomert/pixcode/compare/v1.49.7...v1.49.8) (2026-05-21)

Pixcode 1.49.8 replaces the brittle Hermes terminal launch path with a REST-backed chat flow and stops the workbench from polling empty launch events every few seconds.

### Fixes

* **hermes:** replace the bottom Hermes shell sentinel with a REST chat panel that starts the managed Hermes gateway and sends prompts through `/api/orchestration/hermes/gateway/chat`.
* **hermes:** add a server-side gateway run helper that submits `/v1/runs`, polls run status, and returns the final Hermes message/error to the UI.
* **hermes:** stream MCP terminal-launch requests to the workbench over SSE at `/api/orchestration/hermes/terminal-launches/stream` instead of repeated `?after=0` polling.
* **shell:** remove the old Hermes-specific shell sentinel expansion so the normal terminal stays a plain project shell.

### Verification

* `scripts/smoke/pixcode-workbench-1-48.mjs`
* `scripts/smoke/hermes-api-install.mjs`
* `scripts/smoke/hermes-rest-gateway.mjs`
* `scripts/smoke/vscode-workbench-polish.mjs`
* `scripts/smoke/hermes-rest-live.mjs`
* `scripts/smoke/hermes-rest-codex-launch.mjs`
* `npm run typecheck`
* `npm run lint`
* `npm run build`
* `npm pack --dry-run --ignore-scripts --json --cache /tmp/npm-cache`

## [1.49.7](https://github.com/alicomert/pixcode/compare/v1.49.6...v1.49.7) (2026-05-21)

Pixcode 1.49.7 fixes the Hermes and right-side CLI terminal regressions found in the live VS Code-style workbench.

### Fixes

* **hermes:** start the explicit interactive `hermes chat` entrypoint and print an immediate startup line so the bottom terminal no longer looks dead while Hermes initializes.
* **hermes:** make the Hermes new-session action request a fresh backend PTY instead of reconnecting to a stale blank session.
* **cli:** remove the Hermes-related auto-connect suspension that made Codex/Gemini/Qwen/OpenCode starts fall back to the two-step "Continue in shell" overlay.
* **cli:** restore a persistent close button in the right CLI terminal toolbar so users can return to the CLI picker without relying on the inner shell header.

### Verification

* `scripts/smoke/pixcode-workbench-1-48.mjs`
* `scripts/smoke/hermes-api-install.mjs`
* `scripts/smoke/vscode-workbench-polish.mjs`
* `npm run typecheck`
* `npm run lint`

## [1.49.6](https://github.com/alicomert/pixcode/compare/v1.49.5...v1.49.6) (2026-05-21)

Pixcode 1.49.6 makes Hermes testable and usable through a managed REST gateway instead of trusting terminal-only launch behavior.

### Fixes

* **hermes:** add a Pixcode-managed `hermes gateway` lifecycle with status, start, stop, and REST probe APIs for `/health`, `/v1/capabilities`, `/v1/models`, and optional `/v1/runs`.
* **hermes:** expose gateway status/probe tools through Pixcode MCP and enable the Pixcode MCP toolset for Hermes API-server runs.
* **hermes:** pass Hermes MCP terminal-launch prompts into the selected CLI terminal, so a Hermes request can open Codex and submit the requested work text.
* **hermes:** retry Windows installer `spawn EPERM` PowerShell launch failures through `cmd.exe` without requesting elevation.
* **settings:** add Hermes REST gateway controls and probe feedback to the dedicated Hermes Agent settings page.

### Verification

* `scripts/smoke/hermes-rest-gateway.mjs`
* `scripts/smoke/hermes-mcp-pixcode-roundtrip.mjs`
* `scripts/smoke/hermes-rest-live.mjs`
* `scripts/smoke/hermes-rest-codex-launch.mjs`
* `scripts/smoke/hermes-api-install.mjs`
* `scripts/smoke/pixcode-workbench-1-48.mjs`
* `npm run typecheck`
* `npm run lint`
* `npm run build`

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
