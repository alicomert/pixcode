import { useEffect, useState } from 'react';
import type { TFunction } from 'i18next';

import { Button } from '../../../../shared/view/ui';
import type { Project, ProjectSession, LLMProvider } from '../../../../types/app';
import { authenticatedFetch } from '../../../../utils/api';
import type { SessionWithProvider } from '../../types/types';
import SessionProviderLogo from '../../../llm-logo-provider/SessionProviderLogo';

import SidebarSessionItem from './SidebarSessionItem';

import { ChevronDown, Plus, Workflow } from '@/lib/icons';

type SidebarProjectSessionsProps = {
  project: Project;
  isExpanded: boolean;
  sessions: SessionWithProvider[];
  selectedSession: ProjectSession | null;
  initialSessionsLoaded: boolean;
  isLoadingSessions: boolean;
  currentTime: Date;
  editingSession: string | null;
  editingSessionName: string;
  isSessionStarred: (projectName: string, sessionId: string) => boolean;
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
  onLoadMoreSessions: (project: Project) => void;
  onNewSession: (project: Project) => void;
  onOpenOrchestration?: (project: Project, runId?: string) => void;
  t: TFunction;
};

type OrchestrationRun = {
  id: string;
  input?: string;
  status: string;
  startedAt: number;
  nodeRuns: Array<{ adapterId?: string; status: string }>;
};

const adapterProvider = (adapterId?: string): LLMProvider | null => {
  if (adapterId === 'claude-code') return 'claude';
  if (adapterId === 'codex') return 'codex';
  if (adapterId === 'gemini') return 'gemini';
  if (adapterId === 'qwen') return 'qwen';
  if (adapterId === 'opencode') return 'opencode';
  return null;
};

function SessionListSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="rounded-md p-2">
          <div className="flex items-start gap-2">
            <div className="mt-0.5 h-3 w-3 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-1">
              <div className="h-3 animate-pulse rounded bg-muted" style={{ width: `${60 + index * 15}%` }} />
              <div className="h-2 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

export default function SidebarProjectSessions({
  project,
  isExpanded,
  sessions,
  selectedSession,
  initialSessionsLoaded,
  isLoadingSessions,
  currentTime,
  editingSession,
  editingSessionName,
  isSessionStarred,
  onEditingSessionNameChange,
  onStartEditingSession,
  onCancelEditingSession,
  onSaveEditingSession,
  onToggleStarSession,
  onProjectSelect,
  onSessionSelect,
  onDeleteSession,
  onLoadMoreSessions,
  onNewSession,
  onOpenOrchestration,
  t,
}: SidebarProjectSessionsProps) {
  const [orchestrationRuns, setOrchestrationRuns] = useState<OrchestrationRun[]>([]);

  useEffect(() => {
    if (!isExpanded) return undefined;
    let canceled = false;
    const loadRuns = async () => {
      const response = await authenticatedFetch(`/api/orchestration/workflows/runs?projectId=${encodeURIComponent(project.name)}`);
      if (!response.ok) return;
      const data = await response.json() as { runs?: OrchestrationRun[] };
      if (!canceled) {
        setOrchestrationRuns((data.runs ?? []).slice(0, 5));
      }
    };
    void loadRuns();
    const timer = window.setInterval(() => {
      void loadRuns();
    }, 5000);
    return () => {
      canceled = true;
      window.clearInterval(timer);
    };
  }, [isExpanded, project.name]);

  if (!isExpanded) {
    return null;
  }

  const hasSessions = sessions.length > 0;
  const hasMoreSessions = project.sessionMeta?.hasMore === true;

  return (
    <div className="ml-3 space-y-1 border-l border-border pl-3">
      <div className="px-3 pb-1 pt-1 md:hidden">
        <button
          className="flex h-8 w-full items-center justify-center gap-2 rounded-md bg-primary text-xs font-medium text-primary-foreground transition-all duration-150 hover:bg-primary/90 active:scale-[0.98]"
          onClick={() => {
            onProjectSelect(project);
            onNewSession(project);
          }}
        >
          <Plus className="h-3 w-3" />
          {t('sessions.newSession')}
        </button>
      </div>

      <Button
        variant="default"
        size="sm"
        className="hidden h-8 w-full justify-start gap-2 bg-primary text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 md:flex"
        onClick={() => onNewSession(project)}
      >
        <Plus className="h-3 w-3" />
        {t('sessions.newSession')}
      </Button>

      {orchestrationRuns.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 px-3 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Workflow className="h-3 w-3" />
            {t('orchestration.section')}
          </div>
          {orchestrationRuns.map((run) => {
            const providers = [...new Set(run.nodeRuns.map((node) => adapterProvider(node.adapterId)).filter(Boolean))] as LLMProvider[];
            return (
              <button
                key={run.id}
                type="button"
                onClick={() => onOpenOrchestration?.(project, run.id)}
                className="w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent/60"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <Workflow className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-foreground">
                      {run.input || t('orchestration.fallbackTitle')}
                    </div>
                    <div className="mt-1 flex items-center gap-1">
                      {providers.slice(0, 4).map((provider) => (
                        <span key={provider} className="flex h-4 w-4 items-center justify-center rounded bg-muted">
                          <SessionProviderLogo provider={provider} className="h-3 w-3" />
                        </span>
                      ))}
                      <span className="text-[10px] text-muted-foreground">
                        {t(`common:orchestration.status.${run.status}`, { defaultValue: run.status })}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!initialSessionsLoaded ? (
        <SessionListSkeleton />
      ) : !hasSessions && !isLoadingSessions ? (
        <div className="px-3 py-2 text-left">
          <p className="text-xs text-muted-foreground">{t('sessions.noSessions')}</p>
        </div>
      ) : (
        sessions.map((session) => (
          <SidebarSessionItem
            key={session.id}
            project={project}
            session={session}
            selectedSession={selectedSession}
            currentTime={currentTime}
            editingSession={editingSession}
            editingSessionName={editingSessionName}
            isStarred={isSessionStarred(project.name, session.id)}
            onEditingSessionNameChange={onEditingSessionNameChange}
            onStartEditingSession={onStartEditingSession}
            onCancelEditingSession={onCancelEditingSession}
            onSaveEditingSession={onSaveEditingSession}
            onToggleStarSession={onToggleStarSession}
            onProjectSelect={onProjectSelect}
            onSessionSelect={onSessionSelect}
            onDeleteSession={onDeleteSession}
            t={t}
          />
        ))
      )}

      {hasSessions && hasMoreSessions && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full justify-center gap-2 text-muted-foreground"
          onClick={() => onLoadMoreSessions(project)}
          disabled={isLoadingSessions}
        >
          {isLoadingSessions ? (
            <>
              <div className="h-3 w-3 animate-spin rounded-full border border-muted-foreground border-t-transparent" />
              {t('sessions.loading')}
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              {t('sessions.showMore')}
            </>
          )}
        </Button>
      )}
    </div>
  );
}
