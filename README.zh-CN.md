<div align="center">
  <img src="public/logo.png" alt="Pixcode logo" width="96" height="96" />
  <h1>Pixcode</h1>
  <p><strong>面向 AI coding agent 的 self-hosted control room。</strong></p>
  <p>
    在一个 Web UI 中使用 Claude Code、Cursor CLI、Codex、Gemini CLI、Qwen Code 和 OpenCode，并集成 chat、shell、files、Git、agent automation、API keys、plugins、notifications、Telegram、desktop/server deployment。
  </p>
  <p>
    <a href="https://buymeacoffee.com/alicomert" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-support%20Pixcode-ffdd00?style=for-the-badge&logo=buymeacoffee&logoColor=000000" alt="Buy me a coffee" /></a>
  </p>
  <p>
    <a href="README.md">English</a> ·
    <a href="README.tr.md">Türkçe</a> ·
    <a href="README.de.md">Deutsch</a> ·
    <a href="README.ru.md">Русский</a> ·
    <a href="README.ja.md">日本語</a> ·
    <a href="README.ko.md">한국어</a> ·
    <a href="README.zh-CN.md" aria-current="page">简体中文</a> ·
    <a href="README.es-ES.md">Español</a>
  </p>
</div>

## Pixcode 是什么？

Pixcode 可以把你的本机、工作站或 Linux 服务器变成浏览器里的 AI development cockpit。你不需要在多个 terminal、CLI logs、file explorer、Git UI、provider settings 之间切换，Pixcode 把 coding-agent workflow 放在一个本地 Web App 里。

常见使用方式：

- **Local workstation**：在自己的电脑上运行 Pixcode，用更好的 UI 操作已有 CLI。
- **Always-on server**：在 Linux/VDS 上以 daemon 方式运行，从 laptop、tablet、phone 访问。
- **Desktop app**：使用 GitHub Releases 中的 Windows `.exe`、macOS `.dmg`、Linux build。

Pixcode 不是 hosted cloud IDE。Projects、credentials、CLI sessions、local files、Git state、MCP config 默认都保留在你的机器上。

## Screenshots

| Workspace | Mobile workspace |
| --- | --- |
| <img src="public/screenshots/desktop-main.png" alt="Pixcode desktop workspace" width="480" /> | <img src="public/screenshots/mobile-chat.png" alt="Pixcode 移动工作区" width="260" /> |

## 功能亮点

### 多个 CLI，一个界面

- Claude Code、Cursor CLI、Codex、Gemini CLI、Qwen Code、OpenCode。
- Settings 中管理 provider auth、API key credentials、provider 专属 OAuth callback/paste flow、install status、model list、CLI version status。GitHub 通过 OAuth 连接。
- Pixcode 不替代 native CLI，而是在其上增加 session management、WebSocket streaming、notifications、file context、project controls。
- UI 会显示 CLI 是在 thinking、tool execution、approval waiting 还是 output streaming。

### Chat、files、shell、source control

- Project-aware chat sessions 和 history。
- Prompt composer 固定在 chat/project screen 底部。
- Shell panel 在 desktop 上可作为 split panel 或 full panel 打开。
- File browser 支持 edit、upload、rename、delete、detailed view。
- Source Control 支持 Git status、diff、branch、commit、changed files。
- Split panels 提供 icon controls、close button、mobile-friendly responsive behavior。

### Changed files Command Center

Pixcode 会跟踪 local working tree 的变化。Quick Settings 中的 Command Center 可以即时显示 changed files，高亮新的改动，并跳转到相关 file/line。这样 AI agent 修改文件时，你可以看到它改了什么，同时保持主工作区不被关闭。

### Agent automation（NanoClaw + production agent loop）

Pixcode 的维护中自动化 API 按用途分开：

- **NanoClaw** 保留项目上下文，处理多 CLI 对话、一次性运行以及
  `once`/`interval`/`cron` 持久计划。
- **Production agent loop** 处理 issue-to-PR、CI repair、review queue、checkpoint
  和 scheduler 等管理员流程。

旧的 `/api/orchestration/*` workflow UI 和路由系列已在 v1.55 移除。剩余的
 orchestration 说明仅用于迁移历史；新客户端应使用下面的维护中 API。

### API、Telegram、notifications

> **当前 API 说明（1.64.x）：** 旧的 `/api/orchestration/*` workflow API 已在 v1.55 移除。多 CLI 对话、执行和计划任务请使用 NanoClaw（`/api/nanoclaw/*` 或 `/api/tasks/*` alias）；维护中的 production agent loop 使用 `/api/production-agent-loop/*`。旧 orchestration 内容仅作为迁移上下文保留。

Pixcode frontend 本身使用 REST/WebSocket API。External automation 也可以用 Pixcode API key 使用同一个 control plane。新的 API keys 以 `px_` 开头，旧的 `ck_` keys 仍然兼容。

```bash
curl http://localhost:3001/api/projects \
  -H "Authorization: Bearer px_your_key_here"
```

- `POST /api/nanoclaw/run` 用于一次性的 multi-CLI agent run。
- `/api/nanoclaw/*`（或 `/api/tasks/*`）用于 chat、agent run、schedule、events；`/api/production-agent-loop/*` 用于 issue-to-PR、CI repair、review queue、snapshot。
- Browser push notifications.
- Telegram pairing、task notifications、optional prompt bridge。

交互式 API 参考：[`public/api-docs.html`](public/api-docs.html)。在运行中的 Pixcode 实例上，`GET /api/public/manifest` 是 discovery 文档，`GET /api/public/openapi` 提供当前 machine-readable API fragment；[`public/openapi.yaml`](public/openapi.yaml) 是随包附带的 release snapshot。

### Themes、plugins、MCP

- Dark/light mode。
- Emerald、VS Code-like accent palettes。
- Custom light/dark accent colors。
- Token-based styling for buttons、focus rings、navigation、active states。
- MCP server management。
- Plugin system with frontend tabs and optional backend services。

## Installation

需要 Node.js 22+。

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
