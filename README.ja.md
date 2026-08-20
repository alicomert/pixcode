<div align="center">
  <img src="public/logo.png" alt="Pixcode logo" width="96" height="96" />
  <h1>Pixcode</h1>
  <p><strong>AI coding agent のための self-hosted control room。</strong></p>
  <p>
    Claude Code、Cursor CLI、Codex、Gemini CLI、Qwen Code、OpenCode を 1 つの Web UI で操作します。Chat、Shell、Files、Git、agent automation、API keys、Plugins、Notifications、Telegram、Desktop/Server deployment をまとめて扱えます。
  </p>
  <p>
    <a href="https://buymeacoffee.com/alicomert" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-support%20Pixcode-ffdd00?style=for-the-badge&logo=buymeacoffee&logoColor=000000" alt="Buy me a coffee" /></a>
  </p>
  <p>
    <a href="README.md">English</a> ·
    <a href="README.tr.md">Türkçe</a> ·
    <a href="README.de.md">Deutsch</a> ·
    <a href="README.ru.md">Русский</a> ·
    <a href="README.ja.md" aria-current="page">日本語</a> ·
    <a href="README.ko.md">한국어</a> ·
    <a href="README.zh-CN.md">简体中文</a> ·
    <a href="README.es-ES.md">Español</a>
  </p>
</div>

## Pixcode とは

Pixcode は、ローカル PC、ワークステーション、Linux サーバーをブラウザベースの AI development cockpit にします。複数の terminal、CLI log、file explorer、Git tool、provider settings を行き来せず、coding-agent workflow を 1 つの local web app に集約します。

主な利用形態:

- **Local workstation**: 既存の CLI をそのまま使い、より見やすい UI で操作。
- **Always-on server**: Linux daemon として起動し、laptop、tablet、phone から接続。
- **Desktop app**: GitHub Releases の Windows `.exe`、macOS `.dmg`、Linux build を利用。

Pixcode は hosted cloud IDE ではありません。Projects、credentials、CLI sessions、local files、Git state、MCP config は自分の machine 側に残ります。

## Screenshots

| Workspace | Mobile workspace |
| --- | --- |
| <img src="public/screenshots/desktop-main.png" alt="Pixcode desktop workspace" width="480" /> | <img src="public/screenshots/mobile-chat.png" alt="Pixcode モバイルワークスペース" width="260" /> |

## Features

### Multiple CLI providers

- Claude Code、Cursor CLI、Codex、Gemini CLI、Qwen Code、OpenCode。
- Provider auth、API key credentials、provider 固有の OAuth callback/paste flow、install status、model catalog、CLI version status を Settings で管理。GitHub 接続は OAuth を使います。
- Native CLI を置き換えるのではなく、session management、WebSocket streaming、notifications、file context、project controls を追加します。
- CLI が thinking、tool execution、approval waiting、output streaming のどれなのか UI で分かります。

### Chat, files, shell, source control

- Project-aware chat sessions。
- Prompt composer は chat/project screen の下部に固定。
- Shell panel は desktop で split または full に切り替え可能。
- File browser は edit、upload、rename、delete、detailed view をサポート。
- Source Control は Git status、diff、branch、commit、changed files を表示。
- Split panels には icon controls、close button、mobile-friendly responsive layout があります。

### Command Center for changed files

Pixcode は local working tree の変更も追跡します。Quick Settings の Command Center は changed files を即座に表示し、新しい変更を highlight して、該当 file/line に移動できます。AI agent が何を変更したかを main workspace を閉じずに確認できます。

### Agent automation (NanoClaw + production agent loop)

Pixcode の保守対象となる自動化 API は目的ごとに分かれています。

- **NanoClaw** は multi-CLI conversation、one-shot run、`once`/`interval`/`cron`
  schedule を project context 付きで処理します。
- **Production agent loop** は issue-to-PR、CI repair、review queue、checkpoint、
  scheduler などの管理ワークフローを処理します。

旧 `/api/orchestration/*` workflow UI/route は v1.55 で廃止されました。
残っている orchestration の説明は migration history であり、新しい client は
以下の保守対象 API を利用してください。

### API, Telegram, notifications

> **Current API note (1.64.x):** 旧 `/api/orchestration/*` workflow API は v1.55 で廃止されました。Multi-CLI の chat、実行、schedule には NanoClaw（`/api/nanoclaw/*` または `/api/tasks/*` alias）、保守対象の production agent loop には `/api/production-agent-loop/*` を使用してください。古い orchestration の記述は移行用コンテキストとして残しています。

Pixcode frontend は REST/WebSocket API を使っています。External automation も API keys で同じ control plane を使えます。新しい keys は `px_` で始まり、古い `ck_` keys も互換性のため受け付けます。

```bash
curl http://localhost:3001/api/projects \
  -H "Authorization: Bearer px_your_key_here"
```

- `POST /api/nanoclaw/run` で one-shot の multi-CLI agent run を実行できます。
- `/api/nanoclaw/*`（または `/api/tasks/*`）で chat、agent run、schedule、events、`/api/production-agent-loop/*` で issue-to-PR、CI repair、review queue、snapshot を利用できます。
- Browser push notifications。
- Telegram pairing, task notifications, optional prompt bridge。

対話型 API リファレンス: [`public/api-docs.html`](public/api-docs.html)。稼働中の Pixcode では `GET /api/public/manifest` が discovery、`GET /api/public/openapi` が最新の machine-readable API fragment です。[`public/openapi.yaml`](public/openapi.yaml) は同梱の release snapshot です。

### Themes, plugins, MCP

- Dark/light mode。
- Emerald、VS Code-like などの accent palettes。
- Custom light/dark accent colors。
- Token-based styling for buttons, focus rings, navigation, active states。
- MCP server management。
- Plugin system with frontend tabs and optional backend services。

## Installation

Node.js 22+ が必要です。

```bash
npx @pixelbyte-software/pixcode
```

Global install:

```bash
npm install -g @pixelbyte-software/pixcode
pixcode
```

Open:

```text
http://localhost:3001
```

Desktop installers are available in GitHub Releases: Windows `.exe`, macOS `.dmg`, Linux AppImage/packages.

## Linux daemon

```bash
pixcode daemon install --mode auto --port 3001
pixcode daemon status --mode auto
pixcode daemon logs --mode auto
pixcode daemon restart --mode auto
```

Foreground:

```bash
pixcode --no-daemon
```

## Development

```bash
npm install
npm run typecheck
npm run lint
npm run build
```

Notes:

- `npm run dev` uses the daemon manager on Linux.
- Use `npm run client` only for Vite frontend development.
- Normal runtime uses port `3001`; `5173` is for separate Vite dev.

## Links

- npm: <https://www.npmjs.com/package/@pixelbyte-software/pixcode>
- GitHub: <https://github.com/alicomert/pixcode>
- Releases: <https://github.com/alicomert/pixcode/releases/latest>
