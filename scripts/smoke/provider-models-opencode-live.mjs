#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tempHome = await mkdtemp(path.join(os.tmpdir(), 'pixcode-provider-models-'));
process.env.HOME = tempHome;
process.env.OPENCODE_MODELS_URL = 'https://models.dev/test-api.json';

const calls = [];
globalThis.fetch = async (url) => {
  calls.push(String(url));
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        opencode: {
          name: 'OpenCode Zen',
          models: {
            'big-pickle': {
              name: 'Big Pickle',
              cost: { input: 0, output: 0 },
              limit: { context: 128000 },
            },
            'fresh-free': {
              name: 'Fresh Free',
              cost: { input: 0, output: 0 },
              limit: { context: 64000 },
            },
          },
        },
      };
    },
  };
};

const { getProviderModels } = await import('../../server/services/provider-models.js');

const staleStatic = [
  { value: 'opencode/hy3-preview-free', label: 'Stale Hy3 Preview' },
  { value: 'opencode/ling-2.6-flash-free', label: 'Stale Ling 2.6 Flash' },
];

const refreshed = await getProviderModels('opencode', {
  forceRefresh: true,
  staticList: staleStatic,
});
const refreshedValues = refreshed.models.map((model) => model.value);
assert.equal(calls.length, 1, 'force refresh should fetch the OpenCode live catalog once');
assert.ok(refreshedValues.includes('opencode/fresh-free'), 'live OpenCode models should be returned');
assert.ok(!refreshedValues.includes('opencode/hy3-preview-free'), 'stale static OpenCode models must not be merged into a successful live catalog');
assert.ok(!refreshedValues.includes('opencode/ling-2.6-flash-free'), 'stale static OpenCode models must not survive a successful live refresh');

const cached = await getProviderModels('opencode', {
  staticList: staleStatic,
});
const cachedValues = cached.models.map((model) => model.value);
assert.equal(calls.length, 1, 'fresh cache should be used without another network request');
assert.ok(cachedValues.includes('opencode/fresh-free'), 'cached live OpenCode models should be returned');
assert.ok(!cachedValues.includes('opencode/hy3-preview-free'), 'cached live OpenCode catalog must stay free of stale static models');
assert.ok(!cachedValues.includes('opencode/ling-2.6-flash-free'), 'cached live OpenCode catalog must stay free of stale static models');

console.log('provider OpenCode live model catalog smoke passed');
