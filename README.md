<div align="center">
  <img src="public/logo.png" alt="Pixcode logo" width="92" height="92" />
  <h1>Pixcode</h1>
  <p><strong>Self-hosted control plane for AI coding agents.</strong></p>
  <p>
    Pixcode lets you run AI coding CLIs, inspect files, manage shell and source control,
    coordinate agent work, automate through APIs, and keep long-running work alive from
    your own computer or server.
  </p>
  <p>
    <a href="https://www.npmjs.com/package/@pixelbyte-software/pixcode"><img src="https://img.shields.io/npm/v/@pixelbyte-software/pixcode?style=for-the-badge&color=10b981" alt="npm version" /></a>
    <a href="https://github.com/alicomert/pixcode/releases/latest"><img src="https://img.shields.io/github/v/release/alicomert/pixcode?style=for-the-badge&color=0ea5e9" alt="latest release" /></a>
    <img src="https://img.shields.io/badge/Node.js-22%2B-3c873a?style=for-the-badge" alt="Node.js 22+" />
    <img src="https://img.shields.io/badge/Desktop-Windows%20%7C%20macOS%20%7C%20Linux-6366f1?style=for-the-badge" alt="desktop platforms" />
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT License" /></a>
    <a href="https://github.com/alicomert/pixcode/discussions"><img src="https://img.shields.io/badge/Discussions-open-9ca3af?style=for-the-badge" alt="Discussions" /></a>
  </p>
  <p>
    <a href="https://buymeacoffee.com/alicomert" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-support%20Pixcode-ffdd00?style=for-the-badge&logo=buymeacoffee&logoColor=000000" alt="Buy me a coffee" /></a>
  </p>
  <p>
    <a href="https://www.producthunt.com/products/pixcode?embed=true&amp;utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=badge-pixcode" target="_blank" rel="noopener noreferrer"><img alt="Pixcode - A self-hosted control room for AI coding agents. | Product Hunt" width="250" height="54" src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1144104&amp;theme=light&amp;t=1778502023682"></a>
  </p>
  <p>
    <a href="https://alicomert.github.io/pixcode/landing.html">Website</a> ·
    <a href="https://github.com/alicomert/pixcode/releases/latest">Releases</a> ·
    <a href="public/docs.html">Docs</a> ·
    <a href="public/api-docs.html">API docs</a> ·
    <a href="CONTRIBUTING.md">Contributing</a>
  </p>
  <p>
    <a href="README.md" aria-current="page">English</a> ·
    <a href="README.tr.md">Türkçe</a> ·
    <a href="README.de.md">Deutsch</a> ·
    <a href="README.ru.md">Русский</a> ·
    <a href="README.ja.md">日本語</a> ·
    <a href="README.ko.md">한국어</a> ·
    <a href="README.zh-CN.md">简体中文</a> ·
    <a href="README.es-ES.md">Español</a>
  </p>
</div>

## What Pixcode Does

> **Current API note (1.64.x):** The former `/api/orchestration/*` workflow
> UI/API was retired in v1.55. Use NanoClaw (`/api/nanoclaw/*` or its
> `/api/tasks/*` alias) for multi-CLI tasks and schedules, or the maintained
> production agent loop at `/api/production-agent-loop/*`. The historical
> orchestration sections below are kept as migration context.

Pixcode is a local web and desktop workspace for AI coding agents. It wraps the
CLIs developers already use, then adds the missing control layer around them:
project selection, chat history, file navigation, shell access, Git/local change
tracking, agent automation, notifications, Telegram control, and API automation.

Use it when one terminal is not enough:

- You want Claude Code, Cursor CLI, Codex, Gemini CLI, Qwen Code, and OpenCode
  available from the same project screen.
- You want agent output, edited files, shell commands, Git status, and task
  planning visible without switching tools.
- You want a server or desktop app that keeps work running while you connect
  from another computer, tablet, phone, or Telegram.
- You want a real API surface so other tools can create sessions, run agents,
  inspect projects, and automate workflows with `px_` API keys.

Pixcode is not a hosted cloud IDE. Your source code, CLI sessions, credentials,
project paths, MCP configuration, local database, and automation keys stay on the
machine where Pixcode runs unless you intentionally expose or connect them.

