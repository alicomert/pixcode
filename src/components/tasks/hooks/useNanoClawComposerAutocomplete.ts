import { useCallback, useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react';

import { api } from '../../../utils/api';
import type { AgentType } from '../types';

type FileNode = {
  name: string;
  type: 'file' | 'directory';
  path?: string;
  children?: FileNode[];
};

export type ComposerFileItem = {
  kind: 'file';
  id: string;
  label: string;
  insert: string;
  detail?: string;
};

export type ComposerCommandItem = {
  kind: 'command';
  id: string;
  label: string;
  insert: string;
  detail?: string;
  agentType?: AgentType;
};

export type ComposerSuggestItem = ComposerFileItem | ComposerCommandItem;

const AGENT_COMMANDS: ComposerCommandItem[] = [
  { kind: 'command', id: 'agent-claude', label: '/agent-claude', insert: '/agent-claude ', detail: 'Claude Code', agentType: 'claude-code' },
  { kind: 'command', id: 'agent-opencode', label: '/agent-opencode', insert: '/agent-opencode ', detail: 'OpenCode', agentType: 'opencode' },
  { kind: 'command', id: 'agent-codex', label: '/agent-codex', insert: '/agent-codex ', detail: 'OpenAI Codex', agentType: 'codex' },
  { kind: 'command', id: 'agent-gemini', label: '/agent-gemini', insert: '/agent-gemini ', detail: 'Gemini CLI', agentType: 'gemini' },
  { kind: 'command', id: 'agent-cursor', label: '/agent-cursor', insert: '/agent-cursor ', detail: 'Cursor CLI', agentType: 'cursor' },
  { kind: 'command', id: 'agent-qwen', label: '/agent-qwen', insert: '/agent-qwen ', detail: 'Qwen Code', agentType: 'qwen' },
  { kind: 'command', id: 'agent-grok', label: '/agent-grok', insert: '/agent-grok ', detail: 'Grok Build (xAI)', agentType: 'grok' },
  { kind: 'command', id: 'schedule', label: '/schedule', insert: 'her gün saat 9 ', detail: 'Örnek: günlük schedule cümlesi' },
  { kind: 'command', id: 'help', label: '/help', insert: 'hangi komutlar var? @ dosya, /agent-… ve schedule nasıl kullanılır kısaca anlat', detail: 'Yardım iste' },
];

function flattenFiles(nodes: FileNode[], base = ''): ComposerFileItem[] {
  let out: ComposerFileItem[] = [];
  for (const node of nodes) {
    const rel = base ? `${base}/${node.name}` : node.name;
    if (node.type === 'directory' && Array.isArray(node.children)) {
      out = out.concat(flattenFiles(node.children, rel));
      continue;
    }
    if (node.type === 'file') {
      out.push({
        kind: 'file',
        id: rel,
        label: `@${rel}`,
        insert: `@${rel} `,
        detail: node.name,
      });
    }
  }
  return out;
}

type Mode = 'idle' | 'at' | 'slash';

type Options = {
  projectId?: string | null;
  value: string;
  setValue: (next: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onPickAgent?: (agent: AgentType) => void;
};

/**
 * @file and /command autocomplete for the NanoClaw chat composer.
 * Dropdown sits above the textarea (portal-free, absolute).
 */
export function useNanoClawComposerAutocomplete({
  projectId,
  value,
  setValue,
  textareaRef,
  onPickAgent,
}: Options) {
  const [fileItems, setFileItems] = useState<ComposerFileItem[]>([]);
  const [cursor, setCursor] = useState(0);
  const [mode, setMode] = useState<Mode>('idle');
  const [query, setQuery] = useState('');
  const [tokenStart, setTokenStart] = useState(-1);
  const [activeIndex, setActiveIndex] = useState(0);

  // Load project files when workspace changes
  useEffect(() => {
    const name = projectId && projectId !== 'general' ? projectId : null;
    if (!name) {
      setFileItems([]);
      return undefined;
    }
    const ac = new AbortController();
    void (async () => {
      try {
        const res = await api.getFiles(name, { signal: ac.signal });
        if (!res.ok) return;
        const tree = (await res.json()) as FileNode[];
        if (Array.isArray(tree)) setFileItems(flattenFiles(tree));
      } catch (error) {
        if ((error as { name?: string })?.name === 'AbortError') return;
        console.warn('[nanoclaw-composer] file list failed', error);
      }
    })();
    return () => ac.abort();
  }, [projectId]);

  // Detect @ or / token before cursor
  useEffect(() => {
    const before = value.slice(0, cursor);
    // Prefer the nearest @ or / that starts a token
    const at = before.lastIndexOf('@');
    const slash = before.lastIndexOf('/');

    const tryToken = (start: number, kind: 'at' | 'slash') => {
      if (start < 0) return false;
      // Token must start at beginning or after whitespace/newline
      if (start > 0 && !/[\s\n]/.test(before[start - 1] || '')) return false;
      const frag = before.slice(start + 1);
      // Cancel if space in query (token ended)
      if (/\s/.test(frag)) return false;
      setMode(kind);
      setTokenStart(start);
      setQuery(frag);
      setActiveIndex(0);
      return true;
    };

    // Whichever marker is closer to the cursor wins
    if (at > slash) {
      if (tryToken(at, 'at')) return;
    } else if (slash > at) {
      if (tryToken(slash, 'slash')) return;
    } else if (at === slash && at >= 0) {
      if (tryToken(at, 'at')) return;
    }

    setMode('idle');
    setTokenStart(-1);
    setQuery('');
  }, [value, cursor]);

  const items: ComposerSuggestItem[] = useMemo(() => {
    const q = query.toLowerCase();
    if (mode === 'at') {
      return fileItems
        .filter((f) => !q || f.label.toLowerCase().includes(q) || (f.detail || '').toLowerCase().includes(q))
        .slice(0, 12);
    }
    if (mode === 'slash') {
      return AGENT_COMMANDS
        .filter((c) => !q || c.label.toLowerCase().includes(q) || (c.detail || '').toLowerCase().includes(q) || c.insert.toLowerCase().includes(q))
        .slice(0, 12);
    }
    return [];
  }, [mode, query, fileItems]);

  const open = mode !== 'idle' && items.length > 0;

  const applyItem = useCallback((item: ComposerSuggestItem) => {
    if (tokenStart < 0) return;
    const before = value.slice(0, tokenStart);
    const afterToken = value.slice(tokenStart);
    // Remove current token (until space or end)
    const spaceIdx = afterToken.search(/\s/);
    const rest = spaceIdx === -1 ? '' : afterToken.slice(spaceIdx);
    const insert = item.insert;
    const next = `${before}${insert}${rest.startsWith(' ') ? rest : rest ? ` ${rest.trimStart()}` : ''}`;
    const nextCursor = before.length + insert.length;
    setValue(next);
    setMode('idle');
    setTokenStart(-1);
    setQuery('');

    if (item.kind === 'command' && item.agentType && onPickAgent) {
      onPickAgent(item.agentType);
    }

    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(nextCursor, nextCursor);
      setCursor(nextCursor);
    });
  }, [tokenStart, value, setValue, textareaRef, onPickAgent]);

  const onChange = useCallback((text: string, selectionStart: number) => {
    setValue(text);
    setCursor(selectionStart);
  }, [setValue]);

  const onSelect = useCallback((selectionStart: number) => {
    setCursor(selectionStart);
  }, []);

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (!open) return false;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % items.length);
      return true;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + items.length) % items.length);
      return true;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      // Only hijack Enter when dropdown is open
      event.preventDefault();
      const item = items[activeIndex] || items[0];
      if (item) applyItem(item);
      return true;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setMode('idle');
      return true;
    }
    return false;
  }, [open, items, activeIndex, applyItem]);

  return {
    open,
    mode,
    items,
    activeIndex,
    setActiveIndex,
    applyItem,
    onChange,
    onSelect,
    onKeyDown,
    fileCount: fileItems.length,
  };
}
