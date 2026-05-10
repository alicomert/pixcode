# Pixcode v1.38.0

Pixcode 1.38.0 publishes the v1.38 remote-control work plan and ships the first release-hardening pieces needed for that path: issue-backed release progress, desktop installer checks, and a redacted diagnostics endpoint.

<!-- pixcode:issue-progress -->
- [ ] #15 First-run local/remote connection mode and API URL pairing
- [ ] #16 Complete Pixcode control surface through API keys
- [ ] #17 Telegram feature parity for remote control
- [ ] #18 Taskmaster as the shared execution queue for CLI agents
- [ ] #19 CLI plugin and external tool configuration management
- [x] #20 Desktop installer signing, artifact, and update recovery hardening
- [ ] #21 Run diagnostics and provider health visibility
<!-- /pixcode:issue-progress -->

## Highlights

- v1.38 is now tracked through GitHub issues #15-#22, including a single epic for the remote API, Telegram, Taskmaster, provider-plugin, desktop, and diagnostics work.
- Release tracking now stores real issue numbers in `RELEASE_TRACKING_v1.38.md`, so update surfaces can display issue-backed progress metadata.
- The desktop release path has automated smoke coverage for version alignment, installer artifact naming, AppImage coverage, unsigned macOS Gatekeeper guidance, and the bundled `Fix Gatekeeper.command` helper.
- Pixcode now exposes a protected `/api/diagnostics` bundle with runtime, version, WebSocket client count, notification state, credential presence, memory usage, and redacted environment data.
- Diagnostics smoke coverage verifies that token and secret values do not leak into the support bundle.

## Verification

- `npm run smoke:v138-issues`
- `npm run smoke:v138-desktop`
- `npm run smoke:v138-diagnostics`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
