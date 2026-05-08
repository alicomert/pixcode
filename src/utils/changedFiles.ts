export type ChangedFileStatus = 'M' | 'A' | 'D' | 'U';

export type ChangedFileEntry = {
  path: string;
  status: ChangedFileStatus;
};

type GitStatusLike = {
  modified?: string[];
  added?: string[];
  deleted?: string[];
  untracked?: string[];
};

const STATUS_GROUPS: Array<{ key: keyof GitStatusLike; status: ChangedFileStatus }> = [
  { key: 'modified', status: 'M' },
  { key: 'added', status: 'A' },
  { key: 'deleted', status: 'D' },
  { key: 'untracked', status: 'U' },
];

export function normalizeChangedFiles(gitStatus: GitStatusLike | null | undefined): ChangedFileEntry[] {
  if (!gitStatus) {
    return [];
  }

  const seen = new Set<string>();
  const files: ChangedFileEntry[] = [];

  STATUS_GROUPS.forEach(({ key, status }) => {
    (gitStatus[key] || []).forEach((path) => {
      const normalizedPath = String(path || '').replace(/\\/g, '/').trim();
      if (!normalizedPath || seen.has(normalizedPath)) {
        return;
      }

      seen.add(normalizedPath);
      files.push({ path: normalizedPath, status });
    });
  });

  return files;
}

export function findNewChangedFiles(
  previousPaths: Set<string> | null,
  nextFiles: ChangedFileEntry[],
): ChangedFileEntry[] {
  if (!previousPaths) {
    return [];
  }

  return nextFiles.filter((file) => !previousPaths.has(file.path));
}
