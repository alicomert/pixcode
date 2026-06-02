import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../../../shared/view/ui';
import { authenticatedFetch } from '../../../../utils/api';

import {
  AlertCircle,
  Bug,
  Check,
  Clock,
  Code2,
  Download,
  History,
  Key,
  List,
  Loader2,
  RefreshCw,
  Server,
  Settings2,
  Sparkles,
  SquareIcon,
  Terminal,
  Workflow,
} from '@/lib/icons';

type HermesInstallStatus = {
  installed: boolean;
  command: string | null;
  version: string | null;
  error: string | null;
};

type HermesGatewayStatus = {
  running: boolean;
  baseUrl?: string | null;
  projectPath?: string | null;
  pid?: number | null;
  error?: string | null;
  lastProbe?: HermesGatewayProbe | null;
  gateways?: HermesGatewayStatus[];
};

type HermesGatewayProbe = {
  ok: boolean;
  checkedAt?: string | null;
  baseUrl?: string | null;
  error?: string | null;
};

type HermesDiagnosticsIssue = {
  severity?: 'error' | 'warning' | 'info' | string;
  code?: string;
  message?: string;
  tools?: string[];
};

type HermesDiagnostics = {
  ok: boolean;
  generatedAt?: string | null;
  model?: {
    provider?: string | null;
    default?: string | null;
    baseUrl?: string | null;
  };
  config?: {
    active?: {
      toolsets?: string[];
      pixcodeMcp?: {
        configured?: boolean;
        enabled?: boolean;
        toolCount?: number;
        missingTools?: string[];
      };
      platformToolsets?: {
        hasHermesApiServer?: boolean;
        hasPixcodePlatform?: boolean;
      };
    };
    activePath?: string | null;
  };
  auth?: {
    active?: {
      selectedProviderConfigured?: boolean;
      selectedProviderLastRefresh?: string | null;
      selectedProviderPoolSize?: number;
    };
  };
  cron?: {
    toolsetAvailable?: boolean;
    gatewayJobsApi?: {
      ok?: boolean;
      status?: number;
      error?: string | null;
      body?: unknown;
    } | null;
  };
  issues?: HermesDiagnosticsIssue[];
  recommendedActions?: string[];
};

type HermesControlCapability = {
  id?: string;
  label?: string;
  ready?: boolean;
  detail?: string;
};

type HermesControlProfile = {
  name?: string;
  path?: string;
  isActive?: boolean;
  model?: {
    provider?: string | null;
    default?: string | null;
    baseUrl?: string | null;
  };
  tools?: {
    toolsets?: string[];
    pixcodeMcpToolCount?: number;
    missingPixcodeMcpTools?: string[];
    hermesCliReady?: boolean;
    pixcodeMcpReady?: boolean;
  };
  sessions?: {
    total?: number;
    exists?: boolean;
  };
  cron?: {
    total?: number;
    active?: number;
    exists?: boolean;
  };
};

type HermesControlPlane = {
  ok?: boolean;
  generatedAt?: string | null;
  homes?: {
    source?: string | null;
    managed?: string | null;
  };
  activeProfile?: string | null;
  profiles?: HermesControlProfile[];
  activeProfileSummary?: HermesControlProfile | null;
  managedProfile?: HermesControlProfile | null;
  capabilities?: HermesControlCapability[];
  recommendations?: string[];
};

type HermesSettingsTabProps = {
  onClose?: () => void;
};

type HermesSettingsCommand = {
  id: string;
  command: string;
  titleKey: string;
  titleDefault: string;
  descriptionKey: string;
  descriptionDefault: string;
  icon: typeof Terminal;
};

