# Adding a new provider (CLI agent) to Pixcode

This is the checklist for wiring up a new coding-agent CLI (think: another Claude / Codex / Cursor / Gemini / Qwen). Follow it top to bottom and the new agent will show up everywhere it needs to — auth status, install flow, login modal, chat provider picker, settings tabs, config editor, permissions, MCP servers, Telegram notifications, and the cross-platform binary resolver.

> **Rule of thumb:** every list below is the *complete* set of touch points. If you skip one, the provider will work in 95% of the UI and silently break in one specific screen. It's worth doing all of them in a single PR.

---

## Prerequisites

Before you start, confirm the CLI:

- Is distributed as an npm package (e.g. `@scope/cli-name`) — otherwise the sandboxed installer (`~/.pixcode/cli-bin/`) can't pick it up, and you'll need a manual-install story instead.
- Exits non-zero when invoked without credentials, and has a `<cli> login` flow that either opens a browser or prints a device code. If login is embedded in a TUI that paints ANSI on every frame, steal Qwen's pattern (`qwen auth` subcommand, not the bare TUI).
- Reads its config from `~/.<name>/settings.json` (or similar) and an optional `.env` in the same folder. If the layout is weirder than that, the provider registry lets you map arbitrary paths — see step 7.

Pick a **short id** (e.g. `qwen`) that will be used as:

- The URL segment in API routes (`/api/providers/qwen/...`)
- The folder name under `server/modules/providers/list/<id>/`
- The key everywhere the frontend switches on provider (`provider === 'qwen'`)

Lower-case, no punctuation, no spaces. Stay consistent.

---

## Backend

### 1. Create the provider adapter

Path: `server/modules/providers/list/<id>/`

Copy an existing provider folder (Qwen is the freshest and smallest reference) and rename the files:

```
<id>-auth.provider.ts       # implements IProviderAuth (checkInstalled + getStatus)
<id>-mcp.provider.ts        # extends shared/mcp/mcp.provider.ts
<id>-sessions.provider.ts   # implements session listing + resume
<id>.provider.ts            # aggregates the above via registry.registerProvider
```

Key things to change from the copy:

- `checkInstalled()` — `spawn.sync('<cli>', ['--version'], …)`; use the exact binary name as `cross-spawn` will resolve it via PATH + Pixcode's sandbox bin. The cross-platform resolver (see step 6) guarantees this works on Windows too.
- Paths to auth files (`~/.codex/auth.json` style) — change to wherever the CLI writes tokens.
- Session directory + format (e.g. Claude's JSONL per-conversation, Codex's rolling log) — mimic the existing providers' session parsers.

### 2. Register in `PROVIDER_ENV_VARS`

File: `server/services/provider-credentials.js`

Add the env-var names Pixcode should propagate from its stored credentials into the provider's subprocess. Example:

```js
export const PROVIDER_ENV_VARS = {
  claude: ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL'],
  codex:  ['OPENAI_API_KEY', 'OPENAI_BASE_URL'],
  gemini: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
  qwen:   ['DASHSCOPE_API_KEY', 'OPENAI_API_KEY', 'OPENAI_BASE_URL'],
  // new_provider: ['NEW_API_KEY'],
};
```

### 3. Install + version constants

File: `server/modules/providers/provider.routes.ts`

```ts
const PROVIDER_INSTALL_PACKAGES: Record<LLMProvider, string> = {
  claude: '@anthropic-ai/claude-code',
  codex: '@openai/codex',
  gemini: '@google/gemini-cli',
  qwen: '@qwen-code/qwen-code',
  // new_provider: '@scope/cli-package',
};
```

Make sure the LLMProvider type in `server/shared/types.ts` includes your new id:

```ts
export type LLMProvider = 'claude' | 'codex' | 'cursor' | 'gemini' | 'qwen' | 'new_provider';
```

### 4. Shell command for chat sessions

