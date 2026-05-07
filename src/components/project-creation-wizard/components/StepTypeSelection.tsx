import { useTranslation } from 'react-i18next';

import type { WorkspaceType } from '../types';

import { FolderOpen, FolderPlus, GitBranch } from '@/lib/icons';

type StepTypeSelectionProps = {
  workspaceType: WorkspaceType;
  onWorkspaceTypeChange: (workspaceType: WorkspaceType) => void;
};

// One card per supported flow. Order is intentional: open existing first
// because that's the most common, clone second (network-heavy, less common),
// subfolder last (the "I want to organise things" path).
const FLOWS: ReadonlyArray<{
  id: WorkspaceType;
  iconKey: 'folderOpen' | 'gitBranch' | 'folderPlus';
  accent: { active: string; tint: string; iconBg: string; iconFg: string };
  i18nKey: 'existing' | 'githubClone' | 'subfolder';
}> = [
  {
    id: 'existing',
    iconKey: 'folderOpen',
    i18nKey: 'existing',
    accent: {
      active: 'border-blue-500 bg-blue-50 dark:bg-blue-900/20',
      tint: 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600',
      iconBg: 'bg-blue-100 dark:bg-blue-900/50',
      iconFg: 'text-blue-600 dark:text-blue-400',
    },
  },
  {
    id: 'new',
    iconKey: 'gitBranch',
    i18nKey: 'githubClone',
    accent: {
      active: 'border-blue-500 bg-blue-50 dark:bg-blue-900/20',
      tint: 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600',
      iconBg: 'bg-purple-100 dark:bg-purple-900/50',
      iconFg: 'text-purple-600 dark:text-purple-400',
    },
  },
  {
    id: 'subfolder',
    iconKey: 'folderPlus',
    i18nKey: 'subfolder',
    accent: {
      active: 'border-blue-500 bg-blue-50 dark:bg-blue-900/20',
      tint: 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600',
      iconBg: 'bg-green-100 dark:bg-green-900/50',
      iconFg: 'text-green-600 dark:text-green-400',
    },
  },
];

export default function StepTypeSelection({
  workspaceType,
  onWorkspaceTypeChange,
}: StepTypeSelectionProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <h4 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
        {t('projectWizard.step1.question')}
      </h4>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {FLOWS.map((flow) => {
          const isActive = workspaceType === flow.id;
          const Icon = flow.iconKey === 'folderOpen' ? FolderOpen : flow.iconKey === 'gitBranch' ? GitBranch : FolderPlus;
          return (
            <button
              key={flow.id}
              onClick={() => onWorkspaceTypeChange(flow.id)}
              className={`rounded-lg border-2 p-4 text-left transition-all ${
                isActive ? flow.accent.active : flow.accent.tint
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${flow.accent.iconBg}`}>
                  <Icon className={`h-5 w-5 ${flow.accent.iconFg}`} />
                </div>
                <div className="flex-1">
                  <h5 className="mb-1 font-semibold text-gray-900 dark:text-white">
                    {t(`projectWizard.step1.${flow.i18nKey}.title`)}
                  </h5>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t(`projectWizard.step1.${flow.i18nKey}.description`)}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
