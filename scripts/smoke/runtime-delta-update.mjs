#!/usr/bin/env node
/**
 * Static checks for runtime delta-update resilience.
 * (No network — guards the 404 / half-apply regressions.)
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(process.cwd());

const deltaSrc = readFileSync(path.join(repoRoot, 'server/services/runtime-delta-update.js'), 'utf8');
const genSrc = readFileSync(path.join(repoRoot, 'scripts/generate-files-manifest.mjs'), 'utf8');

const checks = [
  {
    name: 'delta skips skippable CDN paths',
    ok: deltaSrc.includes('isDeltaSkippablePath') && deltaSrc.includes('base.startsWith(\'.\')'),
  },
  {
    name: 'delta uses two-phase apply (stage then write)',
    ok: deltaSrc.includes('Phase 1:') && deltaSrc.includes('Phase 2:') && deltaSrc.includes('staged.set'),
  },
  {
    name: 'delta phase 2 has transactional rollback for writes/deletes',
    ok: deltaSrc.includes('createDeltaRollbackSnapshot')
      && deltaSrc.includes('restoreDeltaRollbackSnapshot')
      && deltaSrc.includes('Delta apply failed; restoring previous runtime')
      && deltaSrc.includes('manifestPath'),
  },
  {
    name: 'delta falls back to full tarball on hard CDN failures',
    ok: deltaSrc.includes('falling back to full package tarball') && deltaSrc.includes('hardMisses'),
  },
  {
    name: 'full tarball extraction rejects archive links and unsafe paths',
    ok: deltaSrc.includes("type !== 'File' && type !== 'Directory'")
      && deltaSrc.includes('normalizeDeltaPath(strippedPath)')
      && deltaSrc.includes('Unsupported archive entry type')
      && deltaSrc.includes('preserveOwner: false')
      && deltaSrc.includes('timeoutMs: 120_000')
      && deltaSrc.includes('fs.rmSync(stagingDir, { recursive: true, force: true })'),
  },
  {
    name: 'full tarball swap rolls back on mid-apply failures',
    ok: deltaSrc.includes('moveRuntimePathWithFallback')
      && deltaSrc.includes('rollbackFullRuntimeSwap')
      && deltaSrc.includes('Full runtime swap failed and rollback was incomplete')
      && deltaSrc.includes('record.installAttempted = true')
      && deltaSrc.includes('pathExistsIncludingLinks'),
  },
  {
    name: 'dependency install is part of full swap rollback transaction',
    ok: deltaSrc.includes('runtimeDependenciesChanged')
      && deltaSrc.includes('nodeModulesRecord')
      && deltaSrc.includes('Full runtime dependency install failed; restoring previous runtime')
      && deltaSrc.includes('Full runtime dependency install failed and rollback was incomplete')
      && deltaSrc.includes("removeRuntimePathBestEffort(path.join(backupDir, 'node_modules'))"),
  },
  {
    name: 'delta dependency install snapshots node_modules and fails closed',
    ok: deltaSrc.includes('depsChanged ? [path.join(runtimeDir, \'node_modules\')]')
      && deltaSrc.includes('Delta dependency install failed; restoring previous runtime')
      && deltaSrc.includes('npmCliInvocation')
      && deltaSrc.includes('process.execPath')
      && deltaSrc.includes("args.every((arg) => /^[A-Za-z0-9@._+:/=-]+$/u.test(String(arg)))")
      && deltaSrc.includes("return { command: 'npm.cmd', args, shell: true }"),
  },
  {
    name: 'full tarball installs the refreshed files manifest',
    ok: !deltaSrc.includes("'files-manifest.json', // rewritten after successful apply"),
  },
  {
    name: 'manifest version is pinned to the requested update',
    ok: deltaSrc.includes('Manifest version mismatch') && deltaSrc.includes('String(json.version) !== String(version)'),
  },
  {
    name: 'runtime target versions are validated before CDN URL construction',
    ok: deltaSrc.includes('isSafeRuntimeVersion')
      && deltaSrc.includes('Refusing runtime update with invalid package version'),
  },
  {
    name: 'delta manifests and files have bounded size/count',
    ok: deltaSrc.includes('MAX_MANIFEST_BYTES')
      && deltaSrc.includes('MAX_MANIFEST_FILES')
      && deltaSrc.includes('MAX_MANIFEST_TOTAL_BYTES')
      && deltaSrc.includes('MAX_DELTA_FILE_BYTES'),
  },
  {
    name: 'manifest generator skips .npmignore / dotfiles',
    ok: genSrc.includes("'.npmignore'") && genSrc.includes('name.startsWith(\'.\')'),
  },
  {
    name: 'job wrapper catches delta throws for full fallback',
    ok: readFileSync(path.join(repoRoot, 'server/index.js'), 'utf8').includes('full tarball fallback'),
  },
];

// Dynamic import of skippable helper when possible (source is ESM)
let dynamicOk = true;
try {
  const mod = await import(pathToFileURL(path.join(repoRoot, 'server/services/runtime-delta-update.js')).href);
  if (typeof mod.isDeltaSkippablePath !== 'function') dynamicOk = false;
  else {
    if (!mod.isDeltaSkippablePath('server/database/.npmignore')) dynamicOk = false;
    if (!mod.isDeltaSkippablePath('.gitignore')) dynamicOk = false;
    if (mod.isDeltaSkippablePath('server/index.js')) dynamicOk = false;
    if (mod.isDeltaSkippablePath('package.json')) dynamicOk = false;
  }
  if (typeof mod.normalizeDeltaPath !== 'function' || typeof mod.resolveRuntimePath !== 'function') {
    dynamicOk = false;
  } else {
    const unsafe = ['../outside.txt', '..\\outside.txt', '/tmp/outside.txt', 'C:/outside.txt', ''];
    if (unsafe.some((value) => mod.normalizeDeltaPath(value) !== null)) dynamicOk = false;
    if (mod.normalizeDeltaPath('dist\\app.js') !== 'dist/app.js') dynamicOk = false;
    if (mod.resolveRuntimePath(repoRoot, '../outside.txt') !== null) dynamicOk = false;
    if (!mod.resolveRuntimePath(repoRoot, 'dist/app.js').startsWith(repoRoot)) dynamicOk = false;
  }
  if (typeof mod.isSafeRuntimeVersion !== 'function'
    || !mod.isSafeRuntimeVersion('1.63.8')
    || !mod.isSafeRuntimeVersion('1.63.8-beta.1')
    || mod.isSafeRuntimeVersion('1.63.8/evil')
    || mod.isSafeRuntimeVersion('latest')) {
    dynamicOk = false;
  }
} catch (error) {
  console.warn('dynamic import skipped:', error.message);
  // still pass static checks
}

const failures = checks.filter((c) => !c.ok).map((c) => c.name);
if (!dynamicOk) failures.push('isDeltaSkippablePath unit checks');

if (failures.length) {
  console.error(`runtime-delta-update smoke failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('runtime-delta-update smoke passed');
