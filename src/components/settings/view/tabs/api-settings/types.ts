export type ApiKeyItem = {
  id: string;
  key_name: string;
  api_key: string;
  scopes?: string[];
  created_at: string;
  last_used?: string | null;
  is_active: boolean;
};

export type CreatedApiKey = {
  id: string;
  keyName: string;
  apiKey: string;
  scopes?: string[];
  createdAt?: string;
};

/**
 * Scopes exposed by the public API manifest. Keep this list in the UI so a
 * newly-created key is useful immediately while the server remains the final
 * authority (including its admin/system scope checks).
 */
export const API_KEY_SCOPE_OPTIONS = [
  { id: 'auth:read', labelKey: 'apiKeys.scopes.authRead', defaultLabel: 'Authentication: read' },
  { id: 'auth:write', labelKey: 'apiKeys.scopes.authWrite', defaultLabel: 'Authentication: write' },
  { id: 'projects:read', labelKey: 'apiKeys.scopes.projectsRead', defaultLabel: 'Projects: read' },
  { id: 'projects:write', labelKey: 'apiKeys.scopes.projectsWrite', defaultLabel: 'Projects: write' },
  { id: 'tasks:read', labelKey: 'apiKeys.scopes.tasksRead', defaultLabel: 'Tasks: read' },
  { id: 'tasks:write', labelKey: 'apiKeys.scopes.tasksWrite', defaultLabel: 'Tasks: write' },
  { id: 'sessions:read', labelKey: 'apiKeys.scopes.sessionsRead', defaultLabel: 'Sessions: read' },
  { id: 'sessions:write', labelKey: 'apiKeys.scopes.sessionsWrite', defaultLabel: 'Sessions: write' },
  { id: 'providers:read', labelKey: 'apiKeys.scopes.providersRead', defaultLabel: 'Providers: read' },
  { id: 'providers:write', labelKey: 'apiKeys.scopes.providersWrite', defaultLabel: 'Providers: write' },
  { id: 'terminal:launch', labelKey: 'apiKeys.scopes.terminalLaunch', defaultLabel: 'Terminal: launch' },
  { id: 'files:read', labelKey: 'apiKeys.scopes.filesRead', defaultLabel: 'Files: read' },
  { id: 'files:write', labelKey: 'apiKeys.scopes.filesWrite', defaultLabel: 'Files: write' },
  { id: 'git:read', labelKey: 'apiKeys.scopes.gitRead', defaultLabel: 'Git: read' },
  { id: 'git:write', labelKey: 'apiKeys.scopes.gitWrite', defaultLabel: 'Git: write' },
  { id: 'telegram:read', labelKey: 'apiKeys.scopes.telegramRead', defaultLabel: 'Telegram: read' },
  { id: 'telegram:write', labelKey: 'apiKeys.scopes.telegramWrite', defaultLabel: 'Telegram: write' },
  { id: 'notifications:read', labelKey: 'apiKeys.scopes.notificationsRead', defaultLabel: 'Notifications: read' },
  { id: 'notifications:write', labelKey: 'apiKeys.scopes.notificationsWrite', defaultLabel: 'Notifications: write' },
  { id: 'agent:run', labelKey: 'apiKeys.scopes.agentRun', defaultLabel: 'Agent: run' },
  { id: 'settings:read', labelKey: 'apiKeys.scopes.settingsRead', defaultLabel: 'Settings: read' },
  { id: 'settings:write', labelKey: 'apiKeys.scopes.settingsWrite', defaultLabel: 'Settings: write' },
  { id: 'diagnostics:read', labelKey: 'apiKeys.scopes.diagnosticsRead', defaultLabel: 'Diagnostics: read' },
  { id: 'diagnostics:write', labelKey: 'apiKeys.scopes.diagnosticsWrite', defaultLabel: 'Diagnostics: write' },
  { id: 'remote:read', labelKey: 'apiKeys.scopes.remoteRead', defaultLabel: 'Remote: read' },
  { id: 'remote:write', labelKey: 'apiKeys.scopes.remoteWrite', defaultLabel: 'Remote: write' },
  { id: 'webhooks:read', labelKey: 'apiKeys.scopes.webhooksRead', defaultLabel: 'Webhooks: read' },
  { id: 'webhooks:write', labelKey: 'apiKeys.scopes.webhooksWrite', defaultLabel: 'Webhooks: write' },
  { id: 'plugins:read', labelKey: 'apiKeys.scopes.pluginsRead', defaultLabel: 'Plugins: read' },
  { id: 'plugins:write', labelKey: 'apiKeys.scopes.pluginsWrite', defaultLabel: 'Plugins: write' },
  { id: 'orchestration:read', labelKey: 'apiKeys.scopes.orchestrationRead', defaultLabel: 'Orchestration: read' },
  { id: 'orchestration:write', labelKey: 'apiKeys.scopes.orchestrationWrite', defaultLabel: 'Orchestration: write' },
] as const;

export const API_KEY_ELEVATED_SCOPE_OPTIONS = [
  { id: '*', labelKey: 'apiKeys.scopes.all', defaultLabel: 'All access' },
  { id: 'admin', labelKey: 'apiKeys.scopes.admin', defaultLabel: 'Admin' },
  { id: 'system', labelKey: 'apiKeys.scopes.system', defaultLabel: 'System' },
  { id: 'system:update', labelKey: 'apiKeys.scopes.systemUpdate', defaultLabel: 'System: update' },
  { id: 'system:restart', labelKey: 'apiKeys.scopes.systemRestart', defaultLabel: 'System: restart' },
] as const;

export type ApiKeyScope =
  | typeof API_KEY_SCOPE_OPTIONS[number]['id']
  | typeof API_KEY_ELEVATED_SCOPE_OPTIONS[number]['id'];

export const DEFAULT_API_KEY_SCOPES = [
  'projects:read',
  'projects:write',
  'tasks:read',
  'tasks:write',
] as const;

export type GithubCredentialItem = {
  id: string;
  credential_name: string;
  description?: string | null;
  created_at: string;
  is_active: boolean;
};

export type ApiKeysResponse = {
  apiKeys?: ApiKeyItem[];
  success?: boolean;
  error?: string;
  apiKey?: CreatedApiKey;
};

export type GithubCredentialsResponse = {
  credentials?: GithubCredentialItem[];
  success?: boolean;
  error?: string;
};
