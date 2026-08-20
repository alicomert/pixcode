import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const serverIndex = fs.readFileSync('server/index.js', 'utf8');
const modal = fs.readFileSync('src/components/version-upgrade/view/VersionUpgradeModal.tsx', 'utf8');
const updater = fs.readFileSync('scripts/update-git-install.mjs', 'utf8');
const updaterPath = path.resolve('scripts/update-git-install.mjs');

assert.match(
  serverIndex,
  /update-git-install\.mjs/,
  'Git install updates should use the safe updater script instead of raw git pull.',
);

assert.doesNotMatch(
  serverIndex,
  /git checkout main && git pull && npm install/,
  'Server update command should not use the brittle raw git checkout/pull/install chain.',
);

assert.match(
  serverIndex,
  /function buildSystemUpdateInvocation[\s\S]*?label:\s*'Pixcode source update'/,
  'Queued git updates should expose a product-facing source-update label instead of an internal script path.',
);

assert.match(
  serverIndex,
  /appendUpdateJobLog\(job, 'meta', `Running: \$\{invocation\.label\}\\n`\)/,
  'The queued update transcript should show the product-facing source-update label to users.',
);

assert.match(
  serverIndex,
  /command:\s*process\.execPath,[\s\S]*?args:\s*\[gitUpdateScript\],[\s\S]*?label:\s*'Pixcode source update'/,
  'Git installs should execute the trusted updater script through Node with explicit argv.',
);

assert.match(
  serverIndex,
  /shell:\s*false,[\s\S]{0,160}detached:\s*false/,
  'Queued updates should not rely on a detached shell wrapper for ownership or completion.',
);

assert.match(
  serverIndex,
  /const lockResult = acquireSystemUpdateLock\(\{[\s\S]*?if \(!lockResult\.acquired\) return null;/,
  'Queued updates should acquire a persistent cross-process lock before creating a job.',
);

assert.match(
  serverIndex,
  /updateSystemUpdateLockWorker\(job\.updateLock, child\.pid\)/,
  'Queued updates should record the actual worker PID in the persistent update lock.',
);

assert.match(
  serverIndex,
  /if \(!keepLockUntilProcessExit\) \{\s*releaseSystemUpdateLock\(job\.updateLock\);/,
  'Ordinary terminal jobs should release only their own persistent update lock.',
);

assert.match(
  serverIndex,
  /installMode === 'npm' && latest\.latestVersion && latest\.latestVersion === SERVER_VERSION/,
  'Queued source updates must not treat an equal npm version as proof that a git checkout is current.',
);

assert.match(
  serverIndex,
  /job\.logListeners\.add\(onLog\)/,
  'The compatibility SSE endpoint should subscribe to the queued update job log stream.',
);

assert.doesNotMatch(serverIndex, /legacyUpdateActive/, 'The retired legacy SSE lock must not be reintroduced.');

assert.match(
  modal,
  /versionUpdate\.pixcodeUpgradeCommand/,
  'Version modal should show the user-facing Pixcode update command.',
);

assert.doesNotMatch(
  modal,
  /node scripts\/update-git-install\.mjs/,
  'Version modal should not expose the internal git updater script as manual product guidance.',
);

assert.match(
  fs.readFileSync('server/cli.js', 'utf8'),
  /update-git-install\.mjs[\s\S]*installMode === 'git'[\s\S]*updateGitPackage/,
  'pixcode update should drive the safe git updater for source installs.',
);

assert.match(
  updater,
  /stash[\s\S]*push[\s\S]*--include-untracked[\s\S]*--message/,
  'Safe updater should stash dirty tracked and untracked files before updating.',
);

assert.match(
  updater,
  /branch[\s\S]*backupBranch/,
  'Safe updater should preserve divergent local commits in a backup branch.',
);

assert.match(
  updater,
  /reset[\s\S]*--hard[\s\S]*origin\/main/,
  'Safe updater should be able to normalize a divergent install checkout after preserving it.',
);

assert.match(
  updater,
  /shouldRunNpmInstall/,
  'Safe updater should decide whether dependency reconciliation is needed from changed files.',
);

assert.match(
  updater,
  /Dependencies unchanged; skipping npm install\./,
  'Safe updater should skip npm install when package manifests did not change.',
);

assert.match(
  updater,
  /shouldRunBuild/,
  'Safe updater should decide whether source rebuild is needed from changed files.',
);

assert.match(
  fs.readFileSync('server/services/startup-update.js', 'utf8'),
  /Building the updated Pixcode source before restart[\s\S]*runNpmInherited\(\['run', 'build'\]/,
  'Startup source updates must rebuild dist/ and dist-server before re-exec.',
);

assert.match(
  updater,
  /Build inputs unchanged; skipping build\./,
  'Safe updater should skip build when only non-runtime files changed.',
);

const gitAvailability = spawnSync('git', ['--version'], { encoding: 'utf8' });
if (gitAvailability.error?.code === 'EPERM') {
  console.log('git install update integration skipped: this sandbox blocks child git processes (EPERM).');
  console.log('git install update static architecture checks passed');
  process.exit(0);
}
assert.equal(
  gitAvailability.status,
  0,
  `git --version failed\nstdout:\n${gitAvailability.stdout || ''}\nstderr:\n${gitAvailability.stderr || ''}`,
);

function makeTempRepo(name) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `pixcode-git-update-${name}-`));
  const origin = path.join(tempRoot, 'origin.git');
  const source = path.join(tempRoot, 'source');
  const install = path.join(tempRoot, 'install');

  fs.mkdirSync(source, { recursive: true });
  run('git', ['init', '--bare', origin], tempRoot);
  run('git', ['init', '-b', 'main'], source);
  writePackage(source, '1.0.0');
  fs.mkdirSync(path.join(source, 'src'), { recursive: true });
  fs.writeFileSync(path.join(source, 'src', 'app.js'), 'old\n');
  fs.writeFileSync(path.join(source, 'README.md'), 'old docs\n');
  fs.writeFileSync(path.join(source, 'tracked.txt'), 'old\n');
  run('git', ['add', '.'], source);
  run('git', ['commit', '-m', 'initial'], source);
  run('git', ['remote', 'add', 'origin', origin], source);
  run('git', ['push', '-u', 'origin', 'main'], source);
  run('git', ['symbolic-ref', 'HEAD', 'refs/heads/main'], origin);
  run('git', ['clone', origin, install], tempRoot);

  return { origin, source, install };
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Pixcode Smoke',
      GIT_AUTHOR_EMAIL: 'smoke@pixcode.local',
      GIT_COMMITTER_NAME: 'Pixcode Smoke',
      GIT_COMMITTER_EMAIL: 'smoke@pixcode.local',
    },
  });

  if (result.error) {
    throw result.error;
  }

  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );

  return `${result.stdout}${result.stderr}`.trim();
}

