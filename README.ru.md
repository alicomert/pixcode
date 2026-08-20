<div align="center">
  <img src="public/logo.png" alt="Pixcode logo" width="96" height="96" />
  <h1>Pixcode</h1>
  <p><strong>Self-hosted панель управления для AI coding agents.</strong></p>
  <p>
    Один веб-интерфейс для Claude Code, Cursor CLI, Codex, Gemini CLI, Qwen Code и OpenCode: чат, shell, файлы, Git, автоматизация агентов, API keys, плагины, уведомления, Telegram и desktop/server режимы.
  </p>
  <p>
    <a href="https://buymeacoffee.com/alicomert" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-support%20Pixcode-ffdd00?style=for-the-badge&logo=buymeacoffee&logoColor=000000" alt="Buy me a coffee" /></a>
  </p>
  <p>
    <a href="README.md">English</a> ·
    <a href="README.tr.md">Türkçe</a> ·
    <a href="README.de.md">Deutsch</a> ·
    <a href="README.ru.md" aria-current="page">Русский</a> ·
    <a href="README.ja.md">日本語</a> ·
    <a href="README.ko.md">한국어</a> ·
    <a href="README.zh-CN.md">简体中文</a> ·
    <a href="README.es-ES.md">Español</a>
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

| Workspace | Mobile workspace |
| --- | --- |
| <img src="public/screenshots/desktop-main.png" alt="Pixcode desktop workspace" width="480" /> | <img src="public/screenshots/mobile-chat.png" alt="Мобильное рабочее пространство Pixcode" width="260" /> |

## Основные возможности

### Несколько CLI в одном интерфейсе

- Claude Code, Cursor CLI, Codex, Gemini CLI, Qwen Code и OpenCode.
- Auth, API key credentials, provider-specific OAuth callback/paste flows, install status, model catalogs и CLI version status в Settings. GitHub подключается через OAuth.
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

Pixcode отслеживает локальный working tree. Command Center в Quick Settings показывает измененные файлы сразу, подсвечивает новые изменения и открывает нужный файл/строку. Это помогает видеть, что именно изменил агент, не закрывая основное рабочее пространство.

### Автоматизация агентов (NanoClaw + production agent loop)

Поддерживаемые поверхности автоматизации разделены по задачам:

- **NanoClaw** выполняет multi-CLI диалоги, разовые запуски и постоянные
  расписания `once`/`interval`/`cron`, сохраняя контекст проекта.
- **Production agent loop** обслуживает административные процессы: issue-to-PR,
  CI repair, review queue, checkpoints и scheduler jobs.

Старая UI и семейство маршрутов `/api/orchestration/*` удалены в v1.55.
Оставшиеся упоминания orchestration — только история миграции; новые клиенты
должны использовать поддерживаемые API ниже.

### API, Telegram и notifications

> **Актуальная заметка API (1.64.x):** прежний workflow API `/api/orchestration/*` удалён в v1.55. Для multi-CLI задач, диалогов и расписаний используйте NanoClaw (`/api/nanoclaw/*` или алиас `/api/tasks/*`), а для поддерживаемого production agent loop — `/api/production-agent-loop/*`. Старые упоминания orchestration оставлены только как контекст миграции.

Frontend Pixcode использует REST/WebSocket, и external automation может использовать тот же control plane. Новые API keys начинаются с `px_`; старые `ck_` keys остаются совместимыми.

```bash
curl http://localhost:3001/api/projects \
  -H "Authorization: Bearer px_your_key_here"
```

Можно использовать:

- `POST /api/nanoclaw/run` для разовых multi-CLI запусков агента.
- `/api/nanoclaw/*` (или `/api/tasks/*`) для чата, запусков агентов, расписаний и событий; `/api/production-agent-loop/*` для issue-to-PR, CI repair, review queue и snapshots.
- Browser push notifications.
- Telegram pairing, task notifications и optional prompt bridge.

Интерактивная справка API: [`public/api-docs.html`](public/api-docs.html). В работающем Pixcode `GET /api/public/manifest` является discovery-документом, а `GET /api/public/openapi` отдает актуальный машиночитаемый фрагмент API; [`public/openapi.yaml`](public/openapi.yaml) остается snapshot релиза.

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
