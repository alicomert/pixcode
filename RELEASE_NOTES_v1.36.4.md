# Pixcode v1.36.4

Pixcode 1.36.4 is a stability release for the new remote-control and workspace split-panel systems. It focuses on making the live server, Telegram control, update UX, orchestration summaries, shell behavior, and file editing layout predictable before the next larger feature release.

## Highlights

- Telegram remote control now has a real control center: projects, provider selection, model selection, workflows, runs, CLI install/auth help, settings, language, and progress mode can be controlled from the bot.
- Telegram commands now stay in the control system. `/start`, `/help`, `/menu`, bot-suffixed commands, `/`, and unknown slash commands no longer get forwarded as normal agent prompts.
- Telegram inline menus update in place after button selections, so the chat does not fill with a new menu message for every click.
- The systemd daemon now prefers the compiled `dist-server/server/cli.js` entrypoint when available, preventing source-mode alias resolution crashes on production servers.
- The app server now serves the built Pixcode UI at `/` before static docs, so `http://host:3001/` opens the app while the GitHub Pages static site remains publishable from `public/`.
- The version notes modal no longer reopens on every page load when the current version and latest release are already the same.
- Agent Team summaries no longer include raw `agent:`/`user:` prefixes or internal workflow/process text in user-facing output.
- Shell manual disconnects are respected. Closing the shell connection does not immediately auto-reconnect.
- Files split view keeps the primary chat or orchestration surface visible while file contents open inside the Files side panel, with the side panel capped at half of the workspace.

## Verification

- `npm run typecheck`
- `npm run build`
- `node scripts/smoke/telegram-control.mjs`
- `node scripts/smoke/daemon-entrypoint.mjs`
- `node scripts/smoke/static-root-routing.mjs`
- `node scripts/smoke/version-modal-autoshow.mjs`
- `node scripts/smoke/orchestration-user-facing-output.mjs`
- `node scripts/smoke/shell-manual-disconnect.mjs`
- `node scripts/smoke/side-panel-editor-layout.mjs`
