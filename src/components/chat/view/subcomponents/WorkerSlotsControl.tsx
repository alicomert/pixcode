import type { ChangeEvent } from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Project } from '../../../../types/app';
import {
  createWorkerSlot,
  MAX_WORKER_SLOTS,
  resolveWorkerSlotModel,
  WORKER_SLOT_PROVIDERS,
  type WorkerSlot,
} from '../../utils/workerSlots';

import { Plus, XIcon } from '@/lib/icons';

type WorkerSlotsControlProps = {
  workerSlots: WorkerSlot[];
  onWorkerSlotsChange: (slots: WorkerSlot[]) => void;
  selectedProject: Project | null;
  disabled?: boolean;
};

const providerLabels: Record<string, string> = {
  claude: 'Claude',
  cursor: 'Cursor',
  codex: 'Codex',
  gemini: 'Gemini',
  qwen: 'Qwen',
  opencode: 'OpenCode',
};

export default function WorkerSlotsControl({
  workerSlots,
  onWorkerSlotsChange,
  selectedProject,
  disabled = false,
}: WorkerSlotsControlProps) {
  const { t } = useTranslation('chat');
  const [isOpen, setIsOpen] = useState(false);
  const activeCount = workerSlots.filter((slot) => slot.enabled).length;
  const selectedProjectPath = selectedProject?.fullPath || selectedProject?.path || '';

  const canAddSlot = workerSlots.length < MAX_WORKER_SLOTS;

  const normalizedSlots = useMemo(() => workerSlots.slice(0, MAX_WORKER_SLOTS), [workerSlots]);

  const updateSlot = (id: string, patch: Partial<WorkerSlot>) => {
    onWorkerSlotsChange(workerSlots.map((slot) => (
      slot.id === id ? { ...slot, ...patch } : slot
    )));
  };

  const onAddSlot = () => {
    if (!canAddSlot) {
      return;
    }

    onWorkerSlotsChange([
      ...workerSlots,
      createWorkerSlot({
        projectName: selectedProject?.name,
        projectPath: selectedProjectPath,
      }),
    ]);
    setIsOpen(true);
  };

  const removeSlot = (id: string) => {
    onWorkerSlotsChange(workerSlots.filter((slot) => slot.id !== id));
  };

  const updateProjectPath = (slot: WorkerSlot, event: ChangeEvent<HTMLInputElement>) => {
    updateSlot(slot.id, {
      projectPath: event.target.value,
      mode: event.target.value === selectedProjectPath ? 'current_project' : 'new_chat',
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          if (workerSlots.length === 0) {
            onAddSlot();
          } else {
            setIsOpen((value) => !value);
          }
        }}
        disabled={disabled}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/30 text-muted-foreground transition-all hover:border-primary/50 hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
        title={t('input.workerSlots', { defaultValue: 'Worker slots' })}
        aria-label={t('input.workerSlots', { defaultValue: 'Worker slots' })}
      >
        <Plus className="h-4 w-4" />
        {activeCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {activeCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute bottom-12 left-0 z-50 w-[min(34rem,calc(100vw-2rem))] rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-xl shadow-black/10">
          <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
            <div>
              <div className="text-sm font-medium">{t('input.workerSlots', { defaultValue: 'Worker slots' })}</div>
              <div className="text-xs text-muted-foreground">
                {t('input.workerSlotsDescription', { defaultValue: 'Run the same prompt in up to four extra projects or CLIs.' })}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t('common.close', { defaultValue: 'Close' })}
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 space-y-3">
            {normalizedSlots.map((slot, index) => (
              <div key={slot.id} className="rounded-md border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={slot.enabled}
                      onChange={(event) => updateSlot(slot.id, { enabled: event.target.checked })}
                      className="h-4 w-4"
                    />
                    {t('input.workerSlotLabel', { defaultValue: 'Worker {{index}}', index: index + 1 })}
                  </label>
                  <button
                    type="button"
                    onClick={() => removeSlot(slot.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={t('common.remove', { defaultValue: 'Remove' })}
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <label className="space-y-1 text-xs text-muted-foreground">
                    <span>{t('input.workerProvider', { defaultValue: 'Provider' })}</span>
                    <select
                      value={slot.provider}
                      onChange={(event) => updateSlot(slot.id, {
                        provider: event.target.value as WorkerSlot['provider'],
                        model: undefined,
                      })}
                      className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground"
                    >
                      {WORKER_SLOT_PROVIDERS.map((provider) => (
                        <option key={provider} value={provider}>{providerLabels[provider] || provider}</option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1 text-xs text-muted-foreground">
                    <span>{t('input.workerModel', { defaultValue: 'Model' })}</span>
                    <input
                      value={slot.model || resolveWorkerSlotModel(slot)}
                      onChange={(event) => updateSlot(slot.id, { model: event.target.value })}
                      className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground"
                    />
                  </label>
                </div>

                <label className="mt-2 block space-y-1 text-xs text-muted-foreground">
                  <span>{t('input.workerProjectPath', { defaultValue: 'Project path' })}</span>
                  <input
                    value={slot.projectPath || selectedProjectPath}
                    onChange={(event) => updateProjectPath(slot, event)}
                    placeholder={selectedProjectPath}
                    className="w-full rounded-md border border-border bg-background px-2 py-2 font-mono text-xs text-foreground"
                  />
                </label>
              </div>
            ))}

            <button
              type="button"
              onClick={onAddSlot}
              disabled={!canAddSlot}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {canAddSlot
                ? t('input.addWorkerSlot', { defaultValue: 'Add worker slot' })
                : t('input.workerSlotsFull', { defaultValue: 'Maximum four worker slots' })}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
