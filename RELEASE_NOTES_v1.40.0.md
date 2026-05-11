# Pixcode v1.40.0

Pixcode 1.40.0 adds a first-class Live View tab for running and sharing the selected project.

## Added

- `Live View` / `Canlı Görünüm` now appears after `Changes` in the project tab bar.
- Pixcode detects runnable project entry points automatically: package dev/start scripts, Vite, Next.js, Nuxt, Astro, Django, FastAPI, Flask, Go, Rust, PHP, and static `index.html`.
- Static HTML projects are served directly; app projects get a managed local runner with logs, start/stop controls, and a custom command override.
- Running Live Views expose a `/live/<share-id>/` path. If External Access has an active cloudflared/ngrok tunnel, the UI shows the public tunnel share URL; otherwise it shows the local Pixcode URL.

## Verified

- `node scripts/smoke/live-view-integration.mjs`
- `node scripts/smoke/chat-composer-fixed-layout.mjs`
- `node scripts/smoke/changes-panel-layout.mjs`
- `node scripts/smoke/orchestration-mobile-scroll.mjs`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm pack --dry-run --ignore-scripts`
