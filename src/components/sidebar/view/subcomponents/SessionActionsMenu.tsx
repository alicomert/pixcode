import type { TFunction } from 'i18next';

import { Edit2, Star, Trash2 } from '@/lib/icons';

import ItemActionsMenu, { type MenuAction } from './ItemActionsMenu';

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
 * Session-row "⋯" menu. Thin wrapper that hands its Rename / Star / Delete
 * actions to the generic ItemActionsMenu so both session and project rows
 * share one portal/positioning/close-handler implementation.
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
  const StarIcon = (props: { className?: string }) => (
    <Star
      className={`${props.className ?? ''} ${isStarred ? 'fill-yellow-400 text-yellow-500' : ''}`}
    />
  );

  const actions: MenuAction[] = [
    { id: 'rename', label: t('actions.rename'), icon: Edit2, onClick: onRename },
    {
      id: 'star',
      label: isStarred
        ? t('actions.unstarSession', { defaultValue: 'Remove star' })
        : t('actions.starSession', { defaultValue: 'Star' }),
      icon: StarIcon,
      onClick: onToggleStar,
    },
  ];

  if (canDelete) {
    actions.push({
      id: 'delete',
      label: t('actions.delete'),
      icon: Trash2,
      onClick: onDelete,
      danger: true,
    });
  }

  return (
    <ItemActionsMenu
      actions={actions}
      className={className}
      triggerLabel={t('tooltips.sessionActions', { defaultValue: 'Session actions' })}
    />
  );
}
