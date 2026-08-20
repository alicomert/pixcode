#!/usr/bin/env node
/**
 * Fail publish if critical package assets are missing.
 * Root cause of the Linux "finishing an update…" infinite page:
 * npm packages shipped without frontend dist/index.html while the
 * Express SPA fallback treats that as a mid-update window forever.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const required = [
  'dist/index.html',
  'dist-server/server/cli.js',
  'dist-server/server/index.js',
  'package.json',
  'files-manifest.json',
  'public/logo.png',
  'public/screenshots/desktop-main.png',
  'public/screenshots/mobile-chat.png',
  'public/screenshots/pixcode-banner.png',
];

const missing = required.filter((rel) => !fs.existsSync(path.join(root, rel)));

if (missing.length > 0) {
  console.error('Package asset verification failed. Missing required files:');
  for (const rel of missing) {
    console.error(`  - ${rel}`);
  }
  console.error('\nRun `npm run build` before publish. Refusing to ship a package without the web UI.');
  process.exit(1);
}

// Sanity: frontend bundle should contain at least one asset chunk.
const assetsDir = path.join(root, 'dist', 'assets');
const assetCount = fs.existsSync(assetsDir)
  ? fs.readdirSync(assetsDir).filter((name) => /\.(js|css)$/i.test(name)).length
  : 0;

if (assetCount < 1) {
  console.error('Package asset verification failed: dist/assets has no js/css bundles.');
  process.exit(1);
}

console.log(`Package assets OK (dist/index.html + ${assetCount} asset bundle(s) + dist-server).`);
