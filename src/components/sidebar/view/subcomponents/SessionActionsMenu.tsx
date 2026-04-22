import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Edit2, MoreHorizontal, Star, Trash2 } from '@/lib/icons';
import type { TFunction } from 'i18next';
import { cn } from '../../../../lib/utils';

export type SessionActionsMenuProps = {
  isStarred: boolean;
  canDelete: boolean;
  onRename: () => void;
  onToggleStar: () => void;
  onDelete: () => void;
  t: TFunction;
  /** Extra className applied to the trigger button. */
  className?: string;
};

/**
 * Compact "⋯" trigger that reveals a small dropdown with Rename / Star / Delete.
 *
 * The trigger itself is rendered so it can fade in on the parent `group` hover.
 * The dropdown uses click-outside + Escape to close. Actions stop propagation so
 * clicking inside the menu never selects the surrounding session item.
 */
export default function SessionActionsMenu({
  isStarred,
  canDelete,
  onRename,
  onToggleStar,
  onDelete,
  t,
  className,
}: SessionActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleClickAway = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    // Use mousedown so the menu closes before the next click lands elsewhere.
    document.addEventListener('mousedown', handleClickAway);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickAway);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const runAction = (action: () => void) => (event: ReactMouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    setOpen(false);
    action();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('tooltips.sessionActions', { defaultValue: 'Session actions' })}
        title={t('tooltips.sessionActions', { defaultValue: 'Session actions' })}
        onClick={(event) => {
          event.stopPropagation();
          event.preventDefault();
          setOpen((prev) => !prev);
        }}
        className={cn(
          // Hidden by default; parent `.group:hover` or open state reveals it.
          'flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground',
          'opacity-0 transition-all duration-150 hover:bg-accent hover:text-foreground',
          'group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary',
          open && 'opacity-100 bg-accent text-foreground',
          className,
        )}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute right-0 top-full z-50 mt-1 w-40 origin-top-right rounded-lg border border-border/60 bg-popover p-1 shadow-lg',
            'animate-in fade-in-0 zoom-in-95 duration-100',
          )}
          // Prevent the parent Button's onClick from swallowing menu clicks.
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={runAction(onRename)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent"
          >
            <Edit2 className="h-3 w-3" />
            {t('actions.rename')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={runAction(onToggleStar)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent"
          >
            <Star
              className={cn(
                'h-3 w-3',
                isStarred && 'fill-yellow-400 text-yellow-500',
              )}
            />
            {isStarred
              ? t('actions.unstarSession', { defaultValue: 'Remove star' })
              : t('actions.starSession', { defaultValue: 'Star' })}
          </button>
          {canDelete && (
            <>
              <div className="my-1 h-px bg-border/60" />
              <button
                type="button"
                role="menuitem"
                onClick={runAction(onDelete)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                <Trash2 className="h-3 w-3" />
                {t('actions.delete')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
