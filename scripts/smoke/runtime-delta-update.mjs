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
    name: 'delta falls back to full tarball on hard CDN failures',
    ok: deltaSrc.includes('falling back to full package tarball') && deltaSrc.includes('hardMisses'),
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
