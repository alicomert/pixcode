import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../../../utils/api';
import { useWebSocket } from '../../../contexts/WebSocketContext';
import type { Project } from '../../../types/app';
import type { FileTreeNode } from '../types/types';

type UseFileTreeDataResult = {
  files: FileTreeNode[];
  loading: boolean;
  error: string | null;
  refreshFiles: () => void;
};

// One automatic retry shortly after a failed initial fetch. The first request
// can race the backend's project-directory cache warmup (especially right
// after server start), which used to leave the tree silently empty until the
// user pressed the manual refresh button.
const FETCH_RETRY_DELAY_MS = 1500;
const FETCH_MAX_ATTEMPTS = 2;

export function useFileTreeData(selectedProject: Project | null): UseFileTreeDataResult {
  const [files, setFiles] = useState<FileTreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { sendMessage, latestMessage, isConnected } = useWebSocket();

  const refreshFiles = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    const projectName = selectedProject?.name;

    if (!projectName) {
      setFiles([]);
      setLoading(false);
      setError(null);
      return;
    }

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // Track mount state so aborted or late responses do not enqueue stale state updates.
    let isActive = true;
    let retryTimer: number | null = null;

    const fetchFiles = async (attempt: number) => {
      if (isActive) {
        setLoading(true);
      }

      const scheduleRetryOrFail = (message: string) => {
        if (!isActive) {
          return;
        }
        if (attempt < FETCH_MAX_ATTEMPTS) {
          retryTimer = window.setTimeout(() => {
            void fetchFiles(attempt + 1);
          }, FETCH_RETRY_DELAY_MS);
          return;
        }
        setFiles([]);
        setError(message);
        setLoading(false);
      };

      try {
        const response = await api.getFiles(projectName, { signal: abortControllerRef.current!.signal });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('File fetch failed:', response.status, errorText);
          scheduleRetryOrFail(`Failed to load files (${response.status})`);
          return;
        }

        const data = (await response.json()) as FileTreeNode[];
        if (isActive) {
          setFiles(data);
          setError(null);
          setLoading(false);
        }
      } catch (fetchError) {
        if ((fetchError as { name?: string }).name === 'AbortError') {
          return;
        }

        console.error('Error fetching files:', fetchError);
        scheduleRetryOrFail('Failed to load files');
      }
    };

    void fetchFiles(1);

    return () => {
      isActive = false;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
      abortControllerRef.current?.abort();
    };
  }, [selectedProject?.name, refreshKey]);

  // Live updates: subscribe to server-side workspace watching over the chat
  // WebSocket. The backend pushes `project_files_updated` when files change in
  // the project working directory, so the explorer stays fresh without HTTP
  // polling or manual refresh.
  useEffect(() => {
    const projectName = selectedProject?.name;
    if (!projectName || !isConnected) {
      return undefined;
    }

    sendMessage({ type: 'watch-project', projectName });
    return () => {
      sendMessage({ type: 'unwatch-project', projectName });
    };
  }, [selectedProject?.name, isConnected, sendMessage]);

  // `project_files_updated` itself is routed through the global
  // `pixcode:file-tree-refresh` bridge in AppContent (so the changed-file
  // highlight in FileTree keeps working); here we only need to catch up after
  // a reconnect, when push events may have been missed.
  useEffect(() => {
    if (!selectedProject?.name || !latestMessage) {
      return;
    }

    if (latestMessage.type === 'websocket-reconnected') {
      refreshFiles();
    }
  }, [latestMessage, refreshFiles, selectedProject?.name]);

  useEffect(() => {
    const projectName = selectedProject?.name;
    if (!projectName || typeof window === 'undefined') {
      return undefined;
    }

    const handleExternalRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ projectName?: string | null }>).detail;
      if (detail?.projectName && detail.projectName !== projectName) {
        return;
      }

      refreshFiles();
    };

    window.addEventListener('pixcode:file-tree-refresh', handleExternalRefresh);
    return () => {
      window.removeEventListener('pixcode:file-tree-refresh', handleExternalRefresh);
    };
  }, [refreshFiles, selectedProject?.name]);

  return {
    files,
    loading,
    error,
    refreshFiles,
  };
}
