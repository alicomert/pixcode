# AGENTS.md

Web UI (`pixcode` / "CloudCLI UI") for Claude Code, Cursor CLI, Codex, and Gemini CLI. React+Vite frontend, Express+WS backend, SQLite auth, optional plugins.

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
- `npm run typecheck` — both tsconfigs; run this after TS edits (there are no unit tests).
- `npm run lint` / `lint:fix` — scopes to `src/` and `server/`. No test runner is configured; do not invent one.
- `./release.sh` / `npm run release` — release-it; requires `main` + clean tree. CI workflow: `.github/workflows/release.yml` (manual dispatch).

## Don't-get-burned list

- **No test suite exists.** `package.json` has no `test` script. Verify via `lint` + `typecheck` + manual run.
- **`npm run dev` installs/starts a daemon**, not a foreground process. On servers it persists after the shell exits. Use `pixcode --no-daemon` or `PIXCODE_NO_DAEMON=1` for foreground, or run `client` + `server` scripts directly.
- `npm run server` runs the **compiled** output (`dist-server/server/cli.js`). Editing `server/*.js` without rebuilding will not take effect. `server:dev` runs from source (`server/cli.js`).
- `better-sqlite3`, `bcrypt`, `node-pty` are native modules — `npm install` may need build tools. `node-pty` on macOS needs the postinstall fix (already wired).
- Default auth DB is `~/.pixcode/auth.db` (hardcoded in `server/load-env.js`). Override with `DATABASE_PATH`.
- `.env` is loaded manually by `server/load-env.js` from the app root (found by walking up to the nearest `server/` folder — works from both `server/` source and `dist-server/server/`). `VITE_*` vars are separately read by Vite via `loadEnv`.
- Port env vars: `SERVER_PORT` (backend), `VITE_PORT` (frontend). Legacy `PORT` is still accepted but planned for removal (see `vite.config.js`). `HOST=0.0.0.0` binds all interfaces; Vite uses `shared/networkHosts.js` to pick the right loopback/proxy host.
- `plugins/starter` is a **git submodule** (see `.gitmodules`). It ships empty unless `git submodule update --init` was run.
- Frontend entry is `main.jsx` (JSX file) but imports `App.tsx`. Mixed JS/TS is intentional — don't mass-rename.
- Service worker at `/sw.js` is registered in `main.jsx`; PWA assets live in `public/`.

## Lint / architecture rules to respect

Config: `eslint.config.js` (flat config, two blocks).

- Frontend: import ordering enforced (`import-x/order` with groups + blank lines), Tailwind classname order (`tailwindcss/classnames-order`), React hooks rules, `unused-imports/no-unused-imports` as warn. `@typescript-eslint/no-explicit-any` is **off** by choice.
- Backend: `eslint-plugin-boundaries` now has live rules. Boundary elements:
  - `backend-shared-type-contract` → `server/shared/types.{js,ts}`, `server/shared/interfaces.{js,ts}` — backend modules may only `import type` from these (no value/runtime imports).
  - `backend-shared-utils` → `server/shared/utils.{js,ts}` — runtime helpers, free to import.
  - `backend-legacy-runtime` → `server/projects.js`, `server/sessionManager.js`, `server/database/*`, `server/utils/runtime-paths.js` — still exists during the migration, modules can reach into it.
  - `backend-module` → `server/modules/*` — each folder is one module. Cross-module imports must go through the module's barrel file (`index.{ts,js}`); deep paths into another module's internals are disallowed.
- `import-x/no-unresolved` is an error on backend; keep path aliases resolvable via `server/tsconfig.json` (`@/*` → `server/*`).

## Commits, hooks, PRs

- Husky enabled via `prepare` script. `pre-commit` runs `lint-staged` (eslint on changed `src/**` and `server/**`). `commit-msg` runs `commitlint` with `@commitlint/config-conventional`.
- **Conventional Commits required.** Non-conforming messages are rejected locally. Types: `feat|fix|perf|refactor|docs|style|chore|ci|test|build` (see `CONTRIBUTING.md`). Breaking: `feat!:` or `BREAKING CHANGE:` footer.
- Release-it config (`.release-it.json`) requires branch `main` and clean tree; runs `npm run build` before release; publishes to npm with `--access public`; tag format `v${version}`.

