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
]);

const DOWNLOAD_CONCURRENCY = 6;
/** If more than this fraction of package bytes changed, prefer full tarball. */
const FULL_TARBALL_BYTE_RATIO = 0.45;
/** If more than this many files changed, prefer full tarball (many small files). */
const FULL_TARBALL_FILE_COUNT = 400;
/** If this many delta downloads fail as non-skippable, fall back to full tarball. */
const MAX_HARD_DOWNLOAD_FAILURES = 3;
const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
const MAX_MANIFEST_FILES = 50_000;
const MAX_MANIFEST_TOTAL_BYTES = 512 * 1024 * 1024;
const MAX_DELTA_FILE_BYTES = 128 * 1024 * 1024;

// Registry metadata is external input.  Keep the version constrained to the
// npm semver forms Pixcode publishes before interpolating it into CDN URLs or
// using it as an update target.  In particular, reject slashes, query strings,
// whitespace, and shell/path metacharacters that could redirect a fetch away
// from the expected package artifact.
export function isSafeRuntimeVersion(version) {
  return typeof version === 'string'
    && /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u.test(version.trim());
}

function npmCliInvocation(args) {
  if (process.platform !== 'win32') {
    return { command: 'npm', args, shell: false };
  }

  // Windows npm.cmd shims cannot be spawned with shell:false (Node returns
  // EINVAL). Running npm's JS entrypoint through node avoids shell
  // interpolation of package/version arguments supplied by the registry.
  const configured = String(process.env.npm_execpath || '').trim();
  const npmCli = configured
    ? (path.isAbsolute(configured) ? configured : path.resolve(configured))
    : path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const nodeExec = String(process.env.npm_node_execpath || '').trim()
    || (process.versions?.electron || process.env.ELECTRON_RUN_AS_NODE === '1' ? '' : process.execPath);
  if (nodeExec && fs.existsSync(npmCli) && fs.existsSync(nodeExec)) {
    return { command: nodeExec, args: [npmCli, ...args], shell: false };
  }

  // A packaged Electron child can have no standalone Node executable while
  // npm.cmd remains on PATH. Fall back to the shim only for fixed, shell-safe
  // arguments; arbitrary registry/path strings are rejected.
  if (args.every((arg) => /^[A-Za-z0-9@._+:/=-]+$/u.test(String(arg)))) {
    return { command: 'npm.cmd', args, shell: true };
  }
  throw new Error(`npm CLI entrypoint not found: ${npmCli}`);
}

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

/**
 * Normalize and validate a manifest path before it is ever turned into a
 * filesystem path or a CDN URL.  Manifests are fetched from a public CDN, so
 * treat every path as untrusted input.  Keep the canonical form POSIX-style
 * because manifests are generated from npm package paths on every platform.
 *
 * @returns {string|null} canonical relative path, or null for an unsafe path
 */
export function normalizeDeltaPath(relPath) {
  if (typeof relPath !== 'string' || relPath.length === 0 || relPath.includes('\0')) {
    return null;
  }

  // A manifest is platform independent.  Convert Windows separators before
  // normalizing so `..\\outside` cannot bypass the traversal checks below.
  const posixPath = relPath.replace(/\\/g, '/');

  // Reject POSIX absolute paths, UNC paths, and Windows drive-qualified paths.
  // The drive check intentionally rejects `C:foo` as well as `C:/foo`; the
  // former is drive-relative on Windows and would otherwise be ambiguous.
  if (
    posixPath.startsWith('/')
    || posixPath.startsWith('//')
    || /^[A-Za-z]:/.test(posixPath)
  ) {
    return null;
  }

  const normalized = path.posix.normalize(posixPath);
  if (
    !normalized
    || normalized === '.'
    || normalized === '..'
    || normalized.startsWith('../')
  ) {
    return null;
  }

  return normalized;
}

