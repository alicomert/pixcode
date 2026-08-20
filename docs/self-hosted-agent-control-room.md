# Pixcode Self-Hosted Agent Control Room

> The former `/api/orchestration/*` workflow surface referenced by older
> examples is retired. Use `/api/nanoclaw/*` (or `/api/tasks/*`) for agent
> runs/schedules and `/api/production-agent-loop/*` for the maintained admin
> control-plane queues.

Pixcode is a self-hosted control room for coding agents. The product surface is organized around projects, provider CLIs, NanoClaw runs and schedules, production review queues, remote control, and automation hooks.

## Remote Control

The Remote tab is a mobile-first console for monitoring up to four active projects at once. It shows active runs, failed runs, pending approvals, recent project activity, and webhook health in one compact layout.

Use `GET /api/remote/control-room` for the same snapshot from mobile clients, Telegram, or external dashboards. This is an installation-wide admin endpoint: a scoped API key needs both `remote:read` and admin access.

## Telegram

Telegram is a full control surface for paired users:

- Select project, provider, model, and task.
- Start chat prompts or NanoClaw runs.
- Watch task progress and refresh run details.
- Review and answer pending approval requests when a provider requires one.
- Inspect webhook status and the multi-project control room.

Core commands include `/menu`, `/projects`, `/provider`, `/model`, `/tasks`, `/runs`, `/approvals`, `/control-room`, `/webhooks`, `/chat <prompt>`, and `/run <prompt>`.

## Production Review Queue

The former `/api/orchestration/workflows/approvals` endpoint is retired. The maintained production agent loop provides an admin-only review queue. Updating a review record records the review state; it is not a substitute for a provider runtime approval action. Use the public manifest/OpenAPI document to discover the current queue schema.

Review records can be updated from the UI, Telegram, or API:

```bash
curl -X PATCH \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $PIXCODE_API_KEY" \
  -d '{"status":"accepted","reviewer":"api"}' \
  "$PIXCODE_URL/api/production-agent-loop/review-queue/review_id"
```

## Webhook Automation

Webhook events are signed with `X-Pixcode-Signature-256` and include a stable `pixcode.webhook.v1` envelope.

Supported event types include `run.started`, `run.completed`, `run.failed`, `run.canceled`, `approval.needed`, `approval.resolved`, `file.changed`, `live_view.started`, and `live_view.failed`.

Register a webhook:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $PIXCODE_API_KEY" \
  -d '{"name":"CI listener","url":"https://example.com/pixcode","events":["run.completed","approval.needed"]}' \
  "$PIXCODE_URL/api/webhooks"
```

## Public API SDK

The public API exposes a generated TypeScript starter at `GET /api/public/sdk/typescript` and a curl cookbook at `GET /api/public/cookbook`.

These endpoints are intentionally small and typed so external automation can start with projects, remote control snapshots, NanoClaw task runs/schedules, production review records, and webhook setup without reverse-engineering the UI. Use a scoped `px_` API key and a one-time stream ticket for browser streams; never put a long-lived key in a URL query string.
