# Pixcode v1.38.2

Pixcode 1.38.2 fixes desktop OS notifications for installer users. Update notifications already used the Electron native notification channel, but agent/task notifications were still going through the browser/service-worker path. This patch gives desktop installs the same native Windows/macOS/Linux notification path for normal Pixcode work.

<!-- pixcode:issue-progress -->
- [x] Desktop native notifications for agent/task events
- [x] Browser/service-worker fallback preserved for npm and web installs
- [x] Desktop notification bridge smoke coverage
<!-- /pixcode:issue-progress -->

## Highlights

- Desktop installs now expose a safe preload bridge from the renderer to Electron's native notification API.
- Agent, task, permission-required, stopped-run, and failed-run notifications try the native desktop bridge before falling back to browser notifications.
- Existing notification preferences and duplicate suppression still apply.
- Web/PWA/server installs keep the previous service-worker and browser notification behavior.

## Verification

- `node scripts/smoke/desktop-native-notifications.mjs`
- `node scripts/smoke/notification-center.mjs`
- `npm run smoke:v138-desktop`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
