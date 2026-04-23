import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import CodeMirror from '@uiw/react-codemirror';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AlertCircle, Check, Clipboard, Lock, RefreshCw } from '@/lib/icons';
import SessionProviderLogo from '@/components/llm-logo-provider/SessionProviderLogo';
import { PROVIDER_DISPLAY_NAMES } from '@/components/provider-auth/types';
import { authenticatedFetch } from '@/utils/api';
import { copyTextToClipboard } from '@/utils/clipboard';

import type { AgentProvider } from '../../../../../types/types';

type ConfigFormat = 'json' | 'toml' | 'env' | 'text';

type ConfigFileSummary = {
  id: string;
  label: string;
  format: ConfigFormat;
  readonly: boolean;
  description: string | null;
  relativePath: string;
  absolutePath: string;
  exists: boolean;
  size: number | null;
  updatedAt: string | null;
};

type ConfigFileDetail = ConfigFileSummary & { contents: string };

type ConfigFilesResponse = {
  success: boolean;
  data: { provider: string; files: ConfigFileSummary[] };
};

type ConfigFileDetailResponse = {
  success: boolean;
  data: ConfigFileDetail;
};

type ConfigContentProps = {
  agent: AgentProvider;
  isDarkMode?: boolean;
};

/**
 * Per-agent configuration viewer/editor.
 *
 * Lists the registry entries for the selected provider (see
 * `server/modules/providers/shared/provider-configs.ts`) and renders a
 * CodeMirror editor for the currently-selected file. Files that don't
 * exist yet still open as an empty editor — saving creates them.
 */
