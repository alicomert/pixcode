import { api, authenticatedFetch } from '../../../utils/api';
import type {
  BrowseFilesystemResponse,
  CloneProgressEvent,
  CreateFolderResponse,
  CreateWorkspacePayload,
  CreateWorkspaceResponse,
  CredentialsResponse,
  FolderSuggestion,
  TokenMode,
} from '../types';

type CloneWorkspaceParams = {
  workspacePath: string;
  githubUrl: string;
  tokenMode: TokenMode;
  selectedGithubToken: string;
  newGithubToken: string;
};

type CloneProgressHandlers = {
  onProgress: (message: string) => void;
};

const parseJson = async <T>(response: Response): Promise<T> => {
  const data = (await response.json()) as T;
  return data;
};

export const fetchGithubTokenCredentials = async () => {
  const response = await api.get('/settings/credentials?type=github_token');
  const data = await parseJson<CredentialsResponse>(response);

  if (!response.ok) {
    throw new Error(data.error || 'Failed to load GitHub tokens');
  }

  return (data.credentials || []).filter((credential) => credential.is_active);
};

export const browseFilesystemFolders = async (pathToBrowse: string) => {
  const endpoint = `/browse-filesystem?path=${encodeURIComponent(pathToBrowse)}`;
  const response = await api.get(endpoint);
  const data = await parseJson<BrowseFilesystemResponse>(response);

  if (!response.ok) {
    throw new Error(data.error || 'Failed to browse filesystem');
  }

  return {
    path: data.path || pathToBrowse,
    rootPath: data.rootPath || data.path || pathToBrowse,
    suggestions: (data.suggestions || []) as FolderSuggestion[],
  };
};

export const createFolderInFilesystem = async (folderPath: string) => {
  const response = await api.createFolder(folderPath);
  const data = await parseJson<CreateFolderResponse>(response);

  if (!response.ok) {
    throw new Error(data.error || 'Failed to create folder');
  }

  return data.path || folderPath;
};

export const createWorkspaceRequest = async (payload: CreateWorkspacePayload) => {
  const response = await api.createWorkspace(payload);
  const data = await parseJson<CreateWorkspaceResponse>(response);

  if (!response.ok) {
    throw new Error(data.details || data.error || 'Failed to create workspace');
  }

  return data.project;
};

const buildCloneProgressPayload = ({
  workspacePath,
  githubUrl,
  tokenMode,
  selectedGithubToken,
  newGithubToken,
}: CloneWorkspaceParams) => {
  const payload: Record<string, string> = {
    path: workspacePath.trim(),
    githubUrl: githubUrl.trim(),
  };

  if (tokenMode === 'stored' && selectedGithubToken) {
    payload.githubTokenId = selectedGithubToken;
  }

  if (tokenMode === 'new' && newGithubToken.trim()) {
    payload.newGithubToken = newGithubToken.trim();
  }

  return payload;
};

/**
 * Clone a repository while consuming the server-sent progress stream.
 *
 * EventSource only supports GET and cannot attach Authorization headers, so
 * this flow deliberately uses an authenticated POST with a streaming body.
 * Keeping the credentials in the request body prevents them from appearing in
 * browser history, proxy access logs, or copied URLs.
 */
export const cloneWorkspaceWithProgress = async (
  params: CloneWorkspaceParams,
  handlers: CloneProgressHandlers,
): Promise<CreateWorkspaceResponse['project']> => {
  const response = await authenticatedFetch('/api/projects/clone-progress', {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(buildCloneProgressPayload(params)),
  });

  if (!response.ok) {
    let message = 'Failed to clone repository';
    try {
      const payload = (await response.json()) as { error?: string; message?: string; details?: string };
      message = payload.error || payload.message || payload.details || message;
    } catch {
      // Keep the generic message when an auth/proxy error is not JSON.
    }
    throw new Error(message);
  }

  if (!response.body) {
    throw new Error('Clone progress stream is unavailable');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let settled = false;
  let completed = false;
  let failure: Error | null = null;
  let result: CreateWorkspaceResponse['project'];

  const settle = (callback: () => void) => {
    if (settled) {
      return;
    }
    settled = true;
    callback();
    void reader.cancel().catch(() => {
      // The server may already have closed the stream after complete/error.
    });
  };

  const processEvent = (rawEvent: string) => {
    const data = rawEvent
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
      .trim();

    if (!data) {
      return;
    }

    try {
      const payload = JSON.parse(data) as CloneProgressEvent;

      if (payload.type === 'progress' && payload.message) {
        handlers.onProgress(payload.message);
        return;
      }

      if (payload.type === 'complete') {
        settle(() => {
          completed = true;
          result = payload.project;
        });
        return;
      }

      if (payload.type === 'error') {
        settle(() => {
          failure = new Error(payload.message || 'Failed to clone repository');
        });
      }
    } catch (error) {
      console.error('Error parsing clone progress event:', error);
    }
  };

  const findEventBoundary = (value: string) => {
    const match = /\r?\n\r?\n/.exec(value);
    return match && typeof match.index === 'number'
      ? { index: match.index, length: match[0].length }
      : null;
  };

  try {
    while (!settled) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

      let boundary = findEventBoundary(buffer);
      while (boundary) {
        const rawEvent = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary.length);
        processEvent(rawEvent);
        if (settled) {
          break;
        }
        boundary = findEventBoundary(buffer);
      }

      if (done) {
        break;
      }
    }

    if (!settled && buffer.trim()) {
      processEvent(buffer);
    }
  } catch (error) {
    if (!settled) {
      throw error instanceof Error ? error : new Error('Connection lost during clone');
    }
  } finally {
    reader.releaseLock();
  }

  if (failure) {
    throw failure;
  }

  if (completed) {
    return result;
  }

  if (settled) {
    // Protect against a malformed terminal frame that settled without a
    // project or an explicit error message.
    throw new Error('Failed to clone repository');
  }

  throw new Error('Connection lost during clone');
};
