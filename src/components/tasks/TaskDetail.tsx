import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { authenticatedFetch } from '../../utils/api';

import type { Task, TaskLog, TaskInteraction } from './types';

export function TaskDetail({ task, onClose }: { task: Task; onClose: () => void }) {
  const _t = useTranslation('common');
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [interactions, setInteractions] = useState<TaskInteraction[]>([]);
  const [answerInput, setAnswerInput] = useState<Record<string, string>>({});

  const fetchLogs = useCallback(async () => {
    const res = await authenticatedFetch(`/api/tasks/${task.id}/logs?limit=500`);
    if (res.ok) {
      const data = await res.json();
      setLogs(data.logs || []);
    }
  }, [task.id]);

  const fetchInteractions = useCallback(async () => {
    const res = await authenticatedFetch(`/api/tasks/${task.id}/interactions`);
    if (res.ok) {
      const data = await res.json();
      setInteractions(data.interactions || []);
    }
  }, [task.id]);

  useEffect(() => {
    fetchLogs();
    fetchInteractions();
    const interval = setInterval(() => {
      if (task.status === 'RUNNING' || task.status === 'AWAITING_INPUT') {
        fetchLogs();
        fetchInteractions();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [task.status, fetchLogs, fetchInteractions]);

  const submitAnswer = async (interactionId: string) => {
    const answer = answerInput[interactionId];
    if (!answer) return;
    await authenticatedFetch(`/api/tasks/interactions/${interactionId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer }),
    });
    setAnswerInput({ ...answerInput, [interactionId]: '' });
    fetchInteractions();
  };

  const statusColor: Record<string, string> = {
    PENDING: 'text-gray-400',
    QUEUED: 'text-blue-400',
    RUNNING: 'text-green-400 animate-pulse',
    AWAITING_INPUT: 'text-yellow-400 animate-pulse',
    COMPLETED: 'text-green-500',
    FAILED: 'text-red-500',
    CANCELLED: 'text-gray-500',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-white/10 bg-[#1a1a2e]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <div>
            <h2 className="text-lg font-semibold text-white">{task.title}</h2>
            <div className="mt-1 flex items-center gap-3 text-sm">
              <span className={statusColor[task.status] || 'text-gray-400'}>{task.status}</span>
              <span className="text-gray-500">{task.agentType}</span>
              {task.model && <span className="text-gray-500">{task.model}</span>}
              <span className="text-gray-500">{task.role}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 overflow-y-auto p-4">
          {/* Prompt */}
          <div>
            <h3 className="mb-1 text-sm font-medium text-gray-400">Prompt</h3>
            <pre className="whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-sm text-gray-300">
              {task.prompt}
            </pre>
          </div>

          {/* Summary */}
          {task.summary && (
            <div>
              <h3 className="mb-1 text-sm font-medium text-gray-400">Summary</h3>
              <pre className="whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-sm text-green-300">
                {task.summary}
              </pre>
            </div>
          )}

          {/* Cost & tokens */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-black/30 p-3">
              <div className="text-xs text-gray-500">Cost</div>
              <div className="text-sm text-white">${(task.costUsd || 0).toFixed(4)}</div>
            </div>
            <div className="rounded-lg bg-black/30 p-3">
              <div className="text-xs text-gray-500">Input tokens</div>
              <div className="text-sm text-white">{task.tokenCount?.input || 0}</div>
            </div>
            <div className="rounded-lg bg-black/30 p-3">
              <div className="text-xs text-gray-500">Output tokens</div>
              <div className="text-sm text-white">{task.tokenCount?.output || 0}</div>
            </div>
          </div>

          {/* Changed files */}
          {task.changedFiles && task.changedFiles.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-medium text-gray-400">Changed files ({task.changedFiles.length})</h3>
              <div className="space-y-1">
                {task.changedFiles.map((f) => (
                  <div key={f} className="rounded bg-black/30 px-3 py-1 text-sm text-gray-300">
                    {f}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending interactions */}
          {interactions.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-medium text-yellow-400">Agent questions ({interactions.length})</h3>
              <div className="space-y-3">
                {interactions.map((interaction) => (
                  <div key={interaction.id} className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
                    <div className="mb-2 text-sm text-yellow-200">{interaction.question}</div>
                    {interaction.options && interaction.options.length > 0 ? (
                      <div className="space-y-2">
                        {interaction.options.map((opt) => (
                          <button
                            key={opt}
                            onClick={() => setAnswerInput({ ...answerInput, [interaction.id]: opt })}
                            className={`block w-full rounded px-3 py-2 text-left text-sm ${
                              answerInput[interaction.id] === opt
                                ? 'bg-yellow-500/30 text-yellow-100'
                                : 'bg-black/30 text-gray-300 hover:bg-black/50'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-2 flex gap-2">
                      <input
                        type="text"
                        value={answerInput[interaction.id] || ''}
                        onChange={(e) => setAnswerInput({ ...answerInput, [interaction.id]: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && submitAnswer(interaction.id)}
                        placeholder="Type your answer..."
                        className="flex-1 rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-yellow-500/50"
                      />
                      <button
                        onClick={() => submitAnswer(interaction.id)}
                        className="rounded bg-yellow-500/20 px-4 py-2 text-sm text-yellow-200 hover:bg-yellow-500/30"
                      >
                        Send
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Logs */}
          <div>
            <h3 className="mb-1 text-sm font-medium text-gray-400">Logs ({logs.length})</h3>
            <div className="max-h-96 space-y-1 overflow-y-auto rounded-lg bg-black/30 p-3 font-mono text-xs">
              {logs.length === 0 ? (
                <div className="text-gray-600">No logs yet</div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="flex gap-2">
                    <span className="text-gray-600">{log.timestamp.slice(11, 19)}</span>
                    <span className={
                      log.level === 'error' ? 'text-red-400' :
                      log.level === 'warn' ? 'text-yellow-400' :
                      log.level === 'info' ? 'text-gray-300' :
                      'text-gray-500'
                    }>
                      [{log.level.toUpperCase()}]
                    </span>
                    <span className="text-gray-300">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
