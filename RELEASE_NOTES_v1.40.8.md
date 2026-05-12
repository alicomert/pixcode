# Pixcode v1.40.8

This hotfix fixes the remaining Live View managed runtime failures across desktop/server installs and includes the orchestration model-catalog fix prepared in 1.40.7. The PHP and package-runner fixes are intentionally cross-platform for Windows, macOS, and Linux.

## Fixed

- PHP Live View no longer installs FrankenPHP as a single copied `.exe`; Pixcode now preserves the extracted runtime directory so required DLL/sidecar files stay next to the executable.
- FrankenPHP runtime selection still follows the current OS and CPU architecture, covering Windows, macOS, and Linux builds instead of hardcoding a Windows-only path.
- Existing incomplete FrankenPHP installs are detected as broken and treated as missing, so Pixcode can reinstall them automatically instead of repeatedly exiting with `3221225781`.
- Vite/React Live View now prepares project dependencies before `npm run dev` when `node_modules` or the expected local binary is missing.
- Live View logs now show dependency preparation before starting package-script projects.
- Orchestration uses the same live provider model catalog as chat and falls back from stale saved OpenCode model ids before A2A execution.

## Verification

- `node scripts/smoke/live-view-integration.mjs`
- `node scripts/smoke/provider-models-opencode-live.mjs`
- `node scripts/smoke/orchestration-model-sync.mjs`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `HUSKY=0 NPM_CONFIG_CACHE=/tmp/npm-cache npm pack --dry-run --ignore-scripts`
