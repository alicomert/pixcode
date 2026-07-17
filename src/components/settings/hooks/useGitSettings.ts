import { useCallback, useEffect, useRef, useState } from 'react';

import { authenticatedFetch } from '../../../utils/api';

type GitConfigResponse = {
  gitName?: string;
  gitEmail?: string;
  hasGithubToken?: boolean;
  error?: string;
};

type SaveStatus = 'success' | 'error' | null;

export function useGitSettings() {
  const [gitName, setGitName] = useState('');
  const [gitEmail, setGitEmail] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [hasGithubToken, setHasGithubToken] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(null);
  const clearStatusTimerRef = useRef<number | null>(null);

  const clearSaveStatus = useCallback(() => {
    if (clearStatusTimerRef.current !== null) {
      window.clearTimeout(clearStatusTimerRef.current);
      clearStatusTimerRef.current = null;
    }
    setSaveStatus(null);
  }, []);

  const loadGitConfig = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await authenticatedFetch('/api/user/git-config');
      if (!response.ok) {
        return;
      }

      const data = await response.json() as GitConfigResponse;
      setGitName(data.gitName || '');
      setGitEmail(data.gitEmail || '');
      setHasGithubToken(Boolean(data.hasGithubToken));
    } catch (error) {
      console.error('Error loading git config:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveGitConfig = useCallback(async () => {
    try {
      setIsSaving(true);
      const body: Record<string, string> = { gitName, gitEmail };
      if (githubToken.trim()) {
        body.githubToken = githubToken.trim();
        body.githubTokenName = 'GitHub (settings)';
      }

      const response = await authenticatedFetch('/api/user/git-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const data = await response.json() as GitConfigResponse;
        setHasGithubToken(Boolean(data.hasGithubToken));
        setGithubToken('');
        setSaveStatus('success');
        clearStatusTimerRef.current = window.setTimeout(() => {
          setSaveStatus(null);
          clearStatusTimerRef.current = null;
        }, 3000);
        return;
      }

      const data = await response.json() as GitConfigResponse;
      console.error('Failed to save git config:', data.error);
      setSaveStatus('error');
    } catch (error) {
      console.error('Error saving git config:', error);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  }, [gitEmail, gitName, githubToken]);

  useEffect(() => {
    void loadGitConfig();
  }, [loadGitConfig]);

  useEffect(() => () => {
    if (clearStatusTimerRef.current !== null) {
      window.clearTimeout(clearStatusTimerRef.current);
    }
  }, []);

  return {
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
    clearSaveStatus,
    saveGitConfig,
  };
}
