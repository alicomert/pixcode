import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { authenticatedFetch } from '../../utils/api';

import type { Task, TaskStatus } from './types';
import { TaskDetail } from './TaskDetail';
import { TaskCreateDialog } from './TaskCreateDialog';

export function TasksPage({ projectId }: { projectId?: string }) {
  const _t = useTranslation('common');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all');

  const fetchTasks = useCallback(async () => {
    try {
      const url = projectId
        ? `/api/tasks?projectId=${encodeURIComponent(projectId)}`
        : '/api/tasks?limit=100';
      const res = await authenticatedFetch(url);
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 5000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  // SSE for real-time updates
  useEffect(() => {
    try {
      const es = new EventSource('/api/tasks/events');
      es.onmessage = () => fetchTasks();
      return () => es.close();
    } catch {
      // EventSource may not be available in all environments
    }
  }, [fetchTasks]);

  const handleCancel = async (taskId: string) => {
    await authenticatedFetch(`/api/tasks/${taskId}/cancel`, { method: 'POST' });
    fetchTasks();
  };

  const handleDelete = async (taskId: string) => {
    if (!confirm('Delete this task permanently?')) return;
    await authenticatedFetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    fetchTasks();
  };

  const filteredTasks = filter === 'all' ? tasks : tasks.filter((t) => t.status === filter);

  const statusColors: Record<string, string> = {
    PENDING: 'bg-gray-500/20 text-gray-300',
    QUEUED: 'bg-blue-500/20 text-blue-300',
    RUNNING: 'bg-green-500/20 text-green-300 animate-pulse',
    AWAITING_INPUT: 'bg-yellow-500/20 text-yellow-300 animate-pulse',
    COMPLETED: 'bg-green-600/20 text-green-400',
    FAILED: 'bg-red-500/20 text-red-400',
    CANCELLED: 'bg-gray-600/20 text-gray-400',
  };

  const statusFilters: (TaskStatus | 'all')[] = ['all', 'PENDING', 'QUEUED', 'RUNNING', 'AWAITING_INPUT', 'COMPLETED', 'FAILED', 'CANCELLED'];

  const activeCount = tasks.filter((t) => t.status === 'RUNNING' || t.status === 'QUEUED' || t.status === 'AWAITING_INPUT').length;
  const completedCount = tasks.filter((t) => t.status === 'COMPLETED').length;

  return (
    <div className="flex h-full flex-col bg-[#0f0f1e] text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 p-4">
        <div>
          <h1 className="text-xl font-bold">Tasks</h1>
          <p className="mt-1 text-sm text-gray-500">
            {tasks.length} total · {activeCount} active · {completedCount} completed
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          <span>+</span> New Task
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex gap-2 overflow-x-auto border-b border-white/10 p-3">
        {statusFilters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs ${
              filter === f ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
            }`}
          >
            {f === 'all' ? 'All' : f.replace('_', ' ')}
            {f !== 'all' && ` (${tasks.filter((t) => t.status === f).length})`}
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="py-8 text-center text-gray-500">Loading tasks...</div>
        ) : filteredTasks.length === 0 ? (
          <div className="py-16 text-center text-gray-500">
            <div className="mb-3 text-4xl">📋</div>
            <div className="text-lg">No tasks found</div>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
            >
              Create your first task
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTasks.map((task) => (
              <div
                key={task.id}
                onClick={() => setSelectedTask(task)}
                className="cursor-pointer rounded-lg border border-white/5 bg-[#1a1a2e] p-4 transition-colors hover:bg-[#22223e]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[task.status]}`}>
                        {task.status.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-gray-500">{task.agentType}</span>
                      <span className="text-xs text-gray-600">{task.role}</span>
                    </div>
                    <h3 className="truncate text-sm font-medium text-white">{task.title}</h3>
                    <p className="mt-1 truncate text-xs text-gray-500">{task.prompt.slice(0, 120)}</p>
                    {task.summary && (
                      <p className="mt-1 truncate text-xs text-green-400/70">{task.summary.slice(0, 120)}</p>
                    )}
                    <div className="mt-2 flex items-center gap-3 text-xs text-gray-600">
                      <span>${(task.costUsd || 0).toFixed(4)}</span>
                      {task.tokenCount && (
                        <span>{task.tokenCount.input + task.tokenCount.output} tokens</span>
                      )}
                      {task.changedFiles && task.changedFiles.length > 0 && (
                        <span>{task.changedFiles.length} files</span>
                      )}
                      <span>{new Date(task.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                    {(task.status === 'RUNNING' || task.status === 'QUEUED' || task.status === 'AWAITING_INPUT' || task.status === 'PENDING') && (
                      <button
                        onClick={() => handleCancel(task.id)}
                        className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
                      >
                        Cancel
                      </button>
                    )}
                    {(task.status === 'COMPLETED' || task.status === 'FAILED' || task.status === 'CANCELLED') && (
                      <button
                        onClick={() => handleDelete(task.id)}
                        className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-white/5 hover:text-gray-400"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreate && (
        <TaskCreateDialog
          projectId={projectId || ''}
          onClose={() => setShowCreate(false)}
          onCreated={fetchTasks}
        />
      )}
      {selectedTask && (
        <TaskDetail
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  );
}
