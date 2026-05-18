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
  /updateCommandLabel[\s\S]*Pixcode source update/,
  'Server update stream should describe git installs with product language instead of an internal script command.',
);

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
  /npm[\s\S]*install[\s\S]*--no-audit[\s\S]*--no-fund/,
  'Safe updater should reinstall dependencies after updating source files.',
);

assert.match(
  updater,
  /npm[\s\S]*run[\s\S]*build/,
  'Safe updater should rebuild source installs after updating source files.',
);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pixcode-git-update-'));
const origin = path.join(tempRoot, 'origin.git');
const source = path.join(tempRoot, 'source');
const install = path.join(tempRoot, 'install');

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

  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );

  return result.stdout.trim();
}

function writePackage(version) {
  fs.writeFileSync(
    path.join(source, 'package.json'),
    JSON.stringify({
      name: 'pixcode-update-smoke',
      version,
      scripts: {
        build: 'node -e "require(\\"node:fs\\").writeFileSync(\\"built.txt\\", \\"built\\")"',
      },
    }, null, 2),
  );
  fs.writeFileSync(
    path.join(source, 'package-lock.json'),
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

fs.mkdirSync(source, { recursive: true });
run('git', ['init', '--bare', origin], tempRoot);
run('git', ['init', '-b', 'main'], source);
writePackage('1.0.0');
fs.writeFileSync(path.join(source, 'tracked.txt'), 'old\n');
run('git', ['add', '.'], source);
run('git', ['commit', '-m', 'initial'], source);
run('git', ['remote', 'add', 'origin', origin], source);
run('git', ['push', '-u', 'origin', 'main'], source);
run('git', ['symbolic-ref', 'HEAD', 'refs/heads/main'], origin);
run('git', ['clone', origin, install], tempRoot);

writePackage('1.0.1');
fs.writeFileSync(path.join(source, 'tracked.txt'), 'new\n');
run('git', ['add', '.'], source);
run('git', ['commit', '-m', 'update'], source);
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
  fs.readFileSync(path.join(install, 'tracked.txt'), 'utf8'),
  'new\n',
  'Safe updater should apply the remote tracked file after stashing local edits.',
);
assert.match(
  run('git', ['stash', 'list'], install),
  /pixcode-auto-update-/,
  'Safe updater should leave local dirty files recoverable in git stash.',
);
assert.equal(
  fs.readFileSync(path.join(install, 'built.txt'), 'utf8'),
  'built',
  'Safe updater should run the repository build after installing dependencies.',
);

console.log('git install update smoke passed');
