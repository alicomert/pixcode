import { useTranslation } from 'react-i18next';

import { Input } from '../../../shared/view/ui';
import { shouldShowGithubAuthentication } from '../utils/pathUtils';
import type { GithubTokenCredential, TokenMode, WorkspaceType } from '../types';

import GithubAuthenticationCard from './GithubAuthenticationCard';
import WorkspacePathField from './WorkspacePathField';

type StepConfigurationProps = {
  workspaceType: WorkspaceType;
  workspacePath: string;
  githubUrl: string;
  subfolderName: string;
  tokenMode: TokenMode;
  selectedGithubToken: string;
  newGithubToken: string;
  availableTokens: GithubTokenCredential[];
  loadingTokens: boolean;
  tokenLoadError: string | null;
  githubOAuthStatus: 'idle' | 'starting' | 'waiting' | 'success' | 'error';
  githubOAuthError: string;
  isCreating: boolean;
  onWorkspacePathChange: (workspacePath: string) => void;
  onGithubUrlChange: (githubUrl: string) => void;
  onSubfolderNameChange: (name: string) => void;
  onTokenModeChange: (tokenMode: TokenMode) => void;
  onSelectedGithubTokenChange: (tokenId: string) => void;
  onNewGithubTokenChange: (tokenValue: string) => void;
  onStartGithubOAuth: () => void;
  onAdvanceToConfirm: () => void;
};

// Per-flow copy keys for the path field — each workspace type wants
// slightly different label + help text:
//   existing  → "Mevcut klasör yolu / pick the folder you want to open"
//   new       → "Hedef klasör / where to clone the repo"
//   subfolder → "Üst klasör / where the new subfolder will live"
const PATH_LABEL_KEY: Record<WorkspaceType, string> = {
  existing: 'projectWizard.step2.existingPath',
  new: 'projectWizard.step2.newPath',
  subfolder: 'projectWizard.step2.subfolderParentPath',
};

const PATH_HELP_KEY: Record<WorkspaceType, string> = {
  existing: 'projectWizard.step2.existingHelp',
  new: 'projectWizard.step2.newHelp',
  subfolder: 'projectWizard.step2.subfolderParentHelp',
};

export default function StepConfiguration({
  workspaceType,
  workspacePath,
  githubUrl,
  subfolderName,
  tokenMode,
  selectedGithubToken,
  newGithubToken,
  availableTokens,
  loadingTokens,
  tokenLoadError,
  githubOAuthStatus,
  githubOAuthError,
  isCreating,
  onWorkspacePathChange,
  onGithubUrlChange,
  onSubfolderNameChange,
  onTokenModeChange,
  onSelectedGithubTokenChange,
  onNewGithubTokenChange,
  onStartGithubOAuth,
  onAdvanceToConfirm,
}: StepConfigurationProps) {
  const { t } = useTranslation();
  const showGithubAuth = shouldShowGithubAuthentication(workspaceType, githubUrl);

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t(PATH_LABEL_KEY[workspaceType])}
        </label>

        <WorkspacePathField
          workspaceType={workspaceType}
          value={workspacePath}
          disabled={isCreating}
          onChange={onWorkspacePathChange}
          onAdvanceToConfirm={onAdvanceToConfirm}
        />

        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {t(PATH_HELP_KEY[workspaceType])}
        </p>
      </div>

      {workspaceType === 'subfolder' && (
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('projectWizard.step2.subfolderName')}
          </label>
          <Input
            type="text"
            value={subfolderName}
            onChange={(event) => onSubfolderNameChange(event.target.value)}
            placeholder="my-new-app"
            className="w-full"
            disabled={isCreating}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t('projectWizard.step2.subfolderNameHelp')}
          </p>
        </div>
      )}

      {workspaceType === 'new' && (
        <>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('projectWizard.step2.githubUrl')}
            </label>
            <Input
              type="text"
              value={githubUrl}
              onChange={(event) => onGithubUrlChange(event.target.value)}
              placeholder="https://github.com/username/repository"
              className="w-full"
              disabled={isCreating}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t('projectWizard.step2.githubHelp')}
            </p>
          </div>

          {showGithubAuth && (
            <GithubAuthenticationCard
              tokenMode={tokenMode}
              selectedGithubToken={selectedGithubToken}
              newGithubToken={newGithubToken}
              availableTokens={availableTokens}
              loadingTokens={loadingTokens}
              tokenLoadError={tokenLoadError}
              githubOAuthStatus={githubOAuthStatus}
              githubOAuthError={githubOAuthError}
              onTokenModeChange={onTokenModeChange}
              onSelectedGithubTokenChange={onSelectedGithubTokenChange}
              onNewGithubTokenChange={onNewGithubTokenChange}
              onStartGithubOAuth={onStartGithubOAuth}
            />
          )}
        </>
      )}
    </div>
  );
}
