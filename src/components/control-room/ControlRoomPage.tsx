import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';

import { useGsapEntrance, useGsapListReveal, useGsapStatusHighlight, useGsapSurfaceTransition } from '../../lib/animations';
import { cn } from '../../lib/utils';
import { Badge, Button, Input } from '../../shared/view/ui';
import type { Project } from '../../types/app';
import { authenticatedFetch } from '../../utils/api';

import {
  AdvancedDisclosure,
  ActionRow,
  CommandCard,
  ContextDrawer,
  ControlRoomPanel,
  EmptyGuidance,
  GuidanceCard,
  ResponsiveDataList,
  StatusBanner,
  SummaryCard,
  TimelineItem,
} from './ControlRoomPrimitives';

import {
  AlertTriangle,
  BarChart3,
  CheckCircle,
  Clock,
  FileCode,
  Globe,
  Key,
  Lock,
  Plus,
  RefreshCw,
  Server,
  ShieldAlert,
  Sparkles,
  Users,
  Workflow,
  type LucideIcon,
} from '@/lib/icons';

type ControlRoomPageProps = {
  selectedProject: Project | null;
};

type GroupId = 'operations' | 'people' | 'access' | 'security' | 'insights';

type ProductionState = {
  issueRuns?: any[];
  reviewQueue?: any[];
  schedulerJobs?: any[];
  checkpoints?: any[];
};

type PlatformState = {
  roles?: Record<string, string[]>;
  adminUsers?: any[];
  projectCollaborators?: any[];
  secrets?: any[];
  marketplacePlugins?: any[];
  evaluationSuites?: any[];
  evaluationRuns?: any[];
  usageSummary?: any[];
  securityAuditRuns?: any[];
  auditLog?: any[];
};

type Snapshot = {
  production: ProductionState;
  platform: PlatformState;
};

type OverviewCard = {
  id: string;
  title: string;
  description: string;
  meta: string;
  group: GroupId;
  icon: LucideIcon;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  value: (snapshot: Snapshot) => string | number;
};

type TimelineEntry = {
  id: string;
  time: string;
  actor: string;
  action: string;
  result: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  details?: ReactNode;
};

const emptySnapshot: Snapshot = {
  production: {
    issueRuns: [],
    reviewQueue: [],
    schedulerJobs: [],
    checkpoints: [],
  },
  platform: {
    roles: {},
    adminUsers: [],
    projectCollaborators: [],
    secrets: [],
    marketplacePlugins: [],
    evaluationSuites: [],
    evaluationRuns: [],
    usageSummary: [],
    securityAuditRuns: [],
    auditLog: [],
  },
};

const CONTROL_ROOM_GROUPS: Array<{ id: GroupId; label: string; description: string; icon: LucideIcon }> = [
  { id: 'operations', label: 'Operations', description: 'Runs, reviews, approvals, scheduler, checkpoints', icon: Workflow },
  { id: 'people', label: 'People', description: 'Admins, collaborators, roles, activity', icon: Users },
  { id: 'access', label: 'Access', description: 'LAN, Tailscale, tunnel, domain guidance', icon: Globe },
  { id: 'security', label: 'Security', description: 'Secrets, permission risk, audit checks', icon: ShieldAlert },
  { id: 'insights', label: 'Insights', description: 'Usage, evaluations, marketplace health', icon: BarChart3 },
];

const OVERVIEW_CARDS: OverviewCard[] = [
  {
    id: 'overview-card-attention',
    title: 'What needs attention',
    description: 'Errors, reviews, security findings, and failed evaluation work are grouped here first.',
    meta: 'Recommended next step',
    group: 'operations',
    icon: AlertTriangle,
    tone: 'warning',
    value: (snapshot) => countNeedsAttention(snapshot),
  },
  {
    id: 'overview-card-running',
    title: 'Running now',
    description: 'Active agent work, scheduled jobs, and issue-to-PR runs without opening every list.',
    meta: 'Live operational state',
    group: 'operations',
    icon: Clock,
    tone: 'info',
    value: (snapshot) => countRunning(snapshot),
  },
  {
    id: 'overview-card-reviews',
    title: 'Reviews and approvals',
    description: 'Human checkpoints, review queue items, and decisions that should not be hidden.',
    meta: 'Action queue',
    group: 'operations',
    icon: FileCode,
    value: (snapshot) => snapshot.production.reviewQueue?.length || 0,
  },
  {
    id: 'overview-card-team-access',
    title: 'Team and access',
    description: 'Sub-users, project collaborators, and the right way for people to reach this server.',
    meta: 'People + connection path',
    group: 'people',
    icon: Users,
    value: (snapshot) => (snapshot.platform.adminUsers?.length || 0) + (snapshot.platform.projectCollaborators?.length || 0),
  },
  {
    id: 'overview-card-security-secrets',
    title: 'Security and secrets',
    description: 'Scoped env values, audit runs, permission risk, and sensitive workflow state.',
    meta: 'Guardrails',
    group: 'security',
    icon: ShieldAlert,
    tone: 'danger',
    value: (snapshot) => (snapshot.platform.secrets?.length || 0) + (snapshot.platform.securityAuditRuns?.length || 0),
  },
  {
    id: 'overview-card-usage-evals',
    title: 'Usage and evaluations',
    description: 'Cost, token, latency, model comparisons, and marketplace health in one place.',
    meta: 'Run timeline',
    group: 'insights',
    icon: BarChart3,
    tone: 'success',
    value: (snapshot) => (snapshot.platform.usageSummary?.length || 0) + (snapshot.platform.evaluationRuns?.length || 0),
  },
];

const providerOptions = ['opencode', 'claude', 'codex', 'cursor', 'gemini', 'qwen'];
const roleOptions = ['owner', 'admin', 'member', 'viewer', 'project_partner', 'project_worker', 'project_reviewer'];
const collaboratorRoles = ['partner', 'worker', 'reviewer', 'viewer'];
const secretScopes = ['global', 'provider', 'project', 'workflow', 'telegram', 'api'];
const securityChecks = ['dependency_audit', 'secret_scan', 'permission_audit', 'agent_output_leak_detection'];

