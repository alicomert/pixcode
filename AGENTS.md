# AGENTS.md

Web UI (`pixcode`) for Claude Code, Cursor CLI, Codex, Gemini CLI, Qwen Code, and OpenCode. React+Vite frontend, Express+WS backend, SQLite auth, optional plugins. Also ships an Electron wrapper (`desktop/`, separate private package pinned to the main package version) and Docker sandbox images (`docker/`). `CLAUDE.md` / `GEMINI.md` are slimmer companions that defer to this file.

## Stack & topology

- Node **22+** required (`.nvmrc` = `v22`). ESM everywhere (`"type": "module"`).
- Frontend: `src/` — React 18 + Vite 7 + Tailwind 3 + TS+JS mix. Entry: `src/main.jsx` → `src/App.tsx`. Alias `@/*` → `src/*`.
- Backend: `server/` — Express + `ws`. Mostly `.js` today, TS allowed (`allowJs: true`, `checkJs: false`). Alias `@/*` → `server/*` (separate tsconfig).
- Shared: `shared/` is consumed by both sides and is compiled into `dist-server/shared/` for the backend build.
- Two tsconfigs by design: `tsconfig.json` (frontend, `noEmit`) and `server/tsconfig.json` (backend, emits to `dist-server/` with `tsc-alias` resolving `@/*`). `npm run typecheck` runs both.
- Routes mounted under `/api/*` in `server/index.js`. WebSocket endpoints: `/ws`, `/shell`. Vite dev proxies all three to `SERVER_PORT` (default 3001).

## Commands that matter

