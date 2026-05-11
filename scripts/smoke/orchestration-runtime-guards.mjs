#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const a2aRoutes = readFileSync('server/modules/orchestration/a2a/routes.ts', 'utf8');
const hostWorkspace = readFileSync('server/modules/orchestration/workspace/workspace-manager.ts', 'utf8');
const worktreeWorkspace = readFileSync('server/modules/orchestration/workspace/worktree-workspace.ts', 'utf8');
const dockerWorkspace = readFileSync('server/modules/orchestration/workspace/docker-workspace.ts', 'utf8');
const opencodeCli = readFileSync('server/opencode-cli.js', 'utf8');
const geminiCli = readFileSync('server/gemini-cli.js', 'utf8');
const qwenCli = readFileSync('server/qwen-code-cli.js', 'utf8');

assert.ok(
  hostWorkspace.includes("rev-parse', '--is-inside-work-tree")
    && hostWorkspace.includes("return '';"),
  'Host orchestration workspace diff should skip git diff when the project is not a git work tree.',
);

for (const [name, source] of [
  ['worktree', worktreeWorkspace],
  ['docker', dockerWorkspace],
]) {
  assert.ok(
    source.includes('not a git repository|usage: git diff --no-index') && source.includes("return /not a git repository"),
    `${name} orchestration workspace diff should suppress noisy git --no-index usage output.`,
  );
}

assert.ok(
  a2aRoutes.includes('if (diff.trim())') && a2aRoutes.includes("type: 'file-diff'"),
  'A2A finalization should not publish empty or noisy workspace diff artifacts.',
);

for (const [name, source] of [
  ['opencode', opencodeCli],
  ['gemini', geminiCli],
  ['qwen', qwenCli],
]) {
  assert.ok(
    source.includes('DEFAULT_CLI_IDLE_TIMEOUT_MS = 600000')
      && source.includes('PIXCODE_CLI_IDLE_TIMEOUT_MS')
      && source.includes('if (timeoutMs === 0) return;'),
    `${name} CLI runtime should use a longer configurable idle timeout.`,
  );
}

console.log('orchestration runtime guards smoke passed');
