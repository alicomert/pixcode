# Pixcode v1.40.4

Live View now starts moving runtime setup into Pixcode itself. PHP projects no longer need users to manually install PHP or edit PATH before trying a preview.

## New

- Added Pixcode-managed runtimes under the user profile, beginning with a local FrankenPHP runtime for PHP Live View previews.
- PHP projects remain runnable when `php` is missing; Pixcode selects its managed PHP runner and prepares it on demand.
- Managed runtime selection handles Windows, macOS, and Linux assets, including Windows zip archives and macOS/Linux tarballs.

## Fixes

- Replaced technical PHP PATH guidance with product-level "Pixcode will prepare the runtime" messaging.
- Avoided Windows shell quoting problems when launching Pixcode-managed `.exe` runtimes from absolute paths.

## Verification

- `node scripts/smoke/live-view-integration.mjs`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `HUSKY=0 NPM_CONFIG_CACHE=/tmp/npm-cache npm pack --dry-run --ignore-scripts`
