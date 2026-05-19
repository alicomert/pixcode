import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '../../../lib/utils';
import { ICON_SIZE_CLASS, getFileIconData } from '../constants/fileIcons';
import { useExpandedDirectories } from '../hooks/useExpandedDirectories';
import { useFileTreeData } from '../hooks/useFileTreeData';
import { useFileTreeOperations } from '../hooks/useFileTreeOperations';
import { useFileTreeSearch } from '../hooks/useFileTreeSearch';
import { useFileTreeViewMode } from '../hooks/useFileTreeViewMode';
import { useFileTreeUpload } from '../hooks/useFileTreeUpload';
import type { FileTreeImageSelection, FileTreeNode } from '../types/types';
import { formatFileSize, formatRelativeTime, isImageFile } from '../utils/fileTreeUtils';
import { Project } from '../../../types/app';
import { ScrollArea, Input } from '../../../shared/view/ui';

import FileTreeBody from './FileTreeBody';
import FileTreeDetailedColumns from './FileTreeDetailedColumns';
import FileTreeHeader from './FileTreeHeader';
import FileTreeLoadingState from './FileTreeLoadingState';
import ImageViewer from './ImageViewer';

import { AlertTriangle, Check, X, Loader2, Folder, Upload } from '@/lib/icons';


type FileTreeProps = {
  selectedProject: Project | null;
  onFileOpen?: (filePath: string) => void;
  changedFilePaths?: string[];
  focusedFilePath?: string | null;
};

const getParentDirectoryPaths = (filePath: string): string[] => {
  const parts = filePath.split('/').filter(Boolean);
  if (parts.length <= 1) {
    return [];
  }

  return parts.slice(0, -1).reduce<string[]>((acc, part) => {
    acc.push(acc.length > 0 ? `${acc[acc.length - 1]}/${part}` : part);
    return acc;
  }, []);
};

