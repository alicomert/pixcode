# AGENTS.md

Pixcode v2 — a self-hosted AI coding workbench: a Node.js backend (ESM, Node >=22)
serves a Preact/Vite frontend over HTTP plus one authenticated WebSocket that
multiplexes `fs`, `git`, `pty`, `agent`, `project`, `auth`, `activity`, `share`
channels. A Tauri 2
shell wraps the built frontend for desktop. There is no test runner and no
typecheck script — `npm run lint` is the only automated check.

## Commands

- `npm install` — `node-pty` (backend) and `tauri` (desktop) are native; a C++
  toolchain / Rust toolchain must be present or installs/builds fail.
- `npm start` (a.k.a. `npm run server`) — backend only, always on the stable
  publication port `3001`. For an isolated port use `node server/cli.js start
  --port N`; host is `0.0.0.0`; serves `dist/` if it exists, otherwise 404s on `/`.
- `pixcode` (no args, TTY) — interactive dashboard: status box, daemon
  start/stop/restart, open-in-browser, settings, update check, logs. Non-TTY
  prints compact status.
- `pixcode daemon install` — start the backend detached and register login
  autostart (systemd/desktop entry on Linux, LaunchAgent on macOS, Startup folder
  on Windows). On a real first run (no `~/.pixcode/cli.json`, TTY, no `--port`)
  it asks port + autostart; a busy port is probed via `/api/health` — a pixcode
  already serving there is reported and adopted into the message, a foreign
  app is refused. `daemon status|logs|restart|stop|disable` manage it.
- `pixcode settings [set port|workspace|autostart <v>]` — edits
  `~/.pixcode/cli.json` (0600); port resolution is flag > cli.json > env >
  default. Interactive `settings` rewrites autostart + restarts the daemon.
- `pixcode update [--check|--yes]` — checks npm registry **and** GitHub
  releases/tags, applies through the install channel (`npm i -g` for global
  installs, `git pull --ff-only` + rebuild for checkouts), then restarts the
  daemon. `server/update.js` holds the logic; `server/cli-ui.js` is the
  dependency-free prompt/ANSI layer (degrades cleanly without a TTY).
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
  WS `agent.agents` reply has exactly **7** adapters — keep this in sync if you
  add/remove an adapter in `server/agents/adapters/`.
- `agent-terminal-smoke.mjs` — `BASE` defaults to `http://127.0.0.1:3231`
  (different port — set `BASE` or run a second server on 3231). Requires at least
  one agent CLI on PATH and verifies sessions survive reconnect.

## Architecture boundaries

- Live filesystem sync: `fs.watch`/`fs.unwatch` subscribe a connection to its
  workspace; `fs:changed` pushes `{workspace, files:[{path,kind}], git}` to
  every subscriber (debounced ~120ms). Watching is per-directory
  (node_modules/caches skipped — inotify cost stays proportional to the
  source tree); `.git` top-level + `refs/` flag `git:true` so commits/pulls
  from any side refresh the Git panel instantly. Late-appearing `.git` dirs
  are picked up live. Client subscription is centralized in
  `src/lib/fs-watch.js` (re-arms on `pixcode:ws-open`, re-points on
  workspace change); views just listen for the event.
- `server/` — Node backend. Entry `server/index.js` (`createHttpServer`/`startServer`);
  CLI `server/cli.js` (`pixcode start [--port N] [--workspace PATH] | status | version`).
  One file per WS channel in `server/channels/`. `server/agents/runner.js` spawns
  agent CLIs via `node-pty`; `workspaceCwd` rejects any cwd outside the workspace (403).
  `server/activity.js` keeps a per-workspace JSONL event log (fs ops, watcher
  flushes, git, pty/agent lifecycles) behind the `activity` channel; workspace
  keys are canonicalized realpaths, and running agent sessions + activity
  subscribers pin the fs watcher so logging survives closed trees/clients.
  `server/share.js` backs the admin-only `share` channel and `pixcode share`:
  it spawns a detached tunnel process (cloudflared / `ssh -R` to a sish relay /
  ngrok / zrok / bore.dk) that exposes the daemon on a public HTTPS URL. State
  lives in `$PIXCODE_HOME/share.json` (+ `share-opts.json` 0600 for restart),
  a persistent `share-key` ed25519 keypair is the sish identity, and
  `shareResume()` on server start respawns an enabled tunnel. Provider secrets
  are write-only — `share.json` masks them.
- `src/` — Preact frontend. Entry `src/main.jsx` → `App.jsx`. State via
  `@preact/signals` (`src/state/`). Styling is **Tailwind v4** through
  `@tailwindcss/vite` (CSS entry `src/styles/tailwind.css`), not a tailwind config.
- `src-tauri/` — thin Tauri 2 Rust shell (`frontendDist: ../dist`, `devUrl: :5199`).
- `scripts/` — standalone smoke scripts (no npm wiring).
- `docs/superpowers/{specs,plans}/` — design docs.
- `public/` — static assets incl. `sw.js`, registered in prod by `src/main.jsx`.
- `dist/` and `pixcode-projects/` are gitignored — never commit either.

## Agent adapters

