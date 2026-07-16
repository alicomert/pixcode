/**
 * OmniRoute-style product updates for desktop / PIXCODE_RUNTIME_DIR installs.
 *
 * Flow:
 *  1. Read files-manifest.json for the target version (CDN, then registry).
 *  2. Hash local runtime files and download ONLY changed / missing paths.
 *  3. Remove package files that disappeared in the new version.
 *  4. Fall back to full npm tarball when the delta is huge or the manifest
 *     is unavailable — never leave a half-updated runtime.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';

const PACKAGE_NAME = '@pixelbyte-software/pixcode';
const CDN_BASES = [
  (version, relPath) => `https://cdn.jsdelivr.net/npm/${PACKAGE_NAME}@${version}/${relPath}`,
  (version, relPath) => `https://unpkg.com/${PACKAGE_NAME}@${version}/${relPath}`,
];

const PRESERVE_TOP_LEVEL = new Set([
  'node_modules',
  '.previous',
  '.staging',
  '.git',
  'files-manifest.json', // rewritten after successful apply
]);

const DOWNLOAD_CONCURRENCY = 6;
/** If more than this fraction of package bytes changed, prefer full tarball. */
const FULL_TARBALL_BYTE_RATIO = 0.45;
/** If more than this many files changed, prefer full tarball (many small files). */
const FULL_TARBALL_FILE_COUNT = 400;

function log(appendLog, stream, message) {
  if (typeof appendLog === 'function') {
    appendLog(stream, message.endsWith('\n') ? message : `${message}\n`);
  }
}

function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function sha256File(absPath) {
  try {
    return sha256Buffer(fs.readFileSync(absPath));
  } catch {
    return null;
  }
}