const escapeSelectorValue = (value: string): string => {
  if (typeof CSS !== 'undefined' && CSS.escape) {
    return CSS.escape(value);
  }

  return value.replace(/["\\]/g, '\\$&');
};

const normalizeTreePath = (value: string | undefined | null): string => String(value || '')
  .replace(/\\/g, '/')
  .replace(/\/+$/, '')
  .trim();

const isAbsoluteTreePath = (value: string): boolean => value.startsWith('/') || /^[a-zA-Z]:\//.test(value);

const resolveProjectTreePath = (filePath: string | null | undefined, projectRootPath: string): string | null => {
  const normalizedPath = normalizeTreePath(filePath);
  if (!normalizedPath) {
    return null;
  }

  if (!projectRootPath || isAbsoluteTreePath(normalizedPath)) {
    return normalizedPath;
  }

  return `${projectRootPath}/${normalizedPath.replace(/^\/+/, '')}`;
};

export default function FileTree({
  selectedProject,
  onFileOpen,
  changedFilePaths = [],
  focusedFilePath = null,
}: FileTreeProps) {
  const { t } = useTranslation();
  const [selectedImage, setSelectedImage] = useState<FileTreeImageSelection | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const newItemInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const liveChangedFileTimersRef = useRef<Map<string, number>>(new Map());
  const [isNarrow, setIsNarrow] = useState(false);
  const [liveChangedFilePaths, setLiveChangedFilePaths] = useState<string[]>([]);
  const projectRootPath = useMemo(
    () => normalizeTreePath(selectedProject?.path || selectedProject?.fullPath),
    [selectedProject?.fullPath, selectedProject?.path],
  );
  const changedFilePathSet = useMemo(() => {
    const paths = new Set<string>();

    [...changedFilePaths, ...liveChangedFilePaths].forEach((filePath) => {
      const normalizedPath = normalizeTreePath(filePath);
      const projectResolvedPath = resolveProjectTreePath(filePath, projectRootPath);

      if (normalizedPath) {
        paths.add(normalizedPath);
      }
      if (projectResolvedPath) {
        paths.add(projectResolvedPath);
      }
    });

    return paths;
  }, [changedFilePaths, liveChangedFilePaths, projectRootPath]);
  const focusedTreeFilePath = useMemo(
    () => resolveProjectTreePath(focusedFilePath, projectRootPath),
    [focusedFilePath, projectRootPath],
  );

  // Show toast notification
  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  }, []);

  // Auto-hide toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const { files, loading, refreshFiles } = useFileTreeData(selectedProject);
  const { viewMode, changeViewMode } = useFileTreeViewMode();
  const { expandedDirs, toggleDirectory, expandDirectories, collapseAll } = useExpandedDirectories();
  const { searchQuery, setSearchQuery, filteredFiles } = useFileTreeSearch({
    files,
    expandDirectories,
  });

  // File operations
  const operations = useFileTreeOperations({
    selectedProject,
    onRefresh: refreshFiles,
    showToast,
  });

  // File upload (drag and drop)
  const upload = useFileTreeUpload({
    selectedProject,
    onRefresh: refreshFiles,
    showToast,
  });

  useEffect(() => {
    const element = upload.treeRef.current;
    if (!element) {
      return undefined;
    }

    const updateNarrowState = () => {
      setIsNarrow(element.clientWidth < 520);
    };

    updateNarrowState();
    const resizeObserver = new ResizeObserver(updateNarrowState);
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, [upload.treeRef]);

  // Focus input when creating new item
  useEffect(() => {
    if (operations.isCreating && newItemInputRef.current) {
      newItemInputRef.current.focus();
      newItemInputRef.current.select();
    }
  }, [operations.isCreating]);

  // Focus input when renaming
  useEffect(() => {
    if (operations.renamingItem && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [operations.renamingItem]);

  useEffect(() => {
    if (!focusedTreeFilePath) {
      return undefined;
    }

    expandDirectories(getParentDirectoryPaths(focusedTreeFilePath));
    const timeout = window.setTimeout(() => {
      const selector = `[data-file-path="${escapeSelectorValue(focusedTreeFilePath)}"]`;
      upload.treeRef.current?.querySelector(selector)?.scrollIntoView({
        block: 'center',
        behavior: 'smooth',
      });
    }, 80);

    return () => window.clearTimeout(timeout);
  }, [expandDirectories, files, focusedTreeFilePath, upload.treeRef]);

  useEffect(() => {
    liveChangedFileTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    liveChangedFileTimersRef.current.clear();
    setLiveChangedFilePaths([]);
  }, [selectedProject?.name]);

  useEffect(() => {
    if (!selectedProject?.name || typeof window === 'undefined') {
      return undefined;
    }

    const markChangedFile = (filePath: string) => {
      const normalizedPath = normalizeTreePath(filePath);
      const resolvedPath = resolveProjectTreePath(filePath, projectRootPath);
      const nextPaths = [normalizedPath, resolvedPath].filter((path): path is string => Boolean(path));

      if (nextPaths.length === 0) {
        return;
      }

      setLiveChangedFilePaths((currentPaths) => Array.from(new Set([...currentPaths, ...nextPaths])));

      nextPaths.forEach((path) => {
        const existingTimer = liveChangedFileTimersRef.current.get(path);
        if (existingTimer) {
          window.clearTimeout(existingTimer);
        }

        const timer = window.setTimeout(() => {
          liveChangedFileTimersRef.current.delete(path);
          setLiveChangedFilePaths((currentPaths) => currentPaths.filter((currentPath) => currentPath !== path));
        }, 6000);
        liveChangedFileTimersRef.current.set(path, timer);
      });
    };

    const handleFileTreeRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ projectName?: string | null; changedFile?: string | null }>).detail;
      if (detail?.projectName && detail.projectName !== selectedProject.name) {
        return;
      }

      if (typeof detail?.changedFile === 'string' && detail.changedFile.trim()) {
        markChangedFile(detail.changedFile);
      }
    };

    window.addEventListener('pixcode:file-tree-refresh', handleFileTreeRefresh);
    return () => {
      window.removeEventListener('pixcode:file-tree-refresh', handleFileTreeRefresh);
    };
  }, [projectRootPath, selectedProject?.name]);

  useEffect(() => () => {
    liveChangedFileTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    liveChangedFileTimersRef.current.clear();
  }, []);

  const renderFileIcon = useCallback((filename: string) => {
    const { icon: Icon, color } = getFileIconData(filename);
    return <Icon className={cn(ICON_SIZE_CLASS, color)} />;
  }, []);

  // Centralized click behavior keeps file actions identical across all presentation modes.
  const handleItemClick = useCallback(
    (item: FileTreeNode) => {
      if (item.type === 'directory') {
        toggleDirectory(item.path);
        return;
      }

      if (isImageFile(item.name) && selectedProject) {
        setSelectedImage({
          name: item.name,
          path: item.path,
          projectPath: selectedProject.path,
          projectName: selectedProject.name,
        });
        return;
      }

      onFileOpen?.(item.path);
    },
    [onFileOpen, selectedProject, toggleDirectory],
  );

  const formatRelativeTimeLabel = useCallback(
    (date?: string) => formatRelativeTime(date, t),
    [t],
  );

  if (loading && files.length === 0) {
    return <FileTreeLoadingState />;
  }

  return (
    <div
      ref={upload.treeRef}
      className="relative flex h-full flex-col bg-background"
      onDragEnter={upload.handleDragEnter}
      onDragOver={upload.handleDragOver}
      onDragLeave={upload.handleDragLeave}
      onDrop={upload.handleDrop}
    >
      {/* Drag overlay */}
      {upload.isDragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed border-blue-500 bg-blue-500/10">
          <div className="flex items-center gap-3 rounded-lg bg-background/95 px-6 py-4 shadow-lg">
            <Upload className="h-6 w-6 text-blue-500" />
            <span className="text-sm font-medium">{t('fileTree.dropToUpload', 'Drop files to upload')}</span>
          </div>
        </div>
      )}

      <FileTreeHeader
        viewMode={viewMode}
        isCompact={isNarrow}
        onViewModeChange={changeViewMode}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onNewFile={() => operations.handleStartCreate('', 'file')}
        onNewFolder={() => operations.handleStartCreate('', 'directory')}
        onRefresh={refreshFiles}
        onCollapseAll={collapseAll}
        loading={loading}
        operationLoading={operations.operationLoading}
      />

      {viewMode === 'detailed' && filteredFiles.length > 0 && <FileTreeDetailedColumns isNarrow={isNarrow} />}

      <ScrollArea className="flex-1" contentClassName={isNarrow ? 'px-1 py-1' : 'px-2 py-1'}>
        {/* New item input */}
        {operations.isCreating && (
          <div
            className="mb-1 flex items-center gap-1.5 py-[3px] pr-2"
            style={{ paddingLeft: `${(operations.newItemParent.split('/').length - 1) * 16 + 4}px` }}
          >
            {operations.newItemType === 'directory' ? (
              <Folder className={cn(ICON_SIZE_CLASS, 'text-blue-500')} />
            ) : (
              <span className="ml-[18px]">{renderFileIcon(operations.newItemName)}</span>
            )}
            <Input
              ref={newItemInputRef}
              type="text"
              value={operations.newItemName}
              onChange={(e) => operations.setNewItemName(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') operations.handleConfirmCreate();
                if (e.key === 'Escape') operations.handleCancelCreate();
              }}
              onBlur={() => {
                setTimeout(() => {
                  if (operations.isCreating) operations.handleConfirmCreate();
                }, 100);
              }}
              className="h-6 flex-1 text-sm"
              disabled={operations.operationLoading}
            />
          </div>
        )}

        <FileTreeBody
          files={files}
          filteredFiles={filteredFiles}
          searchQuery={searchQuery}
          viewMode={viewMode}
          expandedDirs={expandedDirs}
          onItemClick={handleItemClick}
          renderFileIcon={renderFileIcon}
          formatFileSize={formatFileSize}
          formatRelativeTime={formatRelativeTimeLabel}
          onRename={operations.handleStartRename}
          onDelete={operations.handleStartDelete}
          onNewFile={(path) => operations.handleStartCreate(path, 'file')}
          onNewFolder={(path) => operations.handleStartCreate(path, 'directory')}
          onCopyPath={operations.handleCopyPath}
          onDownload={operations.handleDownload}
          onRefresh={refreshFiles}
          // Pass rename state and handlers for inline editing
          renamingItem={operations.renamingItem}
          renameValue={operations.renameValue}
          setRenameValue={operations.setRenameValue}
          handleConfirmRename={operations.handleConfirmRename}
          handleCancelRename={operations.handleCancelRename}
          renameInputRef={renameInputRef}
          operationLoading={operations.operationLoading}
          changedFilePaths={changedFilePathSet}
          focusedFilePath={focusedTreeFilePath}
          isNarrow={isNarrow}
        />
      </ScrollArea>

      {selectedImage && (
        <ImageViewer
          file={selectedImage}
          onClose={() => setSelectedImage(null)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {operations.deleteConfirmation.isOpen && operations.deleteConfirmation.item && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
          <div className="mx-4 max-w-sm rounded-lg border border-border bg-background p-4 shadow-lg">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-full bg-red-100 p-2 dark:bg-red-900/30">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="font-medium text-foreground">
                  {t('fileTree.delete.title', 'Delete {{type}}', {
                    type: operations.deleteConfirmation.item.type === 'directory' ? 'Folder' : 'File'
                  })}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {operations.deleteConfirmation.item.name}
                </p>
              </div>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              {operations.deleteConfirmation.item.type === 'directory'
                ? t('fileTree.delete.folderWarning', 'This folder and all its contents will be permanently deleted.')
                : t('fileTree.delete.fileWarning', 'This file will be permanently deleted.')}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={operations.handleCancelDelete}
                disabled={operations.operationLoading}
                className="rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={operations.handleConfirmDelete}
                disabled={operations.operationLoading}
                className="flex items-center gap-2 rounded-md bg-red-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {operations.operationLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('fileTree.delete.confirm', 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className={cn(
            'fixed bottom-4 right-4 z-[9999] px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-in slide-in-from-bottom-2',
            toast.type === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-red-600 text-white'
          )}
        >
          {toast.type === 'success' ? (
            <Check className="h-4 w-4" />
          ) : (
            <X className="h-4 w-4" />
          )}
          <span className="text-sm">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
