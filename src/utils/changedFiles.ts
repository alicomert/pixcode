export type ChangedFileStatus = 'M' | 'A' | 'D' | 'U';

export type ChangedFileDiffInfo = {
  old_string?: string;
  new_string?: string;
};

export type ChangedFileEntry = {
  path: string;
  status: ChangedFileStatus;
  diffInfo?: ChangedFileDiffInfo | null;
  source?: 'git' | 'filesystem' | 'agent';
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
      files.push({ path: normalizedPath, status, source: 'git' });
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

type UnknownRecord = Record<string, unknown>;

const EDIT_TOOL_NAMES = new Set([
  'edit',
  'multiedit',
  'write',
  'applypatch',
  'apply_patch',
  'filechanges',
]);

const PATH_KEYS = ['file_path', 'filePath', 'path', 'filename'];

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizePath(value: unknown): string {
  return String(value || '').replace(/\\/g, '/').trim();
}

function normalizeToolName(value: unknown): string {
  return String(value || '').replace(/[\s-]/g, '').toLowerCase();
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    return value;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function getNestedInput(record: UnknownRecord): unknown {
  const state = isRecord(record.state) ? record.state : null;
  return record.toolInput
    ?? record.input
    ?? record.parameters
    ?? record.args
    ?? record.arguments
    ?? state?.input;
}

function getToolName(record: UnknownRecord): string {
  return String(record.toolName ?? record.tool_name ?? record.name ?? record.tool ?? '').trim();
}

function getStringValue(record: UnknownRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function getStatusForTool(toolName: string): ChangedFileStatus | null {
  const normalizedTool = normalizeToolName(toolName);
  if (!EDIT_TOOL_NAMES.has(normalizedTool)) {
    return null;
  }

  if (normalizedTool === 'write') {
    return 'A';
  }

  return 'M';
}

function getDiffInfo(toolName: string, input: UnknownRecord): ChangedFileDiffInfo | null {
  const normalizedTool = normalizeToolName(toolName);

  if (normalizedTool === 'write') {
    const content = input.content;
    return typeof content === 'string'
      ? { old_string: '', new_string: content }
      : null;
  }

  const oldString = input.old_string;
  const newString = input.new_string;
  if (typeof oldString === 'string' || typeof newString === 'string') {
    return {
      old_string: typeof oldString === 'string' ? oldString : '',
      new_string: typeof newString === 'string' ? newString : '',
    };
  }

  if (Array.isArray(input.edits)) {
    const oldParts: string[] = [];
    const newParts: string[] = [];

    input.edits.forEach((edit) => {
      if (!isRecord(edit)) return;
      if (typeof edit.old_string === 'string') oldParts.push(edit.old_string);
      if (typeof edit.new_string === 'string') newParts.push(edit.new_string);
    });

    if (oldParts.length > 0 || newParts.length > 0) {
      return {
        old_string: oldParts.join('\n\n'),
        new_string: newParts.join('\n\n'),
      };
    }
  }

  return null;
}

function extractPatchFiles(patch: unknown): ChangedFileEntry[] {
  if (typeof patch !== 'string' || !patch.trim()) {
    return [];
  }

  const files: ChangedFileEntry[] = [];
  const seen = new Set<string>();
  const add = (path: string, status: ChangedFileStatus = 'M') => {
    const normalizedPath = normalizePath(path);
    if (!normalizedPath || seen.has(normalizedPath)) {
      return;
    }
    seen.add(normalizedPath);
    files.push({ path: normalizedPath, status, source: 'agent' });
  };

  patch.split(/\r?\n/).forEach((line) => {
    const applyPatchMatch = /^(?:\*\*\* )?(Update|Add|Delete) File:\s+(.+)$/.exec(line.trim());
    if (applyPatchMatch) {
      const [, action, path] = applyPatchMatch;
      add(path, action === 'Add' ? 'A' : action === 'Delete' ? 'D' : 'M');
      return;
    }

    const diffMatch = /^diff --git a\/(.+?) b\/(.+)$/.exec(line.trim());
    if (diffMatch) {
      add(diffMatch[2], 'M');
      return;
    }

    const targetMatch = /^\+\+\+ b\/(.+)$/.exec(line.trim());
    if (targetMatch) {
      add(targetMatch[1], 'M');
    }
  });

  return files;
}

function extractStatusGroupFiles(input: unknown): ChangedFileEntry[] {
  if (!isRecord(input)) {
    return [];
  }

  return normalizeChangedFiles(input).map((file) => ({
    ...file,
    source: 'agent',
  }));
}

function extractFilesFromTool(toolName: string, rawInput: unknown): ChangedFileEntry[] {
  const status = getStatusForTool(toolName);
  const parsedInput = parseMaybeJson(rawInput);
  if (!status) {
    return [];
  }

  const statusGroupFiles = extractStatusGroupFiles(parsedInput);
  if (normalizeToolName(toolName) === 'filechanges' && statusGroupFiles.length > 0) {
    return statusGroupFiles;
  }

  if (!isRecord(parsedInput)) {
    return [];
  }

  const directPath = getStringValue(parsedInput, PATH_KEYS);
  const diffInfo = getDiffInfo(toolName, parsedInput);

  if (directPath) {
    const path = normalizePath(directPath);
    if (!path) {
      return [];
    }

    return [{
      path,
      status,
      diffInfo,
      source: 'agent',
    }];
  }

  if (normalizeToolName(toolName).includes('patch')) {
    return extractPatchFiles(parsedInput.patch ?? parsedInput.content);
  }

  return [];
}

export function extractChangedFilesFromMessage(message: unknown): ChangedFileEntry[] {
  const changedFiles: ChangedFileEntry[] = [];
  const seen = new Set<string>();

  const addFiles = (files: ChangedFileEntry[]) => {
    files.forEach((file) => {
      const normalizedPath = normalizePath(file.path);
      if (!normalizedPath) {
        return;
      }

      const key = `${file.status}:${normalizedPath}:${file.diffInfo?.old_string ?? ''}:${file.diffInfo?.new_string ?? ''}`;
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      changedFiles.push({
        ...file,
        path: normalizedPath,
        source: file.source ?? 'agent',
      });
    });
  };

  const visit = (value: unknown, depth = 0) => {
    if (depth > 6) {
      return;
    }

    const parsedValue = parseMaybeJson(value);

    if (Array.isArray(parsedValue)) {
      parsedValue.forEach((item) => visit(item, depth + 1));
      return;
    }

    if (!isRecord(parsedValue)) {
      return;
    }

    const toolName = getToolName(parsedValue);
    const toolInput = getNestedInput(parsedValue);
    if (toolName && toolInput !== undefined) {
      addFiles(extractFilesFromTool(toolName, toolInput));
    }

    if (Array.isArray(parsedValue.subagentTools)) {
      parsedValue.subagentTools.forEach((item) => visit(item, depth + 1));
    }

    if (Array.isArray(parsedValue.childTools)) {
      parsedValue.childTools.forEach((item) => visit(item, depth + 1));
    }

    visit(parsedValue.tool, depth + 1);
    visit(parsedValue.part, depth + 1);
    visit(parsedValue.message, depth + 1);
    visit(parsedValue.data, depth + 1);
  };

  visit(message);
  return changedFiles;
}

export function mergeChangedFiles(...groups: ChangedFileEntry[][]): ChangedFileEntry[] {
  const merged = new Map<string, ChangedFileEntry>();

  groups.forEach((group) => {
    group.forEach((file) => {
      const normalizedPath = normalizePath(file.path);
      if (!normalizedPath) {
        return;
      }

      const previous = merged.get(normalizedPath);
      if (!previous) {
        merged.set(normalizedPath, {
          ...file,
          path: normalizedPath,
          diffInfo: file.diffInfo ?? null,
        });
        return;
      }

      merged.set(normalizedPath, {
        ...file,
        ...previous,
        path: normalizedPath,
        diffInfo: previous.diffInfo ?? file.diffInfo ?? null,
        source: previous.source ?? file.source,
      });
    });
  });

  return Array.from(merged.values());
}
