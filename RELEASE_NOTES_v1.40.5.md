# Pixcode v1.40.5

Pixcode 1.40.5 fixes Live View runtime startup on machines where desktop apps do not inherit the same `PATH` as the terminal.

## Fixes

- PHP Live View now always uses Pixcode's managed FrankenPHP runtime. It no longer switches to an external `php` binary when one happens to exist.
- JavaScript package-script projects now use a Pixcode-managed npm runner when needed, so Vite, React, Next.js, Nuxt, Astro, and similar projects do not fail with `npm is not available on this machine`.
- The Live View panel now shows a clear "Preparing runtime" state while Pixcode downloads and installs a local runtime on first use.
- Managed runtime extraction now uses Pixcode's Node dependency instead of relying on a host `tar` executable.

## Verification

- `node scripts/smoke/live-view-integration.mjs`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `HUSKY=0 NPM_CONFIG_CACHE=/tmp/npm-cache npm pack --dry-run --ignore-scripts`
