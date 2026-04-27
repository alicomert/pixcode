import { useCallback, useEffect, useState } from 'react';

import { authenticatedFetch } from '../utils/api';
import type { LLMProvider } from '../types/app';

/**
 * Provider model catalog as reported by the backend — merged hardcoded
 * defaults + live API discovery. The hook ships a static fallback so the
 * UI never sits blank while the network call is in flight.
 *
 * Call `refresh()` to force the backend to re-hit the upstream API
 * (Anthropic `/v1/models`, OpenAI-compat `/models`, Gemini `/v1beta/models`).
 * The backend persists the result to `~/.pixcode/provider-models.json`
 * with a 6-hour cache; `refresh()` blows past that.
 */
export type ModelEntry = {
  value: string;
  label: string;
  source?: 'static' | 'api';
  /** Surfaced for OpenCode (where the catalog mixes free Zen models with
   *  paid providers); other providers don't set this. */
  free?: boolean;
};

type ModelCatalogResponse = {
  models: ModelEntry[];
  fetchedAt?: string;
  error?: string;
  fromCache?: boolean;
};

export function useProviderModels(
  provider: LLMProvider,
  fallback: ModelEntry[],
) {
  const [models, setModels] = useState<ModelEntry[]>(fallback);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const load = useCallback(
    async (opts: { force?: boolean } = {}) => {
      setLoading(true);
      setError(null);
      try {
        const qs = opts.force ? '?refresh=1' : '';
        const response = await authenticatedFetch(
          `/api/providers/${provider}/models${qs}`,
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body?.success) {
          throw new Error(body?.error || `HTTP ${response.status}`);
        }
        const payload = body.data as ModelCatalogResponse;
        if (Array.isArray(payload.models) && payload.models.length > 0) {
          setModels(payload.models);
        }
        setFetchedAt(payload.fetchedAt ?? null);
        if (payload.error) setError(payload.error);
      } catch (err: any) {
        setError(err?.message || 'Failed to load models');
      } finally {
        setLoading(false);
      }
    },
    [provider],
  );

  useEffect(() => {
    void load();
    // Reload when the provider changes; caller supplies a stable fallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  return {
    models,
    loading,
    error,
    fetchedAt,
    refresh: () => load({ force: true }),
  };
}
