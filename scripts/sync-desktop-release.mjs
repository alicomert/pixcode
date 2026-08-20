#!/usr/bin/env node
/**
 * Keep the Electron wrapper's package metadata aligned with the root release.
 * The wrapper consumes a published Pixcode package, so its exact dependency
 * must move with the root version before release-it stages the Git changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const desktopPackagePath = path.join(root, 'desktop', 'package.json');
const requestedVersion = String(process.argv[2] || '').trim().replace(/^v/, '');

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(requestedVersion)) {
  console.error('Usage: node scripts/sync-desktop-release.mjs <semver>');
  process.exit(1);
}

const desktopPackage = JSON.parse(fs.readFileSync(desktopPackagePath, 'utf8'));
const previousVersion = desktopPackage.version;
const previousDependency = desktopPackage.dependencies?.['@pixelbyte-software/pixcode'];

desktopPackage.version = requestedVersion;
desktopPackage.dependencies = {
  ...desktopPackage.dependencies,
  '@pixelbyte-software/pixcode': requestedVersion,
};

fs.writeFileSync(desktopPackagePath, `${JSON.stringify(desktopPackage, null, 2)}\n`, 'utf8');

if (previousVersion !== requestedVersion || previousDependency !== requestedVersion) {
  console.log(`Desktop release metadata synced to ${requestedVersion}.`);
} else {
  console.log(`Desktop release metadata already at ${requestedVersion}.`);
}
