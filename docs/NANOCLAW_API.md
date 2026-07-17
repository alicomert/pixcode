# NanoClaw HTTP API

Pixcode embeds **NanoClaw-lite** as the agent/schedule/messaging engine.  
Everything below is reachable over HTTP so remote clients, scripts, and other machines can drive the system without the UI.

> **Base URL:** `http://HOST:3001` (default `SERVER_PORT=3001`)  
> **Auth:** `X-API-Key: px_…` or `Authorization: Bearer px_…` (Settings → API keys; scopes `tasks:read` / `tasks:write`)  
> **Live help:** `GET /api/nanoclaw/help`  
> **Cookbook:** `GET /api/public/cookbook`  
> **UI alias:** `/api/tasks/*` is the same router as `/api/nanoclaw/*`

## Quick start

```bash
export PIXCODE_URL=http://127.0.0.1:3001
export PIXCODE_API_KEY=px_your_key

# Health of the embedded engine
curl -H "X-API-Key: $PIXCODE_API_KEY" "$PIXCODE_URL/api/nanoclaw/status"

# Full endpoint list + example curls
curl -H "X-API-Key: $PIXCODE_API_KEY" "$PIXCODE_URL/api/nanoclaw/help"
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/nanoclaw/help` | Machine-readable help + curl samples |
| `GET` | `/api/nanoclaw/status` | Engine started?, channels, multi-CLI map |
| `POST` | `/api/nanoclaw/start` | Ensure NanoClaw is running inside the daemon |
| `GET` | `/api/nanoclaw/channels` | Telegram / WhatsApp capability flags |
| `GET` | `/api/nanoclaw/agents` | Multi-CLI agent list |
| `GET` | `/api/nanoclaw/tasks` | List schedules (`?projectId=`) |
| `GET` | `/api/nanoclaw/tasks/:id` | One task |
| `POST` | `/api/nanoclaw/tasks` | Create schedule (`once` \| `interval` \| `cron`) |
| `PATCH` | `/api/nanoclaw/tasks/:id` | Update prompt / schedule |
| `POST` | `/api/nanoclaw/tasks/:id/pause` | Pause |
| `POST` | `/api/nanoclaw/tasks/:id/resume` | Resume |
| `POST` | `/api/nanoclaw/tasks/:id/cancel` | Cancel |
| `DELETE` | `/api/nanoclaw/tasks/:id` | Delete |
| `POST` | `/api/nanoclaw/run` | **Run an agent now** (no schedule) |
| `POST` | `/api/nanoclaw/bot/chat` | UI helper: message → once schedule |
| `GET` | `/api/nanoclaw/events` | SSE heartbeat stream |

## Chat (preferred — NanoClaw conversation)

**Not a job queue.** Messages go through the chat engine: multi-CLI agent replies in-conversation. Schedules are created only when you clearly ask for deferred/recurring work.

```bash
# Conversational turn (any language)
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $PIXCODE_API_KEY" \
  -d '{
    "message": "selam, projede auth nerde?",
    "projectId": "my-app",
    "agentType": "claude-code"
  }' \
  "$PIXCODE_URL/api/nanoclaw/bot/chat"
```

Routing helpers (optional):

| Form | Example |
|------|---------|
| Slash (kısa) | `/opencode fix tests` · `/claude …` · `/grok …` |
| Tag | `[agent:grok] design release checklist` |
| Natural | `bunu codex ile yap` / `use gemini to explain` |
| Files | `@src/auth.ts review this` |
| Schedule | `her gün saat 9 bağımlılık kontrolü` |

Sessions stay warm per conversation+agent (`continueSession`) — MCP/tools are not re-bootstrapped every message.

```bash
curl -H "X-API-Key: $PIXCODE_API_KEY" "$PIXCODE_URL/api/nanoclaw/bot/conversations?projectId=my-app"
curl -H "X-API-Key: $PIXCODE_API_KEY" "$PIXCODE_URL/api/nanoclaw/bot/help"
```

## PixBot LLM (multi Custom providers)

Chat defaults to **PixBot** — OpenAI-compatible HTTP (not CLI spawn). You can attach **many** endpoints:

