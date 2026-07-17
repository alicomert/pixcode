export type LLMProvider = 'claude' | 'cursor' | 'codex' | 'gemini' | 'qwen' | 'opencode' | 'grok';

export type AppTab = 'chat' | 'remote' | 'controlRoom' | 'tasks' | 'files' | 'shell' | 'git' | 'changes' | 'preview' | `plugin:${string}`;

export interface ProjectSession {
  id: string;
  title?: string;
  summary?: string;
  name?: string;
  createdAt?: string;
  created_at?: string;
  updated_at?: string;
  lastActivity?: string;
  messageCount?: number;
  __provider?: LLMProvider;
  __projectName?: string;
  [key: string]: unknown;
}

export interface ProjectSessionMeta {
  total?: number;
  hasMore?: boolean;
  [key: string]: unknown;
}

export interface Project {
  name: string;
  displayName: string;
  fullPath: string;
  path?: string;
  fileCount?: number;
  source?: 'claude' | 'manual' | 'history';
  isManuallyAdded?: boolean;
  autoDiscovered?: boolean;
  detectedProviders?: string[];
  detectedAt?: string | null;
  sessions?: ProjectSession[];
  cursorSessions?: ProjectSession[];
  codexSessions?: ProjectSession[];
  geminiSessions?: ProjectSession[];
  qwenSessions?: ProjectSession[];
  opencodeSessions?: ProjectSession[];
  sessionMeta?: ProjectSessionMeta;
  [key: string]: unknown;
}

export interface LoadingProgress {
  type?: 'loading_progress';
  phase?: string;
  current: number;
  total: number;
  currentProject?: string;
  [key: string]: unknown;
}

export interface ProjectsUpdatedMessage {
  type: 'projects_updated';
  projects?: Project[];
  changedFile?: string;
  invalidated?: boolean;
  [key: string]: unknown;
}

export interface LoadingProgressMessage extends LoadingProgress {
  type: 'loading_progress';
}

export type AppSocketMessage =
  | LoadingProgressMessage
  | ProjectsUpdatedMessage
  | { type?: string;[key: string]: unknown };
