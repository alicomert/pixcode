#!/usr/bin/env node
import fs from 'node:fs';

function readText(path) {
  return fs.readFileSync(path, 'utf8');
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function assertIncludes(path, patterns) {
  const content = readText(path);
  for (const pattern of patterns) {
    if (!content.includes(pattern)) {
      throw new Error(`${path} is missing required release-hardening text: ${pattern}`);
    }
  }
}

const rootPackage = readJson('package.json');
const desktopPackage = readJson('desktop/package.json');
const releaseConfig = readJson('.release-it.json');
const bundledPixcodeVersion = desktopPackage.dependencies?.['@pixelbyte-software/pixcode'];

if (desktopPackage.version !== rootPackage.version) {
  throw new Error(`desktop package version ${desktopPackage.version} does not match root ${rootPackage.version}`);
}

if (bundledPixcodeVersion !== rootPackage.version) {
  throw new Error(`desktop bundled pixcode version ${bundledPixcodeVersion} does not match root ${rootPackage.version}`);
}

const releaseHooks = releaseConfig.hooks || {};
if (!String(releaseHooks['after:npm:bump'] || '').includes('sync-desktop-release')) {
  throw new Error('release-it must sync desktop package metadata after npm bumps the root version');
}
const afterBump = String(releaseHooks['after:bump'] || '');
if (!afterBump.includes('npm run build') || !afterBump.includes('generate-files-manifest')) {
  throw new Error('release-it must build and regenerate the delta manifest after the version bump');
}
const afterNpmRelease = String(releaseHooks['after:npm:release'] || '');
if (!afterNpmRelease.includes('desktop install --package-lock-only')) {
  throw new Error('release-it must refresh the desktop lockfile after npm publication');
}
if (!afterNpmRelease.includes('git add files-manifest.json desktop/package.json desktop/package-lock.json')) {
  throw new Error('release-it must stage the publish-time manifest and refreshed desktop release metadata before committing the release');
}

assertIncludes('README.md', [
  'macOS Gatekeeper: "Pixcode is damaged"',
  'Fix Gatekeeper.command',
  'xattr -d com.apple.quarantine',
  'unsigned',
]);

assertIncludes('README.tr.md', [
  'macOS Gatekeeper: "Pixcode hasar görmüş"',
  'Fix Gatekeeper.command',
  'xattr -d com.apple.quarantine',
  'imzalı/notarize olmayabilir',
]);

assertIncludes('desktop/README.md', [
  'macOS Gatekeeper fix',
  'Fix Gatekeeper.command',
  'xattr -dr com.apple.quarantine',
  'unsigned',
]);

assertIncludes('desktop/electron-builder.yml', [
  'Pixcode-Setup-${version}.${ext}',
  'Pixcode-${version}-${arch}.${ext}',
  'target: AppImage',
  'build-resources/Fix Gatekeeper.command',
  'identity: null',
]);

assertIncludes('desktop/electron/main.cjs', [
  'PIXCODE_DESKTOP_ALLOW_LAN',
  'PIXCODE_DESKTOP_HOST',
  "const LOOPBACK_HOST = '127.0.0.1'",
  'HOST: DESKTOP_BIND_HOST',
  'PIXCODE_REMOTE_URL',
  'isPixcodeNavigation',
  "url === 'about:blank'",
  'sandbox: true',
  'openExternalPopup',
]);

assertIncludes('desktop/build-resources/Fix Gatekeeper.command', [
  'Pixcode Gatekeeper Fix',
  'xattr -dr com.apple.quarantine "$APP_PATH"',
  'com.apple.quarantine',
  'open "$APP_PATH"',
]);

console.log('v1.38 desktop release hardening smoke passed');
