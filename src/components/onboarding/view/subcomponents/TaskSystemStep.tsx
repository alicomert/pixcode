import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AUTH_TOKEN_STORAGE_KEY } from '../../../auth/constants';

import { authenticatedFetch } from '@/utils/api';
import { CheckCircle, Loader2, Terminal } from '@/lib/icons';

type TaskMasterInstallationStatus = {
  success?: boolean;
  installation?: {
    isInstalled?: boolean;
    version?: string | null;
    reason?: string | null;
  };
  mcpServer?: {
    hasMCPServer?: boolean;
    reason?: string | null;
  };
  isReady?: boolean;
};

type TaskSystemStepProps = {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onReadyChange: (ready: boolean) => void;
};

type InstallLog = {
  stream: string;
  chunk: string;
};

const statusMessage = (status: TaskMasterInstallationStatus | null) => {
  if (!status) {
    return 'Checking TaskMaster installation...';
  }

  if (status.installation?.isInstalled) {
    return status.installation.version
      ? `TaskMaster CLI installed (${status.installation.version}).`
      : 'TaskMaster CLI installed.';
  }

  return status.installation?.reason || 'TaskMaster CLI is not installed yet.';
};

export default function TaskSystemStep({
  enabled,
  onEnabledChange,
  onReadyChange,
}: TaskSystemStepProps) {
  const [status, setStatus] = useState<TaskMasterInstallationStatus | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installLogs, setInstallLogs] = useState<InstallLog[]>([]);
  const [installError, setInstallError] = useState('');
  const eventSourceRef = useRef<EventSource | null>(null);

  const isInstalled = Boolean(status?.installation?.isInstalled);
  const mcpConfigured = Boolean(status?.mcpServer?.hasMCPServer);

  const ready = useMemo(() => !enabled || isInstalled, [enabled, isInstalled]);

  useEffect(() => {
    onReadyChange(ready);
  }, [onReadyChange, ready]);

  const loadStatus = useCallback(async () => {
    setIsChecking(true);
    setInstallError('');
    try {
      const response = await authenticatedFetch('/api/taskmaster/installation-status');
      const payload = await response.json() as TaskMasterInstallationStatus;
      setStatus(payload);
      if (!response.ok) {
        setInstallError(payload.installation?.reason || 'TaskMaster status check failed.');
      }
    } catch (error) {
      setStatus(null);
      setInstallError(error instanceof Error ? error.message : 'TaskMaster status check failed.');
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();

    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [loadStatus]);

  const startInstall = useCallback(async () => {
    setIsInstalling(true);
    setInstallError('');
    setInstallLogs([]);

    try {
      const response = await authenticatedFetch('/api/taskmaster/install', { method: 'POST' });
      const payload = await response.json() as { success?: boolean; jobId?: string; error?: string; message?: string };
      if (!response.ok || !payload.success || !payload.jobId) {
        throw new Error(payload.error || payload.message || 'TaskMaster install could not start.');
      }

      const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
      const query = token ? `?token=${encodeURIComponent(token)}` : '';
      const source = new EventSource(`/api/taskmaster/install/${encodeURIComponent(payload.jobId)}/stream${query}`);
      eventSourceRef.current = source;

      source.addEventListener('log', (event) => {
        const data = JSON.parse(event.data) as InstallLog;
        setInstallLogs((current) => [...current, data].slice(-80));
      });

      source.addEventListener('done', (event) => {
        const data = JSON.parse(event.data) as { success?: boolean; error?: string; message?: string };
        source.close();
        eventSourceRef.current = null;
        setIsInstalling(false);

        if (!data.success) {
          setInstallError(data.error || data.message || 'TaskMaster install failed.');
          return;
        }

        void loadStatus();
      });

      source.onerror = () => {
        source.close();
        eventSourceRef.current = null;
        setIsInstalling(false);
        setInstallError('TaskMaster install stream disconnected.');
      };
    } catch (error) {
      setIsInstalling(false);
      setInstallError(error instanceof Error ? error.message : 'TaskMaster install could not start.');
    }
  }, [loadStatus]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold text-foreground">Task System</h2>
        <p className="text-sm text-muted-foreground">
          Decide whether Pixcode should enable TaskMaster-backed planning, kanban tasks, PRD parsing, and agent task execution from the start.
        </p>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-4 transition-colors hover:bg-muted/40">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
          className="mt-1 h-4 w-4"
        />
        <span className="min-w-0 space-y-1">
          <span className="block text-sm font-medium text-foreground">Enable TaskMaster features</span>
          <span className="block text-sm leading-6 text-muted-foreground">
            This keeps the Tasks panel, PRD tools, and orchestration task sync available. You can change it later in Settings.
          </span>
        </span>
      </label>

      {enabled && (
        <div className="space-y-4 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {isInstalled ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <Terminal className="h-5 w-5 text-primary" />
                )}
                <h3 className="font-medium text-foreground">TaskMaster CLI</h3>
              </div>
              <p className="text-sm text-muted-foreground">{statusMessage(status)}</p>
              {isInstalled && !mcpConfigured && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  MCP server is not configured yet. Core task files work now; MCP can be connected later from Settings.
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void loadStatus()}
                disabled={isChecking || isInstalling}
                className="rounded-md border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isChecking ? 'Checking...' : 'Refresh'}
              </button>
              {!isInstalled && (
                <button
                  type="button"
                  onClick={() => void startInstall()}
                  disabled={isInstalling}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isInstalling && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isInstalling ? 'Installing...' : 'Install'}
                </button>
              )}
            </div>
          </div>

          {installError && (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
              {installError}
            </div>
          )}

          {installLogs.length > 0 && (
            <pre className="max-h-48 overflow-auto rounded-md bg-black p-3 text-xs leading-5 text-green-200">
              {installLogs.map((entry) => `${entry.stream}> ${entry.chunk}`).join('')}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
