# Pixcode v1.38.4

Pixcode 1.38.4 is a fast reliability patch for Command Center, non-git projects, mobile tunnel setup, and notification preferences.

<!-- pixcode:issue-progress -->
- [x] #23 Non-git projects should still show local AI file changes
- [x] #24 Command Center changed files should live beside the active chat, not buried in Quick Settings
- [x] #25 Mobile tunnel should guide install or provide a usable fallback when no tunnel binary exists
- [x] #26 Notification channels must respect the In-app center preference
<!-- /pixcode:issue-progress -->

## What changed

- Non-git folders now return a structured filesystem tracking status from `/api/git/status` instead of a scary Git failure. Pixcode snapshots local files and reports added, modified, and deleted files after the first baseline scan.
- Source Control now shows local file activity for non-git projects, so users do not need to run `git init` just to follow what an AI agent edited.
- Command Center changed files now appear beside the active chat or orchestration surface in a compact activity rail. New changes glow there without automatically stealing focus into the Files panel.
- Quick Settings keeps the Command Center toggle and a short status summary instead of being the main changed-files workspace.
- Use from mobile keeps LAN QR endpoints usable when no tunnel binary exists, and missing `cloudflared`/`ngrok` now shows install guidance instead of a generic failure.
- In-app alerts now respect the In-app center channel preference. Turning that channel off stops the in-app notification UI while desktop/browser and Telegram channels remain independent.
- Desktop release metadata now keeps the bundled `@pixelbyte-software/pixcode` dependency version aligned with the app version.

## Verification

- `node scripts/smoke/command-center-non-git.mjs`
- `node scripts/smoke/mobile-tunnel-guidance.mjs`
- `node scripts/smoke/notification-inapp-preference.mjs`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
