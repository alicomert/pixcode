import { Check, X } from '@/lib/icons';
import type { TFunction } from 'i18next';
import { Button } from '../../../../shared/view/ui';
import { cn } from '../../../../lib/utils';
import { formatTimeAgo } from '../../../../utils/dateUtils';
import type { Project, ProjectSession, LLMProvider } from '../../../../types/app';
import type { SessionWithProvider } from '../../types/types';
import { createSessionViewModel, detectSessionFileExtensions } from '../../utils/utils';
import SessionProviderLogo from '../../../llm-logo-provider/SessionProviderLogo';
import SessionActionsMenu from './SessionActionsMenu';

type SidebarSessionItemProps = {
  project: Project;
  session: SessionWithProvider;
  selectedSession: ProjectSession | null;
  currentTime: Date;
  editingSession: string | null;
  editingSessionName: string;
  isStarred: boolean;
  /** When true, renders compact flat layout (ChatGPT-style). When false, keeps the grouped layout. */
  compact?: boolean;
  onEditingSessionNameChange: (value: string) => void;
  onStartEditingSession: (sessionId: string, initialName: string) => void;
  onCancelEditingSession: () => void;
  onSaveEditingSession: (projectName: string, sessionId: string, summary: string, provider: LLMProvider) => void;
  onToggleStarSession: (projectName: string, sessionId: string) => void;
  onProjectSelect: (project: Project) => void;
  onSessionSelect: (session: SessionWithProvider, projectName: string) => void;
  onDeleteSession: (
    projectName: string,
    sessionId: string,
    sessionTitle: string,
    provider: LLMProvider,
  ) => void;
  t: TFunction;
};

const PROVIDER_LABELS: Record<LLMProvider, string> = {
  claude: 'Claude',
  cursor: 'Cursor',
  codex: 'Codex',
  gemini: 'Gemini',
  qwen: 'Qwen Code',
  opencode: 'OpenCode',
};

// Provider accent colors kept subtle so they work on both light and dark backgrounds
// without relying on heavy gradients or filters.
const PROVIDER_ACCENT: Record<LLMProvider, string> = {
  claude: 'bg-orange-500/10 text-orange-600 dark:bg-orange-400/10 dark:text-orange-300 ring-1 ring-orange-500/15',
  cursor: 'bg-sky-500/10 text-sky-600 dark:bg-sky-400/10 dark:text-sky-300 ring-1 ring-sky-500/15',
  codex: 'bg-violet-500/10 text-violet-600 dark:bg-violet-400/10 dark:text-violet-300 ring-1 ring-violet-500/15',
  gemini: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300 ring-1 ring-emerald-500/15',
  qwen: 'bg-amber-500/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300 ring-1 ring-amber-500/15',
  opencode: 'bg-teal-500/10 text-teal-600 dark:bg-teal-400/10 dark:text-teal-300 ring-1 ring-teal-500/15',
};

