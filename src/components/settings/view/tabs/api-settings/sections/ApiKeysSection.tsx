import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Input } from '../../../../../../shared/view/ui';
import {
  API_KEY_ELEVATED_SCOPE_OPTIONS,
  API_KEY_SCOPE_OPTIONS,
  type ApiKeyItem,
  type ApiKeyScope,
} from '../types';

import { Check, Edit, ExternalLink, Key, Plus, Trash2, X } from '@/lib/icons';

type ApiKeysSectionProps = {
  apiKeys: ApiKeyItem[];
  showNewKeyForm: boolean;
  newKeyName: string;
  newKeyScopes: ApiKeyScope[];
  canGrantElevatedScopes: boolean;
  onShowNewKeyFormChange: (value: boolean) => void;
  onNewKeyNameChange: (value: string) => void;
  onNewKeyScopesChange: (value: ApiKeyScope[]) => void;
  onCreateApiKey: () => void;
  onCancelCreateApiKey: () => void;
  onToggleApiKey: (keyId: string, isActive: boolean) => void;
  onUpdateApiKeyScopes: (keyId: string, scopes: ApiKeyScope[]) => Promise<boolean>;
  onDeleteApiKey: (keyId: string) => void;
};

export default function ApiKeysSection({
  apiKeys,
  showNewKeyForm,
  newKeyName,
  newKeyScopes,
  canGrantElevatedScopes,
  onShowNewKeyFormChange,
  onNewKeyNameChange,
  onNewKeyScopesChange,
  onCreateApiKey,
  onCancelCreateApiKey,
  onToggleApiKey,
  onUpdateApiKeyScopes,
  onDeleteApiKey,
}: ApiKeysSectionProps) {
  const { t } = useTranslation('settings');
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null);
  const [editingScopes, setEditingScopes] = useState<ApiKeyScope[]>([]);
  const [savingScopes, setSavingScopes] = useState(false);

  const visibleScopeOptions = canGrantElevatedScopes
    ? [...API_KEY_SCOPE_OPTIONS, ...API_KEY_ELEVATED_SCOPE_OPTIONS]
    : API_KEY_SCOPE_OPTIONS;

  const toggleScope = (scope: ApiKeyScope) => {
    const next = new Set(newKeyScopes);
    if (next.has(scope)) next.delete(scope);
    else next.add(scope);
    onNewKeyScopesChange(Array.from(next));
  };

  const selectAllScopes = () => {
    onNewKeyScopesChange(visibleScopeOptions.map((option) => option.id));
  };

  const beginScopeEdit = (key: ApiKeyItem) => {
    setEditingKeyId(key.id);
    setEditingScopes(Array.isArray(key.scopes) ? key.scopes as ApiKeyScope[] : []);
  };

  const cancelScopeEdit = () => {
    setEditingKeyId(null);
    setEditingScopes([]);
  };

  const saveScopeEdit = async (keyId: string) => {
    setSavingScopes(true);
    try {
      if (await onUpdateApiKeyScopes(keyId, editingScopes)) {
        cancelScopeEdit();
      }
    } finally {
      setSavingScopes(false);
    }
  };

  const toggleEditingScope = (scope: ApiKeyScope) => {
    setEditingScopes((current) => current.includes(scope)
      ? current.filter((item) => item !== scope)
      : [...current, scope]);
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          <h3 className="text-lg font-semibold">{t('apiKeys.title')}</h3>
        </div>
        <Button size="sm" onClick={() => onShowNewKeyFormChange(!showNewKeyForm)}>
          <Plus className="mr-1 h-4 w-4" />
          {t('apiKeys.newButton')}
        </Button>
      </div>

      <div className="mb-4">
        <p className="mb-2 text-sm text-muted-foreground">{t('apiKeys.description')}</p>
        <a
          href="/api-docs.html"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          {t('apiKeys.apiDocsLink')}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {showNewKeyForm && (
        <div className="mb-4 rounded-lg border bg-card p-4">
          <Input
            placeholder={t('apiKeys.form.placeholder')}
            value={newKeyName}
            onChange={(event) => onNewKeyNameChange(event.target.value)}
            className="mb-3 min-h-11"
          />
          <div className="mb-3 rounded-lg border border-border/70 bg-muted/20 p-3">
            <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {t('apiKeys.form.scopesTitle', { defaultValue: 'API permissions' })}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('apiKeys.form.scopesDescription', {
                    defaultValue: 'Choose only the operations this key needs. Projects/tasks read and write are selected by default; terminal access is opt-in.',
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={selectAllScopes}
                className="min-h-9 rounded-md px-2 text-xs font-medium text-primary hover:bg-primary/10"
              >
                {t('apiKeys.form.selectAllScopes', { defaultValue: 'Select all' })}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {API_KEY_SCOPE_OPTIONS.map((option) => (
                <label
                  key={option.id}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-muted/60"
                >
                  <input
                    type="checkbox"
                    checked={newKeyScopes.includes(option.id)}
                    onChange={() => toggleScope(option.id)}
                    className="h-4 w-4 shrink-0 accent-primary"
                  />
                  <span>{t(option.labelKey, { defaultValue: option.defaultLabel })}</span>
                </label>
              ))}
            </div>
            {canGrantElevatedScopes && (
              <div className="mt-2 border-t border-border/60 pt-2">
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
                  {t('apiKeys.form.elevatedScopes', { defaultValue: 'Administrator scopes' })}
                </p>
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {API_KEY_ELEVATED_SCOPE_OPTIONS.map((option) => (
                    <label
                      key={option.id}
                      className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-muted/60"
                    >
                      <input
                        type="checkbox"
                        checked={newKeyScopes.includes(option.id)}
                        onChange={() => toggleScope(option.id)}
                        className="h-4 w-4 shrink-0 accent-amber-500"
                      />
                      <span>{t(option.labelKey, { defaultValue: option.defaultLabel })}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button className="min-h-11" onClick={onCreateApiKey}>{t('apiKeys.form.createButton')}</Button>
            <Button className="min-h-11" variant="outline" onClick={onCancelCreateApiKey}>
              {t('apiKeys.form.cancelButton')}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {apiKeys.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">{t('apiKeys.empty')}</p>
        ) : (
          apiKeys.map((key) => (
            <div key={key.id} className="rounded-lg border p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{key.key_name}</div>
                <code className="break-all text-xs text-muted-foreground">{key.api_key}</code>
                <div className="mt-2 flex flex-wrap gap-1">
                  {Array.isArray(key.scopes) && key.scopes.length > 0 ? (
                    key.scopes.map((scope) => (
                      <span key={scope} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {scope}
                      </span>
                    ))
                  ) : (
                    <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                      {t('apiKeys.list.noScopes', { defaultValue: 'No scopes — requests may be denied' })}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t('apiKeys.list.created')} {new Date(key.created_at).toLocaleDateString()}
                  {key.last_used
                    ? ` - ${t('apiKeys.list.lastUsed')} ${new Date(key.last_used).toLocaleDateString()}`
                    : ''}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                <Button
                  className="min-h-11 min-w-11"
                  size="sm"
                  variant="ghost"
                  title={t('apiKeys.list.editScopes', { defaultValue: 'Edit scopes' })}
                  aria-label={t('apiKeys.list.editScopes', { defaultValue: 'Edit scopes' })}
                  onClick={() => beginScopeEdit(key)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  className="min-h-11"
                  size="sm"
                  variant={key.is_active ? 'outline' : 'secondary'}
                  onClick={() => onToggleApiKey(key.id, key.is_active)}
                >
                  {key.is_active ? t('apiKeys.status.active') : t('apiKeys.status.inactive')}
                </Button>
                <Button className="min-h-11 min-w-11" size="sm" variant="ghost" onClick={() => onDeleteApiKey(key.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              </div>
              {editingKeyId === key.id && (
                <div className="mt-3 rounded-lg border border-border/70 bg-muted/20 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium text-foreground">
                      {t('apiKeys.list.editScopesTitle', { defaultValue: 'API permissions' })}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        className="min-h-10"
                        size="sm"
                        variant="outline"
                        disabled={savingScopes}
                        onClick={cancelScopeEdit}
                      >
                        <X className="mr-1 h-4 w-4" />
                        {t('apiKeys.form.cancelButton')}
                      </Button>
                      <Button
                        className="min-h-10"
                        size="sm"
                        disabled={savingScopes}
                        onClick={() => void saveScopeEdit(key.id)}
                      >
                        <Check className="mr-1 h-4 w-4" />
                        {t('apiKeys.list.saveScopes', { defaultValue: 'Save' })}
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {visibleScopeOptions.map((option) => (
                      <label
                        key={option.id}
                        className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-muted/60"
                      >
                        <input
                          type="checkbox"
                          checked={editingScopes.includes(option.id)}
                          onChange={() => toggleEditingScope(option.id)}
                          className="h-4 w-4 shrink-0 accent-primary"
                        />
                        <span>{t(option.labelKey, { defaultValue: option.defaultLabel })}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
