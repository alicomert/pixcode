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

    for (const [key, definition] of Object.entries(TASKMASTER_CONFIG_FIELDS)) {
        const value = typeof store[key] === 'string' ? store[key].trim() : '';
        if (!value) {
            continue;
        }

        env[definition.env] = value;
        for (const alias of definition.aliases || []) {
            env[alias] = value;
        }
    }

    return env;
}

export async function applyTaskMasterConfigToEnv() {
    const store = await readStore();
    for (const [key, definition] of Object.entries(TASKMASTER_CONFIG_FIELDS)) {
        const stored = typeof store[key] === 'string' ? store[key].trim() : '';
        const envKeys = [definition.env, ...(definition.aliases || [])];
        for (const envKey of envKeys) {
            if (stored) process.env[envKey] = stored;
            else delete process.env[envKey];
        }
    }
}