export default function SidebarSessionItem({
  project,
  session,
  selectedSession,
  currentTime,
  editingSession,
  editingSessionName,
  isStarred,
  compact = false,
  onEditingSessionNameChange,
  onStartEditingSession,
  onCancelEditingSession,
  onSaveEditingSession,
  onToggleStarSession,
  onProjectSelect,
  onSessionSelect,
  onDeleteSession,
  t,
}: SidebarSessionItemProps) {
  const sessionView = createSessionViewModel(session, currentTime, t);
  const isSelected = selectedSession?.id === session.id;
  const isEditing = editingSession === session.id;
  const provider = session.__provider;
  const providerLabel = PROVIDER_LABELS[provider] ?? provider;
  const providerAccent = PROVIDER_ACCENT[provider] ?? PROVIDER_ACCENT.claude;
  // Derive up to three extensions mentioned in the title/summary. Cheap string scan,
  // runs only when the title actually changes so there's no perf concern.
  const extensions = detectSessionFileExtensions(sessionView.sessionName);

  const selectMobileSession = () => {
    onProjectSelect(project);
    onSessionSelect(session, project.name);
  };

  const saveEditedSession = () => {
    onSaveEditingSession(project.name, session.id, editingSessionName, provider);
  };

  const requestDeleteSession = () => {
    onDeleteSession(project.name, session.id, sessionView.sessionName, provider);
  };

  const startRename = () => onStartEditingSession(session.id, sessionView.sessionName);
  const toggleStar = () => onToggleStarSession(project.name, session.id);

  // Shared metadata row (provider badge + time + star indicator + file-ext chips).
  const metaRow = (
    <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1 text-[10px] leading-tight">
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-1.5 py-px font-medium',
          providerAccent,
        )}
      >
        <SessionProviderLogo provider={provider} className="h-2.5 w-2.5" />
        {providerLabel}
      </span>
      <span className="text-muted-foreground/80">
        {formatTimeAgo(sessionView.sessionTime, currentTime, t)}
      </span>
      {sessionView.isActive && (
        <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
          {t('status.active', { defaultValue: 'Active' })}
        </span>
      )}
      {extensions.slice(0, 3).map((ext) => (
        <span
          key={ext}
          className="rounded-md bg-muted/60 px-1 py-px font-mono text-[9px] uppercase tracking-wide text-muted-foreground ring-1 ring-border/40"
        >
          .{ext}
        </span>
      ))}
    </div>
  );

  const editInlineControls = (
    <>
      <input
        type="text"
        value={editingSessionName}
        onChange={(event) => onEditingSessionNameChange(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') {
            saveEditedSession();
          } else if (event.key === 'Escape') {
            onCancelEditingSession();
          }
        }}
        onClick={(event) => event.stopPropagation()}
        className="w-full rounded-md border border-primary/40 bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        autoFocus
      />
      <button
        className="flex h-6 w-6 items-center justify-center rounded-md bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/40"
        onClick={(event) => {
          event.stopPropagation();
          saveEditedSession();
        }}
        title={t('tooltips.save')}
      >
        <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
      </button>
      <button
        className="flex h-6 w-6 items-center justify-center rounded-md bg-gray-50 hover:bg-gray-100 dark:bg-gray-900/20 dark:hover:bg-gray-900/40"
        onClick={(event) => {
          event.stopPropagation();
          onCancelEditingSession();
        }}
        title={t('tooltips.cancel')}
      >
        <X className="h-3 w-3 text-gray-600 dark:text-gray-400" />
      </button>
    </>
  );

  // -------- MOBILE LAYOUT --------
  // On touch devices there's no hover, so the 3-dot trigger is always visible.
  const mobile = (
    <div className="md:hidden">
      <div
        className={cn(
          'relative mx-3 my-0.5 rounded-lg border border-border/30 bg-card p-2 transition-all duration-150 active:scale-[0.98]',
          isSelected && 'border-primary/30 bg-primary/5 shadow-sm',
          !isSelected && sessionView.isActive && 'border-green-500/25 bg-green-50/5 dark:bg-green-900/5',
          isStarred && !isSelected && 'ring-1 ring-yellow-300/50 dark:ring-yellow-500/30',
        )}
        onClick={isEditing ? undefined : selectMobileSession}
      >
        {isEditing ? (
          <div className="flex items-center gap-1">{editInlineControls}</div>
        ) : (
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md',
                isSelected ? 'bg-primary/10' : 'bg-muted/60',
              )}
            >
              <SessionProviderLogo provider={provider} className="h-3 w-3" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                {isStarred && (
                  <span className="text-yellow-500" aria-hidden>
                    ★
                  </span>
                )}
                <span className="truncate text-xs font-medium text-foreground">
                  {sessionView.sessionName}
                </span>
              </div>
              {metaRow}
            </div>
            <div
              className="flex-shrink-0"
              onClick={(event) => event.stopPropagation()}
            >
              <SessionActionsMenu
                isStarred={isStarred}
                canDelete={!sessionView.isCursorSession}
                onRename={startRename}
                onToggleStar={toggleStar}
                onDelete={requestDeleteSession}
                t={t}
                // Always visible on touch devices (no hover state).
                className="!opacity-100"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // -------- DESKTOP LAYOUT --------
  // Flat (compact) and grouped share the same shell to avoid divergent styling.
  const desktop = (
    <div
      className={cn(
        'group/item relative hidden md:block',
      )}
    >
      <Button
        variant="ghost"
        className={cn(
          'relative h-auto w-full justify-start overflow-hidden p-0 text-left font-normal transition-colors duration-150',
          'hover:bg-accent/60',
          isSelected && 'bg-accent text-accent-foreground',
          isStarred && !isSelected && 'bg-yellow-50/40 hover:bg-yellow-100/40 dark:bg-yellow-900/10 dark:hover:bg-yellow-900/20',
          compact ? 'rounded-xl px-3 py-2.5' : 'rounded-lg px-3 py-2',
        )}
        onClick={isEditing ? undefined : () => onSessionSelect(session, project.name)}
      >
        {/* Selected indicator bar */}
        {isSelected && (
          <span
            aria-hidden
            className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-primary"
          />
        )}
        {/* Subtle hover accent (GPU-only: opacity + transform). Hidden when selected. */}
        {!isSelected && !isEditing && <span aria-hidden className="session-item-accent" />}

        <div className="flex w-full min-w-0 items-start gap-2 pr-6">
          <div
            className={cn(
              'mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md',
              isSelected ? 'bg-primary/10' : 'bg-muted/50 group-hover/item:bg-muted/80',
            )}
          >
            <SessionProviderLogo provider={provider} className="h-3 w-3" />
          </div>

          <div className="min-w-0 flex-1">
            {isEditing ? (
              <div className="flex items-center gap-1">{editInlineControls}</div>
            ) : (
              <>
                <div className="flex min-w-0 items-center gap-1">
                  {isStarred && (
                    <span className="flex-shrink-0 text-yellow-500" aria-hidden>
                      ★
                    </span>
                  )}
                  <span className="truncate text-xs font-medium text-foreground">
                    {sessionView.sessionName}
                  </span>
                </div>
                {metaRow}
              </>
            )}
          </div>
        </div>
      </Button>

      {/* 3-dot trigger positioned over the button's right edge. Hidden until hover (or open).
          Sits in its own group `group-hover/item:opacity-100` so the parent button remains clickable. */}
      {!isEditing && (
        <div
          className="absolute right-1.5 top-1/2 -translate-y-1/2"
          onClick={(event) => event.stopPropagation()}
        >
          <SessionActionsMenu
            isStarred={isStarred}
            canDelete={!sessionView.isCursorSession}
            onRename={startRename}
            onToggleStar={toggleStar}
            onDelete={requestDeleteSession}
            t={t}
            className="opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100"
          />
        </div>
      )}
    </div>
  );

  return (
    <div className="group relative">
      {mobile}
      {desktop}
    </div>
  );
}
