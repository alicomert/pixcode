# Pixcode v1.40.3

Live View now checks whether the detected project runtime is actually installed before it starts a process-backed preview.

## Fixes

- Detect missing PHP, Node package managers, Python, Go, Rust, and similar runner commands before launching Live View.
- Show a clear "Runner unavailable" message in the Live View panel when a project needs a runtime that is not available in `PATH`.
- Keep the detected framework, command, and setup guidance visible so users can install the runtime or provide a custom command with the full executable path.

## Verification

- `node scripts/smoke/live-view-integration.mjs`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `HUSKY=0 NPM_CONFIG_CACHE=/tmp/npm-cache npm pack --dry-run --ignore-scripts`
