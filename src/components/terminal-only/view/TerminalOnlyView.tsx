import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { LLMProvider, Project, ProjectSession } from '../../../types/app';
import StandaloneShell from '../../standalone-shell/view/StandaloneShell';

import {
  ArrowLeft,
  ChevronDown,
  Terminal,
} from '@/lib/icons';

const TERMINAL_PROVIDERS: Array<{ id: LLMProvider; label: string }> = [
  { id: 'claude', label: 'Claude' },
  { id: 'codex', label: 'Codex' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'qwen', label: 'Qwen' },
  { id: 'opencode', label: 'OpenCode' },
  { id: 'grok', label: 'Grok' },
];

const TERMINAL_PROVIDER_STORAGE_KEY = 'pixcode.terminalOnly.provider';

type TerminalOnlyViewProps = {
  selectedProject: Project | null;
  selectedSession: ProjectSession | null;
  isMobile: boolean;
  isLoading?: boolean;
  onQuickStartWorkspace?: () => void | Promise<void>;
  onExit: () => void;
};

function readSavedProvider(): LLMProvider {
  if (typeof window === 'undefined') return 'claude';
  const saved = window.localStorage.getItem(TERMINAL_PROVIDER_STORAGE_KEY)
    || window.localStorage.getItem('selected-provider');
  return TERMINAL_PROVIDERS.some((entry) => entry.id === saved)
    ? saved as LLMProvider
    : 'claude';
}

/**
 * A deliberately small, full-height terminal surface for users who do not
 * need the editor/control-room workbench. It is shared by desktop and mobile
 * so the shell keeps the same PTY/session semantics in both layouts.
 */
export default function TerminalOnlyView({
  selectedProject,
  selectedSession,
  isMobile,
  isLoading = false,
  onQuickStartWorkspace,
  onExit,
}: TerminalOnlyViewProps) {
  const { t } = useTranslation('common');
  const [provider, setProvider] = useState<LLMProvider>(readSavedProvider);

  useEffect(() => {
    window.localStorage.setItem(TERMINAL_PROVIDER_STORAGE_KEY, provider);
    // Keep the focused surface and the workbench CLI picker in sync.
    window.localStorage.setItem('selected-provider', provider);
  }, [provider]);

  const session = useMemo(() => (
    selectedSession?.__provider && selectedSession.__provider !== provider
      ? null
      : selectedSession
  ), [provider, selectedSession]);

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-gray-950 text-gray-100">
      <header className="flex min-h-12 shrink-0 items-center gap-2 border-b border-gray-800 bg-gray-900/95 px-3 py-2 sm:px-4">
        <button
          type="button"
          onClick={onExit}
          className="flex min-h-10 min-w-10 items-center justify-center rounded-md text-gray-300 transition-colors hover:bg-gray-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          aria-label={t('terminalOnly.backToWorkspace', { defaultValue: 'Back to workspace' })}
          title={t('terminalOnly.backToWorkspace', { defaultValue: 'Back to workspace' })}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Terminal className="h-4 w-4 shrink-0 text-blue-300" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">
            {t('terminalOnly.title', { defaultValue: 'Terminal mode' })}
          </h1>
          <p className="truncate text-[11px] text-gray-400">
            {selectedProject?.displayName
              || selectedProject?.name
              || t('terminalOnly.selectProject', { defaultValue: 'Select a project from the workspace' })}
          </p>
        </div>
        <label className="relative flex min-h-10 shrink-0 items-center">
          <span className="sr-only">
            {t('terminalOnly.provider', { defaultValue: 'CLI provider' })}
          </span>
          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value as LLMProvider)}
            className="min-h-10 max-w-36 appearance-none rounded-md border border-gray-700 bg-gray-900 py-2 pl-2.5 pr-8 text-xs text-gray-100 outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-400/40"
          >
            {TERMINAL_PROVIDERS.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
        </label>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        {selectedProject ? (
          <StandaloneShell
            key={`${provider}-${selectedProject.name}-${session?.id || 'new'}`}
            project={selectedProject}
            session={session}
            provider={provider}
            tabId={`terminal-only-${provider}`}
            showHeader={false}
            minimal
            immersive
            autoConnect
            isActive
            layoutSignal={`terminal-only:${isMobile ? 'mobile' : 'desktop'}:${provider}`}
          />
        ) : (
          <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 px-6 text-center">
            <Terminal className="h-8 w-8 text-blue-300" aria-hidden="true" />
            <div className="max-w-sm">
              <h2 className="text-base font-semibold text-gray-100">
                {isLoading
                  ? t('terminalOnly.loading', { defaultValue: 'Loading your workspace…' })
                  : t('terminalOnly.noWorkspace', { defaultValue: 'Create a workspace to open the terminal' })}
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                {t('terminalOnly.noWorkspaceHelp', {
                  defaultValue: 'Pixcode keeps terminal sessions inside your private workspace.',
                })}
              </p>
            </div>
            {!isLoading && onQuickStartWorkspace && (
              <button
                type="button"
                onClick={() => void onQuickStartWorkspace()}
                className="min-h-11 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
              >
                {t('terminalOnly.createWorkspace', { defaultValue: 'Create terminal workspace' })}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
