import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { authenticatedFetch } from '../../../utils/api';
import StandaloneShell from '../../standalone-shell/view/StandaloneShell';
import { DEFAULT_PROJECT_FOR_EMPTY_SHELL } from '../../../constants/config';
import type { LLMProvider } from '../../../types/app';
import { PROVIDER_DISPLAY_NAMES } from '../types';

import { Check, ExternalLink, KeyRound, Loader2, X } from '@/lib/icons';

type LoginTab = 'browser' | 'apiKey';

type ProviderLoginModalProps = {
  isOpen: boolean;
  onClose: () => void;
  provider?: LLMProvider;
  onComplete?: (exitCode: number) => void;
  customCommand?: string;
  isAuthenticated?: boolean;
};

// ---------- Shell command per provider (Browser tab) ----------
const getProviderCommand = (provider: LLMProvider, customCommand?: string) => {
  if (customCommand) return customCommand;
  if (provider === 'claude') return 'claude --dangerously-skip-permissions /login';
  if (provider === 'cursor') return 'cursor-agent login';
  // Plain `codex login` lets the installed CLI pick its own flow (browser
  // callback locally, device-code on headless). Hardcoding --device-auth
  // broke newer @openai/codex releases that dropped the flag — the shell
  // returned "Process exited with code 1" before printing the auth prompt.
  if (provider === 'codex') return 'codex login';
  // Qwen's full TUI (`qwen` alone) re-draws its ASCII banner on every xterm
  // resize and flooded the embedded terminal. `qwen auth` is a line-oriented
  // subcommand — prints help + auth menu and exits cleanly, no splash spam.
  // Users then type `qwen auth qwen-oauth` or `qwen auth coding-plan`
  // themselves, which opens the auth flow only on demand.
  if (provider === 'qwen') return 'qwen auth';
  // OpenCode's `auth login` is a proper subcommand (not a TUI flag like
  // Gemini's `/auth`), so no TUI-in-TUI fight. Picks up the browser /
  // device-code flow for the upstream provider the user chose.
  if (provider === 'opencode') return 'opencode auth login';
  // Grok Build: launch TUI; auth is interactive inside the CLI.
  if (provider === 'grok') return 'grok';
  return 'gemini'; // Gemini opens its own /auth panel
};

// ---------- API-key metadata (API Key tab) ----------
/**
 * Per-provider metadata the API-key tab needs:
 *  - `title` / `keyLabel`: UI copy
 *  - `keyExample`: placeholder in the key input so users recognise the format
 *  - `supportsBaseUrl`: true when we honour a custom base URL env var (all
 *    OpenAI-compatible endpoints do; Gemini doesn't)
 *  - `baseUrlExample`: placeholder for the base-URL input
 *  - `keyConsoleUrl`: where to get a key
 */
const PROVIDER_KEY_META: Record<
  Exclude<LLMProvider, 'cursor'>,
  {
    keyLabel: string;
    keyExample: string;
    supportsBaseUrl: boolean;
    baseUrlExample?: string;
    keyConsoleUrl: string;
    keyConsoleLabel: string;
    notes?: string;
  }
> = {
  claude: {
    keyLabel: 'Anthropic API Key',
    keyExample: 'sk-ant-...',
    supportsBaseUrl: true,
    baseUrlExample: 'https://api.anthropic.com',
    keyConsoleUrl: 'https://console.anthropic.com/settings/keys',
    keyConsoleLabel: 'Anthropic Console',
  },
  codex: {
    keyLabel: 'OpenAI API Key',
    keyExample: 'sk-...',
    supportsBaseUrl: true,
    baseUrlExample: 'https://api.openai.com/v1',
    keyConsoleUrl: 'https://platform.openai.com/api-keys',
    keyConsoleLabel: 'OpenAI Platform',
  },
  gemini: {
    keyLabel: 'Gemini API Key',
    keyExample: 'AI...',
    supportsBaseUrl: false,
    keyConsoleUrl: 'https://aistudio.google.com/app/apikey',
    keyConsoleLabel: 'Google AI Studio',
  },
  qwen: {
    keyLabel: 'OpenAI-Compatible API Key',
    keyExample: 'sk-... or sk-sp-...',
    supportsBaseUrl: true,
    baseUrlExample: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    keyConsoleUrl: 'https://github.com/QwenLM/qwen-code',
    keyConsoleLabel: 'Qwen Code Docs',
    notes: 'Accepts any OpenAI-compatible endpoint — Alibaba Cloud, ModelScope, OpenRouter, self-hosted, etc.',
  },
  opencode: {
    keyLabel: 'Anthropic API Key (default backend)',
    keyExample: 'sk-ant-...',
    supportsBaseUrl: true,
    baseUrlExample: 'https://api.anthropic.com',
    keyConsoleUrl: 'https://console.anthropic.com/settings/keys',
    keyConsoleLabel: 'Anthropic Console',
    notes: 'OpenCode is multi-provider — this sets the Anthropic credentials. Switch providers via `opencode auth login` or opencode.json.',
  },
  grok: {
    keyLabel: 'xAI API Key (optional)',
    keyExample: 'xai-...',
    supportsBaseUrl: false,
    keyConsoleUrl: 'https://console.x.ai/',
    keyConsoleLabel: 'xAI Console',
    notes: 'Grok Build primarily uses its own CLI login flow. Install from https://x.ai/cli then open the Grok terminal.',
  },
};

