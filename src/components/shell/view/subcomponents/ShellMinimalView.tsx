import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RefObject } from 'react';

import type { AuthCopyStatus } from '../../types/types';
import { resolveAuthUrlForDisplay } from '../../utils/auth';

type ShellMinimalViewProps = {
  terminalContainerRef: RefObject<HTMLDivElement>;
  authUrl: string;
  authUrlVersion: number;
  initialCommand: string | null | undefined;
  isConnected: boolean;
  openAuthUrlInBrowser: (url: string) => boolean;
  copyAuthUrlToClipboard: (url: string) => Promise<boolean>;
};

export default function ShellMinimalView({
  terminalContainerRef,
  authUrl,
  authUrlVersion,
  initialCommand,
  isConnected,
  openAuthUrlInBrowser,
  copyAuthUrlToClipboard,
}: ShellMinimalViewProps) {
  const { t } = useTranslation('chat');
  const [authUrlCopyStatus, setAuthUrlCopyStatus] = useState<AuthCopyStatus>('idle');
  const [isAuthPanelHidden, setIsAuthPanelHidden] = useState(false);

  const displayAuthUrl = useMemo(
    () => resolveAuthUrlForDisplay(initialCommand, authUrl),
    [authUrl, initialCommand],
  );

  // Keep auth panel UI state local to minimal mode and reset it when connection/url changes.
  useEffect(() => {
    setAuthUrlCopyStatus('idle');
    setIsAuthPanelHidden(false);
  }, [authUrlVersion, displayAuthUrl, isConnected]);

  const hasAuthUrl = Boolean(displayAuthUrl);
  const showMobileAuthPanel = hasAuthUrl && !isAuthPanelHidden;
  const showMobileAuthPanelToggle = hasAuthUrl && isAuthPanelHidden;

  return (
    <div className="relative h-full w-full min-w-0 overflow-hidden bg-gray-900 pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-0">
      <div
        ref={terminalContainerRef}
        className="pixcode-shell-terminal h-full min-h-0 w-full min-w-0 max-w-full focus:outline-none"
        style={{ outline: 'none' }}
      />

      {showMobileAuthPanel && (
        <div className="absolute inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-20 border-t border-gray-700/80 bg-gray-900/95 p-3 backdrop-blur-sm md:hidden">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-gray-300">
                {t('shell.auth.openOrCopy', { defaultValue: 'Open or copy the login URL:' })}
              </p>
              <button
                type="button"
                onClick={() => setIsAuthPanelHidden(true)}
                className="min-h-11 rounded bg-gray-700 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-gray-100 hover:bg-gray-600"
                aria-label={t('shell.auth.hide', { defaultValue: 'Hide login URL' })}
              >
                {t('shell.auth.hide', { defaultValue: 'Hide' })}
              </button>
            </div>

            <input
              type="text"
              value={displayAuthUrl}
              readOnly
              onClick={(event) => event.currentTarget.select()}
              className="min-h-11 w-full rounded border border-gray-600 bg-gray-800 px-2 py-1 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              aria-label={t('shell.auth.urlLabel', { defaultValue: 'Authentication URL' })}
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  openAuthUrlInBrowser(displayAuthUrl);
                }}
                className="min-h-11 flex-1 rounded bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
                aria-label={t('shell.auth.open', { defaultValue: 'Open login URL' })}
              >
                {t('shell.auth.open', { defaultValue: 'Open URL' })}
              </button>

              <button
                type="button"
                onClick={async () => {
                  const copied = await copyAuthUrlToClipboard(displayAuthUrl);
                  setAuthUrlCopyStatus(copied ? 'copied' : 'failed');
                }}
                className="min-h-11 flex-1 rounded bg-gray-700 px-3 py-2 text-xs font-medium text-white hover:bg-gray-600"
                aria-label={t('shell.auth.copy', { defaultValue: 'Copy login URL' })}
              >
                {authUrlCopyStatus === 'copied'
                  ? t('shell.auth.copied', { defaultValue: 'Copied' })
                  : t('shell.auth.copy', { defaultValue: 'Copy URL' })}
              </button>
            </div>
          </div>
        </div>
      )}

      {showMobileAuthPanelToggle && (
        <div className="absolute bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] right-3 z-20 md:hidden">
          <button
            type="button"
            onClick={() => setIsAuthPanelHidden(false)}
            className="min-h-11 rounded bg-gray-800/95 px-3 py-2 text-xs font-medium text-gray-100 shadow-lg backdrop-blur-sm hover:bg-gray-700"
            aria-label={t('shell.auth.show', { defaultValue: 'Show login URL' })}
          >
            {t('shell.auth.show', { defaultValue: 'Show login URL' })}
          </button>
        </div>
      )}
    </div>
  );
}
