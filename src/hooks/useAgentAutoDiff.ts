import { useEffect, useRef, useState } from 'react';

import type { Project } from '../types/app';
import {
  extractChangedFilesFromMessage,
  normalizePath,
  type ChangedFileEntry,
  type ChangedFileDiffInfo,
} from '../utils/changedFiles';

import type { AutoShowAgentDiffMode } from './useUiPreferences';

export type DetectedAgentEdit = {
  path: string;
  status: ChangedFileEntry['status'];
  diffInfo: ChangedFileDiffInfo;
  detectedAt: number;
};

function hasUsableDiffInfo(diffInfo: ChangedFileDiffInfo | null | undefined): diffInfo is ChangedFileDiffInfo {
  if (!diffInfo) {
    return false;
  }

  return typeof diffInfo.old_string === 'string' || typeof diffInfo.new_string === 'string';
}

function normalizeFileForProject(
  file: ChangedFileEntry,
  selectedProject: Project | null,
): ChangedFileEntry {
  const projectPath = (selectedProject?.fullPath || selectedProject?.path || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const filePath = normalizePath(file.path);

  if (!projectPath) {
    return { ...file, path: filePath };
  }

  const lowerProjectPath = projectPath.toLowerCase();
  const lowerFilePath = filePath.toLowerCase();
  const projectPrefix = `${lowerProjectPath}/`;

  if (lowerFilePath.startsWith(projectPrefix)) {
    return {
      ...file,
      path: filePath.slice(projectPath.length + 1),
    };
  }

  return { ...file, path: filePath };
}

function messageIngestionKey(message: unknown): string {
  if (!message || typeof message !== 'object') {
    return String(message ?? '');
  }

  const record = message as Record<string, unknown>;
  return String(
    record.id
      ?? record.toolId
      ?? record.requestId
      ?? `${record.kind ?? record.type ?? 'message'}:${record.sessionId ?? ''}:${record.timestamp ?? ''}`,
  );
}

export function useAgentAutoDiff(
  selectedProject: Project | null,
  latestMessage: unknown,
  mode: AutoShowAgentDiffMode,
) {
  const [latestDetectedFile, setLatestDetectedFile] = useState<DetectedAgentEdit | null>(null);
  const lastIngestedMessageKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (mode === 'off' || !selectedProject || !latestMessage) {
      return;
    }

    const ingestionKey = messageIngestionKey(latestMessage);
    if (lastIngestedMessageKeyRef.current === ingestionKey) {
      return;
    }
    lastIngestedMessageKeyRef.current = ingestionKey;

    const directFiles = extractChangedFilesFromMessage(latestMessage)
      .map((file) => normalizeFileForProject(file, selectedProject))
      .filter((file) => hasUsableDiffInfo(file.diffInfo));

    if (directFiles.length === 0) {
      return;
    }

    const firstFile = directFiles[0];
    setLatestDetectedFile({
      path: firstFile.path,
      status: firstFile.status,
      diffInfo: firstFile.diffInfo!,
      detectedAt: Date.now(),
    });
  }, [latestMessage, selectedProject, mode]);

  return { latestDetectedFile };
}
