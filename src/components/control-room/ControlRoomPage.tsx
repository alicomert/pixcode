import { useCallback, useEffect, useMemo, useState, type ReactNode, type TextareaHTMLAttributes } from 'react';

import type { Project } from '../../types/app';
import { Badge, Button, Input } from '../../shared/view/ui';
import { authenticatedFetch } from '../../utils/api';

import {
  BarChart3,
  Cloud,
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
  | 'security'
  | 'access';

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
  remoteAccessConfigs?: any[];
};

type RemoteAccessState = {
  host?: string;
  platform?: string;
  localUrl?: string;
  configs?: any[];
  recommendations?: any[];
};

type Snapshot = {
  production: ProductionState;
  platform: PlatformState;
  remoteAccess: RemoteAccessState;
};

const sections: Array<{ id: SectionId; label: string; icon: LucideIcon }> = [
  { id: 'overview', label: 'Overview', icon: Sparkles },
  { id: 'production', label: 'Production', icon: GitBranch },
  { id: 'admin', label: 'Admin', icon: Lock },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'secrets', label: 'Secrets', icon: Key },
  { id: 'marketplace', label: 'Marketplace', icon: Server },
  { id: 'eval', label: 'Evaluation', icon: Workflow },
  { id: 'usage', label: 'Usage', icon: BarChart3 },
  { id: 'security', label: 'Security', icon: ShieldAlert },
  { id: 'access', label: 'Access', icon: Cloud },
];

