// Utility function for authenticated API calls
export const authenticatedFetch = (url, options = {}) => {
  const token = localStorage.getItem('auth-token');

  const defaultHeaders = {};

  // Only set Content-Type for non-FormData requests
  if (!(options.body instanceof FormData)) {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  return fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  }).then((response) => {
    const refreshedToken = response.headers.get('X-Refreshed-Token');
    if (refreshedToken) {
      localStorage.setItem('auth-token', refreshedToken);
    }
    return response;
  });
};

// API endpoints
export const api = {
  // Auth endpoints (no token required)
  auth: {
    status: () => fetch('/api/auth/status'),
    connectionMode: () => fetch('/api/auth/connection-mode'),
    updateConnectionMode: (payload) => fetch('/api/auth/connection-mode', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
    login: (username, password) => fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),
    register: (username, password) => fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),
    user: () => authenticatedFetch('/api/auth/user'),
    logout: () => authenticatedFetch('/api/auth/logout', { method: 'POST' }),
  },

  // Protected endpoints
  // config endpoint removed - no longer needed (frontend uses window.location)
  publicApiManifest: () => authenticatedFetch('/api/public/manifest'),
  diagnostics: () => authenticatedFetch('/api/diagnostics'),
  refreshDiagnostics: () => authenticatedFetch('/api/diagnostics/refresh', { method: 'POST' }),
  remoteConnection: () => authenticatedFetch('/api/remote/config'),
  updateRemoteConnection: (payload) =>
    authenticatedFetch('/api/remote/config', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  projects: () => authenticatedFetch('/api/projects'),
  sessions: (projectName, limit = 5, offset = 0) =>
    authenticatedFetch(`/api/projects/${projectName}/sessions?limit=${limit}&offset=${offset}`),
  // Unified endpoint — all providers through one URL
  unifiedSessionMessages: (sessionId, provider = 'claude', { projectName = '', projectPath = '', limit = null, offset = 0 } = {}) => {
    const params = new URLSearchParams();
    params.append('provider', provider);
    if (projectName) params.append('projectName', projectName);
    if (projectPath) params.append('projectPath', projectPath);
    if (limit !== null) {
      params.append('limit', String(limit));
      params.append('offset', String(offset));
    }
    const queryString = params.toString();
    return authenticatedFetch(`/api/sessions/${encodeURIComponent(sessionId)}/messages${queryString ? `?${queryString}` : ''}`);
  },
  renameProject: (projectName, displayName) =>
    authenticatedFetch(`/api/projects/${projectName}/rename`, {
      method: 'PUT',
      body: JSON.stringify({ displayName }),
    }),
  deleteSession: (projectName, sessionId) =>
    authenticatedFetch(`/api/projects/${projectName}/sessions/${sessionId}`, {
      method: 'DELETE',
    }),
  renameSession: (sessionId, summary, provider) =>
    authenticatedFetch(`/api/sessions/${sessionId}/rename`, {
      method: 'PUT',
      body: JSON.stringify({ summary, provider }),
    }),
  deleteCodexSession: (sessionId) =>
    authenticatedFetch(`/api/codex/sessions/${sessionId}`, {
      method: 'DELETE',
    }),
  deleteGeminiSession: (sessionId) =>
    authenticatedFetch(`/api/gemini/sessions/${sessionId}`, {
      method: 'DELETE',
    }),
  deleteQwenSession: (sessionId) =>
    authenticatedFetch(`/api/qwen/sessions/${sessionId}`, {
      method: 'DELETE',
    }),
  deleteProject: (projectName, force = false, deleteData = false) => {
    const params = new URLSearchParams();
    if (force) params.set('force', 'true');
    if (deleteData) params.set('deleteData', 'true');
    const qs = params.toString();
    return authenticatedFetch(`/api/projects/${projectName}${qs ? `?${qs}` : ''}`, {
      method: 'DELETE',
    });
  },
  searchConversationsUrl: (query, limit = 50) => {
    const token = localStorage.getItem('auth-token');
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    if (token) params.set('token', token);
    return `/api/search/conversations?${params.toString()}`;
  },
  createWorkspace: (workspaceData) =>
    authenticatedFetch('/api/projects/create-workspace', {
      method: 'POST',
      body: JSON.stringify(workspaceData),
    }),
  // Server picks the next pixcode-project-N slot — used by the
  // "just start chatting" flow before the user has created a project.
  quickStartProject: () =>
    authenticatedFetch('/api/projects/quick-start', {
      method: 'POST',
      body: '{}',
    }),
  readFile: (projectName, filePath) =>
    authenticatedFetch(`/api/projects/${projectName}/file?filePath=${encodeURIComponent(filePath)}`),
  readFileBlob: (projectName, filePath) =>
    authenticatedFetch(`/api/projects/${projectName}/files/content?path=${encodeURIComponent(filePath)}`),
  saveFile: (projectName, filePath, content) =>
    authenticatedFetch(`/api/projects/${projectName}/file`, {
      method: 'PUT',
      body: JSON.stringify({ filePath, content }),
    }),
  getFiles: (projectName, options = {}) =>
    authenticatedFetch(`/api/projects/${projectName}/files`, options),

  // File operations
  createFile: (projectName, { path, type, name }) =>
    authenticatedFetch(`/api/projects/${projectName}/files/create`, {
      method: 'POST',
      body: JSON.stringify({ path, type, name }),
    }),

  renameFile: (projectName, { oldPath, newName }) =>
    authenticatedFetch(`/api/projects/${projectName}/files/rename`, {
      method: 'PUT',
      body: JSON.stringify({ oldPath, newName }),
    }),

  deleteFile: (projectName, { path, type }) =>
    authenticatedFetch(`/api/projects/${projectName}/files`, {
      method: 'DELETE',
      body: JSON.stringify({ path, type }),
    }),

  uploadFiles: (projectName, formData) =>
    authenticatedFetch(`/api/projects/${projectName}/files/upload`, {
      method: 'POST',
      body: formData,
      headers: {}, // Let browser set Content-Type for FormData
    }),

  // Browse filesystem for project suggestions
  browseFilesystem: (dirPath = null) => {
    const params = new URLSearchParams();
    if (dirPath) params.append('path', dirPath);

    return authenticatedFetch(`/api/browse-filesystem?${params}`);
  },

  createFolder: (folderPath) =>
    authenticatedFetch('/api/create-folder', {
      method: 'POST',
      body: JSON.stringify({ path: folderPath }),
    }),

  // User endpoints
  user: {
    gitConfig: () => authenticatedFetch('/api/user/git-config'),
    updateGitConfig: (gitName, gitEmail) =>
      authenticatedFetch('/api/user/git-config', {
        method: 'POST',
        body: JSON.stringify({ gitName, gitEmail }),
      }),
    onboardingStatus: () => authenticatedFetch('/api/user/onboarding-status'),
    completeOnboarding: () =>
      authenticatedFetch('/api/user/complete-onboarding', {
        method: 'POST',
      }),
  },

  // Generic GET method for any endpoint
  get: (endpoint) => authenticatedFetch(`/api${endpoint}`),

  // Generic POST method for any endpoint
  post: (endpoint, body) => authenticatedFetch(`/api${endpoint}`, {
    method: 'POST',
    ...(body instanceof FormData ? { body } : { body: JSON.stringify(body) }),
  }),

  // Generic PUT method for any endpoint
  put: (endpoint, body) => authenticatedFetch(`/api${endpoint}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  }),

  // Generic DELETE method for any endpoint
  delete: (endpoint, options = {}) => authenticatedFetch(`/api${endpoint}`, {
    method: 'DELETE',
    ...options,
  }),
};
