import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('server/routes/user.js', 'utf8');
const hook = readFileSync('src/hooks/useGithubOAuth.ts', 'utf8');
const wizard = readFileSync('src/components/project-creation-wizard/ProjectCreationWizard.tsx', 'utf8');
const wizardCard = readFileSync('src/components/project-creation-wizard/components/GithubAuthenticationCard.tsx', 'utf8');

assert.match(source, /normalizeGithubOAuthCallbackUrl/u);
assert.match(source, /\/api\/user\/github\/oauth\/callback/u);
assert.match(source, /parsed\.protocol !== 'https:'/u);
assert.match(source, /HTTP is allowed only on loopback/u);
assert.match(source, /isLoopbackHostname/u);
assert.match(source, /client_secret: clientSecret/u);
assert.match(source, /callbackOrigin: new URL\(redirectUri\)\.origin/u);
assert.match(source, /fetchGithubOAuthJson/u);
assert.match(source, /GITHUB_OAUTH_HTTP_TIMEOUT_MS/u);
assert.match(source, /request\.once\('aborted'/u);
assert.match(wizard, /useGithubOAuth/u);
assert.match(wizardCard, /onStartGithubOAuth/u);
assert.match(hook, /callbackOriginRef/u);
assert.match(hook, /event\.origin !== expectedOrigin/u);

console.log('GitHub OAuth callback smoke checks passed');
