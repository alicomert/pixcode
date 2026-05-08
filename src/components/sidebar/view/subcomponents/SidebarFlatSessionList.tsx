import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { TFunction } from 'i18next';

import type { LoadingProgress, Project, ProjectSession, LLMProvider } from '../../../../types/app';
import { authenticatedFetch } from '../../../../utils/api';
import type { SessionWithProvider } from '../../types/types';
import { animateStaggerIn } from '../../../../lib/animations';
import { getSessionDate } from '../../utils/utils';
import SessionProviderLogo from '../../../llm-logo-provider/SessionProviderLogo';

import SidebarProjectsState from './SidebarProjectsState';
import SidebarSessionItem from './SidebarSessionItem';

import { Inbox, Workflow } from '@/lib/icons';

export type SidebarFlatSessionListProps = {
  projects: Project[];
  filteredProjects: Project[];
  selectedSession: ProjectSession | null;
  isLoading: boolean;
  loadingProgress: LoadingProgress | null;
  currentTime: Date;
  editingSession: string | null;
  editingSessionName: string;
  getProjectSessions: (project: Project) => SessionWithProvider[];
  isSessionStarred: (projectName: string, sessionId: string) => boolean;
  onEditingSessionNameChange: (value: string) => void;
  onStartEditingSession: (sessionId: string, initialName: string) => void;
  onCancelEditingSession: () => void;
  onSaveEditingSession: (projectName: string, sessionId: string, summary: string, provider: LLMProvider) => void;
  onToggleStarSession: (projectName: string, sessionId: string) => void;
  onProjectSelect: (project: Project) => void;
  onSessionSelect: (session: SessionWithProvider, projectName: string) => void;
  onOpenOrchestration?: (project: Project, runId?: string) => void;
  onDeleteSession: (
    projectName: string,
    sessionId: string,
    sessionTitle: string,
    provider: LLMProvider,
  ) => void;
  t: TFunction;
};

type FlatSessionEntry = {
  session: SessionWithProvider;
  project: Project;
};

type OrchestrationRun = {
  id: string;
  input?: string;
  status: string;
  startedAt: number;
  metadata?: {
    projectId?: string;
    [key: string]: unknown;
  };
  nodeRuns: Array<{ adapterId?: string; status: string }>;
};

type FlatOrchestrationRun = {
  run: OrchestrationRun;
  project: Project;
};

// Groups flat sessions into time buckets, ChatGPT-style.
type TimeBucket = {
  key: string;
  labelKey: string; // i18n key under sidebar.time.buckets.*
  fallback: string;
  items: FlatSessionEntry[];
};

const ONE_DAY_MS = 1000 * 60 * 60 * 24;

function bucketFor(date: Date, now: Date): string {
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return 'today';

  const yesterday = new Date(now.getTime() - ONE_DAY_MS);
  if (date.toDateString() === yesterday.toDateString()) return 'yesterday';

  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 7 * ONE_DAY_MS) return 'thisWeek';
  if (diffMs < 30 * ONE_DAY_MS) return 'thisMonth';
  return 'older';
}

const BUCKET_ORDER: Array<{ key: string; labelKey: string; fallback: string }> = [
  { key: 'today', labelKey: 'time.buckets.today', fallback: 'Today' },
  { key: 'yesterday', labelKey: 'time.buckets.yesterday', fallback: 'Yesterday' },
  { key: 'thisWeek', labelKey: 'time.buckets.thisWeek', fallback: 'Previous 7 days' },
  { key: 'thisMonth', labelKey: 'time.buckets.thisMonth', fallback: 'Previous 30 days' },
  { key: 'older', labelKey: 'time.buckets.older', fallback: 'Older' },
];

const adapterProvider = (adapterId?: string): LLMProvider | null => {
  if (adapterId === 'claude-code') return 'claude';
  if (adapterId === 'codex') return 'codex';
  if (adapterId === 'gemini') return 'gemini';
  if (adapterId === 'qwen') return 'qwen';
  if (adapterId === 'opencode') return 'opencode';
  return null;
};

const normalizeProjectRunId = (value?: string) =>
  value?.trim().replace(/\\/g, '/').toLowerCase() ?? '';

