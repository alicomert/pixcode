# Pixcode System Overview

Bu dokuman Pixcode **1.60.x** ana mimarisini, NanoClaw motorunu, public HTTP API’yi ve desktop dagitimini ozetler.

## Ana Mimari

Pixcode tek uygulama icinde web UI, backend API, CLI runtime yonetimi ve desktop paketleme katmanlarini tasir.

| Katman | Konum | Not |
|--------|--------|-----|
| Frontend | `src/` | React 18 + Vite 7 + Tailwind; entry `src/main.jsx` → `App.tsx` |
| Backend | `server/` | Express + `ws`; routes `/api/*` |
| NanoClaw | `server/vendor/nanoclaw-lite` + `server/modules/nanoclaw/` | Agent / schedule / Telegram-WhatsApp motoru |
| Shared | `shared/`, `server/shared/` | Tip ve sozlesmeler |
| Desktop | `desktop/` | Electron NSIS/DMG/AppImage wrapper |
| Build | `dist/`, `dist-server/` | `npm run build` ciktisi |
| CLI | `pixcode` | `dist-server/server/cli.js` |

## Shell modlari (UI)

Kullanici tercihleri (`useUiPreferences`):

| Mode | Anlam |
|------|--------|
| `nanoclaw` | Gorev/agent odakli; NanoClaw merkeze yakin |
| `hybrid` | NanoClaw + klasik VS Code chrome (files, editor, shell, git) |
| `pixcode` | Klasik workbench; **mesajlasma yine NanoClaw** |

Optional **general** workspace: coding project secmeden de NanoClaw gorevleri calisir.

## Calisma modlari

- `npm run client` — yalnizca Vite frontend (5173).
- `npm run build:server` — backend build → `dist-server/`.
- `npm run server` — **build edilmis** backend.
- `npm run server:dev` / daemon — `server/cli.js` uzerinden system mode (Linux’ta systemd).
- `node server/cli.js start --no-daemon` — foreground.
- `npm run dev` — daemon install/start; plain foreground degildir (`PIXCODE_NO_DAEMON=1` ile foreground).

## HTTP API ve Auth

- Ana yuzey: `/api/*` (`validateApiKey` + cogu rota `authenticateToken`).
- Auth public: `/api/auth/*` (register/login/onboarding) API key zorunlulugundan muaf.
- API key: Settings → API keys, prefix `px_`. Header: `X-API-Key` veya `Authorization: Bearer`.
- Public katalog:
  - `GET /api/public/manifest`
  - `GET /api/public/cookbook` — hazir curl ornekleri
  - `GET /api/public/openapi`
  - `GET /api/public/sdk/typescript`

### NanoClaw API (uzaktan agent / schedule)

Detay: **[docs/NANOCLAW_API.md](./NANOCLAW_API.md)**

```bash
export PIXCODE_URL=http://127.0.0.1:3001
export PIXCODE_API_KEY=px_your_key

curl -H "X-API-Key: $PIXCODE_API_KEY" "$PIXCODE_URL/api/nanoclaw/help"
curl -H "X-API-Key: $PIXCODE_API_KEY" "$PIXCODE_URL/api/nanoclaw/status"

# Aninda multi-CLI calistir
curl -X POST -H "Content-Type: application/json" -H "X-API-Key: $PIXCODE_API_KEY" \
  -d '{"prompt":"summarize git status","agentType":"claude-code","projectId":"my-app"}' \
  "$PIXCODE_URL/api/nanoclaw/run"

# Cron schedule
curl -X POST -H "Content-Type: application/json" -H "X-API-Key: $PIXCODE_API_KEY" \
  -d '{"prompt":"daily audit","schedule_type":"cron","schedule_value":"0 9 * * *","projectId":"my-app"}' \
  "$PIXCODE_URL/api/nanoclaw/tasks"
```

`/api/tasks/*` ayni router’in UI uyumluluk alias’idir (eski “PixBot” degil — arka planda NanoClaw).

### Diger sik kullanilan rotalar

| Alan | Ornek |
|------|--------|
| Projects | `GET /api/projects` |
| Files | `GET /api/projects/:name/files`, `GET …/file?filePath=` |
| Git | `/api/git/*` |
| Providers | `/api/providers` |
| Shell | `/api/shell/sessions/*` |
| Orchestration / A2A | `/api/orchestration/*`, `/a2a/*` |
| Remote / control room | `/api/remote/*` |
| Webhooks | `/api/webhooks` |
| Telegram (Pixcode control) | `/api/telegram/*` |

## Multi-CLI agentler

NanoClaw multi-runner (`server/modules/nanoclaw/multi-runner.js`) su provider’lara route eder:

- Claude Code (`claude-code`)
- OpenAI Codex
- Gemini CLI
- Cursor CLI
- Qwen Code
- OpenCode
- Grok Build / xAI (`grok`) — bkz. [GROK_BUILD.md](./GROK_BUILD.md)

Prompt directive: `[agent:codex] …` veya `[agent:grok model:…] …`

## Messaging

- **Telegram / WhatsApp:** NanoClaw channel katmani (token Pixcode Settings’ten enjekte edilir).
- Shell mode ne olursa olsun messaging NanoClaw uzerinden kalir.

## Desktop ve installer

- Wrapper: `desktop/` (Electron + `electron-builder`).
- Bundled product: `@pixelbyte-software/pixcode` (desktop `package.json` pin’i root surumle hizali tutulmali).
- Windows build native rebuild gerektirmez (`npmRebuild: false`); N-API prebuild’ler kullanilir.
- Boot: runtime `userData/pixcode-runtime` seed + opsiyonel `npm` latest pull (eski EXE’lerin self-heal’i).
- Artifact ornekleri:
  - Windows: `Pixcode-Setup-X.Y.Z.exe`
  - macOS: `Pixcode-X.Y.Z-arm64.dmg` / `x64.dmg`
  - Linux: `AppImage` + `.deb`
- Release: GitHub `vX.Y.Z` + npm `@pixelbyte-software/pixcode@X.Y.Z`.

## Files / Editor notlari

- File tree tarama butceli; **truncated agaclar cache’lenmez** (eksik liste kalici olmaz).
- Truncation header: `X-Pixcode-File-Tree-Truncated: 1`.
- Env ile sinirlar: `PIXCODE_FILE_TREE_MAX_ITEMS`, `PIXCODE_FILE_TREE_SCAN_MAX_MS`, vb.
- Windows path karsilastirmasi case-insensitive (editor 403 / stuck load onleme).

## Dogrulama

Unit test suite yok. Kabul:

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- Canli: `/health`, `GET /api/nanoclaw/status`, `GET /api/public/cookbook`

## Operasyon

- `npm run server` her zaman `dist-server` kullanir — source degisikligi sonrasi `npm run build:server`.
- Auth DB: `~/.pixcode/auth.db` (`DATABASE_PATH` ile override).
- NanoClaw data: `~/.pixcode/nanoclaw`.
- Port: `SERVER_PORT` (backend), `VITE_PORT` (frontend). `HOST=0.0.0.0` remote bind.

## Eski isimler (kaldirildi / yeniden adlandi)

| Eski | Simdi |
|------|--------|
| PixBot chat heuristics | NanoClaw-lite + multi-runner |
| Full-screen chrome-kill Tasks | VS Code workbench icinde Tasks tab |
| Desktop pin `1.53.x` | `desktop/package.json` = current product version + auto-pull |
