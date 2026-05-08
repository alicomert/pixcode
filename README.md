<div align="center">
  <img src="public/logo.png" alt="Pixcode logo" width="96" height="96" />
  <h1>Pixcode</h1>
  <p><strong>A self-hosted control room for AI coding agents.</strong></p>
  <p>
    Run Claude Code, Cursor CLI, Codex, Gemini CLI, Qwen Code, and OpenCode from one web UI with chat, shell, files, git, orchestration, API keys, plugins, notifications, Telegram, and desktop/server deployment.
  </p>
  <p>
    <a href="https://www.npmjs.com/package/@pixelbyte-software/pixcode"><img src="https://img.shields.io/npm/v/@pixelbyte-software/pixcode?style=for-the-badge&color=10b981" alt="npm version" /></a>
    <a href="https://github.com/alicomert/pixcode/releases/latest"><img src="https://img.shields.io/github/v/release/alicomert/pixcode?style=for-the-badge&color=0ea5e9" alt="latest release" /></a>
    <img src="https://img.shields.io/badge/Node.js-22%2B-3c873a?style=for-the-badge" alt="Node.js 22+" />
    <img src="https://img.shields.io/badge/Desktop-Windows%20%7C%20macOS%20%7C%20Linux-6366f1?style=for-the-badge" alt="desktop platforms" />
  </p>
  <p>
    <a href="README.tr.md">Türkçe</a> ·
    <a href="README.de.md">Deutsch</a> ·
    <a href="README.ru.md">Русский</a> ·
    <a href="README.ja.md">日本語</a> ·
    <a href="README.ko.md">한국어</a> ·
    <a href="README.zh-CN.md">简体中文</a>
  </p>
</div>

## What Pixcode Is

Pixcode turns your machine, VDS, or workstation into a browser-based AI development cockpit. Instead of jumping between terminals, desktop apps, CLI logs, file explorers, Git tools, and provider dashboards, you get one local web app that understands coding-agent workflows from start to finish.

It is designed for three common setups:

- **Local workstation**: run Pixcode on your computer and use it as a richer UI for the CLIs you already trust.
- **Always-on server**: run it on a Linux server, keep sessions alive, and connect from a laptop, tablet, or phone.
- **Desktop app**: install `.exe`, `.dmg`, or Linux builds from GitHub releases when you want a packaged app experience.

Pixcode is not a hosted cloud IDE. Your projects, credentials, CLI sessions, local files, Git state, and MCP config stay under your own machine unless you explicitly connect external services.

## Screenshots

| Workspace control room | Mobile chat |
| --- | --- |
| <img src="public/screenshots/desktop-main.png" alt="Pixcode desktop workspace" width="480" /> | <img src="public/screenshots/mobile-chat.png" alt="Pixcode mobile chat" width="260" /> |

| CLI selection | Tools and MCP |
| --- | --- |
| <img src="public/screenshots/cli-selection.png" alt="Pixcode CLI selection" width="420" /> | <img src="public/screenshots/tools-modal.png" alt="Pixcode tools modal" width="420" /> |

## Highlights

### One UI for the CLIs you already use

- Claude Code, Cursor CLI, Codex, Gemini CLI, Qwen Code, and OpenCode are available from the same project screen.
- Provider auth, API-key credentials, OAuth paste flows, install checks, model lists, and CLI version status live under Settings.
- You can keep using the provider-native CLIs. Pixcode wraps them with session management, web sockets, notifications, file context, and project controls.
- Processing state is visible while a CLI is thinking, running tools, waiting for approval, or producing output, so the screen does not feel frozen.

### Chat that feels like a development workspace

- Project-aware conversations with session history.
- Fixed bottom prompt composer for focused chat and selected project screens.
- Mode selection for default/plan/run flows, with mode persistence where the workflow expects it.
- Slash command support and provider-specific tool rendering.
- Push and Telegram notifications when long-running agent work finishes, fails, or needs attention.

