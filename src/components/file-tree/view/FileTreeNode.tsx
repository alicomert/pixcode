import type { ReactNode, RefObject } from 'react';

import { cn } from '../../../lib/utils';
import type { FileTreeNode as FileTreeNodeType, FileTreeViewMode } from '../types/types';
import { Input } from '../../../shared/view/ui';

import FileContextMenu from './FileContextMenu';

import { ChevronRight, Folder, FolderOpen } from '@/lib/icons';

type FileTreeNodeProps = {
  item: FileTreeNodeType;
  level: number;
  viewMode: FileTreeViewMode;
  expandedDirs: Set<string>;
  onItemClick: (item: FileTreeNodeType) => void;
  renderFileIcon: (filename: string) => ReactNode;
  formatFileSize: (bytes?: number) => string;
  formatRelativeTime: (date?: string) => string;
  onRename?: (item: FileTreeNodeType) => void;
  onDelete?: (item: FileTreeNodeType) => void;
  onNewFile?: (path: string) => void;
  onNewFolder?: (path: string) => void;
  onCopyPath?: (item: FileTreeNodeType) => void;
  onDownload?: (item: FileTreeNodeType) => void;
  onRefresh?: () => void;
  // Rename state for inline editing
  renamingItem?: FileTreeNodeType | null;
  renameValue?: string;
  setRenameValue?: (value: string) => void;
  handleConfirmRename?: () => void;
  handleCancelRename?: () => void;
  renameInputRef?: RefObject<HTMLInputElement>;
  operationLoading?: boolean;
  changedFilePaths?: Set<string>;
  focusedFilePath?: string | null;
  isNarrow?: boolean;
};

type TreeItemIconProps = {
  item: FileTreeNodeType;
  isOpen: boolean;
  renderFileIcon: (filename: string) => ReactNode;
};

const normalizeTreePath = (value: string): string => value.replace(/\\/g, '/');

function TreeItemIcon({ item, isOpen, renderFileIcon }: TreeItemIconProps) {
  if (item.type === 'directory') {
    return (
      <span className="flex flex-shrink-0 items-center gap-0.5">
        <ChevronRight
          className={cn(
            'w-3.5 h-3.5 text-muted-foreground/70 transition-transform duration-150',
            isOpen && 'rotate-90',
          )}
        />
        {isOpen ? (
          <FolderOpen className="h-4 w-4 flex-shrink-0 text-blue-500" />
        ) : (
          <Folder className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        )}
      </span>
    );
  }

  return <span className="ml-[18px] flex flex-shrink-0 items-center">{renderFileIcon(item.name)}</span>;
}

