# Pixcode Desktop

Electron wrapper that packages [Pixcode](https://github.com/alicomert/pixcode) into native installers for Windows, macOS, and Linux. One download, no Node install required, runs in the system tray with optional auto-start.

This directory is an isolated sub-package inside the main Pixcode repo. It has its own `package.json` with Electron + electron-builder as dev dependencies, so `npm install` at the repo root (for web/server development) never pulls them. The CI workflow at `.github/workflows/desktop.yml` is the only place that installs these deps, and only on matrix runners when building releases.

## Downloads

Every Pixcode release includes platform installers alongside the npm tarball. Find them on the Releases page:

- https://github.com/alicomert/pixcode/releases/latest

File names:

- **Windows** — `Pixcode-Setup-X.Y.Z.exe` (per-user install, no admin required)
- **macOS** — `Pixcode-X.Y.Z-arm64.dmg` (Apple Silicon) or `Pixcode-X.Y.Z-x64.dmg` (Intel)
- **Linux** — `Pixcode-X.Y.Z-x64.AppImage` (universal) or `Pixcode-X.Y.Z-x64.deb` (Debian/Ubuntu)

First launch opens your default browser at `http://localhost:3001` and drops a tray icon. Right-click the tray for: Open Pixcode · Start at Login · Restart server · Quit.

## How it works

- A thin Electron main process boots the Pixcode server as a child (via `fork(.../pixcode/dist-server/server/cli.js, ['start', '--no-daemon'])`).
- No `BrowserWindow` — the UI opens in the user's real browser.
- Tray icon is the only persistent UI surface.
- "Start at Login" toggles via Electron's `setLoginItemSettings` on Windows/macOS; on Linux it writes `~/.config/autostart/pixcode.desktop` by hand.

## Updates (two-tier)

1. **Product updates (95%+)** — when a new `@pixelbyte-software/pixcode` version ships, the installed Electron wrapper downloads only the ~4 MB npm tarball and swaps it into its writable runtime dir. No installer re-download, no user action beyond clicking the "Update available" button in the UI.
2. **Wrapper updates (rare)** — when the Electron shell itself changes (tray menu, autostart mechanics, Electron version bump), `electron-updater` polls the GitHub Releases feed and prompts for a full installer re-download.

## Releases

Push a `vX.Y.Z` tag to the main Pixcode repo. The `.github/workflows/desktop.yml` workflow builds installers on Windows + macOS + Linux runners and attaches them to the matching release as assets. Same version number, same page as the npm tarball.

## Local development

```bash
cd desktop
npm install
npm start                 # runs electron . against the installed pixcode
npm run dist              # build the installer for your current OS
npm run dist:win          # build just Windows
npm run dist:mac          # build just macOS
npm run dist:linux        # build just Linux (AppImage + deb)
```

Build output lands in `desktop/dist-installer/`.

## Signing

Installers ship unsigned for now. Windows SmartScreen will show an "Unknown publisher" warning on first launch; macOS Gatekeeper may block `.app` launch until the user right-clicks → Open. These warnings go away once a code-signing certificate is attached (Authenticode for Windows, Apple Developer ID for macOS). Drop the signing env vars into the workflow secrets when ready — electron-builder picks them up automatically.

## License

AGPL-3.0-or-later (same as Pixcode).
