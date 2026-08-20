#!/usr/bin/env node
/**
 * Publish the version already prepared in package.json without allowing
 * release-it to calculate a different version, tag, or release.
 *
 * Authentication is deliberately delegated to the user's local npm login or
 * CI credential. Tokens never appear in command arguments or this script's
 * output.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJsonPath = path.join(root, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
}

function run(command, args, { inherit = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  return {
    status: result.error ? 1 : (result.status ?? 1),
    stdout: String(result.stdout || '').trim(),
    stderr: [String(result.stderr || '').trim(), result.error?.message || '']
      .filter(Boolean)
      .join('\n'),
  };
}

function fail(message) {
  console.error(`Prepared publish refused: ${message}`);
  process.exit(1);
}

const requestedVersion = readArg('--version');
if (process.argv.includes('--version') && !requestedVersion) {
  fail('--version requires a semantic version value');
}
const expectedVersion = requestedVersion || process.env.PIXCODE_PREPARED_VERSION || packageJson.version;
if (!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u.test(expectedVersion)) {
  fail(`invalid version: ${expectedVersion}`);
}
if (packageJson.version !== expectedVersion) {
  fail(`package.json is ${packageJson.version}, but ${expectedVersion} was requested`);
}
if (packageJson.name !== '@pixelbyte-software/pixcode') {
  fail(`unexpected package name: ${packageJson.name}`);
}

const gitStatus = run('git', ['-c', `safe.directory=${root}`, 'status', '--porcelain']);
if (gitStatus.status !== 0) fail('unable to inspect the Git worktree');
if (gitStatus.stdout) {
  fail('the Git worktree is not clean; commit or stash changes before publishing');
}
const gitBranch = run('git', ['-c', `safe.directory=${root}`, 'branch', '--show-current']);
if (gitBranch.status !== 0) fail('unable to determine the current Git branch');
if (gitBranch.stdout !== 'main') {
  fail(`prepared publishes must run from the main branch (currently ${gitBranch.stdout || 'detached HEAD'})`);
}

const identity = run(npmCommand, ['whoami', '--registry', 'https://registry.npmjs.org/']);
if (identity.status !== 0) {
  fail('npm is not authenticated. Run npm login locally or provide a CI secret.');
}

const packageId = `${packageJson.name}@${expectedVersion}`;
const existing = run(npmCommand, [
  'view',
  packageId,
  'version',
  '--registry',
  'https://registry.npmjs.org/',
  '--json',
]);
if (existing.status === 0 && existing.stdout) {
  fail(`${packageId} already exists in the registry; refusing to overwrite it`);
}
if (existing.status !== 0 && !/E404|404|not found|not exist/iu.test(`${existing.stdout}\n${existing.stderr}`)) {
  fail(`could not verify registry state for ${packageId}`);
}

console.log(`Publishing ${packageId} with the authenticated npm session…`);
const publish = run(npmCommand, [
  'publish',
  '--access',
  'public',
  '--registry',
  'https://registry.npmjs.org/',
], { inherit: true });
if (publish.status !== 0) process.exit(publish.status);

const verification = run(npmCommand, [
  'view',
  packageId,
  'version',
  'dist.integrity',
  'dist.tarball',
  '--registry',
  'https://registry.npmjs.org/',
  '--json',
]);
if (verification.status !== 0 || !verification.stdout) {
  fail(`publish returned successfully, but ${packageId} could not be verified`);
}

let verifiedMetadata;
try {
  verifiedMetadata = JSON.parse(verification.stdout);
} catch {
  fail(`registry returned invalid metadata for ${packageId}`);
}
const verifiedVersion = typeof verifiedMetadata === 'string'
  ? verifiedMetadata
  : verifiedMetadata?.version;
if (verifiedVersion !== expectedVersion) {
  fail(`registry verification returned ${verifiedVersion || 'no version'} for ${packageId}`);
}

console.log(`Published and verified ${packageId}.`);