Seven adapters live in `server/agents/adapters/`: `claude`, `codex`, `devin`,
`gemini`, `qwen`, `opencode`, `grok`. Each wraps an external CLI detected via
a PATH scan (`server/util/env.js` builds a service-friendly PATH from the
login shell plus well-known dirs, also used for agent/pty spawn env);
`available` is false if the binary is missing. Only `claude` and
`devin` set `interactive: true`. Each adapter may also declare `static
install` (`{ command, windows? }`) — the CLI's one-line installer, shown in
the new-session modal so an unavailable agent can be installed in a visible
terminal. Detection results are cached in `$PIXCODE_HOME/agent-availability.json`
for 24h (probing scans the login-shell/known-dir PATH, not just the service
PATH); `agent.agents` with `{ refresh: true }` forces a re-check, the server
re-probes hourly and broadcasts `agent.agents` when availability changes,
and opening the new-session modal triggers a fresh check. Adding an
8th requires updating `registerAllAdapters` **and** the `agents.length !== 7`
assertion in `scripts/smoke.mjs`.

## Auth & config

- First run requires setup: `POST /api/auth/setup` with a password >= 6 chars.
  State lives in `$PIXCODE_HOME/auth.json` (default `~/.pixcode/`, mode 0600).
- Auth accepts JWT bearer tokens (24h TTL) **or** API keys (`px_…`, issued via
  `/api/auth/keys`). WS auth passes the token as `?token=` on the `/ws` URL.
- Session expiry: JWTs live 24h. Client-side `ws.js` reads `exp` before each
  connect, probes `/api/auth/me` once when an upgrade is refused, and any
  non-login REST 401 clears the token — all paths fire `pixcode:auth-expired`,
  which `App.jsx` listens for to drop back to `AuthGate`. Reconnects use
  capped exponential backoff (~1s→15s + jitter); `ws.close()` is re-armable —
  `connect()` clears the flag so the "server unavailable → retry" path can
  reopen the socket.
- Per-user CLI environment: `cli-env.json` (0600) maps each `sub` to
  `{env: {KEY: value}, home: bool}`. `cliEnvFor(sub)` merges those vars over
  the daemon env at every spawn (`agent` runner + `pty` channel) — a user with
  no record inherits the shared daemon credentials; `home:true` gives them a
  private `cli-home/<sub>` HOME (0700, lazily created) so CLI logins/configs
  don't collide. `agent.cliEnv`/`agent.saveCliEnv` ops are per-user and take
  an admin-only `for: <sub>` to manage a member's record (UserManager's
  "Private CLI home" toggle drives this); values are write-only (names only
  in responses). `PATH`/`HOME`/`USER`/`LOGNAME`/`SHELL` overrides are
  rejected — HOME is the flag's job.
- Multi-account access: `auth.json` keeps the owner account plus `users[]`
  (admin-created, `role` `admin`/`member`, `projects`/`agents` allowlists —
  `null` means unrestricted — and `disabled`). `resolvePrincipal` maps tokens to
  live users so disable/delete revokes mid-session; `accessFor(ctx)` is checked
  per op. `workspaceRoot(ws, ctx)` enforces the project allowlist across
  fs/git/pty/agent channels; `project` create/open/clone/browse and API-key +
  user management ops are admin-only. Members see filtered `project.list` /
  `agent.agents`, and `pty`/`agent` sessions stay isolated per `sub:clientId`.
- Env (see `server/config.js`): `PORT`/`PIXCODE_PORT` (3001), `PIXCODE_HOST`
  (`0.0.0.0`), `PIXCODE_HOME` (auth dir), `PIXCODE_PROJECTS` (projects dir,
  default `./pixcode-projects`), `PIXCODE_WORKSPACE` (pin a single external
  workspace instead of numbered projects).
- GitHub sign-in has three tiers. Primary: **web OAuth** — `git.oauthStart`
  returns the app's authorize URL; GitHub redirects the browser to
  `/api/git/oauth/callback`, where `webComplete` swaps the code for a user
  token and adopts the profile. Requires a stored `clientId` + `clientSecret`
  (0600 `$PIXCODE_HOME/git-oauth.json`), produced automatically by the
  manifest bootstrap (`git.appBootstrap` → `/api/git/app/callback` — the
  manifest also registers the callback URL). Fallbacks: **device flow**
  (`git.deviceStart`/`devicePoll`, needs the app owner's manual Device-Flow
  opt-in — GitHub exposes no API for it) and manual PAT paste. A client_id
  saved without a secret (legacy or `PIXCODE_GITHUB_CLIENT_ID` /
  `git.saveOauthClientId`) can only use device flow.

## Conventions

- `"type": "module"` — every `.js` file is ESM; use `import`/`export`, never `require`.
- ESLint: `no-unused-vars` is an error (prefix unused args with `_`); `no-console`
  is off; browser + node globals both on; `sourceType: module`, JSX enabled.
- Frontend is Preact, not React — import from `preact`/`@preact/*`, not `react`.
- `pixcode-projects/` holds managed per-user project workspaces selected via the
  title bar; their contents are runtime data, not part of this repo's source.
