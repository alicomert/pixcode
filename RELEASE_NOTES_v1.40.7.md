# Pixcode v1.40.7

This hotfix keeps orchestration aligned with the live chat model catalog and prevents stale OpenCode free-model ids from breaking agent teams.

## Fixed

- Orchestration now uses the same backend-backed live model catalog as chat.
- OpenCode live model refreshes no longer merge removed static Zen freebies back into the picker.
- Saved orchestration agents are sanitized before run start; if a model rotated out, Pixcode chooses the closest available live/free model instead of submitting a known-bad id.
- The workflow runner validates provider models again on the backend before A2A submit, covering Telegram/API/orchestration callers as well as the web UI.
- Workflow prompts now put a labeled original user request before workspace metadata so debate/team agents answer the actual request, not the "Pixcode orchestration execution context" header.

## Verification

- `node scripts/smoke/provider-models-opencode-live.mjs`
- `node scripts/smoke/orchestration-model-sync.mjs`
- `npm run typecheck`
- `npm run lint`
