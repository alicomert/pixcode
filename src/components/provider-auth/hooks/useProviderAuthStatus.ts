import { useCallback, useEffect, useState } from 'react';

import { authenticatedFetch } from '../../../utils/api';
import { notifyOnce } from '../../../utils/localNotifications';
import type { LLMProvider } from '../../../types/app';
import {
  CLI_PROVIDERS,
  PROVIDER_DISPLAY_NAMES,
  PROVIDER_AUTH_STATUS_ENDPOINTS,
  createInitialProviderAuthStatusMap,
} from '../types';
import type {
  ProviderAuthStatus,
  ProviderAuthStatusMap,
} from '../types';

type ProviderAuthStatusPayload = {
  authenticated?: boolean;
  installed?: boolean;
  email?: string | null;
  method?: string | null;
  error?: string | null;
  checkedAt?: string | null;
  installedVersion?: string | null;
  latestVersion?: string | null;
  updateAvailable?: boolean;
  versionCheckSkipped?: string | null;
  fromCache?: boolean;
};

type ProviderAuthStatusApiResponse = {
  success: boolean;
  data: ProviderAuthStatusPayload;
};

const FALLBACK_STATUS_ERROR = 'Failed to check authentication status';
const FALLBACK_UNKNOWN_ERROR = 'Unknown error';
const STATUS_CACHE_KEY = 'pixcode.providerAuthStatus.cache.v2';
const STATUS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const BACKGROUND_STATUS_CHECK_MS = 60 * 60 * 1000;
const PROVIDER_AUTH_STATUS_TIMEOUT_MS = 15_000;
let lastBackgroundRefreshAt = 0;

const toErrorMessage = (error: unknown): string => (
  error instanceof Error ? error.message : FALLBACK_UNKNOWN_ERROR
);

const isAbortError = (error: unknown): boolean => (
  error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'
);

const toProviderAuthStatus = (
  payload: ProviderAuthStatusPayload,
  fallbackError: string | null = null,
): ProviderAuthStatus => ({
  authenticated: Boolean(payload.authenticated),
  installed: typeof payload.installed === 'boolean' ? payload.installed : null,
  email: payload.email ?? null,
  method: payload.method ?? null,
  error: payload.error ?? fallbackError,
  loading: false,
  checkedAt: payload.checkedAt ?? new Date().toISOString(),
  installedVersion: payload.installedVersion ?? null,
  latestVersion: payload.latestVersion ?? null,
  updateAvailable: Boolean(payload.updateAvailable),
  versionCheckSkipped: payload.versionCheckSkipped ?? null,
  fromCache: Boolean(payload.fromCache),
});

type CachedProviderAuthStatus = {
  savedAt: number;
  statuses: ProviderAuthStatusMap;
};

function readCachedStatuses(): CachedProviderAuthStatus | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(STATUS_CACHE_KEY) ?? 'null') as CachedProviderAuthStatus | null;
    if (!parsed || typeof parsed.savedAt !== 'number' || !parsed.statuses) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedStatuses(statuses: ProviderAuthStatusMap) {
  try {
    localStorage.setItem(STATUS_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      statuses,
    }));
  } catch {
    // localStorage can be disabled or full; status checks still work in memory.
  }
}

function createInitialStatusMap(initialLoading: boolean): ProviderAuthStatusMap {
  const cached = readCachedStatuses();
  const fallbackStatuses = createInitialProviderAuthStatusMap(false);
  if (cached && Date.now() - cached.savedAt < STATUS_CACHE_TTL_MS) {
    return Object.fromEntries(
      CLI_PROVIDERS.map((provider) => [
        provider,
        {
          ...fallbackStatuses[provider],
          ...cached.statuses[provider],
          loading: false,
          fromCache: true,
        } satisfies ProviderAuthStatus,
      ]),
    ) as ProviderAuthStatusMap;
  }
  return createInitialProviderAuthStatusMap(initialLoading);
}

function notifyProviderCliUpdate(provider: LLMProvider, status: ProviderAuthStatus) {
  if (!status.updateAvailable || !status.latestVersion) {
    return;
  }

  const providerName = PROVIDER_DISPLAY_NAMES[provider] ?? provider;
  const installed = status.installedVersion ? ` ${status.installedVersion}` : '';
  void notifyOnce({
    key: `cli-update:${provider}:${status.latestVersion}`,
    title: `${providerName} update available`,
    body: `${providerName}${installed} can update to ${status.latestVersion}.`,
    tag: `pixcode-cli-update:${provider}`,
    data: {
      type: 'cli-update',
      provider,
      latestVersion: status.latestVersion,
    },
  });
}

