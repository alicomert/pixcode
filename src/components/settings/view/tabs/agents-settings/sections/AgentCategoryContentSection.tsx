import type { AgentCategoryContentSectionProps } from '../types';
import { McpServers } from '../../../../../mcp';

import AccountContent from './content/AccountContent';
import ConfigContent from './content/ConfigContent';
import PermissionsContent from './content/PermissionsContent';

export default function AgentCategoryContentSection({
  selectedAgent,
  selectedCategory,
  agentContextById,
  onRefreshProviderAuth,
  claudePermissions,
  onClaudePermissionsChange,
  cursorPermissions,
  onCursorPermissionsChange,
  codexPermissionMode,
  onCodexPermissionModeChange,
  geminiPermissionMode,
  onGeminiPermissionModeChange,
  qwenPermissionMode,
  onQwenPermissionModeChange,
  projects,
}: AgentCategoryContentSectionProps) {
  return (
    <div className="flex-1 overflow-y-auto p-3 md:p-4">
      {selectedCategory === 'account' && (
        <AccountContent
          agent={selectedAgent}
          authStatus={agentContextById[selectedAgent].authStatus}
          onLogin={agentContextById[selectedAgent].onLogin}
          onRefreshAuth={onRefreshProviderAuth ? () => onRefreshProviderAuth(selectedAgent) : undefined}
        />
      )}

      {selectedCategory === 'permissions' && selectedAgent === 'claude' && (
        <PermissionsContent
          agent="claude"
          skipPermissions={claudePermissions.skipPermissions}
          onSkipPermissionsChange={(value) => {
            onClaudePermissionsChange({ ...claudePermissions, skipPermissions: value });
          }}
          allowedTools={claudePermissions.allowedTools}
          onAllowedToolsChange={(value) => {
            onClaudePermissionsChange({ ...claudePermissions, allowedTools: value });
          }}
          disallowedTools={claudePermissions.disallowedTools}
          onDisallowedToolsChange={(value) => {
            onClaudePermissionsChange({ ...claudePermissions, disallowedTools: value });
          }}
        />
      )}

      {selectedCategory === 'permissions' && selectedAgent === 'cursor' && (
        <PermissionsContent
          agent="cursor"
          skipPermissions={cursorPermissions.skipPermissions}
          onSkipPermissionsChange={(value) => {
            onCursorPermissionsChange({ ...cursorPermissions, skipPermissions: value });
          }}
          allowedCommands={cursorPermissions.allowedCommands}
          onAllowedCommandsChange={(value) => {
            onCursorPermissionsChange({ ...cursorPermissions, allowedCommands: value });
          }}
          disallowedCommands={cursorPermissions.disallowedCommands}
          onDisallowedCommandsChange={(value) => {
            onCursorPermissionsChange({ ...cursorPermissions, disallowedCommands: value });
          }}
        />
      )}

      {selectedCategory === 'permissions' && selectedAgent === 'codex' && (
        <PermissionsContent
          agent="codex"
          permissionMode={codexPermissionMode}
          onPermissionModeChange={onCodexPermissionModeChange}
        />
      )}

      {/*
        Gemini and Qwen Code share the `default / auto_edit / yolo`
        approval-mode vocabulary. Pixcode persists the chosen mode in
        localStorage and passes it to every chat message via the composer
        footer's `permissionMode` field, so the CLI's /permissions screen
        is no longer the only way to configure this.
      */}
      {selectedCategory === 'permissions' && selectedAgent === 'gemini' && (
        <PermissionsContent
          agent="gemini"
          permissionMode={geminiPermissionMode}
          onPermissionModeChange={onGeminiPermissionModeChange}
        />
      )}

      {selectedCategory === 'permissions' && selectedAgent === 'qwen' && (
        <PermissionsContent
          agent="qwen"
          permissionMode={qwenPermissionMode}
          onPermissionModeChange={onQwenPermissionModeChange}
        />
      )}

      {selectedCategory === 'mcp' && (
        <McpServers
          selectedProvider={selectedAgent}
          currentProjects={projects}
        />
      )}

      {selectedCategory === 'config' && (
        <ConfigContent agent={selectedAgent} />
      )}
    </div>
  );
}