### Files, shell, and source control without leaving the agent

- Built-in project file browser with edit, upload, rename, delete, and detailed view.
- Integrated shell panel that can open as split view or full view without losing the main chat/orchestration screen.
- Source Control panel for Git status, diffs, branches, commits, and changed files.
- Split panels have compact icon controls, close actions, and half/full behavior for desktop. Mobile uses a screen-appropriate layout instead of trying to force desktop split behavior.
- The file list is optimized for narrow panels, so permissions and long paths do not dominate the UI.

### Command Center for changed files

Pixcode keeps an eye on local working-tree changes, not only GitHub updates. The Quick Settings command mode can show changed files as they appear, highlight them, and jump directly to the edited location.

This is meant for control: when an AI agent edits files, you can see what changed immediately, open the file in the right panel, and keep the main chat or orchestration view visible.

### Multi-agent orchestration

The orchestration system is built for more than "send one prompt to one bot." It can coordinate multiple CLI agents around the same goal.

Built-in workflow styles include:

- **Agent Team**: split a task across frontend, backend, review, docs, or custom roles.
- **Multi-model Review**: ask different providers or models to inspect the same implementation.
- **Sequential Handoff**: pass work through ordered stages when one step depends on the previous result.
- **Decision Debate**: compare approaches before implementation.

Orchestration controls include:

- enable/disable agents per run,
- duplicate a provider when you need multiple workers from the same CLI,
- assign role, stage, label, and instruction per agent,
- select the model per agent, including OpenCode model choices,
- choose a fallback CLI agent for failed steps,
- preview the workflow DAG before running,
- stream run events and cancel active runs,
- resize orchestration side panes so task setup and run output can breathe.

### API-first automation

Pixcode's own frontend talks to the backend through REST and WebSocket APIs, and external automation can use the same control plane with Pixcode API keys.

New API keys start with `px_`:

```bash
curl http://localhost:3001/api/projects \
  -H "Authorization: Bearer px_your_key_here"
```

Run a one-shot provider task:

```bash
curl http://localhost:3001/api/agent \
  -H "Authorization: Bearer px_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "codex",
    "projectPath": "/home/me/project",
    "message": "Review the current diff and list the risky changes.",
    "stream": false
  }'
```

Preview an orchestration workflow:

```bash
curl http://localhost:3001/api/orchestration/workflows/agent_team/preview \
  -H "Authorization: Bearer px_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "metadata": {
      "agents": [
        { "adapterId": "codex", "label": "Backend", "role": "backend" },
        { "adapterId": "opencode", "label": "Reviewer", "role": "review" }
      ]
    }
  }'
```

Legacy `ck_` keys remain accepted for older installations, but `px_` is the current prefix.

OpenAPI reference: [`public/openapi.yaml`](public/openapi.yaml)

### Themes and appearance

Pixcode now has a real theme system instead of a single blue/navy look.

- Dark and light modes.
- Ready-made accent palettes, including emerald and VS Code-like colors.
- Custom light-mode and dark-mode accent colors.
- Token-based styling for active states, focus rings, buttons, navigation, and high-emphasis controls.
- Settings-driven theme changes without rebuilding the app.

The goal is to let the UI feel closer to a command-line/development tool when you want it, while still keeping the web app readable on mobile and desktop.

### Notifications and Telegram bridge

- Browser push notifications for long-running CLI sessions.
- Telegram pairing with short-lived codes.
- Telegram notifications for completed, failed, or action-required work.
- Optional bridge behavior so Telegram messages can become prompts for the Pixcode instance.
- Notification preferences are stored per user.

### Plugins and MCP

Pixcode includes optional extension points:

- MCP server management for supported providers.
- Provider-specific MCP/session/auth panels.
- Plugin loading with frontend tabs and optional backend services.
- Local settings for API keys, base URLs, model catalogs, and provider install status.

## Installation

### Run with npx

Requires Node.js 22 or newer.

