// Task system hook — manages task state and API calls
import { useState, useEffect, useCallback, useRef } from 'react';
import { authenticatedFetch } from '../utils/api';

export interface Task {
  id: string;
  projectId: string;
  title: string;
  prompt: string;
  status: 'PENDING' | 'QUEUED' | 'RUNNING' | 'AWAITING_INPUT' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  agentType: 'claude-code' | 'codex' | 'gemini' | 'qwen' | 'opencode';
  model?: string;
  role: string;
  priority: string;
  predecessorTaskId?: string;
  continueSession?: boolean;
  sessionId?: string;
  maxBudgetUsd?: number;
  costUsd?: number;
  tokenCount?: { input: number; output: number };
  branchName?: string;
  worktreePath?: string;
  result?: string;
  summary?: string;
  changedFiles?: string[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface TaskLog {
  id: string;
  taskId: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: string;
}

export interface TaskInteraction {
  id: string;
  taskId: string;
  question: string;
  options?: string[];
  answer?: string;
  status: 'pending' | 'answered' | 'timeout';
  createdAt: string;
}

export interface RoleInfo {
  value: string;
  label: string;
  description: string;
  defaultAgent: string;
}

export interface AgentInfo {
  value: string;
  label: string;
  provider: string;
}

export function useTasks(projectId?: string) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const url = projectId
        ? `/api/tasks?projectId=${encodeURIComponent(projectId)}`
        : '/api/tasks?limit=50';
      const res = await authenticatedFetch(url);
      if (!res.ok) throw new Error('Failed to fetch tasks');
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchTasks();
    // Poll every 5 seconds as fallback
    const pollInterval = setInterval(fetchTasks, 5000);
    return () => clearInterval(pollInterval);
  }, [fetchTasks]);

  // SSE event stream for real-time updates
  useEffect(() => {
    try {
      const es = new EventSource('/api/tasks/events');
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'task:status' || data.type === 'task:completed' || data.type === 'task:failed') {
            fetchTasks();
          }
        } catch {}
      };

      es.onerror = () => {
        // SSE will auto-reconnect
      };

      return () => {
        es.close();
        eventSourceRef.current = null;
      };
    } catch {
      // SSE not available — polling will handle it
    }
  }, [fetchTasks]);

  const createTask = useCallback(async (input: {
    projectId: string;
    title: string;
    prompt: string;
    agentType: string;
    model?: string;
    role?: string;
    priority?: string;
    predecessorTaskId?: string;
    continueSession?: boolean;
    maxBudgetUsd?: number;
    thinkingEnabled?: boolean;
    permissionMode?: string;
  }): Promise<Task> => {
    const res = await authenticatedFetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error('Failed to create task');
    const data = await res.json();
    fetchTasks();
    return data.task;
  }, [fetchTasks]);

  const cancelTask = useCallback(async (taskId: string): Promise<void> => {
    await authenticatedFetch(`/api/tasks/${taskId}/cancel`, { method: 'POST' });
    fetchTasks();
  }, [fetchTasks]);

  const deleteTask = useCallback(async (taskId: string): Promise<void> => {
    await authenticatedFetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    fetchTasks();
  }, [fetchTasks]);

  const getTaskLogs = useCallback(async (taskId: string): Promise<TaskLog[]> => {
    const res = await authenticatedFetch(`/api/tasks/${taskId}/logs`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.logs || [];
  }, []);

  const getTaskInteractions = useCallback(async (taskId: string): Promise<TaskInteraction[]> => {
    const res = await authenticatedFetch(`/api/tasks/${taskId}/interactions`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.interactions || [];
  }, []);

  const answerInteraction = useCallback(async (interactionId: string, answer: string): Promise<void> => {
    await authenticatedFetch(`/api/tasks/interactions/${interactionId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer }),
    });
  }, []);

  return {
    tasks,
    loading,
    error,
    createTask,
    cancelTask,
    deleteTask,
    getTaskLogs,
    getTaskInteractions,
    answerInteraction,
    refresh: fetchTasks,
  };
}

export function useTaskMeta() {
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);

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

  return { roles, agents };
}
