import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';

const packageName = '@pixelbyte-software/pixcode';
const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
const startupUpdateAppliedEnv = 'PIXCODE_STARTUP_UPDATE_APPLIED';

const isTruthyEnv = (value) => /^(1|true|yes|on)$/i.test(String(value || '').trim());

export function compareVersions(left, right) {
  const a = String(left || '0.0.0').replace(/^v/, '').split('.').map(Number);
  const b = String(right || '0.0.0').replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const av = Number.isFinite(a[i]) ? a[i] : 0;
    const bv = Number.isFinite(b[i]) ? b[i] : 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function commandName(name) {
  if (process.platform === 'win32') {
    return name === 'npm' ? 'npm.cmd' : `${name}.exe`;
  }
  return name;
}

function runCapture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    encoding: 'utf8',
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `${command} exited with code ${result.status}`).trim());
  }
  return result.stdout.trim();
}

function runInherited(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio: 'inherit',
      shell: false,
      windowsHide: false,
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function readLatestPackageMetadata() {
  const response = await fetch(registryUrl, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Registry returned HTTP ${response.status}`);
  const metadata = await response.json();
  const latestVersion = metadata?.['dist-tags']?.latest;
  const latestEntry = latestVersion ? metadata?.versions?.[latestVersion] : null;
  const tarballUrl = latestEntry?.dist?.tarball;
  const integrity = latestEntry?.dist?.integrity;
  if (!latestVersion || !tarballUrl) {
    throw new Error('Registry response missing latest version or tarball URL.');
  }
  if (!integrity) {
    console.warn('[startup-update] Registry response missing integrity hash — proceeding without verification.');
  }
  return { latestVersion, tarballUrl, integrity };
}

async function installNpmGlobal(latestVersion, color) {
  const npm = commandName('npm');
  color?.info && console.log(`${color.info('[INFO]')} Installing ${packageName}@${latestVersion} globally before opening the port...`);
  await runInherited(npm, ['install', '-g', `${packageName}@${latestVersion}`]);
}

async function updateGitCheckout(appRoot, color) {
  const git = commandName('git');
  const npm = commandName('npm');
  const currentBranch = runCapture(git, ['branch', '--show-current'], { cwd: appRoot });
  if (currentBranch !== 'main') {
    return { updated: false, skipped: true, reason: `git checkout is on ${currentBranch || 'detached HEAD'}, not main` };
  }

  const status = runCapture(git, ['status', '--porcelain'], { cwd: appRoot });
  if (status) {
    return { updated: false, skipped: true, reason: 'git checkout has local changes' };
  }

  color?.info && console.log(`${color.info('[INFO]')} Fetching origin/main before opening the port...`);
  await runInherited(git, ['fetch', 'origin', 'main'], { cwd: appRoot });

  const localHead = runCapture(git, ['rev-parse', 'HEAD'], { cwd: appRoot });
  const remoteHead = runCapture(git, ['rev-parse', 'origin/main'], { cwd: appRoot });
  if (localHead === remoteHead) {
    return { updated: false };
  }

  color?.info && console.log(`${color.info('[INFO]')} Pulling latest Pixcode from GitHub before opening the port...`);
  await runInherited(git, ['pull', '--ff-only', 'origin', 'main'], { cwd: appRoot });

  color?.info && console.log(`${color.info('[INFO]')} Reconciling dependencies after git update...`);
  await runInherited(npm, ['install', '--no-audit', '--no-fund'], { cwd: appRoot });
  return { updated: true, version: readPackageVersion(appRoot) };
}

function readPackageVersion(appRoot) {
  try {
    const raw = fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8');
    return JSON.parse(raw).version || null;
  } catch {
    return null;
  }
}

async function extractRuntimeTarball({ runtimeDir, tarballUrl, latestVersion, currentVersion, color, integrity }) {
  color?.info && console.log(`${color.info('[INFO]')} Updating runtime ${currentVersion} -> ${latestVersion} before opening the port...`);

  const tarballRes = await fetch(tarballUrl);
  if (!tarballRes.ok || !tarballRes.body) {
    throw new Error(`Tarball fetch failed: HTTP ${tarballRes.status}`);
  }

  // Download tarball to a buffer first so we can verify integrity before extracting.
  const tarballBuffer = Buffer.from(await tarballRes.arrayBuffer());

  // Verify integrity hash (SRI format: "sha512-<base64>") if provided by the registry.
  if (integrity && typeof integrity === 'string') {
    const match = integrity.match(/^(sha512)-(.+)$/);
    if (match) {
      const algo = match[1];
      const expectedHash = match[2];
      const actualHash = crypto.createHash(algo).update(tarballBuffer).digest('base64');
      if (actualHash !== expectedHash) {
        throw new Error(`Integrity verification failed: expected ${algo}-${expectedHash.slice(0, 16)}..., got ${algo}-${actualHash.slice(0, 16)}...`);
      }
      color?.info && console.log(`${color.info('[INFO]')} Tarball integrity verified (${algo}).`);
    } else {
      console.warn('[startup-update] Unrecognized integrity format — skipping verification.');
    }
  } else {
    console.warn('[startup-update] No integrity hash available — tarball extracted without verification.');
  }

  const stagingDir = path.join(runtimeDir, '.staging');
  const backupDir = path.join(runtimeDir, '.previous');
  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });

  const tarModule = await import('tar');
  const tarExtract = tarModule.x || tarModule.default?.x;
  if (!tarExtract) throw new Error('tar extractor not available');

  await new Promise((resolve, reject) => {
    const nodeStream = Readable.from(tarballBuffer);
    const extractor = tarExtract({ cwd: stagingDir, strip: 1 });
    nodeStream.pipe(extractor);
    extractor.on('finish', resolve);
    extractor.on('error', reject);
    nodeStream.on('error', reject);
  });

  fs.rmSync(backupDir, { recursive: true, force: true });
  fs.mkdirSync(backupDir, { recursive: true });
  for (const entry of fs.readdirSync(stagingDir)) {
    const src = path.join(stagingDir, entry);
    const dst = path.join(runtimeDir, entry);
    if (fs.existsSync(dst)) {
      fs.renameSync(dst, path.join(backupDir, entry));
    }
    fs.renameSync(src, dst);
  }
  fs.rmSync(stagingDir, { recursive: true, force: true });

  const depsChanged = (() => {
    try {
      const prevPkg = JSON.parse(fs.readFileSync(path.join(backupDir, 'package.json'), 'utf8'));
      const nextPkg = JSON.parse(fs.readFileSync(path.join(runtimeDir, 'package.json'), 'utf8'));
      return JSON.stringify(prevPkg.dependencies || {}) !== JSON.stringify(nextPkg.dependencies || {});
    } catch {
      return true;
    }
  })();

  if (depsChanged) {
    color?.info && console.log(`${color.info('[INFO]')} Reconciling runtime node_modules...`);
    await runInherited(commandName('npm'), ['install', '--production', '--no-audit', '--no-fund', '--no-save'], { cwd: runtimeDir });
  }
}

export async function runStartupAutoUpdate({
  appRoot,
  currentVersion,
  installMode,
  color,
} = {}) {
  if (isTruthyEnv(process.env.PIXCODE_DISABLE_STARTUP_UPDATE)) {
    return { updated: false, skipped: true, reason: 'disabled by PIXCODE_DISABLE_STARTUP_UPDATE' };
  }
  if (isTruthyEnv(process.env.PIXCODE_SKIP_UPDATE_CHECK)) {
    return { updated: false, skipped: true, reason: 'disabled by PIXCODE_SKIP_UPDATE_CHECK' };
  }
  if (process.env[startupUpdateAppliedEnv] === '1') {
    return { updated: false, skipped: true, reason: 'already applied in this launch chain' };
  }
  if (!appRoot || !currentVersion) {
    return { updated: false, skipped: true, reason: 'missing app root or current version' };
  }

  try {
    if (installMode === 'git') {
      return await updateGitCheckout(appRoot, color);
    }

    const { latestVersion, tarballUrl, integrity } = await readLatestPackageMetadata();
    if (compareVersions(latestVersion, currentVersion) <= 0) {
      return { updated: false, latestVersion };
    }

    if (process.env.PIXCODE_RUNTIME_DIR) {
      await extractRuntimeTarball({
        runtimeDir: process.env.PIXCODE_RUNTIME_DIR,
        tarballUrl,
        latestVersion,
        currentVersion,
        color,
        integrity,
      });
      return { updated: true, version: latestVersion, restartMode: 'exit42' };
    }

    await installNpmGlobal(latestVersion, color);
    return { updated: true, version: latestVersion, restartMode: 'reexec' };
  } catch (error) {
    return {
      updated: false,
      failed: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function startupUpdateReexecEnv() {
  return {
    ...process.env,
    [startupUpdateAppliedEnv]: '1',
  };
}
