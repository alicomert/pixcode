import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Input } from '../../shared/view/ui';

import TaskCard from './TaskCard';
import TaskDispatchModal from './TaskDispatchModal';
import { useOrchestrationTasks, type UnifiedTask } from './useOrchestrationTasks';

import { Plus, RefreshCw } from '@/lib/icons';

const columns: Array<{ id: UnifiedTask['state'] }> = [
  { id: 'todo' },
  { id: 'in_progress' },
  { id: 'in_review' },
  { id: 'done' },
  { id: 'failed' },
];

export default function TaskBoard() {
  const { t } = useTranslation();
  const {
    tasks,
    agents,
    createTask,
    dispatchTask,
    cancelTask,
    syncTaskMaster,
  } = useOrchestrationTasks('default');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dispatching, setDispatching] = useState<UnifiedTask | null>(null);
  const [syncing, setSyncing] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    await createTask(title.trim(), description.trim());
    setTitle('');
    setDescription('');
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncTaskMaster('default');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <main className="flex h-full min-h-0 flex-col bg-background">
      <header className="border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-56 flex-1 space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('orchestration.taskTitle')}</span>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t('orchestration.taskTitlePlaceholder')}
            />
          </label>
          <label className="min-w-72 flex-[2] space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('orchestration.taskDescription')}</span>
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t('orchestration.taskDescriptionPlaceholder')}
            />
          </label>
          <Button type="button" onClick={() => void submit()}>
            <Plus />
            {t('orchestration.addTask')}
          </Button>
          <Button type="button" variant="outline" onClick={() => void handleSync()} disabled={syncing}>
            <RefreshCw className={syncing ? 'animate-spin' : ''} />
            {t('orchestration.syncTaskMaster')}
          </Button>
        </div>
      </header>
      <section className="grid min-h-0 flex-1 gap-3 overflow-auto p-4 lg:grid-cols-5">
        {columns.map((column) => (
          <div key={column.id} className="min-h-48 rounded-md border border-border/70 bg-muted/20">
            <div className="border-b border-border/70 px-3 py-2 text-sm font-semibold">
              {t(`orchestration.taskStates.${column.id}`)}
              <span className="ml-1 text-xs text-muted-foreground">
                ({tasks.filter((task) => task.state === column.id).length})
              </span>
            </div>
            <div className="space-y-3 p-3">
              {tasks.filter((task) => task.state === column.id).map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onDispatch={setDispatching}
                  onCancel={(taskId) => void cancelTask(taskId)}
                />
              ))}
            </div>
          </div>
        ))}
      </section>
      <TaskDispatchModal
        task={dispatching}
        agents={agents}
        onClose={() => setDispatching(null)}
        onDispatch={dispatchTask}
      />
    </main>
  );
}
