import { useEffect, useMemo, useState } from 'react';

import { authenticatedFetch } from '../../utils/api';

export type PreviewArtifact = {
  artifactId: string;
  type: 'preview-url';
  parts: Array<{ kind: 'data'; data: Record<string, unknown> }>;
  metadata?: Record<string, unknown>;
};

export type PreviewTab = {
  id: string;
  url: string;
  proxiedUrl: string;
  port: number;
  label: string;
};

export function usePreviewArtifacts(taskId?: string) {
  const [artifacts, setArtifacts] = useState<PreviewArtifact[]>([]);

  useEffect(() => {
    if (!taskId) {
      setArtifacts([]);
      return undefined;
    }

    let cancelled = false;
    const load = async () => {
      const response = await authenticatedFetch(`/a2a/tasks/${encodeURIComponent(taskId)}`);
      if (!response.ok || cancelled) return;
      const task = await response.json() as { artifacts?: PreviewArtifact[] };
      setArtifacts((task.artifacts ?? []).filter((artifact) => artifact.type === 'preview-url'));
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [taskId]);

  return useMemo<PreviewTab[]>(() => artifacts.map((artifact) => {
    const data = artifact.parts[0]?.data ?? {};
    const port = typeof data.port === 'number' ? data.port : 0;
    return {
      id: artifact.artifactId,
      url: typeof data.url === 'string' ? data.url : '',
      proxiedUrl: typeof data.proxiedUrl === 'string' ? data.proxiedUrl : '',
      port,
      label: port ? `:${port}` : 'Preview',
    };
  }).filter((tab) => tab.proxiedUrl || tab.url), [artifacts]);
}