const HERMES_SETTINGS_COMMANDS: HermesSettingsCommand[] = [
  {
    id: 'model',
    command: 'hermes model',
    titleKey: 'hermes.commands.model.title',
    titleDefault: 'Model and provider',
    descriptionKey: 'hermes.commands.model.description',
    descriptionDefault: 'Open the interactive provider/model wizard for OAuth, API keys, and default model selection.',
    icon: Settings2,
  },
  {
    id: 'auth',
    command: 'hermes auth',
    titleKey: 'hermes.commands.auth.title',
    titleDefault: 'Credentials',
    descriptionKey: 'hermes.commands.auth.description',
    descriptionDefault: 'Manage OAuth sessions and API key pools for configured providers.',
    icon: Key,
  },
  {
    id: 'tools',
    command: 'hermes setup tools',
    titleKey: 'hermes.commands.tools.title',
    titleDefault: 'Tools',
    descriptionKey: 'hermes.commands.tools.description',
    descriptionDefault: 'Choose which Hermes toolsets are enabled, including Pixcode MCP access.',
    icon: Workflow,
  },
  {
    id: 'cron',
    command: 'hermes cron status',
    titleKey: 'hermes.commands.cron.title',
    titleDefault: 'Cron jobs',
    descriptionKey: 'hermes.commands.cron.description',
    descriptionDefault: 'Inspect the scheduler, list jobs, and confirm recurring project tasks can run through the Hermes gateway.',
    icon: Clock,
  },
  {
    id: 'mcp',
    command: 'hermes mcp',
    titleKey: 'hermes.commands.mcp.title',
    titleDefault: 'MCP servers',
    descriptionKey: 'hermes.commands.mcp.description',
    descriptionDefault: 'Manage MCP servers and reload Pixcode MCP when tool configuration changes.',
    icon: Server,
  },
  {
    id: 'doctor',
    command: 'hermes doctor',
    titleKey: 'hermes.commands.doctor.title',
    titleDefault: 'Doctor',
    descriptionKey: 'hermes.commands.doctor.description',
    descriptionDefault: 'Diagnose Hermes config, dependency, and platform problems in a terminal.',
    icon: Bug,
  },
  {
    id: 'update',
    command: 'hermes update --yes',
    titleKey: 'hermes.commands.update.title',
    titleDefault: 'Update Hermes',
    descriptionKey: 'hermes.commands.update.description',
    descriptionDefault: 'Pull the latest Hermes fixes and reinstall dependencies without interactive prompts.',
    icon: RefreshCw,
  },
  {
    id: 'status',
    command: 'hermes status --all',
    titleKey: 'hermes.commands.status.title',
    titleDefault: 'Status',
    descriptionKey: 'hermes.commands.status.description',
    descriptionDefault: 'Show the current provider, auth, platform, and redacted setup summary.',
    icon: List,
  },
  {
    id: 'lsp',
    command: 'hermes lsp status',
    titleKey: 'hermes.commands.lsp.title',
    titleDefault: 'LSP status',
    descriptionKey: 'hermes.commands.lsp.description',
    descriptionDefault: 'Check Hermes language server integration for semantic diagnostics.',
    icon: Code2,
  },
  {
    id: 'skills',
    command: 'hermes skills',
    titleKey: 'hermes.commands.skills.title',
    titleDefault: 'Skills',
    descriptionKey: 'hermes.commands.skills.description',
    descriptionDefault: 'Browse, install, audit, and configure Hermes skills from the CLI.',
    icon: Sparkles,
  },
  {
    id: 'sessions',
    command: 'hermes sessions browse',
    titleKey: 'hermes.commands.sessions.title',
    titleDefault: 'Sessions',
    descriptionKey: 'hermes.commands.sessions.description',
    descriptionDefault: 'Browse, export, rename, prune, or delete Hermes sessions.',
    icon: History,
  },
];

const emptyStatus: HermesInstallStatus = {
  installed: false,
  command: null,
  version: null,
  error: null,
};

function readHermesProbeError(body: Record<string, unknown>) {
  const checks = body?.checks as Record<string, unknown> | undefined;
  const run = checks?.run as Record<string, unknown> | undefined;
  const runBody = run?.body as Record<string, unknown> | string | undefined;
  const runBodyError = typeof runBody === 'string'
    ? runBody
    : typeof runBody?.error === 'string'
      ? runBody.error
      : null;
  return (typeof run?.error === 'string' && run.error)
    || runBodyError
    || (typeof body?.error === 'string' && body.error)
    || null;
}

