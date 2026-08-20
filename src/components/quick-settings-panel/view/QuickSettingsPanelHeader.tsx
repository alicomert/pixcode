import { useTranslation } from 'react-i18next';

import { Settings2, X } from '@/lib/icons';

export default function QuickSettingsPanelHeader({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('settings');

  return (
    <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
      <h3 id="pixcode-quick-settings-title" className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
        <Settings2 className="h-5 w-5 text-gray-600 dark:text-gray-400" />
        {t('quickSettings.title')}
      </h3>
      <button
        type="button"
        data-quick-settings-close
        onClick={onClose}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-200 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-white"
        aria-label={t('quickSettings.close', { defaultValue: 'Close quick settings' })}
        title={t('quickSettings.close', { defaultValue: 'Close quick settings' })}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
