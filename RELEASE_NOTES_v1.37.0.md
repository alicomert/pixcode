# Pixcode v1.37.0

Pixcode 1.37.0 ships the v1.37 orchestration reliability and task-foundation package. This release focuses on making long-running agent work understandable, resumable, and controllable from the web UI and Telegram.

<!-- pixcode:issue-progress -->
- [x] #6 Strict orchestration handoff with compact packets
- [x] #7 Reliable notification center with browser, desktop, and Telegram fallbacks
- [x] #8 Focused orchestration execution dashboard
- [x] #9 Chat hydration and realtime message visibility fixes
- [x] #10 Multi-project worker slots from the prompt input
- [x] #11 Optional Taskmaster setup during first account setup
- [x] #12 Taskmaster execution across CLI providers and Telegram
- [x] #13 Update progress mapped to GitHub issues and tasks
<!-- /pixcode:issue-progress -->

## Highlights

- Agent Team now has a strict handoff foundation. Internal init/compact packets carry what the previous agent did, evidence, touched areas, risks, and next-agent context without leaking raw workflow text into the user-facing output.
- Orchestration now shifts into an execution-focused dashboard while a workflow is running, so users can see progress instead of staring at the setup panel.
- Chat session hydration is more reliable. Messages already available from the REST API can appear without switching chats, with dedupe and refresh behavior around focus/visibility changes.
- Pixcode now has an in-app notification center backed by WebSocket events, with Telegram and desktop/browser channel preferences for completion, failure, update, and agent-response events.
- First-run onboarding can guide users into the Taskmaster task system, including install status and a persisted setup/skip choice.
- Taskmaster tasks can be listed and launched from Telegram through Pixcode orchestration using selected CLI providers and models.
- The chat composer has multi-worker slots for up to four parallel project/provider/model runs.
- Update screens can show GitHub issue-backed progress from bundled release metadata, avoiding repeated API calls and rate-limit problems.

## Verification

- `node scripts/smoke/strict-handoff-compact.mjs`
- `node scripts/smoke/orchestration-execution-dashboard.mjs`
- `node scripts/smoke/orchestration-user-facing-output.mjs`
- `node scripts/smoke/chat-realtime-hydration.mjs`
- `node scripts/smoke/chat-session-state.mjs`
- `node scripts/smoke/notification-center.mjs`
- `node scripts/smoke/taskmaster-onboarding.mjs`
- `node scripts/smoke/taskmaster-execution-telegram.mjs`
- `node scripts/smoke/multi-worker-slots.mjs`
- `node scripts/smoke/update-issue-progress.mjs`
- `node scripts/smoke/shell-manual-disconnect.mjs`
- `node scripts/smoke/side-panel-editor-layout.mjs`
- `node scripts/smoke/telegram-control.mjs`
- `node scripts/smoke/update-ux.mjs`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
