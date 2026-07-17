import { useState, useEffect, useCallback, useRef } from 'react';

import { ReleaseInfo } from '../types/sharedTypes';
import { notifyOnce } from '../utils/localNotifications';
import {
  getUpdateCheckIntervalMs,
  readUpdateCheckPreferences,
  saveUpdateCheckPreferences,
  UPDATE_CHECK_SETTINGS_EVENT,
  UPDATE_CHECK_PREFERENCES_STORAGE_KEY,
  type UpdateCheckPreferences,
} from '../utils/updateCheckPreferences';

/**
 * Compare two semantic version strings
 * Works only with numeric versions separated by dots (e.g. "1.2.3")
 * @param {string} v1
 * @param {string} v2
 * @returns positive if v1 > v2, negative if v1 < v2, 0 if equal
 */
/** positive if v1 > v2, negative if v1 < v2, 0 if equal */
export const compareVersions = (v1: string, v2: string) => {
  const parts1 = String(v1 || '0').replace(/^v/i, '').split(/[.+-]/).map((part) => Number.parseInt(part, 10) || 0);
  const parts2 = String(v2 || '0').replace(/^v/i, '').split(/[.+-]/).map((part) => Number.parseInt(part, 10) || 0);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 !== p2) return p1 - p2;
  }
  return 0;
};

export type InstallMode = 'git' | 'npm';

// Baked into the bundle by vite.config.js at build time (see `define`).
// This is the version of *this* UI, not whatever the backend reports —
// it's our ground truth when /health is missing, stale, or served by
// an older daemon that predates the version-reporting endpoint.
const BUNDLED_UI_VERSION =
  typeof __PIXCODE_UI_VERSION__ === 'string' ? __PIXCODE_UI_VERSION__ : '0.0.0';

export type VersionCheckStatus = 'idle' | 'checking' | 'success' | 'error';
export const PIXCODE_UPDATE_AVAILABLE_EVENT = 'pixcode:update-available';

type ReleaseCacheEntry = {
  fetchedAt: number | null;
  latestVersion: string | null;
  releaseInfo: ReleaseInfo | null;
  rateLimitedUntil?: number;
};

type LatestReleaseResult = {
  status: number;
  ok: boolean;
  data: {
    tag_name?: string;
    name?: string;
    body?: string;
    html_url?: string;
    published_at?: string;
    message?: string;
  };
};

export type VersionCheckResult = {
  updateAvailable: boolean;
  latestVersion: string | null;
  releaseInfo: ReleaseInfo | null;
  currentVersion: string;
  nodeVersion: string | null;
  checkedAt: number | null;
  status: VersionCheckStatus;
};

const RATE_LIMIT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const releaseRequests = new Map<string, Promise<LatestReleaseResult>>();

function releaseCacheKey(owner: string, repo: string) {
  return `pixcode.updateCheck.cache.${owner}.${repo}`;
}

function readReleaseCache(owner: string, repo: string): ReleaseCacheEntry | null {
  try {
    const raw = localStorage.getItem(releaseCacheKey(owner, repo));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReleaseCacheEntry>;
    return {
      fetchedAt: typeof parsed.fetchedAt === 'number' ? parsed.fetchedAt : null,
      latestVersion: typeof parsed.latestVersion === 'string' ? parsed.latestVersion : null,
      releaseInfo: parsed.releaseInfo ?? null,
      rateLimitedUntil: typeof parsed.rateLimitedUntil === 'number' ? parsed.rateLimitedUntil : undefined,
    };
  } catch {
    return null;
  }
}

function writeReleaseCache(owner: string, repo: string, cache: ReleaseCacheEntry) {
  localStorage.setItem(releaseCacheKey(owner, repo), JSON.stringify(cache));
}

