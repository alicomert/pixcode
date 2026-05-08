#!/usr/bin/env node

import assert from 'node:assert/strict';
import path from 'node:path';

import { resolveDaemonCliEntryPath } from '../../server/daemon-manager.js';

const appRoot = path.resolve('.');
const resolved = resolveDaemonCliEntryPath({
  appRoot,
  cliEntry: path.join(appRoot, 'server', 'cli.js'),
});

assert.equal(
  resolved,
  path.join(appRoot, 'dist-server', 'server', 'cli.js'),
  `expected daemon entrypoint to prefer dist-server, got ${resolved}`,
);

console.log('daemon entrypoint smoke passed');
