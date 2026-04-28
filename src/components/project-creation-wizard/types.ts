export type WizardStep = 1 | 2 | 3;

// 'existing'  — open the picked folder as-is
// 'new'       — clone a github repo into the picked folder (legacy name kept
//               for client compat — backend still routes by this string)
// 'subfolder' — create a fresh subfolder INSIDE the picked folder and open it
export type WorkspaceType = 'existing' | 'new' | 'subfolder';

export type TokenMode = 'stored' | 'new' | 'none';

export type FolderSuggestion = {
  name: string;
  path: string;
  type?: string;
};

export type GithubTokenCredential = {
  id: number;
  credential_name: string;
  is_active: boolean;
};

export type CredentialsResponse = {
  credentials?: GithubTokenCredential[];
  error?: string;
};

export type BrowseFilesystemResponse = {
  path?: string;
  rootPath?: string;
  suggestions?: FolderSuggestion[];
  error?: string;
};

export type CreateFolderResponse = {
  success?: boolean;
  path?: string;
  error?: string;
  details?: string;
};

export type CreateWorkspacePayload = {
  workspaceType: WorkspaceType;
  path: string;
  subfolderName?: string;
};

export type CreateWorkspaceResponse = {
  success?: boolean;
  project?: Record<string, unknown>;
  alreadyExisted?: boolean;
  error?: string;
  details?: string;
  message?: string;
};

export type CloneProgressEvent = {
  type?: string;
  message?: string;
  project?: Record<string, unknown>;
};

export type WizardFormState = {
  workspaceType: WorkspaceType;
  workspacePath: string;
  githubUrl: string;
  // Only used when workspaceType === 'subfolder' — the leaf name of the
  // child folder to create under workspacePath.
  subfolderName: string;
  tokenMode: TokenMode;
  selectedGithubToken: string;
  newGithubToken: string;
};