function countNeedsAttention(snapshot: Snapshot) {
  const reviews = (snapshot.production.reviewQueue || []).filter((item) => item.status === 'needs_fix' || item.status === 'review_requested').length;
  const security = (snapshot.platform.securityAuditRuns || []).reduce((total, run) => total + (run.findings?.length || 0), 0);
  const evalFailures = (snapshot.platform.evaluationRuns || []).filter((run) => Number(run.summary?.failed || 0) > 0).length;
  const failedRuns = (snapshot.production.issueRuns || []).filter((run) => /fail|error/i.test(run.status || '')).length;
  return reviews + security + evalFailures + failedRuns;
}

function countRunning(snapshot: Snapshot) {
  const issueRuns = (snapshot.production.issueRuns || []).filter((run) => /queued|running|active/i.test(run.status || '')).length;
  const jobs = (snapshot.production.schedulerJobs || []).filter((job) => /queued|running|watch|cron|active/i.test(job.status || job.mode || '')).length;
  return issueRuns + jobs;
}

function compact(value: unknown, max = 90) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function toLines(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function formatDate(value?: string | null) {
  if (!value) return 'Never';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatNumber(value: unknown) {
  const number = Number(value || 0);
  return new Intl.NumberFormat().format(number);
}

function formatCurrency(value: unknown) {
  const number = Number(value || 0);
  return `$${number.toFixed(number >= 1 ? 2 : 4)}`;
}

async function readJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.error || `HTTP ${response.status}`);
  }
  return data as T;
}

function createTimeline(snapshot: Snapshot): TimelineEntry[] {
  const issueRuns = (snapshot.production.issueRuns || []).slice(0, 8).map((run) => ({
    id: `issue-${run.id}`,
    time: formatDate(run.updatedAt || run.createdAt),
    actor: run.provider || 'agent',
    action: run.title || run.issueUrl || 'Issue-to-PR run',
    result: `Status: ${run.status || 'queued'}${run.branchName ? `, branch ${run.branchName}` : ''}`,
    tone: /fail|error/i.test(run.status || '') ? 'danger' : /done|complete|merged/i.test(run.status || '') ? 'success' : 'info',
  }));

  const reviews = (snapshot.production.reviewQueue || []).slice(0, 8).map((item) => ({
    id: `review-${item.id}`,
    time: formatDate(item.updatedAt || item.createdAt),
    actor: 'review',
    action: item.title || 'Review requested',
    result: `Status: ${item.status || 'review_requested'}${item.changedFiles?.length ? `, ${item.changedFiles.length} changed files` : ''}`,
    tone: item.status === 'needs_fix' ? 'warning' : 'neutral',
  }));

  const checkpoints = (snapshot.production.checkpoints || []).slice(0, 6).map((checkpoint) => ({
    id: `checkpoint-${checkpoint.id}`,
    time: formatDate(checkpoint.createdAt),
    actor: 'checkpoint',
    action: checkpoint.reason || 'Workspace checkpoint',
    result: `${checkpoint.changedFiles?.length || 0} changed files captured`,
    tone: 'success',
  }));

  const audits = (snapshot.platform.auditLog || []).slice(0, 8).map((entry) => ({
    id: `audit-${entry.id}`,
    time: formatDate(entry.createdAt),
    actor: entry.actorId || 'system',
    action: entry.action || 'Audit event',
    result: compact(JSON.stringify(entry.details || {}), 120),
    tone: /delete|disable|secret|error/i.test(entry.action || '') ? 'warning' : 'neutral',
  }));

  return [...issueRuns, ...reviews, ...checkpoints, ...audits].slice(0, 18) as TimelineEntry[];
}