```bash
npx @pixelbyte-software/pixcode
```

Then open:

```text
http://localhost:3001
```

### Install globally

```bash
npm install -g @pixelbyte-software/pixcode
pixcode
```

### Desktop installers

Download desktop builds from GitHub releases:

- Windows: `.exe`
- macOS: `.dmg`
- Linux: AppImage / package builds depending on the release asset

Releases: <https://github.com/alicomert/pixcode/releases/latest>

#### macOS Gatekeeper: "Pixcode is damaged"

Current macOS desktop builds are unsigned. If macOS says `Pixcode is damaged and can't be opened. You should move it to the Trash`, first make sure the DMG came from the official Pixcode GitHub Releases page, then:

1. Open the DMG and drag `Pixcode.app` into `/Applications`.
2. Double-click `Fix Gatekeeper.command` inside the mounted DMG.
3. Pixcode will remove the quarantine flag from `/Applications/Pixcode.app` and open normally.

Manual fallback:

```bash
xattr -dr com.apple.quarantine "/Applications/Pixcode.app"
open "/Applications/Pixcode.app"
```

### Linux daemon

For a server/VDS setup:

```bash
pixcode daemon install --mode auto --port 3001
pixcode daemon status --mode auto
pixcode daemon logs --mode auto
pixcode daemon restart --mode auto
```

Foreground mode:

```bash
pixcode --no-daemon
```

### Ports

- Backend and bundled frontend: `SERVER_PORT`, default `3001`.
- Vite-only frontend development: `VITE_PORT`, default `5173`.

For normal installed usage, think in terms of one port: `3001`. The `5173` port is only for separate Vite frontend development.

## First Run Checklist

1. Open Pixcode and create or sign in to the local user account.
2. Add the project folders you want to manage.
3. Connect the CLI providers you actually use.
4. Open Settings and check provider install/auth/model status.
5. Generate a `px_` API key if you want automation, CI, Telegram, or external tools to talk to Pixcode.
6. Pick your theme palette under Appearance.
7. Enable notifications if you want long-running sessions to report back.

## Development

```bash
npm install
npm run typecheck
npm run lint
npm run build
```

Important development notes:

- `npm run dev` uses the daemon manager on Linux.
- For a foreground development loop, run `npm run client` and `npm run server` separately, or run `pixcode --no-daemon`.
- `npm run server` runs built output from `dist-server/`; rebuild after backend changes.
- There is no unit test suite configured today. Use typecheck, lint, build, and manual provider/API checks.

## Repository Map

- `src/` - React + Vite frontend.
- `server/` - Express, WebSocket, CLI adapters, routes, auth, daemon, notifications.
- `server/modules/orchestration/` - multi-agent workflow engine and A2A adapters.
- `server/modules/providers/` - provider auth, MCP, sessions, model and install endpoints.
- `shared/` - contracts shared by frontend and backend.
- `public/openapi.yaml` - API reference shipped with the app.
- `public/screenshots/` - README/product screenshots.

## Security Model

- Pixcode is self-hosted. Treat it like a local control plane for your machine.
- Use strong local account credentials when exposing it on a network.
- Put it behind a trusted reverse proxy/VPN when running on a public server.
- API keys are intended for automation. Rotate them if they are exposed.
- Provider secrets are masked in APIs and UI responses where possible.

## Links

- npm: <https://www.npmjs.com/package/@pixelbyte-software/pixcode>
- GitHub: <https://github.com/alicomert/pixcode>
- Releases: <https://github.com/alicomert/pixcode/releases/latest>
- API docs: [`public/openapi.yaml`](public/openapi.yaml)
- Static docs: [`public/docs.html`](public/docs.html), [`public/features.html`](public/features.html), [`public/orchestration.html`](public/orchestration.html), [`public/api-automation.html`](public/api-automation.html)
- AI discovery: [`public/llms.txt`](public/llms.txt), [`public/llms-full.txt`](public/llms-full.txt)
