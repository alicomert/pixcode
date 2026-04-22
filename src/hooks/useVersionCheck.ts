import { useState, useEffect } from 'react';

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

export const useVersionCheck = (owner: string, repo: string) => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [releaseInfo, setReleaseInfo] = useState<ReleaseInfo | null>(null);
  const [installMode, setInstallMode] = useState<InstallMode>('git');
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);

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
        if (typeof data.version === 'string') {
          setCurrentVersion(data.version);
        }
      } catch {
        // Leave defaults in place on error.
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
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`);
        const data = await response.json();

        if (data.tag_name) {
          const latest = data.tag_name.replace(/^v/, '');
          setLatestVersion(latest);
          setUpdateAvailable(compareVersions(latest, currentVersion) > 0);

          setReleaseInfo({
            title: data.name || data.tag_name,
            body: data.body || '',
            htmlUrl: data.html_url || `https://github.com/${owner}/${repo}/releases/latest`,
            publishedAt: data.published_at
          });
        } else {
          setUpdateAvailable(false);
          setLatestVersion(null);
          setReleaseInfo(null);
        }
      } catch (error) {
        console.error('Version check failed:', error);
        setUpdateAvailable(false);
        setLatestVersion(null);
        setReleaseInfo(null);
      }
    };

    checkVersion();
    const interval = setInterval(checkVersion, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [owner, repo, currentVersion]);

  return { updateAvailable, latestVersion, currentVersion: currentVersion ?? '', releaseInfo, installMode };
};
