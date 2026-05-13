<div align="center">
  <img src="public/logo.png" alt="Pixcode logo" width="96" height="96" />
  <h1>Pixcode</h1>
  <p><strong>AI coding agent를 위한 self-hosted control room.</strong></p>
  <p>
    Claude Code, Cursor CLI, Codex, Gemini CLI, Qwen Code, OpenCode를 하나의 Web UI에서 사용합니다. Chat, shell, files, Git, orchestration, API keys, plugins, notifications, Telegram, desktop/server 배포를 함께 제공합니다.
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
    <a href="README.zh-CN.md">简体中文</a>
  </p>
</div>

## Pixcode란?

Pixcode는 로컬 PC, 워크스테이션, Linux 서버를 브라우저 기반 AI development cockpit으로 바꿉니다. 여러 terminal, CLI logs, file explorer, Git UI, provider settings를 오가지 않고 coding-agent workflow를 하나의 local web app에서 관리합니다.

사용 방식:

- **Local workstation**: 기존 CLI를 그대로 사용하면서 더 편한 UI를 사용합니다.
- **Always-on server**: Linux daemon으로 실행하고 laptop, tablet, phone에서 접속합니다.
- **Desktop app**: GitHub Releases의 Windows `.exe`, macOS `.dmg`, Linux build를 사용합니다.

Pixcode는 hosted cloud IDE가 아닙니다. Projects, credentials, CLI sessions, local files, Git state, MCP config는 사용자의 machine에 남습니다.

## Screenshots

| Workspace | Mobile chat |
| --- | --- |
| <img src="public/screenshots/desktop-main.png" alt="Pixcode desktop workspace" width="480" /> | <img src="public/screenshots/mobile-chat.png" alt="Pixcode mobile chat" width="260" /> |

| CLI selection | Tools and MCP |
| --- | --- |
| <img src="public/screenshots/cli-selection.png" alt="Pixcode CLI selection" width="420" /> | <img src="public/screenshots/tools-modal.png" alt="Pixcode tools modal" width="420" /> |

## 주요 기능

### 여러 CLI를 하나의 UI에서

- Claude Code, Cursor CLI, Codex, Gemini CLI, Qwen Code, OpenCode.
- Provider auth, API key credentials, OAuth paste, install status, model list, CLI version status를 Settings에서 관리합니다.
- Native CLI를 대체하지 않고 session management, WebSocket streaming, notifications, file context, project controls를 추가합니다.
- CLI가 thinking, tool execution, approval waiting, output streaming 중인지 UI에서 확인할 수 있습니다.

### Chat, files, shell, source control

- Project-aware chat sessions와 history.
- Prompt composer는 chat/project screen 하단에 고정됩니다.
- Shell panel은 desktop에서 split 또는 full panel로 열 수 있습니다.
- File browser는 edit, upload, rename, delete, detailed view를 지원합니다.
- Source Control은 Git status, diff, branch, commit, changed files를 보여줍니다.
- Split panels에는 icon controls, close button, mobile-friendly responsive behavior가 있습니다.

### Changed files Command Center

Pixcode는 local working tree 변경도 추적합니다. Quick Settings의 Command Center는 changed files를 즉시 표시하고, 새 변경을 highlight하며, 관련 file/line으로 이동할 수 있습니다. AI agent가 어떤 파일을 바꿨는지 chat/orchestration view를 닫지 않고 확인할 수 있습니다.

### Multi-agent orchestration

Orchestration은 하나의 goal에 여러 CLI agents를 함께 사용할 수 있게 합니다.

- **Agent Team**: frontend, backend, review, docs, custom role로 task 분배.
- **Multi-model Review**: 여러 provider/model로 같은 변경 검토.
- **Sequential Handoff**: 단계별 handoff.
- **Decision Debate**: 구현 전 approach 비교.

Controls:

- run마다 agents enable/disable,
- 같은 provider를 여러 worker로 사용,
- agent별 role, stage, label, instruction 설정,
- agent별 model 선택, OpenCode model 포함,
- failed step을 위한 fallback CLI agent 선택,
- workflow DAG preview,
- event streaming과 cancel,
- resizable orchestration panes.

### API, Telegram, notifications

Pixcode frontend는 REST/WebSocket API를 사용합니다. External automation도 Pixcode API key로 같은 control plane을 사용할 수 있습니다. 새 API keys는 `px_`로 시작하며, 이전 `ck_` keys도 호환됩니다.

```bash
curl http://localhost:3001/api/projects \
  -H "Authorization: Bearer px_your_key_here"
```

- `POST /api/agent` for one-shot agent runs.
- `/api/orchestration/workflows/*` for preview, start, stream, cancel.
- Browser push notifications.
- Telegram pairing, task notifications, optional prompt bridge.

OpenAPI: [`public/openapi.yaml`](public/openapi.yaml)

### Themes, plugins, MCP

- Dark/light mode.
- Emerald, VS Code-like accent palettes.
- Custom light/dark accent colors.
- Token-based styling for buttons, focus rings, navigation, active states.
- MCP server management.
- Plugin system with frontend tabs and optional backend services.

## Installation

Node.js 22+가 필요합니다.

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
