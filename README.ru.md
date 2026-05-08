<div align="center">
  <img src="public/logo.png" alt="Pixcode logo" width="96" height="96" />
  <h1>Pixcode</h1>
  <p><strong>Self-hosted панель управления для AI coding agents.</strong></p>
  <p>
    Один веб-интерфейс для Claude Code, Cursor CLI, Codex, Gemini CLI, Qwen Code и OpenCode: чат, shell, файлы, Git, оркестрация, API keys, плагины, уведомления, Telegram и desktop/server режимы.
  </p>
  <p>
    <a href="README.md">English</a> ·
    <a href="README.tr.md">Türkçe</a> ·
    <a href="README.de.md">Deutsch</a> ·
    <a href="README.ja.md">日本語</a> ·
    <a href="README.ko.md">한국어</a> ·
    <a href="README.zh-CN.md">简体中文</a>
  </p>
</div>

## Что такое Pixcode?

Pixcode превращает ваш компьютер, рабочую станцию или Linux-сервер в браузерный cockpit для AI coding agents. Вместо отдельных терминалов, CLI логов, файлового менеджера, Git UI и настроек провайдеров вы получаете одну локальную веб-панель.

Pixcode подходит для:

- **Локальной разработки**: запуск на своем компьютере и удобный UI поверх привычных CLI.
- **Постоянного сервера/VDS**: daemon-режим на Linux и доступ с ноутбука, телефона или планшета.
- **Desktop-приложения**: установщики Windows `.exe`, macOS `.dmg` и Linux-билды из GitHub Releases.

Это не hosted cloud IDE. Проекты, credentials, CLI sessions, локальные файлы, Git status и MCP config остаются на вашей машине, если вы сами не подключаете внешние сервисы.

## Скриншоты

| Workspace | Mobile chat |
| --- | --- |
| <img src="public/screenshots/desktop-main.png" alt="Pixcode desktop workspace" width="480" /> | <img src="public/screenshots/mobile-chat.png" alt="Pixcode mobile chat" width="260" /> |

| CLI selection | Tools and MCP |
| --- | --- |
| <img src="public/screenshots/cli-selection.png" alt="Pixcode CLI selection" width="420" /> | <img src="public/screenshots/tools-modal.png" alt="Pixcode tools modal" width="420" /> |

## Основные возможности

### Несколько CLI в одном интерфейсе

- Claude Code, Cursor CLI, Codex, Gemini CLI, Qwen Code и OpenCode.
- Auth, API key credentials, OAuth paste, install status, model catalogs и CLI version status в Settings.
- Pixcode не заменяет native CLI, а добавляет session management, WebSocket streaming, project context, notifications и UI controls.
- Видно, когда CLI думает, запускает tools, ждет approval или пишет ответ.

### Chat, files, shell и source control

- Project-aware chat sessions и история.
- Prompt composer закреплен снизу на chat/project экранах.
- Shell открывается как split panel или full panel на desktop.
- File browser: edit, upload, rename, delete, detailed view.
- Source Control: status, diff, branch, commit и changed files.
- Split panels имеют icon controls, close button и responsive mobile behavior.

### Command Center для изменений

Pixcode отслеживает локальный working tree. Command Center в Quick Settings показывает измененные файлы сразу, подсвечивает новые изменения и открывает нужный файл/строку. Это помогает видеть, что именно изменил агент, не закрывая chat или orchestration view.

### Multi-agent orchestration

Оркестрация запускает несколько CLI agents для одной цели.

- **Agent Team**: роли frontend, backend, review, docs или кастомные роли.
- **Multi-model Review**: проверка результата разными providers/models.
- **Sequential Handoff**: последовательная передача работы между этапами.
- **Decision Debate**: сравнение подходов до реализации.

Доступно:

- включение/выключение agents на run,
- несколько workers одного provider,
- role, stage, label и instruction для каждого agent,
- model selection per agent, включая OpenCode,
- fallback CLI agent для ошибок,
- preview workflow DAG,
- streaming events и cancel active run,
- resizable orchestration panes.

### API, Telegram и notifications

Frontend Pixcode использует REST/WebSocket, и external automation может использовать тот же control plane. Новые API keys начинаются с `px_`; старые `ck_` keys остаются совместимыми.

```bash
curl http://localhost:3001/api/projects \
  -H "Authorization: Bearer px_your_key_here"
```

Можно использовать:

- `POST /api/agent` для one-shot agent runs.
- `/api/orchestration/workflows/*` для preview, start, stream и cancel.
- Browser push notifications.
- Telegram pairing, task notifications и optional prompt bridge.

OpenAPI: [`public/openapi.yaml`](public/openapi.yaml)

### Themes, plugins и MCP

- Dark/light mode.
- Accent palettes, включая emerald и VS Code-like colors.
- Custom accent colors отдельно для dark/light.
- Token-based UI styling для buttons, focus rings, navigation и active states.
- MCP server management.
- Plugin system with frontend tabs and optional backend services.

## Установка

Требуется Node.js 22+.

```bash
npx @pixelbyte-software/pixcode
```

Или глобально:

```bash
npm install -g @pixelbyte-software/pixcode
pixcode
```

Открыть:

```text
http://localhost:3001
```

Desktop installers находятся в GitHub Releases: Windows `.exe`, macOS `.dmg`, Linux AppImage/packages.

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

Важно:

- `npm run dev` на Linux использует daemon manager.
- Для отдельной frontend-разработки используйте `npm run client`; обычный runtime слушает `3001`.
- `npm run server` запускает compiled backend из `dist-server/`.

## Links

- npm: <https://www.npmjs.com/package/@pixelbyte-software/pixcode>
- GitHub: <https://github.com/alicomert/pixcode>
- Releases: <https://github.com/alicomert/pixcode/releases/latest>
