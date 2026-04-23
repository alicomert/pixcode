import { useEffect, useState } from 'react';

import { authenticatedFetch } from '../../../utils/api';

type ProjectDirStatus = {
  exists: boolean;
  path: string | null;
  isDirectory: boolean;
};

type HookResult = {
  loading: boolean;
  status: ProjectDirStatus | null;
  /** True once we've confirmed the workspace is gone from disk. Used by
   *  the UI to lock the composer — distinct from `loading` so we don't
   *  flash a "deleted" banner while the check is still in flight. */
  isDeleted: boolean;
};

/**
 * Poll `/api/projects/:name/dir-status` whenever the selected project
 * changes to find out if the workspace directory still exists.
 *
 * We check once per mount (not on a timer) because directory deletions
 * are rare and the check costs a server round-trip — the user can close
 * and re-open the session if they want a fresh check after `rm -rf`ing
 * from outside Pixcode. If the backend round-trips flakily we err on
 * the "exists" side (treat the project as usable) to avoid locking out
 * real workspaces behind a transient error.
 */
export function useProjectDirectoryStatus(projectName: string | null | undefined): HookResult {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<ProjectDirStatus | null>(null);

  useEffect(() => {
    if (!projectName) {
      setStatus(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await authenticatedFetch(`/api/projects/${encodeURIComponent(projectName)}/dir-status`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as ProjectDirStatus;
        if (!cancelled) setStatus(body);
      } catch {
        // Defensive default — pretend the dir exists so a 500 from the
        // server doesn't trip the "deleted" banner for a healthy project.
        if (!cancelled) setStatus({ exists: true, path: null, isDirectory: true });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectName]);

  return {
    loading,
    status,
    isDeleted: status !== null && !status.exists,
  };
}
