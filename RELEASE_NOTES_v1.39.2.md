# Pixcode v1.39.2

Pixcode v1.39.2 fixes the remaining blank right-side space left after moving Command Center into the new **Changes** panel.

## Fixed

- Chat now fills the available content area when Changes is closed.
- Orchestration now fills the available content area when Changes is closed.
- The fixed chat composer no longer depends on the removed Command Center rail wrapper.

## Verification

- `node scripts/smoke/changes-panel-layout.mjs`
- `node scripts/smoke/chat-composer-fixed-layout.mjs`
- `node scripts/smoke/orchestration-mobile-scroll.mjs`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `git diff --check`
- `npm pack --dry-run --ignore-scripts`
