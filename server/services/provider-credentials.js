import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    appConfigDb,
    decryptCredentialValue,
    encryptCredentialValue,
} from '../database/db.js';

/**
 * Central credentials store for CLI providers.
 *
 * Store: the encrypted `provider_credentials` entry in Pixcode's auth store.
 * Older releases wrote `~/.pixcode/provider-credentials.json`; that file is
 * migrated once and retained as a timestamped backup rather than being
 * silently deleted. Lets the UI save an API key
 * (and optional base URL for OpenAI-compatible providers) once and have it
 * picked up by:
 *   - the spawn adapters (claude-sdk.js, cursor-cli.js, openai-codex.js,
 *     gemini-cli.js, qwen-code-cli.js) when they launch the CLI subprocess
 *   - the provider-auth modules as an additional "authenticated" signal
 *
 * Keeping credentials in one encrypted store instead of per-CLI config files
 * means we don't have to learn each CLI's settings schema just to set an API
 * key, and users see one "Logout" button that actually clears everything.
 */

const LEGACY_CONFIG_FILE = path.join(os.homedir(), '.pixcode', 'provider-credentials.json');
const STORE_KEY = 'provider_credentials';

/**
 * Map provider id → {apiKeyEnv, baseUrlEnv, extraEnv?} so we know which env
 * vars to inject into the spawn env. Cursor is OAuth-only; it has no api-key
 * entry.
 *
 * `baseUrlEnv` lets users point a provider at any OpenAI-compatible (or
 * Gemini-compatible) endpoint they want — third-party gateways, self-hosted
 * proxies, OpenRouter, Together, etc. — without forking the CLI. The CLI
 * picks the env var up natively because every supported CLI honours its
 * vendor's standard variable names. **Don't rename these.** Pixcode is just
 * a passthrough; people expect the same names that work outside Pixcode.
 *
 * `extraEnv` is a list of additional env-var names that should be mirrored
 * across with the same value as `baseUrlEnv` — handy when a provider has
 * historical aliases (e.g. Gemini's `GOOGLE_GEMINI_BASE_URL` vs newer
 * `GEMINI_BASE_URL` clients).
 */
export const PROVIDER_ENV_VARS = Object.freeze({
    claude:   { apiKeyEnv: 'ANTHROPIC_API_KEY', baseUrlEnv: 'ANTHROPIC_BASE_URL' },
    codex:    { apiKeyEnv: 'OPENAI_API_KEY',    baseUrlEnv: 'OPENAI_BASE_URL' },
    gemini:   {
        apiKeyEnv: 'GEMINI_API_KEY',
        baseUrlEnv: 'GOOGLE_GEMINI_BASE_URL',
        // Some Gemini-API-compatible gateways pick up the shorter
        // `GEMINI_BASE_URL` name; mirror so either client works.
        extraBaseUrlEnv: ['GEMINI_BASE_URL'],
    },
    qwen:     { apiKeyEnv: 'OPENAI_API_KEY',    baseUrlEnv: 'OPENAI_BASE_URL' },
    // OpenCode is multi-provider. Default-set ANTHROPIC_*, but ALSO mirror
    // the same key into OPENAI_API_KEY when the user picks an OpenAI-flavour
    // model — handled at spawn time in opencode-cli.js, not here.
    opencode: { apiKeyEnv: 'ANTHROPIC_API_KEY', baseUrlEnv: 'ANTHROPIC_BASE_URL' },
    // OpenAI-compatible "Custom" provider — used by PixBot chat and any
    // BYOK gateway (OpenRouter, Together, LiteLLM, self-hosted, …).
    // Dedicated env names so we don't clobber Codex/Qwen OPENAI_* keys.
    custom: {
        apiKeyEnv: 'PIXCODE_CUSTOM_API_KEY',
        baseUrlEnv: 'PIXCODE_CUSTOM_BASE_URL',
        extraBaseUrlEnv: ['CUSTOM_API_BASE_URL'],
    },
});