/**
 * Resolve a validated manifest path and prove that it remains inside the
 * runtime directory.  Callers use this helper for every read/write/delete
 * target so path handling cannot diverge between update phases.
 */
export function resolveRuntimePath(runtimeDir, relPath) {
  const normalized = normalizeDeltaPath(relPath);
  if (!normalized || typeof runtimeDir !== 'string' || runtimeDir.length === 0) {
    return null;
  }

  const root = path.resolve(runtimeDir);
  const target = path.resolve(root, ...normalized.split('/'));
  const relative = path.relative(root, target);

  // Empty relative means the manifest resolved to the runtime root itself.
  // Reject it even though it is technically contained; updates must target a
  // file, never the runtime directory.
  if (
    !relative
    || relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    return null;
  }

  return target;
}

/**
 * Prove that every existing parent component of a runtime target is a real
 * directory, not a symlink/junction.  Lexical path checks alone are not
 * enough for an update: a locally planted `dist` symlink could otherwise
 * redirect an atomic write or delete outside the runtime directory.
 *
 * The final component is intentionally not checked.  Writes replace that
 * entry atomically (and deletes remove the link itself), while all parents
 * must remain rooted inside `runtimeDir`.
 */
function hasSafeRuntimeParents(runtimeDir, targetPath) {
  const root = path.resolve(runtimeDir);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);
  if (
    !relative
    || relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    return false;
  }

  const parts = relative.split(path.sep);
  let current = root;
  // Include the runtime root itself; a symlinked runtime directory is not a
  // safe update target even when the lexical path appears contained.
  const parentCount = Math.max(parts.length - 1, 0);
  for (let index = -1; index < parentCount; index += 1) {
    if (index >= 0) current = path.join(current, parts[index]);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      // Missing parents are created by writeFileAtomic.  They are safe as
      // long as no existing component can redirect the write.
      if (error?.code === 'ENOENT') continue;
      return false;
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) return false;
  }
  return true;
}

