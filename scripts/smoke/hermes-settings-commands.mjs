import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const settingsTab = read('src/components/settings/view/tabs/HermesSettingsTab.tsx');
const settingsModal = read('src/components/settings/view/Settings.tsx');
const workbench = read('src/components/vscode-workbench/view/VSCodeWorkbench.tsx');
const serverIndex = read('server/index.js');
const shellTypes = read('src/components/shell/types/types.ts');
const shellRuntime = read('src/components/shell/hooks/useShellRuntime.ts');
const shellConnection = read('src/components/shell/hooks/useShellConnection.ts');
const shellView = read('src/components/shell/view/Shell.tsx');
const standaloneShell = read('src/components/standalone-shell/view/StandaloneShell.tsx');
const hermesRoutes = read('server/modules/orchestration/hermes/hermes.routes.ts');
const pixcodeMcpServer = read('scripts/hermes/pixcode-mcp-server.mjs');

assert.match(
  settingsTab,
  /HERMES_SETTINGS_COMMANDS/,
  'Hermes settings should define a visible command launcher list.',
);
assert.match(settingsTab, /command:\s*'hermes model'/, 'Hermes settings should expose the interactive provider/model wizard.');
assert.match(settingsTab, /command:\s*'hermes auth'/, 'Hermes settings should expose the credential manager.');
assert.match(settingsTab, /command:\s*'hermes setup tools'/, 'Hermes settings should expose tool setup.');
assert.match(settingsTab, /command:\s*'hermes doctor'/, 'Hermes settings should expose diagnostics.');
assert.match(settingsTab, /command:\s*'hermes sessions browse'/, 'Hermes settings should open the interactive sessions browser, not the sessions usage screen.');
assert.match(
  settingsTab,
  /pixcode:hermes-terminal[\s\S]+command[\s\S]+title/,
  'Hermes settings should dispatch command and title to the workbench terminal.',
);
assert.match(
  settingsModal,
  /<HermesSettingsTab onClose=\{onClose\} \/>/,
  'Opening a Hermes command from settings should be able to close the settings modal so the terminal is visible.',
);
assert.match(
  workbench,
  /bottomTerminalCommand/,
  'Workbench bottom terminal should track the selected Hermes command separately from the mode.',
);
assert.match(
  workbench,
  /detail:\s*CustomEvent<\{ mode\?: string; command\?: string; title\?: string \}>/,
  'Workbench should accept Hermes terminal command events from settings.',
);
assert.match(
  workbench,
  /command=\{hermesCommand\}/,
  'Hermes bottom terminal should launch the requested Hermes command, not only bare hermes.',
);
assert.match(
  workbench,
  /HERMES_DEFAULT_COMMAND\s*=\s*'hermes --yolo'/,
  'Hermes terminal should default to --yolo so Hermes approval prompts do not stop visible work.',
);
assert.match(
  serverIndex,
  /HERMES_CLI_COMMAND_PATTERN/,
  'Backend should recognize safe Hermes subcommands for Pixcode MCP setup.',
);
assert.doesNotMatch(
  serverIndex,
  /command\.trim\(\) === 'hermes'/,
  'Backend should not limit Pixcode MCP setup to only bare hermes.',
);
assert.match(
  pixcodeMcpServer,
  /pixcode_read_cli_terminal/,
  'Pixcode MCP should expose a terminal transcript reader so Hermes can report provider CLI output.',
);
assert.match(
  pixcodeMcpServer,
  /Use this instead of Hermes shell\/proc\/skill execution/,
  'Pixcode MCP tool descriptions should explicitly steer Hermes away from non-visible provider proc launches.',
);
assert.match(
  pixcodeMcpServer,
  /multi-step|piece-by-piece|long-running/i,
  'Pixcode MCP should tell Hermes to send arbitrary multi-step work as visible provider terminal input.',
);
assert.match(
  pixcodeMcpServer,
  /defaultWaitMs\s*=\s*startupInput \? 180000 : 0/,
  'Pixcode MCP should wait for visible provider completion by default when startupInput is present.',
);
assert.match(
  pixcodeMcpServer,
  /launchId/,
  'Pixcode MCP should tie provider output readback to the terminal launch id.',
);
assert.match(
  serverIndex,
  /requestedLaunchId[\s\S]+session\.hermesLaunchId === requestedLaunchId/,
  'Provider output API should filter by Hermes terminal launch id when supplied.',
);
assert.match(
  serverIndex,
  /lifecycleState/,
  'Provider output API should expose provider-agnostic PTY lifecycle state instead of relying only on terminal text regex.',
);
assert.match(
  serverIndex,
  /terminalFailed/,
  'Provider output API should expose non-zero visible terminal exits as failures for Hermes readback.',
);
assert.match(
  serverIndex,
  /existingSession[\s\S]+existingSession\.pty/,
  'Completed visible terminal records should not be reattached as live PTYs.',
);
assert.match(
  pixcodeMcpServer,
  /terminalFailed/,
  'Pixcode MCP should tell Hermes when the visible provider terminal failed.',
);
assert.match(
  serverIndex,
  /const hermesLaunchId = Number\.isFinite\(Number\(data\.hermesLaunchId\)\)/,
  'Shell backend should persist Hermes terminal launch ids on PTY sessions.',
);
assert.match(
  workbench,
  /terminalHermesLaunchId/,
  'Workbench CLI panel should pass Hermes launch ids into provider shells.',
);
assert.match(
  pixcodeMcpServer,
  /terminalState is busy|terminalState.+busy|terminal to become idle/i,
  'Pixcode MCP should not summarize the first busy terminal frame as final output.',
);
assert.match(
  pixcodeMcpServer,
  /READBACK_IDLE_STABLE_MS/,
  'Pixcode MCP should require a stable idle readback before reporting provider output as final.',
);
assert.match(
  pixcodeMcpServer,
  /readbackStable/,
  'Pixcode MCP should mark whether a visible provider readback was stable before Hermes summarizes it.',
);
assert.match(
  pixcodeMcpServer,
  /startup input typed into the provider CLI/,
  'Pixcode MCP should describe prompt as real terminal input, not audit text.',
);
assert.match(
  pixcodeMcpServer,
  /startupInput/,
  'Pixcode MCP should use startupInput for text typed into provider CLIs.',
);
assert.match(
  pixcodeMcpServer,
  /audit\/reason text/,
  'Pixcode MCP should keep prompt as audit text so Hermes does not type explanations into Codex.',
);
assert.match(
  hermesRoutes,
  /startupInput/,
  'Hermes terminal launch events should carry startupInput separately from prompt.',
);
assert.match(
  pixcodeMcpServer,
  /bypassPermissions/,
  'Pixcode MCP should let Hermes request provider permission bypass for visible work.',
);
assert.match(
  hermesRoutes,
  /bypassPermissions|skipPermissions/,
  'Hermes terminal launch events should carry permission bypass state.',
);
assert.match(
  hermesRoutes,
  /permissionMode/,
  'Hermes terminal launch events should carry provider permission mode.',
);
assert.match(
  shellTypes,
  /ShellPermissionOverride/,
  'Shell types should expose a launch-scoped permission override contract.',
);
assert.match(
  shellRuntime,
  /permissionOverride/,
  'Shell runtime should keep launch-scoped permission overrides in refs.',
);
assert.match(
  shellConnection,
  /permissionOverrideRef/,
  'Shell websocket init should read launch-scoped permission overrides.',
);
assert.match(
  shellConnection,
  /normalizeStartupInput\(input: string, provider: LLMProvider\)/,
  'Startup input normalization should be provider-aware.',
);
assert.match(
  shellConnection,
  /provider === 'codex'[\s\S]+startupInputRef\.current/,
  'Codex startup input should be handled at process launch instead of typed into an already-open TUI.',
);
assert.match(
  shellConnection,
  /startupInput:\s*handlesStartupInputInCommand \? startupInputForCommand : null/,
  'Shell websocket init should send Codex startup input to the backend command builder.',
);
assert.doesNotMatch(
  workbench,
  /hermesCliLaunch\.startupInput \? `\$\{hermesCliLaunch\.startupInput\}\\r` : null/,
  'Workbench should not pre-append CR before provider-aware startup input normalization.',
);
assert.match(
  shellTypes,
  /startupInput\?: string \| null/,
  'Shell init messages should carry launch-time startup input for providers that accept an initial prompt.',
);
assert.match(
  serverIndex,
  /const startupInput = typeof data\.startupInput === 'string'/,
  'Shell backend should read launch-time startup input from the websocket init payload.',
);
assert.match(
  serverIndex,
  /provider === 'codex'[\s\S]+startupInput[\s\S]+quoteShellArgForPlatform\(startupInput\)/,
  'Codex provider terminals should start with the requested prompt as a CLI argument so banners/update notices cannot swallow Enter.',
);
assert.match(
  shellView,
  /permissionOverride/,
  'Shell view should accept launch-scoped permission overrides.',
);
assert.match(
  standaloneShell,
  /permissionOverride/,
  'Standalone shell should pass launch-scoped permission overrides through to Shell.',
);
assert.match(
  workbench,
  /terminalPermissionOverride/,
  'Workbench should apply Hermes launch permission bypass to the provider shell.',
);
assert.match(
  settingsTab,
  /hermes-agent\.png/,
  'Hermes settings should use the Hermes logo asset instead of an H glyph.',
);
assert.match(
  workbench,
  /hermes-agent\.png/,
  'Workbench Hermes launch surfaces should use the Hermes logo asset instead of an H glyph.',
);
assert.match(
  serverIndex,
  /\/api\/shell\/sessions\/provider-output/,
  'Backend should expose recent provider terminal output for Pixcode MCP readback.',
);

console.log('hermes settings command smoke passed');
