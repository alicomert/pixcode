# Pixcode v1.40.9

This hotfix targets the Live View and notification regressions reported after v1.40.8.

## Fixed

- Vite/React Live View installs project dependencies with dev dependencies included before running `npm run dev`, preventing the Windows `'vite' is not recognized` failure after a seemingly successful install.
- Managed PHP Live View prepends the FrankenPHP runtime directory and `ext` directory to the spawned process PATH, fixing Windows `3221225781` / DLL lookup failures that could still happen after runtime extraction.
- Chat completion notifications no longer reuse a permanent local notification id for the same session, so future completed runs can notify again.
- Orchestration runs now carry the authenticated user id and send completion/failure notifications through the same notification pipeline as chat runs.

## Verification

- `node scripts/smoke/live-view-integration.mjs`
- `node scripts/smoke/notification-center.mjs`
- `node scripts/smoke/desktop-native-notifications.mjs`
- `node scripts/smoke/orchestration-runtime-guards.mjs`
- `node scripts/smoke/orchestration-user-facing-output.mjs`
- `npm run typecheck`
- `npm run lint`
