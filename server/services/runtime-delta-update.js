/**
 * OmniRoute-style product updates for desktop / PIXCODE_RUNTIME_DIR installs.
 *
 * Flow:
 *  1. Read files-manifest.json for the target version (CDN, then registry).
 *  2. Hash local runtime files and download ONLY changed / missing paths.
 *  3. Remove package files that disappeared in the new version.
 *  4. Fall back to full npm tarball when the delta is huge, the manifest
 *     is unavailable, or individual CDN fetches fail — never leave a
 *     half-updated runtime (two-phase apply).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';

const PACKAGE_NAME = '@pixelbyte-software/pixcode';
const CDN_BASES = [
  (version, relPath) => `https://cdn.jsdelivr.net/npm/${PACKAGE_NAME}@${version}/${encodeURIPath(relPath)}`,
  (version, relPath) => `https://unpkg.com/${PACKAGE_NAME}@${version}/${encodeURIPath(relPath)}`,
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
/** If this many delta downloads fail as non-skippable, fall back to full tarball. */
const MAX_HARD_DOWNLOAD_FAILURES = 3;

function encodeURIPath(relPath) {
  return String(relPath || '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

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

/**
 * Paths that public CDNs frequently cannot serve (dotfiles, pack-time junk).
 * Never abort an update solely because these 404.
 */
export function isDeltaSkippablePath(relPath) {
  const rel = String(relPath || '').replace(/\\/g, '/');
  const base = path.posix.basename(rel);
  if (!base) return true;
  if (base.startsWith('.')) return true;
  if (base.endsWith('.npmignore') || base === 'npmignore') return true;
  if (base === '.gitignore' || base === '.gitattributes' || base === '.editorconfig') return true;
  if (base.endsWith('.map')) return true;
  if (base === 'Thumbs.db' || base === '.DS_Store') return true;
  // Nested VCS / editor noise if it ever leaks into a manifest
  if (rel.includes('/.git/') || rel.includes('/.github/')) return true;
  return false;
}

async function fetchBuffer(url, { timeoutMs = 90_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: '*/*', 'user-agent': 'pixcode-delta-update' },
      redirect: 'follow',
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
      // Drop undownloadable entries even if an older publisher included them.
      const cleaned = {};
      let stripped = 0;
      for (const [rel, meta] of Object.entries(json.files)) {
        if (isDeltaSkippablePath(rel)) {
          stripped += 1;
          continue;
        }
        cleaned[rel] = meta;
      }
      if (stripped > 0) {
        log(appendLog, 'meta', `Manifest: ignored ${stripped} non-CDN paths (dotfiles / pack-only).\n`);
      }
      json.files = cleaned;
      json.fileCount = Object.keys(cleaned).length;
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
  let skippedRemote = 0;

  for (const [rel, meta] of Object.entries(remoteFiles)) {
    if (isDeltaSkippablePath(rel)) {
      skippedRemote += 1;
      continue;
    }
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
  const remoteSet = new Set(Object.keys(remoteFiles).filter((rel) => !isDeltaSkippablePath(rel)));
  const toDelete = localPackageFiles.filter((rel) => !remoteSet.has(rel) && !isDeltaSkippablePath(rel));

  return {
    toDownload,
    toDelete,
    unchanged,
    downloadBytes,
    totalBytes,
    remoteCount: Object.keys(remoteFiles).length,
    skippedRemote,
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
      if (entry.name.startsWith('.')) continue;
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
  const runners = Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current], current);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * @returns {{ ok: true, buffer: Buffer } | { ok: false, skippable: boolean, error: Error }}
 */
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
      return { ok: true, buffer: buf };
    } catch (error) {
      lastError = error;
      const status = error?.status;
      // Soft-log 404s; hard-log other failures.
      if (status === 404) {
        log(appendLog, 'meta', `CDN miss ${item.rel} (${status}) via ${new URL(url).host}\n`);
      } else {
        log(appendLog, 'stderr', `Delta download failed ${item.rel} via ${url}: ${error.message}`);
      }
    }
  }

  const err = lastError || new Error(`Failed to download ${item.rel}`);
  const skippable = isDeltaSkippablePath(item.rel) || err.status === 404;
  return { ok: false, skippable, error: err };
}

function writeFileAtomic(absPath, buffer) {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  const tmp = `${absPath}.pixcode-tmp-${process.pid}`;
  fs.writeFileSync(tmp, buffer);
  fs.renameSync(tmp, absPath);
}

