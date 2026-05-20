import type {
  AgentProvider,
  AuthStatus,
  AgentCategory,
  ClaudePermissionsState,
  CursorPermissionsState,
  CodexPermissionMode,
  GeminiPermissionMode,
  OpencodePermissionsState,
  QwenPermissionMode,
  SettingsProject,
} from '../../../types/types';
import type { LLMProvider } from '../../../../../types/app';

export type AgentContext = {
  authStatus: AuthStatus;
  onLogin: () => void;
};

export type AgentContextByProvider = Record<AgentProvider, AgentContext>;
export type ProviderAuthStatusByProvider = Record<LLMProvider, AuthStatus>;

export type AgentsSettingsTabProps = {
  providerAuthStatus: ProviderAuthStatusByProvider;
  onProviderLogin: (provider: AgentProvider) => void;
  /** Re-check auth/install state for a specific provider (used by
   *  AccountContent to refresh immediately after a successful install). */
  onRefreshProviderAuth?: (provider: AgentProvider) => Promise<void>;
  onRefreshAllProviderAuth?: () => Promise<void>;
  claudePermissions: ClaudePermissionsState;
  onClaudePermissionsChange: (value: ClaudePermissionsState) => void;
  cursorPermissions: CursorPermissionsState;
  onCursorPermissionsChange: (value: CursorPermissionsState) => void;
  codexPermissionMode: CodexPermissionMode;
  onCodexPermissionModeChange: (value: CodexPermissionMode) => void;
  geminiPermissionMode: GeminiPermissionMode;
  onGeminiPermissionModeChange: (value: GeminiPermissionMode) => void;
  qwenPermissionMode: QwenPermissionMode;
  onQwenPermissionModeChange: (value: QwenPermissionMode) => void;
  opencodePermissions: OpencodePermissionsState;
  onOpencodePermissionsChange: (value: OpencodePermissionsState) => void;
  projects: SettingsProject[];
};

export type AgentCategoryTabsSectionProps = {
  selectedCategory: AgentCategory;
  onSelectCategory: (category: AgentCategory) => void;
};

export type AgentSelectorSectionProps = {
  agents: AgentProvider[];
  selectedAgent: AgentProvider;
  onSelectAgent: (agent: AgentProvider) => void;
  agentContextById: AgentContextByProvider;
};

export type AgentCategoryContentSectionProps = {
  selectedAgent: AgentProvider;
  selectedCategory: AgentCategory;
  agentContextById: AgentContextByProvider;
  onRefreshProviderAuth?: (provider: AgentProvider) => Promise<void>;
  claudePermissions: ClaudePermissionsState;
  onClaudePermissionsChange: (value: ClaudePermissionsState) => void;
  cursorPermissions: CursorPermissionsState;
  onCursorPermissionsChange: (value: CursorPermissionsState) => void;
  codexPermissionMode: CodexPermissionMode;
  onCodexPermissionModeChange: (value: CodexPermissionMode) => void;
  geminiPermissionMode: GeminiPermissionMode;
  onGeminiPermissionModeChange: (value: GeminiPermissionMode) => void;
  qwenPermissionMode: QwenPermissionMode;
  onQwenPermissionModeChange: (value: QwenPermissionMode) => void;
  opencodePermissions: OpencodePermissionsState;
  onOpencodePermissionsChange: (value: OpencodePermissionsState) => void;
  projects: SettingsProject[];
};