File: `server/index.js` (search for `shellCommand = 'codex'` to find the block)

Add a branch for your provider inside the big WebSocket message handler — this is what actually spawns the CLI when the user sends a chat. Mirror what `codex` or `gemini` do; for simple CLIs `shellCommand = '<cli>'` is enough, `--resume <id>` for session resumption.

### 5. Config file registry

File: `server/modules/providers/shared/provider-configs.ts`

Append your provider's user-editable files so the new **Configuration** tab in Settings → Agents picks them up:

```ts
export const PROVIDER_CONFIG_FILES: Record<string, ProviderConfigFile[]> = {
  // … existing providers
  new_provider: [
    {
      id: 'settings',
      label: 'settings.json',
      relativePath: '.new_provider/settings.json',
      format: 'json',
      description: 'Main config — model, MCP servers, tool policy.',
    },
    {
      id: 'env',
      label: '.env',
      relativePath: '.new_provider/.env',
      format: 'env',
      description: 'Environment variables.',
    },
  ],
};
```

`relativePath` is resolved against `os.homedir()` — never pass absolute paths or anything with `..`; the server rejects them.

### 6. Cross-platform binary path

File: `server/services/install-jobs.js`

Add your CLI to the `resolveProviderExecutables()` list so the absolute binary path is exported as `<NAME>_CLI_PATH`:

```js
const providers = [
    { name: 'claude', envKey: 'CLAUDE_CLI_PATH' },
    { name: 'codex', envKey: 'CODEX_CLI_PATH' },
    { name: 'gemini', envKey: 'GEMINI_CLI_PATH' },
    { name: 'qwen', envKey: 'QWEN_CLI_PATH' },
    { name: 'cursor-agent', envKey: 'CURSOR_CLI_PATH' },
    // { name: 'new-cli-bin', envKey: 'NEW_PROVIDER_CLI_PATH' },
];
```

Also add the binary name to `PACKAGE_BINARIES`:

```js
const PACKAGE_BINARIES = {
    '@anthropic-ai/claude-code': 'claude',
    '@openai/codex': 'codex',
    '@google/gemini-cli': 'gemini',
    '@qwen-code/qwen-code': 'qwen',
    // '@scope/cli-package': 'new-cli-bin',
};
```

