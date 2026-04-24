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

      {/*
        OpenCode's permissions are JSON-expression based (per-tool × per-pattern,
        with `ask|allow|deny` per rule plus `external_directory` allow-lists).
        A 2/3-mode toggle would be a lossy abstraction, so we direct users to
        the Configuration tab to hand-edit `opencode.json` — the source of
        truth for OpenCode's approval flow.
      */}
      {selectedCategory === 'permissions' && selectedAgent === 'opencode' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-teal-200 bg-teal-50 p-4 dark:border-teal-800 dark:bg-teal-900/20">
            <h3 className="mb-1 text-base font-semibold text-teal-900 dark:text-teal-100">
              OpenCode uses fine-grained permissions
            </h3>
            <p className="text-sm text-teal-800 dark:text-teal-200">
              OpenCode lets you control approvals per tool (edit / bash /
              webfetch) and per command pattern (e.g. allow <code className="rounded bg-teal-100 px-1 dark:bg-teal-800">git *</code> but
              deny <code className="rounded bg-teal-100 px-1 dark:bg-teal-800">git push *</code>). Those rules live inside <code className="rounded bg-teal-100 px-1 dark:bg-teal-800">opencode.json</code>.
            </p>
            <p className="mt-3 text-sm text-teal-800 dark:text-teal-200">
              Switch to the <strong>Configuration</strong> tab above to edit
              <code className="mx-1 rounded bg-teal-100 px-1 dark:bg-teal-800">opencode.json</code>
              directly. Pixcode's editor has JSON syntax highlighting and
              saves changes to your home directory.
            </p>
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
            <h4 className="mb-2 text-sm font-semibold text-foreground">Quick reference</h4>
            <pre className="overflow-x-auto text-xs text-foreground/80">{`{
  "permission": {
    "edit": "ask",
    "bash": {
      "*": "ask",
      "git *": "allow",
      "git push *": "deny"
    },
    "external_directory": {
      "~/projects/personal/": "allow"
    }
  }
}`}</pre>
          </div>
        </div>
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
