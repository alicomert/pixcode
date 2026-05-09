import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  DEFAULT_V137_ISSUE_PROGRESS,
  extractIssueProgress,
  type ReleaseIssueProgressItem,
} from '../utils/releaseIssueProgress';

type ReleaseIssueProgressProps = {
  releaseBody: string;
  version: string | null;
};

const stateStyles: Record<ReleaseIssueProgressItem['state'], string> = {
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200',
  in_progress: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200',
  pending: 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300',
};

const stateLabels: Record<ReleaseIssueProgressItem['state'], string> = {
  completed: 'Done',
  in_progress: 'Active',
  pending: 'Queued',
};

function progressItemsForRelease(releaseBody: string, version: string | null) {
  const parsedItems = extractIssueProgress(releaseBody);
  if (parsedItems.length > 0) return parsedItems;

  if (version?.startsWith('1.37')) {
    return DEFAULT_V137_ISSUE_PROGRESS;
  }

  return [];
}

export function ReleaseIssueProgress({ releaseBody, version }: ReleaseIssueProgressProps) {
  const { t } = useTranslation('common');
  const items = useMemo(
    () => progressItemsForRelease(releaseBody, version),
    [releaseBody, version],
  );

  if (items.length === 0) return null;

  const completedCount = items.filter((item) => item.state === 'completed').length;
  const progressPercent = Math.round((completedCount / items.length) * 100);

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/30">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            {t('versionUpdate.issueProgress.title', { defaultValue: 'Issue Progress' })}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('versionUpdate.issueProgress.subtitle', {
              defaultValue: 'Release work mapped to GitHub issues and tasks.',
            })}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-sm font-semibold text-gray-900 dark:text-white">
            {completedCount}/{items.length}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{progressPercent}%</div>
        </div>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="grid gap-2">
        {items.map((item) => (
          <div
            key={`${item.issue}-${item.title}`}
            className="flex items-start justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/60"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold text-gray-500 dark:text-gray-400">
                  {item.issue}
                </span>
                <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
                  {item.title}
                </span>
              </div>
            </div>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${stateStyles[item.state]}`}>
              {stateLabels[item.state]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
