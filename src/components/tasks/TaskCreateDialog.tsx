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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-white/10 bg-[#1a1a2e]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#1a1a2e] p-4">
          <h2 className="text-lg font-semibold text-white">New Task</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white">✕</button>
        </div>

        <div className="space-y-4 p-4">
          {predecessorTitle && (
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-blue-200">
              Follow-up to: <strong>{predecessorTitle}</strong>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="mb-1 block text-sm text-gray-400">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Add user authentication API"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
            />
          </div>

          {/* Prompt */}
          <div>
            <label className="mb-1 block text-sm text-gray-400">Prompt *</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what you want the agent to do..."
              rows={5}
              className="w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
            />
          </div>

          {/* Agent + Role */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm text-gray-400">CLI Agent</label>
              <select
                value={agentType}
                onChange={(e) => setAgentType(e.target.value as AgentType)}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
              >
                {agents.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-400">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as TaskRole)}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
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
              <label className="mb-1 block text-sm text-gray-400">Model (optional)</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. claude-sonnet-4-20250514"
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-400">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
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
              <label className="mb-1 block text-sm text-gray-400">Max Budget USD (optional)</label>
              <input
                type="number"
                step="0.01"
                value={maxBudgetUsd}
                onChange={(e) => setMaxBudgetUsd(e.target.value)}
                placeholder="e.g. 1.00"
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
              />
            </div>
            <div className="flex flex-col gap-2 pt-6">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={thinkingEnabled}
                  onChange={(e) => setThinkingEnabled(e.target.checked)}
                  className="accent-blue-500"
                />
                Enable thinking/reasoning
              </label>
              {predecessorId && (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-300">
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
        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-white/10 bg-[#1a1a2e] p-4">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:bg-white/10 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title || !prompt || creating}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-600"
          >
            {creating ? 'Creating...' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  );
}
