import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Central credentials store for CLI providers.
 *
 * File: `~/.pixcode/provider-credentials.json`. Lets the UI save an API key
 * (and optional base URL for OpenAI-compatible providers) once and have it
 * picked up by:
 *   - the spawn adapters (claude-sdk.js, cursor-cli.js, openai-codex.js,
 *     gemini-cli.js, qwen-code-cli.js) when they launch the CLI subprocess
 *   - the provider-auth modules as an additional "authenticated" signal
 *
 * Keeping credentials in one file instead of per-CLI config files means we
 * don't have to learn each CLI's settings schema just to set an API key,
 * and users see one "Logout" button that actually clears everything.
 */

const CONFIG_FILE = path.join(os.homedir(), '.pixcode', 'provider-credentials.json');

/**
 * Map provider id → {apiKeyEnv, baseUrlEnv} so we know which env vars to
 * inject into the spawn env. Cursor is OAuth-only; it has no api-key entry.
 */
export const PROVIDER_ENV_VARS = Object.freeze({
    claude:   { apiKeyEnv: 'ANTHROPIC_API_KEY', baseUrlEnv: 'ANTHROPIC_BASE_URL' },
    codex:    { apiKeyEnv: 'OPENAI_API_KEY',    baseUrlEnv: 'OPENAI_BASE_URL' },
    gemini:   { apiKeyEnv: 'GEMINI_API_KEY',    baseUrlEnv: null },
    qwen:     { apiKeyEnv: 'OPENAI_API_KEY',    baseUrlEnv: 'OPENAI_BASE_URL' },
    // OpenCode is multi-provider. Set ANTHROPIC_API_KEY by default since
    // Claude is OpenCode Zen's recommended backend; users wanting OpenAI
    // or OpenRouter can override via the opencode.json `provider` block.
    opencode: { apiKeyEnv: 'ANTHROPIC_API_KEY', baseUrlEnv: 'ANTHROPIC_BASE_URL' },
});

async function readStore() {
    try {
        const raw = await fs.readFile(CONFIG_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

async function writeStore(next) {
    await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true });
    await fs.writeFile(CONFIG_FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
}

/**
 * Returns `{ apiKey, baseUrl }` for the given provider, or `null` if no key
 * is stored. Safe to call on any provider id — unknown ids yield null.
 */
export async function getProviderCredentials(provider) {
    const store = await readStore();
    const entry = store[provider];
    if (!entry || typeof entry !== 'object') return null;
    const apiKey = typeof entry.apiKey === 'string' && entry.apiKey.trim() ? entry.apiKey.trim() : null;
    if (!apiKey) return null;
    const baseUrl = typeof entry.baseUrl === 'string' && entry.baseUrl.trim() ? entry.baseUrl.trim() : null;
    return { apiKey, baseUrl };
}

/** Persist credentials; empty string apiKey deletes the entry. */
export async function setProviderCredentials(provider, { apiKey, baseUrl }) {
    const store = await readStore();
    const trimmedKey = typeof apiKey === 'string' ? apiKey.trim() : '';
    if (!trimmedKey) {
        delete store[provider];
    } else {
        store[provider] = {
            apiKey: trimmedKey,
            baseUrl: typeof baseUrl === 'string' && baseUrl.trim() ? baseUrl.trim() : null,
            updatedAt: new Date().toISOString(),
        };
    }
    await writeStore(store);
}

export async function clearProviderCredentials(provider) {
    await setProviderCredentials(provider, { apiKey: '', baseUrl: null });
}

/**
 * Builds an env object that inherits from the server process env and
 * overlays stored credentials for the given provider. Use when spawning
 * a CLI subprocess so the user's Pixcode-configured key is available
 * without leaking unrelated provider keys into the child.
 */
export async function buildSpawnEnv(provider, baseEnv = process.env) {
    const envVars = PROVIDER_ENV_VARS[provider];
    const env = { ...baseEnv };
    if (!envVars) return env;

    const creds = await getProviderCredentials(provider);
    if (!creds) return env;

    if (envVars.apiKeyEnv) env[envVars.apiKeyEnv] = creds.apiKey;
    if (envVars.baseUrlEnv && creds.baseUrl) env[envVars.baseUrlEnv] = creds.baseUrl;
    return env;
}

/**
 * Apply stored credentials onto `process.env` for every known provider.
 * Called on server boot so SDK-based integrations (Claude, Codex) see the
 * API keys without reading our credentials file directly. Subprocess spawns
 * go through `buildSpawnEnv` which layers on top of this.
 */
export async function applyAllStoredCredentialsToEnv() {
    const store = await readStore();
    for (const [provider, envVars] of Object.entries(PROVIDER_ENV_VARS)) {
        const entry = store[provider];
        if (!entry || typeof entry !== 'object') continue;
        const apiKey = typeof entry.apiKey === 'string' ? entry.apiKey.trim() : '';
        const baseUrl = typeof entry.baseUrl === 'string' ? entry.baseUrl.trim() : '';
        if (envVars.apiKeyEnv && apiKey) process.env[envVars.apiKeyEnv] = apiKey;
        if (envVars.baseUrlEnv && baseUrl) process.env[envVars.baseUrlEnv] = baseUrl;
    }
}

/**
 * Sync a single provider's credentials into `process.env` (or clear them
 * when no key is set). Call after mutating the store via the API so the
 * effect is immediate instead of needing a restart.
 */
export async function applyProviderCredentialsToEnv(provider) {
    const envVars = PROVIDER_ENV_VARS[provider];
    if (!envVars) return;
    const creds = await getProviderCredentials(provider);
    if (envVars.apiKeyEnv) {
        if (creds?.apiKey) process.env[envVars.apiKeyEnv] = creds.apiKey;
        else delete process.env[envVars.apiKeyEnv];
    }
    if (envVars.baseUrlEnv) {
        if (creds?.baseUrl) process.env[envVars.baseUrlEnv] = creds.baseUrl;
        else delete process.env[envVars.baseUrlEnv];
    }
}

/** Listing + logout helpers for the UI. */
export async function listProviderCredentialSummaries() {
    const store = await readStore();
    const out = {};
    for (const key of Object.keys(PROVIDER_ENV_VARS)) {
        const entry = store[key];
        out[key] = {
            hasKey: Boolean(entry && typeof entry.apiKey === 'string' && entry.apiKey.trim()),
            baseUrl: entry && typeof entry.baseUrl === 'string' && entry.baseUrl.trim() ? entry.baseUrl.trim() : null,
            updatedAt: entry && typeof entry.updatedAt === 'string' ? entry.updatedAt : null,
        };
    }
    return out;
}
