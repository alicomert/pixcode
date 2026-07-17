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
  } = useGitSettings();
  const [showToken, setShowToken] = useState(false);

  return (
    <div className="space-y-8">
      <SettingsSection
        title={t('git.title', { defaultValue: 'Git identity' })}
        description={t('git.description', {
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
                  defaultValue: 'Saved in Pixcode database and ~/.pixcode/gitconfig — never git config --global.',
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
        description={t('git.github.description', {
          defaultValue: 'Personal Access Token for private repos (clone, fetch, pull, push). Managed by Pixcode credentials store.',
        })}
      >
        <SettingsCard className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm">
            <Github className="h-4 w-4" />
            {hasGithubToken ? (
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                Active GitHub token configured
              </span>
            ) : (
              <span className="text-muted-foreground">No active GitHub token — private repos will fail to clone</span>
            )}
          </div>

          <div className="space-y-3">
            <label htmlFor="settings-github-token" className="block text-sm font-medium text-foreground">
              {hasGithubToken ? 'Replace token' : 'Add GitHub PAT'}
            </label>
            <div className="relative">
              <Input
                id="settings-github-token"
                type={showToken ? 'text' : 'password'}
                value={githubToken}
                onChange={(event) => setGithubToken(event.target.value)}
                placeholder="ghp_… or github_pat_…"
                disabled={isLoading}
                className="w-full pr-10"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowToken((value) => !value)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
                . You can also manage tokens under Settings → API keys.
              </span>
            </p>
          </div>
        </SettingsCard>
      </SettingsSection>

      <div className="flex items-center gap-2">
        <Button
          onClick={saveGitConfig}
          disabled={isSaving || !gitName.trim() || !gitEmail.trim()}
        >
          {isSaving ? t('git.actions.saving', { defaultValue: 'Saving…' }) : t('git.actions.save', { defaultValue: 'Save Git settings' })}
        </Button>

        {saveStatus === 'success' && (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <Check className="h-4 w-4" />
            {t('git.status.success', { defaultValue: 'Saved' })}
          </div>
        )}
        {saveStatus === 'error' && (
          <div className="text-sm text-destructive">Failed to save. Check logs and try again.</div>
        )}
      </div>
    </div>
  );
}
