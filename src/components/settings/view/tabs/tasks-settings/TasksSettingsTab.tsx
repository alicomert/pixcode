import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useTasksSettings } from '../../../../../contexts/TasksSettingsContext';
import { authenticatedFetch } from '../../../../../utils/api';
import SettingsCard from '../../SettingsCard';
import SettingsRow from '../../SettingsRow';
import SettingsSection from '../../SettingsSection';
import SettingsToggle from '../../SettingsToggle';

import { ExternalLink, Key, Loader2, RefreshCw, Save } from '@/lib/icons';

type TaskMasterInstallationPayload = {
  installation?: {
    isInstalled?: boolean;
    version?: string | null;
    reason?: string | null;
    binary?: string | null;
    installPath?: string | null;
  };
  mcpServer?: {
    hasMCPServer?: boolean;
    reason?: string | null;
  };
  isReady?: boolean;
};

type TasksSettingsContextValue = {
  tasksEnabled: boolean;
  setTasksEnabled: (enabled: boolean) => void;
  isTaskMasterInstalled: boolean | null;
  isCheckingInstallation: boolean;
  installationStatus: TaskMasterInstallationPayload | null;
  refreshTaskMasterInstallation: () => Promise<void>;
};

type TaskMasterConfigField = {
  hasValue?: boolean;
  value?: string;
  updatedAt?: string | null;
};

type TaskMasterConfigResponse = {
  success?: boolean;
  config?: {
    fields?: Record<string, TaskMasterConfigField>;
    updatedAt?: string | null;
  };
  error?: string;
  message?: string;
};

type ConfigFieldDefinition = {
  id: string;
  envName: string;
  label: string;
  description: string;
  secret: boolean;
  placeholder: string;
};

const CONFIG_FIELDS: ConfigFieldDefinition[] = [
  {
    id: 'anthropicApiKey',
    envName: 'ANTHROPIC_API_KEY',
    label: 'Anthropic',
    description: 'Recommended primary key for TaskMaster planning and task expansion.',
    secret: true,
    placeholder: 'sk-ant-...',
  },
  {
    id: 'anthropicBaseUrl',
    envName: 'ANTHROPIC_BASE_URL',
    label: 'Anthropic API URL',
    description: 'Optional custom Anthropic-compatible endpoint.',
    secret: false,
    placeholder: 'https://api.anthropic.com',
  },
  {
    id: 'perplexityApiKey',
    envName: 'PERPLEXITY_API_KEY',
    label: 'Perplexity',
    description: 'Recommended for TaskMaster research-backed task generation.',
    secret: true,
    placeholder: 'pplx-...',
  },
  {
    id: 'openaiApiKey',
    envName: 'OPENAI_API_KEY',
    label: 'OpenAI',
    description: 'Optional OpenAI-compatible provider key.',
    secret: true,
    placeholder: 'sk-...',
  },
  {
    id: 'openaiBaseUrl',
    envName: 'OPENAI_BASE_URL',
    label: 'OpenAI API URL',
    description: 'Optional custom OpenAI-compatible base URL.',
    secret: false,
    placeholder: 'https://api.openai.com/v1',
  },
  {
    id: 'googleApiKey',
    envName: 'GOOGLE_API_KEY / GEMINI_API_KEY',
    label: 'Google Gemini',
    description: 'Optional Gemini provider key.',
    secret: true,
    placeholder: 'AIza...',
  },
  {
    id: 'openrouterApiKey',
    envName: 'OPENROUTER_API_KEY',
    label: 'OpenRouter',
    description: 'Optional OpenRouter provider key.',
    secret: true,
    placeholder: 'sk-or-...',
  },
  {
    id: 'azureOpenaiApiKey',
    envName: 'AZURE_OPENAI_API_KEY',
    label: 'Azure OpenAI',
    description: 'Optional Azure OpenAI key.',
    secret: true,
    placeholder: 'Azure OpenAI key',
  },
  {
    id: 'azureOpenaiEndpoint',
    envName: 'AZURE_OPENAI_ENDPOINT',
    label: 'Azure OpenAI URL',
    description: 'Azure resource endpoint used with AZURE_OPENAI_API_KEY.',
    secret: false,
    placeholder: 'https://resource.openai.azure.com',
  },
  {
    id: 'ollamaBaseUrl',
    envName: 'OLLAMA_BASE_URL',
    label: 'Ollama URL',
    description: 'Optional local Ollama endpoint.',
    secret: false,
    placeholder: 'http://127.0.0.1:11434',
  },
];

