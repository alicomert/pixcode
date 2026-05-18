#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const stashMessage = `pixcode-auto-update-${timestamp}`;
const backupBranch = `pixcode-backup-before-update-${timestamp}`;

function log(message) {
  process.stdout.write(`${message}\n`);
}

function run(command, args, options = {}) {
  const {
    allowFailure = false,
    collectOutput = false,
    env = process.env,
  } = options;

  return new Promise((resolve, reject) => {
    log(`$ ${[command, ...args].join(' ')}`);
    const child = spawn(command, args, {
      cwd: repoRoot,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      const result = { code, stdout, stderr };
      if (code === 0 || allowFailure) {
        resolve(collectOutput ? result : code);
        return;
      }

      const error = new Error(`${command} ${args.join(' ')} exited with code ${code}`);
      error.result = result;
      reject(error);
    });
  });
}

async function getOutput(command, args, options = {}) {
  const result = await run(command, args, { ...options, collectOutput: true });
  return result.stdout.trim();
}

async function main() {
  if (!fs.existsSync(path.join(repoRoot, '.git'))) {
    throw new Error(`Git metadata not found in ${repoRoot}`);
  }

  log('Pixcode safe git update started.');
  log(`Repository: ${repoRoot}`);

  await run('git', ['rev-parse', '--is-inside-work-tree']);
  await run('git', ['fetch', 'origin', 'main']);

  const status = await getOutput('git', ['status', '--porcelain', '--untracked-files=all']);
  if (status) {
    log('Local checkout has modified or untracked files.');
    log(`Saving them to git stash: ${stashMessage}`);
    await run('git', [
      '-c',
      'user.name=Pixcode Updater',
      '-c',
      'user.email=updater@pixcode.local',
      'stash',
      'push',
      '--include-untracked',
      '--message',
      stashMessage,
    ]);
    log('Local changes are preserved in git stash.');
  } else {
    log('Working tree is clean.');
  }

  const checkoutMain = await run('git', ['checkout', 'main'], { allowFailure: true, collectOutput: true });
  if (checkoutMain.code !== 0) {
    log('Local main branch checkout failed; recreating main from origin/main.');
    await run('git', ['checkout', '-B', 'main', 'origin/main']);
  }

  const isAncestor = await run('git', ['merge-base', '--is-ancestor', 'HEAD', 'origin/main'], {
    allowFailure: true,
    collectOutput: true,
  });

  if (isAncestor.code === 0) {
    await run('git', ['merge', '--ff-only', 'origin/main']);
  } else if (isAncestor.code === 1) {
    log(`Local main has commits that are not on origin/main. Preserving them in branch: ${backupBranch}`);
    await run('git', ['branch', backupBranch]);
    await run('git', ['reset', '--hard', 'origin/main']);
  } else {
    throw new Error('Could not compare local main with origin/main.');
  }

  const packageVersion = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;
  log(`Repository updated to Pixcode ${packageVersion}.`);

  await run('npm', ['install', '--no-audit', '--no-fund']);
  const updatedPackageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  if (updatedPackageJson.scripts?.build) {
    log('Building Pixcode source install.');
    await run('npm', ['run', 'build']);
  } else {
    log('No build script found; skipping build.');
  }
  log('Pixcode git install update completed.');
}

main().catch((error) => {
  process.stderr.write(`Pixcode git install update failed: ${error.message}\n`);
  process.exit(1);
});
