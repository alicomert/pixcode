#!/usr/bin/env node
/**
 * Build a content-addressed file manifest for delta updates.
 * Desktop / runtime-dir installs compare local hashes against this
 * list and download only changed paths instead of the full tarball.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

/** Top-level package roots that ship in the npm tarball and must be patchable. */
const ROOT_DIRS = ['dist', 'dist-server', 'server', 'shared', 'scripts'];
const ROOT_FILES = [
  'package.json',
  'README.md',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  'SECURITY.md',
];

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '.previous',
  '.staging',
  'authdb',
]);

const SKIP_FILE_NAMES = new Set([
  'auth.json',
  '.DS_Store',
]);

function shouldSkipDir(name) {
  return SKIP_DIR_NAMES.has(name) || name.startsWith('.');
}

function walkFiles(absDir, relBase, out) {
  let entries;
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (shouldSkipDir(entry.name)) continue;
      walkFiles(path.join(absDir, entry.name), path.posix.join(relBase, entry.name), out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (SKIP_FILE_NAMES.has(entry.name)) continue;
    // Keep source maps out of the hot delta path — they are optional and large.
    if (entry.name.endsWith('.map')) continue;

    const rel = path.posix.join(relBase, entry.name);
    const abs = path.join(absDir, entry.name);
    const buf = fs.readFileSync(abs);
    out[rel] = {
      sha256: crypto.createHash('sha256').update(buf).digest('hex'),
      size: buf.length,
    };
  }
}

const files = {};

for (const dir of ROOT_DIRS) {
  const abs = path.join(root, dir);
  if (fs.existsSync(abs)) {
    walkFiles(abs, dir, files);
  }
}

for (const file of ROOT_FILES) {
  const abs = path.join(root, file);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
  const buf = fs.readFileSync(abs);
  files[file] = {
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
    size: buf.length,
  };
}

const totalBytes = Object.values(files).reduce((sum, f) => sum + f.size, 0);
const manifest = {
  name: packageJson.name,
  version: packageJson.version,
  generatedAt: new Date().toISOString(),
  fileCount: Object.keys(files).length,
  totalBytes,
  files,
};

const outPath = path.join(root, 'files-manifest.json');
fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(
  `files-manifest.json written: ${manifest.fileCount} files, `
  + `${(totalBytes / 1024 / 1024).toFixed(2)} MB (version ${manifest.version})`,
);
