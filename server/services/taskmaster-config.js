import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CONFIG_FILE = path.join(os.homedir(), '.pixcode', 'taskmaster-config.json');

export const TASKMASTER_CONFIG_FIELDS = Object.freeze({
    anthropicApiKey: { env: 'ANTHROPIC_API_KEY', secret: true },
    anthropicBaseUrl: { env: 'ANTHROPIC_BASE_URL', secret: false },
    perplexityApiKey: { env: 'PERPLEXITY_API_KEY', secret: true },
    openaiApiKey: { env: 'OPENAI_API_KEY', secret: true },
    openaiBaseUrl: { env: 'OPENAI_BASE_URL', secret: false },
    openaiCompatibleApiKey: {
        env: 'OPENAI_API_KEY',
        secret: true,
        aliases: ['OPENAI_COMPATIBLE_API_KEY', 'CUSTOM_OPENAI_API_KEY'],
    },
    openaiCompatibleBaseUrl: {
        env: 'OPENAI_BASE_URL',
        secret: false,
        aliases: ['OPENAI_COMPATIBLE_BASE_URL', 'CUSTOM_OPENAI_BASE_URL'],
    },
    openaiCompatibleModel: {
        env: 'OPENAI_MODEL',
        secret: false,
        aliases: ['OPENAI_COMPATIBLE_MODEL', 'TASKMASTER_OPENAI_COMPATIBLE_MODEL'],
    },
    googleApiKey: { env: 'GOOGLE_API_KEY', secret: true, aliases: ['GEMINI_API_KEY'] },
    openrouterApiKey: { env: 'OPENROUTER_API_KEY', secret: true },
    azureOpenaiApiKey: { env: 'AZURE_OPENAI_API_KEY', secret: true },
    azureOpenaiEndpoint: { env: 'AZURE_OPENAI_ENDPOINT', secret: false },
    ollamaApiKey: { env: 'OLLAMA_API_KEY', secret: true },
    ollamaBaseUrl: { env: 'OLLAMA_BASE_URL', secret: false },
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

function summarizeConfig(store) {
    const fields = {};
    for (const [key, definition] of Object.entries(TASKMASTER_CONFIG_FIELDS)) {
        const value = typeof store[key] === 'string' ? store[key].trim() : '';
        fields[key] = definition.secret
            ? { hasValue: Boolean(value), updatedAt: store.updatedAt || null }
            : { value: value || '', hasValue: Boolean(value), updatedAt: store.updatedAt || null };
    }

    return {
        fields,
        updatedAt: store.updatedAt || null,
    };
}

function getManagedEnvKeys() {
    const keys = new Set();
    for (const definition of Object.values(TASKMASTER_CONFIG_FIELDS)) {
        keys.add(definition.env);
        for (const alias of definition.aliases || []) {
            keys.add(alias);
        }
    }
    return keys;
}

export function buildTaskMasterConfigEnvValues(store = {}) {
    const values = new Map();
    for (const [key, definition] of Object.entries(TASKMASTER_CONFIG_FIELDS)) {
        const value = typeof store[key] === 'string' ? store[key].trim() : '';
        if (!value) {
            continue;
        }

        values.set(definition.env, value);
        for (const alias of definition.aliases || []) {
            values.set(alias, value);
        }
    }

    return values;
}

export async function getTaskMasterConfigSummary() {
    return summarizeConfig(await readStore());
}

export async function saveTaskMasterConfig(input = {}) {
    const current = await readStore();
    const next = { ...current };

    for (const key of Object.keys(TASKMASTER_CONFIG_FIELDS)) {
        if (!Object.prototype.hasOwnProperty.call(input, key)) {
            continue;
        }

        const value = typeof input[key] === 'string' ? input[key].trim() : '';
        if (!value) {
            delete next[key];
        } else {
            next[key] = value;
        }
    }

    next.updatedAt = new Date().toISOString();
    await writeStore(next);
    await applyTaskMasterConfigToEnv();
    return summarizeConfig(next);
}

export async function buildTaskMasterEnv(baseEnv = process.env) {
    const store = await readStore();
    const env = { ...baseEnv };
    const values = buildTaskMasterConfigEnvValues(store);

    for (const [envKey, value] of values.entries()) {
        env[envKey] = value;
    }

    return env;
}

export async function applyTaskMasterConfigToEnv() {
    const store = await readStore();
    const values = buildTaskMasterConfigEnvValues(store);

    for (const envKey of getManagedEnvKeys()) {
        if (!values.has(envKey)) {
            delete process.env[envKey];
        }
    }

    for (const [envKey, value] of values.entries()) {
        process.env[envKey] = value;
    }
}
