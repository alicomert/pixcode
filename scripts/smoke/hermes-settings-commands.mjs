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
  read('server/modules/orchestration/hermes/hermes.routes.ts'),
  /startupInput/,
  'Hermes terminal launch events should carry startupInput separately from prompt.',
);
assert.match(
  serverIndex,
  /\/api\/shell\/sessions\/provider-output/,
  'Backend should expose recent provider terminal output for Pixcode MCP readback.',
);

console.log('hermes settings command smoke passed');