- `npm install` — runs `scripts/fix-node-pty.js` as postinstall (fixes macOS `spawn-helper` perms). Safe/no-op elsewhere.
- `npm run dev` — **not** a vite dev server. It calls `server:dev`, which invokes the daemon manager (`node server/cli.js daemon install --mode system ...`). On Linux this installs a systemd unit. For a plain foreground dev loop, run `npm run client` (Vite on 5173) and `npm run server` (built backend) separately, or use `node server/cli.js start`.
- `npm run client` — Vite dev server only (port from `VITE_PORT`, default 5173, `strictPort: true`).
- `npm run server` — runs the **built** backend from `dist-server/`. Requires `npm run build:server` first.
- `npm run build` = `build:client` (→ `dist/`) + `build:server` (→ `dist-server/`, rm'd first by `prebuild:server`).
- `npm run typecheck` — both tsconfigs; run this after TS edits.
- `npm run lint` / `lint:fix` — scopes to `src/` and `server/`.
- `npm run smoke:*` — smoke scripts in `scripts/smoke/*.mjs` (only some have npm scripts; run others via `node scripts/smoke/<name>.mjs`). Two kinds: static source-regex checks (no server needed, e.g. `chat-session-state`) and live API checks that require a running backend plus `PIXCODE_API_KEY` (e.g. `provider-rest-api`, `orchestration-live-run`).
- `./release.sh` / `npm run release` — release-it; requires `main` + clean tree. CI workflow: `.github/workflows/release.yml` (manual dispatch, runs `npx release-it --ci`). No CI runs lint/typecheck on PRs — local hooks are the only gate.

## Don't-get-burned list

- **No `test` script / runner.** `*.test.ts` files exist under `server/modules/**` (node:test style) but are only typechecked, never executed by any script. Verify via `lint` + `typecheck` + relevant smoke script + manual run.
- **`npm run dev` installs/starts a daemon**, not a foreground process. On servers it persists after the shell exits. Use `pixcode --no-daemon` or `PIXCODE_NO_DAEMON=1` for foreground, or run `client` + `server` scripts directly.
- `npm run server` runs the **compiled** output (`dist-server/server/cli.js`). Editing `server/*.js` without rebuilding will not take effect. `server:dev` runs from source (`server/cli.js`).
- `better-sqlite3` and `node-pty` are native modules — `npm install` may need build tools. `node-pty` on macOS needs the postinstall fix (already wired). Password hashing uses pure-JS `bcryptjs`, not native `bcrypt`.
- Default auth DB is `~/.pixcode/auth.db` (hardcoded in `server/load-env.js`). Override with `DATABASE_PATH`.
- `.env` is loaded manually by `server/load-env.js` from the app root (found by walking up to the nearest `server/` folder — works from both `server/` source and `dist-server/server/`). `VITE_*` vars are separately read by Vite via `loadEnv`.
- Port env vars: `SERVER_PORT` (backend), `VITE_PORT` (frontend). Legacy `PORT` is still accepted but planned for removal (see `vite.config.js`). `HOST=0.0.0.0` binds all interfaces; Vite uses `shared/networkHosts.js` to pick the right loopback/proxy host.

- Frontend entry is `main.jsx` (JSX file) but imports `App.tsx`. Mixed JS/TS is intentional — don't mass-rename.
- Service worker at `/sw.js` is registered in `main.jsx`; PWA assets live in `public/`.

## Lint / architecture rules to respect

Config: `eslint.config.js` (flat config, two blocks).

- Frontend: import ordering enforced (`import-x/order` with groups + blank lines), Tailwind classname order (`tailwindcss/classnames-order`), React hooks rules, `unused-imports/no-unused-imports` as warn. `@typescript-eslint/no-explicit-any` is **off** by choice.
- Backend: `eslint-plugin-boundaries` has live rules. Boundary elements:
  - `backend-shared-type-contract` → `server/shared/types.{js,ts}`, `server/shared/interfaces.{js,ts}` — backend modules may only `import type` from these (no value/runtime imports).
  - `backend-shared-utils` → `server/shared/utils.{js,ts}` and `shared/modelConstants.{js,ts}` — runtime helpers, free to import.
  - `backend-legacy-runtime` → `server/projects.js`, `server/sessionManager.js`, `server/database/*`, `server/services/**`, `server/utils/runtime-paths.js` — still exists during the migration, modules can reach into it.
  - `backend-module` → `server/modules/*` (currently `providers`, `orchestration`) — each folder is one module. Cross-module imports must go through the module's barrel file (`index.{ts,js}`); deep paths into another module's internals are disallowed.
- `boundaries/no-unknown` is an error: a backend import that boundaries cannot classify fails lint — new shared files may need an element entry in `eslint.config.js`.
- `import-x/no-unresolved` is an error on backend; keep path aliases resolvable via `server/tsconfig.json` (`@/*` → `server/*`).

## Commits, hooks, PRs

- Husky enabled via `prepare` script. `pre-commit` runs `lint-staged` (eslint on changed `src/**` and `server/**`). `commit-msg` runs `commitlint` with `@commitlint/config-conventional`.
- **Conventional Commits required.** Non-conforming messages are rejected locally. Types: `feat|fix|perf|refactor|docs|style|chore|ci|test|build` (see `CONTRIBUTING.md`). Breaking: `feat!:` or `BREAKING CHANGE:` footer.
- Release-it config (`.release-it.json`) requires branch `main` and clean tree; runs `npm run build` before release; publishes to npm with `--access public`; tag format `v${version}`.

## Backend layout

- `server/index.js` — Express app, route mounting, static serving of `public/` + `dist/`, WS setup. Single large file. All `/api/*` routes pass `validateApiKey`, most also `authenticateToken`. Mounts provider routes under `/api/providers`, orchestration under `/api/orchestration`, legacy per-provider routes under `/api/{codex,cursor,gemini,qwen,...}`.
- `server/cli.js` — CLI (`start`, `daemon`, `sandbox`, `status`, `version`, ...). Installed as `pixcode`.
- `server/daemon/manager.js` + `server/daemon-manager.js` — systemd-based daemon management (Linux focus).
- `server/modules/providers/` — provider code:
  - `list/{claude,codex,cursor,gemini,opencode,qwen}/*-{auth,mcp,sessions}.provider.ts` — per-provider auth, MCP, sessions
  - `services/{provider-auth,mcp,sessions}.service.ts` — orchestration
  - `provider.registry.ts` — registry wiring
  - `provider.routes.ts` — router mounted at `/api/providers`
  - `shared/base/abstract.provider.ts` + `shared/mcp/mcp.provider.ts` — base classes
- `server/modules/orchestration/` — multi-agent orchestration module: `a2a/` (A2A protocol + per-provider adapters), `workflows/` (runner, templates, traces), `tasks/`, `workspace/` (docker + git-worktree workspaces), `preview/`.
- `server/shared/{types,interfaces,utils}.ts` — shared TypeScript contracts (see boundaries rules above).
- `server/routes/*.js` — legacy routes (auth, projects, git, mcp-utils, codex, cursor, gemini, qwen, plugins, agent, commands, settings, user, messages, telegram, remote, webhooks, live-view, diagnostics, network, platformization, production-agent-loop, public-api).
- `server/database/{db.js,json-store.js}` — `better-sqlite3` auth/user/token storage (`backend-legacy-runtime`).
- `server/utils/plugin-loader.js` + `plugin-process-manager.js` — dynamic plugin loading.
- `server/claude-sdk.js`, `server/cursor-cli.js`, `server/openai-codex.js`, `server/gemini-cli.js`, `server/opencode-cli.js`, `server/qwen-code-cli.js` — agent runtime files (plus `*-response-handler.js` companions).
- `~/.claude` is read/written directly for MCP config, sessions, permissions — not a duplicate store.

## Frontend layout

- `src/shared/view/ui/` — primitives exported via barrel `index.ts`: `Alert, Card, Collapsible, Command, Confirmation, Dialog, PromptInput, Queue, Reasoning, Shimmer` plus `Badge, Button, Input, ScrollArea, Tooltip, DarkModeToggle, PillBar`.
- Notable feature dirs under `src/components/`: `orchestration/` (multi-agent workflows UI), `control-room/`, `vscode-workbench/`, `live-view/`, `remote-console/`. GSAP animation hooks live in `src/lib/animations.ts` (`useGsapEntrance`, `useGsapCrossfade`, ...). Session state store: `src/stores/useSessionStore.ts`.
- `src/components/mcp/` — MCP server management UI. `view/McpServers.tsx`, `view/modals/McpServerFormModal.tsx`, hooks `useMcpServers.ts`, `useMcpServerForm.ts`.
- `src/components/chat/tools/components/{PlanDisplay,ToolStatusBadge}.tsx` — rendered by `ToolRenderer` for Claude plan mode and tool run status.
- `src/contexts/PermissionContext.tsx` — per-session permission mode / active tool approvals.
- `src/hooks/useServerPlatform.ts` — reports whether backend runs as managed Pixcode platform variant.
- `tailwind.config.js` exposes keyframes: `shimmer`, `dialog-overlay-show`, `dialog-content-show`.

## Mobile parity requirement

- Every frontend feature must have an intentional mobile path (`<768px`) unless the task explicitly says desktop-only. Check navigation, settings, modals, workspace/session context, and any new tab/tool entry point on mobile before release.
- Do not hide desktop-only controls without providing a compact mobile equivalent. Prefer bottom sheets, active-section switchers, icon buttons with tooltips/labels, and full-width form controls over long horizontal pill bars or fixed edge handles.
- Terminal/CLI work must preserve real xterm behavior and session continuity on mobile; avoid wrapping the terminal in decorative cards or compressed preview panels.
- Release verification for UI work should include `npm run smoke:mobile-ux` plus lint/typecheck/build when practical.
