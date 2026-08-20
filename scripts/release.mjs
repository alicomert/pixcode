#!/usr/bin/env node
/**
 * Cross-platform release-it launcher.
 *
 * Keep GitHub's release credential out of command arguments and preserve an
 * explicitly provided environment value over an optional local .env entry.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env };

function readOptionalGithubToken() {
  if (env.GITHUB_TOKEN) return;

  try {
    const source = fs.readFileSync(path.join(root, '.env'), 'utf8');
    for (const rawLine of source.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const match = line.match(/^GITHUB_TOKEN\s*=\s*(.*)$/);
      if (!match) continue;

      let value = match[1].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (value) env.GITHUB_TOKEN = value;
      return;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.error(`Unable to read the optional .env file: ${error.message}`);
      process.exitCode = 1;
    }
  }
}

readOptionalGithubToken();

if (process.exitCode) process.exit(process.exitCode);

const releaseIt = path.join(path.dirname(require.resolve('release-it/package.json')), 'bin', 'release-it.js');
const child = spawn(process.execPath, [releaseIt, ...process.argv.slice(2)], {
  cwd: root,
  env,
  stdio: 'inherit',
});

child.once('error', error => {
  console.error(`Unable to start release-it: ${error.message}`);
  process.exitCode = 1;
});

child.once('exit', (code, signal) => {
  if (signal) {
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
