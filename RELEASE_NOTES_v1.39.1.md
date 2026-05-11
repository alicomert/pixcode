# Pixcode v1.39.1

Pixcode v1.39.1 is a layout hotfix for the chat and orchestration screens.

## Fixed

- Chat composer stays pinned to the bottom of the chat frame without depending on the old Command Center rail.
- Chat messages keep the scrollable area above the fixed composer.
- Orchestration keeps a stable full-height frame so mobile/tablet scrolling is not blocked by nested panes.
- Command Center is now a normal top navigation item named **Changes**.
- Quick Settings no longer owns the Command Center enable/disable toggle.

## Verification

- `node scripts/smoke/changes-panel-layout.mjs`
- `node scripts/smoke/chat-composer-fixed-layout.mjs`
- `node scripts/smoke/orchestration-mobile-scroll.mjs`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `git diff --check`