async function runFullTarballFallback({
  runtimeDir,
  targetVersion,
  tarballUrl,
  tarballIntegrity,
  appendLog,
  verifyTarballIntegrity,
  fetchTarballFallback,
  reason,
}) {
  log(appendLog, 'meta', `${reason} — falling back to full package tarball.\n`);
  if (typeof fetchTarballFallback === 'function') {
    await fetchTarballFallback({
      runtimeDir,
      targetVersion,
      tarballUrl,
      tarballIntegrity,
      appendLog,
    });
  } else {
    await extractFullTarballToRuntime({
      runtimeDir,
      tarballUrl,
      tarballIntegrity,
      appendLog,
      verifyTarballIntegrity,
    });
  }
  return {
    mode: 'full',
    version: targetVersion,
    downloaded: -1,
    unchanged: 0,
    deleted: 0,
    reason,
  };
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
    return runFullTarballFallback({
      runtimeDir,
      targetVersion,
      tarballUrl,
      tarballIntegrity,
      appendLog,
      verifyTarballIntegrity,
      fetchTarballFallback,
      reason: 'No files-manifest on CDN',
    });
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
    return runFullTarballFallback({
      runtimeDir,
      targetVersion,
      tarballUrl,
      tarballIntegrity,
      appendLog,
      verifyTarballIntegrity,
      fetchTarballFallback,
      reason: 'Delta too large',
    });
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

  // Phase 1: download everything into memory (no writes yet → no half-state).
  const staged = new Map(); // rel → Buffer
  let done = 0;
  let softMisses = 0;
  let hardMisses = 0;
  const hardErrors = [];

  await mapPool(plan.toDownload, DOWNLOAD_CONCURRENCY, async (item) => {
    const result = await downloadOneFile(targetVersion, item, appendLog);
    done += 1;
    if (done === 1 || done === plan.toDownload.length || done % 25 === 0) {
      log(appendLog, 'meta', `Downloaded ${done}/${plan.toDownload.length} files…\n`);
    }
    if (result.ok) {
      staged.set(item.rel, result.buffer);
      return;
    }
    if (result.skippable || isDeltaSkippablePath(item.rel)) {
      softMisses += 1;
      log(appendLog, 'meta', `Skipping non-critical path ${item.rel}: ${result.error?.message || 'unavailable'}\n`);
      return;
    }
    hardMisses += 1;
    hardErrors.push(`${item.rel}: ${result.error?.message || 'failed'}`);
  });

  if (hardMisses > 0) {
    log(
      appendLog,
      'stderr',
      `Delta had ${hardMisses} hard failure(s), ${softMisses} soft skip(s).\n`
      + hardErrors.slice(0, 8).map((line) => `  - ${line}`).join('\n')
      + '\n',
    );
    // Never leave a partial apply — full tarball is the recovery path.
    if (hardMisses >= 1 || hardMisses >= MAX_HARD_DOWNLOAD_FAILURES) {
      return runFullTarballFallback({
        runtimeDir,
        targetVersion,
        tarballUrl,
        tarballIntegrity,
        appendLog,
        verifyTarballIntegrity,
        fetchTarballFallback,
        reason: `Delta CDN failures (${hardMisses} required files)`,
      });
    }
  }

  if (staged.size === 0 && plan.toDownload.length > 0 && plan.toDelete.length === 0) {
    return runFullTarballFallback({
      runtimeDir,
      targetVersion,
      tarballUrl,
      tarballIntegrity,
      appendLog,
      verifyTarballIntegrity,
      fetchTarballFallback,
      reason: 'Delta downloaded zero usable files',
    });
  }

  // Phase 2: atomic-ish apply of staged buffers only after a clean download pass.
  for (const [rel, buffer] of staged) {
    const abs = path.join(runtimeDir, ...rel.split('/'));
    writeFileAtomic(abs, buffer);
  }

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
    `Delta update complete: ${staged.size} files written, `
    + `${plan.toDelete.length} removed, ${plan.unchanged} kept`
    + (softMisses ? `, ${softMisses} non-critical skipped` : '')
    + '.\n',
  );

  return {
    mode: 'delta',
    version: targetVersion,
    downloaded: staged.size,
    unchanged: plan.unchanged,
    deleted: plan.toDelete.length,
    skipped: softMisses,
  };
}

export async function extractFullTarballToRuntime({
  runtimeDir,
  tarballUrl,
  tarballIntegrity,
  appendLog,
  verifyTarballIntegrity,
}) {
  if (!tarballUrl) {
    throw new Error('Full package fallback requested but tarballUrl is missing');
  }
  log(appendLog, 'meta', `Downloading full package ${tarballUrl}\n`);
  const tarballRes = await fetch(tarballUrl, {
    headers: { 'user-agent': 'pixcode-delta-update', accept: '*/*' },
    redirect: 'follow',
  });
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
      try {
        fs.renameSync(dst, path.join(backupDir, entry));
      } catch {
        // Windows: fall back to copy+rm if rename across busy files fails
        fs.cpSync(dst, path.join(backupDir, entry), { recursive: true, force: true });
        fs.rmSync(dst, { recursive: true, force: true });
      }
    }
    try {
      fs.renameSync(src, dst);
    } catch {
      fs.cpSync(src, dst, { recursive: true, force: true });
      fs.rmSync(src, { recursive: true, force: true });
    }
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
