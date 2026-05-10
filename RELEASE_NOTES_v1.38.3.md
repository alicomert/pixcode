# Pixcode v1.38.3

Pixcode 1.38.3 is a Mac/runtime reliability patch for the v1.38 desktop and orchestration release line.

## What changed

- macOS desktop now hydrates the server runtime PATH from the user's login shell, Pixcode-managed CLI bin, common Node manager paths (`nvm`, `volta`, `asdf`), Homebrew, and system bin paths before checking or installing CLIs.
- TaskMaster install/status checks no longer depend on a bare `npm` or `which` being available in Electron's minimal GUI PATH.
- Provider status checks now honor resolved `CODEX_CLI_PATH`, `CURSOR_CLI_PATH`, `GEMINI_CLI_PATH`, and `QWEN_CLI_PATH`, preventing installed CLIs from showing as missing on macOS.
- Qwen and OpenCode sessions now participate in project refresh/change detection, so active and previous chats stay visible without switching away and back.
- Existing session selection now persists the actual session provider before navigation, keeping message routing aligned for non-Claude sessions.
- Orchestration now treats `external_directory` permission auto-rejections as recoverable workflow output, upgrades selected host workspaces out of the default auto-reject mode, and builds a readable final report from completed agent outputs if the final reporter hits a permission boundary.
- macOS tray/menu-bar icon is resized to a native template image to avoid overflow.
- The multi-worker `+` entry now sits beside the chat composer send button, with max-4 worker controls and cleaner split-panel transitions.

## Verification

- `node scripts/smoke/mac-desktop-runtime.mjs`
- `node scripts/smoke/chat-session-provider-pools.mjs`
- `node scripts/smoke/orchestration-permission-fallback.mjs`
- `node scripts/smoke/multi-project-ui.mjs`
- `node scripts/smoke/desktop-tray-icon.mjs`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