const createEmptyInputs = () => Object.fromEntries(CONFIG_FIELDS.map((field) => [field.id, '']));

export default function TasksSettingsTab() {
  const { t } = useTranslation('settings');
  const {
    tasksEnabled,
    setTasksEnabled,
    isTaskMasterInstalled,
    isCheckingInstallation,
    installationStatus,
    refreshTaskMasterInstallation,
  } = useTasksSettings() as TasksSettingsContextValue;

  const [configFields, setConfigFields] = useState<Record<string, TaskMasterConfigField>>({});
  const [configInputs, setConfigInputs] = useState<Record<string, string>>(() => createEmptyInputs());
  const [isConfigLoading, setIsConfigLoading] = useState(true);
  const [isConfigSaving, setIsConfigSaving] = useState(false);
  const [configMessage, setConfigMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const installedVersion = installationStatus?.installation?.version;
  const installedBinary = installationStatus?.installation?.binary;
  const installPath = installationStatus?.installation?.installPath;
  const mcpConfigured = Boolean(installationStatus?.mcpServer?.hasMCPServer);

  const loadConfig = useCallback(async () => {
    setIsConfigLoading(true);
    setConfigMessage(null);
    try {
      const response = await authenticatedFetch('/api/taskmaster/config');
      const payload = (await response.json()) as TaskMasterConfigResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || payload.message || 'TaskMaster configuration could not be loaded.');
      }

      const fields = payload.config?.fields || {};
      setConfigFields(fields);
      setConfigInputs(() => Object.fromEntries(CONFIG_FIELDS.map((field) => [
        field.id,
        field.secret ? '' : fields[field.id]?.value || '',
      ])));
    } catch (error) {
      setConfigMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'TaskMaster configuration could not be loaded.',
      });
    } finally {
      setIsConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const savedKeysCount = useMemo(
    () => CONFIG_FIELDS.filter((field) => configFields[field.id]?.hasValue).length,
    [configFields],
  );

  const handleSaveConfig = useCallback(async () => {
    setIsConfigSaving(true);
    setConfigMessage(null);
    try {
      const payload: Record<string, string> = {};
      for (const field of CONFIG_FIELDS) {
        const value = configInputs[field.id]?.trim() || '';
        if (field.secret) {
          if (value) {
            payload[field.id] = value;
          }
        } else {
          payload[field.id] = value;
        }
      }

      const response = await authenticatedFetch('/api/taskmaster/config', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as TaskMasterConfigResponse;
      if (!response.ok || !data.success) {
        throw new Error(data.error || data.message || 'TaskMaster configuration could not be saved.');
      }

      const fields = data.config?.fields || {};
      setConfigFields(fields);
      setConfigInputs(() => Object.fromEntries(CONFIG_FIELDS.map((field) => [
        field.id,
        field.secret ? '' : fields[field.id]?.value || '',
      ])));
      setConfigMessage({ type: 'success', text: 'TaskMaster API settings saved.' });
      await refreshTaskMasterInstallation();
    } catch (error) {
      setConfigMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'TaskMaster configuration could not be saved.',
      });
    } finally {
      setIsConfigSaving(false);
    }
  }, [configInputs, refreshTaskMasterInstallation]);

  const handleRefresh = useCallback(async () => {
    await refreshTaskMasterInstallation();
    await loadConfig();
  }, [loadConfig, refreshTaskMasterInstallation]);

  return (
    <div className="space-y-8">
      <SettingsSection title={t('mainTabs.tasks')}>
        <div className="space-y-4">
          <SettingsCard className="p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold text-foreground">TaskMaster CLI</div>
                  {isCheckingInstallation ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {t('tasks.checking')}
                    </span>
                  ) : isTaskMasterInstalled ? (
                    <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                      Installed
                    </span>
                  ) : (
                    <span className="rounded-full border border-orange-300 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-300">
                      Not found
                    </span>
                  )}
                  {savedKeysCount > 0 && (
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                      {savedKeysCount} saved API setting{savedKeysCount === 1 ? '' : 's'}
                    </span>
                  )}
                </div>

                <p className="text-sm leading-6 text-muted-foreground">
                  {isTaskMasterInstalled
                    ? `${installedBinary || 'task-master'} ${installedVersion ? `(${installedVersion})` : ''} is available${installPath ? ` at ${installPath}` : ''}.`
                    : installationStatus?.installation?.reason || t('tasks.notInstalled.description')}
                </p>

                {isTaskMasterInstalled && !mcpConfigured && (
                  <p className="text-xs leading-5 text-amber-600 dark:text-amber-400">
                    MCP is not required to unlock the Tasks tab. It can be connected later if you want TaskMaster MCP tools.
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={isCheckingInstallation || isConfigLoading}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${isCheckingInstallation || isConfigLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </SettingsCard>

          {!isTaskMasterInstalled && !isCheckingInstallation && (
            <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 dark:border-orange-800/50 dark:bg-orange-950/30">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/50">
                  <Key className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="flex-1">
                  <div className="mb-2 font-medium text-orange-900 dark:text-orange-100">
                    {t('tasks.notInstalled.title')}
                  </div>
                  <div className="space-y-3 text-sm text-orange-800 dark:text-orange-200">
                    <p>{t('tasks.notInstalled.description')}</p>

                    <div className="rounded-lg bg-orange-100 p-3 font-mono text-sm dark:bg-orange-900/40">
                      <code>{t('tasks.notInstalled.installCommand')}</code>
                    </div>

                    <a
                      href="https://github.com/eyaltoledano/claude-task-master"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      {t('tasks.notInstalled.viewOnGitHub')}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {isTaskMasterInstalled && (
            <SettingsCard>
              <SettingsRow
                label={t('tasks.settings.enableLabel')}
                description={t('tasks.settings.enableDescription')}
              >
                <SettingsToggle
                  checked={tasksEnabled}
                  onChange={setTasksEnabled}
                  ariaLabel={t('tasks.settings.enableLabel')}
                />
              </SettingsRow>
            </SettingsCard>
          )}

          <SettingsCard className="p-4">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-foreground">TaskMaster API keys and URLs</div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Save provider environment values once. Pixcode injects them into TaskMaster CLI commands without exposing secret values back to the UI.
                </p>
              </div>
              <a
                href="https://docs.task-master.dev/getting-started/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Docs
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {CONFIG_FIELDS.map((field) => {
                const saved = Boolean(configFields[field.id]?.hasValue);
                return (
                  <label key={field.id} className="space-y-1.5 rounded-lg border border-border/70 bg-background/40 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground">{field.label}</div>
                        <div className="mt-0.5 font-mono text-xs text-muted-foreground">{field.envName}</div>
                      </div>
                      {saved && (
                        <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                          Saved
                        </span>
                      )}
                    </div>
                    <p className="text-xs leading-5 text-muted-foreground">{field.description}</p>
                    <input
                      type={field.secret ? 'password' : 'text'}
                      value={configInputs[field.id] || ''}
                      onChange={(event) => setConfigInputs((current) => ({
                        ...current,
                        [field.id]: event.target.value,
                      }))}
                      placeholder={field.secret && saved ? 'Saved - enter a new value to replace' : field.placeholder}
                      autoComplete="off"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </label>
                );
              })}
            </div>

            {configMessage && (
              <div className={`mt-4 rounded-md border p-3 text-sm ${
                configMessage.type === 'success'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                  : 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300'
              }`}
              >
                {configMessage.text}
              </div>
            )}

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-muted-foreground">
                Blank secret fields are preserved on save. Blank URL fields clear the saved URL.
              </p>
              <button
                type="button"
                onClick={() => void handleSaveConfig()}
                disabled={isConfigLoading || isConfigSaving}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isConfigSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save TaskMaster settings
              </button>
            </div>
          </SettingsCard>
        </div>
      </SettingsSection>
    </div>
  );
}
