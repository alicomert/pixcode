import { useCallback, useEffect, useState } from 'react';

import { Badge, Button } from '../../shared/view/ui';
import { authenticatedFetch } from '../../utils/api';

import {
  CheckCircle,
  Clock,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Workflow,
  Zap,
} from '@/lib/icons';

type ControlRoomProject = {
  id: string;
  name: string;
  path: string;
  sessionCount: number;
  activeRunCount: number;
  failedRunCount: number;
  pendingApprovalCount: number;
  latestRuns: Array<{
    id: string;
    workflowId: string;
    status: string;
  }>;
};

type ApprovalQueueItem = {
  id: string;
  runId: string;
  workflowId: string;
  status: string;
  summary?: string;
  reason?: string;
};

type Webhook = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  events: string[];
  lastDelivery?: {
    ok?: boolean;
    status?: number;
    eventType?: string;
    deliveredAt?: string;
  } | null;
};

type ControlRoomSnapshot = {
  generatedAt: string;
  mobileFirst: boolean;
  totals: {
    projects: number;
    activeRuns: number;
    failedRuns: number;
    pendingApprovals: number;
    webhooks: number;
    enabledWebhooks: number;
  };
  projects: ControlRoomProject[];
  approvals: ApprovalQueueItem[];
  webhooks: Webhook[];
};

type ControlRoomResponse = {
  success: boolean;
  controlRoom: ControlRoomSnapshot;
};

type ApprovalResponse = {
  pendingApprovals: ApprovalQueueItem[];
};

function compact(value: string | undefined, max = 68) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

async function readJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.error || `HTTP ${response.status}`);
  }
  return data as T;
}

export default function RemoteConsole() {
  const [snapshot, setSnapshot] = useState<ControlRoomSnapshot | null>(null);
  const [approvals, setApprovals] = useState<ApprovalQueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [controlRoom, approvalQueue] = await Promise.all([
        readJson<ControlRoomResponse>('/api/remote/control-room'),
        readJson<ApprovalResponse>('/api/orchestration/workflows/approvals'),
      ]);
      setSnapshot(controlRoom.controlRoom);
      setApprovals(approvalQueue.pendingApprovals);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const decideApproval = useCallback(async (approvalId: string, allow: boolean) => {
    await readJson(`/api/orchestration/workflows/approvals/${encodeURIComponent(approvalId)}`, {
      method: 'POST',
      body: JSON.stringify({ allow, source: 'ui' }),
    });
    await refresh();
  }, [refresh]);

  const totals = snapshot?.totals;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Smartphone className="h-4 w-4" />
            Remote console
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {snapshot?.generatedAt ? new Date(snapshot.generatedAt).toLocaleString() : 'Not synced'}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => { void refresh(); }} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        {error && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Projects" value={totals?.projects ?? 0} icon={Workflow} />
          <Metric label="Active runs" value={totals?.activeRuns ?? 0} icon={Clock} />
          <Metric label="Approval queue" value={approvals.length} icon={ShieldAlert} />
          <Metric label="Webhooks" value={`${totals?.enabledWebhooks ?? 0}/${totals?.webhooks ?? 0}`} icon={Zap} />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
          <section className="min-w-0 rounded-md border border-border/60">
            <SectionHeader title="Multi-project control room" />
            <div className="divide-y divide-border/50">
              {(snapshot?.projects ?? []).map((project) => (
                <div key={project.id} className="px-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">{project.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{project.path}</div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary">{project.activeRunCount} active</Badge>
                      {project.pendingApprovalCount > 0 && <Badge variant="destructive">{project.pendingApprovalCount} approvals</Badge>}
                    </div>
                  </div>
                  <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                    <span>{project.sessionCount} sessions</span>
                    <span>{project.failedRunCount} failed runs</span>
                    <span>{project.latestRuns.length} recent runs</span>
                  </div>
                </div>
              ))}
              {snapshot && snapshot.projects.length === 0 && (
                <div className="px-3 py-6 text-sm text-muted-foreground">No projects available.</div>
              )}
            </div>
          </section>

          <section className="min-w-0 rounded-md border border-border/60">
            <SectionHeader title="Approval queue" />
            <div className="divide-y divide-border/50">
              {approvals.map((approval) => (
                <div key={approval.id} className="px-3 py-3">
                  <div className="text-sm font-medium text-foreground">{compact(approval.summary || approval.reason || approval.id)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">Run {approval.runId}</div>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" onClick={() => { void decideApproval(approval.id, true); }}>
                      <CheckCircle className="h-3.5 w-3.5" />
                      Allow
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { void decideApproval(approval.id, false); }}>
                      Deny
                    </Button>
                  </div>
                </div>
              ))}
              {approvals.length === 0 && (
                <div className="px-3 py-6 text-sm text-muted-foreground">No pending approvals.</div>
              )}
            </div>
          </section>
        </div>

        <section className="mt-4 rounded-md border border-border/60">
          <SectionHeader title="Webhook health" />
          <div className="divide-y divide-border/50">
            {(snapshot?.webhooks ?? []).map((webhook) => (
              <div key={webhook.id} className="grid gap-2 px-3 py-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.6fr)]">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{webhook.name}</span>
                    <Badge variant={webhook.enabled ? 'default' : 'secondary'}>{webhook.enabled ? 'on' : 'off'}</Badge>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{webhook.url}</div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {webhook.lastDelivery
                    ? `${webhook.lastDelivery.ok ? 'ok' : 'failed'} ${webhook.lastDelivery.eventType || ''} ${webhook.lastDelivery.status || ''}`
                    : 'No delivery yet'}
                </div>
              </div>
            ))}
            {snapshot && snapshot.webhooks.length === 0 && (
              <div className="px-3 py-6 text-sm text-muted-foreground">No webhooks configured.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: typeof Workflow;
}) {
  return (
    <div className="rounded-md border border-border/60 px-3 py-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="border-b border-border/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {title}
    </div>
  );
}
