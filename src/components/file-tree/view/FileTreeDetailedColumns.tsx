import { useTranslation } from 'react-i18next';

import { cn } from '../../../lib/utils';

type FileTreeDetailedColumnsProps = {
  isNarrow?: boolean;
};

export default function FileTreeDetailedColumns({ isNarrow = false }: FileTreeDetailedColumnsProps) {
  const { t } = useTranslation();

  return (
    <div className={cn('border-b border-border pb-1 pt-1.5', isNarrow ? 'px-2' : 'px-3')}>
      <div
        className={cn(
          'grid gap-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70',
          isNarrow ? 'grid-cols-[minmax(0,1fr)_52px_72px] gap-1' : 'grid-cols-12',
        )}
      >
        <div className={isNarrow ? '' : 'col-span-5'}>{t('fileTree.name')}</div>
        <div className={isNarrow ? '' : 'col-span-2'}>{t('fileTree.size')}</div>
        <div className={isNarrow ? '' : 'col-span-3'}>{t('fileTree.modified')}</div>
        {!isNarrow && <div className="col-span-2">{t('fileTree.permissions')}</div>}
      </div>
    </div>
  );
}
