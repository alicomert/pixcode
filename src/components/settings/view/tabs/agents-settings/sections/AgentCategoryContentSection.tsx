import type { AgentCategoryContentSectionProps } from '../types';
import { McpServers } from '../../../../../mcp';

import AccountContent from './content/AccountContent';
import PermissionsContent from './content/PermissionsContent';

export default function AgentCategoryContentSection({
  selectedAgent,
  selectedCategory,
  agentContextById,
  claudePermissions,
  onClaudePermissionsChange,
  cursorPermissions,
  onCursorPermissionsChange,
  codexPermissionMode,
  onCodexPermissionModeChange,
  projects,
}: AgentCategoryContentSectionProps) {
  return (
    <div className="flex-1 overflow-y-auto p-3 md:p-4">
      {selectedCategory === 'account' && (
        <AccountContent
          agent={selectedAgent}
          authStatus={agentContextById[selectedAgent].authStatus}
          onLogin={agentContextById[selectedAgent].onLogin}
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
        Gemini + Qwen Code route permission decisions through their CLI
        (the in-TUI /permissions screen and the --approval-mode flag) — we
        don't own that state, so rather than show a blank tab we link users
        out to the CLI command.
      */}
      {selectedCategory === 'permissions' && (selectedAgent === 'gemini' || selectedAgent === 'qwen') && (
        <div className="mx-auto max-w-lg space-y-3 py-6 text-sm text-muted-foreground">
          <div className="text-base font-medium text-foreground">
            {selectedAgent === 'qwen' ? 'Qwen Code' : 'Gemini'} permissions are managed by the CLI
          </div>
          <p>
            Approval mode and tool allow-lists for {selectedAgent === 'qwen' ? 'Qwen Code' : 'Gemini'} live inside the CLI itself.
          </p>
          <div className="rounded-md border border-border/60 bg-muted/40 p-3">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Inside the CLI
            </div>
            <code className="block font-mono text-sm text-foreground">/permissions</code>
          </div>
          <div className="rounded-md border border-border/60 bg-muted/40 p-3">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Via flags (per-session)
            </div>
            <code className="block font-mono text-sm text-foreground">
              {selectedAgent === 'qwen' ? 'qwen' : 'gemini'} --approval-mode auto-edit|plan|yolo
            </code>
          </div>
          <p className="text-xs">
            Pixcode passes <code className="rounded bg-muted px-1 font-mono">permissionMode</code> from the composer footer
            to every chat message, so you can toggle per-session without opening the CLI.
          </p>
        </div>
      )}

      {selectedCategory === 'mcp' && (
        <McpServers
          selectedProvider={selectedAgent}
          currentProjects={projects}
        />
      )}
    </div>
  );
}
