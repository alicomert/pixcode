import { useTranslation } from 'react-i18next';

type StandaloneShellHeaderProps = {
  title: string;
  isCompleted: boolean;
  onClose?: (() => void) | null;
};

export default function StandaloneShellHeader({
  title,
  isCompleted,
  onClose = null,
}: StandaloneShellHeaderProps) {
  const { t } = useTranslation('common');

  return (
    <div className="flex-shrink-0 border-b border-gray-700 bg-gray-800 px-4 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <h3 className="text-sm font-medium text-gray-200">{title}</h3>
          {isCompleted && (
            <span className="text-xs text-green-400" role="status">
              ({t('status.completed', { defaultValue: 'Completed' })})
            </span>
          )}
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-10 min-w-10 items-center justify-center rounded text-gray-400 hover:bg-gray-700/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            title={t('buttons.close', { defaultValue: 'Close' })}
            aria-label={t('buttons.close', { defaultValue: 'Close' })}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
