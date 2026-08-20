#!/usr/bin/env node

import process from 'node:process';

const apiUrl = (process.env.PIXCODE_API_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const apiKey = process.env.PIXCODE_API_KEY || process.env.PIXCODE_AGENT_API_KEY || '';
const providers = (process.env.PIXCODE_PROVIDERS || 'claude,cursor,codex,gemini,qwen,opencode')
  .split(',')
  .map((provider) => provider.trim())
  .filter(Boolean);
const projectPath = process.env.PIXCODE_PROJECT_PATH || process.cwd();
const message = process.env.PIXCODE_SMOKE_MESSAGE
  || 'Reply with exactly "pixcode-smoke-ok". Do not edit files.';
const timeoutMs = Number(process.env.PIXCODE_SMOKE_TIMEOUT_MS || 180000);
const modelMap = parseModelMap(process.env.PIXCODE_PROVIDER_MODELS || '{}');

if (!apiKey) {
  console.error('PIXCODE_API_KEY is required. Create one in Settings -> API Keys and rerun.');
  process.exit(2);
}

const results = [];

for (const provider of providers) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body = {
      provider,
      projectPath,
      message,
      stream: false,
      cleanup: false,
    };
    if (modelMap[provider]) {
      body.model = modelMap[provider];
    }

    const response = await fetch(`${apiUrl}/api/agent`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    const payload = safeJson(text);
    const assistantText = extractAssistantText(payload);
    const ok = response.ok && payload?.success === true && assistantText.trim().length > 0;

    results.push({
      provider,
      status: ok ? 'ok' : 'provider-error',
      httpStatus: response.status,
      success: Boolean(payload?.success),
      durationMs: Date.now() - startedAt,
      sessionId: payload?.sessionId || null,
      assistantPreview: assistantText.trim().slice(0, 240),
      error: ok ? null : (payload?.error || payload?.rawError || text.slice(0, 500)),
    });
  } catch (error) {
    results.push({
      provider,
      status: error?.name === 'AbortError' ? 'timeout' : 'transport-error',
      httpStatus: null,
      success: false,
      durationMs: Date.now() - startedAt,
      sessionId: null,
      assistantPreview: '',
      error: error?.message || String(error),
    });
  } finally {
    clearTimeout(timer);
  }
}

console.log(JSON.stringify({ apiUrl, projectPath, results }, null, 2));
// Let undici/AbortSignal teardown complete before Node exits.  Calling
// process.exit() here can trip a Windows libuv assertion
// (`UV_HANDLE_CLOSING`) after a provider response even when every provider
// result is successful.  Setting exitCode preserves the smoke status while
// allowing the event loop to close its HTTP handles cleanly.
process.exitCode = results.every((result) => result.status === 'ok') ? 0 : 1;

function parseModelMap(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractAssistantText(payload) {
  if (!payload || !Array.isArray(payload.messages)) return '';

  const chunks = [];
  for (const messageItem of payload.messages) {
    if (messageItem?.type !== 'assistant') continue;
    const content = messageItem.message?.content;
    if (typeof content === 'string') {
      chunks.push(content);
      continue;
    }
    if (Array.isArray(content)) {
      for (const part of content) {
        if (typeof part === 'string') {
          chunks.push(part);
        } else if (part?.type === 'text' && typeof part.text === 'string') {
          chunks.push(part.text);
        }
      }
    }
  }
  return chunks.join('');
}
