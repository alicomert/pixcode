import type { ChangedFilesTrackingMode } from '../../../../hooks/useChangedFilesMonitor';
import type { ChangedFileEntry, ChangedFileStatus } from '../../../../utils/changedFiles';
import { buildDiffLineHref, firstChangedLine } from '../../../../utils/diffAnchors';
import { cn } from '../../../../lib/utils';

import { FileCode, Loader2, RefreshCw } from '@/lib/icons';

type ChangedFilesActivityRailProps = {
  changedFiles: ChangedFileEntry[];
  isLoading: boolean;
  error: string | null;
  latestChangedFilePath: string | null;
  lastCheckedAt: number | null;
  trackingMode: ChangedFilesTrackingMode;
  onTrackingModeChange: (mode: ChangedFilesTrackingMode) => void;
  onRefresh: () => void;
  onOpenFile: (file: ChangedFileEntry) => void;
  variant?: 'rail' | 'panel';
};

const STATUS_LABEL: Record<ChangedFileStatus, string> = {
  M: 'M',
  A: 'A',
  D: 'D',
  U: 'U',
};

const STATUS_CLASS: Record<ChangedFileStatus, string> = {
  M: 'border-amber-400/40 bg-amber-500/10 text-amber-700 dark:text-amber-200',
  A: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200',
  D: 'border-red-400/40 bg-red-500/10 text-red-700 dark:text-red-200',
  U: 'border-sky-400/40 bg-sky-500/10 text-sky-700 dark:text-sky-200',
};

function formatTime(value: number | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(value);
}

export default function ChangedFilesActivityRail({
  changedFiles,
  isLoading,
  error,
  latestChangedFilePath,
  lastCheckedAt,
  trackingMode,
  onTrackingModeChange,
  onRefresh,
  onOpenFile,
  variant = 'rail',
}: ChangedFilesActivityRailProps) {
  const lastCheckedLabel = formatTime(lastCheckedAt);
  const isPanel = variant === 'panel';

  return (
    <aside
      className={cn(
        'h-full min-h-0 flex-col overflow-hidden bg-card/45',
        isPanel
          ? 'flex w-full rounded-none border-0'
          : 'hidden w-[260px] shrink-0 rounded-lg border border-border/60 shadow-sm xl:flex',
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.75)]" />
            Command Center
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {changedFiles.length > 0 ? `${changedFiles.length} local change${changedFiles.length === 1 ? '' : 's'}` : 'Watching agent writes'}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Refresh changed files"
          title="Refresh changed files"
        >
          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="border-b border-border/60 px-3 py-2">
        <div className="grid grid-cols-2 rounded-md border border-border bg-background p-0.5 text-[11px] font-medium">
          <button
            type="button"
            onClick={() => onTrackingModeChange('local')}
            className={`rounded px-2 py-1 transition-colors ${
              trackingMode === 'local'
                ? 'bg-foreground text-background shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
            title="Local changes: agent writes and filesystem edits"
          >
            Local changes
          </button>
          <button
            type="button"
            onClick={() => onTrackingModeChange('git')}
            className={`rounded px-2 py-1 transition-colors ${
              trackingMode === 'git'
                ? 'bg-foreground text-background shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
            title="Git changes: git status only"
          >
            Git changes
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-3 mt-3 rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1.5 text-[11px] leading-5 text-amber-700 dark:text-amber-200">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {changedFiles.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-3 text-center text-muted-foreground">
            <FileCode className="mb-2 h-8 w-8 opacity-45" />
            <p className="text-xs font-medium text-foreground">No local changes detected</p>
            <p className="mt-1 text-[11px] leading-5">
              When an agent writes or edits files, they will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {changedFiles.slice(0, 12).map((file) => {
              const isLatest = latestChangedFilePath === file.path;
              const changedLine = firstChangedLine(file.diffInfo);
              const lineHint = changedLine ? `L${changedLine}` : null;
              const diffLineHref = buildDiffLineHref(file.path, changedLine);
              return (
                <button
                  key={`${file.status}:${file.path}`}
                  type="button"
                  onClick={() => onOpenFile(file)}
                  className={`group flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-all ${
                    isLatest
                      ? 'changed-file-flash border-emerald-500/60 bg-emerald-500/15'
                      : 'border-border/60 bg-background/70 hover:border-emerald-500/35 hover:bg-emerald-500/10'
                  }`}
                  title={diffLineHref}
                >
                  <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded border px-1 text-[10px] font-semibold ${STATUS_CLASS[file.status]}`}>
                    {STATUS_LABEL[file.status]}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
                    {file.path}
                  </span>
                  {lineHint && (
                    <span className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {lineHint}
                    </span>
                  )}
                </button>
              );
            })}
            {changedFiles.length > 12 && (
              <p className="px-1 pt-1 text-[11px] text-muted-foreground">
                +{changedFiles.length - 12} more files
              </p>
            )}
          </div>
        )}
      </div>

      {lastCheckedLabel && (
        <div className="border-t border-border/60 px-3 py-2 text-[10px] text-muted-foreground">
          Last check {lastCheckedLabel}
        </div>
      )}
    </aside>
  );
}
