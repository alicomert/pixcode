export const PIXCODE_RUN_STATE_REFRESH_EVENT = 'pixcode:run-state-refresh';

export type PixcodeRunStateRefreshReason =
  | 'run-started'
  | 'tool-activity'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'reconnect';

export type PixcodeRunStateRefreshSource = 'chat' | 'tasks' | 'system';

export type PixcodeRunStateRefreshDetail = {
  source: PixcodeRunStateRefreshSource;
  reason: PixcodeRunStateRefreshReason;
  projectName?: string | null;
  sessionId?: string | null;
  runId?: string | null;
};

export function dispatchRunStateRefresh(detail: PixcodeRunStateRefreshDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PIXCODE_RUN_STATE_REFRESH_EVENT, { detail }));
}
