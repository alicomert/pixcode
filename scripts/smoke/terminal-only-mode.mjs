import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appContent = readFileSync('src/components/app/AppContent.tsx', 'utf8');
const terminalView = readFileSync('src/components/terminal-only/view/TerminalOnlyView.tsx', 'utf8');
const workbench = readFileSync('src/components/vscode-workbench/view/VSCodeWorkbench.tsx', 'utf8');
const mainContent = readFileSync('src/components/main-content/view/MainContent.tsx', 'utf8');
const header = readFileSync('src/components/main-content/view/subcomponents/MainContentHeader.tsx', 'utf8');

assert.match(appContent, /new URLSearchParams\(location\.search\).*terminal/u);
assert.match(appContent, /<TerminalOnlyView/u);
assert.match(appContent, /onExit=\{exitTerminalOnly\}/u);
assert.match(appContent, /quickStartTerminalWorkspace/u);
assert.match(terminalView, /StandaloneShell/u);
assert.match(terminalView, /pixcode\.terminalOnly\.provider/u);
assert.match(terminalView, /Back to workspace/u);
assert.match(workbench, /focusTerminal/u);
assert.match(mainContent, /onEnterTerminalOnly/u);
assert.match(header, /activeTab === 'shell'/u);

console.log('terminal-only mode smoke checks passed');