(Only matters if the CLI's `bin` name differs from its npm package name.)

### 7. Tests / smoke

There's no test suite, so smoke manually:

```bash
npm run typecheck
npm run build:server
npm run server
```

Then hit `GET /api/providers/<id>/auth-status` with a token — you should see `{ installed: false }` (before install) and `{ installed: true, authenticated: false }` after `POST /api/providers/<id>/install` completes.

---

## Frontend

### 8. LLMProvider type + provider cards

Both a UI type alias and the card metadata need updating.

File: `src/types/app.ts`

```ts
export type LLMProvider = 'claude' | 'cursor' | 'codex' | 'gemini' | 'qwen' | 'new_provider';
```

File: `src/components/chat/view/subcomponents/ProviderSelectionEmptyState.tsx`

Add an entry to `PROVIDER_CARDS` for the chat empty-state picker — pick tasteful accent colors, they shouldn't repeat an existing provider's hue.

### 9. Display metadata

Files: `src/components/provider-auth/types.ts`

- `PROVIDER_DISPLAY_NAMES` — the human-readable name.
- `PROVIDER_AUTH_STATUS_ENDPOINTS` — must match the backend route (`/api/providers/<id>/auth-status`).
- `PROVIDER_INSTALL_COMMANDS` — the sample `npm install -g …` line shown in the "CLI not installed" card. Cosmetic only; the actual install goes through Pixcode's sandboxed installer.

### 10. Login command

File: `src/components/provider-auth/view/ProviderLoginModal.tsx`

Add a branch inside `getProviderCommand()` — this is the shell command that runs in the embedded terminal when the user clicks **Login**. Keep it simple:

```ts
if (provider === 'new_provider') return 'new-cli-bin login';
```

Avoid `--device-auth` and other flags unless you've personally confirmed they exist in the CLI version you're targeting. The plainest `login` subcommand is the most portable.

### 11. Model constants

File: `shared/modelConstants.js`

Export `NEW_PROVIDER_MODELS` with a `DEFAULT` + `OPTIONS` shape:

```js
export const NEW_PROVIDER_MODELS = {
  DEFAULT: 'some-flagship',
  OPTIONS: [
    { value: 'some-flagship', label: 'Some Flagship' },
    { value: 'some-cheap',    label: 'Some Cheap' },
  ],
};
```

Reference them in:
- `ProviderSelectionEmptyState.tsx` (`getStaticConfig` switch)
- `provider.routes.ts` (`STATIC_MODELS_BY_PROVIDER` map)
- The composer footer's model picker

### 12. Logo / brand mark

Drop an SVG at `public/<id>.svg` (and `<id>-white.svg` if the brand has a dark variant). Wire it into `src/components/llm-logo-provider/SessionProviderLogo.tsx` — look at the existing switch cases for the pattern.

### 13. Settings — Agents panel

File: `src/components/settings/view/tabs/agents-settings/AgentsSettingsTab.tsx`

Add an entry to `visibleAgents` and `agentContextById`. The `onLogin` callback is already provider-agnostic.

File: `src/components/settings/view/tabs/agents-settings/sections/content/AccountContent.tsx`

Add an entry to `agentConfig` (colors for the "logged in / not logged in" cards) and make sure `AUTO_INSTALLABLE` includes your new provider if it's npm-installable.

### 14. i18n strings

Add translations for at least the agent description under `agents.account.<id>.description` in every locale you care about:

```json
"agents": {
  "account": {
    "new_provider": { "description": "Short one-liner about the CLI." }
  }
}
```

Unprovided locales fall back to English. You only *must* fill `en/`; fill `tr/` as well since that's the project's other first-class locale.

### 15. Permissions tab (if applicable)

If your provider has an approval-mode concept (Claude skip-permissions, Codex default/acceptEdits/bypassPermissions, Gemini default/auto_edit/yolo), add a branch to `AgentCategoryContentSection.tsx` for `selectedCategory === 'permissions' && selectedAgent === 'new_provider'` and render a `PermissionsContent` configured with your modes. If the CLI owns permissions entirely (like Qwen's `/permissions` TUI), the **Configuration** tab replaces this — skip the permissions branch.

### 16. Telegram bot (optional)

The Telegram bot localises messages based on the user's app language. If your provider ships error messages or status updates the bot should speak, extend `server/services/telegram/translations.js` with a new key and wire it up in `notification-orchestrator.js`.

---

## Mobile / external access

Nothing to do — the QR tab and UPnP tunnel work provider-agnostically.

---

## Desktop wrapper (pixcode-desktop)

Nothing to do — the tray wrapper spawns the whole Pixcode server, not individual providers.

---

## Final smoke test

1. `npm run typecheck` — zero errors.
2. `npm run build` — clean.
3. `npm run server` — start.
4. Open the UI:
   - **Settings → Agents** shows the new provider in the list (with a logo, display name, and install prompt).
   - **Install** button runs to completion; the card flips to "Not authenticated".
   - **Login** opens the terminal with your `<cli> login` command.
   - **Configuration** tab lists the files you registered in step 5; edits save back.
   - **MCP Servers** tab works (inherits from the shared scaffold).
5. Chat picker shows the new provider card; clicking it switches the session.
6. Send a prompt — the CLI spawns, Pixcode reads the stream, a session appears in the sidebar.

If all of that works, you're done. If one step misbehaves, the `list/<id>/` adapter is almost always the culprit; start by matching Qwen's adapter file-for-file and diverging only where the CLI's on-disk format differs.
