#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const main = readFileSync('desktop/electron/main.cjs', 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`desktop-tray-icon smoke failed: ${message}`);
    process.exit(1);
  }
}

assert(
  main.includes('function normalizeTrayIcon'),
  'tray icons should be normalized before creating the Electron Tray',
);

assert(
  main.includes("process.platform === 'darwin'") && main.includes('width: 18') && main.includes('height: 18'),
  'macOS menu bar icon should be resized to 18x18 instead of using the 1024 app icon',
);

assert(
  main.includes('setTemplateImage(true)'),
  'macOS menu bar icon should be marked as a template image',
);

assert(
  main.includes('return normalizeTrayIcon(nativeImage.createFromPath(p))'),
  'resolveTrayIcon should return the normalized image',
);

console.log('desktop-tray-icon smoke passed');
