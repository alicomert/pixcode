import { useTranslation } from 'react-i18next';

import { Button, Input } from '../../../../../../shared/view/ui';
import type { GithubCredentialItem } from '../types';

import { Eye, EyeOff, Github, Plus, Trash2 } from '@/lib/icons';

type GithubCredentialsSectionProps = {
  githubCredentials: GithubCredentialItem[];
  showNewGithubForm: boolean;
  showNewTokenPlainText: boolean;
  newGithubName: string;
  newGithubToken: string;
  newGithubDescription: string;
  onShowNewGithubFormChange: (value: boolean) => void;
  onNewGithubNameChange: (value: string) => void;
  onNewGithubTokenChange: (value: string) => void;
  onNewGithubDescriptionChange: (value: string) => void;
  onToggleNewTokenVisibility: () => void;
  onCreateGithubCredential: () => void;
  onCancelCreateGithubCredential: () => void;
  onToggleGithubCredential: (credentialId: string, isActive: boolean) => void;
  onDeleteGithubCredential: (credentialId: string) => void;
  githubOAuthStatus: 'idle' | 'starting' | 'waiting' | 'success' | 'error';
  githubOAuthError: string;
  onStartGithubOAuth: () => void;
};

export default function GithubCredentialsSection({
  githubCredentials,
  showNewGithubForm,
  showNewTokenPlainText,
  newGithubName,
  newGithubToken,
  newGithubDescription,
  onShowNewGithubFormChange,
  onNewGithubNameChange,
  onNewGithubTokenChange,
  onNewGithubDescriptionChange,
  onToggleNewTokenVisibility,
  onCreateGithubCredential,
  onCancelCreateGithubCredential,
  onToggleGithubCredential,
  onDeleteGithubCredential,
  githubOAuthStatus,
  githubOAuthError,
  onStartGithubOAuth,
}: GithubCredentialsSectionProps) {
  const { t } = useTranslation('settings');

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Github className="h-5 w-5" />
          <h3 className="text-lg font-semibold">{t('apiKeys.github.title')}</h3>
        </div>
        <Button type="button" size="sm" className="min-h-11" onClick={() => onShowNewGithubFormChange(!showNewGithubForm)}>
          <Plus className="mr-1 h-4 w-4" />
          {t('apiKeys.github.addButton')}
        </Button>
      </div>

      <p className="mb-4 text-sm text-muted-foreground">
        {t('apiKeys.github.oauthDescription', {
          defaultValue: 'Connect GitHub securely with OAuth; a personal access token is available only as a legacy fallback.',
        })}
      </p>

      <div className="mb-4 flex flex-col gap-3 rounded-lg border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="font-medium">
            {t('apiKeys.github.oauthTitle', { defaultValue: 'Connect GitHub securely' })}
          </div>
          <p className="text-sm text-muted-foreground">
            {t('apiKeys.github.oauthDescription', {
              defaultValue: 'Authorize Pixcode in GitHub without copying a personal access token.',
            })}
          </p>
          {githubOAuthStatus === 'success' && (
            <p className="mt-1 text-sm text-emerald-600" role="status">
              {t('apiKeys.github.oauthSuccess', { defaultValue: 'GitHub connected.' })}
            </p>
          )}
          {githubOAuthStatus === 'error' && githubOAuthError && (
            <p className="mt-1 text-sm text-destructive" role="alert">{githubOAuthError}</p>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 shrink-0"
          disabled={githubOAuthStatus === 'starting' || githubOAuthStatus === 'waiting'}
          onClick={onStartGithubOAuth}
        >
          <Github className="h-4 w-4" />
          {githubOAuthStatus === 'starting' || githubOAuthStatus === 'waiting'
            ? t('apiKeys.github.oauthWaiting', { defaultValue: 'Waiting for GitHub…' })
            : t('apiKeys.github.oauthButton', { defaultValue: 'Connect with GitHub' })}
        </Button>
      </div>

      <details
        className="mb-4 rounded-lg border p-4"
        open={showNewGithubForm}
        onToggle={(event) => onShowNewGithubFormChange(event.currentTarget.open)}
      >
        <summary className="cursor-pointer text-sm font-medium">
          {t('apiKeys.github.legacyTitle', { defaultValue: 'Use a personal access token instead' })}
        </summary>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('apiKeys.github.legacyDescription', {
            defaultValue: 'Only use this legacy option when GitHub OAuth is unavailable.',
          })}
        </p>

        {showNewGithubForm && (
          <div className="mt-3 space-y-3 rounded-lg border bg-card p-4">
            <Input
              placeholder={t('apiKeys.github.form.namePlaceholder')}
              value={newGithubName}
              onChange={(event) => onNewGithubNameChange(event.target.value)}
            />

            <div className="relative">
              <Input
                type={showNewTokenPlainText ? 'text' : 'password'}
                placeholder={t('apiKeys.github.form.tokenPlaceholder')}
                value={newGithubToken}
                onChange={(event) => onNewGithubTokenChange(event.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={onToggleNewTokenVisibility}
                aria-label={showNewTokenPlainText ? 'Hide token' : 'Show token'}
                className="absolute right-2 top-1/2 min-h-11 min-w-11 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showNewTokenPlainText ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            <Input
              placeholder={t('apiKeys.github.form.descriptionPlaceholder')}
              value={newGithubDescription}
              onChange={(event) => onNewGithubDescriptionChange(event.target.value)}
            />

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={onCreateGithubCredential}>{t('apiKeys.github.form.addButton')}</Button>
              <Button type="button" variant="outline" onClick={onCancelCreateGithubCredential}>
                {t('apiKeys.github.form.cancelButton')}
              </Button>
            </div>

            <a
              href="https://github.com/settings/tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-primary hover:underline"
            >
              {t('apiKeys.github.form.howToCreate')}
            </a>
          </div>
        )}
      </details>

      <div className="space-y-2">
        {githubCredentials.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">{t('apiKeys.github.empty')}</p>
        ) : (
          githubCredentials.map((credential) => (
            <div key={credential.id} className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex-1">
                <div className="font-medium">{credential.credential_name}</div>
                {credential.description && (
                  <div className="text-xs text-muted-foreground">{credential.description}</div>
                )}
                <div className="mt-1 text-xs text-muted-foreground">
                  {t('apiKeys.github.added')} {new Date(credential.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={credential.is_active ? 'outline' : 'secondary'}
                  onClick={() => onToggleGithubCredential(credential.id, credential.is_active)}
                >
                  {credential.is_active ? t('apiKeys.status.active') : t('apiKeys.status.inactive')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onDeleteGithubCredential(credential.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
