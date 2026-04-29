import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { authenticatedFetch } from '../../utils/api';

type TaskStreamPanelProps = {
  a2aTaskId?: string;
};

export default function TaskStreamPanel({ a2aTaskId }: TaskStreamPanelProps) {
  const { t } = useTranslation();
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    if (!a2aTaskId) {
      setLines([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const response = await authenticatedFetch(`/a2a/tasks/${encodeURIComponent(a2aTaskId)}`);
      if (!response.ok || cancelled) return;
      const task = await response.json() as {
        history?: Array<{ parts?: Array<{ kind?: string; text?: string }> }>;
      };
      setLines((task.history ?? []).flatMap((message) =>
        (message.parts ?? [])
          .filter((part) => part.kind === 'text' && typeof part.text === 'string')
          .map((part) => part.text as string),
      ));
    };
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [a2aTaskId]);

  if (!a2aTaskId) return null;

  return (
    <pre className="max-h-40 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
      {lines.join('\n\n') || t('orchestration.waitingForStream')}
    </pre>
  );
}