export default function HermesSettingsTab({ onClose }: HermesSettingsTabProps) {
  const { t } = useTranslation('settings');
  const [status, setStatus] = useState<HermesInstallStatus>(emptyStatus);
  const [loading, setLoading] = useState(true);
  const [gatewayStatus, setGatewayStatus] = useState<HermesGatewayStatus | null>(null);
  const [gatewayProbe, setGatewayProbe] = useState<HermesGatewayProbe | null>(null);
  const [gatewayLoading, setGatewayLoading] = useState(false);
  const [gatewayError, setGatewayError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<HermesDiagnostics | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const [controlPlane, setControlPlane] = useState<HermesControlPlane | null>(null);
  const [controlPlaneLoading, setControlPlaneLoading] = useState(false);
  const [controlPlaneError, setControlPlaneError] = useState<string | null>(null);
  const [controlPlaneRepairing, setControlPlaneRepairing] = useState(false);
  const autoGatewayStartedRef = useRef(false);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authenticatedFetch('/api/orchestration/hermes/install-status', {
        cache: 'no-store',
      });
      const body = await response.json().catch(() => ({}));
      setStatus({
        installed: Boolean(body?.installed),
        command: typeof body?.command === 'string' ? body.command : null,
        version: typeof body?.version === 'string' ? body.version : null,
        error: typeof body?.error === 'string' ? body.error : null,
      });
    } catch (error) {
      setStatus({
        ...emptyStatus,
        error: error instanceof Error ? error.message : t('hermes.statusFailed', { defaultValue: 'Unable to check Hermes Agent.' }),
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  const refreshGatewayStatus = useCallback(async () => {
    setGatewayLoading(true);
    setGatewayError(null);
    try {
      const response = await authenticatedFetch('/api/orchestration/hermes/gateway/status', {
        cache: 'no-store',
      });
      const body = await response.json().catch(() => ({}));
      const firstGateway = Array.isArray(body?.gateways)
        ? body.gateways.find((gateway: HermesGatewayStatus) => gateway.running) ?? body.gateways[0] ?? null
        : null;
      setGatewayStatus(firstGateway ?? {
        running: Boolean(body?.running),
        baseUrl: typeof body?.baseUrl === 'string' ? body.baseUrl : null,
        projectPath: typeof body?.projectPath === 'string' ? body.projectPath : null,
        pid: typeof body?.pid === 'number' ? body.pid : null,
        error: typeof body?.error === 'string' ? body.error : null,
        lastProbe: body?.lastProbe ?? null,
        gateways: Array.isArray(body?.gateways) ? body.gateways : undefined,
      });
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : t('hermes.gatewayStatusFailed', { defaultValue: 'Unable to check Hermes REST gateway.' }));
    } finally {
      setGatewayLoading(false);
    }
  }, [t]);

  const refreshDiagnostics = useCallback(async () => {
    setDiagnosticsLoading(true);
    setDiagnosticsError(null);
    try {
      const response = await authenticatedFetch('/api/orchestration/hermes/diagnostics', {
        cache: 'no-store',
      });
      const body = await response.json().catch(() => ({}));
      if (body && typeof body === 'object' && Array.isArray(body.issues)) {
        setDiagnostics(body as HermesDiagnostics);
        if (!response.ok && !body.ok) {
          setDiagnosticsError(body.issues[0]?.message ?? `HTTP ${response.status}`);
        }
        return;
      }
      if (!response.ok) {
        throw new Error(body?.error?.message || `HTTP ${response.status}`);
      }
      setDiagnostics(body as HermesDiagnostics);
    } catch (error) {
      setDiagnosticsError(error instanceof Error ? error.message : t('hermes.diagnosticsFailed', { defaultValue: 'Unable to read Hermes diagnostics.' }));
    } finally {
      setDiagnosticsLoading(false);
    }
  }, [t]);

  const refreshControlPlane = useCallback(async () => {
    setControlPlaneLoading(true);
    setControlPlaneError(null);
    try {
      const response = await authenticatedFetch('/api/orchestration/hermes/control-plane', {
        cache: 'no-store',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok && !body?.profiles) {
        throw new Error(body?.error?.message || `HTTP ${response.status}`);
      }
      setControlPlane(body as HermesControlPlane);
      if (!response.ok && Array.isArray(body?.recommendations) && body.recommendations.length > 0) {
        setControlPlaneError(body.recommendations[0]);
      }
    } catch (error) {
      setControlPlaneError(error instanceof Error ? error.message : t('hermes.controlPlaneFailed', { defaultValue: 'Unable to read Hermes control plane.' }));
    } finally {
      setControlPlaneLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refreshStatus();
    void refreshGatewayStatus();
    void refreshDiagnostics();
    void refreshControlPlane();
  }, [refreshControlPlane, refreshDiagnostics, refreshGatewayStatus, refreshStatus]);

  const ensureGatewayReady = useCallback(async () => {
    setGatewayLoading(true);
    setGatewayError(null);
    try {
      const response = await authenticatedFetch('/api/orchestration/hermes/gateway/probe', {
        method: 'POST',
        body: JSON.stringify({ startIfNeeded: true }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok && !body?.ok) {
        setGatewayError(body?.error?.message || body?.error || `HTTP ${response.status}`);
      } else {
        setGatewayProbe({
          ok: Boolean(body?.ok),
          checkedAt: typeof body?.checkedAt === 'string' ? body.checkedAt : null,
          baseUrl: typeof body?.baseUrl === 'string' ? body.baseUrl : null,
          error: typeof body?.error === 'string' ? body.error : null,
        });
      }
      await refreshGatewayStatus();
      void refreshDiagnostics();
      void refreshControlPlane();
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : t('hermes.gatewayProbeFailed', { defaultValue: 'Hermes REST probe failed.' }));
    } finally {
      setGatewayLoading(false);
    }
  }, [refreshControlPlane, refreshDiagnostics, refreshGatewayStatus, t]);

  useEffect(() => {
    if (!status.installed || autoGatewayStartedRef.current) {
      return;
    }

    autoGatewayStartedRef.current = true;
    void ensureGatewayReady();
  }, [ensureGatewayReady, status.installed]);

  const closeSettingsAfterTerminalOpen = () => {
    window.setTimeout(() => onClose?.(), 0);
  };

  const openHermesTerminal = (mode: 'start' | 'install') => {
    window.dispatchEvent(new CustomEvent('pixcode:hermes-terminal', {
      detail: { mode },
    }));
    closeSettingsAfterTerminalOpen();
  };

  const openHermesCommand = (command: HermesSettingsCommand) => {
    window.dispatchEvent(new CustomEvent('pixcode:hermes-terminal', {
      detail: {
        mode: 'command',
        command: command.command,
        title: command.titleDefault,
      },
    }));
    closeSettingsAfterTerminalOpen();
  };

  const startGateway = async () => {
    setGatewayLoading(true);
    setGatewayError(null);
    try {
      const response = await authenticatedFetch('/api/orchestration/hermes/gateway/start', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error?.message || `HTTP ${response.status}`);
      }
      setGatewayStatus({
        running: Boolean(body?.running),
        baseUrl: typeof body?.baseUrl === 'string' ? body.baseUrl : null,
        projectPath: typeof body?.projectPath === 'string' ? body.projectPath : null,
        pid: typeof body?.pid === 'number' ? body.pid : null,
        error: typeof body?.error === 'string' ? body.error : null,
        lastProbe: body?.probe ?? body?.lastProbe ?? null,
      });
      setGatewayProbe(body?.probe ?? null);
      void refreshDiagnostics();
      void refreshControlPlane();
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : t('hermes.gatewayStartFailed', { defaultValue: 'Hermes REST gateway could not be started.' }));
    } finally {
      setGatewayLoading(false);
    }
  };

  const probeGateway = async () => {
    setGatewayLoading(true);
    setGatewayError(null);
    try {
      const response = await authenticatedFetch('/api/orchestration/hermes/gateway/probe', {
        method: 'POST',
        body: JSON.stringify({
          startIfNeeded: true,
          input: 'Pixcode Hermes REST health check. Reply with OK.',
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.ok) {
        setGatewayProbe({
          ok: false,
          checkedAt: typeof body?.checkedAt === 'string' ? body.checkedAt : null,
          baseUrl: typeof body?.baseUrl === 'string' ? body.baseUrl : null,
          error: readHermesProbeError(body as Record<string, unknown>) || body?.error?.message || `HTTP ${response.status}`,
        });
        await refreshGatewayStatus();
        void refreshDiagnostics();
        void refreshControlPlane();
        return;
      }
      setGatewayProbe({
        ok: Boolean(body?.ok),
        checkedAt: typeof body?.checkedAt === 'string' ? body.checkedAt : null,
        baseUrl: typeof body?.baseUrl === 'string' ? body.baseUrl : null,
        error: typeof body?.error === 'string' ? body.error : null,
      });
      await refreshGatewayStatus();
      void refreshDiagnostics();
      void refreshControlPlane();
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : t('hermes.gatewayProbeFailed', { defaultValue: 'Hermes REST probe failed.' }));
    } finally {
      setGatewayLoading(false);
    }
  };

  const stopGateway = async () => {
    setGatewayLoading(true);
    setGatewayError(null);
    try {
      await authenticatedFetch('/api/orchestration/hermes/gateway/stop', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await refreshGatewayStatus();
      void refreshDiagnostics();
      void refreshControlPlane();
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : t('hermes.gatewayStopFailed', { defaultValue: 'Hermes REST gateway could not be stopped.' }));
    } finally {
      setGatewayLoading(false);
    }
  };

  const repairControlPlane = async () => {
    setControlPlaneRepairing(true);
    setControlPlaneError(null);
    try {
      const response = await authenticatedFetch('/api/orchestration/hermes/control-plane/repair', {
        method: 'POST',
        body: JSON.stringify({ forceRestart: true }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok && !body?.controlPlane) {
        throw new Error(body?.error?.message || `HTTP ${response.status}`);
      }
      setControlPlane((body?.controlPlane ?? body) as HermesControlPlane);
      await refreshGatewayStatus();
      void refreshDiagnostics();
    } catch (error) {
      setControlPlaneError(error instanceof Error ? error.message : t('hermes.controlPlaneRepairFailed', { defaultValue: 'Unable to repair Hermes control plane.' }));
    } finally {
      setControlPlaneRepairing(false);
    }
  };

  const statusLabel = status.installed
    ? status.version || t('hermes.ready', { defaultValue: 'Ready' })
    : t('hermes.notInstalled', { defaultValue: 'Not installed' });
  const gatewayLabel = gatewayStatus?.running
    ? t('hermes.gatewayRunning', { defaultValue: 'REST gateway running' })
    : t('hermes.gatewayStopped', { defaultValue: 'REST gateway stopped' });
  const activeDiagnosticsConfig = diagnostics?.config?.active;
  const pixcodeMcpToolCount = activeDiagnosticsConfig?.pixcodeMcp?.toolCount ?? 0;
  const pixcodeMcpMissingCount = activeDiagnosticsConfig?.pixcodeMcp?.missingTools?.length ?? 0;
  const diagnosticsIssues = diagnostics?.issues ?? [];
  const diagnosticsHasErrors = diagnosticsIssues.some((issue) => issue.severity === 'error');
  const controlProfiles = controlPlane?.profiles ?? [];
  const managedControlProfile = controlPlane?.managedProfile ?? controlProfiles.find((profile) => profile.name === 'pixcode');
  const activeControlProfile = controlPlane?.activeProfileSummary ?? controlProfiles.find((profile) => profile.isActive);
  const totalHermesSessions = controlProfiles.reduce((sum, profile) => sum + Number(profile.sessions?.total || 0), 0);
  const totalHermesCronJobs = controlProfiles.reduce((sum, profile) => sum + Number(profile.cron?.total || 0), 0);
  const activeHermesCronJobs = controlProfiles.reduce((sum, profile) => sum + Number(profile.cron?.active || 0), 0);
  const controlCapabilities = controlPlane?.capabilities ?? [];
  const controlRecommendations = controlPlane?.recommendations ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-emerald-500/10">
          <img src="/hermes-agent.png" alt="" aria-hidden="true" className="h-8 w-8 rounded object-contain" />
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-foreground">
            {t('hermes.title', { defaultValue: 'Hermes Agent' })}
          </h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {t('hermes.description', {
              defaultValue: 'Manage Hermes Agent as a Pixcode-controlled project terminal with MCP access to projects, provider status, and visible CLI launches.',
            })}
          </p>
        </div>
      </div>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : status.installed ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-500" />
              )}
              <div className="text-sm font-semibold text-foreground">
                {t('hermes.statusTitle', { defaultValue: 'Install status' })}
              </div>
            </div>
            <div className="mt-2 text-sm text-foreground">{statusLabel}</div>
            {status.command && (
              <div className="mt-1 truncate font-mono text-xs text-muted-foreground" title={status.command}>
                {status.command}
              </div>
            )}
            {status.error && !status.installed && (
              <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-200">
                {status.error}
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => openHermesTerminal('start')}
            >
              <Terminal className="mr-2 h-4 w-4" />
              {t('hermes.start', { defaultValue: 'Start Hermes' })}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => openHermesTerminal('install')}
            >
              <Download className="mr-2 h-4 w-4" />
              {status.installed
                ? t('hermes.repair', { defaultValue: 'Repair command' })
                : t('hermes.install', { defaultValue: 'Install' })}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void refreshStatus()}
              disabled={loading}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {t('hermes.refresh', { defaultValue: 'Refresh' })}
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {controlPlaneLoading || controlPlaneRepairing ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : controlPlane?.ok ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <Workflow className="h-4 w-4 text-amber-500" />
              )}
              <div className="text-sm font-semibold text-foreground">
                {t('hermes.controlPlaneTitle', { defaultValue: 'Hermes control plane' })}
              </div>
            </div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t('hermes.controlPlaneDescription', {
                defaultValue: 'A desktop-style control layer for Hermes profiles, REST gateway, Pixcode MCP tools, sessions, cron jobs, and visible CLI control.',
              })}
            </p>
            {controlPlaneError && (
              <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-200">
                {controlPlaneError}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void refreshControlPlane()}
              disabled={controlPlaneLoading || controlPlaneRepairing}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${controlPlaneLoading ? 'animate-spin' : ''}`} />
              {t('hermes.refresh', { defaultValue: 'Refresh' })}
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => void repairControlPlane()}
              disabled={controlPlaneLoading || controlPlaneRepairing || !status.installed}
            >
              {controlPlaneRepairing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Workflow className="mr-2 h-4 w-4" />
              )}
              {t('hermes.controlPlaneRepair', { defaultValue: 'Repair wiring' })}
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-4">
          <div className="rounded-md border border-border bg-background p-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">
              {t('hermes.controlPlaneProfiles', { defaultValue: 'Profiles' })}
            </div>
            <div className="mt-1 text-lg font-semibold text-foreground">{controlProfiles.length}</div>
            <div className="mt-1 truncate text-xs text-muted-foreground" title={activeControlProfile?.path}>
              {activeControlProfile?.name || controlPlane?.activeProfile || t('hermes.unknown', { defaultValue: 'Unknown' })}
            </div>
          </div>

          <div className="rounded-md border border-border bg-background p-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">
              {t('hermes.controlPlaneMcp', { defaultValue: 'MCP' })}
            </div>
            <div className={`mt-1 text-lg font-semibold ${managedControlProfile?.tools?.pixcodeMcpReady ? 'text-emerald-600 dark:text-emerald-300' : 'text-amber-600 dark:text-amber-300'}`}>
              {managedControlProfile?.tools?.pixcodeMcpToolCount ?? 0}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {t('hermes.controlPlaneMcpMissing', {
                defaultValue: '{{count}} missing',
                count: managedControlProfile?.tools?.missingPixcodeMcpTools?.length ?? 0,
              })}
            </div>
          </div>

          <div className="rounded-md border border-border bg-background p-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">
              {t('hermes.controlPlaneSessions', { defaultValue: 'Sessions' })}
            </div>
            <div className="mt-1 text-lg font-semibold text-foreground">{totalHermesSessions}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {t('hermes.controlPlaneSessionHint', { defaultValue: 'Hermes state.db history' })}
            </div>
          </div>

          <div className="rounded-md border border-border bg-background p-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">
              {t('hermes.controlPlaneCron', { defaultValue: 'Cron' })}
            </div>
            <div className="mt-1 text-lg font-semibold text-foreground">{totalHermesCronJobs}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {t('hermes.controlPlaneCronActive', {
                defaultValue: '{{count}} active',
                count: activeHermesCronJobs,
              })}
            </div>
          </div>
        </div>

        {controlCapabilities.length > 0 && (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {controlCapabilities.map((capability) => (
              <div key={capability.id || capability.label} className="flex items-start gap-2 rounded-md border border-border bg-background p-3">
                {capability.ready ? (
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                )}
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">{capability.label}</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">{capability.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {controlRecommendations.length > 0 && (
          <div className="mt-3 space-y-2">
            {controlRecommendations.slice(0, 3).map((recommendation) => (
              <div key={recommendation} className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-200">
                {recommendation}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">
              {t('hermes.commandsTitle', { defaultValue: 'Hermes CLI settings' })}
            </div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t('hermes.commandsDescription', {
                defaultValue: 'Open the real Hermes terminal wizards from Pixcode. Use Model and provider to connect Codex, OpenRouter, Anthropic, Gemini, and other providers.',
              })}
            </p>
          </div>
          {!status.installed && (
            <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-200">
              {t('hermes.commandsInstallFirst', { defaultValue: 'Install Hermes before opening CLI settings.' })}
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {HERMES_SETTINGS_COMMANDS.map((command) => {
            const Icon = command.icon;

            return (
              <button
                key={command.id}
                type="button"
                disabled={!status.installed}
                onClick={() => openHermesCommand(command)}
                className="group flex min-h-24 items-start gap-3 rounded-md border border-border bg-background p-3 text-left transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-background"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-emerald-500/10 text-emerald-600 group-hover:bg-emerald-500/15 dark:text-emerald-300">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {t(command.titleKey, { defaultValue: command.titleDefault })}
                    </span>
                    <span className="shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {command.command}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {t(command.descriptionKey, { defaultValue: command.descriptionDefault })}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {gatewayLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : gatewayStatus?.running ? (
                <Server className="h-4 w-4 text-emerald-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-500" />
              )}
              <div className="text-sm font-semibold text-foreground">
                {t('hermes.gatewayTitle', { defaultValue: 'REST API gateway' })}
              </div>
            </div>
            <div className="mt-2 text-sm text-foreground">{gatewayLabel}</div>
            {gatewayStatus?.baseUrl && (
              <div className="mt-1 truncate font-mono text-xs text-muted-foreground" title={gatewayStatus.baseUrl}>
                {gatewayStatus.baseUrl}
              </div>
            )}
            {gatewayProbe && (
              <div className={`mt-2 rounded border px-3 py-2 text-xs leading-5 ${
                gatewayProbe.ok
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200'
              }`}>
                {gatewayProbe.ok
                  ? t('hermes.gatewayProbeOk', { defaultValue: 'REST probe passed: health, capabilities, models, and a real prompt responded.' })
                  : (gatewayProbe.error || t('hermes.gatewayProbeFailed', { defaultValue: 'Hermes REST probe failed.' }))}
              </div>
            )}
            {gatewayError && (
              <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-200">
                {gatewayError}
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => void startGateway()}
              disabled={gatewayLoading}
            >
              <Server className="mr-2 h-4 w-4" />
              {t('hermes.gatewayStart', { defaultValue: 'Start REST' })}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void probeGateway()}
              disabled={gatewayLoading}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${gatewayLoading ? 'animate-spin' : ''}`} />
              {t('hermes.gatewayProbe', { defaultValue: 'Test REST' })}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void stopGateway()}
              disabled={gatewayLoading || !gatewayStatus?.running}
            >
              <SquareIcon className="mr-2 h-4 w-4" />
              {t('hermes.gatewayStop', { defaultValue: 'Stop' })}
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {diagnosticsLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : diagnostics?.ok ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-500" />
              )}
              <div className="text-sm font-semibold text-foreground">
                {t('hermes.diagnosticsTitle', { defaultValue: 'Integration diagnostics' })}
              </div>
            </div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t('hermes.diagnosticsDescription', {
                defaultValue: 'Checks Hermes model/auth, native toolsets, Pixcode MCP tools, REST gateway, and cron API wiring without exposing secrets.',
              })}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void refreshDiagnostics()}
            disabled={diagnosticsLoading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${diagnosticsLoading ? 'animate-spin' : ''}`} />
            {t('hermes.refresh', { defaultValue: 'Refresh' })}
          </Button>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2">
          <div className="rounded-md border border-border bg-background p-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">
              {t('hermes.diagnosticsModel', { defaultValue: 'Model' })}
            </div>
            <div className="mt-1 text-sm text-foreground">
              {diagnostics?.model?.provider || t('hermes.unknown', { defaultValue: 'Unknown' })}
              {diagnostics?.model?.default ? ` / ${diagnostics.model.default}` : ''}
            </div>
            <div className={`mt-2 text-xs ${diagnostics?.auth?.active?.selectedProviderConfigured ? 'text-emerald-600 dark:text-emerald-300' : 'text-amber-600 dark:text-amber-300'}`}>
              {diagnostics?.auth?.active?.selectedProviderConfigured
                ? t('hermes.diagnosticsAuthReady', { defaultValue: 'Provider auth is present.' })
                : t('hermes.diagnosticsAuthMissing', { defaultValue: 'Provider auth needs attention.' })}
            </div>
          </div>

          <div className="rounded-md border border-border bg-background p-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">
              {t('hermes.diagnosticsTools', { defaultValue: 'Tools' })}
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(activeDiagnosticsConfig?.toolsets ?? []).map((toolset) => (
                <span key={toolset} className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {toolset}
                </span>
              ))}
              {(!activeDiagnosticsConfig?.toolsets || activeDiagnosticsConfig.toolsets.length === 0) && (
                <span className="text-sm text-muted-foreground">{t('hermes.unknown', { defaultValue: 'Unknown' })}</span>
              )}
            </div>
            <div className={`mt-2 text-xs ${pixcodeMcpMissingCount === 0 && pixcodeMcpToolCount > 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-amber-600 dark:text-amber-300'}`}>
              {t('hermes.diagnosticsMcpTools', {
                defaultValue: 'Pixcode MCP: {{count}} tools, {{missing}} missing',
                count: pixcodeMcpToolCount,
                missing: pixcodeMcpMissingCount,
              })}
            </div>
          </div>

          <div className="rounded-md border border-border bg-background p-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">
              {t('hermes.diagnosticsCron', { defaultValue: 'Cron' })}
            </div>
            <div className={`mt-1 text-sm ${diagnostics?.cron?.toolsetAvailable ? 'text-emerald-600 dark:text-emerald-300' : 'text-amber-600 dark:text-amber-300'}`}>
              {diagnostics?.cron?.toolsetAvailable
                ? t('hermes.diagnosticsCronReady', { defaultValue: 'Hermes cron toolset is available.' })
                : t('hermes.diagnosticsCronMissing', { defaultValue: 'Hermes cron needs hermes-cli toolset.' })}
            </div>
            {diagnostics?.cron?.gatewayJobsApi && (
              <div className={`mt-2 text-xs ${diagnostics.cron.gatewayJobsApi.ok ? 'text-emerald-600 dark:text-emerald-300' : 'text-amber-600 dark:text-amber-300'}`}>
                {diagnostics.cron.gatewayJobsApi.ok
                  ? t('hermes.diagnosticsCronApiReady', { defaultValue: 'Gateway /api/jobs responded.' })
                  : (diagnostics.cron.gatewayJobsApi.error || t('hermes.diagnosticsCronApiFailed', { defaultValue: 'Gateway /api/jobs did not respond.' }))}
              </div>
            )}
          </div>

          <div className="rounded-md border border-border bg-background p-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">
              {t('hermes.diagnosticsIssues', { defaultValue: 'Issues' })}
            </div>
            <div className={`mt-1 text-sm ${diagnostics?.ok ? 'text-emerald-600 dark:text-emerald-300' : diagnosticsHasErrors ? 'text-red-600 dark:text-red-300' : 'text-amber-600 dark:text-amber-300'}`}>
              {diagnosticsIssues.length === 0
                ? t('hermes.diagnosticsNoIssues', { defaultValue: 'No blocking issue detected.' })
                : t('hermes.diagnosticsIssueCount', {
                    defaultValue: '{{count}} issue(s) detected.',
                    count: diagnosticsIssues.length,
                  })}
            </div>
            {diagnosticsError && (
              <div className="mt-2 text-xs text-amber-600 dark:text-amber-300">{diagnosticsError}</div>
            )}
          </div>
        </div>

        {diagnosticsIssues.length > 0 && (
          <div className="mt-3 space-y-2">
            {diagnosticsIssues.slice(0, 4).map((issue) => (
              <div key={`${issue.code}-${issue.message}`} className={`rounded border px-3 py-2 text-xs leading-5 ${
                issue.severity === 'error'
                  ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-200'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200'
              }`}>
                <span className="font-semibold">{issue.code || issue.severity || 'HERMES'}</span>
                {' '}
                {issue.message}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-muted/20 p-4">
        <div className="flex items-start gap-3">
          <img src="/hermes-agent.png" alt="" aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 rounded object-contain" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">
              {t('hermes.pixcodeControlTitle', { defaultValue: 'Pixcode control' })}
            </div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t('hermes.pixcodeControlDescription', {
                defaultValue: 'Pixcode configures the Hermes MCP server before launch, so Hermes can inspect workspaces and open provider terminals inside the visible Pixcode UI when you ask it to.',
              })}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
