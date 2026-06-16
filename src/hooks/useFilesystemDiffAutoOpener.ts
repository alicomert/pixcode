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

type WorkspaceDiffSnapshot = {
  oldContent?: string | null;
  currentContent?: string | null;
};

const DEBOUNCE_MS = 400;

function normalizeProjectRoot(project: Project | null): string {
  return (project?.fullPath || project?.path || '').replace(/\\/g, '/').replace(/\/+$/, '');
}

function isAbsolutePath(filePath: string): boolean {
  return filePath.startsWith('/') || /^[A-Za-z]:\//.test(filePath);
}

function toProjectRelativePath(filePath: string, selectedProject: Project | null): string | null {
  const normalizedFilePath = filePath.replace(/\\/g, '/').trim();
  if (!normalizedFilePath) {
    return null;
  }

  const projectRoot = normalizeProjectRoot(selectedProject);
  if (projectRoot && isAbsolutePath(normalizedFilePath)) {
    if (normalizedFilePath === projectRoot) {
      return null;
    }

    const projectRootPrefix = `${projectRoot}/`;
    if (!normalizedFilePath.startsWith(projectRootPrefix)) {
      return null;
    }

    return normalizedFilePath.slice(projectRootPrefix.length);
  }

  return normalizedFilePath.replace(/^\.\/+/, '');
}

function isInternalProjectPath(filePath: string): boolean {
  const topDir = filePath.split('/')[0];
  return (
    filePath.startsWith('.git/')
    || filePath.startsWith('node_modules/')
    || filePath.startsWith('.pixcode/')
    || (topDir.startsWith('.') && topDir.length > 1)
  );
}

export function useFilesystemDiffAutoOpener(
  selectedProject: Project | null,
  mode: AutoShowAgentDiffMode,
  openFilePaths: string[],
  onOpenFileWithDiff: (filePath: string, diffInfo: CodeEditorDiffInfo) => void,
  sendMessage: (message: { type: string; projectName: string }) => void,
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

    // Do not fall back to old_string="" for modified files. That makes a
    // one-line edit look like the entire file was newly added whenever the git
    // diff endpoint receives a path it cannot resolve.
    return null;
  }, []);

  const applyDiffToFile = useCallback(async (projectName: string, filePath: string, snapshot?: WorkspaceDiffSnapshot | null) => {
    if (mode === 'off' || !selectedProject) {
      return;
    }

    const relativeFilePath = toProjectRelativePath(filePath, selectedProject);

    if (!relativeFilePath || isInternalProjectPath(relativeFilePath)) {
      return;
    }

    const normalizedOpenPaths = openFilePaths.map((path) => path.replace(/\\/g, '/'));
    const isOpen = normalizedOpenPaths.includes(relativeFilePath);

    if (!isOpen && mode !== 'always') {
      return;
    }

    const diffInfo = (
      typeof snapshot?.oldContent === 'string'
      && typeof snapshot.currentContent === 'string'
      && snapshot.oldContent !== snapshot.currentContent
    )
      ? {
          old_string: snapshot.oldContent,
          new_string: snapshot.currentContent,
        }
      : await fetchDiffForFile(projectName, relativeFilePath);

    if (!diffInfo) {
      return;
    }

    onOpenFileWithDiff(relativeFilePath, diffInfo);
  }, [fetchDiffForFile, mode, onOpenFileWithDiff, openFilePaths, selectedProject]);

  useEffect(() => {
    if (mode === 'off' || !selectedProject) {
      return undefined;
    }

    // Subscribe to server-side workspace watching independently of the FileTree
    // component so filesystem edits (e.g. from external CLI tools) are detected
    // even when the explorer panel is not open.
    sendMessage({ type: 'watch-project', projectName: selectedProject.name });

    const timers = debounceTimersRef.current;

    const handleFileTreeRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{
        projectName?: string | null;
        changedFile?: string | null;
        oldContent?: string | null;
        currentContent?: string | null;
      }>).detail;
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
        void applyDiffToFile(projectName, changedFile, {
          oldContent: detail.oldContent,
          currentContent: detail.currentContent,
        });
      }, DEBOUNCE_MS);

      debounceTimersRef.current.set(changedFile, timer);
    };

    window.addEventListener('pixcode:file-tree-refresh', handleFileTreeRefresh);

    return () => {
      sendMessage({ type: 'unwatch-project', projectName: selectedProject.name });
      window.removeEventListener('pixcode:file-tree-refresh', handleFileTreeRefresh);
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, [applyDiffToFile, mode, selectedProject, sendMessage]);
}
