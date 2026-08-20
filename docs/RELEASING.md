# Pixcode release guide

This guide documents the release path for the root npm package and the Electron
wrapper. Release from a clean `main` checkout after the stabilization changes
have been reviewed; do not stage an unrelated worktree with `git add .`.

## Credential rules

- Never use an npm token pasted into chat, an issue, a screenshot, or a shell
  command. Treat it as exposed and revoke/rotate it at npm.
- Authenticate npm through a local `npm login` session or a short-lived CI
  secret such as `NPM_TOKEN`/`NODE_AUTH_TOKEN`. Do not put a token in a command
  argument or commit it to `.npmrc`.
- Keep GitHub authorization separate from npm authorization. The release
  workflow uses its repository secret for tags/releases and its npm secret for
  publishing.

## Preflight

Pixcode 1.64.x requires Node.js 22 or newer. From a clean checkout run:

```bash
npm ci
npm run lint
npm run typecheck
npm run build
node scripts/generate-files-manifest.mjs
node scripts/verify-package-assets.mjs
npm run smoke:prepared-publish
npm audit --omit=dev --audit-level=moderate
npm pack --dry-run --ignore-scripts
```

The package preview must contain the current localized READMEs, the responsive
screenshots, the terminal-only bundle, and the compiled `dist-server` output.

## Publishing the prepared 1.64.2 package

The repository is intentionally prepared at `1.64.2`. Before publishing, check
that the registry does not already contain that version and that the local npm
session belongs to the package owner:

```bash
npm whoami --registry https://registry.npmjs.org/
npm view @pixelbyte-software/pixcode@1.64.2 version
```

After the preflight passes, publish without putting credentials in the command.
For this already-prepared 1.64.2 snapshot, use the version-preserving command;
it refuses a non-`main` branch, a dirty worktree, missing npm login, an existing
registry version, or an unverifiable publish. It always targets the public npm
registry, even when a user's global `.npmrc` points somewhere else:

```bash
npm run publish:prepared -- --version 1.64.2
```

The command runs the package prepublish checks before publishing and verifies
the resulting registry metadata. Use `npm run release` only for a future
release where release-it is intentionally expected to calculate a new version.

Only after the registry confirms the version exists, refresh the desktop lockfile
from the real published tarball. Do not hand-edit its integrity hash:

```bash
npm --prefix desktop install --package-lock-only --ignore-scripts --no-audit --no-fund
npm --prefix desktop ci --ignore-scripts --no-audit --no-fund
npm --prefix desktop audit --omit=dev --audit-level=moderate
npm --prefix desktop run dist:win -- --dir
```

The desktop package is private, but its dependency must match the exact root
package version. The release hooks in `.release-it.json` keep that metadata and
`files-manifest.json` synchronized for future version bumps.

## GitHub Actions

The manual `workflow_dispatch` release job runs on Node 22 and reads its GitHub
and npm credentials from repository secrets. Review the increment before running
it: a checkout already at `1.64.2` will normally calculate a later patch version.
For a prepared version, publish the exact package once, then use the matching
tag/release workflow rather than accidentally creating a second version.

## PR #116 contributor note

The Spanish README was contributed by `@webbrain-one`. The local README already
credits the contribution. If GitHub authorization is available, this short
comment can be posted on PR #116:

> @webbrain-one, muchas gracias por preparar la traducción española de Pixcode
> en el PR #116. Hemos integrado tu trabajo y lo hemos actualizado a la interfaz,
> API y capturas actuales para que siga siendo útil en v1.64.x. Tu aporte ayuda a
> que más personas puedan usar Pixcode en español. ¡Gracias por contribuir!