export default function FileTreeNode({
  item,
  level,
  viewMode,
  expandedDirs,
  onItemClick,
  renderFileIcon,
  formatFileSize,
  formatRelativeTime,
  onRename,
  onDelete,
  onNewFile,
  onNewFolder,
  onCopyPath,
  onDownload,
  onRefresh,
  renamingItem,
  renameValue,
  setRenameValue,
  handleConfirmRename,
  handleCancelRename,
  renameInputRef,
  operationLoading,
  changedFilePaths,
  focusedFilePath,
  isNarrow = false,
}: FileTreeNodeProps) {
  const isDirectory = item.type === 'directory';
  const isOpen = isDirectory && expandedDirs.has(item.path);
  const hasChildren = Boolean(isDirectory && item.children && item.children.length > 0);
  const isRenaming = renamingItem?.path === item.path;
  const normalizedItemPath = normalizeTreePath(item.path);
  const isChanged = !isDirectory && Boolean(changedFilePaths?.has(item.path) || changedFilePaths?.has(normalizedItemPath));
  const isFocused = focusedFilePath === item.path || focusedFilePath === normalizedItemPath;
  const indentSize = isNarrow ? 12 : 16;

  const nameClassName = cn(
    'leading-tight truncate',
    isNarrow ? 'text-[12px]' : 'text-[13px]',
    isDirectory ? 'font-medium text-foreground' : 'text-foreground/90',
  );

  // View mode only changes the row layout; selection, expansion, and recursion stay shared.
  const rowClassName = cn(
    viewMode === 'detailed'
      ? cn(
          'group grid cursor-pointer items-center rounded-sm transition-colors duration-100 hover:bg-accent/60',
          isNarrow ? 'grid-cols-[minmax(0,1fr)_52px_72px] gap-1 py-[2px] pr-1' : 'grid-cols-12 gap-2 py-[3px] pr-2',
        )
      : viewMode === 'compact'
      ? cn(
          'group flex cursor-pointer items-center justify-between rounded-sm transition-colors duration-100 hover:bg-accent/60',
          isNarrow ? 'py-[2px] pr-1' : 'py-[3px] pr-2',
        )
      : cn(
          'group flex cursor-pointer items-center gap-1.5 rounded-sm transition-colors duration-100 hover:bg-accent/60',
          isNarrow ? 'py-[2px] pr-1' : 'py-[3px] pr-2',
        ),
    isDirectory && isOpen && 'border-l-2 border-primary/30',
    (isDirectory && !isOpen) || !isDirectory ? 'border-l-2 border-transparent' : '',
    isChanged && 'border-l-2 border-emerald-500/70 bg-emerald-500/10 hover:bg-emerald-500/15',
    isFocused && 'changed-file-flash ring-1 ring-emerald-500/40',
  );

  // Render rename input if this item is being renamed
  if (isRenaming && setRenameValue && handleConfirmRename && handleCancelRename) {
    return (
      <div
        className={cn(rowClassName, 'bg-accent/30')}
        style={{ paddingLeft: `${level * indentSize + 4}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        <TreeItemIcon item={item} isOpen={isOpen} renderFileIcon={renderFileIcon} />
        <Input
          ref={renameInputRef}
          type="text"
          value={renameValue || ''}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') handleConfirmRename();
            if (e.key === 'Escape') handleCancelRename();
          }}
          onBlur={() => {
            setTimeout(() => {
              handleConfirmRename();
            }, 100);
          }}
          className="h-6 flex-1 text-sm"
          disabled={operationLoading}
        />
      </div>
    );
  }

  const rowContent = (
    <div
      className={rowClassName}
      style={{ paddingLeft: `${level * indentSize + 4}px` }}
      onClick={() => onItemClick(item)}
      data-file-path={normalizedItemPath}
    >
      {viewMode === 'detailed' ? (
        <>
          <div className={cn('flex min-w-0 items-center gap-1.5', isNarrow ? '' : 'col-span-5')}>
            <TreeItemIcon item={item} isOpen={isOpen} renderFileIcon={renderFileIcon} />
            <span className={nameClassName}>{item.name}</span>
            {isChanged && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />}
          </div>
          <div className={cn('tabular-nums text-muted-foreground', isNarrow ? 'text-[11px]' : 'col-span-2 text-sm')}>
            {item.type === 'file' ? formatFileSize(item.size) : ''}
          </div>
          <div className={cn('truncate text-muted-foreground', isNarrow ? 'text-[11px]' : 'col-span-3 text-sm')}>
            {formatRelativeTime(item.modified)}
          </div>
          {!isNarrow && <div className="col-span-2 font-mono text-sm text-muted-foreground">{item.permissionsRwx || ''}</div>}
        </>
      ) : viewMode === 'compact' ? (
        <>
          <div className="flex min-w-0 items-center gap-1.5">
            <TreeItemIcon item={item} isOpen={isOpen} renderFileIcon={renderFileIcon} />
            <span className={nameClassName}>{item.name}</span>
            {isChanged && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />}
          </div>
          <div className={cn('ml-2 flex flex-shrink-0 items-center text-muted-foreground', isNarrow ? 'gap-2 text-[11px]' : 'gap-3 text-sm')}>
            {item.type === 'file' && (
              <>
                <span className="tabular-nums">{formatFileSize(item.size)}</span>
                {!isNarrow && <span className="font-mono">{item.permissionsRwx}</span>}
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <TreeItemIcon item={item} isOpen={isOpen} renderFileIcon={renderFileIcon} />
          <span className={nameClassName}>{item.name}</span>
          {isChanged && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />}
        </>
      )}
    </div>
  );

  // Check if context menu callbacks are provided
  const hasContextMenu = onRename || onDelete || onNewFile || onNewFolder || onCopyPath || onDownload || onRefresh;

  return (
    <div className="select-none">
      {hasContextMenu ? (
        <FileContextMenu
          item={item}
          onRename={onRename}
          onDelete={onDelete}
          onNewFile={onNewFile}
          onNewFolder={onNewFolder}
          onCopyPath={onCopyPath}
          onDownload={onDownload}
          onRefresh={onRefresh}
        >
          {rowContent}
        </FileContextMenu>
      ) : (
        rowContent
      )}

      {isDirectory && isOpen && hasChildren && (
        <div className="relative">
          <span
            className="absolute bottom-0 top-0 border-l border-border/40"
            style={{ left: `${level * indentSize + 14}px` }}
            aria-hidden="true"
          />
          {item.children?.map((child) => (
            <FileTreeNode
              key={child.path}
              item={child}
              level={level + 1}
              viewMode={viewMode}
              expandedDirs={expandedDirs}
              onItemClick={onItemClick}
              renderFileIcon={renderFileIcon}
              formatFileSize={formatFileSize}
              formatRelativeTime={formatRelativeTime}
              onRename={onRename}
              onDelete={onDelete}
              onNewFile={onNewFile}
              onNewFolder={onNewFolder}
              onCopyPath={onCopyPath}
              onDownload={onDownload}
              onRefresh={onRefresh}
              renamingItem={renamingItem}
              renameValue={renameValue}
              setRenameValue={setRenameValue}
              handleConfirmRename={handleConfirmRename}
              handleCancelRename={handleCancelRename}
              renameInputRef={renameInputRef}
              operationLoading={operationLoading}
              changedFilePaths={changedFilePaths}
              focusedFilePath={focusedFilePath}
              isNarrow={isNarrow}
            />
          ))}
        </div>
      )}
    </div>
  );
}