/** Credential-store keys that accept API key + optional base URL (not all are CLI agents). */
export const CREDENTIAL_PROVIDER_IDS = Object.freeze(Object.keys(PROVIDER_ENV_VARS));

function normalizeStore(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const out = {};
    for (const [provider, rawEntry] of Object.entries(value)) {
        if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) continue;
        const apiKey = typeof rawEntry.apiKey === 'string' ? rawEntry.apiKey.trim() : '';
        const baseUrl = typeof rawEntry.baseUrl === 'string' && rawEntry.baseUrl.trim()
            ? rawEntry.baseUrl.trim()
            : null;
        if (!apiKey) continue;
        out[provider] = {
            apiKey,
            baseUrl,
            updatedAt: typeof rawEntry.updatedAt === 'string' ? rawEntry.updatedAt : null,
        };
    }
    return out;
}

function parseStorePayload(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
        return normalizeStore(JSON.parse(value));
    } catch {
        return null;
    }
}

async function backupLegacyStore() {
    try {
        await fs.access(LEGACY_CONFIG_FILE);
    } catch {
        return;
    }

    const backupPath = `${LEGACY_CONFIG_FILE}.migrated-${Date.now()}`;
    try {
        await fs.rename(LEGACY_CONFIG_FILE, backupPath);
        // The backup is deliberately kept for recovery, but remain private
        // on platforms where rename preserves the old mode.
        await fs.chmod(backupPath, 0o600).catch(() => {});
    } catch (error) {
        // A failed backup must not make credential writes fail. The encrypted
        // auth-store write has already succeeded by the time this is called.
        console.warn('[provider-credentials] Could not archive legacy plaintext store:', error?.message || error);
    }
}

async function readStore() {
    // New installs keep provider secrets in the encrypted auth store. The
    // value itself is an AES-GCM `enc:v1:` payload; app_config is otherwise
    // still a normal key/value table, so this does not alter its schema.
    const encrypted = appConfigDb.get(STORE_KEY);
    const decrypted = decryptCredentialValue(encrypted);
    const persisted = parseStorePayload(decrypted);
    if (persisted) {
        // A short-lived development build may have written plain JSON into
        // app_config before encrypted storage existed. Upgrade that value on
        // first read too, so there is only one clear migration path.
        if (typeof encrypted === 'string' && !encrypted.startsWith('enc:v1:')) {
            await writeStore(persisted, { archiveLegacy: false });
        }
        return persisted;
    }

    // One-time migration for pre-encryption releases. We intentionally read
    // the legacy file only when no valid encrypted value exists, then write
    // the encrypted copy and rename the plaintext file to a recoverable
    // timestamped backup.
    try {
        const raw = await fs.readFile(LEGACY_CONFIG_FILE, 'utf8');
        const legacy = parseStorePayload(raw);
        if (!legacy) return {};
        await writeStore(legacy, { archiveLegacy: true });
        return legacy;
    } catch {
        return {};
    }
}

async function writeStore(next, { archiveLegacy = true } = {}) {
    const normalized = normalizeStore(next) || {};
    appConfigDb.set(STORE_KEY, encryptCredentialValue(JSON.stringify(normalized)));
    if (archiveLegacy) await backupLegacyStore();
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
    if (envVars.baseUrlEnv && creds.baseUrl) {
        env[envVars.baseUrlEnv] = creds.baseUrl;
        // Mirror to alias env-var names so clients that read either work.
        for (const alias of envVars.extraBaseUrlEnv || []) {
            env[alias] = creds.baseUrl;
        }
    }
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
        if (envVars.baseUrlEnv && baseUrl) {
            process.env[envVars.baseUrlEnv] = baseUrl;
            for (const alias of envVars.extraBaseUrlEnv || []) {
                process.env[alias] = baseUrl;
            }
        }
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
        for (const alias of envVars.extraBaseUrlEnv || []) {
            if (creds?.baseUrl) process.env[alias] = creds.baseUrl;
            else delete process.env[alias];
        }
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
