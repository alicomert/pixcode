#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const runner = readFileSync('server/modules/orchestration/workflows/workflow-runner.ts', 'utf8');
const workspaceTarget = readFileSync('server/modules/orchestration/workflows/workspace-target.ts', 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`orchestration-permission-fallback smoke failed: ${message}`);
    process.exit(1);
  }
}

assert(
  runner.includes('isExternalDirectoryPermissionError'),
  'workflow runner should classify external_directory permission failures',
);

assert(
  runner.includes('buildPermissionFallbackOutput') && runner.includes('buildFallbackFinalReport'),
  'workflow runner should synthesize user-facing outputs instead of failing the whole run',
);

assert(
  runner.includes('resolveNodePermissionMode') && runner.includes('bypassPermissions'),
  'host workspace orchestration should avoid default auto-reject permission mode for selected project paths',
);

assert(
  workspaceTarget.includes('Do not access parent directories') && workspaceTarget.includes('If a tool reports a permission denial'),
  'workspace prompt should tell agents to stay inside the selected workspace and report permission denials',
);

console.log('orchestration-permission-fallback smoke passed');
