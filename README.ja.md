<div align="center">
  <img src="public/logo.png" alt="Pixcode logo" width="96" height="96" />
  <h1>Pixcode</h1>
  <p><strong>AI coding agent のための self-hosted control room。</strong></p>
  <p>
    Claude Code、Cursor CLI、Codex、Gemini CLI、Qwen Code、OpenCode を 1 つの Web UI で操作します。Chat、Shell、Files、Git、Orchestration、API keys、Plugins、Notifications、Telegram、Desktop/Server deployment をまとめて扱えます。
  </p>
  <p>
    <a href="README.md">English</a> ·
    <a href="README.tr.md">Türkçe</a> ·
    <a href="README.de.md">Deutsch</a> ·
    <a href="README.ru.md">Русский</a> ·
    <a href="README.ko.md">한국어</a> ·
    <a href="README.zh-CN.md">简体中文</a>
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

| Workspace | Mobile chat |
| --- | --- |
| <img src="public/screenshots/desktop-main.png" alt="Pixcode desktop workspace" width="480" /> | <img src="public/screenshots/mobile-chat.png" alt="Pixcode mobile chat" width="260" /> |

| CLI selection | Tools and MCP |
| --- | --- |
| <img src="public/screenshots/cli-selection.png" alt="Pixcode CLI selection" width="420" /> | <img src="public/screenshots/tools-modal.png" alt="Pixcode tools modal" width="420" /> |

## Features

### Multiple CLI providers

- Claude Code、Cursor CLI、Codex、Gemini CLI、Qwen Code、OpenCode。
- Provider auth、API key credentials、OAuth paste、install status、model catalog、CLI version status を Settings で管理。
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

Pixcode は local working tree の変更も追跡します。Quick Settings の Command Center は changed files を即座に表示し、新しい変更を highlight して、該当 file/line に移動できます。AI agent が何を変更したかを chat/orchestration view を閉じずに確認できます。

### Multi-agent orchestration

Orchestration は 1 つの goal に対して複数の CLI agents を coordinating します。

- **Agent Team**: frontend、backend、review、docs、custom roles に分割。
- **Multi-model Review**: 複数 provider/model で同じ変更を review。
- **Sequential Handoff**: step-by-step に作業を受け渡し。
- **Decision Debate**: 実装前に approach を比較。

Controls:

- agents を run ごとに enable/disable、
- 同じ provider を複数 worker として使う、
- agent ごとに role、stage、label、instruction を設定、
- agent ごとに model を選択、OpenCode model も対象、
- failed step の fallback CLI agent を選択、
- workflow DAG preview、
- event streaming と cancel、
- resizable orchestration panes。

### API, Telegram, notifications

Pixcode frontend は REST/WebSocket API を使っています。External automation も API keys で同じ control plane を使えます。新しい keys は `px_` で始まり、古い `ck_` keys も互換性のため受け付けます。

```bash
curl http://localhost:3001/api/projects \
  -H "Authorization: Bearer px_your_key_here"
```

- `POST /api/agent` for one-shot agent runs。
- `/api/orchestration/workflows/*` for preview, start, stream, cancel。
- Browser push notifications。
- Telegram pairing, task notifications, optional prompt bridge。

OpenAPI: [`public/openapi.yaml`](public/openapi.yaml)

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
