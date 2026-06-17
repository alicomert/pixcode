import { useCallback, useMemo, useState } from 'react';

import type { LLMProvider, Project, ProjectSession } from '../../../types/app';
import type { ShellPermissionOverride } from '../../shell/types/types';
import Shell from '../../shell/view/Shell';

import StandaloneShellEmptyState from './subcomponents/StandaloneShellEmptyState';
import StandaloneShellHeader from './subcomponents/StandaloneShellHeader';

type StandaloneShellProps = {
  project?: Project | null;
  session?: ProjectSession | null;
  command?: string | null;
  isPlainShell?: boolean | null;
  isActive?: boolean;
  autoConnect?: boolean;
  forceNewSession?: boolean;
  startupInput?: string | null;
  permissionOverride?: ShellPermissionOverride | null;
  provider?: LLMProvider | null;
  tabId?: string | null;
  layoutSignal?: string | number | null;
  onComplete?: ((exitCode: number) => void) | null;
  onClose?: (() => void) | null;
  title?: string | null;
  className?: string;
  showHeader?: boolean;
  compact?: boolean;
  minimal?: boolean;
  immersive?: boolean;
};

export default function StandaloneShell({
  project = null,
  session = null,
  command = null,
  isPlainShell = null,
  isActive = true,
  autoConnect = true,
  onComplete = null,
  onClose = null,
  title = null,
  className = '',
  showHeader = true,
  compact = false,
  minimal = false,
  immersive = false,
  forceNewSession = false,
  startupInput = null,
  permissionOverride = null,
  provider = null,
  layoutSignal = null,
  tabId: externalTabId = null,
}: StandaloneShellProps) {
  const [isCompleted, setIsCompleted] = useState(false);
  const tabId = useMemo(() => externalTabId || `tab_${crypto.randomUUID()}`, [externalTabId]);

  // Keep `compact` in the public API for compatibility with existing callers.
  void compact;

  const shouldUsePlainShell = isPlainShell !== null ? isPlainShell : command !== null;

  const handleProcessComplete = useCallback(
    (exitCode: number) => {
      setIsCompleted(true);
      onComplete?.(exitCode);
    },
    [onComplete],
  );

  if (!project) {
    return <StandaloneShellEmptyState className={className} />;
  }

  return (
    <div className={`flex h-full w-full min-w-0 flex-col overflow-hidden ${className}`}>
      {!minimal && showHeader && title && (
        <StandaloneShellHeader title={title} isCompleted={isCompleted} onClose={onClose} />
      )}

      <div className="min-h-0 w-full min-w-0 flex-1 overflow-hidden">
        <Shell
          tabId={tabId}
          selectedProject={project}
          selectedSession={session}
          initialCommand={command}
          isPlainShell={shouldUsePlainShell}
          isActive={isActive}
          onProcessComplete={handleProcessComplete}
          minimal={minimal}
          autoConnect={minimal ? true : autoConnect}
          forceNewSession={forceNewSession}
          startupInput={startupInput}
          permissionOverride={permissionOverride}
          provider={provider}
          layoutSignal={layoutSignal}
          onClose={onClose}
          immersive={immersive}
          showHeader={showHeader}
        />
      </div>
    </div>
  );
}
