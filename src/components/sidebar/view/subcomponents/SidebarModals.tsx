import { useMemo } from 'react';
import ReactDOM from 'react-dom';
import type { TFunction } from 'i18next';

import { Button, Dialog, DialogContent, DialogTitle } from '../../../../shared/view/ui';
import Settings from '../../../settings/view/Settings';
import VersionUpgradeModal from '../../../version-upgrade/view';
import type { Project } from '../../../../types/app';
import type { ReleaseInfo } from '../../../../types/sharedTypes';
import type { InstallMode } from '../../../../hooks/useVersionCheck';
import { normalizeProjectForSettings } from '../../utils/utils';
import type { DeleteProjectConfirmation, SessionDeleteConfirmation, SettingsProject } from '../../types/types';
import ProjectCreationWizard from '../../../project-creation-wizard';
import type { WorkspaceType } from '../../../project-creation-wizard/types';

import { AlertTriangle, EyeOff, Trash2 } from '@/lib/icons';

type SidebarModalsProps = {
  projects: Project[];
  showSettings: boolean;
  settingsInitialTab: string;
  onCloseSettings: () => void;
  showNewProject: boolean;
  newProjectInitialType: WorkspaceType;
  onCloseNewProject: () => void;
  onProjectCreated: (project?: Project) => void;
  deleteConfirmation: DeleteProjectConfirmation | null;
  onCancelDeleteProject: () => void;
  onConfirmDeleteProject: (deleteData?: boolean) => void;
  sessionDeleteConfirmation: SessionDeleteConfirmation | null;
  onCancelDeleteSession: () => void;
  onConfirmDeleteSession: () => void;
  showVersionModal: boolean;
  onCloseVersionModal: () => void;
  releaseInfo: ReleaseInfo | null;
  currentVersion: string;
  latestVersion: string | null;
  nodeVersion: string | null;
  installMode: InstallMode;
  isUpdateAvailable: boolean;
  t: TFunction;
};

type TypedSettingsProps = {
  isOpen: boolean;
  onClose: () => void;
  projects: SettingsProject[];
  initialTab: string;
};

const SettingsComponent = Settings as (props: TypedSettingsProps) => JSX.Element;

function TypedSettings(props: TypedSettingsProps) {
  return <SettingsComponent {...props} />;
}

export default function SidebarModals({
  projects,
  showSettings,
  settingsInitialTab,
  onCloseSettings,
  showNewProject,
  newProjectInitialType,
  onCloseNewProject,
  onProjectCreated,
  deleteConfirmation,
  onCancelDeleteProject,
  onConfirmDeleteProject,
  sessionDeleteConfirmation,
  onCancelDeleteSession,
  onConfirmDeleteSession,
  showVersionModal,
  onCloseVersionModal,
  releaseInfo,
  currentVersion,
  latestVersion,
  nodeVersion,
  installMode,
  isUpdateAvailable,
  t,
}: SidebarModalsProps) {
  // Settings expects project identity/path fields to be present for dropdown labels and local-scope MCP config.
  const settingsProjects = useMemo(
    () => projects.map(normalizeProjectForSettings),
    [projects],
  );

  return (
    <>
      {showNewProject &&
        ReactDOM.createPortal(
          <ProjectCreationWizard
            onClose={onCloseNewProject}
            onProjectCreated={onProjectCreated}
            initialWorkspaceType={newProjectInitialType}
          />,
          document.body,
        )}

      {showSettings &&
        ReactDOM.createPortal(
          <TypedSettings
            isOpen={showSettings}
            onClose={onCloseSettings}
            projects={settingsProjects}
            initialTab={settingsInitialTab}
          />,
          document.body,
        )}

      {deleteConfirmation &&
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) onCancelDeleteProject();
          }}
        >
          <DialogContent
            aria-labelledby="pixcode-delete-project-title"
            className="w-[calc(100%-2rem)] max-w-md overflow-hidden p-0 sm:rounded-xl"
          >
            <DialogTitle id="pixcode-delete-project-title">
              {t('deleteConfirmation.deleteProject')}
            </DialogTitle>
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
                  <AlertTriangle className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="mb-2 text-lg font-semibold text-foreground">
                    {t('deleteConfirmation.deleteProject')}
                  </h3>
                  <p className="mb-1 text-sm text-muted-foreground">
                    {t('deleteConfirmation.confirmDelete')}{' '}
                    <span className="font-medium text-foreground">
                      {deleteConfirmation.project.displayName || deleteConfirmation.project.name}
                    </span>
                    ?
                  </p>
                  {deleteConfirmation.sessionCount > 0 && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t('deleteConfirmation.sessionCount', { count: deleteConfirmation.sessionCount })}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 border-t border-border bg-muted/30 p-4">
              <Button
                variant="outline"
                className="min-h-11 w-full justify-start"
                onClick={() => onConfirmDeleteProject(false)}
              >
                <EyeOff className="mr-2 h-4 w-4" />
                {t('deleteConfirmation.removeFromSidebar')}
              </Button>
              <Button
                variant="destructive"
                className="min-h-11 w-full justify-start bg-red-600 text-white hover:bg-red-700"
                onClick={() => onConfirmDeleteProject(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('deleteConfirmation.deleteAllData')}
              </Button>
              <Button variant="ghost" className="min-h-11 w-full" onClick={onCancelDeleteProject}>
                {t('actions.cancel')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>}

      {sessionDeleteConfirmation &&
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) onCancelDeleteSession();
          }}
        >
          <DialogContent
            aria-labelledby="pixcode-delete-session-title"
            className="w-[calc(100%-2rem)] max-w-md overflow-hidden p-0 sm:rounded-xl"
          >
            <DialogTitle id="pixcode-delete-session-title">
              {t('deleteConfirmation.deleteSession')}
            </DialogTitle>
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                  <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="mb-2 text-lg font-semibold text-foreground">
                    {t('deleteConfirmation.deleteSession')}
                  </h3>
                  <p className="mb-1 text-sm text-muted-foreground">
                    {t('deleteConfirmation.confirmDelete')}{' '}
                    <span className="font-medium text-foreground">
                      {sessionDeleteConfirmation.sessionTitle || t('sessions.unnamed')}
                    </span>
                    ?
                  </p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {t('deleteConfirmation.cannotUndo')}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-3 border-t border-border bg-muted/30 p-4">
              <Button variant="outline" className="min-h-11 flex-1" onClick={onCancelDeleteSession}>
                {t('actions.cancel')}
              </Button>
              <Button
                variant="destructive"
                className="min-h-11 flex-1 bg-red-600 text-white hover:bg-red-700"
                onClick={onConfirmDeleteSession}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('actions.delete')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>}

      <VersionUpgradeModal
        isOpen={showVersionModal}
        onClose={onCloseVersionModal}
        releaseInfo={releaseInfo}
        currentVersion={currentVersion}
        latestVersion={latestVersion}
        nodeVersion={nodeVersion}
        installMode={installMode}
        isUpdateAvailable={isUpdateAvailable}
      />
    </>
  );
}
