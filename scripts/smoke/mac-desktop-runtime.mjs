#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const installJobs = readFileSync('server/services/install-jobs.js', 'utf8');
const codexAuth = readFileSync('server/modules/providers/list/codex/codex-auth.provider.ts', 'utf8');
const cursorAuth = readFileSync('server/modules/providers/list/cursor/cursor-auth.provider.ts', 'utf8');
const geminiAuth = readFileSync('server/modules/providers/list/gemini/gemini-auth.provider.ts', 'utf8');
const qwenAuth = readFileSync('server/modules/providers/list/qwen/qwen-auth.provider.ts', 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`mac-desktop-runtime smoke failed: ${message}`);
    process.exit(1);
  }
}

assert(
  installJobs.includes('function collectUserShellPath'),
  'install-jobs should hydrate PATH from the user shell for macOS GUI launches',
);

assert(
  installJobs.includes("'.nvm'") && installJobs.includes("'.volta'") && installJobs.includes("'.asdf'"),
  'install-jobs should search common user Node manager bin directories',
);

assert(
  installJobs.includes("findExecutableOnPath('npm'") && installJobs.includes('buildCliSpawnEnv'),
  'CLI installers should resolve npm from the augmented runtime PATH before spawning',
);

assert(codexAuth.includes('CODEX_CLI_PATH'), 'Codex auth should honor CODEX_CLI_PATH');
assert(cursorAuth.includes('CURSOR_CLI_PATH'), 'Cursor auth should honor CURSOR_CLI_PATH');
assert(geminiAuth.includes('GEMINI_CLI_PATH'), 'Gemini auth should honor GEMINI_CLI_PATH');
assert(qwenAuth.includes('QWEN_CLI_PATH'), 'Qwen auth should honor QWEN_CLI_PATH');

console.log('mac-desktop-runtime smoke passed');
