import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ConfirmationRequest, FileStatusCode, GitDiffMap, GitStatusResponse } from '../../types/types';
import { getAllChangedFiles, hasChangedFiles } from '../../utils/gitPanelUtils';

import CommitComposer from './CommitComposer';
import FileChangeList from './FileChangeList';
import FileStatusLegend from './FileStatusLegend';

import { GitBranch, GitCommit, RefreshCw } from '@/lib/icons';

type ChangesViewProps = {
  isMobile: boolean;
  compact?: boolean;
  projectPath: string;
  gitStatus: GitStatusResponse | null;
  gitDiff: GitDiffMap;
  isLoading: boolean;
  wrapText: boolean;
  isCreatingInitialCommit: boolean;
  onWrapTextChange: (wrapText: boolean) => void;
  onCreateInitialCommit: () => Promise<boolean>;
  onOpenFile: (filePath: string) => Promise<void>;
  onDiscardFile: (filePath: string) => Promise<void>;
  onDeleteFile: (filePath: string) => Promise<void>;
  onCommitChanges: (message: string, files: string[]) => Promise<boolean>;
  onGenerateCommitMessage: (files: string[]) => Promise<string | null>;
  onRequestConfirmation: (request: ConfirmationRequest) => void;
  onExpandedFilesChange: (hasExpandedFiles: boolean) => void;
};

export default function ChangesView({
  isMobile,
  compact = false,
  projectPath,
  gitStatus,
  gitDiff,
  isLoading,
  wrapText,
  isCreatingInitialCommit,
  onWrapTextChange,
  onCreateInitialCommit,
  onOpenFile,
  onDiscardFile,
  onDeleteFile,
  onCommitChanges,
  onGenerateCommitMessage,
  onRequestConfirmation,
  onExpandedFilesChange,
}: ChangesViewProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  const changedFiles = useMemo(() => getAllChangedFiles(gitStatus), [gitStatus]);
  const hasExpandedFiles = expandedFiles.size > 0;
  const isFilesystemTracking = gitStatus?.isGitRepository === false;

  useEffect(() => {
    if (!gitStatus || gitStatus.error) {
      setSelectedFiles(new Set());
      return;
    }

    // Commit UX is intentionally direct: every changed file is included by default.
    setSelectedFiles(new Set(getAllChangedFiles(gitStatus)));
  }, [gitStatus]);

  useEffect(() => {
    onExpandedFilesChange(hasExpandedFiles);
  }, [hasExpandedFiles, onExpandedFilesChange]);

  useEffect(() => {
    return () => {
      onExpandedFilesChange(false);
    };
  }, [onExpandedFilesChange]);

  const toggleFileExpanded = useCallback((filePath: string) => {
    setExpandedFiles((previous) => {
      const next = new Set(previous);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  }, []);

  const toggleFileSelected = useCallback((filePath: string) => {
    setSelectedFiles((previous) => {
      const next = new Set(previous);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  }, []);

  const requestFileAction = useCallback(
    (filePath: string, status: FileStatusCode) => {
      if (status === 'U') {
        onRequestConfirmation({
          type: 'delete',
          message: `Delete untracked file "${filePath}"? This action cannot be undone.`,
          onConfirm: async () => {
            await onDeleteFile(filePath);
          },
        });
        return;
      }

      onRequestConfirmation({
        type: 'discard',
        message: `Discard all changes to "${filePath}"? This action cannot be undone.`,
        onConfirm: async () => {
          await onDiscardFile(filePath);
        },
      });
    },
    [onDeleteFile, onDiscardFile, onRequestConfirmation],
  );

  const commitSelectedFiles = useCallback(
    (message: string) => {
      return onCommitChanges(message, changedFiles);
    },
    [changedFiles, onCommitChanges],
  );

  const generateMessageForSelection = useCallback(() => {
    return onGenerateCommitMessage(changedFiles);
  }, [changedFiles, onGenerateCommitMessage]);

  return (
    <>
      {!isFilesystemTracking && (
          <CommitComposer
          isMobile={isMobile}
          compact={compact}
          projectPath={projectPath}
          selectedFileCount={changedFiles.length}
          isHidden={hasExpandedFiles}
          onCommit={commitSelectedFiles}
          onGenerateMessage={generateMessageForSelection}
          onRequestConfirmation={onRequestConfirmation}
        />
      )}

      {!gitStatus?.error && !isFilesystemTracking && <FileStatusLegend isMobile={isMobile} compact={compact} />}

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : gitStatus?.hasCommits === false ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
              <GitBranch className="h-7 w-7 text-muted-foreground/50" />
            </div>
            <h3 className="mb-2 text-lg font-medium text-foreground">No commits yet</h3>
            <p className="mb-6 max-w-md text-sm text-muted-foreground">
              This repository doesn&apos;t have any commits yet. Create your first commit to start tracking changes.
            </p>
            <button
              onClick={() => void onCreateInitialCommit()}
              disabled={isCreatingInitialCommit}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCreatingInitialCommit ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Creating Initial Commit...</span>
                </>
              ) : (
                <>
                  <GitCommit className="h-4 w-4" />
                  <span>Create Initial Commit</span>
                </>
              )}
            </button>
          </div>
        ) : isFilesystemTracking ? (
          <div className="p-3">
            <div className="mb-3 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] p-3">
              <div className="text-sm font-medium text-foreground">Local file activity</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                This folder is not a git repository. Pixcode is tracking file writes locally so agent changes are still visible.
              </p>
            </div>

            {!hasChangedFiles(gitStatus) ? (
              <div className="flex h-32 flex-col items-center justify-center text-muted-foreground">
                <GitCommit className="mb-2 h-10 w-10 opacity-40" />
                <p className="text-sm">No local changes detected</p>
              </div>
            ) : (
              <FileChangeList
                gitStatus={gitStatus}
                gitDiff={gitDiff}
                expandedFiles={expandedFiles}
                selectedFiles={selectedFiles}
                isMobile={isMobile}
                wrapText={wrapText}
                readOnly
                onToggleSelected={toggleFileSelected}
                onToggleExpanded={toggleFileExpanded}
                onOpenFile={(filePath) => { void onOpenFile(filePath); }}
                onToggleWrapText={() => onWrapTextChange(!wrapText)}
                onRequestFileAction={requestFileAction}
              />
            )}
          </div>
        ) : !gitStatus || !hasChangedFiles(gitStatus) ? (
          <div className="flex h-32 flex-col items-center justify-center text-muted-foreground">
            <GitCommit className="mb-2 h-10 w-10 opacity-40" />
            <p className="text-sm">No changes detected</p>
          </div>
        ) : (
          <div className={isMobile ? 'pb-4' : ''}>
            <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-3 py-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Changes ({changedFiles.length})
              </span>
              <span className="text-[11px] text-muted-foreground">All included in commit</span>
            </div>
            <FileChangeList
              gitStatus={gitStatus}
              gitDiff={gitDiff}
              expandedFiles={expandedFiles}
              selectedFiles={selectedFiles}
              isMobile={isMobile}
              wrapText={wrapText}
              hideSelection
              onToggleSelected={toggleFileSelected}
              onToggleExpanded={toggleFileExpanded}
              onOpenFile={(filePath) => { void onOpenFile(filePath); }}
              onToggleWrapText={() => onWrapTextChange(!wrapText)}
              onRequestFileAction={requestFileAction}
            />
          </div>
        )}
      </div>
    </>
  );
}
