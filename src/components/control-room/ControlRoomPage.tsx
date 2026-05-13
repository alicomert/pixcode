import { useCallback, useEffect, useMemo, useState, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';

import type { Project } from '../../types/app';
import { Badge, Button, Input } from '../../shared/view/ui';
import { authenticatedFetch } from '../../utils/api';

import {
  BarChart3,
  FileCode,
  GitBranch,
  Key,
  Lock,
  Plus,
  RefreshCw,
  Search,
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

type SectionId =
  | 'overview'
  | 'production'
  | 'admin'
  | 'team'
  | 'secrets'
  | 'marketplace'
  | 'eval'
  | 'usage'
  | 'security';

type ProductionState = {
  issueRuns?: any[];
  reviewQueue?: any[];
  schedulerJobs?: any[];
  checkpoints?: any[];
};

type PlatformState = {
  roles?: Record<string, string[]>;
  teamMembers?: any[];
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

const sections: Array<{ id: SectionId; label: string; defaultLabel: string; icon: LucideIcon }> = [
  { id: 'overview', label: 'nav.overview', defaultLabel: 'Overview', icon: Sparkles },
  { id: 'production', label: 'nav.production', defaultLabel: 'Production', icon: GitBranch },
  { id: 'admin', label: 'nav.admin', defaultLabel: 'Admin', icon: Lock },
  { id: 'team', label: 'nav.team', defaultLabel: 'Team', icon: Users },
  { id: 'secrets', label: 'nav.secrets', defaultLabel: 'Secrets', icon: Key },
  { id: 'marketplace', label: 'nav.marketplace', defaultLabel: 'Marketplace', icon: Server },
  { id: 'eval', label: 'nav.eval', defaultLabel: 'Evaluations', icon: Workflow },
  { id: 'usage', label: 'nav.usage', defaultLabel: 'Usage', icon: BarChart3 },
  { id: 'security', label: 'nav.security', defaultLabel: 'Security', icon: ShieldAlert },
];

const providerOptions = ['opencode', 'claude', 'codex', 'cursor', 'gemini', 'qwen'];
const roleOptions = ['owner', 'admin', 'member', 'viewer', 'project_partner', 'project_worker', 'project_reviewer'];
const collaboratorRoles = ['partner', 'worker', 'reviewer', 'viewer'];
const secretScopes = ['global', 'provider', 'project', 'workflow', 'telegram', 'api'];
const pluginTypes = ['mcp-server', 'workflow-template', 'provider-adapter', 'notification-channel'];
const securityChecks = ['dependency_audit', 'secret_scan', 'permission_audit', 'agent_output_leak_detection'];

const emptySnapshot: Snapshot = {
  production: {
    issueRuns: [],
    reviewQueue: [],
    schedulerJobs: [],
    checkpoints: [],
  },
  platform: {
    roles: {},
    teamMembers: [],
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

export default function ControlRoomPage({ selectedProject }: ControlRoomPageProps) {
  const { t } = useTranslation('common');
  const [activeSection, setActiveSection] = useState<SectionId>('overview');
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [repairPlan, setRepairPlan] = useState<any | null>(null);
  const [auditQuery, setAuditQuery] = useState('');

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
  const [checkpointForm, setCheckpointForm] = useState({ reason: '', gitHead: '', changedFiles: '' });
  const [adminForm, setAdminForm] = useState({ username: '', password: '', role: 'member', status: 'active' });
  const [collaboratorForm, setCollaboratorForm] = useState({ userRef: '', role: 'worker' });
  const [secretForm, setSecretForm] = useState({ name: '', envName: '', scope: 'project', target: '', value: '' });
  const [scopedEnvForm, setScopedEnvForm] = useState({ provider: 'opencode', workflowId: '', channel: 'api' });
  const [scopedEnv, setScopedEnv] = useState<any | null>(null);
  const [pluginForm, setPluginForm] = useState({ name: '', type: 'mcp-server', source: '', installCommand: '', permissionScopes: '' });
  const [evalSuiteForm, setEvalSuiteForm] = useState({ name: '', description: '', taskTitle: '', acceptanceCriteria: '' });
  const [evalRunForm, setEvalRunForm] = useState({ suiteId: '', provider: 'opencode', model: '', passed: '1', failed: '0', latencyMs: '1200' });
  const [usageForm, setUsageForm] = useState({ provider: 'opencode', model: '', workflow: 'manual', inputTokens: '1000', outputTokens: '500', costUsd: '0.02', latencyMs: '1200', status: 'ok' });
  const [securityForm, setSecurityForm] = useState({ checks: securityChecks.join('\n'), status: 'queued', findingTitle: '' });

  const defaultProjectName = selectedProject?.name || selectedProject?.displayName || '';
  const defaultProjectPath = selectedProject?.path || selectedProject?.fullPath || '';
  const cr = useCallback((key: string, defaultValue: string, values?: Record<string, unknown>) => (
    t(`controlRoom.${key}`, { defaultValue, ...values })
  ), [t]);

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
    issueRuns: snapshot.production.issueRuns?.length || 0,
    reviews: snapshot.production.reviewQueue?.length || 0,
    users: snapshot.platform.adminUsers?.length || 0,
    collaborators: snapshot.platform.projectCollaborators?.length || 0,
    secrets: snapshot.platform.secrets?.length || 0,
    plugins: snapshot.platform.marketplacePlugins?.length || 0,
    evalRuns: snapshot.platform.evaluationRuns?.length || 0,
    audits: snapshot.platform.securityAuditRuns?.length || 0,
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sparkles className="h-4 w-4" />
            {cr('title', 'Control room')}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {cr('subtitle', 'Production, platform, admin, audit, and self-hosted access for {{target}}', {
              target: selectedProject?.displayName || cr('thisServer', 'this server'),
            })}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => { void refresh(); }} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {cr('refresh', 'Refresh')}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <nav className="border-b border-border/60 bg-muted/20 px-3 py-2 lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r lg:px-3 lg:py-4">
          <div className="scrollbar-hide flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
            {sections.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSection(section.id)}
                  className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-sm transition-colors lg:w-full ${
                    isActive
                      ? 'border-primary/40 bg-primary/10 text-foreground'
                      : 'border-transparent text-muted-foreground hover:border-border hover:bg-background'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{cr(section.label, section.defaultLabel)}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <main className="min-h-0 flex-1 overflow-auto px-4 py-4">
          {error && <StatusBanner tone="error" text={error} />}
          {notice && <StatusBanner tone="success" text={notice} />}

          {activeSection === 'overview' && (
            <Section
              title={cr('overview.title', 'v1.46 launch surface')}
              description={cr('overview.description', 'Every box below is backed by a v1.44-v1.45 API and is now visible from the UI.')}
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric label={cr('metrics.issueRuns', 'Issue-to-PR runs')} value={totals.issueRuns} icon={GitBranch} />
                <Metric label={cr('metrics.reviewItems', 'Review items')} value={totals.reviews} icon={FileCode} />
                <Metric label={cr('metrics.subUsers', 'Sub-users')} value={totals.users} icon={Users} />
                <Metric label={cr('metrics.collaborators', 'Project collaborators')} value={totals.collaborators} icon={Users} />
                <Metric label={cr('metrics.secrets', 'Scoped secrets')} value={totals.secrets} icon={Key} />
                <Metric label={cr('metrics.marketplace', 'Marketplace entries')} value={totals.plugins} icon={Server} />
                <Metric label={cr('metrics.evalRuns', 'Evaluation runs')} value={totals.evalRuns} icon={Workflow} />
                <Metric label={cr('metrics.securityAudits', 'Security audits')} value={totals.audits} icon={ShieldAlert} />
              </div>
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <ListPanel title={cr('overview.latestAuditEvents', 'Latest audit events')} empty={cr('empty.noAuditEvents', 'No audit events yet.')}>
                  {(snapshot.platform.auditLog || []).slice(0, 6).map((entry) => (
                    <AuditRow key={entry.id} entry={entry} />
                  ))}
                </ListPanel>
                <ListPanel title={cr('overview.systemSettings', 'System settings handoff')} empty={cr('empty.noSystemSettings', 'System settings are available from Settings.')}>
                  <div className="border-b border-border/50 px-3 py-3 last:border-b-0">
                    <div className="text-sm font-medium text-foreground">{cr('overview.accessMovedTitle', 'Access lives in Settings')}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {cr('overview.accessMovedDescription', 'Server URLs, LAN access, private network links, and public domain checks are managed from Settings > Access because they apply to the whole self-hosted server.')}
                    </div>
                  </div>
                </ListPanel>
              </div>
            </Section>
          )}

          {activeSection === 'production' && (
            <Section
              title={cr('sections.production.title', 'Production loop')}
              description={cr('sections.production.description', 'Start issue-to-PR runs, parse CI failures, review changes, schedule background jobs, and create checkpoints.')}
            >
              <div className="grid gap-4 xl:grid-cols-2">
                <Panel title={cr('panels.issueToPr', 'Issue-to-PR run')}>
                  <Input placeholder={cr('placeholders.githubIssueUrl', 'GitHub issue URL')} value={issueForm.issueUrl} onChange={(e) => setIssueForm({ ...issueForm, issueUrl: e.target.value })} />
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Input placeholder={cr('placeholders.manualTitle', 'Manual title fallback')} value={issueForm.title} onChange={(e) => setIssueForm({ ...issueForm, title: e.target.value })} />
                    <Input placeholder={cr('placeholders.model', 'Model')} value={issueForm.model} onChange={(e) => setIssueForm({ ...issueForm, model: e.target.value })} />
                    <Select value={issueForm.provider} onChange={(value) => setIssueForm({ ...issueForm, provider: value })} options={providerOptions} />
                    <Input placeholder={cr('placeholders.baseBranch', 'Base branch')} value={issueForm.baseBranch} onChange={(e) => setIssueForm({ ...issueForm, baseBranch: e.target.value })} />
                  </div>
                  <Textarea className="mt-2" rows={4} value={issueForm.acceptanceCriteria} onChange={(e) => setIssueForm({ ...issueForm, acceptanceCriteria: e.target.value })} />
                  <PreviewBlock lines={[
                    `${cr('labels.project', 'project')}: ${defaultProjectName || cr('fallback.selectedProject', 'selected project')}`,
                    `${cr('labels.path', 'path')}: ${defaultProjectPath || cr('fallback.projectPath', 'project path')}`,
                    `${cr('labels.providerModel', 'provider/model')}: ${issueForm.provider}${issueForm.model ? `/${issueForm.model}` : ''}`,
                    `${cr('labels.branch', 'branch')}: pixcode/issue-auto-${compact(issueForm.title || issueForm.issueUrl || 'task', 32).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
                  ]} />
                  <Button className="mt-3" onClick={() => action('Issue-to-PR run queued.', async () => {
                    await readJson('/api/production-agent-loop/github/issue-to-pr', {
                      method: 'POST',
                      body: JSON.stringify({
                        ...issueForm,
                        projectName: defaultProjectName,
                        projectPath: defaultProjectPath,
                        acceptanceCriteria: toLines(issueForm.acceptanceCriteria),
                      }),
                    });
                  })}>
                    <Plus className="h-4 w-4" />
                    {cr('buttons.queueRun', 'Queue run')}
                  </Button>
                </Panel>

                <Panel title={cr('panels.ciRepair', 'CI repair parser')}>
                  <Textarea rows={8} placeholder={cr('placeholders.ciLog', 'Paste failing CI, lint, typecheck, or build output')} value={ciLog} onChange={(e) => setCiLog(e.target.value)} />
                  <Button className="mt-3" variant="outline" onClick={() => action('CI repair plan generated.', async () => {
                    const data = await readJson<{ repairPlan: any }>('/api/production-agent-loop/ci/repair-plan', {
                      method: 'POST',
                      body: JSON.stringify({ log: ciLog }),
                    });
                    setRepairPlan(data.repairPlan);
                  })}>
                    <Search className="h-4 w-4" />
                    {cr('buttons.parseFailure', 'Parse failure')}
                  </Button>
                  {repairPlan && (
                    <div className="mt-3 rounded-md border border-border/60 bg-muted/20 p-3 text-xs">
                      <div className="font-medium text-foreground">{cr('labels.failedCommands', 'Failed commands')}: {repairPlan.failedCommands?.join(', ') || cr('fallback.noneDetected', 'none detected')}</div>
                      <div className="mt-1 text-muted-foreground">{cr('labels.files', 'Files')}: {repairPlan.files?.join(', ') || cr('fallback.noneDetected', 'none detected')}</div>
                      <pre className="mt-2 whitespace-pre-wrap rounded bg-background p-2 text-[11px] text-muted-foreground">{repairPlan.repairPrompt}</pre>
                    </div>
                  )}
                </Panel>

                <Panel title={cr('panels.reviewQueue', 'Review queue')}>
                  <Input placeholder={cr('placeholders.reviewTitle', 'Review title')} value={reviewForm.title} onChange={(e) => setReviewForm({ ...reviewForm, title: e.target.value })} />
                  <Textarea className="mt-2" rows={3} placeholder={cr('placeholders.notes', 'Notes')} value={reviewForm.notes} onChange={(e) => setReviewForm({ ...reviewForm, notes: e.target.value })} />
                  <Textarea className="mt-2" rows={3} placeholder={cr('placeholders.changedFiles', 'Changed files, one per line')} value={reviewForm.changedFiles} onChange={(e) => setReviewForm({ ...reviewForm, changedFiles: e.target.value })} />
                  <Button className="mt-3" onClick={() => action('Review item created.', async () => {
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
                  })}>
                    {cr('buttons.createReviewItem', 'Create review item')}
                  </Button>
                  <div className="mt-3 divide-y divide-border/50 rounded-md border border-border/60">
                    {(snapshot.production.reviewQueue || []).slice(0, 5).map((item) => (
                      <div key={item.id} className="px-3 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-medium text-foreground">{item.title}</span>
                          <Badge variant={item.status === 'needs_fix' ? 'destructive' : 'secondary'}>{item.status}</Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {['accepted', 'needs_fix', 'review_requested'].map((status) => (
                            <Button key={status} size="sm" variant="outline" onClick={() => action(`Review marked ${status}.`, async () => {
                              await readJson(`/api/production-agent-loop/review-queue/${encodeURIComponent(item.id)}`, {
                                method: 'PATCH',
                                body: JSON.stringify({ status }),
                              });
                            })}>{status}</Button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {(snapshot.production.reviewQueue || []).length === 0 && <Empty text={cr('empty.noReviewItems', 'No review items yet.')} />}
                  </div>
                </Panel>

                <Panel title={cr('panels.schedulerCheckpoints', 'Scheduler and checkpoints')}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input placeholder={cr('placeholders.jobName', 'Job name')} value={schedulerForm.name} onChange={(e) => setSchedulerForm({ ...schedulerForm, name: e.target.value })} />
                    <Select value={schedulerForm.mode} onChange={(value) => setSchedulerForm({ ...schedulerForm, mode: value })} options={['manual', 'watch', 'cron']} />
                    <Input placeholder={cr('placeholders.cronExpression', 'Cron or watch expression')} value={schedulerForm.cron} onChange={(e) => setSchedulerForm({ ...schedulerForm, cron: e.target.value })} />
                    <Input placeholder={cr('placeholders.checkpointReason', 'Checkpoint reason')} value={checkpointForm.reason} onChange={(e) => setCheckpointForm({ ...checkpointForm, reason: e.target.value })} />
                  </div>
                  <Textarea className="mt-2" rows={3} placeholder={cr('placeholders.backgroundPrompt', 'Background agent prompt')} value={schedulerForm.prompt} onChange={(e) => setSchedulerForm({ ...schedulerForm, prompt: e.target.value })} />
                  <Textarea className="mt-2" rows={3} placeholder={cr('placeholders.checkpointFiles', 'Checkpoint changed files, one per line')} value={checkpointForm.changedFiles} onChange={(e) => setCheckpointForm({ ...checkpointForm, changedFiles: e.target.value })} />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button onClick={() => action('Background job scheduled.', async () => {
                      await readJson('/api/production-agent-loop/scheduler/jobs', {
                        method: 'POST',
                        body: JSON.stringify({ ...schedulerForm, projectName: defaultProjectName, provider: issueForm.provider }),
                      });
                    })}>{cr('buttons.scheduleJob', 'Schedule job')}</Button>
                    <Button variant="outline" onClick={() => action('Workspace checkpoint created.', async () => {
                      await readJson('/api/production-agent-loop/snapshots', {
                        method: 'POST',
                        body: JSON.stringify({
                          projectName: defaultProjectName,
                          projectPath: defaultProjectPath,
                          reason: checkpointForm.reason || 'manual checkpoint',
                          gitHead: checkpointForm.gitHead || null,
                          changedFiles: toLines(checkpointForm.changedFiles),
                        }),
                      });
                    })}>{cr('buttons.createCheckpoint', 'Create checkpoint')}</Button>
                  </div>
                  <MiniList title={cr('lists.recentJobs', 'Recent jobs')} empty={cr('empty.noRecentJobs', 'No recent jobs yet.')} items={snapshot.production.schedulerJobs || []} render={(job) => `${job.name} - ${job.mode} - ${job.status}`} />
                  <MiniList title={cr('lists.recentCheckpoints', 'Recent checkpoints')} empty={cr('empty.noRecentCheckpoints', 'No recent checkpoints yet.')} items={snapshot.production.checkpoints || []} render={(checkpoint) => `${checkpoint.reason} - ${formatDate(checkpoint.createdAt)}`} />
                </Panel>
              </div>
            </Section>
          )}

          {activeSection === 'admin' && (
            <Section
              title={cr('sections.admin.title', 'Admin system')}
              description={cr('sections.admin.description', 'Create sub-users, disable accounts, and inspect activity for a single self-hosted Pixcode server.')}
            >
              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <Panel title={cr('panels.createSubUser', 'Create sub-user')}>
                  <Input placeholder={cr('placeholders.usernameEmail', 'Username or email')} value={adminForm.username} onChange={(e) => setAdminForm({ ...adminForm, username: e.target.value })} />
                  <Input className="mt-2" type="password" placeholder={cr('placeholders.temporaryPassword', 'Temporary password')} value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })} />
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Select value={adminForm.role} onChange={(value) => setAdminForm({ ...adminForm, role: value })} options={roleOptions} />
                    <Select value={adminForm.status} onChange={(value) => setAdminForm({ ...adminForm, status: value })} options={['active', 'disabled']} />
                  </div>
                  <Button className="mt-3" onClick={() => action('Sub-user created.', async () => {
                    await readJson('/api/platformization/admin/users', {
                      method: 'POST',
                      body: JSON.stringify(adminForm),
                    });
                    setAdminForm({ ...adminForm, username: '', password: '' });
                  })}>
                    <Users className="h-4 w-4" />
                    {cr('buttons.createUser', 'Create user')}
                  </Button>
                </Panel>
                <ListPanel title={cr('lists.subUsers', 'Sub-users')} empty={cr('empty.noSubUsers', 'No sub-users yet.')}>
                  {(snapshot.platform.adminUsers || []).map((user) => (
                    <div key={user.id} className="border-b border-border/50 px-3 py-3 last:border-b-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">{user.username}</div>
                          <div className="text-xs text-muted-foreground">{cr('labels.lastActive', 'Last active')}: {formatDate(user.lastLogin)}</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">{user.role || 'member'}</Badge>
                          <Badge variant={user.status === 'disabled' ? 'destructive' : 'secondary'}>{user.status}</Badge>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => action('User disabled.', async () => {
                          await readJson(`/api/platformization/admin/users/${user.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ status: 'disabled' }),
                          });
                        })}>{cr('buttons.disable', 'Disable')}</Button>
                        <Button size="sm" variant="outline" onClick={() => action('User enabled.', async () => {
                          await readJson(`/api/platformization/admin/users/${user.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ status: 'active' }),
                          });
                        })}>{cr('buttons.enable', 'Enable')}</Button>
                      </div>
                    </div>
                  ))}
                </ListPanel>
              </div>
              <RoleMatrix title={cr('panels.rolePermissions', 'Role permissions')} roles={snapshot.platform.roles || {}} />
            </Section>
          )}

          {activeSection === 'team' && (
            <Section
              title={cr('sections.team.title', 'Project collaborators')}
              description={cr('sections.team.description', 'Assign partners, workers, reviewers, and viewers per project without making everyone a global admin.')}
            >
              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <Panel title={cr('panels.addCollaborator', 'Add collaborator')}>
                  <Input placeholder={cr('placeholders.userEmailUsername', 'User email or username')} value={collaboratorForm.userRef} onChange={(e) => setCollaboratorForm({ ...collaboratorForm, userRef: e.target.value })} />
                  <Select className="mt-2" value={collaboratorForm.role} onChange={(value) => setCollaboratorForm({ ...collaboratorForm, role: value })} options={collaboratorRoles} />
                  <PreviewBlock lines={[
                    `${cr('labels.project', 'project')}: ${defaultProjectName || cr('fallback.selectedProject', 'selected project')}`,
                    `${cr('labels.role', 'role')}: ${collaboratorForm.role}`,
                    collaboratorForm.role === 'partner'
                      ? cr('capabilities.partner', 'can approve actions, manage secrets, and use shell')
                      : cr('capabilities.projectScoped', 'project-scoped access only'),
                  ]} />
                  <Button className="mt-3" onClick={() => action('Project collaborator added.', async () => {
                    await readJson('/api/platformization/project-collaborators', {
                      method: 'POST',
                      body: JSON.stringify({
                        ...collaboratorForm,
                        projectName: defaultProjectName,
                        projectPath: defaultProjectPath,
                      }),
                    });
                  })}>{cr('buttons.addCollaborator', 'Add collaborator')}</Button>
                </Panel>
                <ListPanel title={cr('lists.collaborators', 'Collaborators')} empty={cr('empty.noCollaborators', 'No project collaborators yet.')}>
                  {(snapshot.platform.projectCollaborators || []).map((collaborator) => (
                    <div key={collaborator.id} className="border-b border-border/50 px-3 py-3 last:border-b-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium text-foreground">{collaborator.userRef}</div>
                          <div className="text-xs text-muted-foreground">{collaborator.projectName}</div>
                        </div>
                        <Badge variant="secondary">{collaborator.role}</Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {Object.entries(collaborator.capabilities || {}).filter(([, enabled]) => enabled).map(([key]) => (
                          <Badge key={key} variant="secondary">{key}</Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </ListPanel>
              </div>
              <Panel className="mt-4" title={cr('teamAccess.title', 'How collaborators get access')}>
                <div className="grid gap-3 md:grid-cols-3">
                  <AccessStep
                    index="1"
                    title={cr('teamAccess.stepUsers', 'Create a sub-user')}
                    description={cr('teamAccess.stepUsersDescription', 'Create the person in Admin system with a global role such as member, viewer, project_worker, or project_partner.')}
                  />
                  <AccessStep
                    index="2"
                    title={cr('teamAccess.stepRole', 'Assign project role')}
                    description={cr('teamAccess.stepRoleDescription', 'Add the same user as a project collaborator so they only see and operate on the projects you choose.')}
                  />
                  <AccessStep
                    index="3"
                    title={cr('teamAccess.stepLink', 'Share an access path')}
                    description={cr('teamAccess.stepLinkDescription', 'Give them the LAN URL, Tailscale URL, Cloudflare Tunnel, or custom domain configured in Settings > Access.')}
                  />
                </div>
              </Panel>
            </Section>
          )}

          {activeSection === 'secrets' && (
            <Section
              title={cr('sections.secrets.title', 'Secret vault')}
              description={cr('sections.secrets.description', 'Store scoped env secrets and preview what each provider, project, workflow, Telegram, or API run receives.')}
            >
              <div className="grid gap-4 xl:grid-cols-2">
                <Panel title={cr('panels.createSecret', 'Create secret')}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input placeholder={cr('placeholders.secretName', 'Secret name')} value={secretForm.name} onChange={(e) => setSecretForm({ ...secretForm, name: e.target.value })} />
                    <Input placeholder={cr('placeholders.envName', 'ENV_NAME')} value={secretForm.envName} onChange={(e) => setSecretForm({ ...secretForm, envName: e.target.value })} />
                    <Select value={secretForm.scope} onChange={(value) => setSecretForm({ ...secretForm, scope: value })} options={secretScopes} />
                    <Input placeholder={cr('placeholders.secretTarget', 'Target project/provider/workflow')} value={secretForm.target || defaultProjectPath} onChange={(e) => setSecretForm({ ...secretForm, target: e.target.value })} />
                  </div>
                  <Input className="mt-2" type="password" placeholder={cr('placeholders.secretValue', 'Secret value')} value={secretForm.value} onChange={(e) => setSecretForm({ ...secretForm, value: e.target.value })} />
                  <Button className="mt-3" onClick={() => action('Secret stored in the vault.', async () => {
                    await readJson('/api/platformization/secrets', {
                      method: 'POST',
                      body: JSON.stringify({ ...secretForm, target: secretForm.target || defaultProjectPath }),
                    });
                    setSecretForm({ ...secretForm, value: '' });
                  })}>{cr('buttons.storeSecret', 'Store secret')}</Button>
                </Panel>
                <Panel title={cr('panels.scopedEnvPreview', 'Scoped env preview')}>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Select value={scopedEnvForm.provider} onChange={(value) => setScopedEnvForm({ ...scopedEnvForm, provider: value })} options={providerOptions} />
                    <Input placeholder={cr('placeholders.workflowId', 'Workflow id')} value={scopedEnvForm.workflowId} onChange={(e) => setScopedEnvForm({ ...scopedEnvForm, workflowId: e.target.value })} />
                    <Select value={scopedEnvForm.channel} onChange={(value) => setScopedEnvForm({ ...scopedEnvForm, channel: value })} options={['api', 'telegram']} />
                  </div>
                  <Button className="mt-3" variant="outline" onClick={() => action('Scoped env preview generated.', async () => {
                    const data = await readJson<{ scopedEnv: any }>('/api/platformization/secrets/scoped-env', {
                      method: 'POST',
                      body: JSON.stringify({
                        ...scopedEnvForm,
                        projectName: defaultProjectName,
                        projectPath: defaultProjectPath,
                      }),
                    });
                    setScopedEnv(data.scopedEnv);
                  })}>{cr('buttons.previewEnv', 'Preview env')}</Button>
                  <MiniList title={cr('lists.includedEnvNames', 'Included env names')} empty={cr('empty.noIncludedEnvNames', 'No included env names yet.')} items={scopedEnv?.included || []} render={(item) => `${item.envName} - ${item.scope} - ${item.redacted}`} />
                </Panel>
              </div>
              <ListPanel title={cr('lists.vaultEntries', 'Vault entries')} empty={cr('empty.noSecrets', 'No secrets yet.')}>
                {(snapshot.platform.secrets || []).map((secret) => (
                  <div key={secret.id} className="grid gap-2 border-b border-border/50 px-3 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">{secret.envName}</div>
                      <div className="truncate text-xs text-muted-foreground">{secret.name} - {secret.target || cr('fallback.global', 'global')}</div>
                    </div>
                    <Badge variant="secondary">{secret.scope}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">{secret.redacted}</span>
                  </div>
                ))}
              </ListPanel>
            </Section>
          )}

          {activeSection === 'marketplace' && (
            <Section
              title={cr('sections.marketplace.title', 'MCP/plugin marketplace')}
              description={cr('sections.marketplace.description', 'Register MCP servers, workflow templates, provider adapters, and notification channels with permission review and health.')}
            >
              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <Panel title={cr('panels.addMarketplaceEntry', 'Add marketplace entry')}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input placeholder={cr('placeholders.name', 'Name')} value={pluginForm.name} onChange={(e) => setPluginForm({ ...pluginForm, name: e.target.value })} />
                    <Select value={pluginForm.type} onChange={(value) => setPluginForm({ ...pluginForm, type: value })} options={pluginTypes} />
                    <Input placeholder={cr('placeholders.pluginSource', 'Source package or repository')} value={pluginForm.source} onChange={(e) => setPluginForm({ ...pluginForm, source: e.target.value })} />
                    <Input placeholder={cr('placeholders.installCommand', 'Install command')} value={pluginForm.installCommand} onChange={(e) => setPluginForm({ ...pluginForm, installCommand: e.target.value })} />
                  </div>
                  <Textarea className="mt-2" rows={3} placeholder={cr('placeholders.permissionScopes', 'Permission scopes, one per line')} value={pluginForm.permissionScopes} onChange={(e) => setPluginForm({ ...pluginForm, permissionScopes: e.target.value })} />
                  <Button className="mt-3" onClick={() => action('Marketplace entry saved.', async () => {
                    await readJson('/api/platformization/marketplace/plugins', {
                      method: 'POST',
                      body: JSON.stringify({
                        ...pluginForm,
                        permissionScopes: toLines(pluginForm.permissionScopes),
                      }),
                    });
                  })}>{cr('buttons.saveEntry', 'Save entry')}</Button>
                </Panel>
                <ListPanel title={cr('lists.marketplaceEntries', 'Marketplace entries')} empty={cr('empty.noMarketplaceEntries', 'No marketplace entries yet.')}>
                  {(snapshot.platform.marketplacePlugins || []).map((plugin) => (
                    <div key={plugin.id} className="border-b border-border/50 px-3 py-3 last:border-b-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium text-foreground">{plugin.name}</div>
                          <div className="text-xs text-muted-foreground">{plugin.source || cr('fallback.noSource', 'No source')}</div>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant="secondary">{plugin.type}</Badge>
                          <Badge variant={plugin.health?.status === 'ok' ? 'secondary' : 'destructive'}>{plugin.health?.status || 'unknown'}</Badge>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(plugin.permissionScopes || []).map((scope: string) => (
                          <Badge key={scope} variant={/secret|shell|network|write/i.test(scope) ? 'destructive' : 'secondary'}>{scope}</Badge>
                        ))}
                      </div>
                      <Button className="mt-3" size="sm" variant="outline" onClick={() => action('Plugin health updated.', async () => {
                        await readJson(`/api/platformization/marketplace/plugins/${encodeURIComponent(plugin.id)}/health`, {
                          method: 'POST',
                          body: JSON.stringify({ status: 'ok', message: 'Manual UI health check recorded.' }),
                        });
                      })}>{cr('buttons.markHealthy', 'Mark healthy')}</Button>
                    </div>
                  ))}
                </ListPanel>
              </div>
            </Section>
          )}

          {activeSection === 'eval' && (
            <Section
              title={cr('sections.eval.title', 'Evaluation harness')}
              description={cr('sections.eval.description', 'Create regression suites and compare provider/model runs with pass rate and latency.')}
            >
              <div className="grid gap-4 xl:grid-cols-2">
                <Panel title={cr('panels.createSuite', 'Create suite')}>
                  <Input placeholder={cr('placeholders.suiteName', 'Suite name')} value={evalSuiteForm.name} onChange={(e) => setEvalSuiteForm({ ...evalSuiteForm, name: e.target.value })} />
                  <Input className="mt-2" placeholder={cr('placeholders.description', 'Description')} value={evalSuiteForm.description} onChange={(e) => setEvalSuiteForm({ ...evalSuiteForm, description: e.target.value })} />
                  <Input className="mt-2" placeholder={cr('placeholders.firstTaskTitle', 'First task title')} value={evalSuiteForm.taskTitle} onChange={(e) => setEvalSuiteForm({ ...evalSuiteForm, taskTitle: e.target.value })} />
                  <Textarea className="mt-2" rows={3} placeholder={cr('placeholders.acceptanceCriteria', 'Acceptance criteria, one per line')} value={evalSuiteForm.acceptanceCriteria} onChange={(e) => setEvalSuiteForm({ ...evalSuiteForm, acceptanceCriteria: e.target.value })} />
                  <Button className="mt-3" onClick={() => action('Evaluation suite created.', async () => {
                    await readJson('/api/platformization/eval/suites', {
                      method: 'POST',
                      body: JSON.stringify({
                        name: evalSuiteForm.name || cr('fallback.regressionSuite', 'Regression suite'),
                        description: evalSuiteForm.description,
                        tasks: [{
                          title: evalSuiteForm.taskTitle || cr('fallback.demoTask', 'Demo task'),
                          projectPath: defaultProjectPath,
                          acceptanceCriteria: toLines(evalSuiteForm.acceptanceCriteria),
                        }],
                      }),
                    });
                  })}>{cr('buttons.createSuite', 'Create suite')}</Button>
                </Panel>
                <Panel title={cr('panels.recordRun', 'Record run')}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input placeholder={cr('placeholders.suiteId', 'Suite id')} value={evalRunForm.suiteId} onChange={(e) => setEvalRunForm({ ...evalRunForm, suiteId: e.target.value })} />
                    <Input placeholder={cr('placeholders.model', 'Model')} value={evalRunForm.model} onChange={(e) => setEvalRunForm({ ...evalRunForm, model: e.target.value })} />
                    <Select value={evalRunForm.provider} onChange={(value) => setEvalRunForm({ ...evalRunForm, provider: value })} options={providerOptions} />
                    <Input placeholder={cr('placeholders.latencyMs', 'Latency ms')} value={evalRunForm.latencyMs} onChange={(e) => setEvalRunForm({ ...evalRunForm, latencyMs: e.target.value })} />
                    <Input placeholder={cr('placeholders.passedCount', 'Passed count')} value={evalRunForm.passed} onChange={(e) => setEvalRunForm({ ...evalRunForm, passed: e.target.value })} />
                    <Input placeholder={cr('placeholders.failedCount', 'Failed count')} value={evalRunForm.failed} onChange={(e) => setEvalRunForm({ ...evalRunForm, failed: e.target.value })} />
                  </div>
                  <Button className="mt-3" onClick={() => action('Evaluation run recorded.', async () => {
                    const passed = Number(evalRunForm.passed || 0);
                    const failed = Number(evalRunForm.failed || 0);
                    const results = [
                      ...Array.from({ length: passed }, (_, index) => ({ id: `passed-${index + 1}`, status: 'passed', latencyMs: Number(evalRunForm.latencyMs || 0) })),
                      ...Array.from({ length: failed }, (_, index) => ({ id: `failed-${index + 1}`, status: 'failed', latencyMs: Number(evalRunForm.latencyMs || 0) })),
                    ];
                    await readJson('/api/platformization/eval/runs', {
                      method: 'POST',
                      body: JSON.stringify({ ...evalRunForm, results }),
                    });
                  })}>{cr('buttons.recordRun', 'Record run')}</Button>
                </Panel>
              </div>
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <MiniList title={cr('lists.suites', 'Suites')} empty={cr('empty.noSuites', 'No suites yet.')} items={snapshot.platform.evaluationSuites || []} render={(suite) => `${suite.name} - ${suite.tasks?.length || 0} ${cr('labels.tasks', 'tasks')}`} />
                <MiniList title={cr('lists.runs', 'Runs')} empty={cr('empty.noRuns', 'No runs yet.')} items={snapshot.platform.evaluationRuns || []} render={(run) => `${run.provider || cr('fallback.provider', 'provider')} ${run.model || ''} - ${run.summary?.passRate || 0}% ${cr('labels.pass', 'pass')} - ${run.summary?.averageLatencyMs || 0}ms`} />
              </div>
            </Section>
          )}

          {activeSection === 'usage' && (
            <Section
              title={cr('sections.usage.title', 'Cost, token, and latency dashboard')}
              description={cr('sections.usage.description', 'Monitor provider/model/workflow usage for demos and operations.')}
            >
              <Panel title={cr('panels.recordUsageEvent', 'Record usage event')}>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <Select value={usageForm.provider} onChange={(value) => setUsageForm({ ...usageForm, provider: value })} options={providerOptions} />
                  <Input placeholder={cr('placeholders.model', 'Model')} value={usageForm.model} onChange={(e) => setUsageForm({ ...usageForm, model: e.target.value })} />
                  <Input placeholder={cr('placeholders.workflow', 'Workflow')} value={usageForm.workflow} onChange={(e) => setUsageForm({ ...usageForm, workflow: e.target.value })} />
                  <Select value={usageForm.status} onChange={(value) => setUsageForm({ ...usageForm, status: value })} options={['ok', 'error', 'timeout']} />
                  <Input placeholder={cr('placeholders.inputTokens', 'Input tokens')} value={usageForm.inputTokens} onChange={(e) => setUsageForm({ ...usageForm, inputTokens: e.target.value })} />
                  <Input placeholder={cr('placeholders.outputTokens', 'Output tokens')} value={usageForm.outputTokens} onChange={(e) => setUsageForm({ ...usageForm, outputTokens: e.target.value })} />
                  <Input placeholder={cr('placeholders.costUsd', 'Cost USD')} value={usageForm.costUsd} onChange={(e) => setUsageForm({ ...usageForm, costUsd: e.target.value })} />
                  <Input placeholder={cr('placeholders.latencyMs', 'Latency ms')} value={usageForm.latencyMs} onChange={(e) => setUsageForm({ ...usageForm, latencyMs: e.target.value })} />
                </div>
                <Button className="mt-3" onClick={() => action('Usage event recorded.', async () => {
                  await readJson('/api/platformization/usage/events', { method: 'POST', body: JSON.stringify(usageForm) });
                })}>{cr('buttons.recordUsage', 'Record usage')}</Button>
              </Panel>
              <div className="mt-4 overflow-hidden rounded-md border border-border/60">
                <div className="grid min-w-[760px] grid-cols-8 border-b border-border/60 bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <span>{cr('columns.provider', 'Provider')}</span><span>{cr('columns.model', 'Model')}</span><span>{cr('columns.workflow', 'Workflow')}</span><span>{cr('columns.runs', 'Runs')}</span><span>{cr('columns.tokens', 'Tokens')}</span><span>{cr('columns.cost', 'Cost')}</span><span>{cr('columns.latency', 'Latency')}</span><span>{cr('columns.errorRate', 'Error rate')}</span>
                </div>
                <div className="overflow-x-auto">
                  {(snapshot.platform.usageSummary || []).map((row, index) => (
                    <div key={`${row.provider}-${row.model}-${row.workflow}-${index}`} className="grid min-w-[760px] grid-cols-8 border-b border-border/50 px-3 py-2 text-xs last:border-b-0">
                      <span>{row.provider}</span><span>{row.model}</span><span>{row.workflow}</span><span>{row.runs}</span><span>{formatNumber(row.totalTokens)}</span><span>{formatCurrency(row.costUsd)}</span><span>{row.averageLatencyMs}ms</span><span>{row.errorRate}%</span>
                    </div>
                  ))}
                  {(snapshot.platform.usageSummary || []).length === 0 && <Empty text={cr('empty.usageSummary', 'Usage appears here after provider or workflow events are recorded.')} />}
                </div>
              </div>
            </Section>
          )}

          {activeSection === 'security' && (
            <Section
              title={cr('sections.security.title', 'Security audit mode')}
              description={cr('sections.security.description', 'Run dependency audit, secret scan, permission audit, and agent output leak detection workflows.')}
            >
              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <Panel title={cr('panels.createAuditRun', 'Create audit run')}>
                  <Textarea rows={5} value={securityForm.checks} onChange={(e) => setSecurityForm({ ...securityForm, checks: e.target.value })} />
                  <Input className="mt-2" placeholder={cr('placeholders.optionalFindingTitle', 'Optional finding title')} value={securityForm.findingTitle} onChange={(e) => setSecurityForm({ ...securityForm, findingTitle: e.target.value })} />
                  <Button className="mt-3" onClick={() => action('Security audit queued.', async () => {
                    await readJson('/api/platformization/security/audit-runs', {
                      method: 'POST',
                      body: JSON.stringify({
                        projectName: defaultProjectName,
                        projectPath: defaultProjectPath,
                        checks: toLines(securityForm.checks),
                        findings: securityForm.findingTitle ? [{ title: securityForm.findingTitle, severity: 'medium' }] : [],
                      }),
                    });
                  })}>{cr('buttons.createAudit', 'Create audit')}</Button>
                </Panel>
                <ListPanel title={cr('lists.auditRuns', 'Audit runs')} empty={cr('empty.noSecurityAudits', 'No security audits yet.')}>
                  {(snapshot.platform.securityAuditRuns || []).map((run) => (
                    <div key={run.id} className="border-b border-border/50 px-3 py-3 last:border-b-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-medium text-foreground">{run.projectName || 'Server audit'}</div>
                        <Badge variant="secondary">{run.status}</Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(run.checks || []).map((check: string) => <Badge key={check} variant="secondary">{check}</Badge>)}
                      </div>
                      {(run.findings || []).map((finding: any) => (
                        <div key={finding.id} className="mt-2 rounded border border-destructive/30 bg-destructive/5 px-2 py-2 text-xs">
                          <div className="font-medium text-foreground">{finding.title}</div>
                          <div className="text-muted-foreground">{finding.recommendation || cr('fallback.reviewRequired', 'Review required.')}</div>
                        </div>
                      ))}
                    </div>
                  ))}
                </ListPanel>
              </div>
              <Panel className="mt-4" title={cr('panels.auditLog', 'Audit log')}>
                <Input placeholder={cr('placeholders.auditFilter', 'Filter audit log by user, project, event, or file')} value={auditQuery} onChange={(e) => setAuditQuery(e.target.value)} />
                <div className="mt-3 max-h-[420px] overflow-auto rounded-md border border-border/60">
                  {filteredAudit.slice(0, 80).map((entry) => <AuditRow key={entry.id} entry={entry} />)}
                  {filteredAudit.length === 0 && <Empty text={cr('empty.noAuditMatches', 'No audit entries match the current filter.')} />}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <a className="underline-offset-4 hover:underline" href="/api/platformization/audit-log/export?format=json" target="_blank" rel="noreferrer">{cr('buttons.exportJson', 'Export JSON')}</a>
                  <a className="underline-offset-4 hover:underline" href="/api/platformization/audit-log/export?format=csv" target="_blank" rel="noreferrer">{cr('buttons.exportCsv', 'Export CSV')}</a>
                </div>
              </Panel>
            </Section>
          )}

        </main>
      </div>
    </div>
  );
}

function StatusBanner({ tone, text }: { tone: 'success' | 'error'; text: string }) {
  return (
    <div className={`mb-4 rounded-md border px-3 py-2 text-sm ${
      tone === 'success'
        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
        : 'border-destructive/30 bg-destructive/10 text-destructive'
    }`}>
      {text}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Panel({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-md border border-border/60 bg-background px-3 py-3 ${className}`}>
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

function ListPanel({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;
  const isEmpty = Array.isArray(items) ? items.length === 0 : !items;
  return (
    <section className="min-w-0 overflow-hidden rounded-md border border-border/60 bg-background">
      <div className="border-b border-border/60 bg-muted/20 px-3 py-2 text-sm font-semibold text-foreground">{title}</div>
      <div className="divide-y divide-border/50">
        {isEmpty ? <Empty text={empty} /> : children}
      </div>
    </section>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: LucideIcon }) {
  return (
    <div className="rounded-md border border-border/60 bg-background px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-2 text-xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function Select({ value, options, onChange, className = '' }: { value: string; options: string[]; onChange: (value: string) => void; className?: string }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${className}`}
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
      className={`w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${props.className || ''}`}
    />
  );
}

function PreviewBlock({ lines }: { lines: string[] }) {
  return (
    <div className="mt-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2 font-mono text-[11px] text-muted-foreground">
      {lines.map((line) => <div key={line}>{line}</div>)}
    </div>
  );
}

function MiniList({ title, empty, items, render }: { title: string; empty: string; items: any[]; render: (item: any) => string }) {
  return (
    <div className="mt-3 rounded-md border border-border/60">
      <div className="border-b border-border/60 bg-muted/20 px-3 py-2 text-xs font-medium text-muted-foreground">{title}</div>
      {items.slice(0, 5).map((item) => (
        <div key={item.id || render(item)} className="border-b border-border/50 px-3 py-2 text-xs text-foreground last:border-b-0">{render(item)}</div>
      ))}
      {items.length === 0 && <Empty text={empty} />}
    </div>
  );
}

function RoleMatrix({ title, roles }: { title: string; roles: Record<string, string[]> }) {
  const entries = Object.entries(roles);
  return (
    <Panel className="mt-4" title={title}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {entries.map(([role, permissions]) => (
          <div key={role} className="rounded-md border border-border/60 px-3 py-3">
            <div className="text-sm font-medium text-foreground">{role}</div>
            <div className="mt-2 flex flex-wrap gap-1">
              {permissions.map((permission) => <Badge key={permission} variant="secondary">{permission}</Badge>)}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function AccessStep({ index, title, description }: { index: string; title: string; description: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/10 px-3 py-3">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {index}
        </span>
        <div className="text-sm font-semibold text-foreground">{title}</div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

function AuditRow({ entry }: { entry: any }) {
  return (
    <div className="border-b border-border/50 px-3 py-3 text-xs last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-foreground">{entry.action}</span>
        <span className="text-muted-foreground">{formatDate(entry.createdAt)}</span>
      </div>
      <div className="mt-1 text-muted-foreground">Actor: {entry.actorId || 'system'}</div>
      <pre className="mt-2 max-h-24 overflow-auto rounded bg-muted/20 p-2 text-[11px] text-muted-foreground">{JSON.stringify(entry.details || {}, null, 2)}</pre>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="px-3 py-6 text-sm text-muted-foreground">{text}</div>;
}
