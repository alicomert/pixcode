import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildCliSpawnEnv, findExecutableOnPath } from './install-jobs.js';

const DEFAULT_RUNTIMES_HOME = path.join(os.homedir(), '.pixcode', 'runtimes');
const MANIFEST_FILE = 'pixcode-runtime.json';
const installLocks = new Map();

function runtimesHome(env = process.env) {
  return env.PIXCODE_MANAGED_RUNTIMES_HOME || DEFAULT_RUNTIMES_HOME;
}

function runtimeDir(id, env = process.env) {
  return path.join(runtimesHome(env), id);
}

function manifestPath(id, env = process.env) {
  return path.join(runtimeDir(id, env), MANIFEST_FILE);
}

async function fileExists(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

async function readManifest(id, env = process.env) {
  try {
    const content = await fs.readFile(manifestPath(id, env), 'utf8');
    const manifest = JSON.parse(content);
    if (manifest?.executablePath && await fileExists(manifest.executablePath)) {
      return manifest;
    }
  } catch {
    // Missing or malformed manifests are treated as not installed.
  }
  return null;
}

function platformTokens() {
  if (process.platform === 'win32') return ['windows'];
  if (process.platform === 'darwin') return ['mac', 'darwin'];
  if (process.platform === 'linux') return ['linux'];
  return [process.platform];
}

function archTokens() {
  if (process.arch === 'x64') return ['x86_64', 'amd64', 'x64'];
  if (process.arch === 'arm64') return ['aarch64', 'arm64'];
  return [process.arch];
}

function scoreFrankenPhpAsset(assetName) {
  const name = assetName.toLowerCase();
  if (!name.includes('frankenphp')) return -1;
  if (name.includes('debug')) return -1;
  if (!platformTokens().some((token) => name.includes(token))) return -1;
  if (!archTokens().some((token) => name.includes(token))) return -1;

  let score = 10;
  if (process.platform === 'win32' && name.endsWith('.zip')) score += 10;
  if (process.platform !== 'win32' && !name.endsWith('.zip')) score += 10;
  if (!name.includes('gnu')) score += 2;
  if (name.endsWith('.tar.gz') || name.endsWith('.tgz')) score += 1;
  return score;
}

function selectFrankenPhpAsset(release) {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const candidates = assets
    .map((asset) => ({ asset, score: scoreFrankenPhpAsset(asset.name || '') }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.asset || null;
}

async function fetchJson(url, env = process.env) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Pixcode Live View',
  };
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Runtime metadata request failed with HTTP ${response.status}`);
  }
  return response.json();
}

async function downloadFile(url, targetFile, env = process.env) {
  const headers = { 'User-Agent': 'Pixcode Live View' };
  if (env.GITHUB_TOKEN && url.includes('github.com')) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Runtime download failed with HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(targetFile, buffer);
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    const child = spawn(command, args, {
      ...options,
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
    });
  });
}

async function extractZip(archivePath, targetDir, env = process.env) {
  if (process.platform === 'win32') {
    const shell = env.ComSpec || process.env.ComSpec || 'powershell.exe';
    const isCmd = shell.toLowerCase().endsWith('cmd.exe');
    if (isCmd) {
      await runProcess('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        'Expand-Archive -Force -LiteralPath $args[0] -DestinationPath $args[1]',
        archivePath,
        targetDir,
      ], { env });
      return;
    }
    await runProcess(shell, [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      'Expand-Archive -Force -LiteralPath $args[0] -DestinationPath $args[1]',
      archivePath,
      targetDir,
    ], { env });
    return;
  }

  await runProcess('unzip', ['-q', archivePath, '-d', targetDir], { env });
}

async function extractTarGz(archivePath, targetDir, env = process.env) {
  await runProcess('tar', ['-xzf', archivePath, '-C', targetDir], { env });
}

async function findRuntimeExecutable(searchRoot, binaryName) {
  const expectedNames = process.platform === 'win32'
    ? [`${binaryName}.exe`, binaryName]
    : [binaryName];
  const stack = [searchRoot];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.isFile() && expectedNames.includes(entry.name)) {
        return full;
      }
    }
  }

  return null;
}

async function installFrankenPhp(env = process.env) {
  const releaseApiUrl = env.PIXCODE_FRANKENPHP_RELEASE_API
    || 'https://api.github.com/repos/php/frankenphp/releases/latest';
  const release = env.PIXCODE_FRANKENPHP_URL ? null : await fetchJson(releaseApiUrl, env);
  const asset = env.PIXCODE_FRANKENPHP_URL
    ? {
      name: path.basename(new URL(env.PIXCODE_FRANKENPHP_URL).pathname),
      browser_download_url: env.PIXCODE_FRANKENPHP_URL,
    }
    : selectFrankenPhpAsset(release);

  if (!asset?.browser_download_url) {
    throw new Error('No FrankenPHP binary is available for this operating system and CPU architecture.');
  }

  const baseDir = runtimeDir('frankenphp', env);
  const stagingDir = path.join(baseDir, `.staging-${Date.now()}`);
  const currentDir = path.join(baseDir, 'current');
  await fs.mkdir(stagingDir, { recursive: true });

  const archivePath = path.join(stagingDir, asset.name || 'frankenphp');
  await downloadFile(asset.browser_download_url, archivePath, env);

  let executablePath = archivePath;
  const assetName = (asset.name || '').toLowerCase();
  if (assetName.endsWith('.zip')) {
    await extractZip(archivePath, stagingDir, env);
    executablePath = await findRuntimeExecutable(stagingDir, 'frankenphp');
    if (!executablePath) {
      throw new Error('Downloaded FrankenPHP archive did not contain a frankenphp executable.');
    }
  } else if (assetName.endsWith('.tar.gz') || assetName.endsWith('.tgz')) {
    await extractTarGz(archivePath, stagingDir, env);
    executablePath = await findRuntimeExecutable(stagingDir, 'frankenphp');
    if (!executablePath) {
      throw new Error('Downloaded FrankenPHP archive did not contain a frankenphp executable.');
    }
  }

  if (process.platform !== 'win32') {
    await fs.chmod(executablePath, 0o755).catch(() => undefined);
  }

  await fs.rm(currentDir, { recursive: true, force: true });
  await fs.mkdir(currentDir, { recursive: true });

  const finalName = process.platform === 'win32' ? 'frankenphp.exe' : 'frankenphp';
  const finalExecutable = path.join(currentDir, finalName);
  await fs.copyFile(executablePath, finalExecutable);
  if (process.platform !== 'win32') {
    await fs.chmod(finalExecutable, 0o755).catch(() => undefined);
  }

  const manifest = {
    id: 'frankenphp',
    label: 'Pixcode PHP runtime',
    provider: 'FrankenPHP',
    version: release?.tag_name || 'custom',
    executablePath: finalExecutable,
    sourceUrl: asset.browser_download_url,
    installedAt: new Date().toISOString(),
  };
  await fs.writeFile(manifestPath('frankenphp', env), JSON.stringify(manifest, null, 2));
  await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
  return manifest;
}

export async function getManagedRuntimeStatus(id, options = {}) {
  const env = options.env || process.env;
  if (id !== 'frankenphp') {
    return {
      id,
      status: 'unsupported',
      installable: false,
      reason: 'Pixcode does not have a managed runtime for this stack yet.',
    };
  }

  const spawnEnv = buildCliSpawnEnv(env);
  const systemExecutable = findExecutableOnPath('frankenphp', spawnEnv);
  if (systemExecutable) {
    return {
      id,
      label: 'FrankenPHP',
      status: 'system',
      installable: true,
      executablePath: systemExecutable,
    };
  }

  const manifest = await readManifest(id, env);
  if (manifest) {
    return {
      id,
      label: manifest.label || 'Pixcode PHP runtime',
      status: 'installed',
      installable: true,
      executablePath: manifest.executablePath,
      version: manifest.version,
    };
  }

  return {
    id,
    label: 'Pixcode PHP runtime',
    provider: 'FrankenPHP',
    status: 'missing',
    installable: true,
    reason: 'Pixcode will prepare a local PHP runtime automatically before starting this project.',
  };
}

export async function ensureManagedRuntime(id, options = {}) {
  const env = options.env || process.env;
  const status = await getManagedRuntimeStatus(id, { env });
  if (status.executablePath) return status;
  if (!status.installable) {
    throw new Error(status.reason || 'This runtime cannot be prepared automatically.');
  }

  const lockKey = `${runtimesHome(env)}:${id}`;
  if (installLocks.has(lockKey)) return installLocks.get(lockKey);

  const installPromise = (async () => {
    if (id === 'frankenphp') {
      const manifest = await installFrankenPhp(env);
      return {
        id,
        label: manifest.label,
        status: 'installed',
        installable: true,
        executablePath: manifest.executablePath,
        version: manifest.version,
      };
    }
    throw new Error(`Unsupported managed runtime: ${id}`);
  })().finally(() => {
    installLocks.delete(lockKey);
  });

  installLocks.set(lockKey, installPromise);
  return installPromise;
}
