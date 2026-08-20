import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useGitSettings } from '../../../hooks/useGitSettings';
import { Button, Input } from '../../../../../shared/view/ui';
import SettingsCard from '../../SettingsCard';
import SettingsSection from '../../SettingsSection';

import { Check, Eye, EyeOff, Github, KeyRound } from '@/lib/icons';

export default function GitSettingsTab() {
  const { t } = useTranslation('settings');
  const {
    gitName,
    setGitName,
    gitEmail,
    setGitEmail,
    githubToken,
    setGithubToken,
    hasGithubToken,
    isLoading,
    isSaving,
    saveStatus,
    saveGitConfig,
    githubOAuthStatus,
    githubOAuthError,
    startGithubOAuth,
  } = useGitSettings();
  const [showToken, setShowToken] = useState(false);

  return (
    <div className="space-y-8">
      <SettingsSection
        title={t('git.title', { defaultValue: 'Git identity' })}
        description={t('git.identityDescription', {
          defaultValue: 'Commit name/email stored by Pixcode (not system-wide git config). Used for commits from the UI.',
        })}
      >
        <SettingsCard className="p-4">
          <div className="space-y-4">
            <div>
              <label htmlFor="settings-git-name" className="mb-2 block text-sm font-medium text-foreground">
                {t('git.name.label', { defaultValue: 'Name' })}
              </label>
              <Input
                id="settings-git-name"
                type="text"
                value={gitName}
                onChange={(event) => setGitName(event.target.value)}
                placeholder="John Doe"
                disabled={isLoading}
                className="w-full"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t('git.name.help', {
                  defaultValue: 'Saved in Pixcode database and ~/.pixcode/gitconfig - never git config --global.',
                })}
              </p>
            </div>

            <div>
              <label htmlFor="settings-git-email" className="mb-2 block text-sm font-medium text-foreground">
                {t('git.email.label', { defaultValue: 'Email' })}
              </label>
              <Input
                id="settings-git-email"
                type="email"
                value={gitEmail}
                onChange={(event) => setGitEmail(event.target.value)}
                placeholder="john@example.com"
                disabled={isLoading}
                className="w-full"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t('git.email.help', { defaultValue: 'Used as GIT_AUTHOR_EMAIL / committer for UI git actions.' })}
              </p>
            </div>
          </div>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection
        title={t('git.github.title', { defaultValue: 'GitHub access' })}
        description={t('git.github.oauthDescription', {
          defaultValue: 'Connect GitHub securely for private repository clone, fetch, pull, and push.',
        })}
      >
        <SettingsCard className="p-4">
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm">
                <Github className="h-4 w-4 shrink-0" />
                {hasGithubToken ? (
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    {t('git.github.connected', { defaultValue: 'GitHub connected' })}
                  </span>
                ) : (
                  <span className="font-medium text-foreground">
                    {t('git.github.connectTitle', { defaultValue: 'Connect GitHub' })}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('git.github.oauthHelp', {
                  defaultValue: 'Authorize Pixcode in GitHub without copying a personal access token.',
                })}
              </p>
              {githubOAuthStatus === 'success' && (
                <p className="mt-1 text-xs text-emerald-600" role="status">
                  {t('git.github.oauthSuccess', { defaultValue: 'GitHub authorization saved.' })}
                </p>
              )}
              {githubOAuthStatus === 'error' && githubOAuthError && (
                <p className="mt-1 text-xs text-destructive" role="alert">{githubOAuthError}</p>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 shrink-0"
              disabled={githubOAuthStatus === 'starting' || githubOAuthStatus === 'waiting'}
              onClick={startGithubOAuth}
            >
              <Github className="h-4 w-4" />
              {githubOAuthStatus === 'starting' || githubOAuthStatus === 'waiting'
                ? t('git.github.oauthWaiting', { defaultValue: 'Waiting for GitHub...' })
                : t('git.github.oauthButton', { defaultValue: 'Connect with GitHub' })}
            </Button>
          </div>

          <details className="mt-4 rounded-lg border p-4">
            <summary className="cursor-pointer text-sm font-medium">
              {t('git.github.legacyTitle', { defaultValue: 'Use a personal access token instead' })}
            </summary>
            <p className="mt-2 text-xs text-muted-foreground">
              {t('git.github.legacyHelp', {
                defaultValue: 'Legacy fallback for self-hosted setups where GitHub OAuth is unavailable. The token is encrypted in Pixcode credential storage.',
              })}
            </p>
            <div className="mt-3 space-y-3">
              <label htmlFor="settings-github-token" className="block text-sm font-medium text-foreground">
                {hasGithubToken ? 'Replace token' : 'Add GitHub PAT'}
              </label>
              <div className="relative">
                <Input
                  id="settings-github-token"
                  type={showToken ? 'text' : 'password'}
                  value={githubToken}
                  onChange={(event) => setGithubToken(event.target.value)}
                  placeholder="ghp_... or github_pat_..."
                  disabled={isLoading}
                  className="w-full pr-12"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((value) => !value)}
                  className="absolute right-1 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
                  aria-label={showToken ? 'Hide token' : 'Show token'}
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Classic token with
                  {' '}
                  <code className="rounded bg-muted px-1">repo</code>
                  {' '}
                  scope.
                  {' '}
                  <a
                    href="https://github.com/settings/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Create on GitHub
                  </a>
                  . You can also manage tokens under Settings -&gt; API keys.
                </span>
              </p>
            </div>
          </details>
        </SettingsCard>
      </SettingsSection>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={saveGitConfig}
          disabled={isSaving || !gitName.trim() || !gitEmail.trim()}
        >
          {isSaving ? t('git.actions.saving', { defaultValue: 'Saving...' }) : t('git.actions.save', { defaultValue: 'Save Git settings' })}
        </Button>

        {saveStatus === 'success' && (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400" role="status">
            <Check className="h-4 w-4" />
            {t('git.status.success', { defaultValue: 'Saved' })}
          </div>
        )}
        {saveStatus === 'error' && (
          <div className="text-sm text-destructive" role="alert">Failed to save. Check logs and try again.</div>
        )}
      </div>
    </div>
  );
}