type UseProviderAuthStatusOptions = {
  initialLoading?: boolean;
};

export function useProviderAuthStatus(
  { initialLoading = true }: UseProviderAuthStatusOptions = {},
) {
  const [providerAuthStatus, setProviderAuthStatus] = useState<ProviderAuthStatusMap>(() => (
    createInitialStatusMap(initialLoading)
  ));

  const setProviderLoading = useCallback((provider: LLMProvider) => {
    setProviderAuthStatus((previous) => ({
      ...previous,
      [provider]: {
        ...previous[provider],
        loading: true,
        error: null,
      },
    }));
  }, []);

  const setProviderStatus = useCallback((provider: LLMProvider, status: ProviderAuthStatus) => {
    setProviderAuthStatus((previous) => ({
      ...previous,
      [provider]: status,
    }));
  }, []);

  const checkProviderAuthStatus = useCallback(async (provider: LLMProvider, options: { force?: boolean } = {}) => {
    const cached = readCachedStatuses();
    const cachedStatus = cached?.statuses?.[provider];
    if (!options.force && cached && cachedStatus && Date.now() - cached.savedAt < STATUS_CACHE_TTL_MS) {
      const nextStatus = { ...cachedStatus, loading: false, fromCache: true };
      setProviderStatus(provider, nextStatus);
      notifyProviderCliUpdate(provider, nextStatus);
      return;
    }

    setProviderLoading(provider);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), PROVIDER_AUTH_STATUS_TIMEOUT_MS);

    try {
      // cache: 'no-store' so a recent install flips `installed: true`
      // immediately — without this the browser can serve the previous
      // "installed: false" response from memory for a few seconds and the
      // card appears frozen as locked even though the backend now reports
      // the provider as ready.
      const endpoint = options.force
        ? `${PROVIDER_AUTH_STATUS_ENDPOINTS[provider]}?refresh=1`
        : PROVIDER_AUTH_STATUS_ENDPOINTS[provider];
      const response = await authenticatedFetch(endpoint, {
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!response.ok) {
        setProviderStatus(provider, {
          authenticated: false,
          installed: null,
          email: null,
          method: null,
          loading: false,
          error: FALLBACK_STATUS_ERROR,
        });
        return;
      }

      const payload = (await response.json()) as ProviderAuthStatusApiResponse;
      const nextStatus = toProviderAuthStatus(payload.data);
      notifyProviderCliUpdate(provider, nextStatus);
      setProviderAuthStatus((previous) => {
        const next = { ...previous, [provider]: nextStatus };
        writeCachedStatuses(next);
        return next;
      });
    } catch (caughtError) {
      console.error(`Error checking ${provider} auth status:`, caughtError);
      setProviderStatus(provider, {
        authenticated: false,
        installed: null,
        email: null,
        method: null,
        loading: false,
        error: isAbortError(caughtError) ? 'Status check timed out' : toErrorMessage(caughtError),
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, [setProviderLoading, setProviderStatus]);

  const refreshProviderAuthStatuses = useCallback(async (
    providers: LLMProvider[] = CLI_PROVIDERS,
    options: { force?: boolean } = {},
  ) => {
    await Promise.all(providers.map((provider) => checkProviderAuthStatus(provider, options)));
  }, [checkProviderAuthStatus]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      if (now - lastBackgroundRefreshAt < STATUS_CACHE_TTL_MS) {
        return;
      }

      const cached = readCachedStatuses();
      if (cached && now - cached.savedAt < STATUS_CACHE_TTL_MS) {
        return;
      }

      lastBackgroundRefreshAt = now;
      void refreshProviderAuthStatuses();
    }, BACKGROUND_STATUS_CHECK_MS);

    return () => window.clearInterval(timer);
  }, [refreshProviderAuthStatuses]);

  return {
    providerAuthStatus,
    setProviderAuthStatus,
    checkProviderAuthStatus,
    refreshProviderAuthStatuses,
  };
}
