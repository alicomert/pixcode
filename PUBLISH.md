# Publishing Pixcode to npm

Step-by-step guide for publishing `@pixelbyte-software/pixcode` from a Linux server.

## Prerequisites (one-time setup)

### 1. Node.js 22+ installed

```bash
node --version   # v22.x or newer
npm --version    # 10.x or newer
```

If missing, install from [nodejs.org](https://nodejs.org/) or via `nvm`:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 22
nvm use 22
```

### 2. Native build toolchain

The repo uses native modules (`better-sqlite3`, `bcrypt`, `node-pty`) that compile against Node headers. On Debian/Ubuntu:

```bash
sudo apt-get install -y build-essential python3 pkg-config
```

### 3. npm login (token auth, no browser)

Generate a **Granular Access Token** scoped to the `@pixelbyte-software` organisation:

1. Visit <https://www.npmjs.com/settings/pixelbyte-software/tokens>.
2. Click **Generate New Token → Granular Access Token**.
3. Permissions: **Read and write** for `@pixelbyte-software/*`.
4. Expiration: choose a short window (30-90 days); regenerate per release if you want maximum safety.
5. Copy the token — you will not see it again.

On the Linux server:

```bash
# Temporary: only for the current shell session. Safer than writing to disk.
export NPM_TOKEN="npm_XXXXXXXXXXXXXXXXXXXX"

# Tell npm to read the token from the env var.
cat > ~/.npmrc <<'EOF'
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
EOF

# Verify.
npm whoami   # prints your npm user
npm org ls pixelbyte-software   # should list you as owner
```

> **Rotate tokens after each publish** if you want zero exposure. `npm token revoke <token-id>` kills it immediately from <https://www.npmjs.com/settings/pixelbyte-software/tokens>.

## Release workflow

The repo ships with [release-it](https://github.com/release-it/release-it) configured in `.release-it.json`. It bumps the version, updates `CHANGELOG.md` from conventional-commit history, builds, creates a git tag, creates a GitHub release, and runs `npm publish` — all in one go.

Constraints baked into `.release-it.json`:

- `requireBranch: "main"` — the current branch must be `main`.
- `requireCleanWorkingDir: true` — no uncommitted changes.
- `before:init` hook runs `npm run build` before anything else.
- `npm.publishArgs: ["--access public"]` — scoped package is published publicly.

### Option A — guided release with `release-it`

```bash
# 1. Make sure you are on main with no local changes.
git checkout main
git pull origin main
git status   # must say "nothing to commit, working tree clean"

# 2. Install deps (or refresh them — fresh lockfile on every checkout is fine).
npm install

# 3. Sanity checks before releasing.
npm run typecheck
npm run lint
npm run build

# 4. Run release-it.
# Use --dry-run first to preview every step it would take.
npm run release -- --dry-run

# If the dry run looks right, run it for real:
npm run release
```

release-it will prompt interactively for:

- **Version bump** — patch / minor / major / custom. Since this is the first publish of the new package name, choose `minor` (1.29.5 → 1.30.0) or `major` (1.29.5 → 2.0.0) depending on how you want to version.
- **Tag & push confirmation** — type `y` to accept.
- **npm publish confirmation** — type `y` to accept.
- **GitHub release confirmation** — needs `GITHUB_TOKEN` env var set (see below).

For the GitHub release step, create a Personal Access Token with `repo` scope at <https://github.com/settings/tokens/new>, then:

```bash
export GITHUB_TOKEN="ghp_XXXXXXXXXXXXXXXX"
npm run release
```

If you don't want the GitHub release step, pass `--no-github.release`:

```bash
npm run release -- --no-github.release
```

### Option B — manual publish (skipping release-it)

Use this if you want full control or if release-it misbehaves.

```bash
# 1. Ensure clean main.
git checkout main
git pull origin main

# 2. Bump the version yourself.
npm version minor   # or: npm version patch / major
# This edits package.json, commits the change with the message "v1.30.0", and creates a tag.

# 3. Push.
git push origin main --follow-tags

# 4. Build (required before publish because package.json points to dist/ and dist-server/).
npm run build

# 5. Preview the package content.
npm pack --dry-run
# Confirm the output lists server/, shared/, dist/, dist-server/, scripts/, README.md.
# If dist/ or dist-server/ is empty, the build step failed — re-run it.

# 6. Publish.
npm publish --access public

# If you have 2FA on "auth and write" mode, npm will prompt for a one-time code.
# "auth only" mode does not prompt.
```

### Post-publish checks

```bash
# Metadata fetch from the registry — confirms the new version is live.
npm view @pixelbyte-software/pixcode

# List only the versions.
npm view @pixelbyte-software/pixcode versions --json

# Install globally to verify the binary.
npm install -g @pixelbyte-software/pixcode
pixcode --version
pixcode status

# Clean up.
npm uninstall -g @pixelbyte-software/pixcode
```

Public package page: <https://www.npmjs.com/package/@pixelbyte-software/pixcode>

## First-time publish checklist

Before the very first publish of `@pixelbyte-software/pixcode`:

- [ ] `package.json` name is `@pixelbyte-software/pixcode` (not `pixcode`).
- [ ] `package.json` has `"publishConfig": { "access": "public" }`.
- [ ] Current branch is `main` and has all the changes you want shipped.
- [ ] Working tree is clean (`git status`).
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run build` succeeds and produces `dist/` and `dist-server/server/cli.js`.
- [ ] `npm pack --dry-run` shows only the intended files (no `.env`, no `node_modules`).
- [ ] `npm whoami` shows a user that has `owner` or `publish` permission on the `@pixelbyte-software` org.
- [ ] GitHub repo `alicomert/pixcode` has a release branch `main` that matches the local tree.

Only after all boxes tick: run the release.

## Updating an already published package

Subsequent releases follow the same workflow. Conventional-commits decide the bump:

| Commit type | Bump |
|---|---|
| `feat:` | minor |
| `fix:` | patch |
| `perf:` / `refactor:` | patch |
| `feat!:` or `BREAKING CHANGE:` | major |

If you use `release-it` with `@release-it/conventional-changelog` (already configured), the bump is derived automatically from the commits since the last tag; you just confirm.

## In-app update mechanism

The running server exposes `POST /api/system/update` (authenticated) which triggers:

- `git install mode` → `git checkout main && git pull && npm install` in the repo directory.
- `npm install mode` → `npm install -g @pixelbyte-software/pixcode@latest` in the user's home directory.
- `IS_PLATFORM mode` → `npm run update:platform` (requires an `update-platform.sh` script in the project root; not shipped by default).

The frontend `VersionUpgradeModal` reads the install mode from `GET /health` and renders the appropriate command. The `Check for updates` badge in the sidebar polls `https://api.github.com/repos/alicomert/pixcode/releases/latest` every few minutes (see `src/hooks/useVersionCheck.ts`) — so **any release you cut with the `v` tag prefix will be surfaced to existing installations automatically**. Tag format is `v${version}` (enforced by `.release-it.json`).

## Emergency: unpublish or deprecate

npm allows unpublish only within 72 hours of publish and only when no other package depends on that exact version. Otherwise, deprecate the version instead:

```bash
# Hide a broken version from new installs.
npm deprecate '@pixelbyte-software/pixcode@1.30.1' 'Critical bug — use 1.30.2'

# Unpublish within 72h (use with care).
npm unpublish @pixelbyte-software/pixcode@1.30.1
```

## Token hygiene

- Never commit a token to git. `.gitignore` does not cover `~/.npmrc`, but `~/.npmrc` lives in your home directory, not the repo.
- If a token leaks anywhere (issue comment, chat, screenshot, log file, pastebin): **revoke it immediately** at <https://www.npmjs.com/settings/pixelbyte-software/tokens> and generate a new one.
- Prefer **Granular Access Tokens** scoped to `@pixelbyte-software/*` over Legacy Automation tokens — they cannot be used for anything outside the org.
- For CI publishing, store the token as a repository secret (`NPM_TOKEN`) and never echo it in logs.
