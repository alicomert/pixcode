import { useCallback, useEffect, useRef } from 'react';

import type { Project } from '../types/app';
import { authenticatedFetch } from '../utils/api';
import type { CodeEditorDiffInfo } from '../components/code-editor/types/types';

import type { AutoShowAgentDiffMode } from './useUiPreferences';

type FileWithDiffResponse = {
  currentContent?: string;
  oldContent?: string;
  error?: string;
};

const DEBOUNCE_MS = 400;

export function useFilesystemDiffAutoOpener(
  selectedProject: Project | null,
  mode: AutoShowAgentDiffMode,
  openFilePaths: string[],
  onOpenFileWithDiff: (filePath: string, diffInfo: CodeEditorDiffInfo) => void,
) {
  const debounceTimersRef = useRef<Map<string, number>>(new Map());

  const fetchDiffForFile = useCallback(async (projectName: string, filePath: string): Promise<CodeEditorDiffInfo | null> => {
    try {
      const response = await authenticatedFetch(
        `/api/git/file-with-diff?project=${encodeURIComponent(projectName)}&file=${encodeURIComponent(filePath)}`,
        { cache: 'no-store' },
      );
      const data = (await response.json()) as FileWithDiffResponse;

      if (
        response.ok
        && !data.error
        && typeof data.currentContent === 'string'
        && typeof data.oldContent === 'string'
      ) {
        return {
          old_string: data.oldContent,
          new_string: data.currentContent,
        };
      }
    } catch {
      // Non-git projects fall through to read the current content below.
    }

    try {
      const response = await authenticatedFetch(
        `/api/projects/${encodeURIComponent(projectName)}/file?path=${encodeURIComponent(filePath)}`,
        { cache: 'no-store' },
      );
      const data = (await response.json()) as { content?: unknown };

      if (response.ok && typeof data.content === 'string') {
        return {
          old_string: '',
          new_string: data.content,
        };
      }
    } catch {
      // Ignore read failures; we cannot show a diff without content.
    }

    return null;
  }, []);

  const applyDiffToFile = useCallback(async (projectName: string, filePath: string) => {
    if (mode === 'off' || !selectedProject) {
      return;
    }

    const normalizedOpenPaths = openFilePaths.map((path) => path.replace(/\\/g, '/'));
    const normalizedFilePath = filePath.replace(/\\/g, '/');
    const isOpen = normalizedOpenPaths.includes(normalizedFilePath);

    if (!isOpen && mode !== 'always') {
      return;
    }

    const diffInfo = await fetchDiffForFile(projectName, filePath);
    if (!diffInfo) {
      return;
    }

    onOpenFileWithDiff(filePath, diffInfo);
  }, [fetchDiffForFile, mode, onOpenFileWithDiff, openFilePaths, selectedProject]);

  useEffect(() => {
    if (mode === 'off' || !selectedProject) {
      return undefined;
    }

    const timers = debounceTimersRef.current;

    const handleFileTreeRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ projectName?: string | null; changedFile?: string | null }>).detail;
      const projectName = detail?.projectName;
      const changedFile = detail?.changedFile;

      if (!projectName || !changedFile || projectName !== selectedProject.name) {
        return;
      }

      const existingTimer = debounceTimersRef.current.get(changedFile);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }

      const timer = window.setTimeout(() => {
        debounceTimersRef.current.delete(changedFile);
        void applyDiffToFile(projectName, changedFile);
      }, DEBOUNCE_MS);

      debounceTimersRef.current.set(changedFile, timer);
    };

    window.addEventListener('pixcode:file-tree-refresh', handleFileTreeRefresh);

    return () => {
      window.removeEventListener('pixcode:file-tree-refresh', handleFileTreeRefresh);
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, [applyDiffToFile, mode, selectedProject]);
}
