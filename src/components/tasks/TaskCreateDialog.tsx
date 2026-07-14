import { useState, useEffect } from 'react';

import { useTranslation } from 'react-i18next';
import { authenticatedFetch } from '../../utils/api';
import type { AgentType, TaskRole, TaskPriority, RoleInfo, AgentInfo } from './types';

interface TaskCreateDialogProps {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
  predecessorTitle?: string;
  predecessorId?: string;
}

export function TaskCreateDialog({ projectId, onClose, onCreated, predecessorTitle, predecessorId }: TaskCreateDialogProps) {
  const _t = useTranslation('common');
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [agentType, setAgentType] = useState<AgentType>('claude-code');
  const [model, setModel] = useState('');
  const [role, setRole] = useState<TaskRole>('fullstack');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [maxBudgetUsd, setMaxBudgetUsd] = useState('');
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [continueSession, setContinueSession] = useState(!!predecessorId);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    authenticatedFetch('/api/tasks/meta/roles')
      .then((r) => r.json())
      .then((d) => setRoles(d.roles || []))
      .catch(() => {});
    authenticatedFetch('/api/tasks/meta/agents')
      .then((r) => r.json())
      .then((d) => setAgents(d.agents || []))
      .catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (!title || !prompt) return;
    setCreating(true);
    try {
      await authenticatedFetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          title,
          prompt,
          agentType,
          model: model || undefined,
          role,
          priority,
          maxBudgetUsd: maxBudgetUsd ? parseFloat(maxBudgetUsd) : undefined,
          thinkingEnabled,
          continueSession,
          predecessorTaskId: predecessorId,
        }),
      });
      onCreated();
      onClose();
    } catch (err) {
      console.error('Failed to create task:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a1a2e] border border-white/10 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-white/10 sticky top-0 bg-[#1a1a2e] z-10">
          <h2 className="text-lg font-semibold text-white">New Task</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-2">✕</button>
        </div>

        <div className="p-4 space-y-4">
          {predecessorTitle && (
            <div className="bg-blue-500/10 border border-blue-500/30 p-3 rounded-lg text-sm text-blue-200">
              Follow-up to: <strong>{predecessorTitle}</strong>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Add user authentication API"
              className="w-full bg-black/30 text-white text-sm px-3 py-2 rounded-lg border border-white/10 focus:border-blue-500/50 outline-none"
            />
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Prompt *</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what you want the agent to do..."
              rows={5}
              className="w-full bg-black/30 text-white text-sm px-3 py-2 rounded-lg border border-white/10 focus:border-blue-500/50 outline-none resize-y"
            />
          </div>

          {/* Agent + Role */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">CLI Agent</label>
              <select
                value={agentType}
                onChange={(e) => setAgentType(e.target.value as AgentType)}
                className="w-full bg-black/30 text-white text-sm px-3 py-2 rounded-lg border border-white/10 outline-none"
              >
                {agents.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as TaskRole)}
                className="w-full bg-black/30 text-white text-sm px-3 py-2 rounded-lg border border-white/10 outline-none"
              >
                {roles.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Model + Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Model (optional)</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. claude-sonnet-4-20250514"
                className="w-full bg-black/30 text-white text-sm px-3 py-2 rounded-lg border border-white/10 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full bg-black/30 text-white text-sm px-3 py-2 rounded-lg border border-white/10 outline-none"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          {/* Budget + Thinking */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Max Budget USD (optional)</label>
              <input
                type="number"
                step="0.01"
                value={maxBudgetUsd}
                onChange={(e) => setMaxBudgetUsd(e.target.value)}
                placeholder="e.g. 1.00"
                className="w-full bg-black/30 text-white text-sm px-3 py-2 rounded-lg border border-white/10 outline-none"
              />
            </div>
            <div className="flex flex-col gap-2 pt-6">
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={thinkingEnabled}
                  onChange={(e) => setThinkingEnabled(e.target.checked)}
                  className="accent-blue-500"
                />
                Enable thinking/reasoning
              </label>
              {predecessorId && (
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={continueSession}
                    onChange={(e) => setContinueSession(e.target.checked)}
                    className="accent-blue-500"
                  />
                  Continue predecessor session
                </label>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t border-white/10 sticky bottom-0 bg-[#1a1a2e]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white rounded-lg hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title || !prompt || creating}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg"
          >
            {creating ? 'Creating...' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  );
}