- **Catalog** from [models.dev](https://models.dev/api.json) (OpenRouter, Groq, DeepSeek, LM Studio, …)
- **Custom** base URL (Ollama, LiteLLM, private gateway)
- **API key is optional** (local Ollama / open proxies work without one)

Store: `~/.pixcode/pixbot-providers.json`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/nanoclaw/bot/llm` | Config summary (providers, active) |
| `PUT` | `/api/nanoclaw/bot/llm` | Legacy single save → upserts one Custom |
| `GET` | `/api/nanoclaw/bot/providers` | List connected providers |
| `POST` | `/api/nanoclaw/bot/providers` | Add provider `{ name?, baseUrl, apiKey?, catalogId? }` |
| `PATCH` | `/api/nanoclaw/bot/providers/:id` | Update name / baseUrl / apiKey / enabled |
| `DELETE` | `/api/nanoclaw/bot/providers/:id` | Remove |
| `POST` | `/api/nanoclaw/bot/providers/:id/activate` | Set active |
| `GET` | `/api/nanoclaw/bot/catalog?q=` | models.dev OpenAI-compatible catalog |
| `GET` | `/api/nanoclaw/bot/models` | Live `/v1/models` from all enabled providers |
| `POST` | `/api/nanoclaw/bot/chat` | Chat (`model` may be `providerId::modelId`) |

```bash
# Catalog (search)
curl -H "X-API-Key: $PIXCODE_API_KEY" \
  "$PIXCODE_URL/api/nanoclaw/bot/catalog?q=openrouter"

# Add OpenRouter (key optional for local-only endpoints)
curl -X POST -H "Content-Type: application/json" -H "X-API-Key: $PIXCODE_API_KEY" \
  -d '{"catalogId":"openrouter","baseUrl":"https://openrouter.ai/api/v1","apiKey":"sk-or-…"}' \
  "$PIXCODE_URL/api/nanoclaw/bot/providers"

# Add local Ollama (no key)
curl -X POST -H "Content-Type: application/json" -H "X-API-Key: $PIXCODE_API_KEY" \
  -d '{"name":"Ollama","baseUrl":"http://127.0.0.1:11434/v1"}' \
  "$PIXCODE_URL/api/nanoclaw/bot/providers"

# Models + chat
curl -H "X-API-Key: $PIXCODE_API_KEY" "$PIXCODE_URL/api/nanoclaw/bot/models"
curl -X POST -H "Content-Type: application/json" -H "X-API-Key: $PIXCODE_API_KEY" \
  -d '{"message":"selam","projectId":"general","model":"provider-id::llama3.2"}' \
  "$PIXCODE_URL/api/nanoclaw/bot/chat"
```

UI alias: same paths under `/api/tasks/bot/*`.

## Run an agent now (one-shot, no chat history)

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $PIXCODE_API_KEY" \
  -d '{
    "prompt": "summarize git status and open TODOs",
    "agentType": "claude-code",
    "projectId": "my-app"
  }' \
  "$PIXCODE_URL/api/nanoclaw/run"
```

### Body fields

| Field | Required | Notes |
|-------|----------|--------|
| `prompt` / `message` | yes | Work for the agent |
| `agentType` / `agent` / `provider` | no | `claude-code`, `codex`, `gemini`, `cursor`, `qwen`, `opencode`, `grok` |
| `model` | no | Provider-specific model id |
| `projectId` | no | Pixcode project name, or `general` |
| `projectPath` / `cwd` | no | Absolute workspace path override |
| `sessionId` | no | Continue a previous CLI session |

You can also prefix the prompt:

```text
[agent:codex] add unit tests for auth
[agent:grok model:grok-4] design a release checklist
```

## Schedule tasks

### Once (run soon)

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $PIXCODE_API_KEY" \
  -d '{
    "prompt": "[agent:codex] write a README",
    "schedule_type": "once",
    "projectId": "my-app"
  }' \
  "$PIXCODE_URL/api/nanoclaw/tasks"
```

### Cron

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $PIXCODE_API_KEY" \
  -d '{
    "prompt": "daily dependency audit",
    "schedule_type": "cron",
    "schedule_value": "0 9 * * *",
    "projectId": "my-app"
  }' \
  "$PIXCODE_URL/api/nanoclaw/tasks"
```

### Interval (ms)

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $PIXCODE_API_KEY" \
  -d '{
    "prompt": "health check the deploy",
    "schedule_type": "interval",
    "schedule_value": "3600000",
    "projectId": "my-app"
  }' \
  "$PIXCODE_URL/api/nanoclaw/tasks"
```

### Lifecycle

```bash
# list
curl -H "X-API-Key: $PIXCODE_API_KEY" "$PIXCODE_URL/api/nanoclaw/tasks"

# pause / resume / cancel
curl -X POST -H "X-API-Key: $PIXCODE_API_KEY" "$PIXCODE_URL/api/nanoclaw/tasks/TASK_ID/pause"
curl -X POST -H "X-API-Key: $PIXCODE_API_KEY" "$PIXCODE_URL/api/nanoclaw/tasks/TASK_ID/resume"
curl -X POST -H "X-API-Key: $PIXCODE_API_KEY" "$PIXCODE_URL/api/nanoclaw/tasks/TASK_ID/cancel"

# delete
curl -X DELETE -H "X-API-Key: $PIXCODE_API_KEY" "$PIXCODE_URL/api/nanoclaw/tasks/TASK_ID"
```

## Messaging channels

NanoClaw owns **Telegram** (and optional **WhatsApp**). Messaging stays on NanoClaw in every shell mode (`nanoclaw` | `hybrid` | `pixcode`).

```bash
curl -H "X-API-Key: $PIXCODE_API_KEY" "$PIXCODE_URL/api/nanoclaw/channels"
```

- **Telegram:** configure bot token in Pixcode Settings → Telegram (or `TELEGRAM_BOT_TOKEN`), then restart/start daemon.
- **WhatsApp:** set `WHATSAPP_ENABLED=1` and `WHATSAPP_AUTH_DIR=~/.pixcode/nanoclaw/whatsapp-auth`, scan QR on first start.

## Related system APIs (full product surface)

NanoClaw is one group of routes. Remote automation typically also uses:

```bash
# Projects
curl -H "X-API-Key: $PIXCODE_API_KEY" "$PIXCODE_URL/api/projects"

# Files tree
curl -H "X-API-Key: $PIXCODE_API_KEY" "$PIXCODE_URL/api/projects/my-app/files"

# Read file
curl -H "X-API-Key: $PIXCODE_API_KEY" \
  "$PIXCODE_URL/api/projects/my-app/file?filePath=README.md"

# Save file
curl -X PUT -H "Content-Type: application/json" -H "X-API-Key: $PIXCODE_API_KEY" \
  -d '{"filePath":"README.md","content":"# hi\n"}' \
  "$PIXCODE_URL/api/projects/my-app/file"

# Providers / CLI auth
curl -H "X-API-Key: $PIXCODE_API_KEY" "$PIXCODE_URL/api/providers"

# Public API index
curl -H "X-API-Key: $PIXCODE_API_KEY" "$PIXCODE_URL/api/public/manifest"
curl -H "X-API-Key: $PIXCODE_API_KEY" "$PIXCODE_URL/api/public/cookbook"
curl -H "X-API-Key: $PIXCODE_API_KEY" "$PIXCODE_URL/api/public/openapi"
```

## Architecture notes

- Engine lives under `server/vendor/nanoclaw-lite` and is bridged by `server/modules/nanoclaw/bridge.js`.
- Multi-CLI execution is `server/modules/nanoclaw/multi-runner.js` → `server/services/task-runtime.js`.
- Schedules are stored in NanoClaw’s SQLite under `~/.pixcode/nanoclaw` (not the Pixcode auth DB).
- Desktop / remote: same HTTP API; point `PIXCODE_URL` at the host running the daemon (`HOST=0.0.0.0`).

## Branding

**PixBot** is the ChatGPT-style chat surface (multi Custom / catalog providers + optional CLI via `/opencode` etc.).  
**NanoClaw** is the underlying engine (`/api/nanoclaw` = `/api/tasks`).
