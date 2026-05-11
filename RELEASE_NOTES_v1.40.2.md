# Pixcode v1.40.2

This hotfix makes Live View process failures visible and actionable.

## Fixes

- Failed PHP, Node, React, Vite, Next.js, and custom-command Live View sessions no longer appear as a generic `Live View session not found` page.
- `/live/<share-id>/` now renders a diagnostic page when the runner is starting, stopped, errored, or unreachable.
- Diagnostic responses include:
  - attempted command
  - upstream URL and port
  - process exit/spawn details
  - recent runner logs
  - framework-specific suggestions
- The Live View panel now shows the actual runner error and latest logs directly.
- Failed Live View sessions now expose a Restart action without forcing users to stop and re-open the panel.

## PHP note

For PHP projects, Pixcode starts:

```bash
php -S 127.0.0.1:<port> -t .
```

If PHP is not installed or not available in `PATH`, the diagnostic page will show the exact `spawn php ENOENT` style error and suggest checking `php --version` on the same machine.

## Verification

- `node scripts/smoke/live-view-diagnostics.mjs`
- `node scripts/smoke/live-view-integration.mjs`
- `node --import /root/pixcode/node_modules/tsx/dist/esm/index.mjs scripts/smoke/chat-message-timeline-order.mjs`
- `node scripts/smoke/changes-panel-layout.mjs`
- `node scripts/smoke/chat-composer-fixed-layout.mjs`
- `node scripts/smoke/orchestration-mobile-scroll.mjs`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `HUSKY=0 NPM_CONFIG_CACHE=/tmp/npm-cache npm pack --dry-run --ignore-scripts`
