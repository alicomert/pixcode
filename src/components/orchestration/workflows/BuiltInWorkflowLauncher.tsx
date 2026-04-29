import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Workflow } from '@/lib/icons';
import { Button, Input } from '../../../shared/view/ui';
import { authenticatedFetch } from '../../../utils/api';

type BuiltInWorkflow = {
  id: string;
  name: string;
  description?: string;
};

type BuiltInWorkflowLauncherProps = {
  onRunStarted: (runId: string) => void;
};

export default function BuiltInWorkflowLauncher({ onRunStarted }: BuiltInWorkflowLauncherProps) {
  const { t } = useTranslation();
  const [workflows, setWorkflows] = useState<BuiltInWorkflow[]>([]);
  const [workflowId, setWorkflowId] = useState('');
  const [input, setInput] = useState('');

  useEffect(() => {
    void authenticatedFetch('/api/orchestration/workflows')
      .then((response) => response.ok ? response.json() : Promise.resolve({ workflows: [] }))
      .then((data: { workflows?: BuiltInWorkflow[] }) => {
        setWorkflows(data.workflows ?? []);
        setWorkflowId(data.workflows?.[0]?.id ?? '');
      });
  }, []);

  const start = async () => {
    if (!workflowId) return;
    const response = await authenticatedFetch(`/api/orchestration/workflows/${encodeURIComponent(workflowId)}/runs`, {
      method: 'POST',
      body: JSON.stringify({ input }),
    });
    if (!response.ok) return;
    const run = await response.json() as { id: string };
    onRunStarted(run.id);
  };

  return (
    <section className="border-t border-border px-5 py-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">{t('orchestration.workflow')}</span>
          <select
            value={workflowId}
            onChange={(event) => setWorkflowId(event.target.value)}
            className="h-9 min-w-56 rounded-md border border-input bg-background px-3 text-sm"
          >
            {workflows.map((workflow) => (
              <option key={workflow.id} value={workflow.id}>
                {t(`orchestration.workflows.${workflow.id}.name`, { defaultValue: workflow.name })}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-72 flex-1 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">{t('orchestration.input')}</span>
          <Input value={input} onChange={(event) => setInput(event.target.value)} />
        </label>
        <Button type="button" onClick={() => void start()}>
          <Workflow />
          {t('orchestration.start')}
        </Button>
      </div>
    </section>
  );
}
