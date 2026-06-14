import { useEffect, useState } from 'react';

export type ExecutionEvent = 
  | { kind: 'task-state'; state: 'working' | 'completed' | 'canceled' | 'failed'; error?: { message: string } }
  | { kind: 'message'; role: 'agent' | 'user'; parts: { kind: 'text'; text: string }[] }
  | { kind: 'thought'; text: string }
  | { kind: 'tool-call'; tool: string; args: any; status: 'running' | 'completed' | 'failed'; result?: any };

export function useExecutionState(taskId: string | undefined) {
  const [events, setEvents] = useState<ExecutionEvent[]>([]);
  const [status, setStatus] = useState<'idle' | 'working' | 'completed' | 'failed' | 'canceled'>('idle');

  useEffect(() => {
    if (!taskId) return;

    let mounted = true;
    const es = new EventSource(`/api/orchestration/tasks/${taskId}/stream`);

    es.onmessage = (e) => {
      if (!mounted) return;
      const event = JSON.parse(e.data);
      
      setEvents(prev => [...prev, event]);

      if (event.kind === 'task-state') {
        setStatus(event.state);
        if (event.state === 'completed' || event.state === 'failed' || event.state === 'canceled') {
          es.close();
        }
      }
    };

    es.onerror = () => {
      if (mounted) {
        setStatus('failed');
        es.close();
      }
    };

    return () => {
      mounted = false;
      es.close();
    };
  }, [taskId]);

  return { events, status };
}
