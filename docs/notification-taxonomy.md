# Notification Taxonomy

Pixcode notification producers must use the shared taxonomy from
`server/services/notification-taxonomy.js` before events are delivered to
in-app notifications, web push, desktop notifications, Telegram, API clients,
or future webhook consumers.

## Required Event Types

| Event type | Category | Preference key | Purpose |
| --- | --- | --- | --- |
| `chat.done` | `chat` | `stop` | A chat/provider run completed. |
| `orchestration.done` | `orchestration` | `stop` | An orchestration workflow completed. |
| `approval.needed` | `approval` | `actionRequired` | A run is waiting for human approval. |
| `error` | `system` | `error` | A generic Pixcode error occurred. |
| `test.failed` | `verification` | `error` | A build, lint, typecheck, or test command failed. |
| `live_view.failed` | `live_view` | `error` | A Live View preview failed. |

## Delivery Contract

Every emitted notification is normalized with:

- `eventType` for stable subscription and webhook routing.
- `category` for UI grouping and future dashboards.
- `preferenceKey` for existing user notification preferences.
- `kind`, `severity`, and `requiresUserAction` for backward compatibility.
- `code` for legacy message handling and provider-specific detail.

Existing preference keys stay backward-compatible: `actionRequired`, `stop`,
`error`, and `updates`. New event types map onto those keys until a later
release expands the settings UI into more granular controls.

The authenticated endpoint `GET /api/settings/notification-taxonomy` exposes
the current public taxonomy so UI, Telegram, API, and future webhook consumers
can subscribe to the same contract.
