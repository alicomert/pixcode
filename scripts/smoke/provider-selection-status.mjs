import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const providerPicker = read('src/components/chat/view/subcomponents/ProviderSelectionEmptyState.tsx');
const providerStatusHook = read('src/components/provider-auth/hooks/useProviderAuthStatus.ts');
const geminiAuth = read('server/modules/providers/list/gemini/gemini-auth.provider.ts');

assert.match(
  providerPicker,
  /const isChecking = !status \|\| status\.loading;/,
  'Provider cards should only show Checking while a request is actually loading.',
);

assert.doesNotMatch(
  providerPicker,
  /const isUnknown = !status \|\| status\.loading \|\| status\.installed === null;/,
  'Completed unknown/error provider status must not be rendered as Checking forever.',
);

assert.match(
  providerPicker,
  /providerSelection\.statusUnavailable/,
  'Provider cards should render a user-facing unavailable state after status errors.',
);

assert.match(
  providerStatusHook,
  /PROVIDER_AUTH_STATUS_TIMEOUT_MS/,
  'Provider auth status requests should have a frontend timeout.',
);

assert.match(
  providerStatusHook,
  /AbortController/,
  'Provider auth status fetches should abort instead of leaving cards loading forever.',
);

assert.match(
  geminiAuth,
  /GEMINI_TOKEN_INFO_TIMEOUT_MS/,
  'Gemini tokeninfo lookup should have a backend timeout.',
);

assert.match(
  geminiAuth,
  /signal: controller\.signal/,
  'Gemini tokeninfo fetch should use an abort signal.',
);

console.log('provider selection status smoke passed');
