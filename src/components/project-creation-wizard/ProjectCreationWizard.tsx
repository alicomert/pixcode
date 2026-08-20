import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Project } from '../../types/app';
import { useGithubOAuth } from '../../hooks/useGithubOAuth';

import ErrorBanner from './components/ErrorBanner';
import StepConfiguration from './components/StepConfiguration';
import StepReview from './components/StepReview';
import StepTypeSelection from './components/StepTypeSelection';
import WizardFooter from './components/WizardFooter';
import WizardProgress from './components/WizardProgress';
import { useGithubTokens } from './hooks/useGithubTokens';
import { cloneWorkspaceWithProgress, createWorkspaceRequest } from './data/workspaceApi';
import { isCloneWorkflow, shouldShowGithubAuthentication } from './utils/pathUtils';
import type { TokenMode, WizardFormState, WizardStep, WorkspaceType } from './types';

import { FolderPlus, X } from '@/lib/icons';

type ProjectCreationWizardProps = {
  onClose: () => void;
  onProjectCreated?: (project?: Project) => void;
  initialWorkspaceType?: WorkspaceType;
};

const createInitialFormState = (workspaceType: WorkspaceType = 'existing'): WizardFormState => ({
  workspaceType,
  workspacePath: '',
  githubUrl: '',
  subfolderName: '',
  tokenMode: 'stored',
  selectedGithubToken: '',
  newGithubToken: '',
});

