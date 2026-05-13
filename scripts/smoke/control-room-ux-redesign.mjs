#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assertIncludes(file, pattern, message) {
  assert.match(file, pattern instanceof RegExp ? pattern : new RegExp(pattern), message);
}

const page = read('src/components/control-room/ControlRoomPage.tsx');
const primitives = read('src/components/control-room/ControlRoomPrimitives.tsx');
const motion = read('src/lib/animations.ts');

for (const symbol of [
  'CONTROL_ROOM_GROUPS',
  'OVERVIEW_CARDS',
  'operations',
  'people',
  'access',
  'security',
  'insights',
]) {
  assertIncludes(page, new RegExp(symbol), `Control Room should include grouped ${symbol} IA.`);
}

const overviewCards = page.match(/id: 'overview-card-/g) || [];
assert.equal(overviewCards.length, 6, 'Control Room first screen should expose exactly six overview action cards.');

assert.doesNotMatch(page, /const sections:/, 'Control Room should not use the old flat feature-wall section list.');
assert.doesNotMatch(page, /v1\.46 launch surface/, 'Control Room should not frame the UI as a release inventory.');
assert.doesNotMatch(page, /activeSection === 'admin'[\s\S]{0,3000}activeSection === 'team'/, 'Control Room should group people/admin concepts instead of flat adjacent sections.');

for (const primitive of [
  'CommandCard',
  'SummaryCard',
  'ControlRoomPanel',
  'ContextDrawer',
  'GuidanceCard',
  'EmptyGuidance',
  'TimelineItem',
  'ActionRow',
  'ResponsiveDataList',
  'AdvancedDisclosure',
]) {
  assertIncludes(primitives, new RegExp(`function ${primitive}|const ${primitive}`), `Control Room primitives should include ${primitive}.`);
  assertIncludes(page, new RegExp(primitive), `ControlRoomPage should use ${primitive}.`);
}

for (const copy of [
  'What needs attention',
  'Running now',
  'Team and access',
  'Security and secrets',
  'Usage and evaluations',
  'Run timeline',
  'Recommended next step',
  'What this means',
]) {
  assertIncludes(page, copy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), `Control Room should include plain-language copy: ${copy}.`);
}

assertIncludes(page, /lg:grid-cols-\[220px_minmax\(0,1fr\)_320px\]/, 'Desktop Control Room should use a master-detail grid.');
assertIncludes(page, /overflow-x-auto lg:hidden/, 'Mobile Control Room should use compact horizontal group navigation.');
assertIncludes(page, /min-h-\[44px\]|h-11/, 'Primary controls should keep mobile touch targets at or above 44px.');
assertIncludes(page, /AdvancedDisclosure/, 'Advanced forms should be hidden behind progressive disclosure.');
assertIncludes(page, /TimelineItem[\s\S]*actor[\s\S]*result/, 'Run timeline should expose readable actor/action/result fields.');
assertIncludes(page, /ContextDrawer/, 'Control Room should include a contextual detail rail or sheet.');

for (const motionSymbol of [
  'surface',
  'drawer',
  'status',
  'useGsapSurfaceTransition',
  'useGsapListReveal',
  'useGsapStatusHighlight',
  'prefersReducedMotion',
]) {
  assertIncludes(motion, new RegExp(motionSymbol), `Shared motion system should include ${motionSymbol}.`);
}

assertIncludes(motion, /prefers-reduced-motion: reduce/, 'Motion utilities should respect prefers-reduced-motion.');
assertIncludes(motion, /opacityOnly|reduced motion|Reduced/, 'Motion utilities should document or implement reduced-motion fallback.');

console.log('control room UX redesign smoke passed');
