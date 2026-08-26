# AGENTS.md

Pixcode v2 — a self-hosted AI coding workbench: a Node.js backend (ESM, Node >=22)
serves a Preact/Vite frontend over HTTP plus one authenticated WebSocket that
multiplexes `fs`, `git`, `pty`, `agent`, `project`, `auth` channels. A Tauri 2
shell wraps the built frontend for desktop. There is no test runner and no
typecheck script — `npm run lint` is the only automated check.

## Commands

- `npm install` — `node-pty` (backend) and `tauri` (desktop) are native; a C++
  toolchain / Rust toolchain must be present or installs/builds fail.
- `npm start` (a.k.a. `npm run server`) — backend only, always on the stable
  publication port `3001`. For an isolated port use `node server/cli.js start
  --port N`; host is `0.0.0.0`; serves `dist/` if it exists, otherwise 404s on `/`.
- `pixcode daemon install` — start the backend detached and register login
  autostart (systemd/desktop entry on Linux, LaunchAgent on macOS, Startup folder
  on Windows). Use `daemon status`, `daemon logs`, `daemon restart`, or
  `daemon disable` to manage it.
- `npm run dev` — Vite frontend only, port 5199. **It proxies `/api` and `/ws` to
  the backend at `PORT||PIXCODE_PORT||3001`, so you must also run `npm start` or API/WS will fail.**
- `npm run build` — Vite build into `dist/` (what the backend serves in prod).
- `npm run lint` — ESLint flat config (`eslint.config.js`); run before claiming done.
- `npm run desktop` / `npm run desktop:build` — Tauri via `npx` (the CLI is
  intentionally not installed with the normal web/backend dependencies to keep
  `node_modules` small). `beforeDevCommand` starts Vite, but the Node backend
  is **not** started for you; run `npm start` separately.

Verify order: `npm run lint`. There is no `test` script.

## Smoke tests (manual, no npm script)

`scripts/*.mjs` are plain node scripts that hit a **running** server — start the
backend first, then `node scripts/smoke.mjs`.

- `smoke.mjs` — `BASE` defaults to `http://localhost:3001`. Performs first-run
  setup itself using `PIXCODE_SMOKE_PASSWORD` (default `secret123`). Asserts the
  WS `agent.agents` reply has exactly **6** adapters — keep this in sync if you
  add/remove an adapter in `server/agents/adapters/`.
- `agent-terminal-smoke.mjs` — `BASE` defaults to `http://127.0.0.1:3231`
  (different port — set `BASE` or run a second server on 3231). Requires at least
  one agent CLI on PATH and verifies sessions survive reconnect.

## Architecture boundaries

- `server/` — Node backend. Entry `server/index.js` (`createHttpServer`/`startServer`);
  CLI `server/cli.js` (`pixcode start [--port N] [--workspace PATH] | status | version`).
  One file per WS channel in `server/channels/`. `server/agents/runner.js` spawns
  agent CLIs via `node-pty`; `workspaceCwd` rejects any cwd outside the workspace (403).
- `src/` — Preact frontend. Entry `src/main.jsx` → `App.jsx`. State via
  `@preact/signals` (`src/state/`). Styling is **Tailwind v4** through
  `@tailwindcss/vite` (CSS entry `src/styles/tailwind.css`), not a tailwind config.
- `src-tauri/` — thin Tauri 2 Rust shell (`frontendDist: ../dist`, `devUrl: :5199`).
- `scripts/` — standalone smoke scripts (no npm wiring).
- `docs/superpowers/{specs,plans}/` — design docs.
- `public/` — static assets incl. `sw.js`, registered in prod by `src/main.jsx`.
- `dist/` and `pixcode-projects/` are gitignored — never commit either.

## Agent adapters

Six adapters live in `server/agents/adapters/`: `claude`, `codex`, `gemini`,
`qwen`, `opencode`, `grok`. Each wraps an external CLI discovered via `which`;
`available` is false if the binary is missing. Only `claude` sets `interactive:
true`. Adding a 7th requires updating `registerAllAdapters` **and** the
`agents.length !== 6` assertion in `scripts/smoke.mjs`.

## Auth & config

- First run requires setup: `POST /api/auth/setup` with a password >= 6 chars.
  State lives in `$PIXCODE_HOME/auth.json` (default `~/.pixcode/`, mode 0600).
- Auth accepts JWT bearer tokens (24h TTL) **or** API keys (`px_…`, issued via
  `/api/auth/keys`). WS auth passes the token as `?token=` on the `/ws` URL.
- Env (see `server/config.js`): `PORT`/`PIXCODE_PORT` (3001), `PIXCODE_HOST`
  (`0.0.0.0`), `PIXCODE_HOME` (auth dir), `PIXCODE_PROJECTS` (projects dir,
  default `./pixcode-projects`), `PIXCODE_WORKSPACE` (pin a single external
  workspace instead of numbered projects).

## Conventions

- `"type": "module"` — every `.js` file is ESM; use `import`/`export`, never `require`.
- ESLint: `no-unused-vars` is an error (prefix unused args with `_`); `no-console`
  is off; browser + node globals both on; `sourceType: module`, JSX enabled.
- Frontend is Preact, not React — import from `preact`/`@preact/*`, not `react`.
- `pixcode-projects/` holds managed per-user project workspaces selected via the
  title bar; their contents are runtime data, not part of this repo's source.