export default function ProjectCreationWizard({
  onClose,
  onProjectCreated,
  initialWorkspaceType = 'existing',
}: ProjectCreationWizardProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<WizardStep>(1);
  const [formState, setFormState] = useState<WizardFormState>(() => createInitialFormState(initialWorkspaceType));
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cloneProgress, setCloneProgress] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const isCreatingRef = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    isCreatingRef.current = isCreating;
  }, [isCreating]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const focusable = Array.from(
          dialogRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ) ?? [],
        ).filter((element) => element.getClientRects().length > 0);

        if (focusable.length > 0) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          const activeElement = document.activeElement;
          if (event.shiftKey && (activeElement === first || !dialogRef.current?.contains(activeElement))) {
            event.preventDefault();
            last.focus({ preventScroll: true });
          } else if (!event.shiftKey && (activeElement === last || !dialogRef.current?.contains(activeElement))) {
            event.preventDefault();
            first.focus({ preventScroll: true });
          }
        }
        return;
      }

      if (event.key !== 'Escape' || isCreatingRef.current) return;
      event.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener('keydown', handleKeyDown);
    const focusFrame = window.requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>('[data-project-wizard-close]')
        ?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, []);

  const githubOAuth = useGithubOAuth({
    onSuccess: async () => {
      // The active OAuth credential is selected server-side; no token needs to
      // enter this wizard state. Clone falls back to that active credential.
      setFormState((previous) => ({
        ...previous,
        tokenMode: 'none',
        selectedGithubToken: '',
        newGithubToken: '',
      }));
    },
  });

  const shouldLoadTokens =
    step === 2 && shouldShowGithubAuthentication(formState.workspaceType, formState.githubUrl);

  const autoSelectToken = useCallback((tokenId: string) => {
    setFormState((previous) => ({ ...previous, selectedGithubToken: tokenId }));
  }, []);

  const {
    tokens: availableTokens,
    loading: loadingTokens,
    loadError: tokenLoadError,
    selectedTokenName,
  } = useGithubTokens({
    shouldLoad: shouldLoadTokens,
    selectedTokenId: formState.selectedGithubToken,
    onAutoSelectToken: autoSelectToken,
  });

  // Keep cross-step values in this component; local UI state lives in child components.
  const updateField = useCallback(<K extends keyof WizardFormState>(key: K, value: WizardFormState[K]) => {
    setFormState((previous) => ({ ...previous, [key]: value }));
  }, []);

  const updateWorkspaceType = useCallback(
    (workspaceType: WorkspaceType) => updateField('workspaceType', workspaceType),
    [updateField],
  );

  const updateTokenMode = useCallback(
    (tokenMode: TokenMode) => updateField('tokenMode', tokenMode),
    [updateField],
  );

  const handleNext = useCallback(() => {
    setError(null);

    if (step === 1) {
      if (!formState.workspaceType) {
        setError(t('projectWizard.errors.selectType'));
        return;
      }
      setStep(2);
      return;
    }

    if (step === 2) {
      if (!formState.workspacePath.trim()) {
        setError(t('projectWizard.errors.providePath'));
        return;
      }
      if (formState.workspaceType === 'subfolder') {
        const trimmed = formState.subfolderName.trim();
        if (!trimmed) {
          setError(t('projectWizard.errors.provideSubfolderName'));
          return;
        }
        if (/[\\/]/.test(trimmed) || trimmed === '.' || trimmed === '..') {
          setError(t('projectWizard.errors.subfolderNameInvalid'));
          return;
        }
      }
      setStep(3);
    }
  }, [formState.subfolderName, formState.workspacePath, formState.workspaceType, step, t]);

  const handleBack = useCallback(() => {
    setError(null);
    setStep((previousStep) => (previousStep > 1 ? ((previousStep - 1) as WizardStep) : previousStep));
  }, []);

  const handleCreate = useCallback(async () => {
    setIsCreating(true);
    setError(null);
    setCloneProgress('');

    try {
      const shouldCloneRepository = isCloneWorkflow(formState.workspaceType, formState.githubUrl);

      if (shouldCloneRepository) {
        const project = await cloneWorkspaceWithProgress(
          {
            workspacePath: formState.workspacePath,
            githubUrl: formState.githubUrl,
            tokenMode: formState.tokenMode,
            selectedGithubToken: formState.selectedGithubToken,
            newGithubToken: formState.newGithubToken,
          },
          {
            onProgress: setCloneProgress,
          },
        );

        onProjectCreated?.(project);
        onClose();
        return;
      }

      const project = await createWorkspaceRequest({
        workspaceType: formState.workspaceType,
        path: formState.workspacePath.trim(),
        ...(formState.workspaceType === 'subfolder'
          ? { subfolderName: formState.subfolderName.trim() }
          : {}),
      });

      onProjectCreated?.(project);
      onClose();
    } catch (createError) {
      const errorMessage =
        createError instanceof Error
          ? createError.message
          : t('projectWizard.errors.failedToCreate');
      setError(errorMessage);
    } finally {
      setIsCreating(false);
    }
  }, [formState, onClose, onProjectCreated, t]);

  const shouldCloneRepository = useMemo(
    () => isCloneWorkflow(formState.workspaceType, formState.githubUrl),
    [formState.githubUrl, formState.workspaceType],
  );

  return (
    <div
      className="fixed bottom-0 left-0 right-0 top-0 z-[60] flex items-center justify-center bg-black/50 pb-[env(safe-area-inset-bottom,0px)] pt-[env(safe-area-inset-top,0px)] backdrop-blur-sm sm:p-4"
      onMouseDown={(event) => {
        if (!isCreating && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pixcode-project-wizard-title"
        className="h-full w-full overflow-y-auto rounded-none border-0 border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800 sm:h-auto sm:max-w-2xl sm:rounded-lg sm:border"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 p-6 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/50">
              <FolderPlus className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 id="pixcode-project-wizard-title" className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('projectWizard.title')}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-project-wizard-close
            className="flex min-h-11 min-w-11 items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            disabled={isCreating}
            aria-label={t('common.buttons.close', { defaultValue: 'Close project wizard' })}
            title={t('common.buttons.close', { defaultValue: 'Close project wizard' })}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <WizardProgress step={step} />

        <div className="min-h-[300px] space-y-6 p-6">
          {error && <ErrorBanner message={error} />}

          {step === 1 && (
            <StepTypeSelection
              workspaceType={formState.workspaceType}
              onWorkspaceTypeChange={updateWorkspaceType}
            />
          )}

          {step === 2 && (
            <StepConfiguration
              workspaceType={formState.workspaceType}
              workspacePath={formState.workspacePath}
              githubUrl={formState.githubUrl}
              subfolderName={formState.subfolderName}
              tokenMode={formState.tokenMode}
              selectedGithubToken={formState.selectedGithubToken}
              newGithubToken={formState.newGithubToken}
              availableTokens={availableTokens}
              loadingTokens={loadingTokens}
              tokenLoadError={tokenLoadError}
              githubOAuthStatus={githubOAuth.status}
              githubOAuthError={githubOAuth.error}
              isCreating={isCreating}
              onWorkspacePathChange={(workspacePath) => updateField('workspacePath', workspacePath)}
              onGithubUrlChange={(githubUrl) => updateField('githubUrl', githubUrl)}
              onSubfolderNameChange={(subfolderName) => updateField('subfolderName', subfolderName)}
              onTokenModeChange={updateTokenMode}
              onSelectedGithubTokenChange={(selectedGithubToken) =>
                updateField('selectedGithubToken', selectedGithubToken)
              }
              onNewGithubTokenChange={(newGithubToken) =>
                updateField('newGithubToken', newGithubToken)
              }
              onStartGithubOAuth={githubOAuth.start}
              onAdvanceToConfirm={() => setStep(3)}
            />
          )}

          {step === 3 && (
            <StepReview
              formState={formState}
              selectedTokenName={selectedTokenName}
              isCreating={isCreating}
              cloneProgress={cloneProgress}
            />
          )}
        </div>

        <WizardFooter
          step={step}
          isCreating={isCreating}
          isCloneWorkflow={shouldCloneRepository}
          onClose={onClose}
          onBack={handleBack}
          onNext={handleNext}
          onCreate={handleCreate}
        />
      </div>
    </div>
  );
}