export default function ConfigContent({ agent, isDarkMode = false }: ConfigContentProps) {
  const { t } = useTranslation('settings');

  const [files, setFiles] = useState<ConfigFileSummary[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);

  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [activeDetail, setActiveDetail] = useState<ConfigFileDetail | null>(null);
  const [buffer, setBuffer] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pathCopied, setPathCopied] = useState(false);

  const displayName = PROVIDER_DISPLAY_NAMES[agent] ?? agent;

  // ---------- list ----------
  const loadFiles = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await authenticatedFetch(`/api/providers/${agent}/config-files`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ConfigFilesResponse;
      setFiles(json.data.files);
      // Pick the first entry on load (or keep the previous selection when
      // the user switches agents and happens to have the same file id).
      setActiveFileId((prev) => {
        if (prev && json.data.files.some((f) => f.id === prev)) return prev;
        return json.data.files[0]?.id ?? null;
      });
    } catch (err) {
      setListError(err instanceof Error ? err.message : String(err));
    } finally {
      setListLoading(false);
    }
  }, [agent]);

  // Reset everything when the user switches providers so a stale editor
  // from the previous agent doesn't flash.
  useEffect(() => {
    setFiles([]);
    setActiveFileId(null);
    setActiveDetail(null);
    setBuffer('');
    void loadFiles();
  }, [agent, loadFiles]);

  // ---------- detail ----------
  const loadDetail = useCallback(async (fileId: string) => {
    setDetailLoading(true);
    setDetailError(null);
    setSaveStatus('idle');
    setSaveError(null);
    try {
      const res = await authenticatedFetch(`/api/providers/${agent}/config-files/${fileId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as any));
        throw new Error(body?.error?.message || body?.error || `HTTP ${res.status}`);
      }
      const json = (await res.json()) as ConfigFileDetailResponse;
      setActiveDetail(json.data);
      setBuffer(json.data.contents);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : String(err));
      setActiveDetail(null);
      setBuffer('');
    } finally {
      setDetailLoading(false);
    }
  }, [agent]);

  useEffect(() => {
    if (!activeFileId) return;
    void loadDetail(activeFileId);
  }, [activeFileId, loadDetail]);

  // ---------- save ----------
  const dirty = activeDetail !== null && buffer !== activeDetail.contents;
  const canSave = Boolean(activeDetail && !activeDetail.readonly && dirty && !saving);

  const save = async () => {
    if (!activeDetail || activeDetail.readonly) return;
    setSaving(true);
    setSaveStatus('idle');
    setSaveError(null);
    try {
      const res = await authenticatedFetch(`/api/providers/${agent}/config-files/${activeDetail.id}`, {
        method: 'PUT',
        body: JSON.stringify({ contents: buffer }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as any));
        throw new Error(body?.error?.message || body?.error || `HTTP ${res.status}`);
      }
      setSaveStatus('saved');
      // Merge the new size/mtime in but keep the buffer as the source of
      // truth for `dirty` comparison — avoids a "re-dirty" flash.
      setActiveDetail((prev) => (prev ? { ...prev, contents: buffer, exists: true } : prev));
      // Refresh the file list so the sidebar's "not created yet" state
      // flips to existing, with new size + updatedAt.
      void loadFiles();
      // Auto-clear the "Saved" chip after a couple seconds so it doesn't
      // linger indefinitely.
      window.setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (err) {
      setSaveStatus('error');
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const revert = () => {
    if (!activeDetail) return;
    setBuffer(activeDetail.contents);
    setSaveStatus('idle');
    setSaveError(null);
  };

  const copyAbsolutePath = async () => {
    if (!activeDetail) return;
    const ok = await copyTextToClipboard(activeDetail.absolutePath);
    if (ok) {
      setPathCopied(true);
      window.setTimeout(() => setPathCopied(false), 1500);
    }
  };

  const languageExtensions = useMemo(() => {
    if (!activeDetail) return [];
    // Only wire JSON for now — env/toml have no bundled CodeMirror
    // language in this project's deps, but the editor still works well
    // enough as a plain monospaced surface for them.
    return activeDetail.format === 'json' ? [json()] : [];
  }, [activeDetail]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <SessionProviderLogo provider={agent} className="h-6 w-6" />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-foreground">{displayName} {t('tabs.configuration', { defaultValue: 'Configuration' })}</h3>
          <p className="text-xs text-muted-foreground">
            {t('agents.config.blurb', {
              defaultValue: 'View or edit the files the {{name}} CLI reads on startup. Saves write directly to your home directory.',
              name: displayName,
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadFiles()}
          disabled={listLoading}
          className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${listLoading ? 'animate-spin' : ''}`} />
          {t('agents.config.refresh', { defaultValue: 'Refresh' })}
        </button>
      </div>

      {listError && (
        <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {listError}
        </div>
      )}

      {!listLoading && !listError && files.length === 0 && (
        <div className="rounded-md border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
          {t('agents.config.noFiles', { defaultValue: 'No config files are registered for this agent yet.' })}
        </div>
      )}

      {files.length > 0 && (
        <>
          {/* File picker — one pill per registered file for this agent. */}
          <div className="flex flex-wrap gap-1.5">
            {files.map((file) => {
              const isActive = file.id === activeFileId;
              return (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => setActiveFileId(file.id)}
                  className={
                    isActive
                      ? 'inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary'
                      : 'inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground'
                  }
                >
                  <span className="font-mono">{file.label}</span>
                  {file.readonly && <Lock className="h-3 w-3" />}
                  {!file.exists && (
                    <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                      {t('agents.config.notCreated', { defaultValue: 'new' })}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Active file meta + description */}
          {activeDetail && (
            <div className="space-y-1">
              {activeDetail.description && (
                <p className="text-xs text-muted-foreground">{activeDetail.description}</p>
              )}
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground/80">
                <button
                  type="button"
                  onClick={() => void copyAbsolutePath()}
                  className="inline-flex items-center gap-1 rounded border border-border/50 bg-muted/30 px-1.5 py-0.5 font-mono text-[11px] text-foreground transition-colors hover:bg-muted/60"
                  title={activeDetail.absolutePath}
                >
                  {pathCopied ? <Check className="h-3 w-3 text-emerald-600" /> : <Clipboard className="h-3 w-3" />}
                  <span className="truncate">{activeDetail.absolutePath}</span>
                </button>
                {activeDetail.exists && activeDetail.size !== null && (
                  <span>· {activeDetail.size} B</span>
                )}
                {activeDetail.updatedAt && (
                  <span>· {new Date(activeDetail.updatedAt).toLocaleString()}</span>
                )}
                {activeDetail.readonly && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                    <Lock className="h-2.5 w-2.5" />
                    {t('agents.config.readonly', { defaultValue: 'read-only' })}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Editor */}
          <div className="overflow-hidden rounded-md border border-border/60 bg-background">
            {detailLoading ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                {t('agents.config.loading', { defaultValue: 'Loading…' })}
              </div>
            ) : detailError ? (
              <div className="flex items-start gap-2 p-4 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                {detailError}
              </div>
            ) : activeDetail ? (
              <CodeMirror
                value={buffer}
                onChange={(val) => setBuffer(val)}
                extensions={languageExtensions}
                theme={isDarkMode ? oneDark : undefined}
                readOnly={activeDetail.readonly}
                height="360px"
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  highlightActiveLine: !activeDetail.readonly,
                  highlightSelectionMatches: false,
                }}
                style={{ fontSize: '13px' }}
              />
            ) : null}
          </div>

          {/* Save row */}
          {activeDetail && !activeDetail.readonly && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void save()}
                disabled={!canSave}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
                {t('agents.config.save', { defaultValue: 'Save' })}
              </button>
              <button
                type="button"
                onClick={revert}
                disabled={!dirty || saving}
                className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground disabled:opacity-40"
              >
                {t('agents.config.revert', { defaultValue: 'Revert' })}
              </button>
              {saveStatus === 'saved' && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                  <Check className="h-3.5 w-3.5" />
                  {t('agents.config.saved', { defaultValue: 'Saved' })}
                </span>
              )}
              {saveStatus === 'error' && (
                <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {saveError}
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
