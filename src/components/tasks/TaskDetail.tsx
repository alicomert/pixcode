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
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a1a2e] border border-white/10 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div>
            <h2 className="text-lg font-semibold text-white">{task.title}</h2>
            <div className="flex items-center gap-3 mt-1 text-sm">
              <span className={statusColor[task.status] || 'text-gray-400'}>{task.status}</span>
              <span className="text-gray-500">{task.agentType}</span>
              {task.model && <span className="text-gray-500">{task.model}</span>}
              <span className="text-gray-500">{task.role}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-white/10"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-4 space-y-4">
          {/* Prompt */}
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-1">Prompt</h3>
            <pre className="text-sm text-gray-300 bg-black/30 p-3 rounded-lg whitespace-pre-wrap">
              {task.prompt}
            </pre>
          </div>

          {/* Summary */}
          {task.summary && (
            <div>
              <h3 className="text-sm font-medium text-gray-400 mb-1">Summary</h3>
              <pre className="text-sm text-green-300 bg-black/30 p-3 rounded-lg whitespace-pre-wrap">
                {task.summary}
              </pre>
            </div>
          )}

          {/* Cost & tokens */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-black/30 p-3 rounded-lg">
              <div className="text-xs text-gray-500">Cost</div>
              <div className="text-sm text-white">${(task.costUsd || 0).toFixed(4)}</div>
            </div>
            <div className="bg-black/30 p-3 rounded-lg">
              <div className="text-xs text-gray-500">Input tokens</div>
              <div className="text-sm text-white">{task.tokenCount?.input || 0}</div>
            </div>
            <div className="bg-black/30 p-3 rounded-lg">
              <div className="text-xs text-gray-500">Output tokens</div>
              <div className="text-sm text-white">{task.tokenCount?.output || 0}</div>
            </div>
          </div>

          {/* Changed files */}
          {task.changedFiles && task.changedFiles.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-400 mb-1">Changed files ({task.changedFiles.length})</h3>
              <div className="space-y-1">
                {task.changedFiles.map((f) => (
                  <div key={f} className="text-sm text-gray-300 bg-black/30 px-3 py-1 rounded">
                    {f}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending interactions */}
          {interactions.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-yellow-400 mb-1">Agent questions ({interactions.length})</h3>
              <div className="space-y-3">
                {interactions.map((interaction) => (
                  <div key={interaction.id} className="bg-yellow-500/10 border border-yellow-500/30 p-3 rounded-lg">
                    <div className="text-sm text-yellow-200 mb-2">{interaction.question}</div>
                    {interaction.options && interaction.options.length > 0 ? (
                      <div className="space-y-2">
                        {interaction.options.map((opt) => (
                          <button
                            key={opt}
                            onClick={() => setAnswerInput({ ...answerInput, [interaction.id]: opt })}
                            className={`block w-full text-left text-sm px-3 py-2 rounded ${
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
                    <div className="flex gap-2 mt-2">
                      <input
                        type="text"
                        value={answerInput[interaction.id] || ''}
                        onChange={(e) => setAnswerInput({ ...answerInput, [interaction.id]: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && submitAnswer(interaction.id)}
                        placeholder="Type your answer..."
                        className="flex-1 bg-black/40 text-white text-sm px-3 py-2 rounded border border-white/10 focus:border-yellow-500/50 outline-none"
                      />
                      <button
                        onClick={() => submitAnswer(interaction.id)}
                        className="bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-200 text-sm px-4 py-2 rounded"
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
            <h3 className="text-sm font-medium text-gray-400 mb-1">Logs ({logs.length})</h3>
            <div className="bg-black/30 p-3 rounded-lg max-h-96 overflow-y-auto font-mono text-xs space-y-1">
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