function fetchLatestRelease(owner: string, repo: string): Promise<LatestReleaseResult> {
  const key = `${owner}/${repo}`;
  const existing = releaseRequests.get(key);
  if (existing) return existing;

  const request = fetch(
    `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
    { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } },
  )
    .then(async (response) => ({
      status: response.status,
      ok: response.ok,
      data: await response.json().catch(() => ({})),
    }))
    .finally(() => {
      releaseRequests.delete(key);
    });

  releaseRequests.set(key, request);
  return request;
}

/** npm dist-tag latest — source of truth for npm global installs. */
async function fetchNpmLatestVersion(): Promise<string | null> {
  try {
    const response = await fetch('https://registry.npmjs.org/@pixelbyte-software/pixcode/latest', {
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const data = await response.json() as { version?: string };
    return typeof data.version === 'string' ? data.version.replace(/^v/, '') : null;
  } catch {
    return null;
  }
}

export const useVersionCheck = (owner: string, repo: string) => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [releaseInfo, setReleaseInfo] = useState<ReleaseInfo | null>(null);
  const [installMode, setInstallMode] = useState<InstallMode>('git');
  const [checkStatus, setCheckStatus] = useState<VersionCheckStatus>('idle');
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const [updateCheckPreferences, setUpdateCheckPreferencesState] = useState<UpdateCheckPreferences>(() => (
    readUpdateCheckPreferences()
  ));
  // Node.js version reported by the server via /health
  const [nodeVersion, setNodeVersion] = useState<string | null>(null);

  // Seed from the bundled version so the UI never starts out with a
  // blank "Current Version" field, even before /health responds.
  const [currentVersion, setCurrentVersion] = useState<string>(BUNDLED_UI_VERSION);

  // Stash the live `checkVersion` impl so the public `manualCheck`
  // callback fires the same code path the interval / focus listeners use,
  // without React having to re-create the callback on every state change.
  const checkVersionRef = useRef<((options?: { force?: boolean }) => Promise<VersionCheckResult>) | null>(null);

  const updatePreferences = useCallback((preferences: UpdateCheckPreferences) => {
    saveUpdateCheckPreferences(preferences);
    setUpdateCheckPreferencesState(preferences);
  }, []);

  useEffect(() => {
    const reloadPreferences = () => setUpdateCheckPreferencesState(readUpdateCheckPreferences());
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === UPDATE_CHECK_PREFERENCES_STORAGE_KEY) {
        reloadPreferences();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener(UPDATE_CHECK_SETTINGS_EVENT, reloadPreferences);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener(UPDATE_CHECK_SETTINGS_EVENT, reloadPreferences);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchHealth = async () => {
      try {
        const response = await fetch('/health', { cache: 'no-store' });
        const data = await response.json();
        if (cancelled) return;
        if (data.installMode === 'npm' || data.installMode === 'git') {
          setInstallMode(data.installMode);
        }
        // Only accept the server's version if it looks like a real semver.
        // Older daemons (pre-SERVER_VERSION commit) omit the field entirely
        // — falling back to the bundled version is more accurate than
        // leaving the UI blank or stuck on the last-known-but-stale value.
        if (typeof data.version === 'string' && /^\d+\.\d+\.\d+/.test(data.version)) {
          setCurrentVersion(data.version);
        }
        if (typeof data.nodeVersion === 'string') {
          setNodeVersion(data.nodeVersion);
        }
      } catch {
        // Network/daemon trouble — keep the bundled fallback in place.
      }
    };

    fetchHealth();
    // Re-read on focus so a post-restart version is picked up without F5.
    const handleFocus = () => { fetchHealth(); };
    window.addEventListener('focus', handleFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  useEffect(() => {
    if (!currentVersion) return;
    let cancelled = false;

    const createResult = (
      latest: string | null,
      info: ReleaseInfo | null,
      checkedAt: number | null,
      status: VersionCheckStatus,
    ): VersionCheckResult => ({
      updateAvailable: Boolean(latest && compareVersions(latest, currentVersion) > 0),
      latestVersion: latest,
      releaseInfo: info,
      currentVersion,
      nodeVersion,
      checkedAt,
      status,
    });

    const emitUpdateAvailable = (result: VersionCheckResult) => {
      if (!result.updateAvailable || !result.latestVersion || !result.releaseInfo) return;
      window.dispatchEvent(new CustomEvent(PIXCODE_UPDATE_AVAILABLE_EVENT, { detail: result }));
    };

    const applyReleaseSnapshot = (
      latest: string | null,
      info: ReleaseInfo | null,
      checkedAt: number | null,
      status: VersionCheckStatus = 'success',
    ) => {
      if (!latest || !info) {
        setUpdateAvailable(false);
        setLatestVersion(null);
        setReleaseInfo(null);
        setLastCheckedAt(checkedAt);
        return createResult(null, null, checkedAt, status);
      }

      setLatestVersion(latest);
      setUpdateAvailable(compareVersions(latest, currentVersion) > 0);
      setReleaseInfo(info);
      setLastCheckedAt(checkedAt);
      const result = createResult(latest, info, checkedAt, status);
      emitUpdateAvailable(result);
      return result;
    };

    const checkVersion = async ({ force = false }: { force?: boolean } = {}): Promise<VersionCheckResult> => {
      const intervalMs = getUpdateCheckIntervalMs(updateCheckPreferences);
      const cached = readReleaseCache(owner, repo);
      const now = Date.now();

      if (!force && intervalMs === null) {
        setCheckStatus('idle');
        return applyReleaseSnapshot(cached?.latestVersion ?? null, cached?.releaseInfo ?? null, cached?.fetchedAt ?? null, 'idle');
      }

      if (!force && cached?.fetchedAt && intervalMs !== null && now - cached.fetchedAt < intervalMs) {
        setCheckStatus('success');
        return applyReleaseSnapshot(cached.latestVersion, cached.releaseInfo, cached.fetchedAt, 'success');
      }

      if (!force && cached?.rateLimitedUntil && cached.rateLimitedUntil > now) {
        setCheckStatus('error');
        return applyReleaseSnapshot(cached.latestVersion, cached.releaseInfo, cached.fetchedAt, 'error');
      }

      try {
        setCheckStatus('checking');
        const response = await fetchLatestRelease(owner, repo);
        if (cancelled) return createResult(cached?.latestVersion ?? null, cached?.releaseInfo ?? null, cached?.fetchedAt ?? null, 'idle');
        const data = response.data;

        if (!response.ok) {
          if (response.status === 403) {
            writeReleaseCache(owner, repo, {
              fetchedAt: cached?.fetchedAt ?? null,
              latestVersion: cached?.latestVersion ?? null,
              releaseInfo: cached?.releaseInfo ?? null,
              rateLimitedUntil: now + Math.max(intervalMs ?? 0, RATE_LIMIT_COOLDOWN_MS),
            });
          }

          setCheckStatus('error');
          return applyReleaseSnapshot(cached?.latestVersion ?? null, cached?.releaseInfo ?? null, cached?.fetchedAt ?? null, 'error');
        }

        if (data.tag_name) {
          const githubLatest = data.tag_name.replace(/^v/, '');
          // npm installs often publish before a matching GitHub Release is created.
          // Prefer the higher of GitHub release tag and npm dist-tag for "latest".
          const npmLatest = installMode === 'npm' ? await fetchNpmLatestVersion() : null;
          const latest = npmLatest && compareVersions(npmLatest, githubLatest) > 0
            ? npmLatest
            : githubLatest;
          const isUpdateAvailable = compareVersions(latest, currentVersion) > 0;
          const nextReleaseInfo = {
            title: data.name || data.tag_name || `v${latest}`,
            body: data.body || (npmLatest && npmLatest !== githubLatest
              ? `npm latest is ${npmLatest} (GitHub release notes may lag).`
              : ''),
            htmlUrl: data.html_url || `https://github.com/${owner}/${repo}/releases/latest`,
            publishedAt: data.published_at || '',
          };
          writeReleaseCache(owner, repo, {
            fetchedAt: now,
            latestVersion: latest,
            releaseInfo: nextReleaseInfo,
          });
          setLatestVersion(latest);
          // Only flag an update when the published release is strictly
          // newer than what's running. An older latest (e.g. local 1.58.4
          // vs. GitHub release 1.58.2) must NOT surface as an available update.
          setUpdateAvailable(isUpdateAvailable);
          if (isUpdateAvailable) {
            void notifyOnce({
              key: `app-update:${latest}`,
              title: 'Pixcode update available',
              body: `Pixcode ${currentVersion} can update to ${latest}.`,
              tag: 'pixcode-app-update',
              data: {
                type: 'app-update',
                latestVersion: latest,
                installMode,
              },
            });
          }

          setReleaseInfo(nextReleaseInfo);
          setCheckStatus('success');
          setLastCheckedAt(now);
          const result = createResult(latest, nextReleaseInfo, now, 'success');
          emitUpdateAvailable(result);
          return result;
        } else {
          setUpdateAvailable(false);
          setLatestVersion(null);
          setReleaseInfo(null);
          setCheckStatus('error');
          return createResult(null, null, null, 'error');
        }
      } catch (error) {
        console.error('Version check failed:', error);
        setCheckStatus('error');
        return applyReleaseSnapshot(cached?.latestVersion ?? null, cached?.releaseInfo ?? null, cached?.fetchedAt ?? null, 'error');
      }
    };
    checkVersionRef.current = checkVersion;

    checkVersion();
    const intervalMs = getUpdateCheckIntervalMs(updateCheckPreferences);
    const interval = intervalMs === null ? null : window.setInterval(() => {
      void checkVersion();
    }, intervalMs);
    return () => {
      cancelled = true;
      if (interval !== null) {
        window.clearInterval(interval);
      }
    };
  }, [owner, repo, currentVersion, installMode, updateCheckPreferences]);

  // Expose a manual trigger so the About tab's "Check for Updates" button
  // can fire the same code path used by the interval / focus listeners.
  // Reads through a ref so the returned callback identity stays stable.
  const manualCheck = useCallback(async (): Promise<VersionCheckResult | null> => {
    if (checkVersionRef.current) return await checkVersionRef.current({ force: true });
    return null;
  }, []);

  return {
    updateAvailable,
    latestVersion,
    currentVersion,
    nodeVersion,
    releaseInfo,
    installMode,
    checkStatus,
    lastCheckedAt,
    manualCheck,
    updateCheckPreferences,
    updatePreferences,
  };
};