async function fetchBuffer(url, { timeoutMs = 90_000, maxBytes = Number.POSITIVE_INFINITY } = {}) {
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
    const contentLength = Number(res.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new Error(`Refusing oversized response from ${url} (> ${maxBytes} bytes).`);
    }
    // Stream bounded responses so a CDN that omits Content-Length cannot
    // force an unbounded arrayBuffer allocation before the size check.
    if (Number.isFinite(maxBytes) && res.body && typeof res.body.getReader === 'function') {
      const reader = res.body.getReader();
      const chunks = [];
      let total = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value?.byteLength || 0;
          if (total > maxBytes) {
            await reader.cancel().catch(() => {});
            throw new Error(`Refusing oversized response from ${url} (> ${maxBytes} bytes).`);
          }
          chunks.push(Buffer.from(value));
        }
      } finally {
        reader.releaseLock?.();
      }
      return Buffer.concat(chunks, total);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > maxBytes) {
      throw new Error(`Refusing oversized response from ${url} (> ${maxBytes} bytes).`);
    }
    return buffer;
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
      const buf = await fetchBuffer(url, { maxBytes: MAX_MANIFEST_BYTES });
      const json = JSON.parse(buf.toString('utf8'));
      if (
        !json?.files
        || typeof json.files !== 'object'
        || Array.isArray(json.files)
      ) {
        throw new Error('Manifest missing files map');
      }
      if (json.version !== undefined && String(json.version) !== String(version)) {
        throw new Error(`Manifest version mismatch: expected ${version}, got ${String(json.version)}`);
      }
      // Drop undownloadable entries even if an older publisher included them.
      const cleaned = Object.create(null);
      let stripped = 0;
      let rejected = 0;
      let totalBytes = 0;
      const manifestEntries = Object.entries(json.files);
      if (manifestEntries.length > MAX_MANIFEST_FILES) {
        throw new Error(`Manifest contains too many files (${manifestEntries.length} > ${MAX_MANIFEST_FILES})`);
      }
      for (const [rel, meta] of manifestEntries) {
        const normalized = normalizeDeltaPath(rel);
        if (!normalized) {
          rejected += 1;
          continue;
        }
        if (isDeltaSkippablePath(normalized)) {
          stripped += 1;
          continue;
        }
        const size = Number(meta?.size);
        if (
          !meta
          || typeof meta !== 'object'
          || !/^[a-f0-9]{64}$/iu.test(String(meta.sha256 || ''))
          || !Number.isSafeInteger(size)
          || size < 0
        ) {
          rejected += 1;
          continue;
        }
        totalBytes += size;
        if (totalBytes > MAX_MANIFEST_TOTAL_BYTES) {
          throw new Error(`Manifest exceeds the ${MAX_MANIFEST_TOTAL_BYTES}-byte file budget`);
        }
        // A duplicate can occur when a malformed manifest mixes slash styles
        // (`dist\\app.js` and `dist/app.js`).  Keep the first canonical entry
        // so the same file cannot be downloaded twice with conflicting meta.
        if (Object.prototype.hasOwnProperty.call(cleaned, normalized)) {
          rejected += 1;
          continue;
        }
        cleaned[normalized] = meta;
      }
      if (stripped > 0) {
        log(appendLog, 'meta', `Manifest: ignored ${stripped} non-CDN paths (dotfiles / pack-only).\n`);
      }
      if (rejected > 0) {
        log(
          appendLog,
          'stderr',
          `Manifest: rejected ${rejected} unsafe or duplicate path(s).\n`,
        );
        // Do not continue with a partial manifest.  A malformed/hostile
        // manifest that contains no valid files would otherwise make every
        // local package file look stale and schedule it for deletion.  Let the
        // caller use the verified full-tarball recovery path instead.
        throw new Error(`Manifest contains ${rejected} unsafe or duplicate path(s)`);
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
    const abs = resolveRuntimePath(runtimeDir, rel);
    if (!abs) {
      throw new Error(`Unsafe manifest path rejected: ${String(rel)}`);
    }
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
async function downloadOneFile(version, item, appendLog, runtimeDir) {
  // Validate again immediately before fetching.  This is defense-in-depth in
  // case a caller constructs a delta item without going through planDelta().
  if (!resolveRuntimePath(runtimeDir, item.rel)) {
    return {
      ok: false,
      skippable: false,
      error: new Error(`Unsafe manifest path rejected: ${String(item.rel)}`),
    };
  }
  let lastError = null;
  for (const buildUrl of CDN_BASES) {
    const url = buildUrl(version, item.rel);
    try {
      const buf = await fetchBuffer(url, { maxBytes: MAX_DELTA_FILE_BYTES });
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

function writeFileAtomic(runtimeDir, absPath, buffer) {
  // The caller validates the lexical path as well; this second check covers
  // symlink/junction parents immediately before touching the filesystem.
  if (!hasSafeRuntimeParents(runtimeDir, absPath)) {
    throw new Error(`Unsafe runtime parent path rejected: ${absPath}`);
  }
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  // Include a random suffix so two recovery attempts in the same process
  // cannot overwrite one another's temporary file before the atomic rename.
  const tmp = `${absPath}.pixcode-tmp-${process.pid}-${crypto.randomBytes(8).toString('hex')}`;
  fs.writeFileSync(tmp, buffer);
  try {
    fs.renameSync(tmp, absPath);
  } catch (error) {
    // Windows can reject rename-over-existing-file while POSIX replaces it.
    // Preserve the no-network/validated staging guarantees and fall back to
    // a bounded copy only for that platform-specific replacement failure.
    if (process.platform !== 'win32') throw error;
    try {
      // Never let the Windows copy fallback follow a final symlink to an
      // outside target.  Remove the link itself before copying the staged
      // bytes into place.
      try {
        if (fs.lstatSync(absPath).isSymbolicLink()) fs.rmSync(absPath, { force: true });
      } catch (linkError) {
        if (linkError?.code !== 'ENOENT') throw linkError;
      }
      fs.copyFileSync(tmp, absPath);
      fs.rmSync(tmp, { force: true });
    } catch (copyError) {
      try { fs.rmSync(tmp, { force: true }); } catch { /* best effort */ }
      throw copyError;
    }
  }
}

function removeRuntimePath(absPath) {
  try {
    fs.rmSync(absPath, { recursive: true, force: true });
  } catch {
    // Rollback reports the original apply error; cleanup is best effort.
  }
  try {
    fs.rmSync(`${absPath}.pixcode-tmp-${process.pid}`, { force: true });
  } catch {
    // best effort
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

function copySnapshotPath(source, destination) {
  const stat = fs.lstatSync(source);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (stat.isSymbolicLink()) {
    let linkType = 'file';
    if (process.platform === 'win32') {
      try {
        linkType = fs.statSync(source).isDirectory() ? 'junction' : 'file';
      } catch {
        // A dangling link is restored as a file link; this does not follow it.
      }
    }
    fs.symlinkSync(fs.readlinkSync(source), destination, linkType);
    return;
  }
  if (stat.isDirectory()) {
    fs.cpSync(source, destination, { recursive: true, force: true });
    return;
  }
  fs.copyFileSync(source, destination);
}

/**
 * Move a full-package entry while tolerating Windows/EXDEV rename failures.
 * The copy fallback is guarded by an absent destination and is wrapped by the
 * swap transaction below, which removes a partially copied destination before
 * restoring the previous runtime.
 */
function moveRuntimePathWithFallback(source, destination) {
  try {
    fs.renameSync(source, destination);
    return;
  } catch (renameError) {
    try {
      if (pathExistsIncludingLinks(destination)) throw renameError;
      copySnapshotPath(source, destination);
      fs.rmSync(source, { recursive: true, force: true });
      return;
    } catch (copyError) {
      copyError.cause = renameError;
      throw copyError;
    }
  }
}

function removeRuntimePathBestEffort(absPath) {
  try {
    fs.rmSync(absPath, { recursive: true, force: true });
  } catch {
    // Preserve the original swap failure; rollback is best effort.
  }
}

function rollbackFullRuntimeSwap(records) {
  const rollbackErrors = [];
  for (const record of [...records].reverse()) {
    if (!record.installAttempted) continue;
    removeRuntimePathBestEffort(record.destination);
  }
  for (const record of [...records].reverse()) {
    if (!record.backupMoved) continue;
    try {
      moveRuntimePathWithFallback(record.backup, record.destination);
    } catch (error) {
      rollbackErrors.push(error);
    }
  }
  return rollbackErrors;
}

function readPackageDependencies(packagePath) {
  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    return pkg && typeof pkg.dependencies === 'object' && !Array.isArray(pkg.dependencies)
      ? pkg.dependencies
      : {};
  } catch {
    return null;
  }
}

function runtimeDependenciesChanged(runtimeDir, stagingDir) {
  const current = readPackageDependencies(path.join(runtimeDir, 'package.json'));
  const next = readPackageDependencies(path.join(stagingDir, 'package.json'));
  // Preserve the existing updater behaviour when either package manifest is
  // absent or malformed: swap the files but leave the host's node_modules
  // untouched rather than deleting a potentially user-managed install.
  if (!current || !next) return false;
  return JSON.stringify(current) !== JSON.stringify(next);
}

/**
 * Snapshot all paths touched by a delta before Phase 2.  The files are copied
 * to a private staging directory, so a disk/permission failure while applying
 * one file can restore both changed and deleted files without exposing a
 * half-updated runtime to the next process.
 */
function createDeltaRollbackSnapshot(runtimeDir, targets, rollbackDir) {
  if (!hasSafeRuntimeParents(runtimeDir, rollbackDir)) {
    throw new Error('Unsafe delta rollback directory rejected.');
  }
  const stagingRoot = path.dirname(rollbackDir);
  try {
    const stagingStat = fs.lstatSync(stagingRoot);
    if (stagingStat.isSymbolicLink() || !stagingStat.isDirectory()) {
      throw new Error('Runtime staging path is not a real directory.');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    fs.mkdirSync(stagingRoot, { recursive: true });
  }
  fs.rmSync(rollbackDir, { recursive: true, force: true });
  fs.mkdirSync(rollbackDir, { recursive: true });

  const entries = [];
  for (const absPath of targets) {
    const relative = path.relative(path.resolve(runtimeDir), path.resolve(absPath));
    const backupPath = path.join(rollbackDir, ...relative.split(path.sep));
    let existed = false;
    try {
      fs.lstatSync(absPath);
      existed = true;
      copySnapshotPath(absPath, backupPath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    entries.push({ absPath, backupPath, existed });
  }
  return entries;
}

function restoreDeltaRollbackSnapshot(entries) {
  for (const entry of entries) removeRuntimePath(entry.absPath);
  for (const entry of entries) {
    if (!entry.existed) continue;
    try {
      copySnapshotPath(entry.backupPath, entry.absPath);
    } catch {
      // Preserve the original apply error; startup recovery can use the
      // remaining .staging/.previous snapshots for diagnostics.
    }
  }
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
  if (!isSafeRuntimeVersion(targetVersion)) {
    throw new Error(`Refusing runtime update with invalid package version: ${String(targetVersion)}`);
  }
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
      runtimeDir,
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
    const result = await downloadOneFile(targetVersion, item, appendLog, runtimeDir);
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

  // Resolve every target before writing any file.  If a malformed item somehow
  // bypassed the earlier validation, fail before a partial Phase 2 apply.
  const stagedTargets = [];
  for (const [rel, buffer] of staged) {
    const abs = resolveRuntimePath(runtimeDir, rel);
    if (!abs) {
      throw new Error(`Unsafe manifest path rejected during apply: ${String(rel)}`);
    }
    stagedTargets.push({ abs, buffer });
  }
  const deleteTargets = [];
  for (const rel of plan.toDelete) {
    const abs = resolveRuntimePath(runtimeDir, rel);
    if (!abs) {
      throw new Error(`Unsafe delete path rejected during apply: ${String(rel)}`);
    }
    if (!hasSafeRuntimeParents(runtimeDir, abs)) {
      throw new Error(`Unsafe runtime parent path rejected during delete: ${String(rel)}`);
    }
    deleteTargets.push(abs);
  }

  // A dependency manifest change means npm may partially replace the runtime
  // node_modules tree. Include that tree in the same rollback snapshot so an
  // interrupted install restores both code and dependencies.
  let depsChanged = false;
  try {
    const currentPkg = JSON.parse(fs.readFileSync(path.join(runtimeDir, 'package.json'), 'utf8'));
    const stagedPkgBuffer = staged.get('package.json');
    const stagedPkg = stagedPkgBuffer ? JSON.parse(stagedPkgBuffer.toString('utf8')) : null;
    depsChanged = Boolean(stagedPkg)
      && JSON.stringify(currentPkg?.dependencies || {}) !== JSON.stringify(stagedPkg?.dependencies || {});
  } catch {
    // Keep the lightweight delta path when a manifest is absent/malformed.
  }

  // Phase 2: apply only after a clean download pass.  Snapshot every touched
  // path first so disk/permission failures during a multi-file write/delete
  // can be rolled back instead of exposing a half-updated runtime.
  const manifestPath = path.join(runtimeDir, 'files-manifest.json');
  const touchedTargets = Array.from(new Set([
    ...stagedTargets.map(({ abs }) => abs),
    ...deleteTargets,
    manifestPath,
    ...(depsChanged ? [path.join(runtimeDir, 'node_modules')] : []),
  ].map((abs) => path.resolve(abs))));
  for (const abs of touchedTargets) {
    if (!hasSafeRuntimeParents(runtimeDir, abs)) {
      throw new Error(`Unsafe runtime parent path rejected during apply: ${abs}`);
    }
  }
  const rollbackDir = path.join(runtimeDir, '.staging', '.delta-rollback');
  const rollbackEntries = createDeltaRollbackSnapshot(runtimeDir, touchedTargets, rollbackDir);
  try {
    for (const { abs, buffer } of stagedTargets) {
      writeFileAtomic(runtimeDir, abs, buffer);
    }

    for (const abs of deleteTargets) {
      fs.rmSync(abs, { force: true });
    }

    writeFileAtomic(
      runtimeDir,
      manifestPath,
      Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
    );
  } catch (error) {
    log(appendLog, 'stderr', `Delta apply failed; restoring previous runtime: ${error?.message || error}\n`);
    restoreDeltaRollbackSnapshot(rollbackEntries);
    removeRuntimePathBestEffort(rollbackDir);
    throw error;
  }

  // Reconcile node_modules when dependencies changed.
  let depsInstallAttempted = false;
  try {
    if (depsChanged) {
      depsInstallAttempted = true;
      log(appendLog, 'meta', 'Dependencies changed — reconciling node_modules…\n');
      await new Promise((resolve, reject) => {
        const npmInvocation = npmCliInvocation(['install', '--production', '--no-audit', '--no-fund', '--no-save']);
        const npmChild = spawn(npmInvocation.command, npmInvocation.args, {
          cwd: runtimeDir,
          env: process.env,
          shell: npmInvocation.shell,
          windowsHide: true,
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
  } catch (error) {
    if (depsInstallAttempted) {
      log(appendLog, 'stderr', `Delta dependency install failed; restoring previous runtime: ${error?.message || error}\n`);
      restoreDeltaRollbackSnapshot(rollbackEntries);
      removeRuntimePathBestEffort(rollbackDir);
      throw error;
    }
    // If we can't compare, skip — desktop usually links bundled node_modules.
  }

  // Cleanup is best effort after a successful apply.  A transient antivirus
  // lock must not turn a valid update into a reported failure.
  removeRuntimePathBestEffort(rollbackDir);
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
  if (!tarballIntegrity || typeof verifyTarballIntegrity !== 'function') {
    throw new Error('Refusing to install an unverified full package: registry integrity metadata is missing.');
  }
  log(appendLog, 'meta', `Downloading full package ${tarballUrl}\n`);
  // Reuse the abortable fetch path so a stalled registry connection cannot
  // leave the update job (and its staging directory) hanging indefinitely.
  const tarballBuffer = await fetchBuffer(tarballUrl, {
    timeoutMs: 120_000,
    maxBytes: 256 * 1024 * 1024,
  });
  verifyTarballIntegrity(tarballBuffer, tarballIntegrity);
  log(appendLog, 'meta', 'Tarball integrity verified.\n');

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
        // Package archives are untrusted network input.  Do not materialize
        // links/devices that could redirect writes outside the staging
        // directory, and reject absolute/traversal names both before and
        // after node-tar applies `strip: 1`.
        filter: (entryPath, entry) => {
          const type = String(entry?.type || '');
          if (type !== 'File' && type !== 'Directory') {
            throw new Error(`Unsupported archive entry type: ${type || 'unknown'}`);
          }

          const raw = String(entryPath || '').replace(/\\/g, '/');
          const rawParts = raw.split('/');
          const strippedPath = rawParts.slice(1).join('/');
          // npm archives use a single top-level `package/` directory and the
          // extractor strips it.  Validate the path *after* removing that
          // component so `package/../outside` cannot become a valid-looking
          // path only because normalizeDeltaPath collapsed the prefix.
          if (
            raw.startsWith('/')
            || raw.startsWith('//')
            || /^[A-Za-z]:/.test(raw)
            || rawParts.length < 2
            || (
              strippedPath !== ''
              && normalizeDeltaPath(strippedPath) === null
            )
            || (strippedPath === '' && type !== 'Directory')
          ) {
            throw new Error(`Unsafe archive path rejected: ${String(entryPath || '')}`);
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
    // Keep a failed archive from accumulating in the runtime directory or
    // being mistaken for a valid staged update on the next attempt.
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }

  log(appendLog, 'meta', 'Applying full package swap…\n');
  fs.rmSync(backupDir, { recursive: true, force: true });
  fs.mkdirSync(backupDir, { recursive: true });
  const swapRecords = [];
  const depsChanged = runtimeDependenciesChanged(runtimeDir, stagingDir);
  try {
    if (depsChanged) {
      // Dependencies are installed only after the code swap. Move the
      // previous node_modules tree into the same rollback transaction so a
      // failed npm install cannot leave a half-mutated dependency tree behind.
      const nodeModules = path.join(runtimeDir, 'node_modules');
      const nodeModulesBackup = path.join(backupDir, 'node_modules');
      const nodeModulesRecord = {
        destination: nodeModules,
        backup: nodeModulesBackup,
        backupMoved: false,
        installAttempted: false,
      };
      swapRecords.push(nodeModulesRecord);
      if (pathExistsIncludingLinks(nodeModules)) {
        moveRuntimePathWithFallback(nodeModules, nodeModulesBackup);
        nodeModulesRecord.backupMoved = true;
      }
      // Mark this synthetic entry as install-attempted even though it has no
      // staging source: npm may create/partially mutate node_modules below.
      nodeModulesRecord.installAttempted = true;
    }
    for (const entry of fs.readdirSync(stagingDir)) {
      if (PRESERVE_TOP_LEVEL.has(entry)) continue;
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
        moveRuntimePathWithFallback(dst, backup);
        record.backupMoved = true;
      }

      record.installAttempted = true;
      moveRuntimePathWithFallback(src, dst);
    }
  } catch (error) {
    const rollbackErrors = rollbackFullRuntimeSwap(swapRecords);
    removeRuntimePathBestEffort(stagingDir);
    if (rollbackErrors.length > 0) {
      const details = rollbackErrors
        .map((rollbackError) => rollbackError?.message || String(rollbackError))
        .join('; ');
      throw new Error(`Full runtime swap failed and rollback was incomplete: ${error?.message || error}; ${details}`, {
        cause: error,
      });
    }
    throw error;
  }
  // The runtime swap completed successfully; cleanup may be transiently
  // blocked on Windows, so do not misreport the update as failed.
  removeRuntimePathBestEffort(stagingDir);

  if (!depsChanged) return;

  log(appendLog, 'meta', 'Dependencies changed — reconciling node_modules…\n');
  try {
    await new Promise((resolve, reject) => {
      const npmInvocation = npmCliInvocation(['install', '--production', '--no-audit', '--no-fund', '--no-save']);
      const npmChild = spawn(npmInvocation.command, npmInvocation.args, {
        cwd: runtimeDir,
        env: process.env,
        shell: npmInvocation.shell,
        windowsHide: true,
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
    // The old dependency tree is no longer needed after a successful install;
    // remove it to avoid doubling the runtime footprint between updates.
    removeRuntimePathBestEffort(path.join(backupDir, 'node_modules'));
  } catch (error) {
    log(appendLog, 'stderr', `Full runtime dependency install failed; restoring previous runtime: ${error?.message || error}\n`);
    const rollbackErrors = rollbackFullRuntimeSwap(swapRecords);
    if (rollbackErrors.length > 0) {
      const details = rollbackErrors
        .map((rollbackError) => rollbackError?.message || String(rollbackError))
        .join('; ');
      throw new Error(`Full runtime dependency install failed and rollback was incomplete: ${error?.message || error}; ${details}`, {
        cause: error,
      });
    }
    throw error;
  }
}