## Screenshots

| Workspace control room | Mobile workspace |
| --- | --- |
| <img src="public/screenshots/desktop-main.png" alt="Pixcode desktop workspace with chat, project controls, and side panels" width="480" /> | <img src="public/screenshots/mobile-chat.png" alt="Pixcode mobile workspace landing" width="260" /> |

## Core Features

### Multi-CLI agent workspace

Pixcode gives every supported coding CLI a shared workspace without hiding the
provider-native behavior. You can connect the providers you already use and move
between them from the same project.

- Claude Code
- Cursor CLI
- OpenAI Codex
- Gemini CLI
- Qwen Code
- OpenCode

Provider panels cover auth state, install checks, CLI versions, model choices,
MCP support, and session history. When an agent is thinking, running tools,
waiting for approval, or writing output, the UI keeps visible processing state
instead of leaving the screen feeling frozen.

### Chat built for development work

Pixcode chat is project-aware and designed for long-running coding sessions.

- Fixed bottom composer on chat/project screens.
- Session history per provider and project.
- Default, plan, and run-style modes where supported.
- Slash-command friendly input.
- Tool output rendering for plans, file operations, command output, and provider
  status events.
- Telegram and browser/desktop notifications when work finishes, fails, or needs
  attention.

### Files, shell, and source control

The side panels are built around the way coding agents change projects.

- Files panel with detailed and compact views.
- File open/edit flows that preserve the main chat or task surface.
- Shell panel with split/full behavior on desktop and mobile-safe behavior on
  smaller screens.
- Source Control panel for Git status, diffs, branches, commits, and changed
  files when a project is a Git repository.
- Local change tracking for projects that are not Git repositories.

### Command Center for changed files

Command Center watches what changes while agents work. It can track Git changes
or local filesystem changes, show the changed file list next to the active chat,
highlight changed items, and open the edited file at the relevant location.

This is meant to answer the practical question: "What did the agent just touch?"

### Agent automation (NanoClaw + production agent loop)

Pixcode's maintained automation surfaces are deliberately split by job:

- **NanoClaw** handles multi-CLI conversations, one-shot runs, and durable
  `once`/`interval`/`cron` schedules while preserving project context.
- **Production agent loop** handles administrator workflows such as issue-to-PR
  planning, CI repair plans, review queues, checkpoints, and scheduler jobs.

The former `/api/orchestration/*` workflow UI and route family was retired in
v1.55. Existing orchestration documents are migration history only; new clients
should use the maintained APIs below.

NanoClaw routes Claude Code, Codex, Cursor, Gemini, Qwen, OpenCode, and Grok and
exposes authenticated task state, bounded logs, events, and artifacts.

Maintained routes are:

- `/api/nanoclaw/*` (or the `/api/tasks/*` alias) for chat, runs, `once`/`interval`/`cron` tasks, providers, and events.
- `/api/production-agent-loop/*` for issue-to-PR plans, CI repair, review queues, snapshots, and scheduler jobs.

See [NANOCLAW_API.md](docs/NANOCLAW_API.md) and the [production agent loop guide](docs/production-agent-loop.md) for current contracts.

### API-first automation

Pixcode's frontend uses the same backend control plane exposed to external
automation. Generate a `px_` API key and call the REST/WebSocket APIs from your
own tools, scripts, CI, dashboards, or Telegram bridge.

List projects:

```bash
curl http://localhost:3001/api/projects \
  -H "Authorization: Bearer px_your_key_here"
```

Run an agent now (without creating a schedule):

```bash
curl -X POST http://localhost:3001/api/nanoclaw/run \
  -H "Authorization: Bearer px_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "agentType": "codex",
    "projectId": "my-app",
    "prompt": "Review the current diff and list risky changes."
  }'
```

Start a multi-CLI conversation:

```bash
curl -X POST http://localhost:3001/api/nanoclaw/bot/chat \
  -H "Authorization: Bearer px_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Where is authentication configured?",
    "projectId": "my-app",
    "agentType": "claude-code"
  }'
```

Legacy `ck_` keys remain accepted for older installations, but `px_` is the
current prefix.