const providerOptions = ['opencode', 'claude', 'codex', 'cursor', 'gemini', 'qwen'];
const roleOptions = ['owner', 'admin', 'member', 'viewer', 'project_partner', 'project_worker', 'project_reviewer'];
const collaboratorRoles = ['partner', 'worker', 'reviewer', 'viewer'];
const secretScopes = ['global', 'provider', 'project', 'workflow', 'telegram', 'api'];
const pluginTypes = ['mcp-server', 'workflow-template', 'provider-adapter', 'notification-channel'];
const securityChecks = ['dependency_audit', 'secret_scan', 'permission_audit', 'agent_output_leak_detection'];
const accessModes = ['lan', 'tailscale', 'cloudflare_tunnel', 'custom_domain'];

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
    remoteAccessConfigs: [],
  },
  remoteAccess: {
    configs: [],
    recommendations: [],
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
  const [activeSection, setActiveSection] = useState<SectionId>('overview');
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tailscale, setTailscale] = useState<any | null>(null);
  const [repairPlan, setRepairPlan] = useState<any | null>(null);
  const [accessHealth, setAccessHealth] = useState<any | null>(null);
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
  const [accessForm, setAccessForm] = useState({ mode: 'tailscale', label: 'Tailscale private access', url: '', targetPort: '3001' });

  const defaultProjectName = selectedProject?.name || selectedProject?.displayName || '';
  const defaultProjectPath = selectedProject?.path || selectedProject?.fullPath || '';

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [production, platform, remoteAccess] = await Promise.all([
        readJson<{ state: ProductionState }>('/api/production-agent-loop'),
        readJson<{ state: PlatformState }>('/api/platformization'),
        readJson<{ remoteAccess: RemoteAccessState }>('/api/platformization/remote-access'),
      ]);
      setSnapshot({
        production: production.state || emptySnapshot.production,
        platform: platform.state || emptySnapshot.platform,
        remoteAccess: remoteAccess.remoteAccess || emptySnapshot.remoteAccess,
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
            Control room
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            Production, platform, admin, audit, and self-hosted access for {selectedProject?.displayName || 'this server'}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => { void refresh(); }} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
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
                  <span>{section.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <main className="min-h-0 flex-1 overflow-auto px-4 py-4">
          {error && <StatusBanner tone="error" text={error} />}
          {notice && <StatusBanner tone="success" text={notice} />}

          {activeSection === 'overview' && (
            <Section title="v1.46 launch surface" description="Every box below is backed by a v1.44-v1.45 API and is now visible from the UI.">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric label="Issue-to-PR runs" value={totals.issueRuns} icon={GitBranch} />
                <Metric label="Review items" value={totals.reviews} icon={FileCode} />
                <Metric label="Sub-users" value={totals.users} icon={Users} />
                <Metric label="Project collaborators" value={totals.collaborators} icon={Users} />
                <Metric label="Scoped secrets" value={totals.secrets} icon={Key} />
                <Metric label="Marketplace entries" value={totals.plugins} icon={Server} />
                <Metric label="Evaluation runs" value={totals.evalRuns} icon={Workflow} />
                <Metric label="Security audits" value={totals.audits} icon={ShieldAlert} />
              </div>
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <ListPanel title="Latest audit events" empty="No audit events yet.">
                  {(snapshot.platform.auditLog || []).slice(0, 6).map((entry) => (
                    <AuditRow key={entry.id} entry={entry} />
                  ))}
                </ListPanel>
                <ListPanel title="Remote access options" empty="No remote access configs yet.">
                  {(snapshot.remoteAccess.recommendations || []).map((item) => (
                    <div key={item.mode} className="border-b border-border/50 px-3 py-3 last:border-b-0">
                      <div className="text-sm font-medium text-foreground">{item.label}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{item.recommendedWhen}</div>
                    </div>
                  ))}
                </ListPanel>
              </div>
            </Section>
          )}

          {activeSection === 'production' && (
            <Section title="Production loop" description="Start issue-to-PR runs, parse CI failures, review changes, schedule background jobs, and create checkpoints.">
              <div className="grid gap-4 xl:grid-cols-2">
                <Panel title="Issue-to-PR run">
                  <Input placeholder="GitHub issue URL" value={issueForm.issueUrl} onChange={(e) => setIssueForm({ ...issueForm, issueUrl: e.target.value })} />
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Input placeholder="Manual title fallback" value={issueForm.title} onChange={(e) => setIssueForm({ ...issueForm, title: e.target.value })} />
                    <Input placeholder="Model" value={issueForm.model} onChange={(e) => setIssueForm({ ...issueForm, model: e.target.value })} />
                    <Select value={issueForm.provider} onChange={(value) => setIssueForm({ ...issueForm, provider: value })} options={providerOptions} />
                    <Input placeholder="Base branch" value={issueForm.baseBranch} onChange={(e) => setIssueForm({ ...issueForm, baseBranch: e.target.value })} />
                  </div>
                  <Textarea className="mt-2" rows={4} value={issueForm.acceptanceCriteria} onChange={(e) => setIssueForm({ ...issueForm, acceptanceCriteria: e.target.value })} />
                  <PreviewBlock lines={[
                    `project: ${defaultProjectName || 'selected project'}`,
                    `path: ${defaultProjectPath || 'project path'}`,
                    `provider/model: ${issueForm.provider}${issueForm.model ? `/${issueForm.model}` : ''}`,
                    `branch: pixcode/issue-auto-${compact(issueForm.title || issueForm.issueUrl || 'task', 32).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
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
                    Queue run
                  </Button>
                </Panel>

                <Panel title="CI repair parser">
                  <Textarea rows={8} placeholder="Paste failing CI, lint, typecheck, or build output" value={ciLog} onChange={(e) => setCiLog(e.target.value)} />
                  <Button className="mt-3" variant="outline" onClick={() => action('CI repair plan generated.', async () => {
                    const data = await readJson<{ repairPlan: any }>('/api/production-agent-loop/ci/repair-plan', {
                      method: 'POST',
                      body: JSON.stringify({ log: ciLog }),
                    });
                    setRepairPlan(data.repairPlan);
                  })}>
                    <Search className="h-4 w-4" />
                    Parse failure
                  </Button>
                  {repairPlan && (
                    <div className="mt-3 rounded-md border border-border/60 bg-muted/20 p-3 text-xs">
                      <div className="font-medium text-foreground">Failed commands: {repairPlan.failedCommands?.join(', ') || 'none detected'}</div>
                      <div className="mt-1 text-muted-foreground">Files: {repairPlan.files?.join(', ') || 'none detected'}</div>
                      <pre className="mt-2 whitespace-pre-wrap rounded bg-background p-2 text-[11px] text-muted-foreground">{repairPlan.repairPrompt}</pre>
                    </div>
                  )}
                </Panel>

                <Panel title="Review queue">
                  <Input placeholder="Review title" value={reviewForm.title} onChange={(e) => setReviewForm({ ...reviewForm, title: e.target.value })} />
                  <Textarea className="mt-2" rows={3} placeholder="Notes" value={reviewForm.notes} onChange={(e) => setReviewForm({ ...reviewForm, notes: e.target.value })} />
                  <Textarea className="mt-2" rows={3} placeholder="Changed files, one per line" value={reviewForm.changedFiles} onChange={(e) => setReviewForm({ ...reviewForm, changedFiles: e.target.value })} />
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
                    Create review item
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
                    {(snapshot.production.reviewQueue || []).length === 0 && <Empty text="No review items yet." />}
                  </div>
                </Panel>

                <Panel title="Scheduler and checkpoints">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input placeholder="Job name" value={schedulerForm.name} onChange={(e) => setSchedulerForm({ ...schedulerForm, name: e.target.value })} />
                    <Select value={schedulerForm.mode} onChange={(value) => setSchedulerForm({ ...schedulerForm, mode: value })} options={['manual', 'watch', 'cron']} />
                    <Input placeholder="Cron or watch expression" value={schedulerForm.cron} onChange={(e) => setSchedulerForm({ ...schedulerForm, cron: e.target.value })} />
                    <Input placeholder="Checkpoint reason" value={checkpointForm.reason} onChange={(e) => setCheckpointForm({ ...checkpointForm, reason: e.target.value })} />
                  </div>
                  <Textarea className="mt-2" rows={3} placeholder="Background agent prompt" value={schedulerForm.prompt} onChange={(e) => setSchedulerForm({ ...schedulerForm, prompt: e.target.value })} />
                  <Textarea className="mt-2" rows={3} placeholder="Checkpoint changed files, one per line" value={checkpointForm.changedFiles} onChange={(e) => setCheckpointForm({ ...checkpointForm, changedFiles: e.target.value })} />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button onClick={() => action('Background job scheduled.', async () => {
                      await readJson('/api/production-agent-loop/scheduler/jobs', {
                        method: 'POST',
                        body: JSON.stringify({ ...schedulerForm, projectName: defaultProjectName, provider: issueForm.provider }),
                      });
                    })}>Schedule job</Button>
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
                    })}>Create checkpoint</Button>
                  </div>
                  <MiniList title="Recent jobs" items={snapshot.production.schedulerJobs || []} render={(job) => `${job.name} - ${job.mode} - ${job.status}`} />
                  <MiniList title="Recent checkpoints" items={snapshot.production.checkpoints || []} render={(checkpoint) => `${checkpoint.reason} - ${formatDate(checkpoint.createdAt)}`} />
                </Panel>
              </div>
            </Section>
          )}

          {activeSection === 'admin' && (
            <Section title="Admin system" description="Create sub-users, disable accounts, and inspect activity for a single self-hosted Pixcode server.">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <Panel title="Create sub-user">
                  <Input placeholder="Username or email" value={adminForm.username} onChange={(e) => setAdminForm({ ...adminForm, username: e.target.value })} />
                  <Input className="mt-2" type="password" placeholder="Temporary password" value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })} />
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
                    Create user
                  </Button>
                </Panel>
                <ListPanel title="Sub-users" empty="No sub-users yet.">
                  {(snapshot.platform.adminUsers || []).map((user) => (
                    <div key={user.id} className="border-b border-border/50 px-3 py-3 last:border-b-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">{user.username}</div>
                          <div className="text-xs text-muted-foreground">Last active: {formatDate(user.lastLogin)}</div>
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
                        })}>Disable</Button>
                        <Button size="sm" variant="outline" onClick={() => action('User enabled.', async () => {
                          await readJson(`/api/platformization/admin/users/${user.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ status: 'active' }),
                          });
                        })}>Enable</Button>
                      </div>
                    </div>
                  ))}
                </ListPanel>
              </div>
              <RoleMatrix roles={snapshot.platform.roles || {}} />
            </Section>
          )}

          {activeSection === 'team' && (
            <Section title="Project collaborators" description="Assign partners, workers, reviewers, and viewers per project without making everyone a global admin.">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <Panel title="Add collaborator">
                  <Input placeholder="User email or username" value={collaboratorForm.userRef} onChange={(e) => setCollaboratorForm({ ...collaboratorForm, userRef: e.target.value })} />
                  <Select className="mt-2" value={collaboratorForm.role} onChange={(value) => setCollaboratorForm({ ...collaboratorForm, role: value })} options={collaboratorRoles} />
                  <PreviewBlock lines={[
                    `project: ${defaultProjectName || 'selected project'}`,
                    `role: ${collaboratorForm.role}`,
                    collaboratorForm.role === 'partner' ? 'can approve actions, manage secrets, and use shell' : 'project-scoped access only',
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
                  })}>Add collaborator</Button>
                </Panel>
                <ListPanel title="Collaborators" empty="No project collaborators yet.">
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
            </Section>
          )}

          {activeSection === 'secrets' && (
            <Section title="Secret vault" description="Store scoped env secrets and preview what each provider, project, workflow, Telegram, or API run receives.">
              <div className="grid gap-4 xl:grid-cols-2">
                <Panel title="Create secret">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input placeholder="Secret name" value={secretForm.name} onChange={(e) => setSecretForm({ ...secretForm, name: e.target.value })} />
                    <Input placeholder="ENV_NAME" value={secretForm.envName} onChange={(e) => setSecretForm({ ...secretForm, envName: e.target.value })} />
                    <Select value={secretForm.scope} onChange={(value) => setSecretForm({ ...secretForm, scope: value })} options={secretScopes} />
                    <Input placeholder="Target project/provider/workflow" value={secretForm.target || defaultProjectPath} onChange={(e) => setSecretForm({ ...secretForm, target: e.target.value })} />
                  </div>
                  <Input className="mt-2" type="password" placeholder="Secret value" value={secretForm.value} onChange={(e) => setSecretForm({ ...secretForm, value: e.target.value })} />
                  <Button className="mt-3" onClick={() => action('Secret stored in the vault.', async () => {
                    await readJson('/api/platformization/secrets', {
                      method: 'POST',
                      body: JSON.stringify({ ...secretForm, target: secretForm.target || defaultProjectPath }),
                    });
                    setSecretForm({ ...secretForm, value: '' });
                  })}>Store secret</Button>
                </Panel>
                <Panel title="Scoped env preview">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Select value={scopedEnvForm.provider} onChange={(value) => setScopedEnvForm({ ...scopedEnvForm, provider: value })} options={providerOptions} />
                    <Input placeholder="Workflow id" value={scopedEnvForm.workflowId} onChange={(e) => setScopedEnvForm({ ...scopedEnvForm, workflowId: e.target.value })} />
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
                  })}>Preview env</Button>
                  <MiniList title="Included env names" items={scopedEnv?.included || []} render={(item) => `${item.envName} - ${item.scope} - ${item.redacted}`} />
                </Panel>
              </div>
              <ListPanel title="Vault entries" empty="No secrets yet.">
                {(snapshot.platform.secrets || []).map((secret) => (
                  <div key={secret.id} className="grid gap-2 border-b border-border/50 px-3 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">{secret.envName}</div>
                      <div className="truncate text-xs text-muted-foreground">{secret.name} - {secret.target || 'global'}</div>
                    </div>
                    <Badge variant="secondary">{secret.scope}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">{secret.redacted}</span>
                  </div>
                ))}
              </ListPanel>
            </Section>
          )}

          {activeSection === 'marketplace' && (
            <Section title="MCP/plugin marketplace" description="Register MCP servers, workflow templates, provider adapters, and notification channels with permission review and health.">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <Panel title="Add marketplace entry">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input placeholder="Name" value={pluginForm.name} onChange={(e) => setPluginForm({ ...pluginForm, name: e.target.value })} />
                    <Select value={pluginForm.type} onChange={(value) => setPluginForm({ ...pluginForm, type: value })} options={pluginTypes} />
                    <Input placeholder="Source package or repository" value={pluginForm.source} onChange={(e) => setPluginForm({ ...pluginForm, source: e.target.value })} />
                    <Input placeholder="Install command" value={pluginForm.installCommand} onChange={(e) => setPluginForm({ ...pluginForm, installCommand: e.target.value })} />
                  </div>
                  <Textarea className="mt-2" rows={3} placeholder="Permission scopes, one per line" value={pluginForm.permissionScopes} onChange={(e) => setPluginForm({ ...pluginForm, permissionScopes: e.target.value })} />
                  <Button className="mt-3" onClick={() => action('Marketplace entry saved.', async () => {
                    await readJson('/api/platformization/marketplace/plugins', {
                      method: 'POST',
                      body: JSON.stringify({
                        ...pluginForm,
                        permissionScopes: toLines(pluginForm.permissionScopes),
                      }),
                    });
                  })}>Save entry</Button>
                </Panel>
                <ListPanel title="Marketplace entries" empty="No marketplace entries yet.">
                  {(snapshot.platform.marketplacePlugins || []).map((plugin) => (
                    <div key={plugin.id} className="border-b border-border/50 px-3 py-3 last:border-b-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium text-foreground">{plugin.name}</div>
                          <div className="text-xs text-muted-foreground">{plugin.source || 'No source'}</div>
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
                      })}>Mark healthy</Button>
                    </div>
                  ))}
                </ListPanel>
              </div>
            </Section>
          )}

          {activeSection === 'eval' && (
            <Section title="Evaluation harness" description="Create regression suites and compare provider/model runs with pass rate and latency.">
              <div className="grid gap-4 xl:grid-cols-2">
                <Panel title="Create suite">
                  <Input placeholder="Suite name" value={evalSuiteForm.name} onChange={(e) => setEvalSuiteForm({ ...evalSuiteForm, name: e.target.value })} />
                  <Input className="mt-2" placeholder="Description" value={evalSuiteForm.description} onChange={(e) => setEvalSuiteForm({ ...evalSuiteForm, description: e.target.value })} />
                  <Input className="mt-2" placeholder="First task title" value={evalSuiteForm.taskTitle} onChange={(e) => setEvalSuiteForm({ ...evalSuiteForm, taskTitle: e.target.value })} />
                  <Textarea className="mt-2" rows={3} placeholder="Acceptance criteria, one per line" value={evalSuiteForm.acceptanceCriteria} onChange={(e) => setEvalSuiteForm({ ...evalSuiteForm, acceptanceCriteria: e.target.value })} />
                  <Button className="mt-3" onClick={() => action('Evaluation suite created.', async () => {
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
                  })}>Create suite</Button>
                </Panel>
                <Panel title="Record run">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input placeholder="Suite id" value={evalRunForm.suiteId} onChange={(e) => setEvalRunForm({ ...evalRunForm, suiteId: e.target.value })} />
                    <Input placeholder="Model" value={evalRunForm.model} onChange={(e) => setEvalRunForm({ ...evalRunForm, model: e.target.value })} />
                    <Select value={evalRunForm.provider} onChange={(value) => setEvalRunForm({ ...evalRunForm, provider: value })} options={providerOptions} />
                    <Input placeholder="Latency ms" value={evalRunForm.latencyMs} onChange={(e) => setEvalRunForm({ ...evalRunForm, latencyMs: e.target.value })} />
                    <Input placeholder="Passed count" value={evalRunForm.passed} onChange={(e) => setEvalRunForm({ ...evalRunForm, passed: e.target.value })} />
                    <Input placeholder="Failed count" value={evalRunForm.failed} onChange={(e) => setEvalRunForm({ ...evalRunForm, failed: e.target.value })} />
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
                  })}>Record run</Button>
                </Panel>
              </div>
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <MiniList title="Suites" items={snapshot.platform.evaluationSuites || []} render={(suite) => `${suite.name} - ${suite.tasks?.length || 0} tasks`} />
                <MiniList title="Runs" items={snapshot.platform.evaluationRuns || []} render={(run) => `${run.provider || 'provider'} ${run.model || ''} - ${run.summary?.passRate || 0}% pass - ${run.summary?.averageLatencyMs || 0}ms`} />
              </div>
            </Section>
          )}

          {activeSection === 'usage' && (
            <Section title="Cost, token, and latency dashboard" description="Monitor provider/model/workflow usage for demos and operations.">
              <Panel title="Record usage event">
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <Select value={usageForm.provider} onChange={(value) => setUsageForm({ ...usageForm, provider: value })} options={providerOptions} />
                  <Input placeholder="Model" value={usageForm.model} onChange={(e) => setUsageForm({ ...usageForm, model: e.target.value })} />
                  <Input placeholder="Workflow" value={usageForm.workflow} onChange={(e) => setUsageForm({ ...usageForm, workflow: e.target.value })} />
                  <Select value={usageForm.status} onChange={(value) => setUsageForm({ ...usageForm, status: value })} options={['ok', 'error', 'timeout']} />
                  <Input placeholder="Input tokens" value={usageForm.inputTokens} onChange={(e) => setUsageForm({ ...usageForm, inputTokens: e.target.value })} />
                  <Input placeholder="Output tokens" value={usageForm.outputTokens} onChange={(e) => setUsageForm({ ...usageForm, outputTokens: e.target.value })} />
                  <Input placeholder="Cost USD" value={usageForm.costUsd} onChange={(e) => setUsageForm({ ...usageForm, costUsd: e.target.value })} />
                  <Input placeholder="Latency ms" value={usageForm.latencyMs} onChange={(e) => setUsageForm({ ...usageForm, latencyMs: e.target.value })} />
                </div>
                <Button className="mt-3" onClick={() => action('Usage event recorded.', async () => {
                  await readJson('/api/platformization/usage/events', { method: 'POST', body: JSON.stringify(usageForm) });
                })}>Record usage</Button>
              </Panel>
              <div className="mt-4 overflow-hidden rounded-md border border-border/60">
                <div className="grid min-w-[760px] grid-cols-8 border-b border-border/60 bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <span>Provider</span><span>Model</span><span>Workflow</span><span>Runs</span><span>Tokens</span><span>Cost</span><span>Latency</span><span>Error rate</span>
                </div>
                <div className="overflow-x-auto">
                  {(snapshot.platform.usageSummary || []).map((row, index) => (
                    <div key={`${row.provider}-${row.model}-${row.workflow}-${index}`} className="grid min-w-[760px] grid-cols-8 border-b border-border/50 px-3 py-2 text-xs last:border-b-0">
                      <span>{row.provider}</span><span>{row.model}</span><span>{row.workflow}</span><span>{row.runs}</span><span>{formatNumber(row.totalTokens)}</span><span>{formatCurrency(row.costUsd)}</span><span>{row.averageLatencyMs}ms</span><span>{row.errorRate}%</span>
                    </div>
                  ))}
                  {(snapshot.platform.usageSummary || []).length === 0 && <Empty text="Usage appears here after provider or workflow events are recorded." />}
                </div>
              </div>
            </Section>
          )}

          {activeSection === 'security' && (
            <Section title="Security audit mode" description="Run dependency audit, secret scan, permission audit, and agent output leak detection workflows.">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <Panel title="Create audit run">
                  <Textarea rows={5} value={securityForm.checks} onChange={(e) => setSecurityForm({ ...securityForm, checks: e.target.value })} />
                  <Input className="mt-2" placeholder="Optional finding title" value={securityForm.findingTitle} onChange={(e) => setSecurityForm({ ...securityForm, findingTitle: e.target.value })} />
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
                  })}>Create audit</Button>
                </Panel>
                <ListPanel title="Audit runs" empty="No security audits yet.">
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
                          <div className="text-muted-foreground">{finding.recommendation || 'Review required.'}</div>
                        </div>
                      ))}
                    </div>
                  ))}
                </ListPanel>
              </div>
              <Panel className="mt-4" title="Audit log">
                <Input placeholder="Filter audit log by user, project, event, or file" value={auditQuery} onChange={(e) => setAuditQuery(e.target.value)} />
                <div className="mt-3 max-h-[420px] overflow-auto rounded-md border border-border/60">
                  {filteredAudit.slice(0, 80).map((entry) => <AuditRow key={entry.id} entry={entry} />)}
                  {filteredAudit.length === 0 && <Empty text="No audit entries match the current filter." />}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <a className="underline-offset-4 hover:underline" href="/api/platformization/audit-log/export?format=json" target="_blank" rel="noreferrer">Export JSON</a>
                  <a className="underline-offset-4 hover:underline" href="/api/platformization/audit-log/export?format=csv" target="_blank" rel="noreferrer">Export CSV</a>
                </div>
              </Panel>
            </Section>
          )}

          {activeSection === 'access' && (
            <Section title="Self-hosted access" description="Use Tailscale when there is no fixed domain, or configure Cloudflare Tunnel/custom domain for a stable public URL.">
              <div className="grid gap-4 xl:grid-cols-2">
                <Panel title="Remote access setup">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Select value={accessForm.mode} onChange={(value) => setAccessForm({ ...accessForm, mode: value })} options={accessModes} />
                    <Input placeholder="Label" value={accessForm.label} onChange={(e) => setAccessForm({ ...accessForm, label: e.target.value })} />
                    <Input placeholder="URL" value={accessForm.url} onChange={(e) => setAccessForm({ ...accessForm, url: e.target.value })} />
                    <Input placeholder="Target port" value={accessForm.targetPort} onChange={(e) => setAccessForm({ ...accessForm, targetPort: e.target.value })} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button onClick={() => action('Remote access config saved.', async () => {
                      await readJson('/api/platformization/remote-access/configs', { method: 'POST', body: JSON.stringify(accessForm) });
                    })}>Save access path</Button>
                    <Button variant="outline" onClick={() => action('Remote access health checked.', async () => {
                      const data = await readJson<{ health: any }>('/api/platformization/remote-access/health', { method: 'POST', body: JSON.stringify({ url: accessForm.url }) });
                      setAccessHealth(data.health);
                    })}>Check URL</Button>
                    <Button variant="outline" onClick={() => action('Tailscale status refreshed.', async () => {
                      const data = await readJson<{ tailscale: any }>('/api/platformization/remote-access/tailscale');
                      setTailscale(data.tailscale);
                    })}>Check Tailscale</Button>
                  </div>
                  {accessHealth && <StatusDetails title="Health" rows={[`reachable: ${accessHealth.reachable}`, `https: ${accessHealth.https}`, accessHealth.message]} />}
                  {tailscale && <StatusDetails title="Tailscale" rows={[`installed: ${tailscale.installed}`, `logged in: ${tailscale.loggedIn}`, `url: ${tailscale.pixcodeUrl || 'not available'}`, tailscale.message]} />}
                </Panel>
                <ListPanel title="Configured access paths" empty="No access paths configured yet.">
                  {(snapshot.remoteAccess.configs || snapshot.platform.remoteAccessConfigs || []).map((config) => (
                    <div key={config.id} className="border-b border-border/50 px-3 py-3 last:border-b-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium text-foreground">{config.label}</div>
                          <div className="text-xs text-muted-foreground">{config.url || snapshot.remoteAccess.localUrl || 'No URL'}</div>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant="secondary">{config.mode}</Badge>
                          <Badge variant={config.public ? 'destructive' : 'secondary'}>{config.public ? 'public' : 'private'}</Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </ListPanel>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {(snapshot.remoteAccess.recommendations || []).map((recommendation) => (
                  <div key={recommendation.mode} className="rounded-md border border-border/60 bg-background px-3 py-3">
                    <div className="text-sm font-medium text-foreground">{recommendation.label}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{recommendation.recommendedWhen}</div>
                  </div>
                ))}
              </div>
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

function MiniList({ title, items, render }: { title: string; items: any[]; render: (item: any) => string }) {
  return (
    <div className="mt-3 rounded-md border border-border/60">
      <div className="border-b border-border/60 bg-muted/20 px-3 py-2 text-xs font-medium text-muted-foreground">{title}</div>
      {items.slice(0, 5).map((item) => (
        <div key={item.id || render(item)} className="border-b border-border/50 px-3 py-2 text-xs text-foreground last:border-b-0">{render(item)}</div>
      ))}
      {items.length === 0 && <Empty text={`No ${title.toLowerCase()} yet.`} />}
    </div>
  );
}

function RoleMatrix({ roles }: { roles: Record<string, string[]> }) {
  const entries = Object.entries(roles);
  return (
    <Panel className="mt-4" title="Role permissions">
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

function StatusDetails({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div className="mt-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs">
      <div className="font-medium text-foreground">{title}</div>
      <div className="mt-1 space-y-1 text-muted-foreground">
        {rows.map((row) => <div key={row}>{row}</div>)}
      </div>
    </div>
  );
}