## Backend layout (current reality)

- `server/index.js` — Express app, route mounting, static serving of `public/` + `dist/`, WS setup. Single large file. Mounts new provider routes under `/api/providers` and legacy per-provider routes under `/api/{codex,cursor,gemini,...}`.
- `server/cli.js` — user-facing CLI (`start`, `daemon`, `sandbox`, `status`, `version`, ...). Installed as `pixcode`.
- `server/daemon/manager.js` + `server/daemon-manager.js` — systemd-based daemon install/logs/restart (Linux focus).
- `server/modules/providers/` — **new canonical home** for provider code (post v1.30.0 merge):
  - `list/{claude,codex,cursor,gemini}/*-{auth,mcp,sessions}.provider.ts` — per-provider auth, MCP management, and session discovery
  - `services/{provider-auth,mcp,sessions}.service.ts` — orchestration over those providers
  - `provider.registry.ts` — `ProviderRegistry` instance wiring everything together
  - `provider.routes.ts` — express router mounted at `/api/providers`
  - `shared/base/abstract.provider.ts` + `shared/mcp/mcp.provider.ts` — shared base classes
  - `tests/*.test.ts` — TS unit-test files (no runner configured yet; typecheck only)
- `server/shared/{types,interfaces,utils}.ts` — shared TypeScript contracts that backend modules can import (see boundaries rules above).
- `server/routes/*.js` — legacy per-surface routes still in use (auth, projects, git, mcp-utils, codex, cursor, gemini, taskmaster, plugins, agent, commands, settings, user, messages, cli-auth). Some (like `mcp.js`) were deleted during the v1.30.0 merge — the new MCP functionality lives under `server/modules/providers/services/mcp.service.ts` and is exposed through `provider.routes.ts`.
- `server/database/{db.js,schema.js}` — `better-sqlite3` auth/user/token storage. Classified as `backend-legacy-runtime` for boundary rules.
- `server/utils/plugin-loader.js` + `plugin-process-manager.js` — dynamic plugin loading (frontend tabs + optional Node backends).
- `server/claude-sdk.js`, `server/cursor-cli.js`, `server/openai-codex.js`, `server/gemini-cli.js` — still top-level agent runtime files, not yet moved under modules/.
- `~/.claude` is read/written directly for MCP config, sessions, permissions — this is the integration model, not a duplicate store. `.claude/settings.json` env vars (e.g. `ANTHROPIC_BASE_URL`) are forwarded into the SDK subprocess via `claude-sdk.js` `mapCliOptionsToSDK`.

## Frontend layout additions (post v1.30.0 merge)

- `src/shared/view/ui/` — rich primitive set now exported via the barrel `index.ts`: `Alert, Card, Collapsible, Command, Confirmation, Dialog, PromptInput, Queue, Reasoning, Shimmer` in addition to the existing `Badge, Button, Input, ScrollArea, Tooltip, DarkModeToggle, LanguageSelector, PillBar`.
- `src/components/mcp/` — replaces the old settings-modal MCP flow. `view/McpServers.tsx` and `view/modals/McpServerFormModal.tsx` drive the UI; `hooks/useMcpServers.ts` + `hooks/useMcpServerForm.ts` own the data. The old `src/components/settings/view/modals/{Claude,Codex}McpFormModal.tsx` and `tabs/agents-settings/sections/content/McpServersContent.tsx` are deleted.
- `src/components/chat/tools/components/{PlanDisplay,ToolStatusBadge}.tsx` — rendered by `ToolRenderer` on top of the new primitives to show Claude plan mode blocks and tool run status.
- `src/contexts/PermissionContext.tsx` — new context holding the per-session permission mode / active tool approvals.
- `src/hooks/useServerPlatform.ts` — reports whether the backend is running as the managed Pixcode platform variant; some UI shows extra entry points when it is.
- `tailwind.config.js` exposes three keyframes/animations the new primitives rely on: `shimmer`, `dialog-overlay-show`, `dialog-content-show`.
