import { useState, useEffect, useCallback, useRef } from 'react';

import { ReleaseInfo } from '../types/sharedTypes';

/**
 * Compare two semantic version strings
 * Works only with numeric versions separated by dots (e.g. "1.2.3")
 * @param {string} v1
 * @param {string} v2
 * @returns positive if v1 > v2, negative if v1 < v2, 0 if equal
 */
const compareVersions = (v1: string, v2: string) => {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

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

export const useVersionCheck = (owner: string, repo: string) => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [releaseInfo, setReleaseInfo] = useState<ReleaseInfo | null>(null);
  const [installMode, setInstallMode] = useState<InstallMode>('git');
  const [checkStatus, setCheckStatus] = useState<VersionCheckStatus>('idle');
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  // Seed from the bundled version so the UI never starts out with a
  // blank "Current Version" field, even before /health responds.
  const [currentVersion, setCurrentVersion] = useState<string>(BUNDLED_UI_VERSION);

  // Stash the live `checkVersion` impl so the public `manualCheck`
  // callback fires the same code path the interval / focus listeners use,
  // without React having to re-create the callback on every state change.
  const checkVersionRef = useRef<(() => Promise<void>) | null>(null);

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

    const checkVersion = async () => {
      try {
        setCheckStatus('checking');
        // `cache: 'no-store'` is load-bearing here — without it, the browser
        // (and any CDN in front of api.github.com) can serve a stale
        // "releases/latest" response for the lifetime of the tab, which
        // means a user on v1.33.5 wouldn't see v1.33.6 surface as an
        // available update until the cache happened to expire. Adding a
        // cache-bust query param too belt-and-suspenders against any
        // intermediary that ignores Cache-Control on cross-origin fetches.
        const bust = `?_=${Date.now()}`;
        const response = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/releases/latest${bust}`,
          { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } },
        );
        const data = await response.json();

        if (data.tag_name) {
          const latest = data.tag_name.replace(/^v/, '');
          setLatestVersion(latest);
          // Only flag an update when the published release is strictly
          // newer than what's running. An older latest (e.g. local 1.30.2
          // vs. npm 1.30.1) must NOT surface as an available update.
          setUpdateAvailable(compareVersions(latest, currentVersion) > 0);

          setReleaseInfo({
            title: data.name || data.tag_name,
            body: data.body || '',
            htmlUrl: data.html_url || `https://github.com/${owner}/${repo}/releases/latest`,
            publishedAt: data.published_at
          });
          setCheckStatus('success');
          setLastCheckedAt(Date.now());
        } else {
          setUpdateAvailable(false);
          setLatestVersion(null);
          setReleaseInfo(null);
          setCheckStatus('error');
        }
      } catch (error) {
        console.error('Version check failed:', error);
        setUpdateAvailable(false);
        setLatestVersion(null);
        setReleaseInfo(null);
        setCheckStatus('error');
      }
    };
    checkVersionRef.current = checkVersion;

    checkVersion();
    // Re-check every 10 minutes (was 30). GitHub's unauthenticated rate
    // limit is 60 req/h per IP — at 10 min we use 6 req/h, well inside
    // the budget — and the lower interval means a fresh release surfaces
    // as an update prompt within minutes rather than half an hour. We
    // also re-check on focus AND on visibilitychange so a user
    // alt-tabbing back gets the freshest answer regardless of which
    // event their browser fires.
    const interval = setInterval(checkVersion, 10 * 60 * 1000);
    const onFocus = () => { checkVersion(); };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkVersion();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [owner, repo, currentVersion]);

  // Expose a manual trigger so the About tab's "Check for Updates" button
  // can fire the same code path used by the interval / focus listeners.
  // Reads through a ref so the returned callback identity stays stable.
  const manualCheck = useCallback(async () => {
    if (checkVersionRef.current) await checkVersionRef.current();
  }, []);

  return {
    updateAvailable,
    latestVersion,
    currentVersion,
    releaseInfo,
    installMode,
    checkStatus,
    lastCheckedAt,
    manualCheck,
  };
};
