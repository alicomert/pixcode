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
const bundledPixcodeVersion = desktopPackage.dependencies?.['@pixelbyte-software/pixcode'];

if (desktopPackage.version !== rootPackage.version) {
  throw new Error(`desktop package version ${desktopPackage.version} does not match root ${rootPackage.version}`);
}

if (bundledPixcodeVersion !== rootPackage.version) {
  throw new Error(`desktop bundled pixcode version ${bundledPixcodeVersion} does not match root ${rootPackage.version}`);
}

assertIncludes('README.md', [
  'macOS Gatekeeper: "Pixcode is damaged"',
  'Fix Gatekeeper.command',
  'xattr -dr com.apple.quarantine',
  'unsigned',
]);

assertIncludes('README.tr.md', [
  'macOS Gatekeeper: "Pixcode hasar görmüş"',
  'Fix Gatekeeper.command',
  'xattr -dr com.apple.quarantine',
  'imzalı/notarize değil',
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

assertIncludes('desktop/build-resources/Fix Gatekeeper.command', [
  'Pixcode Gatekeeper Fix',
  'xattr -cr "$APP_PATH"',
  'com.apple.quarantine',
  'open "$APP_PATH"',
]);

console.log('v1.38 desktop release hardening smoke passed');