Interactive API reference: [`public/api-docs.html`](public/api-docs.html). On a
running Pixcode instance, use `GET /api/public/manifest` for discovery and
`GET /api/public/openapi` for the machine-readable current API fragment. These
catalog endpoints use the current Pixcode session; automation calls still
require a scoped `px_` API key. The bundled
[`public/openapi.yaml`](public/openapi.yaml) remains a release snapshot.

### Telegram, notifications, and remote control

Pixcode can pair a Telegram chat with your account so completed tasks, failed
runs, and action-required states can reach you outside the browser. The goal is
not just a final notification: the Telegram bridge is a control surface for
remote prompts, provider/session selection, and long-running work.

Notification surfaces include:

- in-app alerts,
- browser/desktop notifications where the platform allows them,
- Telegram task notifications,
- update notices and release notes.

### Theme system

Pixcode has a real appearance system instead of one fixed blue/navy palette.

- Dark and light modes.
- Ready-made accent palettes, including emerald and VS Code-like options.
- Custom accent colors for dark and light themes.
- Token-based styling for focus rings, active controls, buttons, navigation, and
  panels.

### MCP and plugins

Pixcode includes extension points for local workflows:

- MCP server management for supported providers.
- Provider-specific auth, MCP, and sessions panels.
- Plugin loading with optional frontend tabs and backend services.
- Local settings for API keys, base URLs, model catalogs, and provider install
  state.

## Installation

### Requirements

- Node.js 22 or newer.
- The provider CLIs you want to use, installed and authenticated separately when
  required.

### Run with npx

```bash
npx @pixelbyte-software/pixcode
```

Open:

```text
http://localhost:3001
```

### Install globally

```bash
npm install -g @pixelbyte-software/pixcode
pixcode
```

### Desktop installers

Download desktop builds from GitHub Releases:

- Windows: `.exe`
- macOS: `.dmg`
- Linux: AppImage or package asset, depending on the release

Releases: <https://github.com/alicomert/pixcode/releases/latest>

#### macOS Gatekeeper: "Pixcode is damaged"

Current macOS builds may be unsigned or not notarized. That warning alone does
not prove that a download is safe. Before changing Gatekeeper:

