import { useCallback, useEffect, useRef, useState } from 'react';

import type { Project } from '../types/app';
import { authenticatedFetch } from '../utils/api';
import {
  findNewChangedFiles,
  normalizeChangedFiles,
  type ChangedFileEntry,
} from '../utils/changedFiles';

type GitStatusResponse = {
  isGitRepository?: boolean;
  trackingMode?: 'git' | 'filesystem';
  modified?: string[];
  added?: string[];
  deleted?: string[];
  untracked?: string[];
  error?: string;
  details?: string;
};

export type DetectedChangedFile = ChangedFileEntry & {
  detectedAt: number;
};

const POLL_INTERVAL_MS = 4000;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useChangedFilesMonitor(selectedProject: Project | null, enabled: boolean) {
  const [changedFiles, setChangedFiles] = useState<ChangedFileEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const [latestDetectedFile, setLatestDetectedFile] = useState<DetectedChangedFile | null>(null);

  const previousPathsRef = useRef<Set<string> | null>(null);
  const selectedProjectNameRef = useRef<string | null>(selectedProject?.name ?? null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    selectedProjectNameRef.current = selectedProject?.name ?? null;
    previousPathsRef.current = null;
    setChangedFiles([]);
    setError(null);
    setLastCheckedAt(null);
    setLatestDetectedFile(null);
  }, [selectedProject?.name]);

  const refresh = useCallback(async (reason: 'initial' | 'poll' | 'manual' | 'focus' = 'manual') => {
    if (!enabled || !selectedProject) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const projectName = selectedProject.name;

    if (reason === 'initial' || reason === 'manual') {
      setIsLoading(true);
    }

    try {
      const response = await authenticatedFetch(
        `/api/git/status?project=${encodeURIComponent(projectName)}`,
        { cache: 'no-store' },
      );
      const data = (await response.json()) as GitStatusResponse;

      if (requestIdRef.current !== requestId || selectedProjectNameRef.current !== projectName) {
        return;
      }

      if (!response.ok || data.error) {
        const errorMessage = data.details ?? data.error ?? `Git status failed (${response.status})`;
        setError(errorMessage);
        return;
      }

      const nextChangedFiles = normalizeChangedFiles(data);
      const nextPaths = new Set(nextChangedFiles.map((file) => file.path));
      const newlyChangedFiles = findNewChangedFiles(previousPathsRef.current, nextChangedFiles);

      previousPathsRef.current = nextPaths;
      setChangedFiles(nextChangedFiles);
      setLastCheckedAt(Date.now());
      setError(null);

      if (newlyChangedFiles.length > 0) {
        setLatestDetectedFile({
          ...newlyChangedFiles[0],
          detectedAt: Date.now(),
        });
      }
    } catch (caughtError) {
      if (requestIdRef.current !== requestId || selectedProjectNameRef.current !== projectName) {
        return;
      }

      setError(toErrorMessage(caughtError));
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [enabled, selectedProject]);

  useEffect(() => {
    if (!enabled || !selectedProject) {
      previousPathsRef.current = null;
      setChangedFiles([]);
      setError(null);
      setIsLoading(false);
      return undefined;
    }

    void refresh('initial');
    const interval = window.setInterval(() => {
      void refresh('poll');
    }, POLL_INTERVAL_MS);

    const handleFocus = () => {
      void refresh('focus');
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [enabled, refresh, selectedProject]);

  return {
    changedFiles,
    isLoading,
    error,
    lastCheckedAt,
    latestDetectedFile,
    refresh,
  };
}