function Tab({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

// ---------- Callback paste (Browser tab fallback for remote VPS) ----------
/**
 * When the CLI's OAuth callback hits the user's laptop localhost (127.0.0.1)
 * but the CLI is running on a remote VPS, the token exchange silently fails.
 * The user can paste the dead "connection refused" URL here — the server
 * parses out the port + code and forwards the original GET to its own
 * localhost, where the CLI's callback handler lives.
 */
function CallbackPasteSection({ provider }: { provider: LLMProvider }) {
  const [url, setUrl] = useState('');
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setPending(true);
    setError(null);
    setStatus('idle');
    try {
      const response = await authenticatedFetch(`/api/providers/${provider}/oauth-paste`, {
        method: 'POST',
        body: JSON.stringify({ callbackUrl: trimmed }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `Request failed (${response.status})`);
      }
      setStatus('ok');
      setUrl('');
    } catch (err: any) {
      setError(err?.message || 'Forward failed');
      setStatus('error');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
      <div className="mb-2 font-medium text-foreground">Remote login? Paste the callback URL here</div>
      <p className="mb-3 text-xs text-muted-foreground">
        When the CLI shows <code className="rounded bg-background px-1 font-mono text-[11px]">http://127.0.0.1:PORT/…</code> and
        your browser can&apos;t reach it (VPS setups), copy the failing URL from your address bar and paste it below.
        Pixcode forwards the token exchange to the CLI process on this host.
      </p>
      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://127.0.0.1:49312/callback?code=..."
          className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground focus:border-primary focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
        />
        <button
          onClick={() => void submit()}
          disabled={pending || !url.trim()}
          className="flex min-h-11 items-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Forward'}
        </button>
      </div>
      {status === 'ok' && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
          <Check className="h-3.5 w-3.5" /> Forwarded — check the terminal above for the completion message.
        </div>
      )}
      {status === 'error' && error && (
        <div className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</div>
      )}
    </div>
  );
}

// ---------- API Key tab ----------
function ApiKeyTab({ provider, onSaved }: { provider: LLMProvider; onSaved: () => void }) {
  const meta = PROVIDER_KEY_META[provider as Exclude<LLMProvider, 'cursor'>];
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Pre-fill the base URL (if one is already stored) so users can tweak it
  // without wiping the key. We only fetch the summary shape — the key
  // itself is never returned to the client.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await authenticatedFetch('/api/providers/credentials');
        const data = await response.json().catch(() => ({}));
        if (cancelled || !data?.success) return;
        const entry = data.data?.[provider];
        if (entry?.baseUrl) setBaseUrl(entry.baseUrl);
      } catch {
        // non-fatal
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [provider]);

  const save = async () => {
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) return;
    setPending(true);
    setError(null);
    setStatus('idle');
    try {
      const response = await authenticatedFetch(`/api/providers/${provider}/auth/api-key`, {
        method: 'POST',
        body: JSON.stringify({
          apiKey: trimmedKey,
          baseUrl: meta.supportsBaseUrl && baseUrl.trim() ? baseUrl.trim() : '',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `Request failed (${response.status})`);
      }
      setStatus('ok');
      setApiKey('');
      onSaved();
    } catch (err: any) {
      setError(err?.message || 'Save failed');
      setStatus('error');
    } finally {
      setPending(false);
    }
  };

  if (!meta) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        This provider uses OAuth only — use the Browser tab to log in.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <div className="mx-auto w-full max-w-lg space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <KeyRound className="h-5 w-5 text-foreground" />
          </div>
          <div>
            <h4 className="text-base font-semibold text-foreground">{meta.keyLabel}</h4>
            <a
              href={meta.keyConsoleUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Get a key from {meta.keyConsoleLabel}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        {meta.notes && (
          <div className="rounded-md border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
            {meta.notes}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={meta.keyExample}
            className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground focus:border-primary focus:outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="text-[11px] text-muted-foreground">
            Stored locally in Pixcode's encrypted credential store (0600 permissions).
          </p>
        </div>

        {meta.supportsBaseUrl && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              Base URL <span className="font-normal text-muted-foreground">(optional — use a custom endpoint)</span>
            </label>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={meta.baseUrlExample}
              className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground focus:border-primary focus:outline-none"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-[11px] text-muted-foreground">
              Point at any OpenAI-compatible proxy (OpenRouter, local LLM, self-hosted, budget provider) to cut costs or hit different models.
            </p>
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => void save()}
            disabled={pending || !apiKey.trim()}
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save API Key
          </button>
          {status === 'ok' && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved — reconnect to pick it up.</span>
          )}
          {status === 'error' && error && (
            <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Main modal ----------
export default function ProviderLoginModal({
  isOpen,
  onClose,
  provider = 'claude',
  onComplete,
  customCommand,
  isAuthenticated: _isAuthenticated = false,
}: ProviderLoginModalProps) {
  const { t: _t } = useTranslation('common');
  const apiKeyAvailable = provider !== 'cursor';
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  // Default to the API-key tab when available. Three reasons:
  //   1. Users asked for "our design" to show first, not a raw terminal.
  //   2. The embedded shell only mounts when the Browser tab is active
  //      (conditional render below), so keeping it unmounted avoids the
  //      repeated-banner loop some full-screen TUIs (Qwen Code, Gemini)
  //      trigger when xterm reports a smaller column count than they
  //      expect and they re-render their splash.
  //   3. Cursor is OAuth-only — it still falls back to Browser.
  const [tab, setTab] = useState<LoginTab>(apiKeyAvailable ? 'apiKey' : 'browser');

  // Reset to the default tab whenever the modal is reopened for a different
  // provider, otherwise the previous tab selection survives across opens.
  useEffect(() => {
    if (isOpen) setTab(apiKeyAvailable ? 'apiKey' : 'browser');
  }, [isOpen, provider, apiKeyAvailable]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const focusable = Array.from(
          dialogRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ) ?? [],
        ).filter((element) => element.getClientRects().length > 0);
        if (focusable.length > 0) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          const activeElement = document.activeElement;
          if (event.shiftKey && (activeElement === first || !dialogRef.current?.contains(activeElement))) {
            event.preventDefault();
            last.focus({ preventScroll: true });
          } else if (!event.shiftKey && (activeElement === last || !dialogRef.current?.contains(activeElement))) {
            event.preventDefault();
            first.focus({ preventScroll: true });
          }
        }
        return;
      }

      if (event.key !== 'Escape') return;
      event.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener('keydown', handleKeyDown);
    const focusFrame = window.requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>('[data-provider-login-close]')
        ?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [isOpen]);

  const title = useMemo(() => {
    const name = PROVIDER_DISPLAY_NAMES[provider] ?? provider;
    return `${name} Login`;
  }, [provider]);

  if (!isOpen) return null;

  const command = getProviderCommand(provider, customCommand);
  const handleComplete = (exitCode: number) => onComplete?.(exitCode);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-50 pb-[env(safe-area-inset-bottom,0px)] pt-[env(safe-area-inset-top,0px)] max-md:items-stretch max-md:justify-stretch"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pixcode-provider-login-title"
        className="flex h-3/4 w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl dark:bg-gray-800 max-md:m-0 max-md:h-full max-md:max-w-none max-md:rounded-none md:m-4 md:h-3/4 md:max-w-4xl md:rounded-lg"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
          <h3 id="pixcode-provider-login-title" className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
          <button
            onClick={onClose}
            type="button"
            data-provider-login-close
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            aria-label="Close login modal"
            title="Close login modal"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Tab bar — API Key tab hidden for providers without an API-key path */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <Tab active={tab === 'browser'} onClick={() => setTab('browser')}>
            Browser / OAuth
          </Tab>
          {apiKeyAvailable && (
            <Tab active={tab === 'apiKey'} onClick={() => setTab('apiKey')}>
              API Key
            </Tab>
          )}
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {tab === 'browser' ? (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="min-h-0 flex-1">
                <StandaloneShell
                  project={DEFAULT_PROJECT_FOR_EMPTY_SHELL}
                  command={command}
                  onComplete={handleComplete}
                  minimal={true}
                />
              </div>
              {/* Paste-callback fallback — shown for EVERY provider. From a
                  remote Pixcode (VPS / cloud) the CLI's OAuth callback hits
                  the SERVER's loopback (127.0.0.1 on the VPS), not the
                  user's laptop, so the dead-on-arrival URL needs a paste
                  field even for providers we previously assumed were
                  "API-key only" — Gemini's `gemini auth` and Codex's full
                  OAuth flow both open a localhost callback when the user
                  doesn't pick the device-code path.
                  Earlier conditional ("Gemini hariç") locked VPS users out
                  of two CLIs without warning; better to show the field and
                  have the user ignore it on the device-code path than to
                  hide it and break remote login entirely. */}
              <div className="border-t border-border/40 bg-background/50 px-4 py-3">
                <CallbackPasteSection provider={provider} />
              </div>
            </div>
          ) : (
            <ApiKeyTab provider={provider} onSaved={() => handleComplete(0)} />
          )}
        </div>
      </div>
    </div>
  );
}
