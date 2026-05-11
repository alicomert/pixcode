# Pixcode v1.40.1

This hotfix stabilizes the Live View rollout and fixes a chat timeline ordering bug reported after tool-heavy OpenCode sessions.

## Fixes

- Live View now opens as the same split/full side panel pattern used by Files, Source Control, and Changes.
- Stopping Live View clears the active iframe immediately, so the panel no longer shows a stale `/live` session error.
- Live View now includes editable preview resolution controls:
  - Desktop: 1440 x 900
  - Tablet: 768 x 1024
  - Mobile: 390 x 844
  - Custom width and height fields
- Chat messages are normalized by timeline before rendering, preventing older tool parameters from staying pinned below later assistant replies.

## Verification

- `node scripts/smoke/live-view-integration.mjs`
- `node --import tsx scripts/smoke/chat-message-timeline-order.mjs`
- `node scripts/smoke/changes-panel-layout.mjs`
- `node scripts/smoke/chat-composer-fixed-layout.mjs`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `HUSKY=0 NPM_CONFIG_CACHE=/tmp/npm-cache npm pack --dry-run --ignore-scripts`
