import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Play } from '@/lib/icons';
import { Button, Dialog, DialogContent, DialogTitle } from '../../shared/view/ui';
import AdapterSelector from './AdapterSelector';
import type { AgentCard, UnifiedTask } from './useOrchestrationTasks';

type TaskDispatchModalProps = {
  task: UnifiedTask | null;
  agents: AgentCard[];
  onClose: () => void;
  onDispatch: (taskId: string, adapterId: string, isolation: string) => Promise<void>;
};

export default function TaskDispatchModal({
  task,
  agents,
  onClose,
  onDispatch,
}: TaskDispatchModalProps) {
  const { t } = useTranslation();
  const [adapterId, setAdapterId] = useState('auto');
  const [isolation, setIsolation] = useState('worktree');
  const [busy, setBusy] = useState(false);

  if (!task) return null;

  const submit = async () => {
    setBusy(true);
    try {
      await onDispatch(task.id, adapterId, isolation);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={Boolean(task)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{t('orchestration.dispatchTask')}</DialogTitle>
        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium">{task.title}</div>
            {task.description ? (
              <div className="mt-1 line-clamp-3 text-sm text-muted-foreground">{task.description}</div>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium">{t('orchestration.adapter')}</span>
              <AdapterSelector agents={agents} value={adapterId} onChange={setAdapterId} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">{t('orchestration.isolation')}</span>
              <select
                value={isolation}
                onChange={(event) => setIsolation(event.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="worktree">{t('orchestration.isolationKind.worktree')}</option>
                <option value="host">{t('orchestration.isolationKind.host')}</option>
                <option value="docker">{t('orchestration.isolationKind.docker')}</option>
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>{t('orchestration.cancelTask')}</Button>
            <Button type="button" onClick={() => void submit()} disabled={busy}>
              <Play />
              {t('orchestration.dispatch')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