1. Download the DMG only from the official [GitHub Releases](https://github.com/alicomert/pixcode/releases/latest) page.
2. Verify the release SHA-256/checksum when one is published and confirm it matches your file. Do not run a DMG whose origin or integrity you cannot verify.
3. Open the DMG and drag `Pixcode.app` into `/Applications`. In Finder, right-click the app and choose **Open**; macOS may allow an unsigned app after this explicit confirmation.
4. Only if the verified app is still blocked, run `Fix Gatekeeper.command` from the mounted official DMG. It changes security attributes and opens the app; never run it on a third-party copy.

Manual fallback (only after verifying the DMG):

```bash
xattr -d com.apple.quarantine "/Applications/Pixcode.app" 2>/dev/null || true
open "/Applications/Pixcode.app"
```

### Linux daemon

For a server or VDS setup:

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

- Installed backend and bundled frontend: `SERVER_PORT`, default `3001`.
- Vite-only frontend development: `VITE_PORT`, default `5173`.

For normal installed usage, think in terms of one port: `3001`. Port `5173` is
only for separate Vite frontend development.

## First Run

1. Open Pixcode and create or sign in to the local user account.
2. Add the project folders you want to manage.
3. Connect the CLI providers you actually use.
4. Open Settings and check provider install/auth/model status.
5. Use NanoClaw for background runs and schedules, or the production agent loop
   for administrator review and CI automation.
6. Generate a `px_` API key for external automation.
7. Pair Telegram if you want remote prompts and completion notifications.
8. Pick your theme palette under Appearance.

## Development

```bash
npm install
npm run typecheck
npm run lint
npm run build
```

Important development notes:

- `npm run dev` uses the daemon manager on Linux.
- For a foreground development loop, run `npm run client` and `npm run server`
  separately, or run `pixcode --no-daemon`.
- `npm run server` runs built output from `dist-server/`; rebuild after backend
  changes.
- There is no unit test suite configured today. Use smoke scripts, typecheck,
  lint, build, and manual provider/API checks.

## Repository Map

- `src/` - React + Vite frontend.
- `server/` - Express, WebSocket, CLI adapters, routes, auth, daemon,
  notifications.
- `server/modules/nanoclaw/` - NanoClaw bridge for chat, tasks, and multi-CLI agents.
- `server/routes/production-agent-loop.js` - maintained production automation, CI, and review API.
- `server/modules/providers/` - provider auth, MCP, sessions, model and install
  endpoints.
- `shared/` - contracts shared by frontend and backend.
- `public/api-docs.html` - interactive API reference shipped with the app.
- `GET /api/public/manifest` and `GET /api/public/openapi` - authenticated,
  canonical discovery and machine-readable API documents on a running instance.
- `public/openapi.yaml` - bundled release snapshot of the core REST API.
- `public/screenshots/` - README and product screenshots.
- `public/llms.txt` and `public/llms-full.txt` - AI-discovery summaries.

## Open Source Readiness

Pixcode is prepared for public contribution with the basics contributors expect:

- Clear README with purpose, install commands, screenshots, API examples, and
  architecture map.
- MIT-licensed — see [`LICENSE`](LICENSE). Free for commercial and personal use.
- Contribution guide in [`CONTRIBUTING.md`](CONTRIBUTING.md).
- Code of conduct in [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
- Security policy in [`SECURITY.md`](SECURITY.md).
- GitHub issue templates for bug reports, feature requests, and good first
  issues.
- Releases and version tags published through GitHub Releases.
- Static website and documentation under [`public/`](public).

Good starter work should be labeled `good first issue` on GitHub. The repository
also includes a good-first-issue template so small, scoped tasks can be filed
without losing context.

### Contributors

Many thanks to [@webbrain-one](https://github.com/webbrain-one) for the Spanish
README contribution in [PR #116](https://github.com/alicomert/pixcode/pull/116).
The translation is shipped as `README.es-ES.md` and is kept in sync with the
current API and interface.

## Security Model

- Pixcode is self-hosted. Treat it like a local control plane for your machine.
- Use strong local account credentials when exposing it on a network.
- Put public-server deployments behind a trusted reverse proxy, VPN, or firewall.
- API keys are intended for automation. Rotate them if they are exposed.
- Provider secrets are masked in APIs and UI responses where possible.
- Do not publish logs that contain provider tokens, session output, or private
  project paths.

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a pull request. Keep
changes scoped, run the verification commands above, and include screenshots or
short recordings for UI work when possible.

For community behavior expectations, read
[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). For private vulnerability reports,
read [`SECURITY.md`](SECURITY.md).

## Cloud (Coming Soon)

Pixcode Cloud will offer a fully managed SaaS experience — no server setup,
no Docker, no daemon configuration. Connect your GitHub repos, pick an AI
coding agent, and let it work in an isolated container that we manage for you.

- **BYOK** (Bring Your Own Key) or use our managed API pool
- Isolated Docker containers per project
- Team collaboration and shared workspaces
- Cost analytics and token usage dashboards
- Workflow marketplace with pre-built agent-task templates

Join the discussion or request early access in
[GitHub Discussions](https://github.com/alicomert/pixcode/discussions).

## Links

- Website: <https://alicomert.github.io/pixcode/landing.html>
- npm: <https://www.npmjs.com/package/@pixelbyte-software/pixcode>
- GitHub: <https://github.com/alicomert/pixcode>
- Releases: <https://github.com/alicomert/pixcode/releases/latest>
- API docs: [`public/api-docs.html`](public/api-docs.html), or `GET /api/public/openapi` on a running instance
- Static docs: [`public/docs.html`](public/docs.html), [`public/features.html`](public/features.html), [`public/orchestration.html` (migration context)](public/orchestration.html), [`public/api-automation.html`](public/api-automation.html)
- AI discovery: [`public/llms.txt`](public/llms.txt), [`public/llms-full.txt`](public/llms-full.txt)

Pixcode is an independent open-source project and is not affiliated with OpenAI,
Anthropic, Google, Cursor, Alibaba/Qwen, or OpenCode.
