import { useTranslation } from 'react-i18next';

import { Input } from '../../../shared/view/ui';
import type { GithubTokenCredential, TokenMode } from '../types';

import { Github, Key, Loader2 } from '@/lib/icons';

type GithubAuthenticationCardProps = {
  tokenMode: TokenMode;
  selectedGithubToken: string;
  newGithubToken: string;
  availableTokens: GithubTokenCredential[];
  loadingTokens: boolean;
  tokenLoadError: string | null;
  githubOAuthStatus: 'idle' | 'starting' | 'waiting' | 'success' | 'error';
  githubOAuthError: string;
  onTokenModeChange: (tokenMode: TokenMode) => void;
  onSelectedGithubTokenChange: (tokenId: string) => void;
  onNewGithubTokenChange: (tokenValue: string) => void;
  onStartGithubOAuth: () => void;
};

const getModeClassName = (mode: TokenMode, selectedMode: TokenMode) =>
  `px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
    mode === selectedMode
      ? mode === 'none'
        ? 'bg-green-500 text-white'
        : 'bg-blue-500 text-white'
      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
  }`;

export default function GithubAuthenticationCard({
  tokenMode,
  selectedGithubToken,
  newGithubToken,
  availableTokens,
  loadingTokens,
  tokenLoadError,
  githubOAuthStatus,
  githubOAuthError,
  onTokenModeChange,
  onSelectedGithubTokenChange,
  onNewGithubTokenChange,
  onStartGithubOAuth,
}: GithubAuthenticationCardProps) {
  const { t } = useTranslation();

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
      <div className="mb-4 flex items-start gap-3">
        <Key className="mt-0.5 h-5 w-5 flex-shrink-0 text-gray-600 dark:text-gray-400" />
        <div className="flex-1">
          <h5 className="mb-1 font-medium text-gray-900 dark:text-white">
            {t('projectWizard.step2.githubAuth')}
          </h5>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('projectWizard.step2.githubAuthHelp')}
          </p>
        </div>
      </div>

      {loadingTokens && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('projectWizard.step2.loadingTokens')}
        </div>
      )}

      {!loadingTokens && tokenLoadError && (
        <p className="mb-3 text-sm text-red-600 dark:text-red-400">{tokenLoadError}</p>
      )}

      {!loadingTokens && (
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50/70 p-3 dark:border-blue-800 dark:bg-blue-900/20 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Connect with GitHub OAuth</p>
            <p className="mt-1 text-xs text-blue-800/80 dark:text-blue-200/80">
              Authorize Pixcode without copying a personal access token. The active credential is used for this clone.
            </p>
            {githubOAuthStatus === 'success' && (
              <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300" role="status">GitHub connected.</p>
            )}
            {githubOAuthStatus === 'error' && githubOAuthError && (
              <p className="mt-1 text-xs text-red-700 dark:text-red-300" role="alert">{githubOAuthError}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onStartGithubOAuth}
            disabled={githubOAuthStatus === 'starting' || githubOAuthStatus === 'waiting'}
            className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-medium text-blue-900 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-100 dark:hover:bg-blue-900/60"
          >
            <Github className="h-4 w-4" />
            {githubOAuthStatus === 'starting' || githubOAuthStatus === 'waiting' ? 'Waiting for GitHub...' : 'Connect with GitHub'}
          </button>
        </div>
      )}

      {!loadingTokens && availableTokens.length > 0 && (
        <>
          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => onTokenModeChange('stored')}
              className={`min-h-11 ${getModeClassName(tokenMode, 'stored')}`}
            >
              {t('projectWizard.step2.storedToken')}
            </button>
            <button
              type="button"
              onClick={() => onTokenModeChange('new')}
              className={`min-h-11 ${getModeClassName(tokenMode, 'new')}`}
            >
              {t('projectWizard.step2.newToken')}
            </button>
            <button
              type="button"
              onClick={() => {
                onTokenModeChange('none');
                onSelectedGithubTokenChange('');
                onNewGithubTokenChange('');
              }}
              className={`min-h-11 ${getModeClassName(tokenMode, 'none')}`}
            >
              {t('projectWizard.step2.nonePublic')}
            </button>
          </div>

          {tokenMode === 'stored' ? (
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('projectWizard.step2.selectToken')}
              </label>
              <select
                value={selectedGithubToken}
                onChange={(event) => onSelectedGithubTokenChange(event.target.value)}
                className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
              >
                <option value="">{t('projectWizard.step2.selectTokenPlaceholder')}</option>
                {availableTokens.map((token) => (
                  <option key={token.id} value={String(token.id)}>
                    {token.credential_name}
                  </option>
                ))}
              </select>
            </div>
          ) : tokenMode === 'new' ? (
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('projectWizard.step2.newToken')}
              </label>
              <Input
                type="password"
                value={newGithubToken}
                onChange={(event) => onNewGithubTokenChange(event.target.value)}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="min-h-11 w-full"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t('projectWizard.step2.tokenHelp')}
              </p>
            </div>
          ) : null}
        </>
      )}

      {!loadingTokens && availableTokens.length === 0 && (
        <div className="space-y-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              {t('projectWizard.step2.publicRepoInfo')}
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('projectWizard.step2.optionalTokenPublic')}
            </label>
            <Input
              type="password"
              value={newGithubToken}
              onChange={(event) => {
                const tokenValue = event.target.value;
                onNewGithubTokenChange(tokenValue);
                onTokenModeChange(tokenValue.trim() ? 'new' : 'none');
              }}
              placeholder={t('projectWizard.step2.tokenPublicPlaceholder')}
              className="min-h-11 w-full"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t('projectWizard.step2.noTokensHelp')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
