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
const shellTerminal = read('src/components/shell/hooks/useShellTerminal.ts');
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
assert.match(settingsTab, /command:\s*'hermes cron status'/, 'Hermes settings should expose scheduler/cron status.');
assert.match(settingsTab, /command:\s*'hermes mcp'/, 'Hermes settings should expose MCP server management.');
assert.match(settingsTab, /command:\s*'hermes doctor'/, 'Hermes settings should expose diagnostics.');
assert.match(settingsTab, /command:\s*'hermes update --yes'/, 'Hermes settings should expose a non-interactive updater.');
assert.match(settingsTab, /command:\s*'hermes sessions browse'/, 'Hermes settings should open the interactive sessions browser, not the sessions usage screen.');
assert.match(settingsTab, /\/api\/orchestration\/hermes\/diagnostics/, 'Hermes settings should read integration diagnostics.');
assert.match(settingsTab, /\/api\/orchestration\/hermes\/control-plane/, 'Hermes settings should read the Hermes control-plane snapshot.');
assert.match(settingsTab, /control-plane\/repair/, 'Hermes settings should expose control-plane repair.');
assert.match(settingsTab, /diagnosticsTitle/, 'Hermes settings should render a diagnostics panel.');
assert.match(settingsTab, /controlPlaneTitle/, 'Hermes settings should render a control-plane panel.');
assert.match(settingsTab, /diagnosticsMcpTools/, 'Hermes settings diagnostics should show Pixcode MCP tool counts.');
assert.match(settingsTab, /diagnosticsCron/, 'Hermes settings diagnostics should show cron availability.');
assert.match(settingsTab, /Pixcode Hermes REST health check/, 'Hermes REST probe should submit a real prompt so provider/auth failures are visible.');
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
  'Hermes terminal should not override toolsets on the command line; Pixcode writes hermes-cli plus Pixcode MCP into Hermes config before launch.',
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
  /pixcode_send_cli_input/,
  'Pixcode MCP should expose a direct input tool for continuing an existing visible CLI terminal.',
);
assert.match(
  pixcodeMcpServer,
  /pixcode_manage_hermes_cron/,
  'Pixcode MCP should expose Hermes cron management through the managed gateway.',
);
assert.match(
  pixcodeMcpServer,
  /pixcode_get_hermes_diagnostics/,
  'Pixcode MCP should expose redacted Hermes integration diagnostics.',
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
  /DEFAULT_STARTUP_WAIT_MS\s*=\s*100000/,
  'Pixcode MCP default completion wait should stay under the Hermes MCP tool timeout.',
);
assert.match(
  pixcodeMcpServer,
  /lastStrongBusy[\s\S]+lastPrompt[\s\S]+\?\s*'busy'\s*:\s*'idle'/,
  'Codex readback should ignore weak spinner remnants once the prompt has returned.',
);
assert.match(
  serverIndex,
  /lastStrongBusy[\s\S]+lastPrompt[\s\S]+\?\s*'busy'\s*:\s*'idle'/,
  'Backend provider-output should ignore weak Codex spinner remnants once the prompt has returned.',
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
  serverIndex,
  /session\.pty\s*!==\s*shellProcess/,
  'Stale PTY exit handlers should not mark a replacement provider session as completed or failed.',
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
  /scope:\s*'user'/,
  'Pixcode MCP provider auto-config should fall back to user scope when project scope cannot be written.',
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
  /startupInputDelivery/,
  'Startup input should be delivered through an explicit command-or-terminal mode.',
);
assert.match(
  shellConnection,
  /provider === 'codex'[\s\S]+forceNewSessionRef\.current[\s\S]+startupInputForCommand/,
  'Codex startup input should be passed as a process argument only for explicit fresh sessions.',
);
assert.match(
  shellConnection,
  /startupInputDelivery:\s*handlesStartupInputInCommand \? 'command' : 'terminal'/,
  'Shell websocket init should tell the backend whether startup input belongs in the command or visible terminal.',
);
assert.match(
  shellTerminal,
  /sanitizeTerminalInputData/,
  'Terminal input should filter xterm color-query reports before sending data to the PTY.',
);
assert.match(
  shellTerminal,
  /OSC_COLOR_REPORT_REGEX/,
  'Terminal input should drop OSC 10/11/12 color reports so resize/theme probes do not corrupt CLI prompts.',
);
assert.match(
  serverIndex,
  /writeTerminalStartupInput/,
  'Shell backend should submit Hermes startup input directly into reused visible PTYs.',
);
assert.match(
  serverIndex,
  /startupInputDelivery === 'terminal'[\s\S]+writeTerminalStartupInput/,
  'Existing visible provider sessions should receive terminal-delivered startup input before reconnect returns.',
);
assert.match(
  workbench,
  /forceNewSession:\s*hermesCliLaunch\.forceNewSession === true/,
  'Hermes-launched provider work should continue the current visible terminal unless forceNewSession is explicit.',
);
assert.match(
  pixcodeMcpServer,
  /forceNewSession/,
  'Pixcode MCP should let Hermes request a fresh visible provider session only when the user asks for one.',
);
assert.match(
  pixcodeMcpServer,
  /continue the existing visible provider terminal/i,
  'Pixcode MCP tool instructions should tell Hermes to continue existing visible provider terminals by default.',
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
  shellTypes,
  /startupInputDelivery\?: 'command' \| 'terminal'/,
  'Shell init messages should carry startup input delivery mode.',
);
assert.match(
  serverIndex,
  /const startupInput = typeof data\.startupInput === 'string'/,
  'Shell backend should read launch-time startup input from the websocket init payload.',
);
assert.match(
  serverIndex,
  /provider === 'codex'[\s\S]+commandStartupInput[\s\S]+quoteShellArgForPlatform\(commandStartupInput\)/,
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
