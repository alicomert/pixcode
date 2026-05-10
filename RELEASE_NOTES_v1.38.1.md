# Pixcode v1.38.1

Pixcode 1.38.1 is the patch release that completes the v1.38 remote operations issue set. The initial 1.38.0 release published the plan and hardening base; this patch ships the completed remote/API/Telegram/Taskmaster/provider/diagnostics implementation and closes the v1.38 epic.

<!-- pixcode:issue-progress -->
- [x] #15 First-run local/remote connection mode and API URL pairing
- [x] #16 Complete Pixcode control surface through API keys
- [x] #17 Telegram feature parity for remote control
- [x] #18 Taskmaster as the shared execution queue for CLI agents
- [x] #19 CLI plugin and external tool configuration management
- [x] #20 Desktop installer signing, artifact, and update recovery hardening
- [x] #21 Run diagnostics and provider health visibility
<!-- /pixcode:issue-progress -->

## Highlights

- First-run setup now asks whether Pixcode controls this computer directly or connects to a remote Pixcode server, with redacted API URL/key persistence.
- API automation now has a protected manifest and OpenAPI fragment with stable groups for projects, sessions, providers, orchestration, Taskmaster, notifications, files, git, settings, updates, diagnostics, remote control, Telegram, and plugins.
- `px_` API keys now carry scope metadata while staying revocable and compatible with existing REST/WebSocket auth paths.
- Telegram control now exposes sessions, new-chat flow, provider/model/workflow/task paths, and errors-only progress mode.
- Taskmaster now has queue/detail automation endpoints and dispatch metadata for provider, model, permission mode, fallback provider, and worker slot.
- Provider configuration now exposes plugin-state summaries, redacted previews, validation, and safe backups before config edits.
- Settings now includes a Diagnostics panel with manual refresh, provider health, WebSocket state, active runs, recent redacted errors, and copyable support bundles.

## Verification

- `npm run smoke:v138-issues`
- `npm run smoke:v138-desktop`
- `npm run smoke:v138-diagnostics`
- `npm run smoke:v138-completion`
- `npm run smoke:telegram-control`
- `node scripts/smoke/taskmaster-execution-telegram.mjs`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
