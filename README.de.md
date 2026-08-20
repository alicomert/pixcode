<div align="center">
  <img src="public/logo.png" alt="Pixcode logo" width="96" height="96" />
  <h1>Pixcode</h1>
  <p><strong>Self-hosted Kontrollraum für AI-Coding-Agents.</strong></p>
  <p>
    Claude Code, Cursor CLI, Codex, Gemini CLI, Qwen Code und OpenCode in einer Weboberfläche: Chat, Shell, Dateien, Git, Agenten-Automatisierung, API-Keys, Plugins, Benachrichtigungen, Telegram und Desktop-/Server-Betrieb.
  </p>
  <p>
    <a href="https://buymeacoffee.com/alicomert" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-support%20Pixcode-ffdd00?style=for-the-badge&logo=buymeacoffee&logoColor=000000" alt="Buy me a coffee" /></a>
  </p>
  <p>
    <a href="README.md">English</a> ·
    <a href="README.tr.md">Türkçe</a> ·
    <a href="README.de.md" aria-current="page">Deutsch</a> ·
    <a href="README.ru.md">Русский</a> ·
    <a href="README.ja.md">日本語</a> ·
    <a href="README.ko.md">한국어</a> ·
    <a href="README.zh-CN.md">简体中文</a> ·
    <a href="README.es-ES.md">Español</a>
  </p>
</div>

## Was ist Pixcode?

> **Aktueller API-Hinweis (1.64.x):** Die frühere Workflow-UI/API unter `/api/orchestration/*` wurde in v1.55 entfernt. Für Multi-CLI-Aufgaben, Gespräche und Zeitpläne verwende NanoClaw (`/api/nanoclaw/*` oder das Alias `/api/tasks/*`). Für den gepflegten Production-Agent-Loop verwende `/api/production-agent-loop/*`. Historische Orchestrierungsabschnitte dienen nur noch als Migrationskontext.

Pixcode macht deinen Laptop, Desktop-Rechner oder Linux-Server zu einem browserbasierten Arbeitsbereich für Coding-Agents. Statt Terminalfenster, CLI-Ausgaben, Dateimanager, Git-Ansicht und Provider-Einstellungen getrennt zu öffnen, bündelt Pixcode alles in einer lokalen Web-App.

Typische Setups:

- **Lokal**: Pixcode auf dem eigenen Rechner starten und die bekannten CLIs mit einer komfortableren UI nutzen.
- **Server/VDS**: Pixcode als Linux-Daemon betreiben und von Browser, Tablet oder Smartphone zugreifen.
- **Desktop**: Windows-, macOS- und Linux-Installer aus den GitHub-Releases verwenden.

Pixcode ist keine gehostete Cloud-IDE. Projekte, Credentials, Sessions, lokale Dateien, Git-Status und MCP-Konfiguration bleiben auf deiner eigenen Maschine, solange du sie nicht bewusst mit externen Diensten verbindest.

## Screenshots

| Workspace | Mobiler Workspace |
| --- | --- |
| <img src="public/screenshots/desktop-main.png" alt="Pixcode desktop workspace" width="480" /> | <img src="public/screenshots/mobile-chat.png" alt="Mobiler Pixcode-Arbeitsbereich" width="260" /> |

## Funktionen

### Ein UI für mehrere CLIs

- Claude Code, Cursor CLI, Codex, Gemini CLI, Qwen Code und OpenCode.
- Provider-Auth, API-Key-Credentials, anbieterspezifische OAuth-Callback/Paste-Flows, Install-Status, Modelllisten und CLI-Versionen unter Settings. GitHub wird dort über OAuth verbunden.
- Provider-native CLIs bleiben erhalten; Pixcode ergänzt Session-Management, WebSocket-Streaming, Benachrichtigungen, Dateikontext und Projektsteuerung.
- Der UI-Zustand zeigt, ob ein CLI denkt, Tools ausführt, auf Freigabe wartet oder Ausgabe streamt.

### Chat, Dateien, Shell und Git

- Projektbezogene Sessions mit Verlauf.
- Prompt-Eingabe fest am unteren Rand des Chat-/Projektbereichs.
- Eingebaute Shell, die auf Desktop als halbes Panel oder Vollpanel geöffnet werden kann.
- Datei-Browser mit Bearbeiten, Upload, Umbenennen, Löschen und Detailansicht.
- Source-Control-Ansicht für Status, Diffs, Branches, Commits und geänderte Dateien.
- Split-Panels mit Icon-Controls, Schließen-Button und responsive Layout für Mobile.

