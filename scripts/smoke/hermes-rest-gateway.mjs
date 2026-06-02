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
assert.match(service, /export async function requestHermesGateway/, 'Pixcode should proxy documented Hermes gateway endpoints such as /api/jobs.');
assert.match(service, /export async function readHermesDiagnostics/, 'Pixcode should expose redacted Hermes diagnostics for config, auth, MCP, gateway, and cron state.');
assert.match(service, /export async function readHermesControlPlane/, 'Pixcode should expose a Hermes Desktop-style control-plane snapshot.');
assert.match(service, /export async function repairHermesControlPlane/, 'Pixcode should expose a Hermes control-plane repair path.');
assert.match(service, /export function stopHermesGateway/, 'Pixcode should be able to stop a managed Hermes gateway process.');
assert.match(service, /\/v1\/chat\/completions/, 'Hermes UI chat should use the documented OpenAI-compatible chat completions endpoint first.');
assert.match(service, /\/v1\/responses/, 'Hermes UI chat should use the stateful OpenAI-compatible responses endpoint before legacy chat fallback.');
assert.match(service, /transport:\s*'responses'/, 'Hermes REST responses should report their transport for terminal proof output.');
assert.match(service, /resolveHermesGatewayHome/, 'Hermes REST gateway should run from a Pixcode-managed Hermes profile.');
assert.match(service, /seedHermesGatewayHome/, 'Hermes REST gateway should seed the managed profile from the user Hermes profile.');
assert.match(service, /PIXCODE_HERMES_GATEWAY_HOME/, 'Hermes REST gateway profile path should be overrideable for tests and advanced installs.');
assert.match(service, /PIXCODE_MANAGED_HERMES_ENV_PREFIXES/, 'Managed Hermes gateway profile should strip messaging platform env vars.');
assert.match(service, /copyHermesProfileEnv/, 'Managed Hermes gateway profile should copy a sanitized .env instead of raw platform credentials.');
assert.match(service, /gatewayArgs[\s\S]+\['gateway', 'run', '--replace'\]/, 'Pixcode can use replace mode safely inside its managed Hermes gateway profile.');
assert.match(service, /gatewayExitMessage/, 'Hermes gateway failures should include recent stderr/stdout instead of only exit code 1.');
assert.match(service, /API_SERVER_ENABLED:\s*'true'/, 'Hermes gateway env should enable the API server.');
assert.match(service, /API_SERVER_KEY/, 'Hermes gateway env should set a bearer key.');
assert.match(service, /API_SERVER_PORT/, 'Hermes gateway env should choose a REST port.');
assert.match(service, /spawn\(installStatus\.command,\s*gatewayArgs/, 'Pixcode should start Hermes with explicit gateway args for REST control.');
assert.match(service, /\/health/, 'Gateway probe should call Hermes health.');
assert.match(service, /\/v1\/capabilities/, 'Gateway probe should verify Hermes capabilities.');
assert.match(service, /\/v1\/models/, 'Gateway probe should verify OpenAI-compatible model discovery.');
assert.match(service, /\/v1\/runs/, 'Gateway probe should support a real run submission when requested.');

assert.match(routes, /router\.get\('\/gateway\/status'/, 'Hermes router should expose gateway status.');
assert.match(routes, /router\.post\('\/gateway\/start'/, 'Hermes router should expose gateway start.');
assert.match(routes, /router\.post\('\/gateway\/probe'/, 'Hermes router should expose a REST probe endpoint.');
assert.match(routes, /router\.post\('\/gateway\/chat'/, 'Hermes router should expose a REST chat endpoint.');
assert.match(routes, /router\.post\('\/gateway\/request'/, 'Hermes router should expose a generic documented gateway request endpoint.');
assert.match(routes, /router\.get\('\/diagnostics'/, 'Hermes router should expose integration diagnostics.');
assert.match(routes, /router\.get\('\/control-plane'/, 'Hermes router should expose a control-plane snapshot endpoint.');
assert.match(routes, /router\.post\('\/control-plane\/repair'/, 'Hermes router should expose a control-plane repair endpoint.');
assert.match(routes, /router\.post\('\/gateway\/stop'/, 'Hermes router should expose gateway stop.');
assert.match(routes, /ensureHermesGateway/, 'Hermes router should use the managed gateway service.');
assert.match(routes, /probeHermesGateway/, 'Hermes router should use the REST probe service.');
assert.match(routes, /runHermesGatewayPrompt/, 'Hermes router should send chat prompts through the REST gateway service.');
assert.match(routes, /resolveHermesMcpBaseUrl/, 'Hermes MCP should be configured against the local Pixcode API URL instead of the browser request host.');
assert.match(routes, /probeExisting:\s*false/, 'Hermes chat should reuse a running gateway instead of killing it on a transient probe failure.');

assert.match(mcpServer, /pixcode_get_hermes_gateway_status/, 'Pixcode MCP should let Hermes inspect gateway status.');
assert.match(mcpServer, /pixcode_probe_hermes_gateway/, 'Pixcode MCP should let Hermes trigger a REST probe.');
assert.match(mcpServer, /pixcode_get_hermes_diagnostics/, 'Pixcode MCP should let Hermes read redacted integration diagnostics.');
assert.match(mcpServer, /pixcode_get_hermes_control_plane/, 'Pixcode MCP should let Hermes read the full control-plane snapshot.');
assert.match(mcpServer, /pixcode_repair_hermes_control_plane/, 'Pixcode MCP should let Hermes repair stale control-plane wiring.');
assert.match(mcpServer, /pixcode_get_api_manifest/, 'Pixcode MCP should let Hermes discover Pixcode API docs.');
assert.match(mcpServer, /pixcode_api_request/, 'Pixcode MCP should let Hermes call authenticated Pixcode APIs.');
assert.match(mcpServer, /pixcode_hermes_gateway_request/, 'Pixcode MCP should let Hermes call documented gateway APIs.');
assert.match(mcpServer, /pixcode_manage_hermes_cron/, 'Pixcode MCP should expose Hermes cron job management.');
assert.match(mcpServer, /pixcode_send_cli_input/, 'Pixcode MCP should let Hermes continue an existing visible CLI terminal.');
assert.match(configureMcp, /pixcode_get_hermes_gateway_status/, 'Hermes MCP config should include gateway status tool.');
assert.match(configureMcp, /pixcode_probe_hermes_gateway/, 'Hermes MCP config should include gateway probe tool.');
assert.match(configureMcp, /pixcode_get_hermes_diagnostics/, 'Hermes MCP config should include diagnostics tool.');
assert.match(configureMcp, /pixcode_get_hermes_control_plane/, 'Hermes MCP config should include control-plane snapshot tool.');
assert.match(configureMcp, /pixcode_repair_hermes_control_plane/, 'Hermes MCP config should include control-plane repair tool.');
assert.match(configureMcp, /pixcode_manage_hermes_cron/, 'Hermes MCP config should include cron management tool.');
assert.match(configureMcp, /mcp-pixcode/, 'Hermes MCP config should enable the Pixcode MCP toolset for the real CLI.');
assert.match(configureMcp, /hermes-cli/, 'Hermes MCP config should keep the native Hermes CLI toolset enabled for cron/files/terminal tools.');

assert.match(settingsTab, /gateway\/status/, 'Hermes settings should read gateway status.');
assert.match(settingsTab, /gateway\/start/, 'Hermes settings should start the REST gateway via API.');
assert.match(settingsTab, /gateway\/probe/, 'Hermes settings should run REST probe via API.');
assert.match(settingsTab, /diagnostics/, 'Hermes settings should render diagnostics from the server.');
assert.match(settingsTab, /control-plane/, 'Hermes settings should render the control-plane state from the server.');

console.log('hermes REST gateway smoke passed');
