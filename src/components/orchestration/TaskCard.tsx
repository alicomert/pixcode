import { useTranslation } from 'react-i18next';

import { Badge, Button } from '../../shared/view/ui';

import TaskStreamPanel from './TaskStreamPanel';
import type { UnifiedTask } from './useOrchestrationTasks';

import { GitBranch, Play, SquareIcon } from '@/lib/icons';

type TaskCardProps = {
  task: UnifiedTask;
  onDispatch: (task: UnifiedTask) => void;
  onCancel: (taskId: string) => void;
};

export default function TaskCard({ task, onDispatch, onCancel }: TaskCardProps) {
  const { t } = useTranslation();

  const canDispatch = task.state === 'todo' || task.state === 'failed';
  const canCancel = task.state === 'in_progress';

  return (
    <article className="rounded-md border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{task.title}</h3>
            {task.taskmasterId ? (
              <Badge variant="outline" className="text-[10px]">
                {t('orchestration.taskMasterSource')}
              </Badge>
            ) : null}
          </div>
          {task.description ? (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
          ) : null}
        </div>
        <Badge variant={task.state === 'failed' ? 'destructive' : 'secondary'}>
          {t(`orchestration.taskStates.${task.state}`, { defaultValue: task.state })}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {task.adapterId ? <span>{task.adapterId}</span> : null}
        {task.workspaceKind ? (
          <span className="inline-flex items-center gap-1">
            <GitBranch className="h-3 w-3" />
            {task.workspaceKind}
          </span>
        ) : null}
      </div>
      <div className="mt-3">
        <TaskStreamPanel a2aTaskId={task.a2aTaskId} />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        {canDispatch ? (
          <Button type="button" size="sm" onClick={() => onDispatch(task)}>
            <Play />
            {t('orchestration.runTask')}
          </Button>
        ) : null}
        {canCancel ? (
          <Button type="button" size="sm" variant="outline" onClick={() => onCancel(task.id)}>
            <SquareIcon />
            {t('orchestration.cancelTask')}
          </Button>
        ) : null}
      </div>
    </article>
  );
}
