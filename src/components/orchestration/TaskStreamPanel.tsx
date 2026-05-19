import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { authenticatedFetch } from '../../utils/api';

type TaskStreamPanelProps = {
  hermesTaskId?: string;
};

export default function TaskStreamPanel({ hermesTaskId }: TaskStreamPanelProps) {
  const { t } = useTranslation();
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    if (!hermesTaskId) {
      setLines([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const response = await authenticatedFetch(`/api/orchestration/hermes/tasks/${encodeURIComponent(hermesTaskId)}`);
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
  }, [hermesTaskId]);

  if (!hermesTaskId) return null;

  return (
    <pre className="max-h-40 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
      {lines.join('\n\n') || t('orchestration.waitingForStream')}
    </pre>
  );
}
