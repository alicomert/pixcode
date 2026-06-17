import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { usePlugins } from '../../../contexts/PluginsContext';
import { authenticatedFetch } from '../../../utils/api';

import {
  Check,
  ExternalLink,
  GitBranch,
  Loader2,
  Plus,
  Puzzle,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Trash2,
} from '@/lib/icons';

type MarketEntry = {
  id: string;
  name: string;
  type: 'skill-library' | 'agent-pack' | 'native-plugin' | 'pixcode-plugin';
  category: string;
  sourceUrl: string;
  repo: string | null;
  description: string;
  stars: number;
  forks: number;
  updatedAt: string | null;
  compatibleCli: string[];
  installKind: 'source' | 'pixcode-plugin';
  tags: string[];
  addedAt?: string;
};

type MarketplaceResponse = {
  entries: MarketEntry[];
  installedSources: MarketEntry[];
  categories?: string[];
};

type MarketCategory = 'popular' | 'new' | 'skills' | 'plugin' | 'workflow' | 'installed' | 'search';

const CATEGORY_KEYS: MarketCategory[] = ['popular', 'new', 'skills', 'plugin', 'workflow', 'installed'];

const TYPE_LABELS: Record<MarketEntry['type'], string> = {
  'skill-library': 'Skill',
  'agent-pack': 'Agents',
  'native-plugin': 'Native',
  'pixcode-plugin': 'Pixcode',
};

function formatCount(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return String(value);
}

function sortByStars(entries: MarketEntry[]) {
  return [...entries].sort((a, b) => (b.stars || 0) - (a.stars || 0));
}

function sortByUpdated(entries: MarketEntry[]) {
  return [...entries].sort((a, b) => {
    const aTime = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const bTime = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    return bTime - aTime;
  });
}