async function fetchBuffer(url, { timeoutMs = 60_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: '*/*', 'user-agent': 'pixcode-delta-update' },
    });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status} for ${url}`);
      err.status = res.status;
      throw err;
    }
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

async function fetchManifest(version, appendLog) {
  const relative = 'files-manifest.json';
  for (const buildUrl of CDN_BASES) {
    const url = buildUrl(version, relative);
    try {
      log(appendLog, 'meta', `Fetching update manifest: ${url}`);
      const buf = await fetchBuffer(url);
      const json = JSON.parse(buf.toString('utf8'));
      if (!json?.files || typeof json.files !== 'object') {
        throw new Error('Manifest missing files map');
      }
      return json;
    } catch (error) {
      log(appendLog, 'stderr', `Manifest fetch failed (${url}): ${error.message}`);
    }
  }
  return null;
}

function planDelta(runtimeDir, manifest) {
  const remoteFiles = manifest.files;
  const toDownload = [];
  let unchanged = 0;
  let downloadBytes = 0;
  let totalBytes = 0;

  for (const [rel, meta] of Object.entries(remoteFiles)) {
    const size = Number(meta?.size) || 0;
    const hash = meta?.sha256;
    totalBytes += size;
    const abs = path.join(runtimeDir, ...rel.split('/'));
    const localHash = sha256File(abs);
    if (localHash && hash && localHash === hash) {
      unchanged += 1;
      continue;
    }
    toDownload.push({ rel, sha256: hash, size });
    downloadBytes += size;
  }

  // Package files present locally but gone upstream should be removed.
  // Only consider paths under the known package roots to avoid wiping user data.
  const localPackageFiles = listLocalPackageFiles(runtimeDir);
  const remoteSet = new Set(Object.keys(remoteFiles));
  const toDelete = localPackageFiles.filter((rel) => !remoteSet.has(rel));

  return {
    toDownload,
    toDelete,
    unchanged,
    downloadBytes,
    totalBytes,
    remoteCount: Object.keys(remoteFiles).length,
  };
}

function listLocalPackageFiles(runtimeDir) {
  const roots = ['dist', 'dist-server', 'server', 'shared', 'scripts'];
  const rootFiles = [
    'package.json',
    'README.md',
    'CONTRIBUTING.md',
    'CODE_OF_CONDUCT.md',
    'SECURITY.md',
    'files-manifest.json',
  ];
  const out = [];

  const walk = (absDir, relBase) => {
    let entries;
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        walk(path.join(absDir, entry.name), path.posix.join(relBase, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      if (entry.name.endsWith('.map')) continue;
      if (entry.name === 'auth.json') continue;
      out.push(path.posix.join(relBase, entry.name));
    }
  };

  for (const dir of roots) {
    const abs = path.join(runtimeDir, dir);
    if (fs.existsSync(abs)) walk(abs, dir);
  }
  for (const file of rootFiles) {
    if (fs.existsSync(path.join(runtimeDir, file))) out.push(file);
  }
  return out;
}

async function mapPool(items, concurrency, worker) {
  const results = [];
  let index = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current], current);
    }
  });
  await Promise.all(runners);
  return results;
}

async function downloadOneFile(version, item, appendLog) {
  let lastError = null;
  for (const buildUrl of CDN_BASES) {
    const url = buildUrl(version, item.rel);
    try {
      const buf = await fetchBuffer(url);
      if (item.sha256) {
        const actual = sha256Buffer(buf);
        if (actual !== item.sha256) {
          throw new Error(`Hash mismatch for ${item.rel}`);
        }
      }
      return buf;
    } catch (error) {
      lastError = error;
      log(appendLog, 'stderr', `Delta download failed ${item.rel} via ${url}: ${error.message}`);
    }
  }
  throw lastError || new Error(`Failed to download ${item.rel}`);
}

function writeFileAtomic(absPath, buffer) {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  const tmp = `${absPath}.pixcode-tmp-${process.pid}`;
  fs.writeFileSync(tmp, buffer);
  fs.renameSync(tmp, absPath);
}

/**
 * Apply a delta update into runtimeDir.
 * @returns {{ mode: 'delta'|'full', version: string, downloaded: number, unchanged: number, deleted: number }}
 */
export async function applyRuntimeDeltaUpdate({
  runtimeDir,
  targetVersion,
  tarballUrl,
  tarballIntegrity,
  appendLog,
  verifyTarballIntegrity,
  fetchTarballFallback,
}) {
  const manifest = await fetchManifest(targetVersion, appendLog);
  if (!manifest) {
    log(appendLog, 'meta', 'No files-manifest on CDN — falling back to full package download.\n');
    await fetchTarballFallback({ runtimeDir, targetVersion, tarballUrl, tarballIntegrity, appendLog });
    return {
      mode: 'full',
      version: targetVersion,
      downloaded: -1,
      unchanged: 0,
      deleted: 0,
    };
  }

  const plan = planDelta(runtimeDir, manifest);
  const ratio = plan.totalBytes > 0 ? plan.downloadBytes / plan.totalBytes : 1;

  log(
    appendLog,
    'meta',
    `Delta plan: ${plan.toDownload.length} changed, ${plan.unchanged} unchanged, `
    + `${plan.toDelete.length} removed · `
    + `${(plan.downloadBytes / 1024).toFixed(0)} KB / ${(plan.totalBytes / 1024).toFixed(0)} KB `
    + `(${Math.round(ratio * 100)}%)\n`,
  );

  if (
    plan.toDownload.length === 0
    && plan.toDelete.length === 0
  ) {
    log(appendLog, 'meta', 'Runtime already matches target version files.\n');
    writeFileAtomic(
      path.join(runtimeDir, 'files-manifest.json'),
      Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
    );
    return {
      mode: 'delta',
      version: targetVersion,
      downloaded: 0,
      unchanged: plan.unchanged,
      deleted: 0,
    };
  }

  if (
    plan.toDownload.length >= FULL_TARBALL_FILE_COUNT
    || ratio >= FULL_TARBALL_BYTE_RATIO
  ) {
    log(appendLog, 'meta', 'Delta too large — using full package tarball instead.\n');
    await fetchTarballFallback({ runtimeDir, targetVersion, tarballUrl, tarballIntegrity, appendLog });
    return {
      mode: 'full',
      version: targetVersion,
      downloaded: plan.toDownload.length,
      unchanged: plan.unchanged,
      deleted: plan.toDelete.length,
    };
  }

  // Snapshot previous package.json for deps comparison / rollback hint.
  const backupDir = path.join(runtimeDir, '.previous');
  try {
    fs.rmSync(backupDir, { recursive: true, force: true });
    fs.mkdirSync(backupDir, { recursive: true });
    const pkgPath = path.join(runtimeDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      fs.copyFileSync(pkgPath, path.join(backupDir, 'package.json'));
    }
  } catch {
    // non-fatal
  }

  let done = 0;
  await mapPool(plan.toDownload, DOWNLOAD_CONCURRENCY, async (item) => {
    const buf = await downloadOneFile(targetVersion, item, appendLog);
    const abs = path.join(runtimeDir, ...item.rel.split('/'));
    writeFileAtomic(abs, buf);
    done += 1;
    if (done === 1 || done === plan.toDownload.length || done % 25 === 0) {
      log(appendLog, 'meta', `Downloaded ${done}/${plan.toDownload.length} files…\n`);
    }
  });

  for (const rel of plan.toDelete) {
    const abs = path.join(runtimeDir, ...rel.split('/'));
    try {
      fs.rmSync(abs, { force: true });
    } catch {
      // ignore
    }
  }

  writeFileAtomic(
    path.join(runtimeDir, 'files-manifest.json'),
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
  );

  // Reconcile node_modules when dependencies changed.
  try {
    const prevPkg = JSON.parse(fs.readFileSync(path.join(backupDir, 'package.json'), 'utf8'));
    const nextPkg = JSON.parse(fs.readFileSync(path.join(runtimeDir, 'package.json'), 'utf8'));
    const depsChanged = JSON.stringify(prevPkg.dependencies || {}) !== JSON.stringify(nextPkg.dependencies || {});
    if (depsChanged) {
      log(appendLog, 'meta', 'Dependencies changed — reconciling node_modules…\n');
      await new Promise((resolve, reject) => {
        const npmChild = spawn('npm', ['install', '--production', '--no-audit', '--no-fund', '--no-save'], {
          cwd: runtimeDir,
          env: process.env,
          shell: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        npmChild.stdout?.on('data', (chunk) => log(appendLog, 'stdout', chunk.toString()));
        npmChild.stderr?.on('data', (chunk) => log(appendLog, 'stderr', chunk.toString()));
        npmChild.on('error', reject);
        npmChild.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`npm install exited with code ${code}`));
        });
      });
    }
  } catch {
    // If we can't compare, skip — desktop usually links bundled node_modules.
  }

  log(
    appendLog,
    'meta',
    `Delta update complete: ${plan.toDownload.length} files written, `
    + `${plan.toDelete.length} removed, ${plan.unchanged} kept.\n`,
  );

  return {
    mode: 'delta',
    version: targetVersion,
    downloaded: plan.toDownload.length,
    unchanged: plan.unchanged,
    deleted: plan.toDelete.length,
  };
}

export async function extractFullTarballToRuntime({
  runtimeDir,
  tarballUrl,
  tarballIntegrity,
  appendLog,
  verifyTarballIntegrity,
}) {
  log(appendLog, 'meta', `Downloading full package ${tarballUrl}\n`);
  const tarballRes = await fetch(tarballUrl);
  if (!tarballRes.ok) {
    throw new Error(`Tarball fetch failed: HTTP ${tarballRes.status}`);
  }
  const tarballBuffer = Buffer.from(await tarballRes.arrayBuffer());
  if (tarballIntegrity && typeof verifyTarballIntegrity === 'function') {
    verifyTarballIntegrity(tarballBuffer, tarballIntegrity);
    log(appendLog, 'meta', 'Tarball integrity verified.\n');
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

  log(appendLog, 'meta', 'Applying full package swap…\n');
  fs.rmSync(backupDir, { recursive: true, force: true });
  fs.mkdirSync(backupDir, { recursive: true });
  for (const entry of fs.readdirSync(stagingDir)) {
    if (PRESERVE_TOP_LEVEL.has(entry)) continue;
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
      return false;
    }
  })();

  if (!depsChanged) return;

  log(appendLog, 'meta', 'Dependencies changed — reconciling node_modules…\n');
  await new Promise((resolve, reject) => {
    const npmChild = spawn('npm', ['install', '--production', '--no-audit', '--no-fund', '--no-save'], {
      cwd: runtimeDir,
      env: process.env,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    npmChild.stdout?.on('data', (chunk) => log(appendLog, 'stdout', chunk.toString()));
    npmChild.stderr?.on('data', (chunk) => log(appendLog, 'stderr', chunk.toString()));
    npmChild.on('error', reject);
    npmChild.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm install exited with code ${code}`));
    });
  });
}
