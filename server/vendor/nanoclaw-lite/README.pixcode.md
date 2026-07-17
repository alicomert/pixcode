# NanoClaw-lite (vendored for Pixcode)

Source: https://github.com/codedojokapa/nanoclaw-lite

Vendored under `server/vendor/nanoclaw-lite` and embedded in the Pixcode daemon.

## Pixcode patches (minimal)

- `src/config.ts` — data dirs under `~/.pixcode/nanoclaw`, `CREDENTIAL_PROXY_PORT` default **3199** (not 3001), assistant name **PixBot**
- `src/logger.ts` — no process.exit handlers unless `NANOCLAW_STANDALONE=1`
- `src/index.ts` — `startEmbeddedNanoclaw()` for in-process use; runs without messaging channels (scheduler still active)

## Bridge

- `server/modules/nanoclaw/bridge.js` — HTTP API + lifecycle
- Mounted at `/api/nanoclaw` and `/api/tasks` (PixBot UI)

## Env

| Variable | Purpose |
|----------|---------|
| `TELEGRAM_BOT_TOKEN` | Enable NanoClaw Telegram channel (read via nanoclaw env) |
| `ASSISTANT_NAME` | Trigger name (default PixBot) |
| `PIXCODE_NANOCLAW_DIR` | Override data root |
| `NANOCLAW_CREDENTIAL_PROXY_PORT` | Default 3199 |
| `NANOCLAW_STANDALONE=1` | Run nanoclaw as its own process |

## Upstream refresh

```bash
git clone --depth 1 https://github.com/codedojokapa/nanoclaw-lite.git /tmp/nanoclaw-lite-ref
# copy src/, re-apply the three patches above
```
