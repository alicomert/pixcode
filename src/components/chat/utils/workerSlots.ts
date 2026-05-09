import {
  CLAUDE_MODELS,
  CODEX_MODELS,
  CURSOR_MODELS,
  GEMINI_MODELS,
  OPENCODE_MODELS,
  QWEN_MODELS,
} from '../../../../shared/modelConstants';
import type { LLMProvider } from '../../../types/app';

export const MAX_WORKER_SLOTS = 4;
export const WORKER_SLOTS_STORAGE_KEY = 'pixcode.workerSlots.v1';

export type WorkerSlot = {
  id: string;
  enabled: boolean;
  provider: LLMProvider;
  model?: string;
  projectName?: string;
  projectPath?: string;
  mode: 'new_chat' | 'current_project';
};

const PROVIDER_DEFAULT_MODELS: Record<LLMProvider, string> = {
  claude: CLAUDE_MODELS.DEFAULT,
  cursor: CURSOR_MODELS.DEFAULT,
  codex: CODEX_MODELS.DEFAULT,
  gemini: GEMINI_MODELS.DEFAULT,
  qwen: QWEN_MODELS.DEFAULT,
  opencode: OPENCODE_MODELS.DEFAULT,
};

export const WORKER_SLOT_PROVIDERS: LLMProvider[] = [
  'claude',
  'cursor',
  'codex',
  'gemini',
  'qwen',
  'opencode',
];

export function createWorkerSlot(overrides: Partial<WorkerSlot> = {}): WorkerSlot {
  const provider = overrides.provider || 'claude';
  return {
    id: overrides.id || `worker-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    enabled: overrides.enabled ?? true,
    provider,
    model: overrides.model || PROVIDER_DEFAULT_MODELS[provider],
    projectName: overrides.projectName,
    projectPath: overrides.projectPath,
    mode: overrides.mode || 'current_project',
  };
}

export function resolveWorkerSlotModel(slot: WorkerSlot): string {
  return slot.model || PROVIDER_DEFAULT_MODELS[slot.provider];
}

export function normalizeWorkerSlots(value: unknown): WorkerSlot[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, MAX_WORKER_SLOTS)
    .map((item) => {
      const record = item && typeof item === 'object' ? item as Partial<WorkerSlot> : {};
      const provider = WORKER_SLOT_PROVIDERS.includes(record.provider as LLMProvider)
        ? record.provider as LLMProvider
        : 'claude';
      return createWorkerSlot({
        id: typeof record.id === 'string' ? record.id : undefined,
        enabled: record.enabled !== false,
        provider,
        model: typeof record.model === 'string' ? record.model : PROVIDER_DEFAULT_MODELS[provider],
        projectName: typeof record.projectName === 'string' ? record.projectName : undefined,
        projectPath: typeof record.projectPath === 'string' ? record.projectPath : undefined,
        mode: record.mode === 'new_chat' ? 'new_chat' : 'current_project',
      });
    });
}

export function readWorkerSlots(): WorkerSlot[] {
  try {
    return normalizeWorkerSlots(JSON.parse(localStorage.getItem(WORKER_SLOTS_STORAGE_KEY) || '[]'));
  } catch {
    return [];
  }
}

export function persistWorkerSlots(slots: WorkerSlot[]) {
  try {
    localStorage.setItem(WORKER_SLOTS_STORAGE_KEY, JSON.stringify(slots.slice(0, MAX_WORKER_SLOTS)));
  } catch {
    // Non-fatal: worker slots still work for the current tab.
  }
}