function writePackage(root, version, dependencies = {}) {
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({
      name: 'pixcode-update-smoke',
      version,
      scripts: {
        preinstall: 'node -e "require(\\"node:fs\\").writeFileSync(\\"install-ran.txt\\", \\"install\\")"',
        build: 'node -e "require(\\"node:fs\\").writeFileSync(\\"built.txt\\", \\"built\\")"',
      },
      dependencies,
    }, null, 2),
  );
  fs.writeFileSync(
    path.join(root, 'package-lock.json'),
    JSON.stringify({
      name: 'pixcode-update-smoke',
      version,
      lockfileVersion: 3,
      requires: true,
      packages: {
        '': {
          name: 'pixcode-update-smoke',
          version,
        },
      },
    }, null, 2),
  );
}

{
  const { source, install } = makeTempRepo('deps');

  fs.mkdirSync(path.join(source, 'local-dep'), { recursive: true });
  fs.writeFileSync(
    path.join(source, 'local-dep', 'package.json'),
    JSON.stringify({ name: 'pixcode-smoke-local-dep', version: '1.0.0' }, null, 2),
  );
  writePackage(source, '1.0.1', { 'pixcode-smoke-local-dep': 'file:./local-dep' });
  fs.writeFileSync(path.join(source, 'tracked.txt'), 'new\n');
  run('git', ['add', '.'], source);
  run('git', ['commit', '-m', 'dependency update'], source);
  run('git', ['push', 'origin', 'main'], source);

  fs.writeFileSync(path.join(install, 'tracked.txt'), 'local dirty change\n');
  fs.writeFileSync(path.join(install, 'untracked.txt'), 'local untracked change\n');
  run(process.execPath, [updaterPath], install);

  assert.equal(
    JSON.parse(fs.readFileSync(path.join(install, 'package.json'), 'utf8')).version,
    '1.0.1',
    'Safe updater should fast-forward the install checkout.',
  );
  assert.equal(
    fs.readFileSync(path.join(install, 'tracked.txt'), 'utf8').replace(/\r\n/g, '\n'),
    'new\n',
    'Safe updater should apply the remote tracked file after stashing local edits.',
  );
  assert.match(
    run('git', ['stash', 'list'], install),
    /pixcode-auto-update-/,
    'Safe updater should leave local dirty files recoverable in git stash.',
  );
  assert.equal(
    fs.readFileSync(path.join(install, 'install-ran.txt'), 'utf8'),
    'install',
    'Dependency updates should run npm install.',
  );
  assert.equal(
    fs.readFileSync(path.join(install, 'built.txt'), 'utf8'),
    'built',
    'Safe updater should run the repository build after dependency updates.',
  );
}

{
  const { source, install } = makeTempRepo('source');

  fs.writeFileSync(path.join(source, 'src', 'app.js'), 'new source\n');
  run('git', ['add', '.'], source);
  run('git', ['commit', '-m', 'source update'], source);
  run('git', ['push', 'origin', 'main'], source);

  run(process.execPath, [updaterPath], install);

  assert.equal(
    fs.existsSync(path.join(install, 'install-ran.txt')),
    false,
    'Source-only updates should skip npm install.',
  );
  assert.equal(
    fs.readFileSync(path.join(install, 'built.txt'), 'utf8'),
    'built',
    'Source-only updates should produce a fresh build output.',
  );
}

{
  const { source, install } = makeTempRepo('docs');

  fs.writeFileSync(path.join(source, 'README.md'), 'new docs\n');
  run('git', ['add', '.'], source);
  run('git', ['commit', '-m', 'docs update'], source);
  run('git', ['push', 'origin', 'main'], source);

  run(process.execPath, [updaterPath], install);

  assert.equal(
    fs.existsSync(path.join(install, 'install-ran.txt')),
    false,
    'Docs-only updates should skip npm install.',
  );
  assert.equal(
    fs.existsSync(path.join(install, 'built.txt')),
    false,
    'Docs-only updates should not create build output.',
  );
}

console.log('git install update smoke passed');
