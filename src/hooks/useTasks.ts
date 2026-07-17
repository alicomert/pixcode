import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  AgentInfo,
  BotConversation,
  BotCron,
  BotMessage,
  BotPlan,
  BotProposal,
  RoleInfo,
  ScheduledTask,
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
  dependsOnTaskIds?: string[];
  continueSession?: boolean;
  maxBudgetUsd?: number;
  thinkingEnabled?: boolean;
  permissionMode?: string;
  scheduledAt?: string;
  recurrence?: TaskRecurrence;
};

export function useTasks(projectId?: string) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [plans, setPlans] = useState<BotPlan[]>([]);
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
      const payload = await readResponse<{ tasks?: Task[]; plans?: BotPlan[] }>(response);
      setTasks(payload.tasks || []);
      setPlans(payload.plans || []);
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
        if (typeof payload?.type === 'string' && (payload.type.startsWith('task:') || payload.type.startsWith('bot:'))) {
          void fetchTasks();
        }
      } catch {
        // Polling remains the fallback.
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

  const retryTask = useCallback(async (taskId: string) => {
    const response = await authenticatedFetch(`/api/tasks/${taskId}/retry`, { method: 'POST', body: JSON.stringify({}) });
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
    plans,
    loading,
    error,
    createTask,
    cancelTask,
    retryTask,
    deleteTask,
    getTaskLogs,
    getTaskInteractions,
    answerInteraction,
    refresh: fetchTasks,
  };
}

function unwrapTaskResult(raw?: string | null): string | null {
  if (raw == null || raw === '') return null;
  const text = String(raw);
  try {
    const parsed = JSON.parse(text) as { result?: unknown; error?: unknown };
    if (parsed && typeof parsed === 'object') {
      if (parsed.error != null) {
        return `Hata: ${typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error, null, 2)}`;
      }
      if (parsed.result != null) {
        return typeof parsed.result === 'string'
          ? parsed.result
          : JSON.stringify(parsed.result, null, 2);
      }
      return JSON.stringify(parsed, null, 2);
    }
  } catch {
    // plain text
  }
  return text;
}

function normalizeScheduledTask(raw: Partial<ScheduledTask> & { id: string }): ScheduledTask {
  const lastResult = raw.lastResult ?? null;
  return {
    id: raw.id,
    projectId: raw.projectId || '',
    title: raw.title || (raw.prompt || '').slice(0, 80),
    prompt: raw.prompt || '',
    scheduleType: raw.scheduleType || raw.recurrence || 'once',
    scheduleValue: raw.scheduleValue || raw.cronExpression,
    cronExpression: raw.cronExpression,
    recurrence: raw.recurrence || raw.scheduleType,
    nextRunAt: raw.nextRunAt ?? null,
    lastRunAt: raw.lastRunAt ?? null,
    lastResult,
    resultText: raw.resultText ?? unwrapTaskResult(lastResult),
    status: raw.status || (raw.enabled === false ? 'paused' : 'active'),
    enabled: raw.enabled ?? raw.status === 'active',
    contextMode: raw.contextMode,
    createdAt: raw.createdAt || new Date().toISOString(),
    agentType: raw.agentType || raw.agent || undefined,
    agent: raw.agent ?? null,
    model: raw.model ?? null,
  };
}

export function usePixBot(projectId?: string, projectPath?: string | null) {
  const [conversations, setConversations] = useState<BotConversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<BotMessage[]>([]);
  const [proposals, setProposals] = useState<BotProposal[]>([]);
  const [crons, setCrons] = useState<BotCron[]>([]);
  /** NanoClaw schedule list (once / interval / cron) — the real timed jobs. */
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([]);
  const [plans, setPlans] = useState<BotPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const knownCompletedRef = useRef<Set<string>>(new Set());
  const conversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  const refreshSide = useCallback(async () => {
    if (!projectId) {
      setProposals([]);
      setCrons([]);
      setScheduledTasks([]);
      setPlans([]);
      return;
    }
    try {
      const [proposalRes, tasksRes, planRes] = await Promise.all([
        authenticatedFetch(`/api/tasks/bot/proposals?status=pending&projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' }),
        // Real NanoClaw schedules (once/cron/interval) — not the legacy bot/crons alias alone
        authenticatedFetch(`/api/tasks/tasks?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' }),
        authenticatedFetch(`/api/tasks/bot/plans?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' }),
      ]);
      const proposalPayload = proposalRes.ok
        ? await readResponse<{ proposals?: BotProposal[] }>(proposalRes)
        : { proposals: [] as BotProposal[] };
      let taskList: ScheduledTask[] = [];
      if (tasksRes.ok) {
        const taskPayload = await readResponse<{ tasks?: ScheduledTask[]; crons?: ScheduledTask[] }>(tasksRes);
        taskList = (taskPayload.tasks || taskPayload.crons || []).map((t) => normalizeScheduledTask(t));
      }
      const planPayload = planRes.ok
        ? await readResponse<{ plans?: BotPlan[] }>(planRes)
        : { plans: [] as BotPlan[] };
      setProposals(proposalPayload.proposals || []);
      setScheduledTasks(taskList);
      // Back-compat: expose active schedules as "crons" for any leftover consumers
      setCrons(taskList.filter((t) => t.status === 'active').map((t) => ({
        id: t.id,
        projectId: t.projectId,
        title: t.title || t.prompt.slice(0, 72),
        prompt: t.prompt,
        agentType: (t.agentType || t.agent || 'claude-code') as BotCron['agentType'],
        model: t.model || undefined,
        recurrence: t.scheduleType,
        cronExpression: t.cronExpression || (t.scheduleType === 'cron' ? t.scheduleValue : undefined),
        enabled: t.status === 'active',
        nextRunAt: t.nextRunAt,
        lastRunAt: t.lastRunAt,
        lastError: t.lastResult || undefined,
        createdAt: t.createdAt,
      })));
      setPlans(planPayload.plans || []);

      // When a scheduled job finishes, reload chat so “Zamanlanmış görev bitti” appears
      const doneIds = taskList
        .filter((t) => t.status === 'completed' || Boolean(t.lastRunAt && (t.resultText || t.lastResult)))
        .map((t) => t.id);
      const newlyDone = doneIds.filter((id) => !knownCompletedRef.current.has(id));
      knownCompletedRef.current = new Set(doneIds);
      if (newlyDone.length > 0 && conversationIdRef.current) {
        try {
          const response = await authenticatedFetch(
            `/api/tasks/bot/conversations/${conversationIdRef.current}/messages`,
            { cache: 'no-store' },
          );
          if (response.ok) {
            const payload = await readResponse<{ messages?: BotMessage[] }>(response);
            setMessages(payload.messages || []);
          }
        } catch {
          // ignore
        }
      }
    } catch {
      // Polling must not surface transient side-panel errors as chat failures
    }
  }, [projectId]);

  const loadMessages = useCallback(async (id: string) => {
    const response = await authenticatedFetch(`/api/tasks/bot/conversations/${id}/messages`, { cache: 'no-store' });
    const payload = await readResponse<{ messages?: BotMessage[] }>(response);
    setMessages(payload.messages || []);
  }, []);

  const refreshConversations = useCallback(async (preferId?: string | null) => {
    if (!projectId) {
      setConversations([]);
      setConversationId(null);
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await authenticatedFetch(`/api/tasks/bot/conversations?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' });
      const payload = await readResponse<{ conversations?: BotConversation[] }>(response);
      const list = payload.conversations || [];
      setConversations(list);
      const nextId = preferId && list.some((entry) => entry.id === preferId)
        ? preferId
        : conversationId && list.some((entry) => entry.id === conversationId)
          ? conversationId
          : list[0]?.id || null;
      setConversationId(nextId);
      if (nextId) await loadMessages(nextId);
      else setMessages([]);
      await refreshSide();
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      setLoading(false);
    }
  }, [conversationId, loadMessages, projectId, refreshSide]);

  useEffect(() => {
    void refreshConversations();
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps -- reset when workspace changes

  useEffect(() => {
    const token = window.localStorage.getItem('auth-token');
    if (!token) return undefined;
    const stream = new EventSource(`/api/tasks/events?token=${encodeURIComponent(token)}`);
    eventSourceRef.current = stream;
    stream.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.type === 'bot:message' && payload.message?.conversationId === conversationId) {
          setMessages((current) => {
            if (current.some((entry) => entry.id === payload.message.id)) return current;
            return [...current, payload.message as BotMessage];
          });
        }
        if (typeof payload?.type === 'string' && payload.type.startsWith('bot:')) {
          void refreshSide();
        }
        if (payload?.type === 'bot:message' && payload.conversation) {
          setConversations((current) => {
            const exists = current.some((entry) => entry.id === payload.conversation.id);
            if (exists) {
              return current.map((entry) => (entry.id === payload.conversation.id ? payload.conversation : entry));
            }
            return [payload.conversation as BotConversation, ...current];
          });
        }
      } catch {
        // ignore
      }
    };
    return () => {
      stream.close();
      eventSourceRef.current = null;
    };
  }, [conversationId, refreshSide]);

  const ensureConversation = useCallback(async () => {
    if (!projectId) throw new Error('Bind a workspace first.');
    if (conversationId) return conversationId;
    const response = await authenticatedFetch('/api/tasks/bot/conversations', {
      method: 'POST',
      body: JSON.stringify({ projectId }),
    });
    const payload = await readResponse<{ conversation: BotConversation }>(response);
    setConversations((current) => [payload.conversation, ...current]);
    setConversationId(payload.conversation.id);
    await loadMessages(payload.conversation.id);
    return payload.conversation.id;
  }, [conversationId, loadMessages, projectId]);

  const sendMessage = useCallback(async (message: string, opts?: { agentType?: string; model?: string; autonomyLevel?: string; forceCli?: boolean }) => {
    if (!projectId) throw new Error('Bind a workspace first.');
    setSending(true);
    setError(null);

    // Optimistic user bubble — visible immediately (before server finishes)
    const tempUserId = `tmp-user-${Date.now()}`;
    const tempAssistantId = `tmp-assistant-${Date.now()}`;
    const optimisticUser: BotMessage = {
      id: tempUserId,
      conversationId: conversationId || 'pending',
      role: 'user',
      content: message,
      createdAt: new Date().toISOString(),
      agentType: opts?.agentType || undefined,
    } as BotMessage;
    setMessages((current) => [...current, optimisticUser]);

    const payloadBody = {
      projectId,
      projectPath: projectPath || undefined,
      conversationId,
      message,
      agentType: opts?.agentType,
      model: opts?.model,
      autonomyLevel: opts?.autonomyLevel,
      forceCli: Boolean(opts?.forceCli || opts?.agentType),
    };

    try {
      const response = await authenticatedFetch('/api/tasks/bot/chat/stream', {
        method: 'POST',
        body: JSON.stringify(payloadBody),
      });

      if (!response.ok) {
        // Fallback non-stream
        const fallback = await authenticatedFetch('/api/tasks/bot/chat', {
          method: 'POST',
          body: JSON.stringify(payloadBody),
        });
        const payload = await readResponse<{
          conversation: BotConversation;
          messages: BotMessage[];
        }>(fallback);
        setConversationId(payload.conversation.id);
        setConversations((current) => {
          const rest = current.filter((entry) => entry.id !== payload.conversation.id);
          return [payload.conversation, ...rest];
        });
        setMessages((current) => {
          const withoutTmp = current.filter((e) => e.id !== tempUserId && e.id !== tempAssistantId);
          const ids = new Set(withoutTmp.map((entry) => entry.id));
          const merged = [...withoutTmp];
          for (const entry of payload.messages || []) {
            if (!ids.has(entry.id)) merged.push(entry);
          }
          return merged;
        });
        await refreshSide();
        return payload;
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No stream body');

      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let streamAssistantStarted = false;
      let lastPayload: {
        conversation?: BotConversation;
        messages?: BotMessage[];
      } = {};

      const ensureStreamingAssistant = () => {
        if (streamAssistantStarted) return;
        streamAssistantStarted = true;
        setMessages((current) => [
          ...current,
          {
            id: tempAssistantId,
            conversationId: conversationId || 'pending',
            role: 'assistant',
            content: '',
            createdAt: new Date().toISOString(),
            meta: { streaming: true },
          } as BotMessage,
        ]);
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n');
        buffer = chunks.pop() || '';
        for (const line of chunks) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          let event: any;
          try { event = JSON.parse(data); } catch { continue; }

          if (event.type === 'user' && event.message) {
            setMessages((current) => {
              const without = current.filter((e) => e.id !== tempUserId);
              if (without.some((e) => e.id === event.message.id)) return without;
              return [...without, event.message as BotMessage];
            });
            if (event.conversation) {
              setConversationId(event.conversation.id);
              setConversations((current) => {
                const rest = current.filter((entry) => entry.id !== event.conversation.id);
                return [event.conversation as BotConversation, ...rest];
              });
            }
          }

          if (event.type === 'status') {
            ensureStreamingAssistant();
            setMessages((current) => current.map((m) => (
              m.id === tempAssistantId
                ? { ...m, meta: { ...(m.meta as object || {}), status: event.status, streaming: true } }
                : m
            )));
          }

          if (event.type === 'assistant_start') {
            ensureStreamingAssistant();
          }

          if (event.type === 'delta' && typeof event.delta === 'string') {
            ensureStreamingAssistant();
            setMessages((current) => current.map((m) => (
              m.id === tempAssistantId
                ? { ...m, content: `${m.content || ''}${event.delta}`, meta: { ...(m.meta as object || {}), streaming: true } }
                : m
            )));
          }

          if (event.type === 'done' || event.type === 'error') {
            lastPayload = event;
            if (event.conversation) {
              setConversationId(event.conversation.id);
              setConversations((current) => {
                const rest = current.filter((entry) => entry.id !== event.conversation.id);
                return [event.conversation as BotConversation, ...rest];
              });
            }
            setMessages((current) => {
              const withoutTmp = current.filter((e) => e.id !== tempUserId && e.id !== tempAssistantId);
              const ids = new Set(withoutTmp.map((entry) => entry.id));
              const merged = [...withoutTmp];
              for (const entry of event.messages || []) {
                if (!ids.has(entry.id)) merged.push(entry as BotMessage);
              }
              return merged;
            });
            if (event.type === 'error' && event.error) {
              setError(String(event.error));
            }
          }
        }
      }

      await refreshSide();
      return lastPayload;
    } catch (caughtError) {
      // Drop optimistic assistant; keep user message if server never confirmed
      setMessages((current) => current.filter((e) => e.id !== tempAssistantId));
      const messageText = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setError(messageText);
      throw caughtError;
    } finally {
      setSending(false);
    }
  }, [conversationId, projectId, projectPath, refreshSide]);

  const approveProposal = useCallback(async (proposalId: string) => {
    const response = await authenticatedFetch(`/api/tasks/bot/proposals/${proposalId}/approve`, { method: 'POST', body: '{}' });
    await readResponse(response);
    await refreshSide();
    if (conversationId) await loadMessages(conversationId);
  }, [conversationId, loadMessages, refreshSide]);

  const rejectProposal = useCallback(async (proposalId: string) => {
    const response = await authenticatedFetch(`/api/tasks/bot/proposals/${proposalId}/reject`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    await readResponse(response);
    await refreshSide();
    if (conversationId) await loadMessages(conversationId);
  }, [conversationId, loadMessages, refreshSide]);

  const toggleCron = useCallback(async (cronId: string, enabled?: boolean) => {
    const task = scheduledTasks.find((t) => t.id === cronId);
    const shouldEnable = enabled === undefined ? task?.status !== 'active' : enabled;
    const path = shouldEnable ? 'resume' : 'pause';
    const response = await authenticatedFetch(`/api/tasks/tasks/${encodeURIComponent(cronId)}/${path}`, {
      method: 'POST',
      body: '{}',
    });
    await readResponse(response);
    await refreshSide();
  }, [refreshSide, scheduledTasks]);

  const runCronNow = useCallback(async (cronId: string) => {
    // No dedicated run-now on NanoClaw schedule rows — resume if paused so scheduler can pick it up.
    const task = scheduledTasks.find((t) => t.id === cronId);
    if (task && task.status === 'paused') {
      await authenticatedFetch(`/api/tasks/tasks/${encodeURIComponent(cronId)}/resume`, {
        method: 'POST',
        body: '{}',
      }).then((r) => readResponse(r));
    }
    await refreshSide();
    if (conversationId) await loadMessages(conversationId);
  }, [conversationId, loadMessages, refreshSide, scheduledTasks]);

  const deleteCron = useCallback(async (cronId: string) => {
    // Prefer NanoClaw task delete (bot/crons is a thin alias)
    const response = await authenticatedFetch(`/api/tasks/tasks/${encodeURIComponent(cronId)}`, { method: 'DELETE' });
    if (!response.ok && response.status !== 204) {
      const fallback = await authenticatedFetch(`/api/tasks/bot/crons/${cronId}`, { method: 'DELETE' });
      if (!fallback.ok) await readResponse(fallback);
    }
    await refreshSide();
  }, [refreshSide]);

  const pauseScheduledTask = useCallback(async (taskId: string) => {
    const response = await authenticatedFetch(`/api/tasks/tasks/${encodeURIComponent(taskId)}/pause`, {
      method: 'POST',
      body: '{}',
    });
    await readResponse(response);
    await refreshSide();
  }, [refreshSide]);

  const resumeScheduledTask = useCallback(async (taskId: string) => {
    const response = await authenticatedFetch(`/api/tasks/tasks/${encodeURIComponent(taskId)}/resume`, {
      method: 'POST',
      body: '{}',
    });
    await readResponse(response);
    await refreshSide();
  }, [refreshSide]);

  const cancelScheduledTask = useCallback(async (taskId: string) => {
    const response = await authenticatedFetch(`/api/tasks/tasks/${encodeURIComponent(taskId)}/cancel`, {
      method: 'POST',
      body: '{}',
    });
    await readResponse(response);
    await refreshSide();
  }, [refreshSide]);

  const deleteScheduledTask = useCallback(async (taskId: string) => {
    const response = await authenticatedFetch(`/api/tasks/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
    if (!response.ok && response.status !== 204) await readResponse(response);
    await refreshSide();
  }, [refreshSide]);

  const getScheduledTask = useCallback(async (taskId: string): Promise<ScheduledTask | null> => {
    const response = await authenticatedFetch(`/api/tasks/tasks/${encodeURIComponent(taskId)}`, { cache: 'no-store' });
    const payload = await readResponse<{ task?: ScheduledTask }>(response);
    return payload.task ? normalizeScheduledTask(payload.task) : null;
  }, []);

  const startNewChat = useCallback(async () => {
    if (!projectId) throw new Error('Bind a workspace first.');
    const response = await authenticatedFetch('/api/tasks/bot/conversations', {
      method: 'POST',
      body: JSON.stringify({ projectId }),
    });
    const payload = await readResponse<{ conversation: BotConversation }>(response);
    setConversations((current) => [payload.conversation, ...current]);
    setConversationId(payload.conversation.id);
    await loadMessages(payload.conversation.id);
  }, [loadMessages, projectId]);

  // Poll scheduled tasks so next-run / status stay fresh without full conversation reload
  useEffect(() => {
    if (!projectId) return undefined;
    const intervalId = window.setInterval(() => {
      void refreshSide();
    }, 8000);
    return () => window.clearInterval(intervalId);
  }, [projectId, refreshSide]);

  return {
    conversations,
    conversationId,
    setConversationId: async (id: string) => {
      setConversationId(id);
      await loadMessages(id);
    },
    messages,
    proposals,
    crons,
    scheduledTasks,
    plans,
    loading,
    sending,
    error,
    sendMessage,
    ensureConversation,
    approveProposal,
    rejectProposal,
    toggleCron,
    runCronNow,
    deleteCron,
    pauseScheduledTask,
    resumeScheduledTask,
    cancelScheduledTask,
    deleteScheduledTask,
    getScheduledTask,
    startNewChat,
    refresh: () => refreshConversations(conversationId),
    refreshSide,
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
      // safe defaults in UI
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return { roles, agents };
}