export default function ControlRoomPage({ selectedProject }: ControlRoomPageProps) {
  const { t } = useTranslation('common');
  const pageRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  const [activeGroup, setActiveGroup] = useState<GroupId>('operations');
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [auditQuery, setAuditQuery] = useState('');
  const [repairPlan, setRepairPlan] = useState<any | null>(null);

  const [issueForm, setIssueForm] = useState({
    issueUrl: '',
    title: '',
    provider: 'opencode',
    model: '',
    baseBranch: 'main',
    acceptanceCriteria: 'Implementation is visible in the UI\nResponsive layout is verified\nBuild and smoke checks pass',
  });
  const [ciLog, setCiLog] = useState('');
  const [reviewForm, setReviewForm] = useState({ title: '', notes: '', changedFiles: '' });
  const [schedulerForm, setSchedulerForm] = useState({ name: '', mode: 'manual', cron: '', prompt: '' });
  const [adminForm, setAdminForm] = useState({ username: '', password: '', role: 'member', status: 'active' });
  const [collaboratorForm, setCollaboratorForm] = useState({ userRef: '', role: 'worker', allowedRoots: '.' });
  const [secretForm, setSecretForm] = useState({ name: '', envName: '', scope: 'project', target: '', value: '' });
  const [usageForm, setUsageForm] = useState({ provider: 'opencode', model: '', workflow: 'manual', inputTokens: '1000', outputTokens: '500', costUsd: '0.02', latencyMs: '1200', status: 'ok' });
  const [securityForm, setSecurityForm] = useState({ checks: securityChecks.join('\n'), findingTitle: '' });
  const [pluginForm, setPluginForm] = useState({ name: '', type: 'mcp-server', source: '', installCommand: '', permissionScopes: '' });
  const [evalSuiteForm, setEvalSuiteForm] = useState({ name: '', description: '', taskTitle: '', acceptanceCriteria: '' });

  const defaultProjectName = selectedProject?.name || selectedProject?.displayName || '';
  const defaultProjectPath = selectedProject?.path || selectedProject?.fullPath || '';
  const timeline = useMemo(() => createTimeline(snapshot), [snapshot]);
  const activeGroupMeta = CONTROL_ROOM_GROUPS.find((group) => group.id === activeGroup) || CONTROL_ROOM_GROUPS[0];
  const cr = useCallback((key: string, defaultValue: string, values?: Record<string, unknown>) => (
    t(`controlRoom.${key}`, { defaultValue, ...values })
  ), [t]);

  useGsapEntrance(pageRef, 'fade-up');
  useGsapSurfaceTransition(surfaceRef, activeGroup);
  useGsapListReveal(listRef, `${activeGroup}-${timeline.length}`);
  useGsapStatusHighlight(statusRef, notice || error);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [production, platform] = await Promise.all([
        readJson<{ state: ProductionState }>('/api/production-agent-loop'),
        readJson<{ state: PlatformState }>('/api/platformization'),
      ]);
      setSnapshot({
        production: production.state || emptySnapshot.production,
        platform: platform.state || emptySnapshot.platform,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const action = useCallback(async (message: string, fn: () => Promise<void>) => {
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(message);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [refresh]);

  const filteredAudit = useMemo(() => {
    const query = auditQuery.trim().toLowerCase();
    const entries = snapshot.platform.auditLog || [];
    if (!query) return entries;
    return entries.filter((entry) => JSON.stringify(entry).toLowerCase().includes(query));
  }, [auditQuery, snapshot.platform.auditLog]);

  const totals = {
    attention: countNeedsAttention(snapshot),
    running: countRunning(snapshot),
    reviews: snapshot.production.reviewQueue?.length || 0,
    users: snapshot.platform.adminUsers?.length || 0,
    collaborators: snapshot.platform.projectCollaborators?.length || 0,
    secrets: snapshot.platform.secrets?.length || 0,
    plugins: snapshot.platform.marketplacePlugins?.length || 0,
    evalRuns: snapshot.platform.evaluationRuns?.length || 0,
    audits: snapshot.platform.securityAuditRuns?.length || 0,
  };

  return (
    <div ref={pageRef} className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="flex flex-col gap-3 border-b border-border/60 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sparkles className="h-4 w-4" />
            {cr('title', 'Control room')}
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            {cr('subtitle', 'A task-first command surface for {{target}}. Start with what needs attention, then open detail only when needed.', {
              target: selectedProject?.displayName || cr('thisServer', 'this self-hosted server'),
            })}
          </p>
        </div>
        <Button className="min-h-[44px] shrink-0" size="sm" variant="outline" onClick={() => { void refresh(); }} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          {cr('refresh', 'Refresh')}
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[220px_minmax(0,1fr)_320px]">
        <nav className="hidden border-r border-border/60 bg-muted/15 p-3 lg:block">
          <div className="space-y-2">
            {CONTROL_ROOM_GROUPS.map((group) => (
              <GroupButton key={group.id} group={group} isActive={activeGroup === group.id} onClick={() => setActiveGroup(group.id)} />
            ))}
          </div>
        </nav>

        <main ref={surfaceRef} className="min-h-0 overflow-auto">
          <div className="overflow-x-auto lg:hidden">
            <div className="flex gap-2 border-b border-border/60 bg-muted/15 px-4 py-3">
              {CONTROL_ROOM_GROUPS.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setActiveGroup(group.id)}
                  className={cn(
                    'inline-flex h-11 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-medium',
                    activeGroup === group.id
                      ? 'border-primary/40 bg-primary/10 text-foreground'
                      : 'border-border/60 bg-background text-muted-foreground',
                  )}
                >
                  <group.icon className="h-4 w-4" />
                  {group.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-6 p-4 md:p-6">
            <div ref={statusRef}>
              {error && <StatusBanner tone="danger">{error}</StatusBanner>}
              {notice && <StatusBanner tone="success">{notice}</StatusBanner>}
            </div>

            <section>
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-foreground">{cr('overview.commandSurface', 'Command surface')}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {cr('overview.commandSurfaceDescription', 'Six cards, one decision: what should you look at next?')}
                  </p>
                </div>
                <Badge variant="secondary">{cr('overview.currentGroup', 'Current group')}: {activeGroupMeta.label}</Badge>
              </div>
              <div ref={listRef} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {OVERVIEW_CARDS.map((card) => (
                  <CommandCard
                    key={card.id}
                    icon={card.icon}
                    title={cr(`overviewCards.${card.id}.title`, card.title)}
                    description={cr(`overviewCards.${card.id}.description`, card.description)}
                    meta={cr(`overviewCards.${card.id}.meta`, card.meta)}
                    value={card.value(snapshot)}
                    tone={card.tone}
                    isActive={activeGroup === card.group}
                    onClick={() => setActiveGroup(card.group)}
                  />
                ))}
              </div>
            </section>

            {activeGroup === 'operations' && (
              <OperationsGroup
                cr={cr}
                totals={totals}
                timeline={timeline}
                snapshot={snapshot}
                defaultProjectName={defaultProjectName}
                defaultProjectPath={defaultProjectPath}
                issueForm={issueForm}
                setIssueForm={setIssueForm}
                ciLog={ciLog}
                setCiLog={setCiLog}
                repairPlan={repairPlan}
                setRepairPlan={setRepairPlan}
                reviewForm={reviewForm}
                setReviewForm={setReviewForm}
                schedulerForm={schedulerForm}
                setSchedulerForm={setSchedulerForm}
                action={action}
              />
            )}

            {activeGroup === 'people' && (
              <PeopleGroup
                cr={cr}
                snapshot={snapshot}
                defaultProjectName={defaultProjectName}
                defaultProjectPath={defaultProjectPath}
                adminForm={adminForm}
                setAdminForm={setAdminForm}
                collaboratorForm={collaboratorForm}
                setCollaboratorForm={setCollaboratorForm}
                auditQuery={auditQuery}
                setAuditQuery={setAuditQuery}
                filteredAudit={filteredAudit}
                action={action}
              />
            )}

            {activeGroup === 'access' && (
              <AccessGroup cr={cr} selectedProject={selectedProject} />
            )}

            {activeGroup === 'security' && (
              <SecurityGroup
                cr={cr}
                snapshot={snapshot}
                defaultProjectName={defaultProjectName}
                defaultProjectPath={defaultProjectPath}
                secretForm={secretForm}
                setSecretForm={setSecretForm}
                securityForm={securityForm}
                setSecurityForm={setSecurityForm}
                action={action}
              />
            )}

            {activeGroup === 'insights' && (
              <InsightsGroup
                cr={cr}
                snapshot={snapshot}
                usageForm={usageForm}
                setUsageForm={setUsageForm}
                pluginForm={pluginForm}
                setPluginForm={setPluginForm}
                evalSuiteForm={evalSuiteForm}
                setEvalSuiteForm={setEvalSuiteForm}
                defaultProjectPath={defaultProjectPath}
                action={action}
              />
            )}
          </div>
        </main>

        <ContextDrawer
          className="hidden min-h-0 overflow-auto rounded-none border-y-0 border-r-0 lg:block"
          title="What this means"
          description={activeGroupMeta.description}
        >
          <GuidanceCard
            title="Recommended next step"
            description={getRecommendedNextStep(activeGroup, totals)}
          />
          <ControlRoomPanel
            title="Run timeline"
            description="Readable activity feed for agents, reviewers, checkpoints, and audit events."
          >
            <div className="space-y-3">
              <ResponsiveDataList
                items={timeline.slice(0, 5)}
                empty={<EmptyGuidance title="No run timeline yet" description="Run activity appears here after issue runs, reviews, checkpoints, or audit events are recorded." />}
                render={(entry) => (
                  <TimelineItem
                    key={entry.id}
                    time={entry.time}
                    actor={entry.actor}
                    action={entry.action}
                    result={entry.result}
                    tone={entry.tone}
                  />
                )}
              />
            </div>
          </ControlRoomPanel>
          <ControlRoomPanel title="Server signal" description="The first screen avoids raw backend sections and shows only current status.">
            <div className="grid grid-cols-2 gap-2">
              <SummaryCard label="Attention" value={totals.attention} icon={AlertTriangle} tone={totals.attention ? 'warning' : 'success'} />
              <SummaryCard label="Running" value={totals.running} icon={Clock} tone="info" />
            </div>
          </ControlRoomPanel>
        </ContextDrawer>
      </div>
    </div>
  );
}

function GroupButton({
  group,
  isActive,
  onClick,
}: {
  group: (typeof CONTROL_ROOM_GROUPS)[number];
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-[44px] w-full items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors',
        isActive
          ? 'border-primary/40 bg-primary/10 text-foreground'
          : 'border-transparent text-muted-foreground hover:border-border/70 hover:bg-background',
      )}
    >
      <group.icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{group.label}</span>
        <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">{group.description}</span>
      </span>
    </button>
  );
}

function OperationsGroup({
  cr,
  totals,
  timeline,
  snapshot,
  defaultProjectName,
  defaultProjectPath,
  issueForm,
  setIssueForm,
  ciLog,
  setCiLog,
  repairPlan,
  setRepairPlan,
  reviewForm,
  setReviewForm,
  schedulerForm,
  setSchedulerForm,
  action,
}: {
  cr: (key: string, defaultValue: string, values?: Record<string, unknown>) => string;
  totals: Record<string, number>;
  timeline: TimelineEntry[];
  snapshot: Snapshot;
  defaultProjectName: string;
  defaultProjectPath: string;
  issueForm: any;
  setIssueForm: (value: any) => void;
  ciLog: string;
  setCiLog: (value: string) => void;
  repairPlan: any | null;
  setRepairPlan: (value: any | null) => void;
  reviewForm: any;
  setReviewForm: (value: any) => void;
  schedulerForm: any;
  setSchedulerForm: (value: any) => void;
  action: (message: string, fn: () => Promise<void>) => Promise<void>;
}) {
  return (
    <section className="space-y-4">
      <GuidanceCard
        description={cr('guidance.operations', 'Use Operations when something is actively running, waiting for review, or needs repair. Forms stay hidden until you intentionally open them.')}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Needs attention" value={totals.attention} icon={AlertTriangle} tone={totals.attention ? 'warning' : 'success'} />
        <SummaryCard label="Running now" value={totals.running} icon={Clock} tone="info" />
        <SummaryCard label="Reviews" value={totals.reviews} icon={FileCode} />
        <SummaryCard label="Checkpoints" value={snapshot.production.checkpoints?.length || 0} icon={CheckCircle} tone="success" />
      </div>

      <ControlRoomPanel
        title="Run timeline"
        description="Readable actor, action, and result history without raw JSON."
      >
        <div className="space-y-3">
          <ResponsiveDataList
            items={timeline}
            empty={<EmptyGuidance title="No activity yet" description="Issue runs, review decisions, checkpoints, and audit events will appear here as a vertical timeline." />}
            render={(entry) => (
              <TimelineItem
                key={entry.id}
                time={entry.time}
                actor={entry.actor}
                action={entry.action}
                result={entry.result}
                tone={entry.tone}
              >
                {entry.details}
              </TimelineItem>
            )}
          />
        </div>
      </ControlRoomPanel>

      <ControlRoomPanel title="Action queue" description="Review items are shown as mobile-friendly rows instead of a cramped table.">
        <ResponsiveDataList
          items={snapshot.production.reviewQueue || []}
          empty={<EmptyGuidance title="No review items" description="Create a review item when changed files need an accept/fix decision." />}
          render={(item) => (
            <ActionRow
              key={item.id}
              title={item.title || 'Review requested'}
              description={`${item.changedFiles?.length || 0} changed files`}
              status={item.status || 'review_requested'}
              action={(
                <Button size="sm" variant="outline" onClick={() => { void action('Review marked accepted.', async () => {
                  await readJson(`/api/production-agent-loop/review-queue/${encodeURIComponent(item.id)}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ status: 'accepted' }),
                  });
                }); }}>
                  Accept
                </Button>
              )}
            />
          )}
        />
      </ControlRoomPanel>

      <AdvancedDisclosure title="Advanced operations" description="Queue runs, parse CI failures, create reviews, or schedule background work.">
        <div className="grid gap-4 xl:grid-cols-2">
          <FormPanel title="Queue issue-to-PR run">
            <Input placeholder="GitHub issue URL" value={issueForm.issueUrl} onChange={(e) => setIssueForm({ ...issueForm, issueUrl: e.target.value })} />
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Input placeholder="Manual title fallback" value={issueForm.title} onChange={(e) => setIssueForm({ ...issueForm, title: e.target.value })} />
              <Input placeholder="Model" value={issueForm.model} onChange={(e) => setIssueForm({ ...issueForm, model: e.target.value })} />
              <Select value={issueForm.provider} onChange={(value) => setIssueForm({ ...issueForm, provider: value })} options={providerOptions} />
              <Input placeholder="Base branch" value={issueForm.baseBranch} onChange={(e) => setIssueForm({ ...issueForm, baseBranch: e.target.value })} />
            </div>
            <Textarea className="mt-2" rows={4} value={issueForm.acceptanceCriteria} onChange={(e) => setIssueForm({ ...issueForm, acceptanceCriteria: e.target.value })} />
            <Button className="mt-3 min-h-[44px]" onClick={() => { void action('Issue-to-PR run queued.', async () => {
              await readJson('/api/production-agent-loop/github/issue-to-pr', {
                method: 'POST',
                body: JSON.stringify({
                  ...issueForm,
                  projectName: defaultProjectName,
                  projectPath: defaultProjectPath,
                  acceptanceCriteria: toLines(issueForm.acceptanceCriteria),
                }),
              });
            }); }}>
              <Plus className="h-4 w-4" />
              Queue run
            </Button>
          </FormPanel>

          <FormPanel title="CI repair and review queue">
            <Textarea rows={5} placeholder="Paste failing CI, lint, typecheck, or build output" value={ciLog} onChange={(e) => setCiLog(e.target.value)} />
            <Button className="mt-3 min-h-[44px]" variant="outline" onClick={() => { void action('CI repair plan generated.', async () => {
              const data = await readJson<{ repairPlan: any }>('/api/production-agent-loop/ci/repair-plan', {
                method: 'POST',
                body: JSON.stringify({ log: ciLog }),
              });
              setRepairPlan(data.repairPlan);
            }); }}>
              Parse failure
            </Button>
            {repairPlan && (
              <pre className="mt-3 max-h-56 overflow-auto rounded-md bg-muted/30 p-3 text-xs text-muted-foreground">
                {repairPlan.repairPrompt}
              </pre>
            )}
            <Input className="mt-4" placeholder="Review title" value={reviewForm.title} onChange={(e) => setReviewForm({ ...reviewForm, title: e.target.value })} />
            <Textarea className="mt-2" rows={3} placeholder="Changed files, one per line" value={reviewForm.changedFiles} onChange={(e) => setReviewForm({ ...reviewForm, changedFiles: e.target.value })} />
            <Button className="mt-3 min-h-[44px]" onClick={() => { void action('Review item created.', async () => {
              await readJson('/api/production-agent-loop/review-queue', {
                method: 'POST',
                body: JSON.stringify({
                  projectName: defaultProjectName,
                  projectPath: defaultProjectPath,
                  title: reviewForm.title || 'Review requested',
                  notes: reviewForm.notes,
                  changedFiles: toLines(reviewForm.changedFiles),
                }),
              });
            }); }}>
              Create review item
            </Button>
          </FormPanel>

          <FormPanel title="Background job">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input placeholder="Job name" value={schedulerForm.name} onChange={(e) => setSchedulerForm({ ...schedulerForm, name: e.target.value })} />
              <Select value={schedulerForm.mode} onChange={(value) => setSchedulerForm({ ...schedulerForm, mode: value })} options={['manual', 'watch', 'cron']} />
              <Input placeholder="Cron or watch expression" value={schedulerForm.cron} onChange={(e) => setSchedulerForm({ ...schedulerForm, cron: e.target.value })} />
            </div>
            <Textarea className="mt-2" rows={3} placeholder="Background agent prompt" value={schedulerForm.prompt} onChange={(e) => setSchedulerForm({ ...schedulerForm, prompt: e.target.value })} />
            <Button className="mt-3 min-h-[44px]" onClick={() => { void action('Background job scheduled.', async () => {
              await readJson('/api/production-agent-loop/scheduler/jobs', {
                method: 'POST',
                body: JSON.stringify({ ...schedulerForm, projectName: defaultProjectName, provider: issueForm.provider }),
              });
            }); }}>
              Schedule job
            </Button>
          </FormPanel>
        </div>
      </AdvancedDisclosure>
    </section>
  );
}

function PeopleGroup({
  cr,
  snapshot,
  defaultProjectName,
  defaultProjectPath,
  adminForm,
  setAdminForm,
  collaboratorForm,
  setCollaboratorForm,
  auditQuery,
  setAuditQuery,
  filteredAudit,
  action,
}: {
  cr: (key: string, defaultValue: string, values?: Record<string, unknown>) => string;
  snapshot: Snapshot;
  defaultProjectName: string;
  defaultProjectPath: string;
  adminForm: any;
  setAdminForm: (value: any) => void;
  collaboratorForm: any;
  setCollaboratorForm: (value: any) => void;
  auditQuery: string;
  setAuditQuery: (value: string) => void;
  filteredAudit: any[];
  action: (message: string, fn: () => Promise<void>) => Promise<void>;
}) {
  const canAssignCollaborator = Boolean(defaultProjectName && collaboratorForm.userRef?.trim());

  return (
    <section className="space-y-4">
      <GuidanceCard description={cr('guidance.people', 'People is for who can enter the self-hosted server and what they can do inside each project.')} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Sub-users" value={snapshot.platform.adminUsers?.length || 0} icon={Users} />
        <SummaryCard label="Collaborators" value={snapshot.platform.projectCollaborators?.length || 0} icon={Users} tone="info" />
        <SummaryCard label="Roles" value={Object.keys(snapshot.platform.roles || {}).length} icon={Lock} />
        <SummaryCard label="Audit events" value={snapshot.platform.auditLog?.length || 0} icon={FileCode} />
      </div>

      <ControlRoomPanel title="Project collaborators" description="Project partners and workers are not global admins. They get scoped access to assigned projects.">
        <ResponsiveDataList
          items={snapshot.platform.projectCollaborators || []}
          empty={<EmptyGuidance title="No collaborators yet" description="Create a sub-user first, then assign that person to a project role." />}
          render={(collaborator) => (
            <ActionRow
              key={collaborator.id}
              title={collaborator.userRef}
              description={`${collaborator.projectName || 'Project'} - ${Object.keys(collaborator.capabilities || {}).filter((key) => collaborator.capabilities[key]).join(', ') || 'role scoped'}`}
              status={collaborator.role}
            />
          )}
        />
      </ControlRoomPanel>

      <ControlRoomPanel title="Audit log" description="Search what sub-users, project partners, and workers changed without opening a raw database view.">
        <Input
          className="mb-3 h-11"
          placeholder="Search actor, action, project, or detail"
          value={auditQuery}
          onChange={(event) => setAuditQuery(event.target.value)}
        />
        <ResponsiveDataList
          items={filteredAudit}
          empty={<EmptyGuidance title="No audit events match" description="User and project access activity appears here after actions are recorded." />}
          render={(entry) => (
            <ActionRow
              key={entry.id}
              title={entry.actorId || 'system'}
              description={`${entry.action || 'Audit event'} - ${formatDate(entry.createdAt)}`}
              status={entry.resource || entry.target || 'audit'}
            />
          )}
        />
      </ControlRoomPanel>

      <AdvancedDisclosure title="Advanced people management" description="Create users and assign project roles only when needed.">
        <div className="grid gap-4 xl:grid-cols-2">
          <FormPanel title="Create sub-user">
            <Input placeholder="Username or email" value={adminForm.username} onChange={(e) => setAdminForm({ ...adminForm, username: e.target.value })} />
            <Input className="mt-2" type="password" placeholder="Temporary password" value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })} />
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Select value={adminForm.role} onChange={(value) => setAdminForm({ ...adminForm, role: value })} options={roleOptions} />
              <Select value={adminForm.status} onChange={(value) => setAdminForm({ ...adminForm, status: value })} options={['active', 'disabled']} />
            </div>
            <Button className="mt-3 min-h-[44px]" onClick={() => { void action('Sub-user created.', async () => {
              await readJson('/api/platformization/admin/users', {
                method: 'POST',
                body: JSON.stringify(adminForm),
              });
              setAdminForm({ ...adminForm, username: '', password: '' });
            }); }}>
              Create user
            </Button>
          </FormPanel>
          <FormPanel title="Assign project collaborator">
            <Input placeholder="User email or username" value={collaboratorForm.userRef} onChange={(e) => setCollaboratorForm({ ...collaboratorForm, userRef: e.target.value })} />
            <Select className="mt-2" value={collaboratorForm.role} onChange={(value) => setCollaboratorForm({ ...collaboratorForm, role: value })} options={collaboratorRoles} />
            <Textarea
              className="mt-2"
              rows={3}
              placeholder="Allowed folders, one per line. Use . for whole project."
              value={collaboratorForm.allowedRoots}
              onChange={(e) => setCollaboratorForm({ ...collaboratorForm, allowedRoots: e.target.value })}
            />
            <GuidanceCard
              title="Recommended next step"
              description={defaultProjectName
                ? `Assign this person to ${defaultProjectName}, then share an access URL from Settings > Access.`
                : 'Select a project before assigning scoped access.'}
            />
            <Button className="mt-3 min-h-[44px]" disabled={!canAssignCollaborator} onClick={() => { void action('Project collaborator added.', async () => {
              await readJson('/api/platformization/project-collaborators', {
                method: 'POST',
                body: JSON.stringify({
                  ...collaboratorForm,
                  allowedRoots: toLines(collaboratorForm.allowedRoots),
                  projectName: defaultProjectName,
                  projectPath: defaultProjectPath,
                }),
              });
              setCollaboratorForm({ ...collaboratorForm, userRef: '', allowedRoots: '.' });
            }); }}>
              Add collaborator
            </Button>
          </FormPanel>
        </div>
      </AdvancedDisclosure>
    </section>
  );
}

function AccessGroup({ cr, selectedProject }: { cr: (key: string, defaultValue: string, values?: Record<string, unknown>) => string; selectedProject: Project | null }) {
  return (
    <section className="space-y-4">
      <GuidanceCard
        description={cr('guidance.access', 'Access explains how people reach Pixcode. The actual server-wide setup belongs in Settings > Access because it affects every project and user.')}
        action={(
          <Button className="min-h-[44px]" variant="outline" onClick={() => (window as any).openSettings?.('access')}>
            Open Settings &gt; Access
          </Button>
        )}
      />
      <div className="grid gap-3 md:grid-cols-3">
        <GuidanceCard title="LAN and local" description="Use when the browser is on the same machine or network. Start here before private or public tunnels." />
        <GuidanceCard title="Tailscale private access" description="Best when a team needs private access without exposing Pixcode publicly. The UI should guide install, login, and URL sharing." />
        <GuidanceCard title="Cloudflare or custom domain" description="Best when users need a stable HTTPS URL. Configure the tunnel/domain once and share it with assigned users." />
      </div>
      <ControlRoomPanel title="How users connect" description="This keeps Access understandable for non-technical users.">
        <div className="grid gap-3 md:grid-cols-3">
          <NumberedStep number="1" title="Create the user" description="Add them in People so the server knows who they are." />
          <NumberedStep number="2" title="Assign project role" description={`Give them project access${selectedProject?.displayName ? ` for ${selectedProject.displayName}` : ''}.`} />
          <NumberedStep number="3" title="Share one URL" description="Use a LAN, Tailscale, Cloudflare Tunnel, or custom domain URL from Settings > Access." />
        </div>
      </ControlRoomPanel>
    </section>
  );
}

function SecurityGroup({
  cr,
  snapshot,
  defaultProjectName,
  defaultProjectPath,
  secretForm,
  setSecretForm,
  securityForm,
  setSecurityForm,
  action,
}: {
  cr: (key: string, defaultValue: string, values?: Record<string, unknown>) => string;
  snapshot: Snapshot;
  defaultProjectName: string;
  defaultProjectPath: string;
  secretForm: any;
  setSecretForm: (value: any) => void;
  securityForm: any;
  setSecurityForm: (value: any) => void;
  action: (message: string, fn: () => Promise<void>) => Promise<void>;
}) {
  return (
    <section className="space-y-4">
      <GuidanceCard description={cr('guidance.security', 'Security keeps sensitive values, permission checks, and audit risk visible without exposing raw secrets.')} tone="warning" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Scoped secrets" value={snapshot.platform.secrets?.length || 0} icon={Key} />
        <SummaryCard label="Audit runs" value={snapshot.platform.securityAuditRuns?.length || 0} icon={ShieldAlert} tone="warning" />
        <SummaryCard label="Findings" value={(snapshot.platform.securityAuditRuns || []).reduce((total, run) => total + (run.findings?.length || 0), 0)} icon={AlertTriangle} tone="danger" />
        <SummaryCard label="Audit events" value={snapshot.platform.auditLog?.length || 0} icon={FileCode} />
      </div>

      <ControlRoomPanel title="Secret vault" description="Rows show scope, target, and redacted env names. Values stay hidden.">
        <ResponsiveDataList
          items={snapshot.platform.secrets || []}
          empty={<EmptyGuidance title="No secrets stored" description="Store provider, project, workflow, Telegram, or API env values from the advanced form." />}
          render={(secret) => (
            <ActionRow
              key={secret.id}
              title={secret.envName}
              description={`${secret.name} - ${secret.target || 'global'} - ${secret.redacted}`}
              status={secret.scope}
            />
          )}
        />
      </ControlRoomPanel>

      <AdvancedDisclosure title="Advanced security actions" description="Store scoped env values or queue audit checks.">
        <div className="grid gap-4 xl:grid-cols-2">
          <FormPanel title="Create secret">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input placeholder="Secret name" value={secretForm.name} onChange={(e) => setSecretForm({ ...secretForm, name: e.target.value })} />
              <Input placeholder="ENV_NAME" value={secretForm.envName} onChange={(e) => setSecretForm({ ...secretForm, envName: e.target.value })} />
              <Select value={secretForm.scope} onChange={(value) => setSecretForm({ ...secretForm, scope: value })} options={secretScopes} />
              <Input placeholder="Target project/provider/workflow" value={secretForm.target || defaultProjectPath} onChange={(e) => setSecretForm({ ...secretForm, target: e.target.value })} />
            </div>
            <Input className="mt-2" type="password" placeholder="Secret value" value={secretForm.value} onChange={(e) => setSecretForm({ ...secretForm, value: e.target.value })} />
            <Button className="mt-3 min-h-[44px]" onClick={() => { void action('Secret stored in the vault.', async () => {
              await readJson('/api/platformization/secrets', {
                method: 'POST',
                body: JSON.stringify({ ...secretForm, target: secretForm.target || defaultProjectPath }),
              });
              setSecretForm({ ...secretForm, value: '' });
            }); }}>
              Store secret
            </Button>
          </FormPanel>
          <FormPanel title="Create audit run">
            <Textarea rows={5} value={securityForm.checks} onChange={(e) => setSecurityForm({ ...securityForm, checks: e.target.value })} />
            <Input className="mt-2" placeholder="Optional finding title" value={securityForm.findingTitle} onChange={(e) => setSecurityForm({ ...securityForm, findingTitle: e.target.value })} />
            <Button className="mt-3 min-h-[44px]" onClick={() => { void action('Security audit queued.', async () => {
              await readJson('/api/platformization/security/audit-runs', {
                method: 'POST',
                body: JSON.stringify({
                  projectName: defaultProjectName,
                  projectPath: defaultProjectPath,
                  checks: toLines(securityForm.checks),
                  findings: securityForm.findingTitle ? [{ title: securityForm.findingTitle, severity: 'medium' }] : [],
                }),
              });
            }); }}>
              Create audit
            </Button>
          </FormPanel>
        </div>
      </AdvancedDisclosure>
    </section>
  );
}

function InsightsGroup({
  cr,
  snapshot,
  usageForm,
  setUsageForm,
  pluginForm,
  setPluginForm,
  evalSuiteForm,
  setEvalSuiteForm,
  defaultProjectPath,
  action,
}: {
  cr: (key: string, defaultValue: string, values?: Record<string, unknown>) => string;
  snapshot: Snapshot;
  usageForm: any;
  setUsageForm: (value: any) => void;
  pluginForm: any;
  setPluginForm: (value: any) => void;
  evalSuiteForm: any;
  setEvalSuiteForm: (value: any) => void;
  defaultProjectPath: string;
  action: (message: string, fn: () => Promise<void>) => Promise<void>;
}) {
  return (
    <section className="space-y-4">
      <GuidanceCard description={cr('guidance.insights', 'Insights is for model/runtime decisions: cost, latency, eval quality, and marketplace health.')} tone="success" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Usage rows" value={snapshot.platform.usageSummary?.length || 0} icon={BarChart3} />
        <SummaryCard label="Eval runs" value={snapshot.platform.evaluationRuns?.length || 0} icon={Workflow} tone="success" />
        <SummaryCard label="Eval suites" value={snapshot.platform.evaluationSuites?.length || 0} icon={CheckCircle} />
        <SummaryCard label="Marketplace" value={snapshot.platform.marketplacePlugins?.length || 0} icon={Server} tone="info" />
      </div>

      <ControlRoomPanel title="Usage summary" description="Provider metrics are stacked as cards on mobile instead of forcing a wide table.">
        <ResponsiveDataList
          items={snapshot.platform.usageSummary || []}
          empty={<EmptyGuidance title="No usage events yet" description="Usage appears after provider or workflow events are recorded." />}
          render={(row, index) => (
            <ActionRow
              key={`${row.provider}-${row.model}-${row.workflow}-${index}`}
              title={`${row.provider || 'provider'} ${row.model || ''}`.trim()}
              description={`${formatNumber(row.totalTokens)} tokens - ${formatCurrency(row.costUsd)} - ${row.averageLatencyMs || 0}ms avg`}
              status={`${row.errorRate || 0}% errors`}
            />
          )}
        />
      </ControlRoomPanel>

      <ControlRoomPanel title="Marketplace health" description="MCP servers, workflow templates, provider adapters, and notification channels stay visible without crowding the overview.">
        <ResponsiveDataList
          items={snapshot.platform.marketplacePlugins || []}
          empty={<EmptyGuidance title="No marketplace entries" description="Register entries only when a plugin or workflow template is ready to install." />}
          render={(plugin) => (
            <ActionRow
              key={plugin.id}
              title={plugin.name}
              description={plugin.source || 'No source configured'}
              status={`${plugin.type} - ${plugin.health?.status || 'unknown'}`}
            />
          )}
        />
      </ControlRoomPanel>

      <AdvancedDisclosure title="Advanced insight actions" description="Record usage, create evaluation suites, or register marketplace entries.">
        <div className="grid gap-4 xl:grid-cols-3">
          <FormPanel title="Record usage">
            <div className="grid gap-2 sm:grid-cols-2">
              <Select value={usageForm.provider} onChange={(value) => setUsageForm({ ...usageForm, provider: value })} options={providerOptions} />
              <Input placeholder="Model" value={usageForm.model} onChange={(e) => setUsageForm({ ...usageForm, model: e.target.value })} />
              <Input placeholder="Workflow" value={usageForm.workflow} onChange={(e) => setUsageForm({ ...usageForm, workflow: e.target.value })} />
              <Select value={usageForm.status} onChange={(value) => setUsageForm({ ...usageForm, status: value })} options={['ok', 'error', 'timeout']} />
              <Input placeholder="Input tokens" value={usageForm.inputTokens} onChange={(e) => setUsageForm({ ...usageForm, inputTokens: e.target.value })} />
              <Input placeholder="Output tokens" value={usageForm.outputTokens} onChange={(e) => setUsageForm({ ...usageForm, outputTokens: e.target.value })} />
              <Input placeholder="Cost USD" value={usageForm.costUsd} onChange={(e) => setUsageForm({ ...usageForm, costUsd: e.target.value })} />
              <Input placeholder="Latency ms" value={usageForm.latencyMs} onChange={(e) => setUsageForm({ ...usageForm, latencyMs: e.target.value })} />
            </div>
            <Button className="mt-3 min-h-[44px]" onClick={() => { void action('Usage event recorded.', async () => {
              await readJson('/api/platformization/usage/events', { method: 'POST', body: JSON.stringify(usageForm) });
            }); }}>
              Record usage
            </Button>
          </FormPanel>
          <FormPanel title="Create eval suite">
            <Input placeholder="Suite name" value={evalSuiteForm.name} onChange={(e) => setEvalSuiteForm({ ...evalSuiteForm, name: e.target.value })} />
            <Input className="mt-2" placeholder="Description" value={evalSuiteForm.description} onChange={(e) => setEvalSuiteForm({ ...evalSuiteForm, description: e.target.value })} />
            <Input className="mt-2" placeholder="First task title" value={evalSuiteForm.taskTitle} onChange={(e) => setEvalSuiteForm({ ...evalSuiteForm, taskTitle: e.target.value })} />
            <Textarea className="mt-2" rows={3} placeholder="Acceptance criteria, one per line" value={evalSuiteForm.acceptanceCriteria} onChange={(e) => setEvalSuiteForm({ ...evalSuiteForm, acceptanceCriteria: e.target.value })} />
            <Button className="mt-3 min-h-[44px]" onClick={() => { void action('Evaluation suite created.', async () => {
              await readJson('/api/platformization/eval/suites', {
                method: 'POST',
                body: JSON.stringify({
                  name: evalSuiteForm.name || 'Regression suite',
                  description: evalSuiteForm.description,
                  tasks: [{
                    title: evalSuiteForm.taskTitle || 'Demo task',
                    projectPath: defaultProjectPath,
                    acceptanceCriteria: toLines(evalSuiteForm.acceptanceCriteria),
                  }],
                }),
              });
            }); }}>
              Create suite
            </Button>
          </FormPanel>
          <FormPanel title="Register marketplace entry">
            <Input placeholder="Name" value={pluginForm.name} onChange={(e) => setPluginForm({ ...pluginForm, name: e.target.value })} />
            <Select className="mt-2" value={pluginForm.type} onChange={(value) => setPluginForm({ ...pluginForm, type: value })} options={['mcp-server', 'workflow-template', 'provider-adapter', 'notification-channel']} />
            <Input className="mt-2" placeholder="Source package or repository" value={pluginForm.source} onChange={(e) => setPluginForm({ ...pluginForm, source: e.target.value })} />
            <Input className="mt-2" placeholder="Install command" value={pluginForm.installCommand} onChange={(e) => setPluginForm({ ...pluginForm, installCommand: e.target.value })} />
            <Textarea className="mt-2" rows={3} placeholder="Permission scopes, one per line" value={pluginForm.permissionScopes} onChange={(e) => setPluginForm({ ...pluginForm, permissionScopes: e.target.value })} />
            <Button className="mt-3 min-h-[44px]" onClick={() => { void action('Marketplace entry saved.', async () => {
              await readJson('/api/platformization/marketplace/plugins', {
                method: 'POST',
                body: JSON.stringify({ ...pluginForm, permissionScopes: toLines(pluginForm.permissionScopes) }),
              });
            }); }}>
              Save entry
            </Button>
          </FormPanel>
        </div>
      </AdvancedDisclosure>
    </section>
  );
}

function getRecommendedNextStep(activeGroup: GroupId, totals: Record<string, number>) {
  if (totals.attention > 0) {
    return 'Open Operations first. Clear reviews, errors, failed evals, or security findings before starting new work.';
  }
  if (activeGroup === 'access') {
    return 'Open Settings > Access and save the one URL your users should use. Then assign project roles in People.';
  }
  if (activeGroup === 'people') {
    return 'Create sub-users first, assign project roles second, then share an access path.';
  }
  if (activeGroup === 'security') {
    return 'Store secrets with the smallest scope that works, then run a permission or secret scan.';
  }
  if (activeGroup === 'insights') {
    return 'Compare provider cost, latency, and eval pass rate before changing model defaults.';
  }
  return 'Review Running now and the timeline. If nothing needs attention, start the next issue-to-PR or scheduled job.';
}

function FormPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background p-4">
      <div className="mb-3 text-sm font-semibold text-foreground">{title}</div>
      {children}
    </div>
  );
}

function NumberedStep({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background px-4 py-4">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">{number}</span>
        <div className="text-sm font-semibold text-foreground">{title}</div>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}

function Select({ value, options, onChange, className = '' }: { value: string; options: string[]; onChange: (value: string) => void; className?: string }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn('flex h-11 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring', className)}
    >
      {options.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  );
}

function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn('w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring', props.className)}
    />
  );
}