export default function SidebarFlatSessionList({
  projects,
  filteredProjects,
  selectedSession,
  isLoading,
  loadingProgress,
  currentTime,
  editingSession,
  editingSessionName,
  getProjectSessions,
  isSessionStarred,
  onEditingSessionNameChange,
  onStartEditingSession,
  onCancelEditingSession,
  onSaveEditingSession,
  onToggleStarSession,
  onProjectSelect,
  onSessionSelect,
  onOpenOrchestration,
  onDeleteSession,
  t,
}: SidebarFlatSessionListProps) {
  const [orchestrationRuns, setOrchestrationRuns] = useState<FlatOrchestrationRun[]>([]);
  const projectByRunId = useMemo(() => {
    const next = new Map<string, Project>();
    for (const project of filteredProjects) {
      next.set(project.name, project);
      next.set(normalizeProjectRunId(project.name), project);
    }
    return next;
  }, [filteredProjects]);

  useEffect(() => {
    if (filteredProjects.length === 0) {
      setOrchestrationRuns([]);
      return undefined;
    }

    let canceled = false;
    const loadRuns = async () => {
      const response = await authenticatedFetch('/api/orchestration/workflows/runs?limit=40');
      if (!response.ok) return;
      const data = await response.json() as { runs?: OrchestrationRun[] };
      const results = (data.runs ?? []).flatMap((run) => {
        const projectId = run.metadata?.projectId;
        const project = projectId
          ? projectByRunId.get(projectId) ?? projectByRunId.get(normalizeProjectRunId(projectId))
          : undefined;
        return project ? [{ run, project }] : [];
      });

      if (!canceled) {
        setOrchestrationRuns(
          results.sort((a, b) => b.run.startedAt - a.run.startedAt).slice(0, 8),
        );
      }
    };

    void loadRuns();
    const timer = window.setInterval(() => {
      void loadRuns();
    }, 30_000);
    return () => {
      canceled = true;
      window.clearInterval(timer);
    };
  }, [filteredProjects.length, projectByRunId]);

  // Flatten sessions from all filtered projects, then group by time bucket.
  // Starred items float to the top of their bucket.
  const buckets = useMemo<TimeBucket[]>(() => {
    const all: FlatSessionEntry[] = [];
    for (const project of filteredProjects) {
      for (const session of getProjectSessions(project)) {
        all.push({ session, project });
      }
    }

    all.sort(
      (a, b) => getSessionDate(b.session).getTime() - getSessionDate(a.session).getTime(),
    );

    const map = new Map<string, TimeBucket>();
    for (const meta of BUCKET_ORDER) {
      map.set(meta.key, { ...meta, items: [] });
    }

    for (const entry of all) {
      const key = bucketFor(getSessionDate(entry.session), currentTime);
      map.get(key)?.items.push(entry);
    }

    // Starred → top inside each bucket (order otherwise unchanged).
    for (const bucket of map.values()) {
      bucket.items.sort((a, b) => {
        const aStarred = isSessionStarred(a.project.name, a.session.id) ? 1 : 0;
        const bStarred = isSessionStarred(b.project.name, b.session.id) ? 1 : 0;
        return bStarred - aStarred;
      });
    }

    return BUCKET_ORDER.map((meta) => map.get(meta.key)!).filter(
      (bucket) => bucket.items.length > 0,
    );
  }, [filteredProjects, getProjectSessions, currentTime, isSessionStarred]);

  if (isLoading || projects.length === 0 || filteredProjects.length === 0) {
    return (
      <SidebarProjectsState
        isLoading={isLoading}
        loadingProgress={loadingProgress}
        projectsCount={projects.length}
        filteredProjectsCount={filteredProjects.length}
        t={t}
      />
    );
  }

  if (buckets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
          <Inbox className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">
          {t('sessions.noSessions')}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('sessions.startToSee', { defaultValue: 'Start a new session to see it here.' })}
        </p>
      </div>
    );
  }

  return (
    <FlatSessionListBody buckets={buckets}>
      {orchestrationRuns.length > 0 ? (
        <div className="space-y-0.5" data-stagger-item>
          <div className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            <Workflow className="h-3 w-3" />
            {t('orchestration.section', { defaultValue: 'Orchestration' })}
          </div>
          {orchestrationRuns.map(({ run, project }) => {
            const providers = [...new Set(run.nodeRuns.map((node) => adapterProvider(node.adapterId)).filter(Boolean))] as LLMProvider[];
            return (
              <button
                key={`${project.name}-${run.id}`}
                type="button"
                onClick={() => onOpenOrchestration?.(project, run.id)}
                className="w-full rounded-lg border border-transparent px-2 py-2 text-left transition-colors hover:border-border hover:bg-accent/60"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <Workflow className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-foreground">
                      {run.input || t('orchestration.fallbackTitle', { defaultValue: 'Orchestration run' })}
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className="truncate">{project.displayName || project.name}</span>
                      <span>·</span>
                      <span>{t(`common:orchestration.status.${run.status}`, { defaultValue: run.status })}</span>
                      <span className="ml-auto flex shrink-0 gap-0.5">
                        {providers.slice(0, 4).map((provider) => (
                          <SessionProviderLogo key={provider} provider={provider} className="h-3.5 w-3.5" />
                        ))}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}
      {buckets.map((bucket) => (
        <div key={bucket.key} className="space-y-0.5" data-stagger-item>
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {t(bucket.labelKey, { defaultValue: bucket.fallback })}
          </div>
          {bucket.items.map(({ session, project }) => (
            <SidebarSessionItem
              key={`${project.name}-${session.id}`}
              project={project}
              session={session}
              selectedSession={selectedSession}
              currentTime={currentTime}
              editingSession={editingSession}
              editingSessionName={editingSessionName}
              isStarred={isSessionStarred(project.name, session.id)}
              compact
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
          ))}
        </div>
      ))}
    </FlatSessionListBody>
  );
}

// Wrapper that runs a one-shot stagger animation when the list of buckets
// first appears or its bucket count changes (e.g. a new "Today" group
// arrives). Hidden behind useEffect so SSR / reduced-motion users are safe.
function FlatSessionListBody({
  buckets,
  children,
}: {
  buckets: TimeBucket[];
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  useEffect(() => {
    if (buckets.length === 0) return;
    if (buckets.length === lastCountRef.current) return;
    lastCountRef.current = buckets.length;
    animateStaggerIn(containerRef.current, '[data-stagger-item]', { stagger: 0.04, y: 4 });
  }, [buckets.length]);

  return (
    <div ref={containerRef} className="space-y-3 px-1 pb-4">
      {children}
    </div>
  );
}
