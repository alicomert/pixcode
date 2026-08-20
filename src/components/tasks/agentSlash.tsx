
import { cn } from '../../lib/utils';

import type { AgentType } from './types';

import { X } from '@/lib/icons';

export type AgentSlashId = 'claude' | 'opencode' | 'codex' | 'gemini' | 'cursor' | 'qwen' | 'grok';

export type AgentSlashMeta = {
  id: AgentSlashId;
  /** Token stored/sent to backend, e.g. /claude */
  slash: string;
  /** Short label on badge */
  label: string;
  /** Longer title */
  title: string;
  agentType: AgentType;
  /** Tailwind classes for badge chrome */
  className: string;
  /** Small monogram / letter in emblem */
  monogram: string;
};

/** Canonical agent slash tokens for composer + message rendering. */
export const AGENT_SLASH_META: AgentSlashMeta[] = [
  {
    id: 'claude',
    slash: '/claude',
    label: 'Claude',
    title: 'Claude Code',
    agentType: 'claude-code',
    className: 'border-orange-500/40 bg-orange-500/15 text-orange-900 dark:text-orange-100',
    monogram: 'C',
  },
  {
    id: 'opencode',
    slash: '/opencode',
    label: 'OpenCode',
    title: 'OpenCode',
    agentType: 'opencode',
    className: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-900 dark:text-emerald-100',
    monogram: 'O',
  },
  {
    id: 'codex',
    slash: '/codex',
    label: 'Codex',
    title: 'OpenAI Codex',
    agentType: 'codex',
    className: 'border-sky-500/40 bg-sky-500/15 text-sky-900 dark:text-sky-100',
    monogram: 'X',
  },
  {
    id: 'gemini',
    slash: '/gemini',
    label: 'Gemini',
    title: 'Gemini CLI',
    agentType: 'gemini',
    className: 'border-blue-500/40 bg-blue-500/15 text-blue-900 dark:text-blue-100',
    monogram: 'G',
  },
  {
    id: 'cursor',
    slash: '/cursor',
    label: 'Cursor',
    title: 'Cursor CLI',
    agentType: 'cursor',
    className: 'border-violet-500/40 bg-violet-500/15 text-violet-900 dark:text-violet-100',
    monogram: 'Cu',
  },
  {
    id: 'qwen',
    slash: '/qwen',
    label: 'Qwen',
    title: 'Qwen Code',
    agentType: 'qwen',
    className: 'border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-900 dark:text-fuchsia-100',
    monogram: 'Q',
  },
  {
    id: 'grok',
    slash: '/grok',
    label: 'Grok',
    title: 'Grok Build',
    agentType: 'grok',
    className: 'border-zinc-500/50 bg-zinc-500/15 text-zinc-900 dark:text-zinc-100',
    monogram: '⚡',
  },
];

const BY_SLASH = new Map(
  AGENT_SLASH_META.flatMap((m) => {
    const keys = [m.slash.toLowerCase(), m.id, m.agentType];
    if (m.id === 'claude') keys.push('/claude-code', 'claude-code');
    if (m.id === 'grok') keys.push('/grok-build', 'grok-build');
    return keys.map((k) => [k.toLowerCase(), m] as const);
  }),
);

export function findAgentSlashMeta(token: string): AgentSlashMeta | null {
  const t = String(token || '').trim().toLowerCase();
  if (!t) return null;
  const withSlash = t.startsWith('/') ? t : `/${t}`;
  return BY_SLASH.get(withSlash) || BY_SLASH.get(t) || null;
}

/** Leading agent token: `/claude`, `/grok`, optional quotes/spaces. */
const LEADING_AGENT_RE = /^\s*["'`]?\/(claude-code|claude|codex|gemini|cursor|qwen|opencode|grok|grok-build)\b["'`]?\s*/i;

export function splitLeadingAgentToken(text: string): {
  meta: AgentSlashMeta | null;
  rest: string;
  matched: string | null;
} {
  const raw = String(text || '');
  const m = raw.match(LEADING_AGENT_RE);
  if (!m) return { meta: null, rest: raw, matched: null };
  const meta = findAgentSlashMeta(m[1]);
  if (!meta) return { meta: null, rest: raw, matched: null };
  return {
    meta,
    rest: raw.slice(m[0].length),
    matched: m[0],
  };
}

/** Build wire message: chip + body → "/claude body" for backend. */
export function composeAgentMessage(chip: AgentSlashMeta | null, body: string): string {
  const text = String(body || '').trim();
  if (!chip) return text;
  if (!text) return chip.slash;
  // Avoid double prefix if body already starts with same agent
  const split = splitLeadingAgentToken(text);
  if (split.meta?.id === chip.id) return `${chip.slash} ${split.rest}`.trim();
  return `${chip.slash} ${text}`.trim();
}

export function AgentSlashBadge({
  meta,
  onRemove,
  size = 'md',
  className,
}: {
  meta: AgentSlashMeta;
  onRemove?: () => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const compact = size === 'sm';
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full border font-semibold',
        compact ? 'h-6 pl-1 pr-2 text-[11px]' : 'h-7 pl-1 pr-1.5 text-xs',
        meta.className,
        className,
      )}
      contentEditable={false}
      data-agent-slash={meta.slash}
    >
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full bg-background/70 font-bold shadow-sm',
          compact ? 'h-4 w-4 text-[9px]' : 'h-5 w-5 text-[10px]',
        )}
        aria-hidden
      >
        {meta.monogram.length <= 2 ? meta.monogram : meta.monogram.slice(0, 1)}
      </span>
      <span className="min-w-0 truncate">{meta.title}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
          aria-label={`${meta.title} kaldır`}
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </span>
  );
}

