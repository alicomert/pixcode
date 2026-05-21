import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const service = read('server/services/hermes-gateway.js');
const routes = read('server/modules/orchestration/hermes/hermes.routes.ts');
const mcpServer = read('scripts/hermes/pixcode-mcp-server.mjs');
const configureMcp = read('scripts/hermes/configure-pixcode-mcp.mjs');
const settingsTab = read('src/components/settings/view/tabs/HermesSettingsTab.tsx');

assert.match(service, /export async function ensureHermesGateway/, 'Pixcode should expose an API-managed Hermes gateway starter.');
assert.match(service, /export async function probeHermesGateway/, 'Pixcode should probe Hermes through its REST API.');
assert.match(service, /export async function runHermesGatewayPrompt/, 'Pixcode should submit Hermes prompts through the managed REST gateway.');
assert.match(service, /export function stopHermesGateway/, 'Pixcode should be able to stop a managed Hermes gateway process.');
assert.match(service, /\/v1\/chat\/completions/, 'Hermes UI chat should use the documented OpenAI-compatible chat completions endpoint first.');
assert.match(service, /gatewayExitMessage/, 'Hermes gateway failures should include recent stderr/stdout instead of only exit code 1.');
assert.match(service, /API_SERVER_ENABLED:\s*'true'/, 'Hermes gateway env should enable the API server.');
assert.match(service, /API_SERVER_KEY/, 'Hermes gateway env should set a bearer key.');
assert.match(service, /API_SERVER_PORT/, 'Hermes gateway env should choose a REST port.');
assert.match(service, /spawn\(installStatus\.command,\s*\['gateway'\]/, 'Pixcode should start Hermes with `hermes gateway` for REST control.');
assert.match(service, /\/health/, 'Gateway probe should call Hermes health.');
assert.match(service, /\/v1\/capabilities/, 'Gateway probe should verify Hermes capabilities.');
assert.match(service, /\/v1\/models/, 'Gateway probe should verify OpenAI-compatible model discovery.');
assert.match(service, /\/v1\/runs/, 'Gateway probe should support a real run submission when requested.');

assert.match(routes, /router\.get\('\/gateway\/status'/, 'Hermes router should expose gateway status.');
assert.match(routes, /router\.post\('\/gateway\/start'/, 'Hermes router should expose gateway start.');
assert.match(routes, /router\.post\('\/gateway\/probe'/, 'Hermes router should expose a REST probe endpoint.');
assert.match(routes, /router\.post\('\/gateway\/chat'/, 'Hermes router should expose a REST chat endpoint.');
assert.match(routes, /router\.post\('\/gateway\/stop'/, 'Hermes router should expose gateway stop.');
assert.match(routes, /ensureHermesGateway/, 'Hermes router should use the managed gateway service.');
assert.match(routes, /probeHermesGateway/, 'Hermes router should use the REST probe service.');
assert.match(routes, /runHermesGatewayPrompt/, 'Hermes router should send chat prompts through the REST gateway service.');

assert.match(mcpServer, /pixcode_get_hermes_gateway_status/, 'Pixcode MCP should let Hermes inspect gateway status.');
assert.match(mcpServer, /pixcode_probe_hermes_gateway/, 'Pixcode MCP should let Hermes trigger a REST probe.');
assert.match(configureMcp, /pixcode_get_hermes_gateway_status/, 'Hermes MCP config should include gateway status tool.');
assert.match(configureMcp, /pixcode_probe_hermes_gateway/, 'Hermes MCP config should include gateway probe tool.');

assert.match(settingsTab, /gateway\/status/, 'Hermes settings should read gateway status.');
assert.match(settingsTab, /gateway\/start/, 'Hermes settings should start the REST gateway via API.');
assert.match(settingsTab, /gateway\/probe/, 'Hermes settings should run REST probe via API.');

console.log('hermes REST gateway smoke passed');
