# Pixcode Platformization

Historical note: v1.45 introduced the platform control plane that turns Pixcode into a self-hosted agent operations surface for teams.

## External identity proxy requirement

`VITE_IS_PLATFORM=true` does not disable Pixcode authentication by itself.
Platform authentication bypass is enabled only when the deployment also sets
`PIXCODE_ALLOW_PLATFORM_AUTH_BYPASS=1`, builds the frontend with
`VITE_PLATFORM_AUTH_BYPASS=true`, and places Pixcode behind a trusted
identity/authentication proxy. Without all three settings, normal JWT/API-key
auth continues to protect HTTP, WebSocket, and agent routes. Never enable the
bypass on a directly exposed server.

## RBAC and Team Mode

`/api/platformization/team/members` stores owner, admin, member, and viewer records with explicit permission lists. Each team change is written to the audit log.

### Member workspace isolation

Member-created workspaces live under `WORKSPACES_BASE/users/<user-id>` and are
automatically granted to their creator through a project collaborator record.
The folder browser, folder creation, workspace creation, and clone-progress
endpoints enforce this private root for members. Administrators retain the
host-wide workspace picker; collaborators can still reopen only the project
paths and `allowedRoots` explicitly assigned by an administrator.

## Secret Vault

`/api/platformization/secrets` stores scoped secrets as AES-GCM sealed values. Scopes are global, provider, project, workflow, Telegram, and API. `/api/platformization/secrets/scoped-env` can build a redacted preview or an explicit reveal response for runtime env injection.

## MCP/plugin Marketplace

`/api/platformization/marketplace/plugins` tracks MCP servers, workflow templates, provider adapters, and notification channels with install commands, permission scopes, and health checks.

## Evaluation Harness

`/api/platformization/eval/suites` stores regression suites with acceptance criteria. `/api/platformization/eval/runs` records model/provider results and computes pass rate and average latency.

## Cost, Token, and Latency Dashboard

`/api/platformization/usage/events` records provider, model, workflow, token, cost, latency, and status events. `/api/platformization/usage/summary` aggregates run count, total tokens, cost, average latency, and error rate.

## Security/audit Mode

`/api/platformization/security/audit-runs` creates `pixcode.security-audit.v1` runs for dependency audit, secret scan, permission audit, and agent output leak detection. `/api/platformization/audit-log` exposes the platform audit stream.

The first v1.45 implementation is intentionally provider-neutral and storage-backed so chat, orchestration, TaskMaster, Telegram, API, and future team surfaces can all build on the same contracts.
