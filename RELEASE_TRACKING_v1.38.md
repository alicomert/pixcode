# Pixcode v1.38 Release Tracking

This file is the source checklist for the v1.38 planning wave. Replace the `GH-TBD-*` placeholders with GitHub issue numbers once the GitHub API is reachable, and keep the marked block in the GitHub release body so the app can show update progress mapped to issues and tasks.

<!-- pixcode:issue-progress -->
- [x] #15 First-run local/remote connection mode and API URL pairing
- [x] #16 Complete Pixcode control surface through API keys
- [x] #17 Telegram feature parity for remote control
- [x] #18 Taskmaster as the shared execution queue for CLI agents
- [x] #19 CLI plugin and external tool configuration management
- [x] #20 Desktop installer signing, artifact, and update recovery hardening
- [x] #21 Run diagnostics and provider health visibility
<!-- /pixcode:issue-progress -->

## Epic

- #22 epic(product): track v1.38 remote API and task operations

## Scope

### First-Run Local/Remote Mode

- Ask whether the user will use this computer directly or connect to a remote Pixcode server.
- Let remote mode accept an API URL and API key/session credentials before normal onboarding and update checks.
- Show a full-width connection banner when the controlled server is unreachable.
- Persist the selected mode and allow changing it from Settings.
- Added first-run local/remote selection to account setup and persisted redacted remote connection config through `/api/auth/connection-mode` and `/api/remote/config`.

### Public API Surface

- Define stable public API groups for auth, projects, sessions, provider runs, orchestration, Taskmaster tasks, notifications, files, git/source-control, settings, and update status.
- Keep `px_` API key prefix, add scoped/revocable API keys, and document examples in OpenAPI.
- Make Telegram and future remote clients use the same API/service layer instead of separate logic.
- Added `/api/public/manifest` and `/api/public/openapi` with stable automation groups, `px_` API-key examples, and persisted API-key scopes.

### Telegram Control Parity

- Add structured menus for active sessions, new chat, existing project, provider/model selection, orchestration workflows, Taskmaster tasks, settings, and notification granularity.
- Support final-only, step-summary, all-output, and errors-only notification modes.
- Keep menus edited in place and fully localized.
- Added sessions/new-chat controls and errors-only progress mode to Telegram control center with localized English/Turkish labels.

### Taskmaster Execution Backbone

- Add task create/edit/list/detail flows in UI, API, and Telegram.
- Bind tasks to project path, provider, model, permission mode, fallback provider, and worker slot.
- Persist progress, summaries, final output, failure reasons, and changed files per task.
- Added Taskmaster queue/detail automation routes and preserved fallback provider, permission mode, model, and worker slot in dispatch metadata.

### Provider Plugin And Tool Configuration

- Detect provider-specific plugin/tool config locations where supported.
- Show installed/available plugin state per provider.
- Allow safe enable/disable/update with preview, backup, validation, and redacted secrets.
- Added provider plugin-state endpoints plus redacted config previews, validation, and backup actions before risky config edits.

### Desktop Release Hardening

- Document and/or implement macOS signing and notarization path.
- Keep unsigned macOS warning guidance visible until signing is complete.
- Verify `.exe`, `.dmg`, and AppImage artifact versions against package version and bundled Pixcode dependency.
- Added `npm run smoke:v138-desktop` to verify package version alignment, artifact naming, AppImage coverage, DMG Gatekeeper helper packaging, and unsigned macOS guidance.

### Diagnostics And Health

- Add a diagnostics panel for provider health, active runs, WebSocket state, notification channel status, and recent errors.
- Add copyable diagnostics bundles with secret redaction.
- Prefer manual refresh and cached provider health over expensive repeated checks.
- Added protected `/api/diagnostics` server bundle with runtime, version, WebSocket, notification, credential-state, and redacted environment data.
- Added Settings → Diagnostics with manual refresh, provider health, WebSocket count, recent errors, and copyable redacted bundle.
- Added `npm run smoke:v138-diagnostics` to prevent token/secret leakage in diagnostics output.
- Added `npm run smoke:v138-completion` to verify the full v1.38 issue completion surface before closing issues.

## Verification Map

- Remote mode: local/remote mode persistence, remote health banner, login/register/pairing guard
- API: API-key create/list project -> provider run -> result fetch smoke
- Telegram: command routing, callback routing, language, project/session/provider/model switching
- Taskmaster: create -> dispatch -> progress -> completion/failure state
- Provider plugins: sample config discovery/parsing and secret redaction
- Desktop: desktop package version alignment and artifact checklist
- Diagnostics: health aggregation and secret redaction