### Command Center für Änderungen

Pixcode beobachtet lokale Working-Tree-Änderungen. Der Command-Center-Modus in Quick Settings listet geänderte Dateien sofort auf, markiert neue Änderungen sichtbar und kann direkt zur betroffenen Datei springen. So bleibt nachvollziehbar, was ein Agent im Projekt geändert hat.

### Agent-Automatisierung (NanoClaw + Production-Agent-Loop)

Die gepflegten Automatisierungsflächen sind nach Aufgabe getrennt:

- **NanoClaw** führt Multi-CLI-Konversationen, einzelne Runs und dauerhafte
  `once`/`interval`/`cron`-Zeitpläne mit Projektkontext aus.
- **Production-Agent-Loop** übernimmt administrative Abläufe wie Issue-to-PR,
  CI-Reparaturpläne, Review-Queues, Checkpoints und Scheduler-Jobs.

Die frühere UI und Routenfamilie `/api/orchestration/*` wurde in v1.55 entfernt.
Verbleibende Orchestrierungsdokumente sind nur Migrationsgeschichte; neue Clients
sollten die unten genannten gepflegten APIs verwenden.

### API, Telegram und Benachrichtigungen

Pixcode nutzt REST und WebSocket auch intern. Externe Automatisierung kann Pixcode über API-Keys steuern. Neue Keys beginnen mit `px_`; alte `ck_` Keys bleiben kompatibel.

```bash
curl http://localhost:3001/api/projects \
  -H "Authorization: Bearer px_your_key_here"
```

Weitere Möglichkeiten:

- `POST /api/nanoclaw/run` für nicht-interaktive Multi-CLI-Agent-Läufe.
- `/api/nanoclaw/*` (oder `/api/tasks/*`) für Chat, Agent-Läufe, geplante Aufgaben und Events; `/api/production-agent-loop/*` für Issue-to-PR, CI-Reparatur, Review-Queue und Snapshots.
- Browser-Push und Telegram-Benachrichtigungen für abgeschlossene, fehlgeschlagene oder wartende Tasks.
- Telegram-Pairing über kurzlebige Codes und optionaler Prompt-Bridge.

Interaktive API-Referenz: [`public/api-docs.html`](public/api-docs.html). Auf einer laufenden Pixcode-Instanz liefern `GET /api/public/manifest` die Discovery und `GET /api/public/openapi` den aktuellen maschinenlesbaren API-Ausschnitt; [`public/openapi.yaml`](public/openapi.yaml) ist der gebündelte Release-Snapshot.

### Themes, Plugins und MCP

- Dark/Light Mode.
- Accent-Paletten wie Emerald und VS-Code-ähnliche Farben.
- Eigene Accent-Farben getrennt für Dark und Light.
- Tokenbasiertes Styling für Buttons, Fokus, Navigation und aktive Zustände.
- MCP-Serververwaltung für unterstützte Provider.
- Plugin-System mit Frontend-Tabs und optionalen Backend-Services.

## Installation

Node.js 22 oder neuer wird benötigt.

```bash
npx @pixelbyte-software/pixcode
```

Oder global:

```bash
npm install -g @pixelbyte-software/pixcode
pixcode
```

Öffnen:

```text
http://localhost:3001
```

Desktop-Builds gibt es in den GitHub-Releases: Windows `.exe`, macOS `.dmg`, Linux AppImage/Pakete.

## Linux-Daemon

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

## Entwicklung

```bash
npm install
npm run typecheck
npm run lint
npm run build
```

Hinweise:

- `npm run dev` verwendet unter Linux den Daemon-Manager.
- Für Frontend-Entwicklung separat `npm run client` verwenden; normaler Betrieb läuft über Port `3001`.
- `npm run server` startet gebaute Dateien aus `dist-server/`.

## Links

- npm: <https://www.npmjs.com/package/@pixelbyte-software/pixcode>
- GitHub: <https://github.com/alicomert/pixcode>
- Releases: <https://github.com/alicomert/pixcode/releases/latest>
