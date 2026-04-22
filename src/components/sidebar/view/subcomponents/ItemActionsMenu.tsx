import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { createPortal } from 'react-dom';

import { MoreHorizontal } from '@/lib/icons';

import { cn } from '../../../../lib/utils';

export type MenuAction = {
  /** Stable key — unique inside a single menu. */
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  onClick: () => void;
  /** Renders the item in the destructive red palette and separates it from non-destructive items. */
  danger?: boolean;
};

export type ItemActionsMenuProps = {
  actions: MenuAction[];
  /** Extra classes merged onto the "⋯" trigger button. */
  className?: string;
  /** aria-label + title for the trigger. */
  triggerLabel?: string;
};

const MENU_WIDTH = 160;
const ESTIMATED_MAX_MENU_HEIGHT = 180;

/**
 * Compact "⋯" trigger + popup portal with a small action list.
 *
 * Why the portal: the sidebar list lives inside a `ScrollArea` whose outer
 * wrapper is `overflow: hidden`. An absolutely-positioned dropdown renders
 * inside that wrapper and gets clipped — clicks land, but the menu is
 * invisible. Rendering into `document.body` escapes every parent clip and
 * keeps the menu on top regardless of stacking context.
 */
export default function ItemActionsMenu({
  actions,
  className,
  triggerLabel,
}: ItemActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Position the portal menu right under the trigger, flipping above it
  // when there isn't enough room below. Runs synchronously after layout so
  // the menu never paints at the wrong spot first.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    let left = rect.right - MENU_WIDTH;
    // Keep at least 8px away from the viewport's left edge.
    if (left < 8) left = 8;
    let top = rect.bottom + 4;
    if (top + ESTIMATED_MAX_MENU_HEIGHT > window.innerHeight) {
      top = Math.max(8, rect.top - 4 - ESTIMATED_MAX_MENU_HEIGHT);
    }
    setPosition({ top, left });
  }, [open]);

  // Close on click-outside, Escape, or any scroll/resize (position would
  // otherwise drift relative to the moved trigger).
  useEffect(() => {
    if (!open) return;

    const handleClickAway = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const closeOnViewportChange = () => setOpen(false);

    document.addEventListener('mousedown', handleClickAway);
    document.addEventListener('keydown', handleKey);
    // Capture phase catches scrolls inside nested scroll containers too.
    window.addEventListener('scroll', closeOnViewportChange, true);
    window.addEventListener('resize', closeOnViewportChange);
    return () => {
      document.removeEventListener('mousedown', handleClickAway);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', closeOnViewportChange, true);
      window.removeEventListener('resize', closeOnViewportChange);
    };
  }, [open]);

  const runAction = (action: MenuAction) => (event: ReactMouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    setOpen(false);
    action.onClick();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel || 'Actions'}
        title={triggerLabel || 'Actions'}
        onClick={(event) => {
          event.stopPropagation();
          event.preventDefault();
          setOpen((prev) => !prev);
        }}
        className={cn(
          // Hidden until the parent `.group` is hovered, or the menu is open.
          'flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground',
          'opacity-0 transition-all duration-150 hover:bg-accent hover:text-foreground',
          'group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary',
          'touch:opacity-100',
          open && 'bg-accent text-foreground opacity-100',
          className,
        )}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>

      {open && position &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: 'fixed',
              top: position.top,
              left: position.left,
              zIndex: 9999,
            }}
            className={cn(
              'w-40 rounded-xl border border-border/60 bg-popover p-1 shadow-lg',
              'animate-in fade-in-0 zoom-in-95 duration-100',
            )}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {actions.map((action, idx) => {
              const Icon = action.icon;
              const prev = actions[idx - 1];
              const needsSeparator = idx > 0 && action.danger && !prev?.danger;
              return (
                <div key={action.id}>
                  {needsSeparator && <div className="my-1 h-px bg-border/60" />}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={runAction(action)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs',
                      action.danger
                        ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20'
                        : 'text-foreground hover:bg-accent',
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {action.label}
                  </button>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
