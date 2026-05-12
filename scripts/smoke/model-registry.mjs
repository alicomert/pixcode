import assert from 'node:assert/strict';

import {
  MODEL_REGISTRY_PROVIDERS,
  getDefaultProviderModel,
  getProviderModelRegistryEntry,
  getStaticProviderModels,
  isModelRegistryProvider,
} from '../../server/services/model-registry.js';

const expectedProviders = ['claude', 'cursor', 'codex', 'gemini', 'qwen', 'opencode'];

for (const provider of expectedProviders) {
  assert.equal(isModelRegistryProvider(provider), true, `${provider} should be registry-backed`);
}

assert.deepEqual(MODEL_REGISTRY_PROVIDERS, expectedProviders);
assert.equal(isModelRegistryProvider('unknown'), false);

const opencodeStatic = getStaticProviderModels('opencode');
assert.ok(opencodeStatic.length > 0, 'opencode should retain static fallback models');
assert.ok(opencodeStatic.every((model) => model.source === 'static'), 'fallback models must be marked static');

assert.equal(typeof getDefaultProviderModel('codex'), 'string');
assert.ok(getDefaultProviderModel('codex').length > 0, 'codex default model is required');

const cursorEntry = await getProviderModelRegistryEntry('cursor');
assert.equal(cursorEntry.provider, 'cursor');
assert.ok(Array.isArray(cursorEntry.models), 'registry entry should expose models');
assert.ok(cursorEntry.models.length > 0, 'registry entry should include fallback models');
assert.equal(cursorEntry.defaultModel, getDefaultProviderModel('cursor'));
assert.equal(cursorEntry.freshness.degraded, true, 'cursor has no live catalog and should surface degraded metadata');
assert.equal(cursorEntry.freshness.source, 'fallback');
assert.equal(typeof cursorEntry.error, 'string', 'degraded registry entries should include visible error text');

console.log('model-registry smoke passed');
