import { useCallback, useEffect, useState } from 'react';

import { authenticatedFetch } from '../../utils/api';

export type OrchestrationTask = {
  id: string;
  a2aTaskId?: string;
  projectId: string;
  title: string;
  description?: string;
  state: 'todo' | 'in_progress' | 'in_review' | 'done' | 'failed' | 'canceled';
  adapterId?: string;
  adapterSelector?: string;
  workspaceKind?: 'host' | 'worktree' | 'docker';
  workspacePath?: string;
  createdAt: number;
  updatedAt: number;
};

export type AgentCard = {
  name: string;
  skills: Array<{ id: string; description: string }>;
};

export function useOrchestrationTasks(projectId = 'default') {
  const [tasks, setTasks] = useState<OrchestrationTask[]>([]);
  const [agents, setAgents] = useState<AgentCard[]>([]);

  const refresh = useCallback(async () => {
    const response = await authenticatedFetch(`/api/orchestration/tasks?projectId=${encodeURIComponent(projectId)}`);
    if (response.ok) {
      const data = await response.json() as { tasks: OrchestrationTask[] };
      setTasks(data.tasks);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    void authenticatedFetch('/a2a/agents')
      .then((response) => response.ok ? response.json() : Promise.resolve({ agents: [] }))
      .then((data: { agents?: AgentCard[] }) => setAgents(data.agents ?? []));
  }, []);

  const createTask = useCallback(async (title: string, description: string) => {
    const response = await authenticatedFetch('/api/orchestration/tasks', {
      method: 'POST',
      body: JSON.stringify({ projectId, title, description }),
    });
    if (!response.ok) throw new Error('Failed to create orchestration task');
    await refresh();
  }, [projectId, refresh]);

  const dispatchTask = useCallback(async (taskId: string, adapterId: string, isolation: string) => {
    const response = await authenticatedFetch(`/api/orchestration/tasks/${encodeURIComponent(taskId)}/dispatch`, {
      method: 'POST',
      body: JSON.stringify({ adapterId, isolation }),
    });
    if (!response.ok) throw new Error('Failed to dispatch orchestration task');
    await refresh();
  }, [refresh]);

  const cancelTask = useCallback(async (taskId: string) => {
    await authenticatedFetch(`/api/orchestration/tasks/${encodeURIComponent(taskId)}/cancel`, {
      method: 'POST',
    });
    await refresh();
  }, [refresh]);

  return {
    tasks,
    agents,
    refresh,
    createTask,
    dispatchTask,
    cancelTask,
  };
}
