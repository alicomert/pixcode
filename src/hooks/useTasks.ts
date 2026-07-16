import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  AgentInfo,
  RoleInfo,
  Task,
  TaskInteraction,
  TaskLog,
  TaskPriority,
  TaskRecurrence,
  TaskRole,
} from '../components/tasks/types';
import { authenticatedFetch } from '../utils/api';

async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error === 'string'
      ? payload.error
      : payload?.error?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

export type CreateTaskInput = {
  projectId: string;
  title: string;
  prompt: string;
  agentType: string;
  model?: string;
  role?: TaskRole;
  priority?: TaskPriority;
  predecessorTaskId?: string;
  continueSession?: boolean;
  maxBudgetUsd?: number;
  thinkingEnabled?: boolean;
  permissionMode?: string;
  scheduledAt?: string;
  recurrence?: TaskRecurrence;
};

export function useTasks(projectId?: string) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchTasks = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const url = projectId
        ? `/api/tasks?projectId=${encodeURIComponent(projectId)}`
        : '/api/tasks?limit=100';
      const response = await authenticatedFetch(url, { cache: 'no-store' });
      const payload = await readResponse<{ tasks?: Task[] }>(response);
      setTasks(payload.tasks || []);
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void fetchTasks(true);
    const intervalId = window.setInterval(() => void fetchTasks(), 5000);
    return () => window.clearInterval(intervalId);
  }, [fetchTasks]);

  useEffect(() => {
    const token = window.localStorage.getItem('auth-token');
    if (!token) return undefined;

    const stream = new EventSource(`/api/tasks/events?token=${encodeURIComponent(token)}`);
    eventSourceRef.current = stream;
    stream.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (typeof payload?.type === 'string' && payload.type.startsWith('task:')) {
          void fetchTasks();
        }
      } catch {
        // Polling remains the fallback for malformed or proxy-buffered events.
      }
    };

    return () => {
      stream.close();
      eventSourceRef.current = null;
    };
  }, [fetchTasks]);

  const createTask = useCallback(async (input: CreateTaskInput): Promise<Task> => {
    const response = await authenticatedFetch('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const payload = await readResponse<{ task: Task }>(response);
    await fetchTasks();
    return payload.task;
  }, [fetchTasks]);

  const cancelTask = useCallback(async (taskId: string) => {
    const response = await authenticatedFetch(`/api/tasks/${taskId}/cancel`, { method: 'POST' });
    await readResponse(response);
    await fetchTasks();
  }, [fetchTasks]);

  const deleteTask = useCallback(async (taskId: string) => {
    const response = await authenticatedFetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    if (!response.ok) await readResponse(response);
    await fetchTasks();
  }, [fetchTasks]);

  const getTaskLogs = useCallback(async (taskId: string): Promise<TaskLog[]> => {
    const response = await authenticatedFetch(`/api/tasks/${taskId}/logs?limit=500`, { cache: 'no-store' });
    const payload = await readResponse<{ logs?: TaskLog[] }>(response);
    return payload.logs || [];
  }, []);

  const getTaskInteractions = useCallback(async (taskId: string): Promise<TaskInteraction[]> => {
    const response = await authenticatedFetch(`/api/tasks/${taskId}/interactions`, { cache: 'no-store' });
    const payload = await readResponse<{ interactions?: TaskInteraction[] }>(response);
    return payload.interactions || [];
  }, []);

  const answerInteraction = useCallback(async (interactionId: string, answer: string) => {
    const response = await authenticatedFetch(`/api/tasks/interactions/${interactionId}/answer`, {
      method: 'POST',
      body: JSON.stringify({ answer }),
    });
    await readResponse(response);
    await fetchTasks();
  }, [fetchTasks]);

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
    let cancelled = false;
    void Promise.all([
      authenticatedFetch('/api/tasks/meta/roles').then((response) => readResponse<{ roles?: RoleInfo[] }>(response)),
      authenticatedFetch('/api/tasks/meta/agents').then((response) => readResponse<{ agents?: AgentInfo[] }>(response)),
    ]).then(([rolePayload, agentPayload]) => {
      if (cancelled) return;
      setRoles(rolePayload.roles || []);
      setAgents(agentPayload.agents || []);
    }).catch(() => {
      // The create dialog has safe local defaults if metadata is unavailable.
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return { roles, agents };
}
