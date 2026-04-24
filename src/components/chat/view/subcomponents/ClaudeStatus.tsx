import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../../lib/utils';
import SessionProviderLogo from '../../../llm-logo-provider/SessionProviderLogo';

type ClaudeStatusProps = {
  status: {
    text?: string;
    tokens?: number;
    can_interrupt?: boolean;
  } | null;
  onAbort?: () => void;
  isLoading: boolean;
  provider?: string;
};

const ACTION_KEYS = [
  'claudeStatus.actions.thinking',
  'claudeStatus.actions.processing',
  'claudeStatus.actions.analyzing',
  'claudeStatus.actions.working',
  'claudeStatus.actions.computing',
  'claudeStatus.actions.reasoning',
];
const DEFAULT_ACTION_WORDS = ['Thinking', 'Processing', 'Analyzing', 'Working', 'Computing', 'Reasoning'];

const PROVIDER_LABEL_KEYS: Record<string, string> = {
  claude: 'messageTypes.claude',
  codex: 'messageTypes.codex',
  cursor: 'messageTypes.cursor',
  gemini: 'messageTypes.gemini',
};

function formatElapsedTime(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return mins < 1 ? `${secs}s` : `${mins}m ${secs}s`;
}

export default function ClaudeStatus({
  status,
  onAbort,
  isLoading,
  provider = 'claude',
}: ClaudeStatusProps) {
  const { t } = useTranslation('chat');
  const [elapsedTime, setElapsedTime] = useState(0);

  // Elapsed time ticks once a second while processing. The previous
  // implementation also fired a 500ms interval just to animate "..."
  // dots — that cost two extra re-renders/sec per active chat. The dots
  // are now a pure CSS animation (see the `animate-chat-dots` span
  // below), so we only need one timer here.
  useEffect(() => {
    if (!isLoading) {
      setElapsedTime(0);
      return;
    }
    const startTime = Date.now();
    const timer = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [isLoading]);

  if (!isLoading && !status) return null;

  const actionWords = ACTION_KEYS.map((key, i) => t(key, { defaultValue: DEFAULT_ACTION_WORDS[i] }));
  const statusText = (status?.text || actionWords[Math.floor(elapsedTime / 3) % actionWords.length]).replace(/[.]+$/, '');

  const providerLabel = t(PROVIDER_LABEL_KEYS[provider] || 'claudeStatus.providers.assistant', { defaultValue: 'Assistant' });

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 mb-3 w-full duration-500">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 overflow-hidden rounded-full border border-border/50 bg-slate-100 px-3 py-1.5 shadow-sm backdrop-blur-md dark:bg-slate-900">

        {/* Left Side: Identity & Status */}
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 ring-1 ring-primary/10">
            <SessionProviderLogo provider={provider} className="h-3.5 w-3.5" />
            {isLoading && (
              <span className="absolute inset-0 animate-pulse rounded-full ring-2 ring-emerald-500/20" />
            )}
          </div>

          <div className="flex min-w-0 flex-col sm:flex-row sm:items-center sm:gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
              {providerLabel}
            </span>
            <div className="flex items-center gap-1.5">
              <span className={cn("h-1.5 w-1.5 rounded-full", isLoading ? "bg-emerald-500 animate-pulse" : "bg-amber-500")} />
              <p className="truncate text-xs font-medium text-foreground">
                {statusText}
                {isLoading && (
                  <span
                    aria-hidden="true"
                    className="ml-0.5 inline-block w-4 text-primary tabular-nums before:inline-block before:content-['...'] before:animate-chat-dots before:overflow-hidden before:align-bottom"
                  />
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Right Side: Metrics & Actions */}
        <div className="flex items-center gap-2">
          {isLoading && status?.can_interrupt !== false && onAbort && (
            <>
              <div className="hidden items-center rounded-md bg-muted/50 px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground sm:flex">
                {formatElapsedTime(elapsedTime)}
              </div>

              <button
                type="button"
                onClick={onAbort}
                className="group flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-[10px] font-bold text-destructive transition-all hover:bg-destructive hover:text-destructive-foreground"
              >
                <svg className="h-3 w-3 fill-current" viewBox="0 0 24 24">
                  <path d="M6 6h12v12H6z" />
                </svg>
                <span className="hidden sm:inline">STOP</span>
                <kbd className="hidden rounded bg-black/10 px-1 text-[9px] group-hover:bg-white/20 sm:block">
                  ESC
                </kbd>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}