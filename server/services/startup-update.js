import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';

const packageName = '@pixelbyte-software/pixcode';
const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
const startupUpdateAppliedEnv = 'PIXCODE_STARTUP_UPDATE_APPLIED';

const isTruthyEnv = (value) => /^(1|true|yes|on)$/i.test(String(value || '').trim());
const isSafePackageVersion = (value) => typeof value === 'string'
  && /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u.test(value.trim());

export function compareVersions(left, right) {
  const parse = (value) => {
    const match = String(value || '').trim().replace(/^v/i, '').match(
      /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u,
    );
    if (!match) return { core: [0, 0, 0], prerelease: [] };
    return {
      core: match.slice(1, 4).map((part) => Number.parseInt(part, 10)),
      prerelease: match[4] ? match[4].split('.') : [],
    };
  };
  const a = parse(left);
  const b = parse(right);
  for (let i = 0; i < 3; i += 1) {
    if (a.core[i] !== b.core[i]) return a.core[i] - b.core[i];
  }
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return a.prerelease.length === b.prerelease.length ? 0 : (a.prerelease.length === 0 ? 1 : -1);
  }
  for (let i = 0; i < Math.max(a.prerelease.length, b.prerelease.length); i += 1) {
    if (i >= a.prerelease.length) return -1;
    if (i >= b.prerelease.length) return 1;
    const leftPart = a.prerelease[i];
    const rightPart = b.prerelease[i];
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/u.test(leftPart);
    const rightNumeric = /^\d+$/u.test(rightPart);
    if (leftNumeric && rightNumeric) return Number(leftPart) - Number(rightPart);
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

function commandName(name) {
  if (process.platform === 'win32') {
    return `${name}.exe`;
  }
  return name;
}

function npmCliInvocation(args) {
  if (process.platform !== 'win32') {
    return { command: 'npm', args, shell: false };
  }

  // `.cmd` shims cannot be spawned with shell:false on Windows (Node returns
  // EINVAL), while shell:true would interpolate registry-controlled version
  // strings into a command line. Invoke npm's JS entrypoint through the
  // current Node executable instead; npm_execpath is set for npm-launched
  // processes, and the adjacent path covers standalone daemon launches.
  const configured = String(process.env.npm_execpath || '').trim();
  const npmCli = configured
    ? (path.isAbsolute(configured) ? configured : path.resolve(configured))
    : path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const nodeExec = String(process.env.npm_node_execpath || '').trim()
    || (process.versions?.electron || process.env.ELECTRON_RUN_AS_NODE === '1' ? '' : process.execPath);
  if (nodeExec && fs.existsSync(npmCli) && fs.existsSync(nodeExec)) {
    return { command: nodeExec, args: [npmCli, ...args], shell: false };
  }

  // Packaged Electron builds may not ship a standalone Node binary even
  // though npm.cmd is available on PATH. The arguments here are fixed flags
  // plus a registry version validated by the caller; use the shim as a final
  // compatibility path rather than trying to execute electron.exe as Node.
  if (args.every((arg) => /^[A-Za-z0-9@._+:/=-]+$/u.test(String(arg)))) {
    return { command: 'npm.cmd', args, shell: true };
  }
  throw new Error(`npm CLI entrypoint not found: ${npmCli}`);
}

async function runNpmInherited(args, options = {}) {
  const invocation = npmCliInvocation(args);
  return runInherited(invocation.command, invocation.args, {
    ...options,
    shell: invocation.shell,
    windowsHide: options.windowsHide ?? true,
  });
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
      shell: options.shell ?? false,
      windowsHide: options.windowsHide ?? false,
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let response;
  try {
    response = await fetch(registryUrl, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': 'pixcode-startup-update' },
      redirect: 'follow',
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`Registry returned HTTP ${response.status}`);
  const metadata = await response.json();
  const latestVersion = metadata?.['dist-tags']?.latest;
  const latestEntry = latestVersion ? metadata?.versions?.[latestVersion] : null;
  const tarballUrl = latestEntry?.dist?.tarball;
  const integrity = latestEntry?.dist?.integrity;
  if (!latestVersion || !tarballUrl) {
    throw new Error('Registry response missing latest version or tarball URL.');
  }
  if (!isSafePackageVersion(latestVersion)) {
    throw new Error(`Registry returned an invalid latest package version: ${String(latestVersion)}`);
  }
  return { latestVersion, tarballUrl, integrity };
}

async function installNpmGlobal(latestVersion, color) {
  color?.info && console.log(`${color.info('[INFO]')} Installing ${packageName}@${latestVersion} globally before opening the port...`);
  await runNpmInherited(['install', '-g', `${packageName}@${latestVersion}`]);
}

async function updateGitCheckout(appRoot, color) {
  const git = commandName('git');
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
  await runNpmInherited(['install', '--no-audit', '--no-fund'], { cwd: appRoot });
  // Daemon/source installs execute the compiled `dist-server` entrypoint. A
  // successful fast-forward without rebuilding would restart the old server
  // and leave the checkout appearing updated while serving stale code.
  color?.info && console.log(`${color.info('[INFO]')} Building the updated Pixcode source before restart...`);
  await runNpmInherited(['run', 'build'], { cwd: appRoot });
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

function pathExistsIncludingLinks(absPath) {
  try {
    fs.lstatSync(absPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Move a runtime entry while tolerating Windows/EXDEV rename failures.
 *
 * `renameSync` is atomic when source and destination share a volume, but a
 * runtime directory may live on a different volume from its staging/backup
 * directory (or Windows may reject a rename while an antivirus scanner has a
 * handle open).  Falling back to copy-then-remove keeps the startup updater
 * usable in those environments.  Callers wrap each move in a transaction and
 * remove a partially copied destination if the fallback itself fails.
 */
function movePathWithFallback(source, destination) {
  try {
    fs.renameSync(source, destination);
    return;
  } catch (renameError) {
    try {
      if (pathExistsIncludingLinks(destination)) {
        throw renameError;
      }
      const stat = fs.lstatSync(source);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      if (stat.isSymbolicLink()) {
        const linkType = process.platform === 'win32' && (() => {
          try {
            return fs.statSync(source).isDirectory() ? 'junction' : 'file';
          } catch {
            return 'file';
          }
        })();
        fs.symlinkSync(fs.readlinkSync(source), destination, linkType || undefined);
        fs.unlinkSync(source);
      } else if (stat.isDirectory()) {
        fs.cpSync(source, destination, {
          recursive: true,
          force: false,
          errorOnExist: true,
          dereference: false,
        });
        fs.rmSync(source, { recursive: true, force: true });
      } else {
        fs.copyFileSync(source, destination);
        fs.rmSync(source, { force: true });
      }
      return;
    } catch (copyError) {
      // Keep the original rename failure as the primary cause.  The caller's
      // rollback removes a destination that may have been created before the
      // copy/remove step failed.
      copyError.cause = renameError;
      throw copyError;
    }
  }
}

function removePathBestEffort(absPath) {
  try {
    fs.rmSync(absPath, { recursive: true, force: true });
  } catch {
    // Rollback should make a best effort and preserve the original failure.
  }
}

/**
 * Restore the runtime entries moved during a failed startup update swap.
 * `records` is ordered as operations were attempted; restore in reverse so
 * nested entries cannot shadow their parents.
 */
function rollbackRuntimeSwap(records) {
  const rollbackErrors = [];
  for (const record of [...records].reverse()) {
    if (!record.installAttempted) continue;
    removePathBestEffort(record.destination);
  }
  for (const record of [...records].reverse()) {
    if (!record.backupMoved) continue;
    try {
      movePathWithFallback(record.backup, record.destination);
    } catch (error) {
      rollbackErrors.push(error);
    }
  }
  return rollbackErrors;
}

function runtimeDependenciesChanged(runtimeDir, stagingDir) {
  try {
    const readDeps = (filePath) => {
      const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return pkg && typeof pkg.dependencies === 'object' && !Array.isArray(pkg.dependencies)
        ? pkg.dependencies
        : {};
    };
    return JSON.stringify(readDeps(path.join(runtimeDir, 'package.json')))
      !== JSON.stringify(readDeps(path.join(stagingDir, 'package.json')));
  } catch {
    // If either manifest is malformed, prefer a dependency reconciliation; a
    // failed install is rolled back by the transaction below.
    return true;
  }
}

async function extractRuntimeTarball({ runtimeDir, tarballUrl, latestVersion, currentVersion, color, integrity }) {
  color?.info && console.log(`${color.info('[INFO]')} Updating runtime ${currentVersion} -> ${latestVersion} before opening the port...`);

  if (!tarballUrl) throw new Error('Tarball URL is missing.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  let tarballBuffer;
  try {
    const tarballRes = await fetch(tarballUrl, {
      signal: controller.signal,
      headers: { accept: 'application/octet-stream', 'user-agent': 'pixcode-startup-update' },
      redirect: 'follow',
    });
    if (!tarballRes.ok || !tarballRes.body) {
      throw new Error(`Tarball fetch failed: HTTP ${tarballRes.status}`);
    }
    const contentLength = Number(tarballRes.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > 256 * 1024 * 1024) {
      throw new Error('Refusing an unexpectedly large package tarball (>256 MiB).');
    }
    // Download tarball to a buffer first so we can verify integrity before extracting.
    tarballBuffer = Buffer.from(await tarballRes.arrayBuffer());
    if (tarballBuffer.length > 256 * 1024 * 1024) {
      throw new Error('Refusing an unexpectedly large package tarball (>256 MiB).');
    }
  } finally {
    clearTimeout(timeout);
  }

  // Verify integrity hash (SRI format: "sha512-<base64>") before extracting.
  if (!integrity || typeof integrity !== 'string') {
    throw new Error('Tarball integrity hash missing from registry metadata — refusing to install an unverified package.');
  }
  const match = integrity.match(/^(sha(?:512|384|256))-(.+)$/);
  if (!match) throw new Error('Malformed integrity string from registry.');
  const algo = match[1];
  const expectedHash = match[2];
  const actualHash = crypto.createHash(algo).update(tarballBuffer).digest('base64');
  if (actualHash !== expectedHash) {
    throw new Error(`Integrity verification failed: expected ${algo}-${expectedHash.slice(0, 16)}..., got ${algo}-${actualHash.slice(0, 16)}...`);
  }
  color?.info && console.log(`${color.info('[INFO]')} Tarball integrity verified (${algo}).`);

  const stagingDir = path.join(runtimeDir, '.staging');
  const backupDir = path.join(runtimeDir, '.previous');
  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });

  const tarModule = await import('tar');
  const tarExtract = tarModule.x || tarModule.default?.x;
  if (!tarExtract) throw new Error('tar extractor not available');

  try {
    await new Promise((resolve, reject) => {
    const nodeStream = Readable.from(tarballBuffer);
    const extractor = tarExtract({
      cwd: stagingDir,
      strip: 1,
      filter: (entryPath, entry) => {
        const type = String(entry?.type || '');
        if (type !== 'File' && type !== 'Directory') {
          reject(new Error(`Unsupported archive entry type: ${type || 'unknown'}`));
          return false;
        }
        const raw = String(entryPath || '').replace(/\\/g, '/');
        const parts = raw.split('/');
        const stripped = parts.slice(1).join('/');
        if (
          raw.startsWith('/')
          || raw.startsWith('//')
          || /^[A-Za-z]:/.test(raw)
          || parts.length < 2
          || (stripped !== '' && /^(?:\.\.?)(?:\/|$)/.test(stripped))
          || (stripped !== '' && stripped.split('/').includes('..'))
          || (stripped === '' && type !== 'Directory')
        ) {
          reject(new Error(`Unsafe archive path rejected: ${String(entryPath || '')}`));
          return false;
        }
        return true;
      },
      preservePaths: false,
      preserveOwner: false,
      strict: true,
    });
    nodeStream.pipe(extractor);
    extractor.on('finish', resolve);
    extractor.on('error', reject);
    nodeStream.on('error', reject);
    });
  } catch (error) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }

  fs.rmSync(backupDir, { recursive: true, force: true });
  fs.mkdirSync(backupDir, { recursive: true });
  const swapRecords = [];
  const depsChanged = runtimeDependenciesChanged(runtimeDir, stagingDir);
  try {
    if (depsChanged) {
      // npm may replace or partially replace node_modules. Move the old tree
      // into the same transaction so a failed install restores it exactly.
      const nodeModules = path.join(runtimeDir, 'node_modules');
      const nodeModulesBackup = path.join(backupDir, 'node_modules');
      const nodeModulesRecord = {
        destination: nodeModules,
        backup: nodeModulesBackup,
        backupMoved: false,
        installAttempted: true,
      };
      swapRecords.push(nodeModulesRecord);
      if (pathExistsIncludingLinks(nodeModules)) {
        movePathWithFallback(nodeModules, nodeModulesBackup);
        nodeModulesRecord.backupMoved = true;
      }
    }
    for (const entry of fs.readdirSync(stagingDir)) {
      const src = path.join(stagingDir, entry);
      const dst = path.join(runtimeDir, entry);
      const backup = path.join(backupDir, entry);
      const record = {
        destination: dst,
        backup,
        backupMoved: false,
        installAttempted: false,
      };
      swapRecords.push(record);

      if (pathExistsIncludingLinks(dst)) {
        movePathWithFallback(dst, backup);
        record.backupMoved = true;
      }

      record.installAttempted = true;
      movePathWithFallback(src, dst);
    }
  } catch (error) {
    const rollbackErrors = rollbackRuntimeSwap(swapRecords);
    removePathBestEffort(stagingDir);
    if (rollbackErrors.length > 0) {
      const details = rollbackErrors
        .map((rollbackError) => rollbackError?.message || String(rollbackError))
        .join('; ');
      throw new Error(`Runtime swap failed and rollback was incomplete: ${error?.message || error}; ${details}`, {
        cause: error,
      });
    }
    throw error;
  }
  // The swap is already complete at this point.  Cleanup can race antivirus
  // scanners on Windows; leave the staging directory for the next launch
  // rather than reporting a successful update as failed.
  removePathBestEffort(stagingDir);

  if (depsChanged) {
    color?.info && console.log(`${color.info('[INFO]')} Reconciling runtime node_modules...`);
    try {
      await runNpmInherited(['install', '--production', '--no-audit', '--no-fund', '--no-save'], { cwd: runtimeDir });
      removePathBestEffort(path.join(backupDir, 'node_modules'));
    } catch (error) {
      const rollbackErrors = rollbackRuntimeSwap(swapRecords);
      if (rollbackErrors.length > 0) {
        const details = rollbackErrors
          .map((rollbackError) => rollbackError?.message || String(rollbackError))
          .join('; ');
        throw new Error(`Runtime dependency install failed and rollback was incomplete: ${error?.message || error}; ${details}`, {
          cause: error,
        });
      }
      throw error;
    }
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
