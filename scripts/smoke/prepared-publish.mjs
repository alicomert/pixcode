import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const publisher = fs.readFileSync(path.join(root, 'scripts', 'publish-prepared.mjs'), 'utf8');
const releaseGuide = fs.readFileSync(path.join(root, 'docs', 'RELEASING.md'), 'utf8');

assert.equal(packageJson.scripts['publish:prepared'], 'node scripts/publish-prepared.mjs');
assert.match(publisher, /'whoami'/u);
assert.match(publisher, /'publish',\s+'--access',\s+'public'/u);
assert.match(publisher, /'--registry',\s+'https:\/\/registry\.npmjs\.org\/'/u);
assert.match(publisher, /result\.error \? 1/u);
assert.match(publisher, /safe\.directory/u);
assert.match(publisher, /prepared publishes must run from the main branch/u);
assert.match(publisher, /--version requires a semantic version value/u);
assert.match(publisher, /already exists/u);
assert.doesNotMatch(publisher, /npm_[A-Za-z0-9]{10,}/u);
assert.match(releaseGuide, /npm run publish:prepared -- --version 1\.64\.2/u);

console.log('prepared publish safety smoke passed');
