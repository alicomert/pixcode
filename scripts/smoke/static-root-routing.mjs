#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('server/index.js', 'utf8');
const distStatic = "app.use(express.static(path.join(APP_ROOT, 'dist')";
const publicStatic = "app.use(express.static(path.join(APP_ROOT, 'public')";

const distIndex = source.indexOf(distStatic);
const publicIndex = source.indexOf(publicStatic);

assert.ok(distIndex !== -1, 'dist static middleware is missing');
assert.ok(publicIndex !== -1, 'public static middleware is missing');
assert.ok(distIndex < publicIndex, 'dist static middleware must run before public');
assert.ok(
  source.slice(publicIndex, publicIndex + 160).includes('index: false'),
  'public static middleware must not serve public/index.html for /',
);

console.log('static root routing smoke passed');
