# Provider Model Registry

Pixcode uses `server/services/model-registry.js` as the server-side source of
truth for provider model catalogs.

The registry owns:

- supported provider ids
- provider default models
- normalized static fallback catalogs
- live model discovery results from `provider-models.js`
- cache freshness and degraded/fallback metadata

Consumers should call the registry instead of importing `shared/modelConstants`
directly on the server. `shared/modelConstants` remains the bundled fallback
catalog used by the registry and by client-side first paint states while the API
request is in flight.

## API Contract

`GET /api/providers/:provider/models` returns the registry entry:

```json
{
  "provider": "codex",
  "models": [{ "value": "gpt-5.4", "label": "GPT-5.4", "source": "static" }],
  "defaultModel": "gpt-5.4",
  "fetchedAt": "2026-05-12T00:00:00.000Z",
  "error": "No codex API key configured...",
  "fromCache": false,
  "freshness": {
    "ttlMs": 21600000,
    "fetchedAt": "2026-05-12T00:00:00.000Z",
    "fromCache": false,
    "degraded": true,
    "source": "fallback"
  }
}
```

When live catalog discovery fails, the registry still returns the static
fallback catalog, but `error` and `freshness.degraded` must be present so UI,
Telegram, API, and orchestration consumers can explain why a live provider list
was not used.

## Current Consumers

- provider REST API model endpoint
- orchestration workflow model validation and fallback
- Telegram control surface model picker fallback
- built-in slash command model and cost handlers
- legacy Cursor/Codex defaults used by API routes

OpenCode live catalogs are still resolved by `provider-models.js`; when
models.dev succeeds, that live list remains authoritative so stale bundled Zen
model ids do not leak back into chat or orchestration.