export default function GlobalMarketSettingsTab() {
  const { t } = useTranslation('settings');
  const { installPlugin } = usePlugins();
  const [entries, setEntries] = useState<MarketEntry[]>([]);
  const [installedSources, setInstalledSources] = useState<MarketEntry[]>([]);
  const [activeCategory, setActiveCategory] = useState<MarketCategory>('popular');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MarketEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const installedIds = useMemo(
    () => new Set(installedSources.map((source) => source.id)),
    [installedSources],
  );

  const loadMarketplace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authenticatedFetch('/api/plugins/marketplace');
      const body = (await response.json()) as MarketplaceResponse & { error?: string; details?: string };
      if (!response.ok) {
        throw new Error(body.details || body.error || `HTTP ${response.status}`);
      }
      setEntries(body.entries || []);
      setInstalledSources(body.installedSources || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMarketplace();
  }, [loadMarketplace]);

  const runSearch = useCallback(async (sort: 'popular' | 'new' = 'popular') => {
    setSearching(true);
    setError(null);
    setActiveCategory('search');
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      params.set('sort', sort);
      const response = await authenticatedFetch(`/api/plugins/marketplace/search?${params.toString()}`);
      const body = (await response.json()) as { entries?: MarketEntry[]; error?: string; details?: string };
      if (!response.ok) {
        throw new Error(body.details || body.error || `HTTP ${response.status}`);
      }
      setSearchResults(body.entries || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  }, [query]);

  const addSource = useCallback(async (entry: MarketEntry) => {
    setBusyId(entry.id);
    setError(null);
    try {
      const response = await authenticatedFetch('/api/plugins/marketplace/sources', {
        method: 'POST',
        body: JSON.stringify({ entry }),
      });
      const body = (await response.json()) as { installedSources?: MarketEntry[]; error?: string; details?: string };
      if (!response.ok) {
        throw new Error(body.details || body.error || `HTTP ${response.status}`);
      }
      setInstalledSources(body.installedSources || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }, []);

  const removeSource = useCallback(async (entry: MarketEntry) => {
    setBusyId(entry.id);
    setError(null);
    try {
      const response = await authenticatedFetch(`/api/plugins/marketplace/sources/${encodeURIComponent(entry.id)}`, {
        method: 'DELETE',
      });
      const body = (await response.json()) as { installedSources?: MarketEntry[]; error?: string; details?: string };
      if (!response.ok) {
        throw new Error(body.details || body.error || `HTTP ${response.status}`);
      }
      setInstalledSources(body.installedSources || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }, []);

  const installPixcodePlugin = useCallback(async (entry: MarketEntry) => {
    setBusyId(entry.id);
    setError(null);
    const result = await installPlugin(entry.sourceUrl);
    if (!result.success) {
      setError(result.error || t('marketSettings.installFailed'));
    }
    setBusyId(null);
  }, [installPlugin, t]);

  const visibleEntries = useMemo(() => {
    if (activeCategory === 'installed') return installedSources;
    if (activeCategory === 'search') return searchResults;
    if (activeCategory === 'new') return sortByUpdated(entries).slice(0, 24);
    if (activeCategory === 'popular') return sortByStars(entries).slice(0, 24);
    return entries.filter((entry) => {
      if (entry.category === activeCategory) return true;
      if (activeCategory === 'skills') return entry.type === 'skill-library' || entry.type === 'agent-pack';
      if (activeCategory === 'plugin') return entry.type === 'native-plugin' || entry.type === 'pixcode-plugin';
      return false;
    });
  }, [activeCategory, entries, installedSources, searchResults]);

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runSearch('popular');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-foreground">{t('marketSettings.title')}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('marketSettings.description')}</p>
        </div>
        <button
          type="button"
          onClick={() => void loadMarketplace()}
          className="inline-flex items-center justify-center rounded-lg border border-border/60 bg-background p-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          disabled={loading}
          title={t('marketSettings.refresh')}
          aria-label={t('marketSettings.refresh')}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <form onSubmit={handleSearchSubmit} className="flex flex-col gap-2 sm:flex-row">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2">
          <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('marketSettings.searchPlaceholder') as string}
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
          />
        </div>
        <button
          type="submit"
          disabled={searching}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {t('marketSettings.search')}
        </button>
        <button
          type="button"
          onClick={() => void runSearch('new')}
          disabled={searching}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/50 disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" />
          {t('marketSettings.latest')}
        </button>
      </form>

      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CATEGORY_KEYS.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setActiveCategory(category)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              activeCategory === category
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border/60 bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            }`}
          >
            {t(`marketSettings.categories.${category}`)}
          </button>
        ))}
        {activeCategory === 'search' && (
          <button
            type="button"
            className="shrink-0 rounded-full border border-primary bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            {t('marketSettings.categories.search')}
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('marketSettings.loading')}
        </div>
      ) : visibleEntries.length === 0 ? (
        <div className="rounded-lg border border-border/60 bg-background px-4 py-8 text-center text-sm text-muted-foreground">
          {t(activeCategory === 'installed' ? 'marketSettings.emptyInstalled' : 'marketSettings.empty')}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visibleEntries.map((entry) => {
            const isInstalled = installedIds.has(entry.id);
            const isBusy = busyId === entry.id;
            return (
              <div key={entry.id} className="rounded-lg border border-border/60 bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">{entry.name}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {TYPE_LABELS[entry.type] || entry.type}
                      </span>
                    </div>
                    {entry.repo && (
                      <a
                        href={entry.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex max-w-full items-center gap-1 text-xs text-muted-foreground/70 transition-colors hover:text-foreground"
                      >
                        <GitBranch className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{entry.repo}</span>
                        <ExternalLink className="h-3 w-3 flex-shrink-0" />
                      </a>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <Star className="h-3.5 w-3.5" />
                    {formatCount(entry.stars)}
                  </div>
                </div>

                {entry.description && (
                  <p className="mt-2 line-clamp-3 text-sm leading-snug text-muted-foreground">
                    {entry.description}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {entry.compatibleCli.slice(0, 6).map((cli) => (
                    <span key={cli} className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {cli}
                    </span>
                  ))}
                  {entry.tags.slice(0, 4).map((tag) => (
                    <span key={tag} className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  {activeCategory === 'installed' ? (
                    <button
                      type="button"
                      onClick={() => void removeSource(entry)}
                      disabled={isBusy}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
                    >
                      {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      {t('marketSettings.removeSource')}
                    </button>
                  ) : entry.installKind === 'pixcode-plugin' ? (
                    <button
                      type="button"
                      onClick={() => void installPixcodePlugin(entry)}
                      disabled={isBusy}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                      {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Puzzle className="h-4 w-4" />}
                      {t('marketSettings.installPlugin')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void addSource(entry)}
                      disabled={isBusy || isInstalled}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                      {isBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : isInstalled ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      {isInstalled ? t('marketSettings.added') : t('marketSettings.addSource')}
                    </button>
                  )}
                  <a
                    href={entry.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {t('marketSettings.openGithub')}
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
