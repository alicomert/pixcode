import { useTranslation } from 'react-i18next';

import { Button, Input } from '../../../shared/view/ui';
import { cn } from '../../../lib/utils';
import type { FileTreeViewMode } from '../types/types';

import { Eye, FileText, FolderPlus, List, RefreshCw, Search, TableProperties, X } from '@/lib/icons';

type FileTreeHeaderProps = {
  viewMode: FileTreeViewMode;
  isCompact?: boolean;
  onViewModeChange: (mode: FileTreeViewMode) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  // Toolbar actions
  onNewFile?: () => void;
  onNewFolder?: () => void;
  onRefresh?: () => void;
  // Loading state
  loading?: boolean;
  operationLoading?: boolean;
};

export default function FileTreeHeader({
  viewMode,
  isCompact = false,
  onViewModeChange,
  searchQuery,
  onSearchQueryChange,
  onNewFile,
  onNewFolder,
  onRefresh,
  loading,
  operationLoading,
}: FileTreeHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className={cn('space-y-2 border-b border-border pb-2 pt-3', isCompact ? 'px-2' : 'px-3')}>
      {/* Title and Toolbar */}
      <div className="flex items-start justify-between gap-1">
        <h3 className={cn('shrink-0 font-medium text-foreground', isCompact ? 'hidden text-xs' : 'text-sm')}>
          {t('fileTree.files')}
        </h3>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-0.5 overflow-visible">
          {/* Action buttons */}
          {onNewFile && (
            <Button
              variant="ghost"
              size="sm"
              className={cn(isCompact ? 'h-6 w-6' : 'h-7 w-7', 'p-0')}
              onClick={onNewFile}
              title={t('fileTree.newFile', 'New File (Cmd+N)')}
              aria-label={t('fileTree.newFile', 'New File (Cmd+N)')}
              disabled={operationLoading}
            >
              <FileText className={cn(isCompact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
            </Button>
          )}
          {onNewFolder && (
            <Button
              variant="ghost"
              size="sm"
              className={cn(isCompact ? 'h-6 w-6' : 'h-7 w-7', 'p-0')}
              onClick={onNewFolder}
              title={t('fileTree.newFolder', 'New Folder (Cmd+Shift+N)')}
              aria-label={t('fileTree.newFolder', 'New Folder (Cmd+Shift+N)')}
              disabled={operationLoading}
            >
              <FolderPlus className={cn(isCompact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
            </Button>
          )}
          {onRefresh && (
            <Button
              variant="ghost"
              size="sm"
              className={cn(isCompact ? 'h-6 w-6' : 'h-7 w-7', 'p-0')}
              onClick={onRefresh}
              title={t('fileTree.refresh', 'Refresh')}
              aria-label={t('fileTree.refresh', 'Refresh')}
              disabled={operationLoading}
            >
              <RefreshCw className={cn(isCompact ? 'h-3 w-3' : 'h-3.5 w-3.5', loading && 'animate-spin')} />
            </Button>
          )}
          {/* Divider */}
          <div className="mx-0.5 h-4 w-px bg-border" />
          {/* View mode buttons */}
          <Button
            variant={viewMode === 'simple' ? 'default' : 'ghost'}
            size="sm"
            className={cn(isCompact ? 'h-6 w-6' : 'h-7 w-7', 'p-0')}
            onClick={() => onViewModeChange('simple')}
            title={t('fileTree.simpleView')}
            aria-label={t('fileTree.simpleView')}
          >
            <List className={cn(isCompact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
          </Button>
          <Button
            variant={viewMode === 'compact' ? 'default' : 'ghost'}
            size="sm"
            className={cn(isCompact ? 'h-6 w-6' : 'h-7 w-7', 'p-0')}
            onClick={() => onViewModeChange('compact')}
            title={t('fileTree.compactView')}
            aria-label={t('fileTree.compactView')}
          >
            <Eye className={cn(isCompact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
          </Button>
          <Button
            variant={viewMode === 'detailed' ? 'default' : 'ghost'}
            size="sm"
            className={cn(isCompact ? 'h-6 w-6' : 'h-7 w-7', 'p-0')}
            onClick={() => onViewModeChange('detailed')}
            title={t('fileTree.detailedView')}
            aria-label={t('fileTree.detailedView')}
          >
            <TableProperties className={cn(isCompact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder={t('fileTree.searchPlaceholder')}
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          className={cn(isCompact ? 'h-7 pl-7 pr-7 text-xs' : 'h-8 pl-8 pr-8 text-sm')}
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-0.5 top-1/2 h-5 w-5 -translate-y-1/2 p-0 hover:bg-accent"
            onClick={() => onSearchQueryChange('')}
            title={t('fileTree.clearSearch')}
            aria-label={t('fileTree.clearSearch')}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}
