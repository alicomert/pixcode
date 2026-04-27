/**
 * Centralized Model Definitions
 * Single source of truth for all supported AI models
 */

/**
 * Claude (Anthropic) Models
 *
 * Note: Claude uses two different formats:
 * - SDK format ('sonnet', 'opus') - used by the UI and claude-sdk.js
 * - API format ('claude-sonnet-4.5') - used by slash commands for display
 */
export const CLAUDE_MODELS = {
  // Models in SDK format (what the actual SDK accepts)
  OPTIONS: [
    { value: "sonnet", label: "Sonnet" },
    { value: "opus", label: "Opus" },
    { value: "haiku", label: "Haiku" },
    // Explicit model-id option for Opus 4.6 (separate from the "opus" alias which
    // tracks whatever Anthropic currently aliases to the latest Opus).
    { value: "claude-opus-4-6", label: "Opus 4.6" },
    { value: "opusplan", label: "Opus Plan" },
    { value: "sonnet[1m]", label: "Sonnet [1M]" },
    { value: "opus[1m]", label: "Opus [1M]" },
  ],

  DEFAULT: "opus",
};

/**
 * Cursor Models
 */
export const CURSOR_MODELS = {
  OPTIONS: [
    { value: "opus-4.6-thinking", label: "Claude 4.6 Opus (Thinking)" },
    { value: "gpt-5.3-codex", label: "GPT-5.3" },
    { value: "gpt-5.2-high", label: "GPT-5.2 High" },
    { value: "gemini-3-pro", label: "Gemini 3 Pro" },
    { value: "opus-4.5-thinking", label: "Claude 4.5 Opus (Thinking)" },
    { value: "gpt-5.2", label: "GPT-5.2" },
    { value: "gpt-5.1", label: "GPT-5.1" },
    { value: "gpt-5.1-high", label: "GPT-5.1 High" },
    { value: "composer-1", label: "Composer 1" },
    { value: "auto", label: "Auto" },
    { value: "sonnet-4.5", label: "Claude 4.5 Sonnet" },
    { value: "sonnet-4.5-thinking", label: "Claude 4.5 Sonnet (Thinking)" },
    { value: "opus-4.5", label: "Claude 4.5 Opus" },
    { value: "gpt-5.1-codex", label: "GPT-5.1 Codex" },
    { value: "gpt-5.1-codex-high", label: "GPT-5.1 Codex High" },
    { value: "gpt-5.1-codex-max", label: "GPT-5.1 Codex Max" },
    { value: "gpt-5.1-codex-max-high", label: "GPT-5.1 Codex Max High" },
    { value: "opus-4.1", label: "Claude 4.1 Opus" },
    { value: "grok", label: "Grok" },
  ],

  DEFAULT: "gpt-5-3-codex",
};

/**
 * Codex (OpenAI) Models
 */
export const CODEX_MODELS = {
  OPTIONS: [
    { value: "gpt-5.4", label: "GPT-5.4" },
    { value: "gpt-5.4-mini", label: "GPT-5.4 mini" },
    { value: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
    { value: "gpt-5.2-codex", label: "GPT-5.2 Codex" },
    { value: "gpt-5.2", label: "GPT-5.2" },
    { value: "gpt-5.1-codex-max", label: "GPT-5.1 Codex Max" },
    { value: "o3", label: "O3" },
    { value: "o4-mini", label: "O4-mini" },
  ],

  DEFAULT: "gpt-5.4",
};

/**
 * Qwen Code Models
 * Covers free tier (Qwen OAuth), Alibaba Coding Plan paid tier, and OpenAI-compat BYOK.
 * Defaults to the coder-focused variant users actually want for Pixcode.
 */
export const QWEN_MODELS = {
  OPTIONS: [
    { value: "qwen3-coder-plus", label: "Qwen3 Coder Plus" },
    { value: "qwen3-coder-next", label: "Qwen3 Coder Next" },
    { value: "qwen3-coder-480B-A35B-instruct", label: "Qwen3 Coder 480B (Instruct)" },
    { value: "qwen3-coder-30B-A3B", label: "Qwen3 Coder 30B" },
    { value: "qwen3.5-plus", label: "Qwen3.5 Plus" },
    { value: "qwen3-max", label: "Qwen3 Max" },
    { value: "glm-4.7", label: "GLM-4.7 (Alibaba Coding Plan)" },
    { value: "kimi-k2.5", label: "Kimi K2.5 (Alibaba Coding Plan)" },
  ],

  DEFAULT: "qwen3-coder-plus",
};

/**
 * OpenCode Models — STATIC FALLBACK ONLY.
 *
 * OpenCode is multi-provider and the live model catalog rotates often
 * (Zen free models come and go; new Anthropic/OpenAI/Google models ship
 * every few weeks). The runtime fetches the live catalog from
 * `https://models.dev/api.json` via server/services/provider-models.js
 * and merges it on top of this list — these entries only show when the
 * fetch fails (offline install, firewalled host).
 *
 * Curated current free Zen tier + canonical paid picks. Update when the
 * fallback feels stale, but the live fetch is the source of truth.
 */
export const OPENCODE_MODELS = {
  OPTIONS: [
    // OpenCode Zen — free tier (no charge, may rate-limit). The "limited
    // time" Zen freebies rotate, so this is the safest small set.
    { value: "opencode/big-pickle", label: "OpenCode Zen · Big Pickle (Free)", free: true },
    { value: "opencode/minimax-m2.5-free", label: "OpenCode Zen · MiniMax M2.5 (Free)", free: true },
    { value: "opencode/hy3-preview-free", label: "OpenCode Zen · Hy3 Preview (Free)", free: true },
    { value: "opencode/ling-2.6-flash-free", label: "OpenCode Zen · Ling 2.6 Flash (Free)", free: true },
    { value: "opencode/nemotron-3-super-free", label: "OpenCode Zen · Nemotron 3 Super (Free)", free: true },
    { value: "opencode/gpt-5-nano", label: "OpenCode Zen · GPT-5 Nano (Free)", free: true },

    // Anthropic — current flagship + cheap.
    { value: "anthropic/claude-opus-4-7", label: "Claude Opus 4.7 (Anthropic)" },
    { value: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Anthropic)" },
    { value: "anthropic/claude-haiku-4-5", label: "Claude Haiku 4.5 (Anthropic)" },

    // OpenAI — current GPT-5 family.
    { value: "openai/gpt-5.4", label: "GPT-5.4 (OpenAI)" },
    { value: "openai/gpt-5.1-codex", label: "GPT-5.1 Codex (OpenAI)" },

    // Google — current Gemini 3 family.
    { value: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (Google)" },
    { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (Google)" },

    // xAI — fast & cheap coding model.
    { value: "xai/grok-code-fast-1", label: "Grok Code Fast 1 (xAI)" },
  ],

  // Free Zen freebie that historically works for unauthed installs.
  DEFAULT: "opencode/big-pickle",
};

/**
 * Gemini Models
 */
export const GEMINI_MODELS = {
  OPTIONS: [
    { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview" },
    { value: "gemini-3-pro-preview", label: "Gemini 3 Pro Preview" },
    { value: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite" },
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { value: "gemini-2.0-pro-exp", label: "Gemini 2.0 Pro Experimental" },
    {
      value: "gemini-2.0-flash-thinking-exp",
      label: "Gemini 2.0 Flash Thinking",
    },
  ],

  DEFAULT: "gemini-3.1-pro-preview",
};
