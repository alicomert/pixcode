# Pixcode v2 — Lightweight Self-Hosted Coding Workbench

Date: 2026-08-25
Status: Approved (user confirmed approach + Tauri 2 + multi-language)

## Goal

Replace the legacy pixcode codebase (~128K LOC, 524 files, 24+78 deps) with a
minimal, fast, mobile-friendly, self-hosted coding workbench in the spirit of
VibeVim: one unified core, one protocol, thin adapters.

## Non-goals (v2 skeleton)

- Plugin system, orchestration, telegram/remote-console/live-view modules
- Multi-user accounts and roles
- Daemon/systemd management (CLI `start` only for now)
- Full git panel (branch/log remain out of scope; push/pull are included)

## Architecture (Approach 1 — Unified Core)

Single npm package (`pixcode`, bin `pixcode`). Node 22+, ESM.

```
Preact UI (3-pane desktop / bottom-tabs mobile)
        │ single WebSocket, multiplexed channels
Node backend (zero framework): http + ws only
  router · auth(scrypt/JWT/API-key) · projects · fs · git · pty · agent runner
  agents/ : AgentAdapter base + 6 thin adapters
```

Runtime dependencies: `ws`, `node-pty`. Everything else is hand-rolled or a
frontend build-time dep. Password hashing via `node:crypto scrypt`. JWT is a
~30-line HS256 implementation on `node:crypto` — no auth libraries.

### WebSocket protocol

One WS endpoint `/ws`. Client sends `{ch, id, op, ...payload}` frames; server
replies with same `id` plus events pushed as `{ch, ev, data}`. Channels:
`auth`, `project`, `fs`, `git`, `pty`, `agent`.

### Unified agent event schema

Every adapter normalizes its CLI's stream output to:

```json
{ "type": "status|message|tool|diff|usage|error|done",
  "role": "assistant|user|system",
  "text": "...", "tool": {...}, "diff": {...}, "ts": 0 }
```

Adapters implement `buildArgs(session)`, `normalizeLine(line) -> event[]`,
`stop()`. First fully wired adapter: Claude Code. Others ship with correct
spawn commands and minimal normalization, completed in follow-up passes.

## Frontend

- Preact + Vite, plain JSX (no TS build friction), `@preact/signals` for state.
- CodeMirror 6 editor; inline diff via `@codemirror/merge`; lazy-load language
  packs.
- xterm.js terminal tabs (shell + per-agent CLIs), fit addon, mobile-friendly.
- Layout: left rail (agent picker, file tree, git status), center editor/diff,
  right agent chat + terminals.
- Mobile <768px: bottom tab bar switching Files / Editor / Agent / Terminal,
  full-screen panes.
- Theme: Tailwind CSS design tokens with custom properties, dark default, light
  toggle, and Lucide icons for workbench actions.
- Budget: initial load <400KB gzipped.

## i18n

Hand-rolled module (~40 lines): JSON dictionaries, `{var}` interpolation,
browser-language detection, persisted choice in localStorage. Ships `tr` and
`en`; adding a language = dropping one JSON file. Switcher lives in the top
bar; all UI strings go through `t()`.

## Auth

First run: setup password → scrypt hash stored with salt in `~/.pixcode/auth.json`.
Login issues HS256 JWT (24h). API keys (`px_…`) stored alongside, accepted as
`X-API-Key` or `Authorization: Bearer`. All `/api/*` and WS require auth except
setup/login/health.

## Git scope

`status --porcelain=v2`, per-file `diff`, stage/unstage, commit, push and pull.
Push/pull use the current repository defaults (remote/upstream) and run
non-interactively with a timeout; credential setup remains available through
the terminal.

## Desktop (Tauri 2)

`src-tauri/` wraps the built web app: ~10MB binary, later iOS/Android shells
reuse it. Dev mode points at Vite URL; production serves `dist/`.

## Distribution

`npm i -g pixcode && pixcode start [--port]`. CLI: `start | status | version`.
Conventional Commits; release-it comes back after the skeleton stabilizes.

## Error handling

WS errors carry `{ch, id, error}` frames; PTY exit is quiet; agent crashes emit
a normalized `error` event and mark session stopped. Server never throws on a
single-channel failure.

## Verification

No test runner. Gate: `npm run lint` + `npm run build` + smoke script hitting
health/setup/login over HTTP + manual UI check (tree, editor save, terminal,
agent spawn).
