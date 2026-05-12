# Pixcode Self-Hosted Agent Control Room

Pixcode is a self-hosted control room for coding agents. The product surface is organized around projects, provider CLIs, orchestration runs, human approvals, remote control, and automation hooks.

## Remote Control

The Remote tab is a mobile-first console for monitoring up to four active projects at once. It shows active runs, failed runs, pending approvals, recent project activity, and webhook health in one compact layout.

Use `GET /api/remote/control-room` for the same snapshot from mobile clients, Telegram, or external dashboards.

## Telegram

Telegram is a full control surface for paired users:

- Select project, provider, model, and workflow.
- Start chat prompts or orchestration runs.
- Watch run progress and refresh run details.
- Review and answer pending approval requests.
- Inspect webhook status and the multi-project control room.

Core commands include `/menu`, `/projects`, `/provider`, `/model`, `/workflows`, `/runs`, `/approvals`, `/control-room`, `/webhooks`, `/chat <prompt>`, and `/workflow <prompt>`.

## Human Approval Queue

Approvals are centralized across workflow runs at `GET /api/orchestration/workflows/approvals`.

Decisions can come from the UI, Telegram, or API:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $PIXCODE_API_KEY" \
  -d '{"allow":true,"source":"api"}' \
  "$PIXCODE_URL/api/orchestration/workflows/approvals/approval_id"
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

These endpoints are intentionally small and typed so external automation can start with projects, remote control snapshots, workflow runs, approval decisions, and webhook setup without reverse-engineering the UI.
